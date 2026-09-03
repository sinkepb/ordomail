// OrdoMail — file d'attente "Click & Collect" (03/09/2026). Le patient a dit
// vouloir un produit depuis l'écran d'attente ; l'encaissement se fait
// PHYSIQUEMENT au TPE de la pharmacie (jamais Stripe pour ce produit — voir
// la mission). Ceci n'est qu'une liste de préparation pour le comptoir, pas
// de flux de paiement.
import { useState, useEffect, useCallback } from "react";
import { callSecureData, isDemoMode } from "../supabase.js";

const POLL_MS = 15000;

function OffreReservationsPanel() {
  const [reservations, setReservations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    if (isDemoMode) { setLoading(false); return; }
    try {
      const data = await callSecureData("offre_reservations_list");
      setReservations(data || []);
      setErr("");
    } catch (e) {
      setErr("Chargement impossible : " + e.message);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    if (isDemoMode) return;
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [load]);

  async function marquer(reservation, statut) {
    if (isDemoMode) return;
    setBusyId(reservation.id);
    try {
      await callSecureData("offre_reservation_marquer", { reservationId: reservation.id, statut });
      setReservations(prev => prev.filter(r => r.id !== reservation.id));
    } catch (e) {
      setErr("Échec : " + e.message);
    }
    setBusyId(null);
  }

  if (isDemoMode) return (
    <div style={{ fontSize: 12, color: "#94a3b8", padding: "12px 0" }}>File d'attente non disponible en mode démo.</div>
  );
  if (loading) return <div style={{ fontSize: 12, color: "#94a3b8", padding: "12px 0" }}>Chargement…</div>;

  return (
    <div>
      {err && <div style={{ fontSize: 12, color: "#dc2626", marginBottom: 10 }}>⚠️ {err}</div>}
      {reservations.length === 0 ? (
        <div style={{ fontSize: 12, color: "#94a3b8", padding: "12px 0" }}>Aucune commande en attente de retrait.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {reservations.map(r => (
            <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", border: "1.5px solid #e0e7ff", borderRadius: 10, background: "#f8faff" }}>
              <div style={{ fontSize: 20 }}>{r.offres_stories?.emoji || "🎁"}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 13 }}>{r.offres_stories?.titre || "Offre"} {r.quantite > 1 && <span style={{ color: "#64748b" }}>× {r.quantite}</span>}</div>
                <div style={{ fontSize: 11, color: "#64748b" }}>
                  Patient {r.code_patient}
                  {r.offres_stories?.prix != null && ` · ${r.offres_stories.prix} € × ${r.quantite} = ${(r.offres_stories.prix * r.quantite).toFixed(2)} €`}
                  {" · encaissement au comptoir"}
                </div>
              </div>
              <button onClick={() => marquer(r, "recuperee")} disabled={busyId === r.id}
                style={{ padding: "6px 10px", border: "none", borderRadius: 8, background: "#16a34a", color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                {busyId === r.id ? "…" : "✅ Récupérée"}
              </button>
              <button onClick={() => marquer(r, "annulee")} disabled={busyId === r.id}
                style={{ padding: "6px 10px", border: "1.5px solid #fee2e2", borderRadius: 8, background: "#fff5f5", color: "#dc2626", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export { OffreReservationsPanel };
export default OffreReservationsPanel;
