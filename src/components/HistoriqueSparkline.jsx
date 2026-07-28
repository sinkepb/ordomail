// Extrait de AdminPage.jsx (phase 4) — composant autonome (props + état local
// uniquement). Découpage des gros fichiers, voir DEPLOIEMENT_PHASE2.md/PHASE4.md.
import { useState, useEffect } from "react";
import { fetchHistoriqueMetriques } from "../supabase.js";

function HistoriqueSparkline({ pharmacieId }) {
  const [data,   setData]   = useState([]);
  const [metric, setMetric] = useState("ordos_jour");
  const [period, setPeriod] = useState(30);
  const [loading, setLoading] = useState(true);

  const METRICS = [
    { id:"ordos_jour",       label:"Ordos/jour",      color:"#60a5fa" },
    { id:"taux_traitement",  label:"Taux traitement",  color:"#4ade80" },
    { id:"delai_moyen_min", label:"Délai moyen (min)", color:"#f87171" },
    { id:"score_activite",   label:"Score activité",   color:"#a78bfa" },
    { id:"canal_qr_pct",     label:"% QR code",        color:"#fbbf24" },
  ];

  useEffect(() => {
    setLoading(true);
    fetchHistoriqueMetriques(pharmacieId, period).then(d => {
      setData(d);
      setLoading(false);
    });
  }, [pharmacieId, period]);

  const currentMetric = METRICS.find(m => m.id === metric);
  const values = data.map(d => d[metric] || 0);
  const maxVal  = Math.max(...values, 1);
  const minVal  = Math.min(...values, 0);
  const range   = maxVal - minVal || 1;
  const avg     = values.length ? Math.round(values.reduce((a,b)=>a+b,0)/values.length) : 0;
  const last    = values[values.length-1] || 0;
  const trend   = values.length > 1 ? last - values[values.length-2] : 0;

  // SVG sparkline
  const W = 600, H = 80;
  const pts = values.map((v,i) => {
    const x = values.length > 1 ? (i/(values.length-1))*W : W/2;
    const y = H - ((v-minVal)/range)*(H-8) - 4;
    return `${x},${y}`;
  }).join(" ");

  return (
    <div style={{padding:"0 24px 20px"}}>
      <div style={{background:"#0f172a",borderRadius:12,padding:16}}>
        {/* Header */}
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
          <div style={{fontSize:11,fontWeight:700,color:"#64748b",letterSpacing:1,textTransform:"uppercase"}}>
            📈 Historique {period} jours
          </div>
          <div style={{display:"flex",gap:6}}>
            {[7,14,30,90].map(p => (
              <button key={p} onClick={()=>setPeriod(p)}
                style={{padding:"3px 10px",border:`1px solid ${period===p?"#60a5fa":"#334155"}`,borderRadius:20,
                  background:period===p?"#1e40af":"transparent",color:period===p?"#fff":"#64748b",
                  fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>
                {p}j
              </button>
            ))}
          </div>
        </div>

        {/* Sélecteur métrique */}
        <div style={{display:"flex",gap:6,marginBottom:14,flexWrap:"wrap"}}>
          {METRICS.map(m => (
            <button key={m.id} onClick={()=>setMetric(m.id)}
              style={{padding:"4px 12px",border:`1px solid ${metric===m.id?m.color:"#334155"}`,borderRadius:20,
                background:metric===m.id?m.color+"22":"transparent",
                color:metric===m.id?m.color:"#64748b",
                fontSize:11,fontWeight:metric===m.id?700:400,cursor:"pointer",fontFamily:"inherit"}}>
              {m.label}
            </button>
          ))}
        </div>

        {/* Stats rapides */}
        <div style={{display:"flex",gap:20,marginBottom:14}}>
          {[
            { label:"Dernière valeur", value:last, suffix:currentMetric?.id.includes("pct")||currentMetric?.id.includes("taux")?"%" :currentMetric?.id==="score_activite"?"/100":"" },
            { label:"Moyenne",         value:avg,  suffix:"" },
            { label:"Tendance",        value:trend>=0?`+${trend}`:trend, suffix:"", color:trend>=0?"#4ade80":"#f87171" },
            { label:"Max",             value:maxVal, suffix:"" },
          ].map(s => (
            <div key={s.label}>
              <div style={{fontSize:20,fontWeight:900,color:s.color||currentMetric?.color||"#60a5fa"}}>{s.value}{s.suffix}</div>
              <div style={{fontSize:10,color:"#475569"}}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Graphique SVG */}
        {loading ? (
          <div style={{height:80,display:"flex",alignItems:"center",justifyContent:"center",color:"#475569",fontSize:12}}>Chargement…</div>
        ) : data.length === 0 ? (
          <div style={{height:80,display:"flex",alignItems:"center",justifyContent:"center",color:"#475569",fontSize:12}}>
            Aucune donnée — cliquez sur 📸 Snapshot pour initialiser
          </div>
        ) : (
          <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{display:"block",height:80}}>
            {/* Grille */}
            {[0,25,50,75,100].map(pct => (
              <line key={pct} x1={0} y1={H-(pct/100)*H} x2={W} y2={H-(pct/100)*H} stroke="#1e293b" strokeWidth={1}/>
            ))}
            {/* Zone remplie */}
            <defs>
              <linearGradient id={`grad-${metric}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={currentMetric?.color||"#60a5fa"} stopOpacity="0.3"/>
                <stop offset="100%" stopColor={currentMetric?.color||"#60a5fa"} stopOpacity="0"/>
              </linearGradient>
            </defs>
            <polygon
              points={`0,${H} ${pts} ${W},${H}`}
              fill={`url(#grad-${metric})`}/>
            {/* Ligne */}
            <polyline
              points={pts}
              fill="none"
              stroke={currentMetric?.color||"#60a5fa"}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"/>
            {/* Points */}
            {values.map((v,i) => {
              const x = values.length>1 ? (i/(values.length-1))*W : W/2;
              const y = H - ((v-minVal)/range)*(H-8) - 4;
              return <circle key={i} cx={x} cy={y} r={3} fill={currentMetric?.color||"#60a5fa"}/>;
            })}
          </svg>
        )}

        {/* Labels dates */}
        {data.length > 0 && (
          <div style={{display:"flex",justifyContent:"space-between",marginTop:6}}>
            <span style={{fontSize:10,color:"#334155"}}>{data[0]?.date}</span>
            <span style={{fontSize:10,color:"#334155"}}>{data[data.length-1]?.date}</span>
          </div>
        )}
      </div>
    </div>
  );
}

export { HistoriqueSparkline };
export default HistoriqueSparkline;
