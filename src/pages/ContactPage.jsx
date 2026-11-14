// ─── Page de contact publique (14/11/2026, demande titulaire) ──────────────
// Le message part par la fonction serveur `contact` (supabase/functions/
// contact), qui l'envoie par email à l'équipe. L'adresse de destination n'est
// volontairement PAS dans ce fichier : elle reste côté serveur (secret
// CONTACT_EMAIL), à l'abri des robots qui moissonnent les pages web.
import { useState, useRef } from "react";
import { C } from "../lib/utils.js";
import { PersistentNav } from "./LandingPage.jsx";

const SUJETS = [
  ["question", "Question sur OrdoMail"],
  ["demo", "Demande de démonstration"],
  ["tarifs", "Tarifs et abonnement"],
  ["support", "Support technique"],
  ["partenariat", "Partenariat"],
  ["presse", "Presse"],
  ["autre", "Autre demande"],
];

async function envoyerContact(payload) {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("L'envoi n'est pas disponible en mode démonstration.");
  let res;
  try {
    res = await fetch(`${url}/functions/v1/contact`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: key, Authorization: `Bearer ${key}` },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new Error("Connexion impossible. Vérifiez votre accès à internet et réessayez.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Le message n'a pas pu être envoyé. Réessayez dans quelques minutes.");
  return data;
}

const champ = {
  width: "100%", padding: "12px 14px", border: `1.5px solid ${C.border}`, borderRadius: 10,
  fontSize: 16, fontFamily: "inherit", color: C.ink, background: "#fff", outline: "none", boxSizing: "border-box",
};
const etiquette = { display: "block", fontSize: 13.5, fontWeight: 700, color: C.ink, marginBottom: 6 };

function ContactPage({ onBack, onGoToLegal, sujetInitial = "question" }) {
  const ouvertA = useRef(Date.now());
  const [f, setF] = useState({ nom: "", email: "", telephone: "", pharmacie: "", sujet: sujetInitial, message: "", site: "" });
  const [etat, setEtat] = useState("saisie"); // saisie | envoi | envoye
  const [erreur, setErreur] = useState("");
  const maj = (k) => (e) => setF(p => ({ ...p, [k]: e.target.value }));

  async function soumettre(e) {
    e.preventDefault();
    setErreur("");
    if (!f.nom.trim()) return setErreur("Indiquez votre nom.");
    if (!/^\S+@\S+\.\S{2,}$/.test(f.email.trim())) return setErreur("Indiquez une adresse email valide, pour que nous puissions vous répondre.");
    if (f.message.trim().length < 10) return setErreur("Votre message est un peu court : dites-nous en quelques mots ce dont vous avez besoin.");
    setEtat("envoi");
    try {
      await envoyerContact({ ...f, ouvertA: ouvertA.current });
      setEtat("envoye");
    } catch (err) {
      setErreur(err.message);
      setEtat("saisie");
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: C.surface, fontFamily: "'Inter', system-ui, sans-serif" }}>
      <PersistentNav onBack={onBack} />
      <div style={{ maxWidth: 1000, margin: "0 auto", padding: "40px 16px 64px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 340px), 1fr))", gap: 32, alignItems: "start" }}>
        <div>
          <div style={{ display: "inline-block", background: C.navyL, color: C.navy, fontSize: 11, fontWeight: 800, letterSpacing: 1.5, padding: "5px 14px", borderRadius: 20, marginBottom: 16 }}>CONTACT</div>
          <h1 style={{ fontSize: "clamp(26px, 6vw, 38px)", fontWeight: 900, color: C.ink, margin: "0 0 14px", lineHeight: 1.15 }}>Parlons de votre officine</h1>
          <p style={{ fontSize: 16.5, color: C.slate, lineHeight: 1.7, margin: "0 0 26px" }}>
            Une question, une démonstration, un besoin particulier ? Écrivez-nous : un membre de l'équipe vous répond personnellement, en général sous 24 heures ouvrées.
          </p>
          {[
            ["🎥", "Une démonstration", "Nous vous montrons OrdoMail en 20 minutes, sur votre propre cas."],
            ["🔔", "Les renouvellements", "Comment relancer vos patients par SMS sans y passer de temps."],
            ["🛠️", "Une aide technique", "Un souci avec votre compte ou votre affiche QR ? Décrivez-le, on s'en occupe."],
          ].map(([i, t, d]) => (
            <div key={t} style={{ display: "flex", gap: 12, marginBottom: 16 }}>
              <div style={{ width: 40, height: 40, borderRadius: 12, background: "#fff", border: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 19, flexShrink: 0 }}>{i}</div>
              <div>
                <div style={{ fontWeight: 800, fontSize: 15, color: C.ink }}>{t}</div>
                <div style={{ fontSize: 14, color: C.slate, lineHeight: 1.55 }}>{d}</div>
              </div>
            </div>
          ))}
        </div>

        <div style={{ background: "#fff", borderRadius: 18, border: `1px solid ${C.border}`, boxShadow: "0 12px 40px rgba(15,35,71,0.08)", padding: "26px 22px" }}>
          {etat === "envoye" ? (
            <div role="status" style={{ textAlign: "center", padding: "30px 6px" }}>
              <div style={{ fontSize: 46, marginBottom: 12 }}>✅</div>
              <h2 style={{ fontSize: 22, fontWeight: 900, color: C.ink, margin: "0 0 10px" }}>Message envoyé, merci !</h2>
              <p style={{ fontSize: 15, color: C.slate, lineHeight: 1.65, margin: "0 0 22px" }}>
                Nous l'avons bien reçu et nous vous répondons à <strong>{f.email.trim()}</strong>, en général sous 24 heures ouvrées.
              </p>
              <button onClick={onBack} style={{ padding: "12px 22px", border: "none", borderRadius: 10, background: C.navy, color: "#fff", fontWeight: 700, fontSize: 15, cursor: "pointer", fontFamily: "inherit" }}>Retour à l'accueil</button>
            </div>
          ) : (
            <form onSubmit={soumettre} noValidate>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 200px), 1fr))", gap: 14, marginBottom: 14 }}>
                <div>
                  <label htmlFor="c-nom" style={etiquette}>Nom et prénom *</label>
                  <input id="c-nom" autoComplete="name" value={f.nom} onChange={maj("nom")} maxLength={100} style={champ} />
                </div>
                <div>
                  <label htmlFor="c-email" style={etiquette}>Email *</label>
                  <input id="c-email" type="email" autoComplete="email" inputMode="email" value={f.email} onChange={maj("email")} maxLength={200} style={champ} />
                </div>
                <div>
                  <label htmlFor="c-tel" style={etiquette}>Téléphone <span style={{ fontWeight: 400, color: C.muted }}>(facultatif)</span></label>
                  <input id="c-tel" type="tel" autoComplete="tel" inputMode="tel" value={f.telephone} onChange={maj("telephone")} maxLength={30} style={champ} />
                </div>
                <div>
                  <label htmlFor="c-ph" style={etiquette}>Pharmacie <span style={{ fontWeight: 400, color: C.muted }}>(facultatif)</span></label>
                  <input id="c-ph" autoComplete="organization" value={f.pharmacie} onChange={maj("pharmacie")} maxLength={150} style={champ} />
                </div>
              </div>
              <div style={{ marginBottom: 14 }}>
                <label htmlFor="c-sujet" style={etiquette}>Sujet</label>
                <select id="c-sujet" value={f.sujet} onChange={maj("sujet")} style={{ ...champ, appearance: "auto" }}>
                  {SUJETS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
              </div>
              <div style={{ marginBottom: 14 }}>
                <label htmlFor="c-msg" style={etiquette}>Message *</label>
                <textarea id="c-msg" value={f.message} onChange={maj("message")} rows={6} maxLength={5000}
                  placeholder="Ex. : nous sommes une officine de 6 personnes et souhaitons voir comment fonctionnent les rappels de renouvellement."
                  style={{ ...champ, resize: "vertical", lineHeight: 1.55 }} />
              </div>
              {/* Piège à robots : invisible pour un humain, ignoré par les lecteurs d'écran */}
              <div aria-hidden="true" style={{ position: "absolute", left: "-10000px", width: 1, height: 1, overflow: "hidden" }}>
                <label htmlFor="c-site">Ne pas remplir</label>
                <input id="c-site" tabIndex={-1} autoComplete="off" value={f.site} onChange={maj("site")} />
              </div>
              {erreur && (
                <div role="alert" style={{ background: "#fef2f2", border: "1px solid #fecaca", color: "#991b1b", borderRadius: 10, padding: "10px 14px", fontSize: 14, marginBottom: 14, lineHeight: 1.5 }}>{erreur}</div>
              )}
              <button type="submit" disabled={etat === "envoi"} style={{ width: "100%", padding: "14px", border: "none", borderRadius: 12, background: C.navy, color: "#fff", fontWeight: 800, fontSize: 16, cursor: etat === "envoi" ? "wait" : "pointer", fontFamily: "inherit", opacity: etat === "envoi" ? 0.7 : 1 }}>
                {etat === "envoi" ? "Envoi en cours…" : "Envoyer mon message"}
              </button>
              <p style={{ fontSize: 12, color: C.muted, lineHeight: 1.6, margin: "14px 0 0" }}>
                Vos coordonnées servent uniquement à vous répondre et ne sont utilisées à aucune autre fin. Ne joignez aucune ordonnance ni donnée de santé à ce message.
                {onGoToLegal && <> <button type="button" onClick={() => onGoToLegal("confidentialite")} style={{ background: "none", border: "none", padding: 0, color: C.navy, textDecoration: "underline", cursor: "pointer", fontSize: 12, fontFamily: "inherit" }}>Politique de confidentialité</button></>}
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

export { ContactPage };
export default ContactPage;
