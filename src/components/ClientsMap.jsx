// ─── Backoffice : carte de répartition géographique des clients (25/08/2026) ──
// Les pharmacies n'ont qu'une adresse texte libre (pas de latitude/longitude
// stockée) — géocodage à la volée via l'API Adresse (data.gouv.fr, base
// officielle française, publique, gratuite, sans clé — déjà utilisée pour
// l'autocomplétion d'adresse à l'inscription, voir BillingModule.jsx).
//
// Silhouette de la France : tracé dérivé de vraies coordonnées (FRANCE_BOUNDARY
// ci-dessous), pas de points SVG choisis à l'œil comme avant le 27/08/2026 —
// un tracé "à la main" ne ressemblait à rien de reconnaissable (signalé comme
// s'affichant mal) et surtout n'avait aucune garantie de cohérence avec la
// projection utilisée pour placer les marqueurs : un client réel pouvait se
// retrouver hors silhouette. Ici les deux passent par la même project(), donc
// un marqueur tombe toujours au bon endroit relatif au contour. Simplifié à
// une vingtaine de points-repères (villes/frontières), pas un contour
// côtier précis — suffisant pour situer visuellement la répartition des
// clients par région, pas une carte topographique. France métropolitaine
// uniquement (pas la Corse). Projection calibrée sur 4 villes repères
// (Brest/Strasbourg pour la longitude, Dunkerque/Perpignan pour la
// latitude) plutôt qu'une vraie projection cartographique — à cette échelle
// (un pays), l'écart est invisible à l'œil.
import { useState, useEffect } from "react";

const VIEW_W = 460, VIEW_H = 430;

function project(lat, lon) {
  const x = 30 + (lon + 4.49) * 27.37;
  const y = 20 + (51.03 - lat) * 43.82;
  return [x, y];
}

const FRANCE_BOUNDARY = [
  [51.03, 2.38],    // Dunkerque
  [49.95, 4.90],    // frontière belge
  [49.55, 5.80],    // frontière luxembourgeoise
  [49.10, 7.05],    // Sarreguemines
  [48.58, 7.75],    // Strasbourg
  [47.60, 7.60],    // Bâle (frontière suisse)
  [46.20, 6.15],    // Genève (frontière suisse)
  [45.90, 6.90],    // Chamonix (frontière italienne, nord)
  [43.70, 7.40],    // Nice / Menton (frontière italienne, sud)
  [43.30, 5.40],    // Marseille
  [43.60, 3.90],    // Montpellier (golfe du Lion)
  [42.50, 2.90],    // Perpignan (frontière espagnole, Méditerranée)
  [42.55, 1.50],    // Andorre
  [43.00, -1.40],   // Pyrénées atlantiques (frontière espagnole)
  [43.48, -1.56],   // Biarritz
  [44.66, -1.24],   // bassin d'Arcachon
  [46.16, -1.20],   // La Rochelle
  [47.28, -2.20],   // Saint-Nazaire
  [48.39, -4.49],   // Brest (pointe de la Bretagne)
  [48.65, -2.00],   // Saint-Malo
  [49.65, -1.62],   // Cherbourg (pointe du Cotentin)
  [49.49, 0.10],    // Le Havre
  [50.95, 1.85],    // Calais
];

const FRANCE_PATH = FRANCE_BOUNDARY
  .map(([lat, lon], i) => { const [x, y] = project(lat, lon); return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`; })
  .join(" ") + " Z";

const PLAN_COLORS = { starter: "#0369a1", standard: "#1a3a6e", pro: "#4c1d95", premium: "#be185d" };
const PLAN_LABELS = { starter: "Starter", standard: "Standard", pro: "Pro", premium: "Premium" };

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
