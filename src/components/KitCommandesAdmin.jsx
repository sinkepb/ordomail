// Phase 7 tarification (§18) — file d'expédition du kit matériel (3 stickers
// sol, 3 supports panneau acrylique, 1 présentoir plexiglas 1m). Alimentée
// par stripe-webhook (checkout.session.completed) dès qu'un paiement de kit
// est confirmé — voir supabase/functions/stripe-webhook/index.ts. Mêmes
// conventions que PromotionsAdmin.jsx (callSecureData local, styles inline).
import { useState, useEffect } from "react";

function KitCommandesAdmin({ adminToken } = {}) {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [showExpedies, setShowExpedies] = useState(false);

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
      const { data } = await callSecureData("admin_kit_commandes_list");
      setList(data || []);
    } catch (e) {
      setErr("Chargement impossible : " + e.message);
    }
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function toggleExpedie(row) {
    setBusyId(row.id); setErr("");
    try {
      await callSecureData("admin_kit_commandes_marquer_expedie", { id: row.id, expedie: !row.expedie });
      await load();
    } catch (e) {
      setErr("Échec de la mise à jour : " + e.message);
    }
    setBusyId(null);
  }

  const aExpedier = list.filter(r => !r.expedie);
  const expedies = list.filter(r => r.expedie);
  const rows = showExpedies ? [...aExpedier, ...expedies] : aExpedier;

  return (
    <div style={{ color: "#e2e8f0" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 18 }}>📦 Matériel — file d'expédition</h3>
          <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 4 }}>3 stickers sol · 3 supports panneau acrylique · 1 présentoir plexiglas 1m</div>
        </div>
        <label style={{ fontSize: 12, color: "#94a3b8", display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
          <input type="checkbox" checked={showExpedies} onChange={e => setShowExpedies(e.target.checked)} />
          Afficher les expédiés
        </label>
      </div>

      {err && <div style={{ background: "#7f1d1d", color: "#fecaca", padding: "8px 12px", borderRadius: 8, marginBottom: 12, fontSize: 13 }}>{err}</div>}

      {loading ? (
        <div style={{ color: "#94a3b8", fontSize: 13 }}>Chargement…</div>
      ) : rows.length === 0 ? (
        <div style={{ color: "#94a3b8", fontSize: 13 }}>Aucune commande {showExpedies ? "" : "en attente d'expédition"}.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {aExpedier.length > 0 && (
            <div style={{ fontSize: 11, fontWeight: 700, color: "#fbbf24", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 2 }}>
              {aExpedier.length} en attente
            </div>
          )}
          {rows.map(row => (
            <div key={row.id} style={{
              display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12,
              background: row.expedie ? "#1e293b88" : "#1e293b", border: `1px solid ${row.expedie ? "#334155" : "#fbbf2455"}`,
              borderRadius: 10, padding: "12px 14px", opacity: row.expedie ? 0.6 : 1,
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{row.pharmacies?.nom || "Pharmacie inconnue"}</div>
                <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>{row.pharmacies?.adresse || row.pharmacies?.email || "—"}</div>
                <div style={{ fontSize: 11, color: "#64748b", marginTop: 4 }}>{row.label} · {row.prix_paye != null ? `${row.prix_paye} €` : "offert"} · commandé le {new Date(row.created_at).toLocaleDateString("fr-FR")}</div>
                {row.expedie && row.expedie_at && <div style={{ fontSize: 11, color: "#4ade80", marginTop: 2 }}>✓ Expédié le {new Date(row.expedie_at).toLocaleDateString("fr-FR")}</div>}
              </div>
              <button onClick={() => toggleExpedie(row)} disabled={busyId === row.id}
                style={{
                  padding: "8px 14px", border: "none", borderRadius: 8, fontWeight: 700, fontSize: 12, cursor: busyId === row.id ? "default" : "pointer",
                  background: row.expedie ? "#334155" : "#16a34a", color: "#fff", opacity: busyId === row.id ? 0.6 : 1, flexShrink: 0,
                }}>
                {busyId === row.id ? "…" : row.expedie ? "↺ Annuler" : "✓ Marquer expédié"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export { KitCommandesAdmin };
export default KitCommandesAdmin;
