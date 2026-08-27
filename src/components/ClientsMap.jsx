// ─── Backoffice : carte de répartition géographique des clients (25/08/2026) ──
// Les pharmacies n'ont qu'une adresse texte libre (pas de latitude/longitude
// stockée) — géocodage à la volée via l'API Adresse (data.gouv.fr, base
// officielle française, publique, gratuite, sans clé — déjà utilisée pour
// l'autocomplétion d'adresse à l'inscription, voir BillingModule.jsx).
//
// @fix 27/08/2026 — remplace le tracé SVG "à la main" (silhouette de la
// France dessinée/calibrée manuellement) par une vraie carte Leaflet +
// fonds de carte OpenStreetMap : signalé comme s'affichant mal (forme
// méconnaissable), et plus largement une reconstruction manuelle de contour
// est fragile par nature — Leaflet élimine toute la classe de bug. Marqueurs
// en L.circleMarker (cercles vectoriels, pas d'icône PNG à héberger) pour
// garder le style plein-couleur-par-plan de la version précédente.
import { useState, useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const PLAN_COLORS = { starter: "#0369a1", standard: "#1a3a6e", pro: "#4c1d95", premium: "#be185d" };
const PLAN_LABELS = { starter: "Starter", standard: "Standard", pro: "Pro", premium: "Premium" };
const FRANCE_CENTER = [46.6, 2.2];

function ClientsMap({ clients }) {
  const [coords, setCoords] = useState({}); // id -> {lat, lon} | null (échec de géocodage)
  const [loading, setLoading] = useState(true);
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef(null);

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

  // Initialisation de la carte — une seule fois par montage du composant
  // (ce composant est démonté quand on quitte l'onglet "Carte", voir
  // AdminPage.jsx : pas besoin de gérer un re-init à chaud).
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;
    const map = L.map(mapContainerRef.current, { scrollWheelZoom: true }).setView(FRANCE_CENTER, 6);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map);
    markersRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    // Le conteneur peut ne pas avoir sa taille finale au tout premier rendu
    // (onglet qui vient de s'ouvrir) — sans ce recalcul, Leaflet peut garder
    // des tuiles grisées/mal cadrées.
    requestAnimationFrame(() => map.invalidateSize());
    return () => { map.remove(); mapRef.current = null; markersRef.current = null; };
  }, []);

  // Marqueurs — reconstruits à chaque changement de géocodage.
  useEffect(() => {
    if (!markersRef.current) return;
    markersRef.current.clearLayers();
    located.forEach(c => {
      const { lat, lon } = coords[c.id];
      const color = PLAN_COLORS[c.plan] || "#64748b";
      L.circleMarker([lat, lon], {
        radius: 7, color: "#0f172a", weight: 1.5, fillColor: color, fillOpacity: 0.85,
      })
        .bindTooltip(`${c.nom} · ${PLAN_LABELS[c.plan] || c.plan}`, { direction: "top", offset: [0, -6] })
        .addTo(markersRef.current);
    });
  }, [located, coords]);

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

      <div style={{ display: "flex", gap: 28, flexWrap: "wrap", alignItems: "flex-start" }}>
        <div ref={mapContainerRef} style={{ width: 460, height: 400, flexShrink: 0, borderRadius: 10, overflow: "hidden" }} />

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
