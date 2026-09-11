// Panneau Rappels & SMS — backoffice OrdoMail Business (05/09/2026).
// SMS réel depuis le 11/09/2026 (sender OVH "SISEO" validé) — ce panneau
// garde son objectif d'origine (visibilité sur le volume avant que ça
// devienne une facture, retour direct de l'utilisateur : "le coût
// supplémentaire des sms que je ne peux maîtriser") mais suit désormais
// aussi le quota mensuel Performance (200 SMS inclus + packs de 100, voir
// _shared/smsQuota.ts) via admin_sms_consommation, en plus des tendances
// réseau d'admin_rappels_metrics (qui exclut déjà les envois de test par
// email du comptage, meta.canal === "email_test").
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
  const [quotas, setQuotas]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");

  async function load() {
    setError("");
    try {
      const [{ data }, quotasRes] = await Promise.all([
        callSecureData("admin_rappels_metrics", {}, adminToken),
        callSecureData("admin_sms_consommation", {}, adminToken),
      ]);
      setData(data);
      setQuotas(quotasRes.data || []);
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

      <div style={{ fontSize:12, fontWeight:700, color:"#94a3b8", margin:"24px 0 10px", textTransform:"uppercase", letterSpacing:0.5 }}>
        Quota SMS mensuel — plan Performance (200 inclus + packs de 100 à 10 € TTC)
      </div>

      {quotas.length === 0 && (
        <div style={{ textAlign:"center", padding:32, color:"#64748b", fontSize:13, background:"#1e293b", border:"1px solid #334155", borderRadius:12 }}>
          Aucune pharmacie Performance n'a encore envoyé de SMS ce mois-ci.
        </div>
      )}

      <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
        {quotas.map(q => {
          const pct = q.quotaTotal > 0 ? Math.min(100, Math.round((q.smsEnvoyesMoisCourant / q.quotaTotal) * 100)) : 0;
          const overQuota = q.depassement > 0;
          return (
            <div key={q.pharmacieId} style={{ background:"#1e293b", border:"1px solid #334155", borderRadius:10, padding:"11px 16px" }}>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8 }}>
                <span style={{ fontWeight:700, fontSize:13.5, color:"#fff" }}>{q.nom}</span>
                <span style={{ fontSize:12.5, fontWeight:800, color: overQuota ? "#f87171" : "#4ade80" }}>
                  {q.smsEnvoyesMoisCourant} / {q.quotaTotal} SMS
                </span>
              </div>
              <div style={{ height:6, borderRadius:20, background:"#334155", overflow:"hidden", marginBottom:6 }}>
                <div style={{ height:"100%", width:`${pct}%`, background: overQuota ? "#f87171" : "#4ade80", borderRadius:20 }} />
              </div>
              <div style={{ fontSize:11, color:"#64748b" }}>
                {q.packsAchetesMoisCourant > 0 && <>{q.packsAchetesMoisCourant / 100} pack{q.packsAchetesMoisCourant > 100 ? "s" : ""} acheté{q.packsAchetesMoisCourant > 100 ? "s" : ""} ce mois · </>}
                {overQuota ? <span style={{ color:"#f87171", fontWeight:700 }}>{q.depassement} SMS au-delà du quota</span> : `${q.quotaRestant} SMS restants`}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export { RappelsMetricsAdmin };
