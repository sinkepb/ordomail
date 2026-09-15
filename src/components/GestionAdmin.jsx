// Onglet "Gestion" du backoffice (15/09/2026) — pilotage comptable/fiscal/
// juridique/SaaS d'OrdoMail SAS. Visible UNIQUEMENT sur preview (voir le
// garde-fou dans AdminPage.jsx qui ne monte même pas ce composant en
// production) : c'est un outil de pilotage interne pour l'équipe, pas une
// fonctionnalité destinée aux pharmacies clientes.
//
// Principe directeur : toute donnée affichée est réelle (issue de Stripe/
// abonnements/factures) ou explicitement saisie à la main par l'utilisateur.
// Rien n'est jamais inventé — en particulier pas de bulletins de paie, de PV
// d'AG ou de FEC présentés comme définitifs : ce sont des registres/brouillons
// à valider par un expert-comptable ou un avocat avant tout usage officiel.
// Voir secure-data-admin/index.ts (ressources admin_gestion_*) pour le détail
// des calculs et de ce qui est volontairement laissé en saisie manuelle.
import { useState, useEffect } from "react";

async function callSecureData(resource, params, adminToken) {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  const res = await fetch(`${supabaseUrl}/functions/v1/secure-data-admin`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "apikey": supabaseKey, "Authorization": `Bearer ${adminToken || ""}` },
    body: JSON.stringify({ resource, params }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error || `secure-data-admin ${resource} : erreur ${res.status}`);
  return body;
}

function downloadTextFile(filename, content, mime = "text/csv;charset=utf-8") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

function csvEscape(v) {
  const s = String(v ?? "");
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// ── Repères réglementaires génériques France/SAS (dates récurrentes) ──────
// Échéances standard, PAS calculées à partir de la situation réelle
// d'OrdoMail SAS (exercice, régime de TVA effectif, etc.) — à confirmer avec
// l'expert-comptable. Le suivi "fait / pas fait" est en revanche bien réel
// (saisi manuellement, persisté en base).
const CHECKLIST_ITEMS = [
  { id: "tva_ca3", cat: "TVA", label: "Déclaration de TVA (CA3, régime réel) — mensuelle ou trimestrielle selon seuils", echeance: "Le 15 ou 24 du mois suivant" },
  { id: "is_acompte_1", cat: "IS", label: "1er acompte d'Impôt sur les Sociétés", echeance: "15 mars" },
  { id: "is_acompte_2", cat: "IS", label: "2e acompte d'IS", echeance: "15 juin" },
  { id: "is_acompte_3", cat: "IS", label: "3e acompte d'IS", echeance: "15 septembre" },
  { id: "is_acompte_4", cat: "IS", label: "4e acompte d'IS (solde)", echeance: "15 décembre" },
  { id: "cfe", cat: "Taxes annexes", label: "Cotisation Foncière des Entreprises (CFE)", echeance: "15 décembre" },
  { id: "liasse_fiscale", cat: "IS", label: "Liasse fiscale annuelle (2065 + annexes)", echeance: "3 mois après la clôture (ou 15 mai si clôture au 31/12)" },
  { id: "cir_2069a", cat: "CIR/CII", label: "Déclaration CIR/CII (formulaire 2069-A-SD), si dépenses R&D/innovation éligibles", echeance: "Avec la liasse fiscale" },
  { id: "ag_annuelle", cat: "Juridique SAS", label: "Assemblée Générale annuelle d'approbation des comptes", echeance: "Dans les 6 mois suivant la clôture de l'exercice" },
  { id: "greffe_comptes", cat: "Juridique SAS", label: "Dépôt des comptes annuels au greffe", echeance: "Dans le mois suivant l'AG (2 mois si dépôt électronique)" },
  { id: "registre_personnel", cat: "Social", label: "Mise à jour du registre unique du personnel à chaque mouvement", echeance: "En continu" },
  { id: "dpo_registre", cat: "RGPD", label: "Registre des traitements de données à jour", echeance: "En continu" },
];

const SECTIONS = [
  ["overview", "📊 Vue d'ensemble"],
  ["facturation", "🧾 Facturation & TVA"],
  ["registres", "📁 Registres SAS"],
  ["conformite", "✅ Conformité"],
  ["parametres", "⚙️ Paramètres"],
];

function GestionAdmin({ adminToken }) {
  const [section, setSection] = useState("overview");
  const [dashboard, setDashboard] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  async function loadDashboard() {
    setError("");
    try {
      const { data } = await callSecureData("admin_gestion_dashboard", {}, adminToken);
      setDashboard(data);
    } catch (e) { setError(e.message); }
    setLoading(false);
  }

  useEffect(() => { loadDashboard(); /* eslint-disable-next-line */ }, []);

  return (
    <div>
      <div style={{ background: "#422006", border: "1px solid #92400e", borderRadius: 10, padding: "10px 14px", marginBottom: 16, fontSize: 12, color: "#fed7aa", lineHeight: 1.6 }}>
        ⚠️ Outil de pilotage interne. Les métriques SaaS et montants sont calculés à partir des données réelles Stripe/OrdoMail. Les registres, échéances et brouillons comptables/juridiques sont des <strong>aides de suivi</strong>, pas des documents officiels — à faire valider par votre expert-comptable et/ou avocat avant tout usage.
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
        {SECTIONS.map(([k, l]) => (
          <button key={k} onClick={() => setSection(k)}
            style={{ padding: "7px 16px", border: "none", borderRadius: 8, cursor: "pointer", fontFamily: "inherit", fontSize: 13,
              fontWeight: section === k ? 700 : 500, background: section === k ? "#3b82f6" : "#1e293b", color: section === k ? "#fff" : "#94a3b8",
              outline: `1px solid ${section === k ? "#3b82f6" : "#334155"}` }}>
            {l}
          </button>
        ))}
      </div>

      {error && <div style={{ background: "#450a0a", border: "1px solid #7f1d1d", borderRadius: 10, padding: "10px 14px", marginBottom: 16, color: "#fca5a5", fontSize: 13 }}>{error}</div>}
      {loading ? <div style={{ color: "#64748b", padding: 32, textAlign: "center" }}>⏳ Chargement…</div> : (
        <>
          {section === "overview" && <OverviewSection dashboard={dashboard} onRefresh={loadDashboard} />}
          {section === "facturation" && <FacturationSection adminToken={adminToken} />}
          {section === "registres" && <RegistresSection adminToken={adminToken} />}
          {section === "conformite" && <ConformiteSection adminToken={adminToken} />}
          {section === "parametres" && <ParametresSection adminToken={adminToken} dashboard={dashboard} onSaved={loadDashboard} />}
        </>
      )}
    </div>
  );
}

function Kpi({ label, value, sub, icon, color }) {
  return (
    <div style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 12, padding: "14px 16px" }}>
      <div style={{ fontSize: 18, marginBottom: 4 }}>{icon}</div>
      <div style={{ fontSize: 22, fontWeight: 900, color }}>{value}</div>
      <div style={{ fontSize: 10, color: "#64748b", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
      {sub && <div style={{ fontSize: 10, color: "#475569" }}>{sub}</div>}
    </div>
  );
}

function OverviewSection({ dashboard, onRefresh }) {
  if (!dashboard) return null;
  const d = dashboard;
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#94a3b8" }}>Métriques SaaS (temps réel)</div>
        <button onClick={onRefresh} style={{ padding: "6px 12px", border: "1px solid #334155", borderRadius: 8, background: "#1e293b", color: "#64748b", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>🔄 Actualiser</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, marginBottom: 24 }}>
        <Kpi label="MRR" value={`${d.mrr} €`} sub="revenu mensuel récurrent" icon="💰" color="#4ade80" />
        <Kpi label="ARR" value={`${d.arr} €`} sub="revenu annuel projeté" icon="📈" color="#60a5fa" />
        <Kpi label="ARPU" value={`${d.arpu} €`} sub="revenu moyen / client" icon="👤" color="#a78bfa" />
        <Kpi label="Clients actifs" value={d.clientsActifs} sub="actifs + en essai" icon="🏥" color="#34d399" />
        <Kpi label="Churn mensuel" value={`${d.tauxChurnMensuel} %`} sub="résiliés / 30j" icon="📉" color={d.tauxChurnMensuel > 10 ? "#f87171" : "#fbbf24"} />
        <Kpi label="LTV estimée" value={d.ltv !== null ? `${d.ltv} €` : "—"} sub="ARPU ÷ taux de churn" icon="💎" color="#38bdf8" />
        <Kpi label="CAC estimé" value={d.cac !== null ? `${d.cac} €` : "—"} sub="dépense marketing / nouveaux clients" icon="🎯" color="#fb923c" />
        <Kpi label="Résiliations programmées" value={d.resiliationsProgrammees} sub="fin de période à venir" icon="⏳" color="#f59e0b" />
      </div>

      <div style={{ fontSize: 13, fontWeight: 700, color: "#94a3b8", marginBottom: 14 }}>Trésorerie & TVA (30 derniers jours)</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
        <Kpi label="TTC collecté" value={`${d.ttcCollecte30j.toFixed(2)} €`} sub="factures payées, 30j" icon="🧾" color="#4ade80" />
        <Kpi label="TVA collectée (est.)" value={`${d.tvaCollectee30j.toFixed(2)} €`} sub="20 % si non renseignée" icon="🏛️" color="#60a5fa" />
        <Kpi label="Solde Stripe disponible" value={d.soldeStripeDisponible !== null ? `${d.soldeStripeDisponible.toFixed(2)} €` : "indisponible"} sub="hors comptes bancaires hors Stripe" icon="💳" color="#a78bfa" />
        <Kpi label="Solde Stripe en attente" value={d.soldeStripeAttente !== null ? `${d.soldeStripeAttente.toFixed(2)} €` : "indisponible"} sub="virements en cours" icon="⏱️" color="#94a3b8" />
      </div>
      {d.parametres?.tresorerieBancaireManuelle && (
        <div style={{ marginTop: 12, fontSize: 12, color: "#94a3b8" }}>
          + Trésorerie bancaire déclarée manuellement : <strong style={{ color: "#e2e8f0" }}>{Number(d.parametres.tresorerieBancaireManuelle).toFixed(2)} €</strong> (voir onglet Paramètres)
        </div>
      )}
    </div>
  );
}

function FacturationSection({ adminToken }) {
  const [factures, setFactures] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    callSecureData("admin_gestion_export_factures", {}, adminToken)
      .then(r => setFactures(r.data || []))
      .catch(e => setError(e.message));
  }, [adminToken]);

  function exportCsv() {
    const rows = [["Numéro", "Pharmacie", "SIRET", "Date", "Montant TTC (€)", "TVA (€)", "Statut"]];
    (factures || []).forEach(f => {
      const ttc = (f.montant_ttc || 0) / 100;
      const tva = f.tva != null ? f.tva / 100 : Math.round((ttc - ttc / 1.20) * 100) / 100;
      rows.push([f.numero || f.stripe_invoice_id || "—", f.pharmacies?.nom || "—", f.pharmacies?.siret || "—", (f.created_at || "").slice(0, 10), ttc.toFixed(2), tva.toFixed(2), f.statut]);
    });
    downloadTextFile(`export-factures-ordomail-${new Date().toISOString().slice(0, 10)}.csv`, rows.map(r => r.map(csvEscape).join(";")).join("\n"));
  }

  // Brouillon FEC — structure conforme (18 champs, arrêté du 29/07/2013),
  // 2 lignes par facture (débit client 411 / crédit produit 706 + TVA
  // collectée 44571). Comptabilité en partie double INCOMPLÈTE (pas de
  // charges ni de rapprochement bancaire dans ce système) : brouillon de
  // base, pas un FEC prêt à transmettre.
  function exportFecDraft() {
    const cols = ["JournalCode", "JournalLib", "EcritureNum", "EcritureDate", "CompteNum", "CompteLib", "CompAuxNum", "CompAuxLib", "PieceRef", "PieceDate", "EcritureLib", "Debit", "Credit", "EcritureLet", "DateLet", "ValidDate", "Montantdevise", "Idevise"];
    const lines = [cols.join("|")];
    (factures || []).forEach((f, i) => {
      const ttc = (f.montant_ttc || 0) / 100;
      const tva = f.tva != null ? f.tva / 100 : Math.round((ttc - ttc / 1.20) * 100) / 100;
      const ht = Math.round((ttc - tva) * 100) / 100;
      const num = f.numero || f.stripe_invoice_id || `FAC${i + 1}`;
      const date = (f.created_at || "").slice(0, 10).replace(/-/g, "");
      const client = f.pharmacies?.nom || "Client";
      const lib = `Abonnement OrdoMail ${date}`;
      lines.push(["VE", "Ventes", String(i * 2 + 1), date, "411000", "Clients", num, client, num, date, lib, ttc.toFixed(2), "0.00", "", "", date, "", ""].join("|"));
      lines.push(["VE", "Ventes", String(i * 2 + 2), date, "706000", "Prestations de services", "", "", num, date, lib, "0.00", ht.toFixed(2), "", "", date, "", ""].join("|"));
      if (tva > 0) lines.push(["VE", "Ventes", String(i * 2 + 2) + "b", date, "445710", "TVA collectée", "", "", num, date, lib, "0.00", tva.toFixed(2), "", "", date, "", ""].join("|"));
    });
    downloadTextFile(`brouillon-fec-ordomail-${new Date().toISOString().slice(0, 10)}.txt`, lines.join("\n"), "text/plain;charset=utf-8");
  }

  return (
    <div>
      {error && <div style={{ color: "#fca5a5", marginBottom: 12 }}>{error}</div>}
      <div style={{ display: "flex", gap: 10, marginBottom: 18 }}>
        <button onClick={exportCsv} disabled={!factures} style={{ padding: "9px 16px", border: "none", borderRadius: 9, background: "#3b82f6", color: "#fff", fontWeight: 700, fontSize: 13, cursor: factures ? "pointer" : "default", fontFamily: "inherit", opacity: factures ? 1 : 0.5 }}>
          ⬇️ Export CSV (comptable)
        </button>
        <button onClick={exportFecDraft} disabled={!factures} style={{ padding: "9px 16px", border: "1px solid #334155", borderRadius: 9, background: "#1e293b", color: "#e2e8f0", fontWeight: 700, fontSize: 13, cursor: factures ? "pointer" : "default", fontFamily: "inherit", opacity: factures ? 1 : 0.5 }}>
          ⬇️ Brouillon FEC (à valider par l'expert-comptable)
        </button>
      </div>
      <div style={{ fontSize: 12, color: "#64748b", marginBottom: 14, lineHeight: 1.6 }}>
        {factures ? `${factures.length} facture(s) réelle(s) trouvée(s).` : "Chargement…"} Le brouillon FEC ne couvre que les ventes (pas les charges/rapprochement bancaire) — c'est un point de départ, pas un fichier réglementaire complet.
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 420, overflowY: "auto" }}>
        {(factures || []).map((f, i) => {
          const ttc = (f.montant_ttc || 0) / 100;
          return (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", background: "#1e293b", border: "1px solid #334155", borderRadius: 8, padding: "8px 12px", fontSize: 12 }}>
              <span style={{ color: "#e2e8f0" }}>{f.pharmacies?.nom || "—"}</span>
              <span style={{ color: "#64748b" }}>{(f.created_at || "").slice(0, 10)}</span>
              <span style={{ color: "#4ade80", fontWeight: 700 }}>{ttc.toFixed(2)} €</span>
              <span style={{ color: f.statut === "paid" ? "#4ade80" : "#fbbf24" }}>{f.statut}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RegistresSection({ adminToken }) {
  const [categorie, setCategorie] = useState("personnel");
  const [entries, setEntries] = useState([]);
  const [form, setForm] = useState({});
  const [error, setError] = useState("");

  const FIELDS = {
    personnel: [["nom", "Nom"], ["prenom", "Prénom"], ["poste", "Poste"], ["typeContrat", "Type de contrat (CDI/CDD/Président assimilé-salarié…)"], ["dateEntree", "Date d'entrée"], ["dateSortie", "Date de sortie (si applicable)"]],
    titres: [["actionnaire", "Actionnaire"], ["nombreActions", "Nombre d'actions"], ["typeMouvement", "Type (souscription/cession/donation…)"], ["date", "Date du mouvement"], ["prixUnitaire", "Prix unitaire (€)"]],
  };

  async function load() {
    setError("");
    try {
      const { data } = await callSecureData("admin_gestion_registre_list", { categorie }, adminToken);
      setEntries(data || []);
    } catch (e) { setError(e.message); }
  }
  useEffect(() => { load(); setForm({}); /* eslint-disable-next-line */ }, [categorie]);

  async function save() {
    if (!Object.values(form).some(v => v)) return;
    try {
      await callSecureData("admin_gestion_registre_save", { categorie, entree: form }, adminToken);
      setForm({});
      load();
    } catch (e) { setError(e.message); }
  }
  async function remove(id) {
    try { await callSecureData("admin_gestion_registre_delete", { id }, adminToken); load(); }
    catch (e) { setError(e.message); }
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {[["personnel", "👥 Registre du personnel"], ["titres", "📜 Registre des mouvements de titres"]].map(([k, l]) => (
          <button key={k} onClick={() => setCategorie(k)} style={{ padding: "6px 14px", border: "none", borderRadius: 8, cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: categorie === k ? 700 : 500, background: categorie === k ? "#3b82f6" : "#1e293b", color: categorie === k ? "#fff" : "#94a3b8" }}>{l}</button>
        ))}
      </div>
      {error && <div style={{ color: "#fca5a5", marginBottom: 12 }}>{error}</div>}
      <div style={{ fontSize: 12, color: "#64748b", marginBottom: 12 }}>
        Registre de suivi manuel — ne remplace pas les obligations légales (déclarations sociales réelles, statuts, procès-verbaux d'AG signés) mais permet de garder une trace centralisée.
      </div>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${FIELDS[categorie].length}, 1fr) auto`, gap: 8, marginBottom: 16, alignItems: "end" }}>
        {FIELDS[categorie].map(([k, l]) => (
          <div key={k}>
            <div style={{ fontSize: 10, color: "#64748b", marginBottom: 4 }}>{l}</div>
            <input value={form[k] || ""} onChange={e => setForm({ ...form, [k]: e.target.value })}
              style={{ width: "100%", padding: "7px 9px", background: "#1e293b", border: "1px solid #334155", borderRadius: 7, color: "#fff", fontSize: 12, fontFamily: "inherit", boxSizing: "border-box" }} />
          </div>
        ))}
        <button onClick={save} style={{ padding: "8px 14px", border: "none", borderRadius: 7, background: "#22c55e", color: "#052e16", fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "inherit", height: 32 }}>+ Ajouter</button>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {entries.map(e => (
          <div key={e.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#1e293b", border: "1px solid #334155", borderRadius: 8, padding: "8px 12px", fontSize: 12 }}>
            <span style={{ color: "#e2e8f0" }}>{FIELDS[categorie].map(([k]) => e.data[k]).filter(Boolean).join(" · ")}</span>
            <button onClick={() => remove(e.id)} style={{ border: "none", background: "transparent", color: "#f87171", cursor: "pointer", fontSize: 12 }}>🗑️ Supprimer</button>
          </div>
        ))}
        {entries.length === 0 && <div style={{ color: "#475569", fontSize: 12, fontStyle: "italic" }}>Aucune entrée pour l'instant.</div>}
      </div>
    </div>
  );
}

function ConformiteSection({ adminToken }) {
  const [state, setState] = useState({});
  const [error, setError] = useState("");

  useEffect(() => {
    callSecureData("admin_gestion_checklist_get", {}, adminToken).then(r => setState(r.data || {})).catch(e => setError(e.message));
  }, [adminToken]);

  async function toggle(item) {
    const next = !state[item.id]?.done;
    setState(s => ({ ...s, [item.id]: { ...(s[item.id] || {}), done: next } }));
    try { await callSecureData("admin_gestion_checklist_set", { itemId: item.id, done: next, note: state[item.id]?.note }, adminToken); }
    catch (e) { setError(e.message); }
  }

  const parCategorie = CHECKLIST_ITEMS.reduce((acc, item) => { (acc[item.cat] = acc[item.cat] || []).push(item); return acc; }, {});

  return (
    <div>
      {error && <div style={{ color: "#fca5a5", marginBottom: 12 }}>{error}</div>}
      <div style={{ fontSize: 12, color: "#64748b", marginBottom: 16, lineHeight: 1.6 }}>
        Échéances récurrentes génériques pour une SAS française — à confirmer avec votre expert-comptable/avocat selon le régime réel d'OrdoMail SAS (dates de clôture, régime de TVA, éligibilité CIR/CII).
      </div>
      {Object.entries(parCategorie).map(([cat, items]) => (
        <div key={cat} style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>{cat}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {items.map(item => (
              <label key={item.id} style={{ display: "flex", alignItems: "center", gap: 10, background: "#1e293b", border: "1px solid #334155", borderRadius: 8, padding: "9px 12px", cursor: "pointer" }}>
                <input type="checkbox" checked={!!state[item.id]?.done} onChange={() => toggle(item)} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, color: state[item.id]?.done ? "#4ade80" : "#e2e8f0", textDecoration: state[item.id]?.done ? "line-through" : "none" }}>{item.label}</div>
                  <div style={{ fontSize: 10, color: "#64748b" }}>Échéance type : {item.echeance}</div>
                </div>
              </label>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function ParametresSection({ adminToken, dashboard, onSaved }) {
  const [values, setValues] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { setValues(dashboard?.parametres || {}); }, [dashboard]);

  const FIELDS = [
    ["depenseMarketingMensuelle", "Dépense marketing/acquisition mensuelle (€)", "Utilisée pour estimer le CAC (coût d'acquisition client)."],
    ["tresorerieBancaireManuelle", "Trésorerie bancaire hors Stripe (€)", "Comptes bancaires classiques non connectés au système — saisie manuelle."],
    ["depensesFixesMensuelles", "Dépenses fixes mensuelles (€)", "Salaires, loyers, abonnements… pour estimer le burn rate et le runway."],
  ];

  async function save() {
    setSaving(true); setError("");
    try {
      for (const [k] of FIELDS) {
        await callSecureData("admin_gestion_set_parametre", { cle: k, valeur: values[k] || "" }, adminToken);
      }
      onSaved?.();
    } catch (e) { setError(e.message); }
    setSaving(false);
  }

  const burn = dashboard ? (Number(values.depensesFixesMensuelles) || 0) - dashboard.mrr : null;
  const tresorerieTotale = (dashboard?.soldeStripeDisponible || 0) + (Number(values.tresorerieBancaireManuelle) || 0);
  const runwayMois = burn && burn > 0 ? Math.round((tresorerieTotale / burn) * 10) / 10 : null;

  return (
    <div style={{ maxWidth: 480 }}>
      {error && <div style={{ color: "#fca5a5", marginBottom: 12 }}>{error}</div>}
      {FIELDS.map(([k, l, help]) => (
        <div key={k} style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#e2e8f0", marginBottom: 4 }}>{l}</div>
          <input type="number" value={values[k] || ""} onChange={e => setValues({ ...values, [k]: e.target.value })}
            style={{ width: "100%", padding: "9px 12px", background: "#1e293b", border: "1px solid #334155", borderRadius: 8, color: "#fff", fontSize: 13, fontFamily: "inherit", boxSizing: "border-box" }} />
          <div style={{ fontSize: 10, color: "#64748b", marginTop: 3 }}>{help}</div>
        </div>
      ))}
      <button onClick={save} disabled={saving} style={{ padding: "9px 18px", border: "none", borderRadius: 9, background: "#3b82f6", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
        {saving ? "Enregistrement…" : "💾 Enregistrer"}
      </button>

      {runwayMois !== null && (
        <div style={{ marginTop: 24, background: "#1e293b", border: "1px solid #334155", borderRadius: 10, padding: 16 }}>
          <div style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", fontWeight: 700, marginBottom: 6 }}>Burn rate & runway (estimation)</div>
          <div style={{ fontSize: 13, color: "#e2e8f0", marginBottom: 4 }}>Burn mensuel : <strong style={{ color: burn > 0 ? "#f87171" : "#4ade80" }}>{burn} €</strong> {burn <= 0 && "(le MRR couvre les dépenses fixes déclarées)"}</div>
          {runwayMois !== null && <div style={{ fontSize: 13, color: "#e2e8f0" }}>Runway estimé : <strong style={{ color: "#fbbf24" }}>{runwayMois} mois</strong> (trésorerie Stripe + bancaire déclarée ÷ burn)</div>}
        </div>
      )}
    </div>
  );
}

export { GestionAdmin };
