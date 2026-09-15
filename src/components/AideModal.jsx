// ─── Module d'aide (14/09/2026) ────────────────────────────────────────────
// FAQ cherchable + formulaire "poser une question" (envoyé par email à
// contact@ordomail.fr via secure-data:aide_poser_question), accessible au
// titulaire et au vendeur depuis le bouton flottant du Dashboard. Contenu
// FAQ figé dans ce fichier (pas de table dédiée) : volume faible, mise à
// jour par un déploiement de code comme le reste de l'app plutôt que par un
// back-office de contenu — cohérent avec le principe "pas de complexité pour
// un besoin qui n'existe pas encore" du projet.
import { useMemo, useState } from "react";
import { callSecureData } from "../supabase.js";

const FAQ = [
  {
    categorie: "Connexion & postes",
    items: [
      { q: "Comment se connecter avec mon code PIN ?", r: "Sur l'écran de connexion, choisissez votre pharmacie puis entrez le code à 4 chiffres de votre poste (ou le code unique de la pharmacie, selon le mode configuré par le titulaire)." },
      { q: "J'ai oublié mon code PIN, que faire ?", r: "Seul le titulaire peut voir et modifier les codes PIN, depuis Paramètres → Postes. Demandez-lui de vérifier ou réinitialiser votre code." },
      { q: "Comment ajouter ou désactiver un poste ?", r: "Le titulaire gère les postes depuis Paramètres → Postes : bouton \"+ Ajouter un poste\" pour en créer un, interrupteur actif/inactif pour désactiver un poste sans le supprimer. Le nombre de postes actifs est limité selon le plan d'abonnement." },
      { q: "Quelle est la différence entre \"PIN unique\" et \"PIN multi-poste\" ?", r: "En mode multi-poste (par défaut), chaque poste a son propre code et son propre nom affiché sur les ordonnances imprimées. En mode PIN unique, un seul code sert pour toute l'équipe, sans distinction de poste — pratique pour les petites équipes. Le titulaire bascule entre les deux dans Paramètres → Postes." },
    ],
  },
  {
    categorie: "Ordonnances",
    items: [
      { q: "Comment une ordonnance arrive-t-elle dans OrdoMail ?", r: "Le patient scanne le QR code de la pharmacie (sticker, affiche ou badge NFC) avec son téléphone, puis envoie le fichier de son ordonnance électronique reçue par email de son médecin. Elle apparaît alors automatiquement dans l'onglet Ordonnances, statut \"Nouveau\"." },
      { q: "Comment imprimer une ordonnance reçue ?", r: "Ouvrez l'ordonnance dans l'onglet Ordonnances puis cliquez sur \"Imprimer\". Une fois confirmée comme imprimée, elle passe au statut \"Imprimé\" et le nom du poste qui l'a traitée est enregistré." },
      { q: "Une ordonnance ne s'affiche pas alors que le patient dit l'avoir envoyée", r: "Vérifiez d'abord votre connexion internet et rafraîchissez la page. Si le problème persiste, demandez au patient de renvoyer le fichier via le QR code (< 10 Mo) — en dernier recours, contactez le support via ce module d'aide." },
      { q: "Combien de temps les ordonnances sont-elles conservées ?", r: "Les ordonnances (fichier et données) sont automatiquement supprimées après quelques jours pour limiter la conservation de données de santé, conformément à la politique de confidentialité. Imprimez ou traitez chaque ordonnance rapidement après réception." },
    ],
  },
  {
    categorie: "Rappels de renouvellement (SMS)",
    items: [
      { q: "Comment créer un rappel de renouvellement pour un patient ?", r: "Dans l'onglet Rappels, cliquez sur \"+ Nouveau rappel\", renseignez le nom du patient, son téléphone et la date de renouvellement de son ordonnance. Le SMS avec le lien pour renouveler ou non part automatiquement environ 7 jours avant cette date." },
      { q: "Quand exactement le SMS de rappel est-il envoyé ?", r: "Le SMS part automatiquement 7 jours avant la date de renouvellement que vous avez saisie à la création du rappel — pas besoin de le déclencher manuellement." },
      { q: "Le patient dit ne pas avoir reçu le SMS", r: "Vérifiez le numéro de téléphone saisi (format français à 10 chiffres). Depuis la fiche du rappel, vous pouvez renvoyer le lien. Si le souci persiste, contactez le support." },
      { q: "Qu'est-ce que le quota de SMS inclus et que se passe-t-il s'il est dépassé ?", r: "Le plan Performance inclut 200 SMS de rappel par mois. Au-delà, vous pouvez acheter un pack de 100 SMS supplémentaires (10 € TTC) directement depuis l'onglet Rappels, où votre consommation du mois est affichée en temps réel." },
      { q: "Pourquoi je ne vois pas l'onglet Rappels ?", r: "Les rappels de renouvellement sont réservés au plan Performance. Si votre plan est Essentiel ou Fluidité, un message d'upgrade s'affiche à la place — contactez-nous si vous souhaitez changer de plan." },
    ],
  },
  {
    categorie: "QR code, sticker & affiche",
    items: [
      { q: "Comment imprimer ou télécharger l'affiche QR code de ma pharmacie ?", r: "Depuis Paramètres → QR code (titulaire uniquement), choisissez le format (A4 ou A3) et l'orientation (portrait ou paysage), puis \"Enregistrer en PDF\" — l'affiche est générée avec le QR code unique de votre pharmacie, prête à imprimer vous-même." },
      { q: "Le sticker QR code de la pharmacie est abîmé ou ne scanne plus", r: "Vous pouvez réimprimer une affiche vous-même depuis Paramètres → QR code (voir ci-dessus). Pour un sticker de sol abîmé, contactez le support via ce module d'aide en précisant le code inscrit dessus (format QR-XXXXXX) si vous l'avez encore : un remplacement vous sera envoyé." },
      { q: "Où placer le sticker ou l'affiche pour de meilleurs résultats ?", r: "À hauteur des yeux, dans un endroit bien éclairé et facilement accessible pour un patient qui patiente (comptoir, vitrine, salle d'attente). Évitez le reflet direct de la lumière sur le QR code." },
    ],
  },
  {
    categorie: "Offres & Stories",
    items: [
      { q: "Comment publier une offre ou une story du jour ?", r: "Dans l'onglet Offres, cliquez sur \"+ Nouvelle offre\", renseignez le titre, l'emoji et éventuellement une image. Elle apparaîtra automatiquement aux patients qui consultent leur suivi." },
      { q: "Pourquoi je ne vois pas l'onglet Offres ?", r: "Les Offres/Stories font partie des plans Fluidité et Performance. Sur le plan Essentiel, cet onglet n'est pas disponible." },
    ],
  },
  {
    categorie: "Compte, abonnement & facturation",
    items: [
      { q: "Comment changer de plan (upgrade/downgrade) ?", r: "Dans Paramètres → Compte, section abonnement. Un passage à un plan supérieur est immédiat ; un passage à un plan inférieur prend effet à la fin de la période en cours (vous gardez les fonctionnalités actuelles jusque-là)." },
      { q: "Comment résilier mon abonnement ?", r: "Dans Paramètres → Compte, bouton de gestion de l'abonnement (portail de paiement sécurisé). La résiliation prend effet à la fin de la période déjà payée — vous gardez l'accès jusqu'à cette date, et un email de confirmation vous est envoyé. Vous pouvez annuler cette résiliation avant l'échéance depuis le même portail (email de confirmation également)." },
      { q: "Mon abonnement est résilié, puis-je encore me connecter ?", r: "Non : une fois la résiliation effective (fin de la période déjà payée), l'accès au tableau de bord est bloqué. Reconnectez-vous et suivez l'écran de réabonnement pour retrouver l'accès à tout moment." },
      { q: "Où trouver mes factures ?", r: "Dans Paramètres → Compte, section Factures : toutes vos factures sont téléchargeables au format PDF, avec le SIRET de la pharmacie." },
      { q: "Pourquoi le SIRET est-il obligatoire ?", r: "Le SIRET est requis pour émettre des factures conformes (mentions légales obligatoires pour une pharmacie). Sans SIRET renseigné dans Paramètres → Compte, la souscription à un abonnement est bloquée." },
    ],
  },
  {
    categorie: "Dépannage général",
    items: [
      { q: "La page reste blanche ou ne charge pas", r: "Rafraîchissez la page (F5 ou glisser vers le bas sur mobile). Si le problème persiste, vérifiez votre connexion internet, essayez un autre navigateur, ou contactez le support." },
      { q: "Je ne trouve pas ma réponse ici, que faire ?", r: "Utilisez le formulaire \"Poser une question\" ci-dessous : votre message part directement à l'équipe support avec le nom de votre pharmacie, vous recevrez une réponse par email." },
    ],
  },
];

function AideModal({ posteNom, onClose }) {
  const [search, setSearch] = useState("");
  const [openKey, setOpenKey] = useState(null);
  const [question, setQuestion] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return FAQ;
    return FAQ
      .map(cat => ({ ...cat, items: cat.items.filter(it => (it.q + " " + it.r).toLowerCase().includes(s)) }))
      .filter(cat => cat.items.length > 0);
  }, [search]);

  async function handleSend() {
    if (!question.trim()) return;
    setSending(true); setError("");
    try {
      await callSecureData("aide_poser_question", { question: question.trim(), posteNom });
      setSent(true);
      setQuestion("");
    } catch (e) {
      setError("Échec de l'envoi : " + e.message);
    }
    setSending(false);
  }

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2000, padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 20, width: "100%", maxWidth: 560, maxHeight: "88vh", display: "flex", flexDirection: "column", boxShadow: "0 24px 60px rgba(0,0,0,0.3)", fontFamily: "'Inter',system-ui,sans-serif" }}>
        <div style={{ padding: "20px 24px 14px", borderBottom: "1px solid #f1f5f9" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <div style={{ fontWeight: 900, fontSize: 18, color: "#0f172a" }}>❓ Aide</div>
            <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, color: "#94a3b8", cursor: "pointer", lineHeight: 1 }}>✕</button>
          </div>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Rechercher (ex. PIN, SMS, facture…)"
            style={{ width: "100%", padding: "11px 14px", border: "1.5px solid #e2e8f0", borderRadius: 10, fontSize: 14, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }} />
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "12px 24px" }}>
          {filtered.length === 0 && (
            <div style={{ color: "#94a3b8", fontSize: 13, textAlign: "center", padding: "24px 0" }}>Aucun résultat — posez votre question ci-dessous.</div>
          )}
          {filtered.map(cat => (
            <div key={cat.categorie} style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: "#64748b", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 8 }}>{cat.categorie}</div>
              {cat.items.map(it => {
                const key = cat.categorie + "|" + it.q;
                const open = openKey === key;
                return (
                  <div key={key} style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <button onClick={() => setOpenKey(open ? null : key)}
                      style={{ width: "100%", textAlign: "left", background: "none", border: "none", padding: "10px 0", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, fontFamily: "inherit" }}>
                      <span style={{ fontSize: 13.5, fontWeight: 600, color: "#1e293b" }}>{it.q}</span>
                      <span style={{ color: "#94a3b8", fontSize: 14, flexShrink: 0 }}>{open ? "−" : "+"}</span>
                    </button>
                    {open && <div style={{ fontSize: 13, color: "#475569", lineHeight: 1.6, paddingBottom: 12 }}>{it.r}</div>}
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        <div style={{ padding: "14px 24px 20px", borderTop: "1px solid #f1f5f9", background: "#f8fafc", borderRadius: "0 0 20px 20px" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#64748b", marginBottom: 8 }}>Vous ne trouvez pas votre réponse ?</div>
          {sent ? (
            <div style={{ fontSize: 13, color: "#15803d", fontWeight: 600 }}>✓ Question envoyée — vous recevrez une réponse par email.</div>
          ) : (
            <>
              <textarea value={question} onChange={e => setQuestion(e.target.value)} placeholder="Écrivez votre question ici…" rows={3}
                style={{ width: "100%", padding: "10px 12px", border: "1.5px solid #e2e8f0", borderRadius: 10, fontSize: 13, fontFamily: "inherit", outline: "none", resize: "vertical", boxSizing: "border-box", marginBottom: 8 }} />
              <button onClick={handleSend} disabled={sending || !question.trim()}
                style={{ padding: "9px 18px", border: "none", borderRadius: 10, background: "#3b82f6", color: "#fff", fontWeight: 700, fontSize: 13, cursor: sending || !question.trim() ? "default" : "pointer", fontFamily: "inherit", opacity: sending || !question.trim() ? 0.6 : 1 }}>
                {sending ? "Envoi…" : "Envoyer la question"}
              </button>
              {error && <div style={{ marginTop: 8, fontSize: 12, color: "#dc2626" }}>{error}</div>}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export { AideModal };
export default AideModal;
