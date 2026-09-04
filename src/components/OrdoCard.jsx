// @version 16/07/2026 15:50 — fix-allImprime-scope
// @ordomail-deploy 15/07/2026 02:22
import { useState, useEffect, useRef } from "react";
import { getSignedUrl } from "../supabase.js";
import { timeAgo, getOrdoAccent, escapeHtml, truncateFilename } from "../lib/utils.js";


function generateOrdoPDF(ordo) {
  // ⚠️ nom/cv/med/dat/medicaments proviennent du patient (formulaire non authentifié)
  // ou de l'OCR — toujours échapper avant interpolation dans du HTML brut (anti-XSS).
  const nom = escapeHtml(ordo.extracted?.nom || ordo.fromName || "Patient");
  const cv  = escapeHtml(ordo.extracted?.carteVitale || "Non disponible");
  const med = escapeHtml(ordo.extracted?.medecin || "Dr Inconnu");
  const dat = escapeHtml(ordo.extracted?.date || new Date().toLocaleDateString("fr-FR"));
  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<title>Ordonnance — ${nom}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; color: #1a1a1a; padding: 32px 40px; background: #fff; }
  @media print { body { padding: 16px; } .no-print { display: none; } }
  .header { border-bottom: 2px solid #1a3a6e; padding-bottom: 14px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: flex-start; }
  .ordo-title { font-size: 22px; font-weight: 900; color: #1a3a6e; }
  .ordo-sub { font-size: 10px; color: #94a3b8; letter-spacing: 2px; margin-top: 2px; }
  .patient-block { background: #eef4ff; border-left: 5px solid #1a3a6e; border-radius: 0 10px 10px 0; padding: 16px 20px; margin-bottom: 20px; }
  .patient-name { font-size: 28px; font-weight: 900; color: #1a1a1a; margin-bottom: 8px; }
  .cv-badge { display: inline-block; background: #15623a; color: #fff; font-family: monospace; font-size: 14px; font-weight: 700; padding: 5px 14px; border-radius: 7px; letter-spacing: 2px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 20px; }
  .info-card { background: #f8f9ff; border-radius: 9px; padding: 12px 14px; border: 1px solid #dde4f5; }
  .info-label { font-size: 10px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 4px; }
  .info-val { font-size: 14px; font-weight: 700; }
  .meds { margin-bottom: 24px; }
  .meds-label { font-size: 10px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 10px; }
  .med-item { padding: 8px 12px; border-radius: 7px; background: #f0f7ff; margin-bottom: 6px; font-size: 14px; border-left: 3px solid #1a3a6e; }
  .footer { border-top: 1px solid #e0e0e0; padding-top: 10px; display: flex; justify-content: space-between; font-size: 10px; color: #94a3b8; }
  .print-btn { position: fixed; bottom: 20px; right: 20px; background: #1a3a6e; color: #fff; border: none; border-radius: 10px; padding: 10px 20px; font-size: 13px; font-weight: 700; cursor: pointer; }
</style>
</head>
<body>
<button class="no-print print-btn" onclick="window.print()">🖨️ Imprimer</button>
<div class="header">
  <div>
    <div class="ordo-title">💊 OrdoMail</div>
    <div class="ordo-sub">FICHE ORDONNANCE NUMÉRIQUE</div>
  </div>
  <div style="text-align:right;font-size:11px;color:#64748b">
    Reçue le ${new Date(ordo.receivedAt).toLocaleDateString("fr-FR")}<br>
    Source : ${ordo.source === "qrcode" ? "QR Code patient" : "Email"}<br>
    ID : ${ordo.id}
  </div>
</div>
<div class="patient-block">
  <div style="font-size:10px;font-weight:700;color:#7a9cc8;text-transform:uppercase;letter-spacing:1.2px;margin-bottom:8px">Patient</div>
  <div class="patient-name">${nom}</div>
  ${cv !== "Non disponible" ? `<div class="cv-badge">💳 ${cv}</div>` : '<div style="font-size:12px;color:#aaa;font-style:italic">Numéro SS non extrait</div>'}
</div>
<div class="grid">
  <div class="info-card"><div class="info-label">Médecin prescripteur</div><div class="info-val">${med}</div></div>
  <div class="info-card"><div class="info-label">Date prescription</div><div class="info-val">${dat}</div></div>
</div>
<div class="meds">
  <div class="meds-label">Médicaments prescrits</div>
  ${(ordo.extracted?.medicaments || []).map(m => `<div class="med-item">▸ ${escapeHtml(m)}</div>`).join("") || '<div class="med-item" style="color:#aaa">Aucun médicament extrait</div>'}
</div>
<div class="footer">
  <span>Imprimé le ${new Date().toLocaleDateString("fr-FR")} à ${new Date().toLocaleTimeString("fr-FR", {hour:"2-digit",minute:"2-digit"})}</span>
  <span>OrdoMail — Document à usage interne pharmacie</span>
</div>
</body>
</html>`;
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  return URL.createObjectURL(blob);
}

function AttachmentThumb({ att, style }) {
  const [src, setSrc] = useState(att?.dataUrl || null);
  useEffect(() => {
    if (src || !att?.path) return;
    getSignedUrl(att.path, 3600).then(url => { if (url) setSrc(url); });
  }, [att?.path]);
  if (!src) return <div style={{...style, background:"#f0f0f0", display:"flex", alignItems:"center", justifyContent:"center", color:"#aaa", fontSize:12}}>⏳</div>;
  return <img src={src} alt="" style={style}/>;
}

function OrdoCard({ id, ordo, onPrint, onView, onUpload, onReopen, loadingId, onSonnette, sonnetteActive, onCreateRappel, interets = [] }) {
  const isNew = ordo.status === "nouveau";
  const nom    = ordo.extracted?.nom || ordo.fromName || "Patient";
  const initiale = nom?.charAt(0)?.toUpperCase() || "?";
  const uploadRef = useRef();
  const isLoading = loadingId === ordo.id;
  const accent = getOrdoAccent(ordo.id); // couleur unique par ordonnance
  const [downloading, setDownloading] = useState(false);

  // Téléchargement direct du fichier (04/09/2026, retour pharmacien pilote) —
  // en passant par un fetch+blob plutôt qu'un <a href download> direct : une
  // URL signée Supabase Storage est cross-origin, où l'attribut download est
  // silencieusement ignoré par le navigateur (le fichier s'ouvre au lieu de
  // se télécharger). Un blob: (même origine que la page) le respecte toujours.
  async function handleDownload() {
    const att = ordo.attachments[0];
    if (!att || downloading) return;
    setDownloading(true);
    try {
      const url = att.dataUrl || (att.path ? await getSignedUrl(att.path, 3600) : null);
      if (!url) return;
      const res = await fetch(url);
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = att.name || "ordonnance";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(blobUrl);
    } catch (e) {
      console.error("[handleDownload]", e.message);
    }
    setDownloading(false);
  }

  return (
    <div id={id} style={{
      background: "#fff", borderRadius: 12, overflow: "hidden",
      boxShadow: isNew ? `0 4px 20px ${accent.avatar}22, 0 1px 4px rgba(0,0,0,0.08)` : "0 1px 6px rgba(0,0,0,0.06)",
      border: isNew ? `2px solid ${accent.border}` : `2px solid ${accent.border}55`,
      transition: "box-shadow 0.2s",
      // Grille stretch les cartes d'une même ligne à la même hauteur (voir
      // Dashboard.jsx, display:grid) mais un contenu variable (bandeau
      // "intéressé(e)" présent ou non) faisait flotter sonnette/imprimer à des
      // hauteurs différentes d'une carte à l'autre au lieu de rester en bas.
      display: "flex", flexDirection: "column",
    }}>
      {/* Bandeau statut — couleur unique par ordonnance */}
      <div style={{
        background: isNew ? accent.bandeau : accent.bg,
        padding: "6px 12px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{ fontSize: 8, fontWeight: 800, color: isNew ? "#fff" : accent.avatar, letterSpacing: 0.6 }}>
            {isNew ? "NOUVEAU" : "EN COURS"}
          </span>
          {/* Icône source */}
          <span style={{ fontSize: 10 }} title={ordo.source === "email" ? "Envoyé par email" : ordo.source === "qrcode" ? "Envoyé via QR code" : "Chargé manuellement"}>
            {ordo.source === "email" ? "✉️" : ordo.source === "qrcode" ? "📱" : "⬇️"}
          </span>
          {/* Code patient */}
          {ordo.code_patient && (
            <span style={{
              fontSize: 11, fontWeight: 900, fontFamily: "monospace", letterSpacing: 1.5,
              color: isNew ? "#fff" : accent.avatar,
              background: "rgba(255,255,255,0.2)", borderRadius: 5,
              padding: "1px 5px", border: "1px solid rgba(255,255,255,0.35)",
            }}>
              {ordo.code_patient}
            </span>
          )}
        </div>
        <span style={{ fontSize: 8, color: isNew ? "rgba(255,255,255,0.8)" : accent.avatar + "99" }}>{timeAgo(ordo.receivedAt)}</span>
      </div>

      {/* Corps */}
      <div style={{ padding: "9px 11px 8px" }}>

        {/* Avatar + Nom */}
        <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 11 }}>
          <div style={{ position: "relative", flexShrink: 0 }}>
            <div style={{
              width: 33, height: 33, borderRadius: "50%",
              background: isNew ? accent.bandeau : accent.bg,
              border: `1.5px solid ${accent.border}`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 14, color: isNew ? "#fff" : accent.avatar, fontWeight: 900,
            }}>
            {initiale}
          </div>

          </div>
          <div style={{ marginTop: ordo.code_patient ? 5 : 0 }}>
            <div style={{ fontSize: 8, color: "#aaa", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 2 }}>Patient</div>
            <div style={{ fontSize: 13, fontWeight: 900, color: "#1a1a1a", lineHeight: 1.15, wordBreak: "break-word" }}>{nom}</div>
          </div>
        </div>

        {/* Carte vitale */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 8, color: "#aaa", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 4 }}>Ordonnance</div>
          {isLoading
            ? <div style={{ fontSize: 9, color: "#1a3a6e", animation: "pulse 1s ease infinite" }}>🔍 Analyse en cours…</div>
            : null
          }
        </div>

        {/* Intérêts offres du patient — voir OrdoGroup pour le même affichage
            côté groupe. Absent ici jusqu'au 27/07/2026 : cette carte gère le
            cas (majoritaire) d'un patient avec une seule ordonnance, jamais
            câblée avec les intérêts contrairement à OrdoGroup (plusieurs
            ordonnances) — le badge n'apparaissait donc jamais côté vendeur
            pour l'immense majorité des patients. */}
        {interets.length > 0 && (
          <div style={{ marginBottom: 11 }}>
            {interets.map(int => (
              <div key={int.id} style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "5px 9px", marginBottom: 4,
                background: "#fff8e1", borderRadius: 8,
                border: "1px solid #fde68a",
              }}>
                <span style={{ fontSize: 14 }}>{int.offre_emoji || "🎁"}</span>
                <div>
                  <div style={{ fontSize: 8, color: "#92400e", fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.4 }}>
                    Intéressé(e)
                  </div>
                  <div style={{ fontSize: 9, color: "#78350f", fontWeight: 600 }}>{int.offre_titre}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Miniature ordonnance si dispo */}
        {(ordo.attachments[0]?.dataUrl || ordo.attachments[0]?.path) && ordo.attachments[0].type === "image" && (
          <div style={{ marginBottom: 11, cursor: "pointer" }} onClick={onView}>
            <AttachmentThumb att={ordo.attachments[0]} style={{ width: "100%", height: 68, objectFit: "cover", borderRadius: 6, border: "1px solid #eee" }} />
          </div>
        )}
        {(ordo.attachments[0]?.dataUrl || ordo.attachments[0]?.path) && ordo.attachments[0].type === "pdf" && (
          <div onClick={onView} style={{ marginBottom: 11, background: "#f5f5f5", borderRadius: 6, padding: "8px", textAlign: "center", cursor: "pointer", border: "1px solid #eee" }}>
            <div style={{ fontSize: 18 }}>📄</div>
            <div style={{ fontSize: 8, color: "#888" }}>{truncateFilename(ordo.attachments[0].name)}</div>
          </div>
        )}
        {/* Photo iPhone (HEIC) : aucun navigateur de bureau ne peut la prévisualiser
            inline (icône brisée sinon) — état honnête, téléchargement via ViewerModal. */}
        {(ordo.attachments[0]?.dataUrl || ordo.attachments[0]?.path) && ordo.attachments[0].type === "heic" && (
          <div onClick={onView} style={{ marginBottom: 11, background: "#f5f5f5", borderRadius: 6, padding: "8px", textAlign: "center", cursor: "pointer", border: "1px solid #eee" }}>
            <div style={{ fontSize: 18 }}>📷</div>
            <div style={{ fontSize: 8, color: "#888" }}>{truncateFilename(ordo.attachments[0].name)}</div>
            <div style={{ fontSize: 8, color: "#aaa", marginTop: 2 }}>Photo iPhone (HEIC) — cliquer pour télécharger</div>
          </div>
        )}
      </div>

      {/* Actions — marginTop:"auto" les pousse toujours en bas de la carte
          (celle-ci est display:flex/column), quelle que soit la hauteur du
          contenu au-dessus (bandeau "intéressé(e)" présent ou non). */}
      <div style={{ marginTop: "auto", padding: "0 11px 11px", display: "flex", flexDirection: "column", gap: 5 }}>
        {/* Créer un rappel — seule sur sa ligne, au-dessus des autres boutons
            (retour direct du titulaire pilote, 04/09/2026) : un bouton texte
            explicite plutôt qu'une icône noyée parmi Voir/sonnette/
            téléchargement, accessible ici (vue Ordonnances, vendeur ET
            titulaire) et pas seulement depuis l'onglet Rappels réservé au
            titulaire. */}
        {onCreateRappel && (
          <button onClick={() => onCreateRappel(ordo)} style={{
            width: "100%", boxSizing: "border-box", padding: "9px", border: "1.5px solid rgba(26,58,110,0.3)",
            borderRadius: 7, background: "#f0f4ff", color: "#1a3a6e", fontWeight: 700, fontSize: 11,
            cursor: "pointer", fontFamily: "inherit",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
          }}>
            ⏰ Créer un rappel
          </button>
        )}
        {/* flexWrap (04/09/2026) — filet de sécurité : avec Voir + sonnette +
            téléchargement, 3 boutons icône fixes doivent maintenant cohabiter
            avec Imprimer à largeur fixe 50% (demande explicite, ne doit
            jamais rétrécir) sur une carte déjà réduite à 3/4 de sa taille
            d'origine. Sans wrap, ce quatrième bouton (téléchargement, ajouté
            après coup) pouvait faire déborder/écraser Voir. Voir est aussi
            passé d'un bouton flex:1 texte à un bouton icône de taille fixe,
            identique aux autres — sa largeur ne dépendait plus de rien
            d'autre auparavant, ce qui le rendait imprévisible visuellement. */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {/* Voir — affiché dès qu'un fichier existe (dataUrl EN DÉMO ou path
              EN PROD), pas seulement dataUrl : en prod le fichier n'a jamais
              de dataUrl (chargé à la demande via URL signée, voir
              AttachmentThumb plus haut), donc ce bouton ne s'affichait quasi
              jamais en usage réel — repéré en direct par le titulaire pilote
              (incohérence "le bouton Voir n'apparaît pas systématiquement"). */}
          {(ordo.attachments[0]?.dataUrl || ordo.attachments[0]?.path) ? (
            <button onClick={onView} title="Voir l'ordonnance" style={{
              padding: "10px 8px", border: "1.5px solid #e0e0e0", borderRadius: 7,
              background: "#fff", color: "#555", cursor: "pointer", fontSize: 14, fontFamily: "inherit",
            }}>👁</button>
          ) : (
            <div style={{ display: "flex", gap: 4 }}>
              <input ref={uploadRef} type="file" accept=".pdf,.jpg,.jpeg,.png" style={{ display: "none" }}
                  onChange={e => { const f = e.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = ev => onUpload(f, ev.target.result); r.readAsDataURL(f); }}/>
              {ordo.source === "email" && (
                <button onClick={() => { const url = generateOrdoPDF(ordo); window.open(url, "_blank", "noopener,noreferrer"); }}
                  title="Voir la fiche ordonnance PDF"
                  style={{ padding: "7px 8px", border: "1.5px solid #c7d2fe", borderRadius: 7, background: "#f0f4ff", color: "#4338ca", fontWeight: 700, fontSize: 9, cursor: "pointer", fontFamily: "inherit" }}>
                  📄
                </button>
              )}
            </div>
          )}
          {/* Bouton sonnette */}
          {onSonnette && sonnetteActive !== false && (
            <button onClick={onSonnette} title="Appeler le patient"
              style={{
                padding: "10px 8px", border: "1.5px solid rgba(26,58,110,0.3)",
                borderRadius: 7, background: "#f0f4ff", cursor: "pointer", fontSize: 14,
              }}>
              🔔
            </button>
          )}
          {/* Téléchargement direct du fichier */}
          {(ordo.attachments[0]?.dataUrl || ordo.attachments[0]?.path) && (
            <button onClick={handleDownload} disabled={downloading} title="Télécharger le fichier"
              style={{
                padding: "10px 8px", border: "1.5px solid rgba(26,58,110,0.3)",
                borderRadius: 7, background: "#f0f4ff", cursor: downloading ? "default" : "pointer", fontSize: 14,
                opacity: downloading ? 0.6 : 1,
              }}>
              {downloading ? "…" : "⬇️"}
            </button>
          )}
          {/* Imprimer occupe toujours la moitié de la largeur de la ligne
              (demande explicite) — width:"50%" plutôt que flex:1, sinon sa
              largeur dépend de ce qu'il y a à côté (Voir/upload, sonnette). */}
          <button onClick={onPrint} style={{
            width: "50%", flexShrink: 0, boxSizing: "border-box", padding: "10px 6px", border: "none", borderRadius: 7,
            background: isNew ? accent.bandeau : "#475569", color: "#fff",
            fontWeight: 800, fontSize: 11, cursor: "pointer", fontFamily: "inherit",
            boxShadow: isNew ? `0 4px 12px ${accent.avatar}55` : "none",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
          }}>
            🖨️ Imprimer
          </button>
        </div>
        {/* Bouton remettre à traiter — visible uniquement sur les ordonnances imprimées */}
        {!isNew && (
          <button onClick={onReopen} style={{
            width: "100%", padding: "5px", border: "1.5px solid #e6a817", borderRadius: 7,
            background: "#fffbf0", color: "#92400e", fontWeight: 700, fontSize: 9,
            cursor: "pointer", fontFamily: "inherit",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
          }}>
            ↩ Remettre à traiter
          </button>
        )}
      </div>
    </div>
  );
}

function OrdoRow({ id, ordo, onPrint, onView, onReopen, onSonnette, sonnetteActive, interets = [] }) {
  const isNew   = ordo.status === "nouveau";
  const nom     = ordo.extracted?.nom || ordo.fromName || "Patient";
  const email   = ordo.fromEmail || "";
  const accent  = getOrdoAccent(ordo.id);
  const hasFile = !!(ordo.attachments?.[0]?.dataUrl || ordo.attachments?.[0]?.path);
  const srcIcon = ordo.source === "email" ? "✉️" : ordo.source === "qrcode" ? "📱" : "⬇️";

  return (
    <div id={id} style={{
      background: isNew ? accent.bg + "55" : "#fff",
      borderRadius: 12, marginBottom: 6, padding: "12px 18px",
      display: "flex", alignItems: "center", gap: 14,
      border: `1.5px solid ${accent.border}`,
      boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
    }}>
      {/* Avatar avec code patient */}
      <div style={{ width: 44, height: 44, borderRadius: "50%", flexShrink: 0,
        background: isNew ? accent.bandeau : accent.bg,
        border: `2px solid ${accent.border}`,
        display: "flex", alignItems: "center", justifyContent: "center",
        color: isNew ? "#fff" : accent.avatar, fontWeight: 900,
        fontSize: 17,
        fontFamily: "inherit",
        letterSpacing: 0,
      }}>
        {ordo.code_patient
          ? <span style={{fontSize:11,fontWeight:900,fontFamily:"monospace",letterSpacing:0}}>{ordo.code_patient}</span>
          : nom?.charAt(0)?.toUpperCase() || "?"}
      </div>

      {/* Nom + email */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ fontWeight: 800, fontSize: 15, color: "#1a1a1a", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{nom}</div>
          {/* Badge intérêts — voir OrdoCard/OrdoGroup pour le détail complet, pas
              la place pour ça sur une ligne compacte */}
          {interets.length > 0 && (
            <span title={interets.map(i => i.offre_titre).join(', ')} style={{
              fontSize: 11, fontWeight: 800, padding: "2px 7px", flexShrink: 0,
              borderRadius: 20, background: "#fef3c7",
              color: "#92400e", border: "1px solid #fde68a",
            }}>
              🎯 {interets.length}
            </span>
          )}
        </div>
        {email && <div style={{ fontSize: 11, color: "#64748b", marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{email}</div>}
        <div style={{ fontSize: 10, color: "#aaa", marginTop: 1 }}>{timeAgo(ordo.receivedAt)}</div>
      </div>

      {/* Source + statut */}
      <span style={{ fontSize: 14, flexShrink: 0 }} title={ordo.source}>{srcIcon}</span>
      <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 10px", borderRadius: 20, flexShrink: 0,
        background: isNew ? "#fff8e1" : "#e8f5e9",
        color: isNew ? "#b7791f" : "#2e7d32",
        border: `1px solid ${isNew ? "#f6e05e" : "#a5d6a7"}` }}>
        {isNew ? "NOUVEAU" : "IMPRIMÉ"}
      </span>

      {/* Actions */}
      <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
        <button onClick={onView} disabled={!hasFile}
          style={{ padding: "6px 10px", border: `1.5px solid ${hasFile ? accent.border : "#e2e8f0"}`,
            borderRadius: 8, background: hasFile ? "#f8faff" : "#f5f5f5",
            color: hasFile ? accent.avatar : "#ccc", fontWeight: 700, fontSize: 13,
            cursor: hasFile ? "pointer" : "not-allowed", fontFamily: "inherit" }}>
          👁
        </button>
        {onSonnette && sonnetteActive !== false && (
          <button onClick={onSonnette} title="Appeler le patient"
            style={{ padding: "6px 10px", border: "1.5px solid rgba(26,58,110,0.3)",
              borderRadius: 8, background: "#f0f4ff", cursor: "pointer", fontSize: 15 }}>
            🔔
          </button>
        )}
        <button onClick={onPrint}
          style={{ padding: "6px 12px", border: "none", borderRadius: 8,
            background: isNew ? accent.bandeau : "#475569", color: "#fff",
            fontWeight: 800, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
          🖨️ Imprimer
        </button>
        {!isNew && (
          <button onClick={onReopen}
            style={{ padding: "6px 9px", border: "1.5px solid #e6a817", borderRadius: 8,
              background: "#fffbf0", color: "#92400e", fontWeight: 700, fontSize: 11,
              cursor: "pointer", fontFamily: "inherit" }}>↩</button>
        )}
      </div>
    </div>
  );
}



// ─── OrdoGroup — groupe d'ordonnances avec le même code patient ───────────────
function OrdoGroup({ id, group, onPrint, onView, onReopen, interets = [], onSonnette, sonnetteActive, onCreateRappel }) {
  // Statut du groupe = "nouveau" si AU MOINS UNE ordonnance est nouvelle
  const isNew      = group.ordonnances.some(o => o.status === "nouveau");
  const allImprime = group.ordonnances.every(o => o.status === "imprime");
  const nom    = group.extracted?.nom || group.fromName || "Patient";
  const accent = getOrdoAccent(group.id);
  const count  = group.ordonnances.length;

  return (
    <div id={id} style={{
      background: "#fff", borderRadius: 12, overflow: "hidden",
      boxShadow: isNew ? `0 4px 20px ${accent.avatar}22` : "0 1px 6px rgba(0,0,0,0.06)",
      border: allImprime ? "2px solid #bbf7d0" : isNew ? `2px solid ${accent.border}` : `2px solid ${accent.border}55`,
      // Même correctif que OrdoCard : sonnette/imprimer toujours en bas de la
      // carte (marginTop:"auto" sur les Actions plus bas), quel que soit le
      // nombre d'ordonnances du groupe ou la présence du badge intérêts.
      display: "flex", flexDirection: "column",
    }}>
      {/* Bandeau compact : statut | source | code | time */}
      {(()=>{ const allImprime = group.ordonnances.every(o=>o.status==="imprime"); return (
      <div style={{
        background: allImprime ? "#f0fdf4" : isNew ? accent.bandeau : accent.bg,
        padding: "5px 11px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 8, fontWeight: 800, letterSpacing: 0.6,
            color: allImprime ? "#15803d" : isNew ? "#fff" : accent.avatar }}>
            {allImprime ? "✓ TOUTES IMPRIMÉES" : isNew ? "NOUVEAU" : "EN COURS"}
          </span>
          <span style={{ fontSize: 9 }}>📱</span>
          {/* Code patient */}
          {group.code_patient && (
            <div style={{
              fontSize: 12, fontWeight: 900, padding: "2px 8px",
              borderRadius: 5, background: "rgba(255,255,255,0.25)",
              color: "#fff", fontFamily: "monospace", letterSpacing: 2.5,
              border: "1px solid rgba(255,255,255,0.4)",
            }}>
              {group.code_patient}
            </div>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{ fontSize: 8, color: allImprime ? "#15803d" : isNew ? "rgba(255,255,255,0.7)" : accent.avatar + "99" }}>
            {count} ordo{count > 1 ? "s" : ""} · {timeAgo(group.receivedAt)}
          </span>
        </div>
      </div>
      ); })()}

      {/* Corps */}
      <div style={{ padding: "9px 11px 8px" }}>
        {/* Avatar + Nom + Sonnette sur la même ligne */}
        <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 9 }}>
          <div style={{
            width: 33, height: 33, borderRadius: "50%",
            background: isNew ? accent.bandeau : accent.bg,
            border: `1.5px solid ${accent.border}`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 14, color: isNew ? "#fff" : accent.avatar, fontWeight: 900, flexShrink: 0,
          }}>{nom?.charAt(0)?.toUpperCase() || "?"}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 8, color: "#aaa", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 2 }}>Patient</div>
            <div style={{ fontSize: 13, fontWeight: 900, color: "#1a1a1a", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{nom}</div>
          </div>
          {/* Badge intérêts à droite du nom */}
          {interets.length > 0 && (
            <div style={{
              fontSize: 8, fontWeight: 800, padding: "2px 6px", flexShrink: 0,
              borderRadius: 15, background: "#fef3c7",
              color: "#92400e", border: "1px solid #fde68a",
            }}>
              🎯 {interets.length}
            </div>
          )}
        </div>

        {/* Intérêts offres du patient */}
        {interets.length > 0 && (
          <div style={{ marginBottom: 8 }}>
            {interets.map(int => (
              <div key={int.id} style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "5px 9px", marginBottom: 4,
                background: "#fff8e1", borderRadius: 8,
                border: "1px solid #fde68a",
              }}>
                <span style={{ fontSize: 14 }}>{int.offre_emoji || "🎁"}</span>
                <div>
                  <div style={{ fontSize: 8, color: "#92400e", fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.4 }}>
                    Intéressé(e) par
                  </div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#78350f" }}>
                    {int.offre_titre}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Liste des ordonnances du groupe — impression individuelle */}
        <div style={{ display: "flex", flexDirection: "column", gap: 5, marginBottom: 8 }}>
          {group.ordonnances.map((o, idx) => {
            const ordImprime = o.status === "imprime";
            return (
            <div key={o.id} style={{
              display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6,
              borderRadius: 6, padding: "5px 8px",
              background: ordImprime ? "#f0fdf4" : "#f8fafc",
              border: `1px solid ${ordImprime ? "#bbf7d0" : "#e2e8f0"}`,
            }}>
              <div style={{ fontSize: 9, fontWeight: 600, flex: 1, minWidth: 0,
                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                color: ordImprime ? "#15803d" : "#475569" }}>
                {ordImprime ? "✓" : "📎"} Ordonnance {idx + 1}
                {o.attachments?.[0]?.name && (
                  <span style={{ color: "#94a3b8", fontWeight: 400, marginLeft: 3 }}>
                    — {o.attachments[0].name}
                  </span>
                )}
              </div>
              <div style={{ display: "flex", gap: 4, alignItems: "center", flexShrink: 0 }}>
                {/* dataUrl OU path (04/09/2026, même correctif que OrdoCard) —
                    en prod le fichier n'a jamais de dataUrl, seulement path
                    (URL signée chargée à la demande). */}
                {(o.attachments?.[0]?.dataUrl || o.attachments?.[0]?.path) && (
                  <button onClick={() => onView(o)}
                    style={{ padding: "3px 6px", border: "1px solid #c7d2fe", borderRadius: 5,
                      background: "#f0f4ff", color: "#4338ca", fontSize: 8,
                      cursor: "pointer", fontFamily: "inherit" }}>
                    👁
                  </button>
                )}
                {!ordImprime ? (
                  <button onClick={() => onPrint(o)}
                    style={{ padding: "3px 8px", border: "none", borderRadius: 5,
                      background: accent.bandeau, color: "#fff", fontSize: 8,
                      cursor: "pointer", fontFamily: "inherit", fontWeight: 700 }}>
                    🖨️ Imprimer
                  </button>
                ) : (
                  <button onClick={() => onReopen(o)} title="Remettre à traiter"
                    style={{ padding: "3px 6px", border: "1px solid #e6a817", borderRadius: 5,
                      background: "#fffbf0", color: "#92400e", fontSize: 8, fontWeight: 700,
                      cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 2 }}>
                    ✓ ↩
                  </button>
                )}
              </div>
            </div>
            );
          })}
        </div>
      </div>

      {/* Footer fixe — sonnette toujours en bas (marginTop:"auto" nécessite
          que le conteneur soit display:flex/column, voir plus haut — c'était
          documenté comme l'intention ici mais jamais réellement appliqué). */}
      <div style={{ marginTop: "auto", padding: "0 11px 11px", display: "flex", flexDirection: "column", gap: 5 }}>
        {/* Créer un rappel — seule sur sa ligne, au-dessus des autres boutons
            (retour direct du titulaire pilote, 04/09/2026), un seul rappel
            par groupe/patient plutôt que par ordonnance individuelle. */}
        {onCreateRappel && (
          <button onClick={() => onCreateRappel(group)} style={{
            width: "100%", boxSizing: "border-box", padding: "9px", border: "1.5px solid rgba(26,58,110,0.3)",
            borderRadius: 7, background: "#f0f4ff", color: "#1a3a6e", fontWeight: 700, fontSize: 11,
            cursor: "pointer", fontFamily: "inherit",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
          }}>
            ⏰ Créer un rappel
          </button>
        )}
        <div style={{ display: "flex", gap: 6 }}>
          {onSonnette && sonnetteActive !== false && (
            <button onClick={onSonnette}
              title="Appeler le patient"
              style={{
                padding: "9px 11px", border: "1.5px solid rgba(26,58,110,0.3)",
                borderRadius: 7, background: "#f0f4ff", cursor: "pointer",
                fontSize: 14, flexShrink: 0, fontFamily: "inherit",
              }}>
              🔔
            </button>
          )}
          {/* Statut global */}
          <div style={{
            flex: 1, padding: "9px", borderRadius: 7,
            background: allImprime ? "#f0fdf4" : accent.bg,
            border: `1px solid ${allImprime ? "#bbf7d0" : accent.border}`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontWeight: 800, fontSize: 10,
            color: allImprime ? "#15803d" : accent.avatar,
          }}>
            {allImprime
              ? "✓ Toutes imprimées"
              : `${group.ordonnances.filter(o=>o.status==="nouveau").length} à imprimer`}
          </div>
        </div>
      </div>
    </div>
  );
}

export { AttachmentThumb, OrdoCard, OrdoRow, OrdoGroup };
