// Réglage manuel des coins d'une photo d'ordonnance avant traitement.
// Les coins sont en coordonnées normalisées [0..1], ordre : haut-gauche,
// haut-droit, bas-droit, bas-gauche (voir documentScan.js).
import { useEffect, useRef, useState } from "react";

const COINS_PAR_DEFAUT = [
  { x: 0.06, y: 0.06 },
  { x: 0.94, y: 0.06 },
  { x: 0.94, y: 0.94 },
  { x: 0.06, y: 0.94 },
];

const LABELS = ["Haut gauche", "Haut droit", "Bas droit", "Bas gauche"];

function borner(v) {
  return Math.min(1, Math.max(0, v));
}

export function CadrageModal({ imageUrl, coinsInitiaux, onValider }) {
  const [coins, setCoins] = useState(coinsInitiaux || COINS_PAR_DEFAUT);
  const [actif, setActif] = useState(null);
  const [chargee, setChargee] = useState(false);
  // Secours (06/10/2026, retour terrain) — si l'image ne s'affiche jamais
  // (appareil lent, image corrompue), le patient doit pouvoir continuer
  // plutôt que de rester bloqué et de renvoyer sa photo en double. Le cadrage
  // par défaut (grand rectangle centré) s'applique dans ce cas.
  const [echec, setEchec] = useState(false);
  const zoneRef = useRef(null);

  useEffect(() => {
    setChargee(false);
    setEchec(false);
    const delai = setTimeout(() => {
      setChargee(c => { if (!c) setEchec(true); return c; });
    }, 8000);
    return () => clearTimeout(delai);
  }, [imageUrl]);

  function positionDepuisEvenement(e) {
    const rect = zoneRef.current.getBoundingClientRect();
    return {
      x: borner((e.clientX - rect.left) / rect.width),
      y: borner((e.clientY - rect.top) / rect.height),
    };
  }

  function demarrer(index, e) {
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setActif(index);
  }

  function deplacer(e) {
    if (actif === null) return;
    const p = positionDepuisEvenement(e);
    setCoins(prev => prev.map((c, i) => (i === actif ? p : c)));
  }

  function arreter() {
    setActif(null);
  }

  const polygone = coins.map(c => `${c.x * 100},${c.y * 100}`).join(" ");

  return (
    <div role="dialog" aria-modal="true" aria-label="Recadrer l'ordonnance"
      style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.85)", zIndex: 1000,
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, padding: 16 }}>
      <div style={{ color: "#fff", fontWeight: 700, fontSize: 15, textAlign: "center" }}>
        Ajustez les coins sur les bords de l'ordonnance
      </div>
      {!chargee && !echec && (
        <div style={{ color: "#fff", fontSize: 13, display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ width: 16, height: 16, border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", borderRadius: "50%", display: "inline-block", animation: "cadrage-spin 0.8s linear infinite" }} />
          Chargement de la photo…
        </div>
      )}
      {echec && (
        <div style={{ color: "#fca5a5", fontSize: 13, textAlign: "center", maxWidth: 280 }}>
          Impossible d'afficher cette photo sur cet appareil. Vous pouvez continuer sans ajuster le cadrage.
        </div>
      )}
      <style>{"@keyframes cadrage-spin{to{transform:rotate(360deg)}}"}</style>
      <div
        ref={zoneRef}
        onPointerMove={deplacer}
        onPointerUp={arreter}
        onPointerCancel={arreter}
        style={{ position: "relative", maxWidth: "100%", maxHeight: "70vh", minHeight: chargee ? undefined : 160, touchAction: "none", userSelect: "none", display: echec ? "none" : "block" }}>
        <img src={imageUrl} alt="" draggable={false}
          onLoad={() => setChargee(true)}
          onError={() => setEchec(true)}
          style={{ display: "block", maxWidth: "100%", maxHeight: "70vh", pointerEvents: "none", visibility: chargee ? "visible" : "hidden" }} />
        {chargee && (
          <>
            <svg viewBox="0 0 100 100" preserveAspectRatio="none"
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}>
              <polygon points={polygone} fill="rgba(16,185,129,0.15)" stroke="#10b981" strokeWidth="0.4" vectorEffect="non-scaling-stroke" />
            </svg>
            {coins.map((c, i) => (
              <div key={i}
                role="slider"
                aria-label={LABELS[i]}
                aria-valuetext={`${Math.round(c.x * 100)} %, ${Math.round(c.y * 100)} %`}
                onPointerDown={e => demarrer(i, e)}
                style={{
                  position: "absolute",
                  left: `${c.x * 100}%`,
                  top: `${c.y * 100}%`,
                  width: 36, height: 36,
                  transform: "translate(-50%, -50%)",
                  borderRadius: "50%",
                  background: "#10b981",
                  border: "3px solid #fff",
                  boxShadow: "0 1px 4px rgba(0,0,0,0.4)",
                  cursor: "grab",
                  touchAction: "none",
                }} />
            ))}
          </>
        )}
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
        {chargee && (
          <button type="button" onClick={() => setCoins(COINS_PAR_DEFAUT)}
            style={{ padding: "10px 16px", borderRadius: 10, border: "1.5px solid #fff", background: "transparent", color: "#fff", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
            Réinitialiser
          </button>
        )}
        <button type="button" onClick={() => onValider(coins)} disabled={!chargee && !echec}
          style={{ padding: "10px 16px", borderRadius: 10, border: "none", background: "#10b981", color: "#fff", fontWeight: 700, cursor: (chargee || echec) ? "pointer" : "default", opacity: (chargee || echec) ? 1 : 0.5, fontFamily: "inherit" }}>
          {echec ? "Continuer sans ajuster" : "Valider le cadrage"}
        </button>
      </div>
    </div>
  );
}
