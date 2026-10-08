// Détail des rappels par pharmacie — backoffice. Données : secure-data-admin
// (admin_pharmacies pour la liste, admin_rappels_detail pour le détail).
import { callSecureDataAdmin } from "../lib/supabase/adminApi.js";
import { useState, useEffect, useMemo } from "react";
import { STATUT_INFO } from "./rappels/rappelsConstants.js";
import { grouperParPeriode } from "../lib/activiteBuckets.js";
import { BarChart } from "./BarChart.jsx";

const GRANULARITES = [["jour", "Jour"], ["mois", "Mois"], ["annee", "Année"]];

function formatDate(iso) {
  return iso ? new Date(iso).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" }) : "—";
}

function formatJour(iso) {
  return iso ? new Date(iso).toLocaleDateString("fr-FR") : "—";
}

export function RappelsDetailAdmin({ adminToken }) {
  const [pharmacies, setPharmacies] = useState([]);
  const [pharmacieId, setPharmacieId] = useState("");
  const [rappels, setRappels] = useState([]);
  const [ordonnancesDates, setOrdonnancesDates] = useState([]);
  const [granularite, setGranularite] = useState("jour");
  const [chargement, setChargement] = useState(false);
  const [erreur, setErreur] = useState("");

  useEffect(() => {
    callSecureDataAdmin("admin_pharmacies", {}, adminToken)
      .then(({ data }) => setPharmacies(data || []))
      .catch((e) => setErreur(e.message));
  }, [adminToken]);

  useEffect(() => {
    if (!pharmacieId) { setRappels([]); setOrdonnancesDates([]); return; }
    setChargement(true);
    setErreur("");
    Promise.all([
      callSecureDataAdmin("admin_rappels_detail", { pharmacieId }, adminToken),
      callSecureDataAdmin("admin_ordonnances_dates", { pharmacieId }, adminToken),
    ])
      .then(([rappelsRes, ordosRes]) => {
        setRappels(rappelsRes.data || []);
        setOrdonnancesDates(ordosRes.data || []);
      })
      .catch((e) => setErreur(e.message))
      .finally(() => setChargement(false));
  }, [pharmacieId, adminToken]);

  const seriesOrdonnances = useMemo(
    () => grouperParPeriode(ordonnancesDates.map((o) => o.received_at), granularite),
    [ordonnancesDates, granularite],
  );
  const seriesRappels = useMemo(
    () => grouperParPeriode(rappels.map((r) => r.created_at), granularite),
    [rappels, granularite],
  );

  const cellule = { padding: "6px 8px", borderTop: "1px solid #f1f5f9", verticalAlign: "top" };
  const entete = { padding: "6px 8px", textAlign: "left", color: "#94a3b8", fontWeight: 600, fontSize: 11 };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 20 }}>
      <div style={{ fontWeight: 700, fontSize: 15 }}>Détail des rappels par pharmacie</div>
      <select value={pharmacieId} onChange={(e) => setPharmacieId(e.target.value)} style={{ padding: "8px 10px", borderRadius: 8, border: "1.5px solid #e2e8f0", fontSize: 13, maxWidth: 360, fontFamily: "inherit" }}>
        <option value="">— Choisir une pharmacie —</option>
        {pharmacies.map((p) => <option key={p.id} value={p.id}>{p.nom}</option>)}
      </select>

      {erreur && <div style={{ color: "#dc2626", fontSize: 13 }}>{erreur}</div>}
      {chargement && <div style={{ color: "#94a3b8", fontSize: 13 }}>Chargement…</div>}

      {pharmacieId && !chargement && !erreur && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", gap: 6 }}>
            {GRANULARITES.map(([k, label]) => (
              <button key={k} onClick={() => setGranularite(k)}
                style={{ padding: "5px 12px", borderRadius: 8, border: "1.5px solid #e2e8f0", cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 700,
                  background: granularite === k ? "#1a3a6e" : "#fff", color: granularite === k ? "#fff" : "#334155" }}>
                {label}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", padding: 14, flex: 1, minWidth: 280 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#334155", marginBottom: 10 }}>📋 Ordonnances créées</div>
              <BarChart data={seriesOrdonnances} color="#1a3a6e" />
            </div>
            <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", padding: 14, flex: 1, minWidth: 280 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#334155", marginBottom: 10 }}>🔔 Rappels créés</div>
              <BarChart data={seriesRappels} color="#7c3aed" />
            </div>
          </div>
        </div>
      )}

      {pharmacieId && !chargement && rappels.length === 0 && !erreur && (
        <div style={{ color: "#94a3b8", fontSize: 13 }}>Aucun rappel pour cette pharmacie.</div>
      )}

      {rappels.length > 0 && (
        <div style={{ overflowX: "auto", background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr>
                <th style={entete}>Patient</th>
                <th style={entete}>Téléphone</th>
                <th style={entete}>Statut</th>
                <th style={entete}>Prochain envoi</th>
                <th style={entete}>SMS envoyé</th>
                <th style={entete}>Groupe</th>
                <th style={entete}>Casier</th>
                <th style={entete}>Cycle</th>
                <th style={entete}>Créé le</th>
              </tr>
            </thead>
            <tbody>
              {rappels.map((r) => {
                const info = STATUT_INFO[r.statut] || STATUT_INFO.en_attente;
                return (
                  <tr key={r.id} style={{ opacity: r.supprime_le ? 0.5 : 1 }}>
                    <td style={cellule}>{r.patient_prenom} {r.patient_nom}{r.supprime_le ? " (supprimé)" : ""}</td>
                    <td style={cellule}>{r.patient_telephone}</td>
                    <td style={cellule}>
                      <span style={{ fontWeight: 700, padding: "2px 8px", borderRadius: 12, background: info.bg, color: info.fg, whiteSpace: "nowrap" }}>{info.label}</span>
                    </td>
                    <td style={cellule}>{r.statut === "en_attente" ? formatJour(r.date_prochaine_relance) : "—"}</td>
                    <td style={cellule}>{r.date_dernier_sms_envoye ? `Oui · ${formatDate(r.date_dernier_sms_envoye)}` : "Non"}</td>
                    <td style={cellule}>{r.groupe_id ? "Oui" : "—"}</td>
                    <td style={cellule}>{r.case_code || "—"}</td>
                    <td style={cellule}>{r.cycle_numero ?? "—"}</td>
                    <td style={cellule}>{formatDate(r.created_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
