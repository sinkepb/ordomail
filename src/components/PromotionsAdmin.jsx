// Phase 4 tarification (§6-9, §18) — gestion des promotions ("Founding
// Pharmacies" est la première instance, pas un cas codé en dur : l'admin
// peut créer/activer/désactiver d'autres promotions plus tard sans
// déploiement). Même conventions que PricingEditor.jsx/QrCodesAdmin.jsx
// (callSecureData local, styles inline, palette sombre).
import { useState, useEffect } from "react";
import { PLAN_ORDER, PLAN_LIMITS } from "../lib/plans.js";

const BILLING_INTERVALS = ["monthly", "annual"];

function emptyPromo() {
  return { id: null, nom: "", actif: false, plans: [], prixPromoMonthly: {}, prixPromoAnnual: {}, dureeGarantieMois: 24, maxPharmacies: "", dateDebut: "", dateFin: "" };
}

function PromotionsAdmin({ adminToken } = {}) {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // null = liste, objet = formulaire
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [redemptions, setRedemptions] = useState(null); // {promotionId, rows} | null

  async function callSecureData(resource, params) {
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

  async function load() {
    setLoading(true); setErr("");
    try {
      const { data } = await callSecureData("admin_promotions_list");
      setList(data || []);
    } catch (e) {
      setErr("Chargement impossible : " + e.message);
    }
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function save() {
    setSaving(true); setErr("");
    try {
      await callSecureData("admin_promotions_save", editing);
      setEditing(null);
      await load();
    } catch (e) {
      setErr("Échec de la sauvegarde : " + e.message);
    }
    setSaving(false);
  }

  async function viewRedemptions(promo) {
    setRedemptions({ promotionId: promo.id, nom: promo.nom, rows: null });
    try {
      const { data } = await callSecureData("admin_promotions_redemptions", { promotionId: promo.id });
      setRedemptions({ promotionId: promo.id, nom: promo.nom, rows: data || [] });
    } catch (e) {
      setRedemptions({ promotionId: promo.id, nom: promo.nom, rows: [], error: e.message });
    }
  }

  const cardStyle = { background: "#1e293b", borderRadius: 14, padding: 20, border: "1px solid #334155" };
  const inputStyle = { background: "#0f172a", border: "1px solid #334155", borderRadius: 8, padding: "8px 10px", color: "#e2e8f0", fontSize: 13, fontFamily: "inherit", outline: "none" };
  const labelStyle = { fontSize: 10, fontWeight: 700, color: "#64748b", marginBottom: 4, display: "block" };

  if (editing) {
    return (
      <div style={{ maxWidth: 700, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontWeight: 800, fontSize: 18, color: "#fff" }}>{editing.id ? "✏️ Modifier la promotion" : "➕ Nouvelle promotion"}</div>
          <button onClick={() => setEditing(null)} style={{ background: "none", border: "1px solid #334155", borderRadius: 8, color: "#94a3b8", padding: "6px 12px", cursor: "pointer", fontSize: 12 }}>← Retour</button>
        </div>
        {err && <div style={{ background: "#450a0a", border: "1px solid #7f1d1d", borderRadius: 8, padding: "8px 12px", color: "#fca5a5", fontSize: 12 }}>{err}</div>}
        <div style={cardStyle}>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Nom de la promotion</label>
            <input value={editing.nom} onChange={e => setEditing({ ...editing, nom: e.target.value })} placeholder="Founding Pharmacies 2026" style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 14 }}>
            <div>
              <label style={labelStyle}>Prix garanti (mois)</label>
              <input type="number" value={editing.dureeGarantieMois} onChange={e => setEditing({ ...editing, dureeGarantieMois: e.target.value })} style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }} />
            </div>
            <div>
              <label style={labelStyle}>Limite pharmacies (vide = illimité)</label>
              <input type="number" value={editing.maxPharmacies} onChange={e => setEditing({ ...editing, maxPharmacies: e.target.value })} style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }} />
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#e2e8f0", cursor: "pointer", paddingTop: 18 }}>
              <input type="checkbox" checked={editing.actif} onChange={e => setEditing({ ...editing, actif: e.target.checked })} />
              Active
            </label>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
            <div>
              <label style={labelStyle}>Date de début (optionnel)</label>
              <input type="date" value={editing.dateDebut || ""} onChange={e => setEditing({ ...editing, dateDebut: e.target.value })} style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }} />
            </div>
            <div>
              <label style={labelStyle}>Date de fin (optionnel)</label>
              <input type="date" value={editing.dateFin || ""} onChange={e => setEditing({ ...editing, dateFin: e.target.value })} style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }} />
            </div>
          </div>
          <label style={labelStyle}>Plans concernés et tarifs promo</label>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 6 }}>
            {PLAN_ORDER.map(planId => {
              const p = PLAN_LIMITS[planId];
              const checked = editing.plans.includes(planId);
              return (
                <div key={planId} style={{ border: "1px solid #334155", borderRadius: 8, padding: 10 }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#e2e8f0", cursor: "pointer", marginBottom: checked ? 8 : 0 }}>
                    <input type="checkbox" checked={checked} onChange={e => {
                      const plans = e.target.checked ? [...editing.plans, planId] : editing.plans.filter(id => id !== planId);
                      setEditing({ ...editing, plans });
                    }} />
                    {p.icon} {p.label} <span style={{ color: "#64748b", fontWeight: 400 }}>(officiel {p.price} €/mois · {p.priceAnnual} €/an)</span>
                  </label>
                  {checked && (
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, paddingLeft: 24 }}>
                      {BILLING_INTERVALS.map(b => (
                        <div key={b}>
                          <label style={labelStyle}>{b === "monthly" ? "Prix promo mensuel €" : "Prix promo annuel € (total)"}</label>
                          <input type="number" value={(b === "monthly" ? editing.prixPromoMonthly : editing.prixPromoAnnual)[planId] || ""}
                            onChange={e => {
                              const key = b === "monthly" ? "prixPromoMonthly" : "prixPromoAnnual";
                              setEditing({ ...editing, [key]: { ...editing[key], [planId]: e.target.value } });
                            }}
                            style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }} />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        <button onClick={save} disabled={saving || !editing.nom || !editing.plans.length}
          style={{ padding: "12px", border: "none", borderRadius: 10, background: "#3b82f6", color: "#fff", fontWeight: 800, fontSize: 14, cursor: saving ? "default" : "pointer", opacity: saving || !editing.nom || !editing.plans.length ? 0.6 : 1 }}>
          {saving ? "Sauvegarde…" : "💾 Sauvegarder"}
        </button>
        <div style={{ fontSize: 11, color: "#64748b", lineHeight: 1.6 }}>
          Un prix promo déjà utilisé (Price Stripe déjà créé) n'est jamais modifié automatiquement — le montant facturé par Stripe est immuable une fois créé, pour ne jamais faire dériver silencieusement le prix payé par des clients déjà inscrits.
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 900, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 20, color: "#fff" }}>🚀 Promotions</div>
          <div style={{ fontSize: 13, color: "#64748b", marginTop: 2 }}>{loading ? "Chargement…" : `${list.length} promotion(s)`}</div>
        </div>
        <button onClick={() => setEditing(emptyPromo())} style={{ padding: "10px 20px", border: "none", borderRadius: 10, background: "#3b82f6", color: "#fff", fontWeight: 800, fontSize: 13, cursor: "pointer" }}>+ Nouvelle promotion</button>
      </div>
      {err && <div style={{ background: "#450a0a", border: "1px solid #7f1d1d", borderRadius: 8, padding: "8px 12px", color: "#fca5a5", fontSize: 12, marginBottom: 16 }}>{err}</div>}
      {!loading && list.length === 0 && (
        <div style={{ ...cardStyle, textAlign: "center", color: "#64748b", padding: 40 }}>Aucune promotion créée.</div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {list.map(promo => {
          const placesRestantes = promo.max_pharmacies != null ? Math.max(0, promo.max_pharmacies - promo.slots_used) : null;
          return (
            <div key={promo.id} style={cardStyle}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <span style={{ fontWeight: 800, fontSize: 15, color: "#fff" }}>{promo.nom}</span>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 20, background: promo.actif ? "#14532d" : "#334155", color: promo.actif ? "#86efac" : "#94a3b8" }}>
                      {promo.actif ? "Active" : "Inactive"}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: "#64748b" }}>
                    Plans : {promo.plans.map(id => PLAN_LIMITS[id]?.label || id).join(", ")} · Prix garanti {promo.duree_garantie_mois} mois
                  </div>
                  <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>
                    {promo.slots_used} pharmacie(s) inscrite(s){placesRestantes != null ? ` · ${placesRestantes} place(s) restante(s) / ${promo.max_pharmacies}` : " · places illimitées"}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                  <button onClick={() => viewRedemptions(promo)} style={{ padding: "6px 12px", border: "1px solid #334155", borderRadius: 8, background: "transparent", color: "#94a3b8", fontSize: 12, cursor: "pointer" }}>👁️ Inscrits</button>
                  <button onClick={() => setEditing({
                    id: promo.id, nom: promo.nom, actif: promo.actif, plans: promo.plans,
                    prixPromoMonthly: promo.prix_promo_monthly || {}, prixPromoAnnual: promo.prix_promo_annual || {},
                    dureeGarantieMois: promo.duree_garantie_mois, maxPharmacies: promo.max_pharmacies ?? "",
                    dateDebut: promo.date_debut ? promo.date_debut.slice(0, 10) : "", dateFin: promo.date_fin ? promo.date_fin.slice(0, 10) : "",
                  })} style={{ padding: "6px 12px", border: "1px solid #334155", borderRadius: 8, background: "#f8faff", color: "#1a3a6e", fontSize: 12, cursor: "pointer" }}>✏️ Modifier</button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {redemptions && (
        <div onClick={() => setRedemptions(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 16, padding: 24, maxWidth: 480, width: "100%", maxHeight: "70vh", overflowY: "auto" }}>
            <div style={{ fontWeight: 800, fontSize: 15, color: "#fff", marginBottom: 14 }}>Inscrits — {redemptions.nom}</div>
            {redemptions.rows === null && <div style={{ color: "#64748b", fontSize: 13 }}>Chargement…</div>}
            {redemptions.rows?.length === 0 && <div style={{ color: "#64748b", fontSize: 13 }}>Aucune pharmacie inscrite pour l'instant.</div>}
            {redemptions.rows?.map(r => (
              <div key={r.id} style={{ borderBottom: "1px solid #334155", padding: "8px 0", fontSize: 12, color: "#e2e8f0" }}>
                <div style={{ fontWeight: 700 }}>{r.pharmacies?.nom} <span style={{ color: "#64748b", fontWeight: 400 }}>({r.pharmacies?.email})</span></div>
                <div style={{ color: "#94a3b8" }}>{PLAN_LIMITS[r.plan_id]?.label || r.plan_id} · {r.prix_garanti} € · garanti jusqu'au {new Date(r.garanti_jusqua).toLocaleDateString("fr-FR")}</div>
              </div>
            ))}
            <button onClick={() => setRedemptions(null)} style={{ marginTop: 16, width: "100%", padding: "8px", border: "1px solid #334155", borderRadius: 8, background: "transparent", color: "#94a3b8", cursor: "pointer", fontSize: 12 }}>Fermer</button>
          </div>
        </div>
      )}
    </div>
  );
}

export { PromotionsAdmin };
export default PromotionsAdmin;
