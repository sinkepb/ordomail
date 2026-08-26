// Programmation de badge NFC (NTAG213) — déplacé du Dashboard pharmacie vers le
// backoffice OrdoMail Business (25/08/2026) : les QR codes ne sont plus
// auto-générés par la pharmacie, ils sont pré-imprimés et associés par le staff
// OrdoMail au moment de l'envoi postal du goodie (voir QrCodesAdmin.jsx) — c'est
// donc là, pas côté pharmacie, que le badge physique est programmé.
import { useState } from "react";

function NfcWriter({ url, color = "#3b82f6" }) {
  const [nfcStatus, setNfcStatus] = useState("idle");

  async function handleNFCWrite() {
    if (!("NDEFReader" in window)) { setNfcStatus("unsupported"); return; }
    try {
      setNfcStatus("writing");
      const ndef = new window.NDEFReader();
      await ndef.write({ records: [{ recordType: "url", data: url }] });
      setNfcStatus("success");
    } catch { setNfcStatus("error"); }
  }

  return (
    <div style={{ maxWidth: 380, margin: "0 auto" }}>
      <div style={{ textAlign: "center", padding: "12px 0 24px" }}>
        <div style={{ fontSize: 44, marginBottom: 12 }}>🏷️</div>
        <div style={{ fontSize: 13, color: "#94a3b8", marginBottom: 20, lineHeight: 1.7 }}>
          Programmez un badge NTAG213 (~0,50€) avec le lien de ce QR code. Le patient approche
          son téléphone — la page s'ouvre instantanément.
        </div>
        {nfcStatus === "idle" && (
          <button onClick={handleNFCWrite}
            style={{ padding: "11px 24px", border: "none", borderRadius: 10, background: color, color: "#fff", fontWeight: 800, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>
            📡 Programmer un badge NFC
          </button>
        )}
        {nfcStatus === "writing" && <div style={{ color, fontWeight: 700, fontSize: 13 }}>📡 Approchez le badge…</div>}
        {nfcStatus === "success" && (
          <>
            <div style={{ color: "#4ade80", fontWeight: 800, fontSize: 15, marginBottom: 10 }}>✅ Badge programmé !</div>
            <button onClick={() => setNfcStatus("idle")}
              style={{ padding: "7px 16px", border: "1px solid #334155", borderRadius: 8, background: "transparent", color: "#94a3b8", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
              Programmer un autre badge
            </button>
          </>
        )}
        {nfcStatus === "error" && (
          <>
            <div style={{ color: "#f87171", fontWeight: 700, fontSize: 13, marginBottom: 10 }}>⚠️ Erreur — Réessayez</div>
            <button onClick={() => setNfcStatus("idle")}
              style={{ padding: "7px 16px", border: "1px solid #334155", borderRadius: 8, background: "transparent", color: "#94a3b8", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
              Réessayer
            </button>
          </>
        )}
        {nfcStatus === "unsupported" && (
          <div style={{ background: "rgba(230,168,23,0.12)", border: "1px solid rgba(230,168,23,0.35)", borderRadius: 10, padding: "12px 16px", fontSize: 12, color: "#fcd34d", textAlign: "left" }}>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>NFC non disponible dans ce navigateur</div>
            <div>Utilisez Chrome sur Android. Sur iPhone, la programmation NFC n'est pas prise en charge (lecture seule).</div>
          </div>
        )}
      </div>
      <div style={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 10, padding: "12px 14px", fontSize: 12, color: "#64748b", lineHeight: 1.8 }}>
        <div style={{ fontWeight: 700, marginBottom: 4, color: "#94a3b8" }}>Compatibilité</div>
        <div>📱 Programmation : Chrome Android uniquement</div>
        <div>✅ Lecture : iPhone 7+ et Android avec NFC</div>
        <div>🛒 Badge NTAG213 : ~0,50€ sur Amazon</div>
      </div>
    </div>
  );
}

export { NfcWriter };
