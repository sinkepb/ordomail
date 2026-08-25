// ─── Génération PDF et impression ───────────────────────────────────────────
import { PLAN_LIMITS } from "./plans.js";
import { escapeHtml } from "./utils.js";

function generateInvoiceHTML({ invoice, pharmacie, plan }) {
  const planInfo = PLAN_LIMITS[plan] || PLAN_LIMITS.starter;
  const tva = Math.round(invoice.amount * 0.20 * 100) / 100;
  const ht  = Math.round((invoice.amount - tva) * 100) / 100;
  // pharmacie.nom/adresse/email sont définis par le titulaire dans ses paramètres —
  // moins exposés qu'un champ patient, mais on échappe quand même par défense en profondeur.
  const safePhNom     = escapeHtml(pharmacie?.nom || "Pharmacie");
  const safePhAdresse = escapeHtml(pharmacie?.adresse || pharmacie?.email || "—");
  const safePhEmail   = escapeHtml(pharmacie?.email || "—");
  const safeDesc      = escapeHtml(invoice.desc || "Abonnement mensuel");
  const safeInvoiceId = escapeHtml(invoice.id);

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<title>Facture ${invoice.id} — OrdoMail</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #1a1a1a; background: #fff; padding: 40px 48px; }
  @media print {
    body { padding: 20px 28px; }
    .no-print { display: none !important; }
    @page { margin: 10mm; }
  }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 32px; padding-bottom: 20px; border-bottom: 3px solid #1a3a6e; }
  .logo { font-size: 28px; font-weight: 900; color: #1a3a6e; letter-spacing: -0.5px; }
  .logo-sub { font-size: 11px; color: #94a3b8; letter-spacing: 2px; margin-top: 2px; }
  .badge { background: #1a3a6e; color: #fff; font-size: 11px; font-weight: 800; padding: 4px 12px; border-radius: 20px; letter-spacing: 1px; margin-top: 8px; display: inline-block; }
  .meta { text-align: right; font-size: 12px; color: #64748b; line-height: 1.8; }
  .meta strong { color: #1a1a1a; font-size: 18px; display: block; margin-bottom: 4px; }
  .parties { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 32px; }
  .party-card { background: #f8fafc; border-radius: 10px; padding: 16px 18px; border-left: 4px solid #1a3a6e; }
  .party-label { font-size: 10px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 1.5px; margin-bottom: 8px; }
  .party-name { font-weight: 800; font-size: 15px; color: #1a1a1a; margin-bottom: 4px; }
  .party-info { font-size: 12px; color: #64748b; line-height: 1.7; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
  thead tr { background: #1a3a6e; }
  thead th { color: #fff; padding: 11px 14px; text-align: left; font-size: 11px; font-weight: 700; letter-spacing: 0.5px; }
  tbody tr { border-bottom: 1px solid #f1f5f9; }
  tbody tr:hover { background: #f8fafc; }
  tbody td { padding: 12px 14px; font-size: 13px; }
  .total-block { background: #f0f4ff; border-radius: 10px; padding: 16px 18px; margin-left: auto; width: 280px; }
  .total-row { display: flex; justify-content: space-between; margin-bottom: 6px; font-size: 13px; }
  .total-row.main { font-weight: 900; font-size: 16px; color: #1a3a6e; border-top: 2px solid #1a3a6e; padding-top: 10px; margin-top: 6px; }
  .status-badge { display: inline-block; background: #dcfce7; color: #166534; font-size: 11px; font-weight: 800; padding: 3px 10px; border-radius: 20px; margin-bottom: 20px; }
  .footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #e2e8f0; display: flex; justify-content: space-between; font-size: 10px; color: #94a3b8; }
  .print-btn { position: fixed; bottom: 24px; right: 24px; background: #1a3a6e; color: #fff; border: none; border-radius: 12px; padding: 12px 24px; font-size: 14px; font-weight: 700; cursor: pointer; font-family: inherit; box-shadow: 0 4px 16px rgba(26,58,110,0.4); }
</style>
</head>
<body>

<button class="no-print print-btn" onclick="window.print()">🖨️ Imprimer / Sauvegarder PDF</button>

<div class="header">
  <div>
    <div class="logo">💊 OrdoMail</div>
    <div class="logo-sub">PLATEFORME ORDONNANCES</div>
    <div class="badge">FACTURE</div>
  </div>
  <div class="meta">
    <strong>${safeInvoiceId}</strong>
    Émise le : ${invoice.date}<br>
    Échéance : ${invoice.date}<br>
    Période : ${safeDesc}
  </div>
</div>

<div class="status-badge">✓ PAYÉE</div>

<div class="parties">
  <div class="party-card">
    <div class="party-label">Émetteur</div>
    <div class="party-name">OrdoMail SAS</div>
    <div class="party-info">
      12 avenue de la Santé Numérique<br>
      75013 Paris, France<br>
      SIRET : 123 456 789 00012<br>
      TVA : FR 12 123456789<br>
      contact@ordomail.fr
    </div>
  </div>
  <div class="party-card">
    <div class="party-label">Client</div>
    <div class="party-name">${safePhNom}</div>
    <div class="party-info">
      ${safePhAdresse}<br>
      ${safePhEmail}<br>
      Plan : ${planInfo.icon} ${planInfo.label}
    </div>
  </div>
</div>

<table>
  <thead>
    <tr>
      <th>Description</th>
      <th>Période</th>
      <th style="text-align:right">Qté</th>
      <th style="text-align:right">P.U. HT</th>
      <th style="text-align:right">Total HT</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>
        <strong>OrdoMail ${planInfo.label}</strong><br>
        <span style="font-size:11px;color:#64748b">Abonnement mensuel — ${planInfo.maxPostes === 999 ? "Postes illimités" : planInfo.maxPostes + " postes"} · ${planInfo.maxOrdos === 99999 ? "Volume illimité" : planInfo.maxOrdos + " ordo/mois"}</span>
      </td>
      <td style="color:#64748b;font-size:12px">${safeDesc || "Mois en cours"}</td>
      <td style="text-align:right">1</td>
      <td style="text-align:right">${ht.toFixed(2)} €</td>
      <td style="text-align:right;font-weight:700">${ht.toFixed(2)} €</td>
    </tr>
  </tbody>
</table>

<div style="display:flex;justify-content:flex-end">
  <div class="total-block">
    <div class="total-row"><span>Sous-total HT</span><span>${ht.toFixed(2)} €</span></div>
    <div class="total-row"><span>TVA 20 %</span><span>${tva.toFixed(2)} €</span></div>
    <div class="total-row main"><span>Total TTC</span><span>${invoice.amount.toFixed(2)} €</span></div>
  </div>
</div>

<div class="footer">
  <span>OrdoMail SAS — Capital 10 000 € — RCS Paris 123 456 789</span>
  <span>Document généré le ${new Date().toLocaleDateString("fr-FR")} · Facture acquittée</span>
</div>

</body>
</html>`;
}

// ─── Ouvrir la facture dans un nouvel onglet ──────────────────────────────────
function openInvoicePDF(invoice, pharmacie, plan) {
  const html = generateInvoiceHTML({ invoice, pharmacie, plan });
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url  = URL.createObjectURL(blob);
  const win  = window.open(url, "_blank", "noopener,noreferrer");
  if (win) win.focus();
  // Révoquer après 60s
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

// ─── Génère un PDF d'ordonnance fictif (pour les ordonnances email démo) ──────
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


// ─── Planche imprimable de QR codes pré-générés (backoffice, 18/08/2026) ──────
// Même mécanisme de livraison que openInvoicePDF (Blob → nouvel onglet →
// bouton d'impression intégré) — voir QrCodesAdmin.jsx pour l'appelant.
// Les QR sont générés directement via le module "qrcode" vendorisé (comme
// QRCode.jsx) mais en boucle ici plutôt que via le composant React : un lot
// peut compter plusieurs centaines de codes, inutile de payer N cycles de
// montage/state React pour ça.
//
// SVG (pas PNG) : ces codes finissent sur des goodies physiques imprimés en
// grand format — un PNG figé à une largeur fixe deviendrait flou en agrandi.
// Le SVG est vectoriel, net à n'importe quelle taille d'impression. Le
// balisage <svg> vient entièrement de la bibliothèque "qrcode" à partir
// d'une URL que l'on construit nous-mêmes (baseUrl + token généré serveur,
// aucune saisie utilisateur) — pas de risque d'injection à l'interpoler
// directement dans le HTML généré, contrairement à c.code qui reste échappé.
async function generateQrSheetHTML(qrCodes, batchLabel) {
  const mod = await import("qrcode");
  const QR = mod.default || mod;
  const baseUrl = typeof window !== "undefined" ? window.location.origin : "https://ordomail.fr";

  const cells = await Promise.all((qrCodes || []).map(async (qr) => {
    const url = `${baseUrl}/?qr=${qr.token}`;
    const svg = await QR.toString(url, {
      type: "svg",
      errorCorrectionLevel: "M",
      margin: 2,
      color: { dark: "#000000", light: "#ffffff" },
    });
    return { code: escapeHtml(qr.code || ""), svg };
  }));

  const safeBatchLabel = escapeHtml(batchLabel || `Lot du ${new Date().toLocaleDateString("fr-FR")}`);

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<title>Planche QR codes — ${safeBatchLabel}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #1a1a1a; background: #fff; padding: 30px; }
  @media print {
    body { padding: 10mm; }
    .no-print { display: none !important; }
    @page { margin: 10mm; }
    .qr-cell { break-inside: avoid; }
  }
  .sheet-header { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 20px; padding-bottom: 12px; border-bottom: 2px solid #1a3a6e; }
  .sheet-title { font-size: 18px; font-weight: 900; color: #1a3a6e; }
  .sheet-meta { font-size: 12px; color: #64748b; }
  .qr-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
  .qr-cell { border: 1px dashed #cbd5e1; border-radius: 10px; padding: 14px 10px; text-align: center; }
  .qr-brand { font-size: 12px; font-weight: 800; color: #1a3a6e; margin-bottom: 6px; }
  .qr-cta { font-size: 10px; color: #64748b; margin-bottom: 10px; }
  .qr-cell svg { width: 100%; max-width: 160px; height: auto; display: block; margin: 0 auto; }
  .qr-code { margin-top: 8px; font-family: monospace; font-size: 11px; color: #94a3b8; letter-spacing: 1px; }
  .print-btn { position: fixed; bottom: 24px; right: 24px; background: #1a3a6e; color: #fff; border: none; border-radius: 12px; padding: 12px 24px; font-size: 14px; font-weight: 700; cursor: pointer; font-family: inherit; box-shadow: 0 4px 16px rgba(26,58,110,0.4); }
</style>
</head>
<body>

<button class="no-print print-btn" onclick="window.print()">🖨️ Imprimer / Sauvegarder PDF</button>

<div class="sheet-header">
  <div class="sheet-title">💊 OrdoMail — Planche QR codes</div>
  <div class="sheet-meta">${safeBatchLabel} · ${cells.length} code${cells.length > 1 ? "s" : ""}</div>
</div>

<div class="qr-grid">
  ${cells.map(c => `
  <div class="qr-cell">
    <div class="qr-brand">💊 OrdoMail</div>
    <div class="qr-cta">Scannez pour déposer votre ordonnance</div>
    ${c.svg}
    <div class="qr-code">${c.code}</div>
  </div>`).join("")}
</div>

</body>
</html>`;
}

async function openQrSheetPDF(qrCodes, batchLabel) {
  const html = await generateQrSheetHTML(qrCodes, batchLabel);
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url  = URL.createObjectURL(blob);
  const win  = window.open(url, "_blank", "noopener,noreferrer");
  if (win) win.focus();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

// ─── Affiche A4 imprimable (QR codes pré-imprimés, 25/08/2026) ────────────────
// Identité visuelle distincte du sticker de sol (src/lib/sticker.js) — reprise
// du projet Claude Design "Pharmacie Argenteuil OrdoMail" (Affiche A4
// PharmScan.dc.html) : vert clair/blanc, Bricolage Grotesque + Manrope,
// pensée pour un affichage mural au format A4 avec les 3 étapes du dépôt.
// Toutes les dimensions en px reprennent celles du fichier source (conçu
// pour tenir sur une page A4 de 793×1123px à 96dpi) — ne pas les modifier
// sans revérifier que le contenu tient toujours sur une seule page.
async function generatePosterHTML({ url, pharmacieName }) {
  const mod = await import("qrcode");
  const QR = mod.default || mod;
  const qrSvg = await QR.toString(url, {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 0,
    color: { dark: "#0B1F16", light: "#ffffff" },
  });
  const brand = escapeHtml((pharmacieName || "OrdoMail").toUpperCase());

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<title>Affiche A4 — Scannez pour envoyer votre ordonnance</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400;12..96,600;12..96,700;12..96,800&family=Manrope:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  @page { size: A4; margin: 0; }
  @media print { .no-print { display: none !important; } }
  body { background: #ccc; font-family: 'Manrope', sans-serif; }
  .sheet {
    position: relative;
    width: 793px; height: 1123px;
    margin: 0 auto;
    background: #F5F8F5;
    color: #12241C;
    overflow: hidden;
    display: flex; flex-direction: column; align-items: center;
    padding: 42px 46px 38px;
  }
  .print-btn { position: fixed; top: 20px; right: 20px; background: #0B7A54; color: #fff; border: none; border-radius: 12px; padding: 12px 24px; font-size: 14px; font-weight: 700; cursor: pointer; font-family: inherit; box-shadow: 0 4px 16px rgba(11,122,84,0.35); }
</style>
</head>
<body>

<button class="no-print print-btn" onclick="window.print()">🖨️ Imprimer / Enregistrer en PDF</button>

<div class="sheet">
  <div style="position:absolute;inset:0;background:radial-gradient(120% 34% at 50% -6%, rgba(22,192,121,0.16), transparent 62%), radial-gradient(110% 26% at 50% 106%, rgba(11,122,84,0.12), transparent 62%);pointer-events:none;"></div>
  <div style="position:absolute;inset:20px;border:2px solid rgba(11,122,84,0.16);border-radius:22px;pointer-events:none;"></div>

  <div style="position:relative;display:flex;align-items:center;gap:10px;">
    <div style="position:relative;width:22px;height:22px;flex:none;">
      <div style="position:absolute;left:7px;top:0;width:7px;height:22px;background:#16C079;border-radius:2px;"></div>
      <div style="position:absolute;top:7px;left:0;width:22px;height:7px;background:#16C079;border-radius:2px;"></div>
    </div>
    <span style="font-family:'Manrope';font-weight:800;letter-spacing:0.2em;font-size:13px;color:#0B7A54;text-transform:uppercase;">${brand}</span>
  </div>

  <div style="position:relative;text-align:center;margin-top:22px;display:flex;align-items:baseline;justify-content:center;gap:12px;white-space:nowrap;">
    <span style="font-family:'Bricolage Grotesque';font-weight:800;font-size:72px;line-height:0.95;letter-spacing:-0.02em;color:#12241C;">GAGNEZ</span>
    <span style="font-family:'Bricolage Grotesque';font-weight:800;font-size:72px;line-height:0.95;letter-spacing:-0.03em;color:#090909;">DU</span>
    <span style="font-family:'Bricolage Grotesque';font-weight:800;font-size:98px;line-height:0.95;letter-spacing:-0.03em;color:#16C079;">TEMPS</span>
  </div>

  <p style="position:relative;text-align:center;margin:12px 0 0;font-family:'Bricolage Grotesque';font-weight:700;font-size:44px;line-height:1.1;letter-spacing:-0.01em;color:#2E4B3F;white-space:nowrap;">ENVOYEZ VOTRE ORDONNANCE</p>

  <div style="position:relative;display:flex;flex-direction:column;align-items:center;margin-top:14px;">
    <div style="display:flex;align-items:center;gap:10px;background:#ffffff;border:2px solid rgba(11,122,84,0.14);border-radius:999px;padding:8px 18px 8px 12px;box-shadow:0 8px 22px rgba(11,122,84,0.12);">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#0B7A54" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h3l1.4-2h7.2L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"></path><circle cx="12" cy="13" r="3.6"></circle></svg>
      <span style="font-family:'Manrope';font-weight:700;font-size:15px;color:#12241C;">Ouvrez l'appareil photo et scannez</span>
    </div>
    <svg width="24" height="30" viewBox="0 0 24 30" fill="none" stroke="#16C079" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round" style="margin-top:8px;"><path d="M12 3v19"></path><path d="M4 16l8 9 8-9"></path></svg>
  </div>

  <div style="position:relative;width:360px;height:360px;background:#ffffff;border-radius:26px;box-shadow:0 20px 46px rgba(11,122,84,0.20);display:flex;align-items:center;justify-content:center;margin-top:8px">
    <div style="position:absolute;top:12px;left:12px;width:26px;height:26px;border-top:4px solid #16C079;border-left:4px solid #16C079;border-top-left-radius:10px;"></div>
    <div style="position:absolute;top:12px;right:12px;width:26px;height:26px;border-top:4px solid #16C079;border-right:4px solid #16C079;border-top-right-radius:10px;"></div>
    <div style="position:absolute;bottom:12px;left:12px;width:26px;height:26px;border-bottom:4px solid #16C079;border-left:4px solid #16C079;border-bottom-left-radius:10px;"></div>
    <div style="position:absolute;bottom:12px;right:12px;width:26px;height:26px;border-bottom:4px solid #16C079;border-right:4px solid #16C079;border-bottom-right-radius:10px;"></div>
    <div style="width:310px;height:310px;">${qrSvg}</div>
  </div>

  <div style="position:relative;display:flex;flex-direction:column;gap:10px;margin-top:14px;width:100%;padding:0 36px;">
    <div style="display:flex;align-items:center;gap:16px;">
      <div style="width:42px;height:42px;flex:none;border-radius:50%;background:#0B7A54;color:#ffffff;display:flex;align-items:center;justify-content:center;font-family:'Bricolage Grotesque';font-weight:800;font-size:22px;">1</div>
      <div style="font-family:'Manrope';font-weight:700;font-size:19px;line-height:1.2;color:#12241C;">Scannez le QR Code</div>
    </div>
    <div style="display:flex;align-items:center;gap:16px;">
      <div style="width:42px;height:42px;flex:none;border-radius:50%;background:#0B7A54;color:#ffffff;display:flex;align-items:center;justify-content:center;font-family:'Bricolage Grotesque';font-weight:800;font-size:22px;">2</div>
      <div style="font-family:'Manrope';font-weight:700;font-size:19px;line-height:1.2;color:#12241C;">Déposez votre ordonnance</div>
    </div>
    <div style="display:flex;align-items:center;gap:16px;">
      <div style="width:42px;height:42px;flex:none;border-radius:50%;background:#0B7A54;color:#ffffff;display:flex;align-items:center;justify-content:center;font-family:'Bricolage Grotesque';font-weight:800;font-size:22px;">3</div>
      <div style="font-family:'Manrope';font-weight:700;font-size:19px;line-height:1.2;color:#12241C;">Attendez votre tour</div>
    </div>
  </div>
</div>

</body>
</html>`;
}

async function openPosterPDF({ url, pharmacieName }) {
  const html = await generatePosterHTML({ url, pharmacieName });
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const dlUrl = URL.createObjectURL(blob);
  const win = window.open(dlUrl, "_blank", "noopener,noreferrer");
  if (win) win.focus();
  setTimeout(() => URL.revokeObjectURL(dlUrl), 60000);
}

// ═══════════════════════════════════════════════════════════════════════════════

export { generateInvoiceHTML, openInvoicePDF, generateOrdoPDF, generateQrSheetHTML, openQrSheetPDF, generatePosterHTML, openPosterPDF };
