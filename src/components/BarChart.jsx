// Graphique en barres minimal (sans dépendance) — backoffice.
// data : [{ cle, label, value }], déjà ordonné chronologiquement.
export function BarChart({ data, color = "#1a3a6e", hauteur = 110 }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div style={{ overflowX: "auto" }}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: hauteur + 34, minWidth: data.length * 16 }}>
        {data.map((d) => (
          <div key={d.cle} title={`${d.label} : ${d.value}`}
            style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", width: 13, height: "100%" }}>
            <div style={{ fontSize: 9, color: "#64748b", marginBottom: 2, minHeight: 11 }}>{d.value > 0 ? d.value : ""}</div>
            <div style={{ width: "100%", height: Math.max(2, (d.value / max) * hauteur), background: color, borderRadius: "3px 3px 0 0" }} />
            <div style={{ fontSize: 8, color: "#94a3b8", marginTop: 4, whiteSpace: "nowrap", writingMode: "vertical-rl", transform: "rotate(180deg)", height: 38 }}>{d.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
