// ─── Génération PDF et impression ───────────────────────────────────────────
import { PLAN_LIMITS } from "./plans.js";

function generateInvoiceHTML({ invoice, pharmacie, plan }) {
  const planInfo = PLAN_LIMITS[plan] || PLAN_LIMITS.starter;
  const tva = Math.round(invoice.amount * 0.20 * 100) / 100;
  const ht  = Math.round((invoice.amount - tva) * 100) / 100;

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
    <strong>${invoice.id}</strong>
    Émise le : ${invoice.date}<br>
    Échéance : ${invoice.date}<br>
    Période : ${invoice.desc || "Abonnement mensuel"}
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
    <div class="party-name">${pharmacie?.nom || "Pharmacie"}</div>
    <div class="party-info">
      ${pharmacie?.adresse || pharmacie?.email || "—"}<br>
      ${pharmacie?.email || "—"}<br>
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
      <td style="color:#64748b;font-size:12px">${invoice.desc || "Mois en cours"}</td>
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
  const win  = window.open(url, "_blank");
  if (win) win.focus();
  // Révoquer après 60s
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

// ─── Génère un PDF d'ordonnance fictif (pour les ordonnances email démo) ──────
function generateOrdoPDF(ordo) {
  const nom = ordo.extracted?.nom || ordo.fromName || "Patient";
  const cv  = ordo.extracted?.carteVitale || "Non disponible";
  const med = ordo.extracted?.medecin || "Dr Inconnu";
  const dat = ordo.extracted?.date || new Date().toLocaleDateString("fr-FR");
  const meds = (ordo.extracted?.medicaments || []).join(", ") || "—";
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
  ${(ordo.extracted?.medicaments || []).map(m => `<div class="med-item">▸ ${m}</div>`).join("") || '<div class="med-item" style="color:#aaa">Aucun médicament extrait</div>'}
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


function CVBadge({ numero, color = "#15623a" }) {
  if (!numero) return <span style={{ color: "#bbb", fontSize: 12, fontStyle: "italic" }}>Non extrait</span>;
  // Formater le numéro en groupes lisibles : X XX XX XX XXX XXX XX
  const fmt = (n) => n.replace(/\s/g,"").replace(/(.{1})(.{2})(.{2})(.{2})(.{3})(.{3})(.{2})/, "$1 $2 $3 $4 $5 $6 $7").trim();
  const formatted = fmt(numero) || numero;
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 6,
      background: `${color}14`, border: `1.5px solid ${color}44`,
      borderRadius: 8, padding: "5px 10px",
      minWidth: 0, overflow: "hidden",
    }}>
      <span style={{ fontSize: 14, flexShrink: 0 }}>💳</span>
      <span style={{
        fontFamily: "monospace", fontSize: 12, fontWeight: 700,
        color: color, letterSpacing: 0.5,
        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        minWidth: 0,
      }}>{formatted}</span>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════

export { generateInvoiceHTML, openInvoicePDF, generateOrdoPDF };
