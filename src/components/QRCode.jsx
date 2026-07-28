// Extrait de Dashboard.jsx (phase 2) — composant autonome (props uniquement),
// premier pas du découpage des gros fichiers. Voir DEPLOIEMENT_PHASE2.md.
import { useState, useEffect } from "react";

function QRCode({ url, size = 220, color = "#1a3a6e", printId }) {
  const [dataUrl, setDataUrl] = useState(null);
  const [error, setError]     = useState(false);

  useEffect(() => {
    if (!url) return;
    setDataUrl(null); setError(false);

    // qrcode — paquet npm local bundlé par Vite (plus de CDN esm.sh)
    // toDataURL retourne une Promise avec le PNG en base64
    import("qrcode")
      .then(mod => {
        const QR = mod.default || mod;
        return QR.toDataURL(url, {
          errorCorrectionLevel: "M",
          margin: 2,
          width: size,
          color: { dark: "#000000", light: "#ffffff" },
          type: "image/png",
        });
      })
      .then(dataURL => setDataUrl(dataURL))
      .catch(err => {
        console.error("[QRCode]", err);
        setError(true);
      });
  }, [url, color, size]);

  if (error) return (
    <div style={{width:size,height:size,display:"flex",alignItems:"center",justifyContent:"center",background:"#fee2e2",borderRadius:8,fontSize:11,color:"#dc2626",textAlign:"center",padding:8}}>
      ⚠️ Erreur génération QR
    </div>
  );

  if (!dataUrl) return (
    <div style={{width:size,height:size,display:"flex",alignItems:"center",justifyContent:"center",background:"#f8fafc",borderRadius:8}}>
      <div style={{fontSize:11,color:"#94a3b8",textAlign:"center"}}>
        <div style={{animation:"spin 1s linear infinite",fontSize:22,marginBottom:4}}>⏳</div>
        Génération QR…
      </div>
    </div>
  );

  return (
    <img
      id={printId || undefined}
      src={dataUrl}
      width={size}
      height={size}
      style={{display:"block",borderRadius:4}}
      alt="QR Code"
    />
  );
}

export { QRCode };
export default QRCode;
