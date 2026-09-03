// OrdoMail — catalogue de modèles d'offres saisonnières (03/09/2026, "zéro
// design" : activer un modèle ne demande aucune saisie, juste un clic).
import { useState, useEffect } from "react";
import { callSecureData, isDemoMode } from "../supabase.js";

const SAISON_LABELS = { hiver: "❄️ Hiver", printemps: "🌸 Printemps", ete: "☀️ Été", automne: "🍂 Automne", toute_annee: "🗓️ Toute l'année" };
const SAISON_ORDER = ["hiver", "printemps", "ete", "automne", "toute_annee"];

function OffreTemplatesPanel({ onChanged }) {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [err, setErr] = useState("");

  async function load() {
    if (isDemoMode) { setLoading(false); return; }
    setLoading(true); setErr("");
    try {
      const data = await callSecureData("offre_templates_list");
      setTemplates(data || []);
    } catch (e) {
      setErr("Chargement du catalogue impossible : " + e.message);
    }
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function toggle(template) {
    if (isDemoMode) return;
    setBusyId(template.id); setErr("");
    try {
      await callSecureData("offre_template_toggle", { templateId: template.id, on: !template.pharmacie_actif });
      await load();
      onChanged?.();
    } catch (e) {
      setErr("Échec : " + e.message);
    }
    setBusyId(null);
  }

  if (isDemoMode) return (
    <div style={{ fontSize: 12, color: "#94a3b8", padding: "12px 0" }}>Catalogue de modèles non disponible en mode démo.</div>
  );
  if (loading) return <div style={{ fontSize: 12, color: "#94a3b8", padding: "12px 0" }}>Chargement du catalogue…</div>;

  const bySaison = SAISON_ORDER.map(s => ({ saison: s, items: templates.filter(t => t.saison === s) })).filter(g => g.items.length);

  return (
    <div>
      {err && <div style={{ fontSize: 12, color: "#dc2626", marginBottom: 10 }}>⚠️ {err}</div>}
      {bySaison.map(({ saison, items }) => (
        <div key={saison} style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#64748b", marginBottom: 8 }}>{SAISON_LABELS[saison] || saison}</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 8 }}>
            {items.map(t => (
              <button key={t.id} onClick={() => toggle(t)} disabled={busyId === t.id}
                style={{
                  textAlign: "left", padding: "10px 12px", borderRadius: 10, cursor: busyId === t.id ? "default" : "pointer", fontFamily: "inherit",
                  border: `1.5px solid ${t.pharmacie_actif ? t.couleur : "#e0e7ff"}`,
                  background: t.pharmacie_actif ? `${t.couleur}12` : "#fff",
                  opacity: busyId === t.id ? 0.6 : 1,
                }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                  <span style={{ fontSize: 16 }}>{t.emoji}</span>
                  {t.badge && <span style={{ fontSize: 9, background: "#fef3c7", color: "#92400e", borderRadius: 20, padding: "1px 6px", fontWeight: 800 }}>{t.badge}</span>}
                </div>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#1a1a1a", marginBottom: 4 }}>{t.titre}</div>
                <div style={{ fontSize: 10, fontWeight: 800, color: t.pharmacie_actif ? "#15803d" : "#94a3b8" }}>
                  {busyId === t.id ? "…" : t.pharmacie_actif ? "✓ Activé" : "Activer"}
                </div>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export { OffreTemplatesPanel };
export default OffreTemplatesPanel;
