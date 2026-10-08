

export function BottomNav({ tab, canAdmin, canRappels, canOffres, setTab, rappelsATraiter = 0 }) {
  const items = [
    { id: "ordonnances", icon: "📋", label: "Ordo", always: true },
    { id: "rappels",     icon: "🔔", label: "Rappels", feature: canRappels, badge: rappelsATraiter },
    { id: "offres",      icon: "🎯", label: "Offres", feature: canOffres },
    { id: "parametres",  icon: "⚙️", label: "Paramètres", adminOnly: true },
  ].filter(it => (!it.adminOnly || canAdmin) && (it.always || it.feature));
  const active = tab;
  return (
    <nav style={{ position:"fixed", bottom:0, left:0, right:0, zIndex:200, background:"#fff", borderTop:"1px solid #e2e8f0", display:"flex", justifyContent:"space-around", alignItems:"stretch", height:60 }} className="bottom-nav">
      {items.map(it => {
        const isActive = active === it.id;
        return (
          <button key={it.id} onClick={() => setTab(it.id)}
            style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:2, border:"none", background:"none", cursor:"pointer", fontFamily:"inherit", borderTop: isActive?"2px solid #1a3a6e":"2px solid transparent", position:"relative" }}>
            <span style={{ fontSize:20 }}>{it.icon}</span>
            <span style={{ fontSize:9, fontWeight:isActive?800:500, color:isActive?"#1a3a6e":"#94a3b8" }}>{it.label}</span>
            {it.badge>0&&<span style={{ position:"absolute", top:4, right:"28%", background:"#dc2626", color:"#fff", borderRadius:999, padding:"1px 5px", fontSize:9, fontWeight:800, lineHeight:1.4 }}>{it.badge}</span>}
          </button>
        );
      })}
    </nav>
  );
}
