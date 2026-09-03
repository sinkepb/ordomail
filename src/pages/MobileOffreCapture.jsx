// OrdoMail — page mobile "offre en 2 gestes" (03/09/2026, voir mission
// "Zéro design"). Atteinte en scannant le QR du dashboard PC — le jeton
// (?m=...) est la seule preuve d'appartenance à la pharmacie, "zéro
// connexion" : pas d'écran de login, pas de PIN à saisir sur ce téléphone.
//
// Interface mono-tâche volontaire (voir mission) : UNIQUEMENT le viseur photo,
// un pavé numérique pour le prix, et un gros bouton "Diffuser" — rien d'autre
// ne doit distraire un préparateur pressé, debout au comptoir.
import { useState, useEffect } from "react";
import { fileToBase64 } from "../lib/utils.js";

async function callMobileOffre(token, action, params = {}) {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  const res = await fetch(`${supabaseUrl}/functions/v1/mobile-offre`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "apikey": supabaseKey, "Authorization": `Bearer ${token || ""}` },
    body: JSON.stringify({ action, ...params }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error || `Erreur ${res.status}`);
  return body.data;
}

const KEYPAD_KEYS = ["1","2","3","4","5","6","7","8","9",",","0","⌫"];

function MobileOffreCapture({ token }) {
  const [status, setStatus] = useState("checking"); // checking | ready | forbidden | invalid
  const [pharmacieNom, setPharmacieNom] = useState("");
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [prix, setPrix] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const [published, setPublished] = useState(false);

  useEffect(() => {
    if (!token) { setStatus("invalid"); return; }
    callMobileOffre(token, "verify")
      .then(({ pharmacieNom, canCreate }) => {
        setPharmacieNom(pharmacieNom || "");
        setStatus(canCreate ? "ready" : "forbidden");
      })
      .catch(() => setStatus("invalid"));
  }, [token]);

  function handlePhoto(file) {
    if (!file) return;
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
    setSendError("");
  }

  function pressKey(k) {
    setSendError("");
    if (k === "⌫") { setPrix(p => p.slice(0, -1)); return; }
    if (k === ",") { setPrix(p => (p.includes(",") ? p : (p || "0") + ",")); return; }
    setPrix(p => (p.length >= 6 ? p : p + k));
  }

  async function handleDiffuser() {
    if (!photoFile || sending) return;
    setSending(true); setSendError("");
    try {
      const fileBase64 = await fileToBase64(photoFile);
      const prixNum = prix ? Number(prix.replace(",", ".")) : null;
      await callMobileOffre(token, "create", {
        fileName: photoFile.name || "photo.jpg",
        fileType: photoFile.type || "image/jpeg",
        fileBase64,
        prix: prixNum,
      });
      setPublished(true);
    } catch (e) {
      setSendError(e.message);
    }
    setSending(false);
  }

  function resetForNext() {
    setPhotoFile(null); setPhotoPreview(null); setPrix(""); setPublished(false); setSendError("");
  }

  const shellStyle = { minHeight: "100vh", background: "#0f172a", color: "#fff", display: "flex", flexDirection: "column", fontFamily: "'Inter',system-ui,sans-serif" };

  if (status === "checking") return (
    <div style={{ ...shellStyle, alignItems: "center", justifyContent: "center" }}>
      <div style={{ fontSize: 40, animation: "spin 1s linear infinite" }}>📷</div>
    </div>
  );

  if (status === "invalid") return (
    <div style={{ ...shellStyle, alignItems: "center", justifyContent: "center", padding: 24, textAlign: "center" }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>⏱️</div>
      <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 8 }}>Lien expiré</div>
      <div style={{ fontSize: 14, color: "#94a3b8" }}>Redemandez un QR code depuis le dashboard PC — chaque lien n'est valable que 15 minutes.</div>
    </div>
  );

  if (status === "forbidden") return (
    <div style={{ ...shellStyle, alignItems: "center", justifyContent: "center", padding: 24, textAlign: "center" }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>🔒</div>
      <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 8 }}>Fonctionnalité non disponible</div>
      <div style={{ fontSize: 14, color: "#94a3b8" }}>Les Offres & Stories ne sont pas incluses dans le plan de {pharmacieNom || "votre pharmacie"}.</div>
    </div>
  );

  if (published) return (
    <div style={{ ...shellStyle, alignItems: "center", justifyContent: "center", padding: 24, textAlign: "center" }}>
      <div style={{ fontSize: 64, marginBottom: 16 }}>✅</div>
      <div style={{ fontWeight: 800, fontSize: 20, marginBottom: 8 }}>Offre diffusée !</div>
      <div style={{ fontSize: 14, color: "#94a3b8", marginBottom: 28 }}>Visible immédiatement sur l'écran patient et le dashboard PC.</div>
      <button onClick={resetForNext}
        style={{ padding: "16px 28px", border: "none", borderRadius: 14, background: "#22c55e", color: "#052e16", fontWeight: 800, fontSize: 16, cursor: "pointer", fontFamily: "inherit" }}>
        📸 Publier une autre offre
      </button>
    </div>
  );

  return (
    <div style={shellStyle}>
      <div style={{ padding: "14px 18px", textAlign: "center", fontSize: 12, color: "#64748b", borderBottom: "1px solid #1e293b" }}>
        {pharmacieNom}
      </div>

      {/* Viseur / aperçu photo — SEUL élément visuel de la page avec le pavé et le bouton */}
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
        <label style={{
          width: "100%", maxWidth: 340, aspectRatio: "3/4", borderRadius: 20, overflow: "hidden",
          border: photoPreview ? "none" : "3px dashed #334155", display: "flex", alignItems: "center", justifyContent: "center",
          background: photoPreview ? "#000" : "#1e293b", cursor: "pointer", position: "relative",
        }}>
          {photoPreview ? (
            <img src={photoPreview} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          ) : (
            <div style={{ textAlign: "center", color: "#64748b" }}>
              <div style={{ fontSize: 56, marginBottom: 10 }}>📷</div>
              <div style={{ fontSize: 15, fontWeight: 700 }}>Prendre la photo</div>
            </div>
          )}
          {photoPreview && (
            <div style={{ position: "absolute", bottom: 10, right: 10, background: "rgba(0,0,0,0.6)", borderRadius: 10, padding: "6px 12px", fontSize: 12, fontWeight: 700 }}>
              🔄 Reprendre
            </div>
          )}
          <input type="file" accept="image/*" capture="environment" style={{ display: "none" }}
            onChange={e => { handlePhoto(e.target.files?.[0]); e.target.value = ""; }} />
        </label>
      </div>

      {/* Prix */}
      <div style={{ textAlign: "center", padding: "0 20px 8px" }}>
        <div style={{ fontSize: 40, fontWeight: 900, fontVariantNumeric: "tabular-nums" }}>
          {prix || "0"}<span style={{ fontSize: 22, color: "#64748b" }}> €</span>
        </div>
        <div style={{ fontSize: 11, color: "#64748b" }}>Prix (optionnel)</div>
      </div>

      {/* Pavé numérique */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, padding: "0 20px 16px" }}>
        {KEYPAD_KEYS.map(k => (
          <button key={k} onClick={() => pressKey(k)}
            style={{ padding: "16px 0", border: "none", borderRadius: 14, background: "#1e293b", color: "#fff", fontSize: 22, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
            {k}
          </button>
        ))}
      </div>

      {sendError && <div style={{ margin: "0 20px 12px", padding: "10px 14px", background: "#450a0a", color: "#fca5a5", borderRadius: 10, fontSize: 13, textAlign: "center" }}>{sendError}</div>}

      {/* Diffuser */}
      <div style={{ padding: "0 20px 28px" }}>
        <button onClick={handleDiffuser} disabled={!photoFile || sending}
          style={{
            width: "100%", padding: "18px", border: "none", borderRadius: 16, fontWeight: 900, fontSize: 18, fontFamily: "inherit",
            background: !photoFile ? "#334155" : "#22c55e", color: !photoFile ? "#64748b" : "#052e16",
            cursor: !photoFile || sending ? "default" : "pointer",
          }}>
          {sending ? "Diffusion…" : "📡 Diffuser"}
        </button>
      </div>
    </div>
  );
}

export { MobileOffreCapture };
export default MobileOffreCapture;
