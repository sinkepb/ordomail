// Nouveau composant (26/07/2026) — écran titulaire pour le catalogue de stories
// géré par OrdoMail Business (stories_content) : chaque pharmacien peut voir
// l'engagement de ses patients par story (vues, temps passé, réponses quiz) et
// choisir individuellement lesquelles diffuser dans sa salle d'attente.
import { useState, useEffect } from "react";
import { isDemoMode, fetchPharmacieStories, fetchStoryMetrics, updatePharmacieStorySelection } from "../supabase.js";

const TYPE_LABELS = { info: "Info", conseil: "Conseil", quiz: "Quiz" };
const TYPE_COLORS = { info: "#065f46", conseil: "#1a3a6e", quiz: "#4c1d95" };

function formatDuree(ms) {
  if (!ms) return "—";
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.round(s / 60)}min`;
}

function aggregate(events, storyId) {
  const key = `content-${storyId}`;
  const relevant = events.filter(e => e.story_id === key);
  const views = relevant.filter(e => e.event === "view");
  const avgMs = views.length ? Math.round(views.reduce((a, b) => a + (b.duree_ms || 0), 0) / views.length) : 0;
  const quizAnswers = relevant.filter(e => e.event === "quiz_answer");
  const correct = quizAnswers.filter(e => e.meta?.correct).length;
  return { vues: views.length, dureeMoyenne: avgMs, reponses: quizAnswers.length, correct };
}

function StoriesSection({ pharmacie }) {
  const [stories, setStories] = useState([]);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [togglingId, setTogglingId] = useState(null);

  useEffect(() => {
    if (!pharmacie?.id) return;
    if (isDemoMode) { setLoading(false); return; }
    Promise.all([
      fetchPharmacieStories(pharmacie.id),
      fetchStoryMetrics(pharmacie.id),
    ]).then(([storiesData, eventsData]) => {
      setStories(storiesData || []);
      setEvents(eventsData || []);
      setLoading(false);
    });
  }, [pharmacie?.id]);

  async function toggle(story) {
    const nextActif = !(story.pharmacie_actif !== false);
    setTogglingId(story.id);
    setStories(prev => prev.map(s => s.id === story.id ? { ...s, pharmacie_actif: nextActif } : s));
    const { ok } = await updatePharmacieStorySelection(pharmacie.id, story.id, nextActif);
    if (!ok) {
      // Échec serveur — annuler l'affichage optimiste
      setStories(prev => prev.map(s => s.id === story.id ? { ...s, pharmacie_actif: !nextActif } : s));
    }
    setTogglingId(null);
  }

  if (isDemoMode) {
    return (
      <div style={{ background: "#fff", borderRadius: 14, padding: 28, boxShadow: "0 2px 10px rgba(0,0,0,0.07)", textAlign: "center" }}>
        <div style={{ fontSize: 40, marginBottom: 10 }}>📊</div>
        <div style={{ fontWeight: 800, fontSize: 16, color: "#1a1a1a", marginBottom: 6 }}>Stories & engagement</div>
        <div style={{ fontSize: 13, color: "#64748b" }}>Non disponible en mode démo — nécessite un compte pharmacie réel.</div>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ background: "#fff", borderRadius: 14, padding: 28, boxShadow: "0 2px 10px rgba(0,0,0,0.07)", textAlign: "center", color: "#94a3b8", fontSize: 13 }}>
        Chargement…
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ background: "#fff", borderRadius: 14, padding: 20, boxShadow: "0 2px 10px rgba(0,0,0,0.07)" }}>
        <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 4 }}>📊 Stories & engagement</div>
        <div style={{ fontSize: 12, color: "#64748b" }}>
          Le catalogue (conseils santé, quiz) est géré par OrdoMail Business. Désactivez ici celles que vous ne
          souhaitez pas diffuser dans votre salle d'attente — les autres restent affichées par défaut.
        </div>
      </div>

      {stories.length === 0 && (
        <div style={{ background: "#fff", borderRadius: 14, padding: 28, boxShadow: "0 2px 10px rgba(0,0,0,0.07)", textAlign: "center", color: "#94a3b8", fontSize: 13 }}>
          Aucune story disponible dans le catalogue pour le moment.
        </div>
      )}

      {stories.map(s => {
        const stats = aggregate(events, s.id);
        const actif = s.pharmacie_actif !== false;
        return (
          <div key={s.id} style={{ background: "#fff", borderRadius: 14, padding: "16px 18px", boxShadow: "0 2px 10px rgba(0,0,0,0.07)", display: "flex", alignItems: "center", gap: 14, opacity: actif ? 1 : 0.55 }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: `${TYPE_COLORS[s.type] || "#64748b"}18`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>
              {s.emoji || "💡"}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <span style={{ fontWeight: 700, fontSize: 14, color: "#1a1a1a" }}>{s.titre || "(sans titre)"}</span>
                <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 20, background: `${TYPE_COLORS[s.type] || "#64748b"}18`, color: TYPE_COLORS[s.type] || "#64748b" }}>
                  {TYPE_LABELS[s.type] || s.type}
                </span>
              </div>
              <div style={{ fontSize: 12, color: "#64748b", display: "flex", gap: 14, flexWrap: "wrap" }}>
                <span>👁️ {stats.vues} vue{stats.vues > 1 ? "s" : ""}</span>
                <span>⏱️ {formatDuree(stats.dureeMoyenne)} en moyenne</span>
                {s.type === "quiz" && <span>✅ {stats.correct}/{stats.reponses} bonnes réponses</span>}
              </div>
            </div>
            <button
              onClick={() => toggle(s)}
              disabled={togglingId === s.id}
              style={{
                padding: "7px 14px", borderRadius: 8, border: "none", cursor: togglingId === s.id ? "default" : "pointer",
                fontFamily: "inherit", fontWeight: 700, fontSize: 12, flexShrink: 0,
                background: actif ? "#14532d" : "#450a0a", color: actif ? "#86efac" : "#fca5a5",
                opacity: togglingId === s.id ? 0.6 : 1,
              }}>
              {actif ? "✅ Diffusée" : "❌ Désactivée"}
            </button>
          </div>
        );
      })}
    </div>
  );
}

export { StoriesSection };
export default StoriesSection;
