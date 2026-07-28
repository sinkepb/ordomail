function CVBadge({ numero, color = "#15623a" }) {
  if (!numero) return <span style={{ color: "#bbb", fontSize: 12, fontStyle: "italic" }}>Non extrait</span>;
  // Formater le numéro en groupes lisibles : X XX XX XX XXX XXX XX
  const fmt = (n) => n.replace(/\s/g,"").replace(/(.{1})(.{2})(.{2})(.{2})(.{3})(.{3})(.{2})/, "$1 $2 $3 $4 $5 $6 $7").trim();
  const formatted = fmt(numero) || numero;
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 6,
      background: `${color}14`, border: `1.5px solid ${color}44`,
      borderRadius: 8, padding: "5px 10px",
      minWidth: 0, overflow: "hidden",
    }}>
      <span style={{ fontSize: 14, flexShrink: 0 }}>💳</span>
      <span style={{
        fontFamily: "monospace", fontSize: 12, fontWeight: 700,
        color: color, letterSpacing: 0.5,
        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        minWidth: 0,
      }}>{formatted}</span>
    </div>
  );
}

function Btn({ children, onClick, disabled, variant="primary", small, style={} }) {
  const base = { display:"inline-flex", alignItems:"center", gap:6, fontFamily:"inherit",
    fontWeight:700, cursor:disabled?"not-allowed":"pointer", borderRadius:9, border:"none",
    fontSize:small?12:14, padding:small?"6px 12px":"10px 18px", transition:"opacity 0.15s",
    opacity:disabled?0.5:1 };
  const variants = {
    primary:   { background:"#1a3a6e", color:"#fff" },
    secondary: { background:"#f0f4ff", color:"#1a3a6e", border:"1.5px solid #c7d2fe" },
    ghost:     { background:"transparent", color:"#475569", border:"1.5px solid #e2e8f0" },
    danger:    { background:"#fee2e2", color:"#dc2626", border:"1.5px solid #fecaca" },
  };
  return <button onClick={disabled?undefined:onClick} style={{...base,...variants[variant],...style}}>{children}</button>;
}

function Input({ label, value, onChange, type="text", placeholder="", icon="" }) {
  return (
    <div style={{marginBottom:14}}>
      {label && <label style={{fontSize:12,fontWeight:700,color:"#374151",display:"block",marginBottom:5}}>{label}</label>}
      <div style={{position:"relative"}}>
        {icon && <span style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",fontSize:15,pointerEvents:"none"}}>{icon}</span>}
        <input type={type} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder}
          style={{width:"100%",padding:icon?"10px 12px 10px 34px":"10px 12px",border:"1.5px solid #e2e8f0",borderRadius:9,fontSize:14,outline:"none",fontFamily:"inherit",boxSizing:"border-box"}}/>
      </div>
    </div>
  );
}


export { CVBadge, Btn, Input };
