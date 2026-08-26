// Onglet Purge — backoffice OrdoMail Business (25/08/2026).
// Regroupe : durée de rétention, fréquence du job pg_cron, déclenchement
// manuel (avec confirmation), et historique des purges (lu depuis `alerts`,
// déjà alimentée par purgeLogic.ts — pas de table dédiée).
// Anciennement une section de RgpdPanel.jsx, sortie en onglet à part entière
// à la demande de l'utilisateur.
import { useState, useEffect } from "react";

const FREQ_LABELS = {
  hourly:   "Toutes les heures",
  every6h:  "Toutes les 6 heures",
  every12h: "Toutes les 12 heures",
  daily:    "Une fois par jour (3h du matin)",
  weekly:   "Une fois par semaine (dimanche 3h)",
};

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

function PurgeAdmin({ adminToken } = {}) {
  const [days, setDays]               = useState("");
  const [currentRetention, setCurrentRetention] = useState(null);
  const [freqKey, setFreqKey]         = useState("daily");
  const [currentFreq, setCurrentFreq] = useState(null);
  const [loading, setLoading]         = useState(true);
  const [saving, setSaving]           = useState(false);
  const [savingFreq, setSavingFreq]   = useState(false);
  const [running, setRunning]         = useState(false);
  const [msg, setMsg]                 = useState(null);
  const [history, setHistory]         = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const [{ data: retention }, { data: schedule }] = await Promise.all([
        callSecureData("admin_retention_get", {}, adminToken),
        callSecureData("admin_purge_schedule_get", {}, adminToken),
      ]);
      setCurrentRetention(retention);
      setDays(retention?.ordonnances_retention_days ? String(retention.ordonnances_retention_days) : "");
      setCurrentFreq(schedule);
      if (schedule?.presetKey) setFreqKey(schedule.presetKey);
    } catch (e) {
      setMsg({ ok: false, text: e.message });
    }
    setLoading(false);
  }

  async function loadHistory() {
    setHistoryLoading(true);
    try {
      const { data } = await callSecureData("admin_alerts", { includeResolved: true, limit: 50 }, adminToken);
      setHistory((data || []).filter(a => a.source === "purge-ordonnances"));
    } catch { /* historique non-bloquant */ }
    setHistoryLoading(false);
  }

  useEffect(() => { load(); loadHistory(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function saveDays() {
    setSaving(true); setMsg(null);
    try {
      const value = days.trim() === "" ? null : Number(days);
      if (value !== null && (!Number.isInteger(value) || value <= 0)) {
        setMsg({ ok: false, text: "Entrez un nombre entier de jours positif, ou laissez vide pour désactiver la purge." });
        setSaving(false);
        return;
      }
      await callSecureData("admin_retention_set", { days: value, updatedBy: "backoffice" }, adminToken);
      setMsg({ ok: true, text: value ? `Rétention fixée à ${value} jours.` : "Purge automatique désactivée." });
      await load();
    } catch (e) {
      setMsg({ ok: false, text: e.message });
    }
    setSaving(false);
  }

  async function saveFreq() {
    setSavingFreq(true); setMsg(null);
    try {
      await callSecureData("admin_purge_schedule_set", { presetKey: freqKey }, adminToken);
      setMsg({ ok: true, text: `Fréquence mise à jour : ${FREQ_LABELS[freqKey]}.` });
      await load();
    } catch (e) {
      setMsg({ ok: false, text: e.message });
    }
    setSavingFreq(false);
  }

  async function runNow() {
    const label = currentRetention?.ordonnances_retention_days
      ? `Purger maintenant toutes les ordonnances déposées il y a plus de ${currentRetention.ordonnances_retention_days} jour(s) ?\n\nCette action est irréversible.`
      : "Aucune durée de rétention n'est configurée — la purge ne supprimera rien. Continuer quand même ?";
    if (!window.confirm(label)) return;
    setRunning(true); setMsg(null);
    try {
      const { data } = await callSecureData("admin_purge_run", {}, adminToken);
      if (data.skipped) {
        setMsg({ ok: false, text: `Rien à purger : ${data.reason}` });
      } else {
        setMsg({ ok: true, text: `✅ ${data.deleted} ordonnance(s) supprimée(s) (rétention ${data.retentionDays} jours).` });
      }
      await loadHistory();
    } catch (e) {
      setMsg({ ok: false, text: e.message });
    }
    setRunning(false);
  }

  const cardStyle = { background: "#1e293b", border: "1px solid #334155", borderRadius: 12, padding: 20, marginBottom: 20 };
  const selectStyle = { padding: "9px 12px", background: "#0f172a", border: "1px solid #334155", borderRadius: 8, color: "#fff", fontSize: 14, outline: "none", fontFamily: "inherit" };

  return (
    <div style={{ maxWidth: 800, margin: "0 auto" }}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontWeight: 800, fontSize: 20, color: "#fff" }}>🗑️ Purge des ordonnances</div>
        <div style={{ fontSize: 13, color: "#64748b", marginTop: 2 }}>Rétention, fréquence du job automatique, déclenchement manuel et historique</div>
      </div>

      {loading ? (
        <div style={{ color: "#64748b", fontSize: 13 }}>Chargement…</div>
      ) : (
        <>
          {/* ── Rétention ── */}
          <div style={cardStyle}>
            <div style={{ fontWeight: 800, fontSize: 15, color: "#fff", marginBottom: 6 }}>Durée de rétention</div>
            <div style={{ fontSize: 12, color: "#64748b", marginBottom: 16, lineHeight: 1.6 }}>
              Durée après laquelle une ordonnance (fichier + métadonnées) est supprimée automatiquement. Laissez vide pour désactiver la purge — aucune suppression n'a lieu tant qu'une durée n'est pas définie.
            </div>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <input type="number" min="1" value={days} onChange={e => setDays(e.target.value)}
                placeholder="ex. 3"
                style={{ ...selectStyle, width: 140 }}/>
              <span style={{ fontSize: 12, color: "#64748b" }}>jours</span>
              <button onClick={saveDays} disabled={saving}
                style={{ marginLeft: "auto", padding: "9px 18px", border: "none", borderRadius: 8, background: saving ? "#1e3a5f" : "#3b82f6", color: "#fff", fontWeight: 700, fontSize: 13, cursor: saving ? "wait" : "pointer", fontFamily: "inherit" }}>
                {saving ? "…" : "Enregistrer"}
              </button>
            </div>
            <div style={{ fontSize: 11, color: "#475569", marginTop: 10 }}>
              {currentRetention?.ordonnances_retention_days
                ? `Actuellement : ${currentRetention.ordonnances_retention_days} jours (dernière modification ${currentRetention.updated_at ? new Date(currentRetention.updated_at).toLocaleString("fr-FR") : "—"})`
                : "Actuellement : purge désactivée"}
            </div>
          </div>

          {/* ── Fréquence ── */}
          <div style={cardStyle}>
            <div style={{ fontWeight: 800, fontSize: 15, color: "#fff", marginBottom: 6 }}>Fréquence du job automatique</div>
            <div style={{ fontSize: 12, color: "#64748b", marginBottom: 16, lineHeight: 1.6 }}>
              À quelle fréquence la purge tourne automatiquement, indépendamment d'un déclenchement manuel.
            </div>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <select value={freqKey} onChange={e => setFreqKey(e.target.value)} style={{ ...selectStyle, flex: 1 }}>
                {Object.entries(FREQ_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
              <button onClick={saveFreq} disabled={savingFreq}
                style={{ padding: "9px 18px", border: "none", borderRadius: 8, background: savingFreq ? "#1e3a5f" : "#3b82f6", color: "#fff", fontWeight: 700, fontSize: 13, cursor: savingFreq ? "wait" : "pointer", fontFamily: "inherit" }}>
                {savingFreq ? "…" : "Enregistrer"}
              </button>
            </div>
            <div style={{ fontSize: 11, color: "#475569", marginTop: 10 }}>
              {currentFreq?.presetKey
                ? `Actuellement : ${FREQ_LABELS[currentFreq.presetKey]}`
                : currentFreq?.schedule
                ? `Actuellement : expression cron personnalisée (${currentFreq.schedule})`
                : "Job introuvable"}
            </div>
          </div>

          {/* ── Déclenchement manuel ── */}
          <div style={cardStyle}>
            <div style={{ fontWeight: 800, fontSize: 15, color: "#fff", marginBottom: 6 }}>Lancer maintenant</div>
            <div style={{ fontSize: 12, color: "#64748b", marginBottom: 16, lineHeight: 1.6 }}>
              Déclenche immédiatement une purge avec la durée de rétention configurée ci-dessus, sans attendre le prochain passage automatique.
            </div>
            <button onClick={runNow} disabled={running}
              style={{ padding: "10px 20px", border: "none", borderRadius: 8, background: running ? "#7f1d1d" : "#dc2626", color: "#fff", fontWeight: 800, fontSize: 13, cursor: running ? "wait" : "pointer", fontFamily: "inherit" }}>
              {running ? "Purge en cours…" : "🗑️ Lancer la purge maintenant"}
            </button>
          </div>

          {msg && (
            <div style={{ marginBottom: 20, fontSize: 13, fontWeight: 600, padding: "10px 14px", borderRadius: 8, background: msg.ok ? "rgba(34,197,94,0.15)" : "rgba(220,38,38,0.15)", color: msg.ok ? "#4ade80" : "#f87171" }}>
              {msg.text}
            </div>
          )}

          {/* ── Historique ── */}
          <div style={cardStyle}>
            <div style={{ fontWeight: 800, fontSize: 15, color: "#fff", marginBottom: 14 }}>Historique</div>
            {historyLoading ? (
              <div style={{ color: "#64748b", fontSize: 13 }}>Chargement…</div>
            ) : history.length === 0 ? (
              <div style={{ color: "#64748b", fontSize: 13, textAlign: "center", padding: "16px 0" }}>Aucune purge exécutée pour l'instant.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {history.map(h => (
                  <div key={h.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, background: "#0f172a", border: "1px solid #334155", borderRadius: 8, padding: "10px 14px" }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, color: "#e2e8f0" }}>{h.message}</div>
                      <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>{new Date(h.created_at).toLocaleString("fr-FR")}</div>
                    </div>
                    <div style={{ flexShrink: 0, fontSize: 20, fontWeight: 900, color: "#3b82f6" }}>
                      {h.meta?.count ?? "—"}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export { PurgeAdmin };
