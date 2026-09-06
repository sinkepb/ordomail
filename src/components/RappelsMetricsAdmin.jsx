// Panneau Rappels & SMS — backoffice OrdoMail Business (05/09/2026).
// Le SMS des rappels de renouvellement est encore mocké (voir
// supabase/functions/_shared/rappelLogic.ts), mais son coût par envoi sera
// incontrôlé une fois activé (retour direct de l'utilisateur : "le coût
// supplémentaire des sms que je ne peux maîtriser lors des rappels"). Ce
// panneau donne une visibilité sur le volume AVANT que ça devienne une
// facture — tendance réseau + détail par pharmacie pour repérer une grosse
// consommatrice avant, pas après. Ressource : admin_rappels_metrics
// (secure-data-admin), qui exclut déjà les envois de test par email du
// comptage SMS (meta.canal === "email_test").
import { useState, useEffect } from "react";

async function callSecureData(resource, params, adminToken) {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  const res = await fetch(`${supabaseUrl}/functions/v1/secure-data-admin`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": supabaseKey,
      "Authorization": `Bearer ${adminToken || ""}`,
    },
    body: JSON.stringify({ resource, params }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error || `secure-data-admin ${resource} : erreur ${res.status}`);
  return body;
}

const PLAN_LABEL = { starter: "Essentiel", standard: "Fluidité", pro: "Performance" };

function RappelsMetricsAdmin({ adminToken } = {}) {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");

  async function load() {
    setError("");
    try {
      const { data } = await callSecureData("admin_rappels_metrics", {}, adminToken);
      setData(data);
    } catch(e) {
      setError(e.message);
    }
    setLoading(false);
  }

  useEffect(() => {
    setLoading(true);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) return <div style={{ textAlign:"center", padding:48, color:"#64748b" }}>⏳ Chargement…</div>;

  if (error) return (
    <div style={{ background:"#450a0a", border:"1px solid #7f1d1d", borderRadius:8, padding:"10px 14px", color:"#fca5a5", fontSize:13 }}>
      {error}
    </div>
  );

  const g = data?.global || {};
  const parPharmacie = data?.parPharmacie || [];

  const kpis = [
    { label: "SMS aujourd'hui",  value: g.smsJour, sub: "envois cycle auto",   icon: "📨", color: "#60a5fa" },
    { label: "SMS 7 jours",      value: g.sms7j,   sub: "tendance courte",     icon: "📈", color: "#60a5fa" },
    { label: "SMS 30 jours",     value: g.sms30j,  sub: "volume mensuel",      icon: "💸", color: "#fbbf24" },
    { label: "Rappels actifs",   value: g.rappelsActifs, sub: `sur ${g.rappelsTotal||0} au total`, icon: "🔔", color: "#a78bfa" },
    { label: "Taux de réponse",  value: `${g.tauxReponse||0}%`, sub: "patient / SMS envoyé (90j)", icon: "✅", color: "#4ade80" },
    { label: "Échecs d'envoi",   value: g.echecs90j, sub: "sur 90 jours",      icon: "⚠️", color: g.echecs90j > 0 ? "#f87171" : "#4ade80" },
  ];

  return (
    <div>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16 }}>
        <div>
          <div style={{ fontWeight:800, fontSize:15, color:"#fff" }}>🔔 Rappels &amp; SMS</div>
          <div style={{ fontSize:11, color:"#64748b", marginTop:2 }}>SMS encore mocké — ce panneau suit le volume avant l'activation réelle, pour dimensionner le coût à venir.</div>
        </div>
        <button onClick={load} style={{ padding:"7px 14px", border:"1px solid #334155", borderRadius:8, background:"#1e293b", color:"#64748b", fontSize:12, cursor:"pointer", fontFamily:"inherit" }}>
          🔄 Actualiser
        </button>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))", gap:12, marginBottom:24 }}>
        {kpis.map(k => (
          <div key={k.label} style={{ background:"#1e293b", border:"1px solid #334155", borderRadius:12, padding:"14px 16px" }}>
            <div style={{ fontSize:18, marginBottom:4 }}>{k.icon}</div>
            <div style={{ fontSize:22, fontWeight:900, color:k.color }}>{k.value ?? 0}</div>
            <div style={{ fontSize:10, color:"#64748b", fontWeight:700, textTransform:"uppercase", letterSpacing:0.5 }}>{k.label}</div>
            <div style={{ fontSize:10, color:"#475569" }}>{k.sub}</div>
          </div>
        ))}
      </div>

      <div style={{ fontSize:12, fontWeight:700, color:"#94a3b8", marginBottom:10, textTransform:"uppercase", letterSpacing:0.5 }}>
        Consommation par pharmacie (90 derniers jours)
      </div>

      {parPharmacie.length === 0 && (
        <div style={{ textAlign:"center", padding:32, color:"#64748b", fontSize:13, background:"#1e293b", border:"1px solid #334155", borderRadius:12 }}>
          Aucun rappel actif ni envoi sur la période.
        </div>
      )}

      <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
        {parPharmacie.map(p => (
          <div key={p.pharmacieId} style={{ background:"#1e293b", border:"1px solid #334155", borderRadius:10, padding:"11px 16px", display:"flex", alignItems:"center", gap:14 }}>
            <div style={{ width:34, height:34, borderRadius:9, background:p.couleur, display:"flex", alignItems:"center", justifyContent:"center", fontSize:15, flexShrink:0 }}>💊</div>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                <span style={{ fontWeight:700, fontSize:13.5, color:"#fff" }}>{p.nom}</span>
                <span style={{ fontSize:10, fontWeight:700, padding:"2px 8px", borderRadius:20, background:"#334155", color:"#94a3b8" }}>{PLAN_LABEL[p.plan] || p.plan}</span>
              </div>
              <div style={{ fontSize:11, color:"#64748b", marginTop:2 }}>
                {p.rappelsActifs} rappel{p.rappelsActifs>1?"s":""} actif{p.rappelsActifs>1?"s":""}
                {p.dernierEnvoi && <> · dernier envoi {new Date(p.dernierEnvoi).toLocaleDateString("fr-FR")}</>}
              </div>
            </div>
            <div style={{ display:"flex", gap:18, flexShrink:0 }}>
              <div style={{ textAlign:"center" }}>
                <div style={{ fontSize:16, fontWeight:900, color:"#60a5fa" }}>{p.sms7j}</div>
                <div style={{ fontSize:9, color:"#475569" }}>7j</div>
              </div>
              <div style={{ textAlign:"center" }}>
                <div style={{ fontSize:16, fontWeight:900, color:"#fbbf24" }}>{p.sms30j}</div>
                <div style={{ fontSize:9, color:"#475569" }}>30j</div>
              </div>
              <div style={{ textAlign:"center" }}>
                <div style={{ fontSize:16, fontWeight:900, color:"#e2e8f0" }}>{p.sms90j}</div>
                <div style={{ fontSize:9, color:"#475569" }}>90j</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export { RappelsMetricsAdmin };
