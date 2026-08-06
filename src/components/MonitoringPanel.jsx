// Panneau Monitoring — backoffice OrdoMail Business (07/08/2026).
// Affiche les alertes écrites par les edge functions critiques (stripe-webhook,
// submit-ordonnance, snapshot-metriques — voir _shared/alert.ts) via secure-data
// (resources admin_alerts / admin_alerts_resolve).
//
// ⚠️ Ce n'est PAS un abonnement Realtime (postgres_changes) : la table `alerts`
// n'accorde délibérément aucun accès à anon/authenticated (voir la migration
// 20260807_alerts_monitoring.sql) — le backoffice n'a pas de session Supabase
// Auth réelle, RLS ne pourrait pas distinguer un admin d'un simple porteur de
// la clé anon publique. On rafraîchit donc par sondage court (20s) tant que ce
// panneau est ouvert — quasi temps réel côté opérateur, sans exposer la table.
import { useState, useEffect, useRef } from "react";

async function callSecureData(resource, params, adminToken) {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  const res = await fetch(`${supabaseUrl}/functions/v1/secure-data`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": supabaseKey,
      "Authorization": `Bearer ${adminToken || ""}`,
    },
    body: JSON.stringify({ resource, params }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error || `secure-data ${resource} : erreur ${res.status}`);
  return body;
}

const SEVERITY = {
  critical: { label: "Critique", color: "#dc2626", bg: "#fef2f2", border: "#fecaca", icon: "🚨" },
  warning:  { label: "Avertissement", color: "#b45309", bg: "#fffbeb", border: "#fde68a", icon: "⚠️" },
  info:     { label: "Info", color: "#0369a1", bg: "#f0f9ff", border: "#bae6fd", icon: "ℹ️" },
};

const POLL_MS = 20000;

function MonitoringPanel({ adminToken } = {}) {
  const [alerts, setAlerts]           = useState([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState("");
  const [includeResolved, setInclude] = useState(false);
  const [resolvingId, setResolvingId] = useState(null);
  const pollRef = useRef(null);

  async function load() {
    setError("");
    try {
      const { data } = await callSecureData("admin_alerts", { includeResolved }, adminToken);
      setAlerts(data || []);
    } catch(e) {
      setError(e.message);
    }
    setLoading(false);
  }

  useEffect(() => {
    setLoading(true);
    load();
    pollRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(pollRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [includeResolved]);

  async function resolveAlert(id) {
    setResolvingId(id);
    try {
      await callSecureData("admin_alerts_resolve", { alertId: id }, adminToken);
      setAlerts(prev => includeResolved
        ? prev.map(a => a.id === id ? { ...a, resolved: true, resolved_at: new Date().toISOString() } : a)
        : prev.filter(a => a.id !== id));
    } catch(e) {
      setError(e.message);
    }
    setResolvingId(null);
  }

  const critCount = alerts.filter(a => a.severity === "critical" && !a.resolved).length;

  return (
    <div>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16 }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <div style={{ fontWeight:800, fontSize:15, color:"#fff" }}>🔔 Monitoring</div>
          {critCount > 0 && (
            <span style={{ fontSize:11, fontWeight:800, padding:"3px 10px", borderRadius:20, background:"#dc2626", color:"#fff" }}>
              {critCount} critique{critCount>1?"s":""}
            </span>
          )}
          <span style={{ fontSize:11, color:"#475569" }}>actualisation toutes les 20s</span>
        </div>
        <div style={{ display:"flex", gap:8, alignItems:"center" }}>
          <label style={{ display:"flex", alignItems:"center", gap:6, fontSize:12, color:"#94a3b8", cursor:"pointer" }}>
            <input type="checkbox" checked={includeResolved} onChange={e=>setInclude(e.target.checked)} />
            Afficher résolues
          </label>
          <button onClick={load} style={{ padding:"7px 14px", border:"1px solid #334155", borderRadius:8, background:"#1e293b", color:"#64748b", fontSize:12, cursor:"pointer", fontFamily:"inherit" }}>
            🔄 Actualiser
          </button>
        </div>
      </div>

      {error && (
        <div style={{ background:"#450a0a", border:"1px solid #7f1d1d", borderRadius:8, padding:"10px 14px", color:"#fca5a5", fontSize:13, marginBottom:14 }}>
          {error}
        </div>
      )}

      {loading && <div style={{ textAlign:"center", padding:48, color:"#64748b" }}>⏳ Chargement…</div>}

      {!loading && alerts.length === 0 && !error && (
        <div style={{ textAlign:"center", padding:48, color:"#4ade80", fontSize:14 }}>
          ✅ Aucune alerte {includeResolved ? "" : "active"} — tout va bien.
        </div>
      )}

      <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
        {alerts.map(a => {
          const sev = SEVERITY[a.severity] || SEVERITY.info;
          return (
            <div key={a.id} style={{
              background:"#1e293b", border:`1px solid ${a.resolved ? "#334155" : sev.color+"55"}`,
              borderRadius:12, padding:"12px 16px", opacity: a.resolved ? 0.55 : 1,
            }}>
              <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:12 }}>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:5, flexWrap:"wrap" }}>
                    <span style={{ fontSize:10, fontWeight:800, padding:"2px 8px", borderRadius:20, background:sev.bg, color:sev.color }}>
                      {sev.icon} {sev.label}
                    </span>
                    <span style={{ fontSize:10, fontWeight:700, color:"#64748b", fontFamily:"monospace" }}>{a.source}</span>
                    <span style={{ fontSize:10, color:"#475569" }}>{new Date(a.created_at).toLocaleString("fr-FR")}</span>
                    {a.resolved && <span style={{ fontSize:10, color:"#4ade80" }}>✓ résolue</span>}
                  </div>
                  <div style={{ fontSize:13, color:"#e2e8f0", lineHeight:1.5 }}>{a.message}</div>
                </div>
                {!a.resolved && (
                  <button onClick={()=>resolveAlert(a.id)} disabled={resolvingId===a.id}
                    style={{ flexShrink:0, padding:"6px 12px", border:"1px solid #334155", borderRadius:8, background:"#0f172a", color:"#94a3b8", fontSize:11, fontWeight:700, cursor:resolvingId===a.id?"wait":"pointer", fontFamily:"inherit" }}>
                    {resolvingId===a.id ? "…" : "Marquer résolue"}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export { MonitoringPanel };
