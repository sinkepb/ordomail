// ─── Backoffice : carte de répartition géographique des clients (25/08/2026) ──
// Les pharmacies n'ont qu'une adresse texte libre (pas de latitude/longitude
// stockée) — géocodage à la volée via l'API Adresse (data.gouv.fr, base
// officielle française, publique, gratuite, sans clé — déjà utilisée pour
// l'autocomplétion d'adresse à l'inscription, voir BillingModule.jsx).
//
// Silhouette de la France : tracé simplifié (une trentaine de points, pas un
// contour côtier précis) — suffisant pour situer visuellement la répartition
// des clients par région, pas une carte topographique. Projection calibrée
// sur 4 villes repères (Brest/Strasbourg pour la longitude, Dunkerque/
// Perpignan pour la latitude) plutôt qu'une vraie projection cartographique —
// à cette échelle (un pays), l'écart est invisible à l'œil.
import { useState, useEffect } from "react";

const FRANCE_PATH = "M175,20 L230,15 L300,55 L330,90 L365,115 L345,150 L365,190 L400,240 L430,290 L400,330 L350,345 L300,355 L240,385 L170,410 L100,395 L85,340 L100,280 L95,230 L105,195 L75,185 L30,170 L55,140 L90,120 L75,95 L100,70 L130,90 L155,75 L175,55 Z";
const VIEW_W = 460, VIEW_H = 430;

function project(lat, lon) {
  const x = 30 + (lon + 4.49) * 27.37;
  const y = 20 + (51.03 - lat) * 43.82;
  return [x, y];
}

const PLAN_COLORS = { starter: "#0369a1", standard: "#1a3a6e", pro: "#4c1d95" };
const PLAN_LABELS = { starter: "Starter", standard: "Standard", pro: "Pro" };

function ClientsMap({ clients }) {
  const [coords, setCoords] = useState({}); // id -> {lat, lon} | null (échec de géocodage)
  const [loading, setLoading] = useState(true);
  const [hovered, setHovered] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function geocodeAll() {
      setLoading(true);
      const results = {};
      await Promise.all((clients || []).map(async (c) => {
        if (!c.adresse) { results[c.id] = null; return; }
        try {
          const res = await fetch(`https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(c.adresse)}&limit=1`);
          const data = await res.json();
          const feat = data.features?.[0];
          results[c.id] = feat ? { lat: feat.geometry.coordinates[1], lon: feat.geometry.coordinates[0] } : null;
        } catch {
          results[c.id] = null;
        }
      }));
      if (!cancelled) { setCoords(results); setLoading(false); }
    }
    geocodeAll();
    return () => { cancelled = true; };
  }, [clients]);

  const located = (clients || []).filter(c => coords[c.id]);
  const missing = (clients || []).filter(c => c.id in coords && !coords[c.id]);

  return (
    <div style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 14, padding: 22 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
        <div style={{ fontWeight: 800, fontSize: 15, color: "#fff" }}>🗺️ Répartition géographique des clients</div>
        <div style={{ fontSize: 12, color: "#64748b" }}>
          {loading
            ? "Localisation en cours…"
            : `${located.length} localisée${located.length > 1 ? "s" : ""}${missing.length ? ` · ${missing.length} introuvable${missing.length > 1 ? "s" : ""}` : ""}`}
        </div>
      </div>

      <div style={{ display: "flex", gap: 28, flexWrap: "wrap", alignItems: "center" }}>
        <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} style={{ width: 380, height: 355, flexShrink: 0 }}>
          <path d={FRANCE_PATH} fill="#0f172a" stroke="#334155" strokeWidth="2" />
          {located.map(c => {
            const [x, y] = project(coords[c.id].lat, coords[c.id].lon);
            const color = PLAN_COLORS[c.plan] || "#64748b";
            const isHovered = hovered === c.id;
            return (
              <g key={c.id} onMouseEnter={() => setHovered(c.id)} onMouseLeave={() => setHovered(null)} style={{ cursor: "pointer" }}>
                <circle cx={x} cy={y} r={isHovered ? 9 : 6} fill={color} stroke="#0f172a" strokeWidth="1.5" opacity={isHovered ? 1 : 0.85} />
                {isHovered && (
                  <g>
                    <rect x={x + 10} y={y - 15} width={Math.max(70, c.nom.length * 6.5 + 16)} height={24} rx={5} fill="#0f172a" stroke="#475569" />
                    <text x={x + 18} y={y + 1} fontSize="11" fontWeight="700" fill="#fff" fontFamily="'Inter',system-ui,sans-serif">{c.nom}</text>
                  </g>
                )}
              </g>
            );
          })}
        </svg>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {Object.keys(PLAN_COLORS).map(plan => (
            <div key={plan} style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <div style={{ width: 11, height: 11, borderRadius: "50%", background: PLAN_COLORS[plan], flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: "#e2e8f0", fontWeight: 600, minWidth: 62 }}>{PLAN_LABELS[plan]}</span>
              <span style={{ fontSize: 12, color: "#64748b" }}>{located.filter(c => c.plan === plan).length}</span>
            </div>
          ))}
          {missing.length > 0 && (
            <div style={{ marginTop: 8, fontSize: 11, color: "#64748b", maxWidth: 180, lineHeight: 1.5 }}>
              ⚠️ {missing.length} adresse{missing.length > 1 ? "s" : ""} non localisable{missing.length > 1 ? "s" : ""} — format probablement incomplet.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export { ClientsMap };
export default ClientsMap;
