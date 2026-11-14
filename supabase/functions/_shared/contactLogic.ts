// ─── Formulaire de contact public (14/11/2026) ─────────────────────────────
// Logique pure (validation + construction de l'email), testée par vitest,
// utilisée par la fonction contact/index.ts. Aucune dépendance Deno ici.

export const SUJETS: Record<string, string> = {
  question: "Question sur OrdoMail",
  demo: "Demande de démonstration",
  tarifs: "Tarifs et abonnement",
  support: "Support technique",
  partenariat: "Partenariat",
  presse: "Presse",
  autre: "Autre demande",
};

export const LIMITES = { nom: 100, email: 200, telephone: 30, pharmacie: 150, message: 5000, messageMin: 10 };

export interface ContactSaisi {
  nom: string;
  email: string;
  telephone: string;
  pharmacie: string;
  sujet: string;
  message: string;
}

// Une seule ligne : pas de retour chariot (en-têtes d'email), espaces réduits.
function ligne(v: unknown, max: number): string {
  return String(v ?? "").replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

export function emailValide(email: string): boolean {
  return /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[a-z]{2,}$/i.test(email) && email.length <= LIMITES.email;
}

/** Nettoie et valide la saisie. Renvoie { ok:true, data } ou { ok:false, erreur }. */
export function validerContact(brut: Record<string, unknown>):
  { ok: true; data: ContactSaisi } | { ok: false; erreur: string } {
  const nom = ligne(brut.nom, LIMITES.nom);
  const email = ligne(brut.email, LIMITES.email).toLowerCase();
  const telephone = ligne(brut.telephone, LIMITES.telephone);
  const pharmacie = ligne(brut.pharmacie, LIMITES.pharmacie);
  const sujet = typeof brut.sujet === "string" && SUJETS[brut.sujet] ? brut.sujet : "autre";
  const message = String(brut.message ?? "").replace(/\r\n/g, "\n").trim().slice(0, LIMITES.message);
  if (!nom) return { ok: false, erreur: "Indiquez votre nom." };
  if (!emailValide(email)) return { ok: false, erreur: "Adresse email invalide." };
  if (telephone && !/^[+0-9 .()-]{6,30}$/.test(telephone)) return { ok: false, erreur: "Numéro de téléphone invalide." };
  if (message.length < LIMITES.messageMin) return { ok: false, erreur: "Votre message est trop court." };
  return { ok: true, data: { nom, email, telephone, pharmacie, sujet, message } };
}

/** Piège à robots : champ invisible rempli, ou formulaire envoyé en moins de 3 s. */
export function estRobot(brut: Record<string, unknown>, maintenant = Date.now()): boolean {
  if (String(brut.site ?? "").trim() !== "") return true;
  const ouvert = Number(brut.ouvertA);
  if (Number.isFinite(ouvert) && ouvert > 0 && maintenant - ouvert < 3000) return true;
  return false;
}

export function construireEmail(c: ContactSaisi, echapper: (s: string) => string): { sujet: string; html: string; text: string } {
  const libelle = SUJETS[c.sujet] || SUJETS.autre;
  const sujet = `[Contact site] ${libelle} — ${c.nom}`.slice(0, 200);
  const lignes: [string, string][] = [
    ["Nom", c.nom],
    ["Email", c.email],
    ["Téléphone", c.telephone || "—"],
    ["Pharmacie", c.pharmacie || "—"],
    ["Sujet", libelle],
  ];
  const html =
    `<p>Nouveau message reçu depuis le formulaire de contact du site.</p>` +
    `<table style="border-collapse:collapse">${lignes.map(([k, v]) =>
      `<tr><td style="padding:3px 12px 3px 0;color:#64748b">${k}</td><td style="padding:3px 0"><strong>${echapper(v)}</strong></td></tr>`).join("")}</table>` +
    `<p style="margin-top:16px"><strong>Message :</strong></p>` +
    `<p>${echapper(c.message).replace(/\n/g, "<br>")}</p>` +
    `<p style="color:#64748b;font-size:12px">Répondez directement à cet email pour écrire à ${echapper(c.email)}.</p>`;
  const text =
    `Nouveau message reçu depuis le formulaire de contact du site.\n\n` +
    lignes.map(([k, v]) => `${k} : ${v}`).join("\n") +
    `\n\nMessage :\n${c.message}\n\nRépondez directement à cet email pour écrire à ${c.email}.`;
  return { sujet, html, text };
}
