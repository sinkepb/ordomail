// ─── Pages légales (CGU/CGV, confidentialité, mentions légales) ───────────────
// Créées le 28/07/2026 pour remplacer les liens morts du footer (LandingPage.jsx)
// et donner une base contractuelle aux abonnements Stripe. ⚠️ Contenu générique
// à trous — PAS validé par un juriste. Les champs entre [crochets] doivent être
// complétés avec l'identité juridique réelle de la société avant toute mise en
// ligne définitive. Voir DEPLOIEMENT_CHECKLIST.md § conformité HDS pour le
// contexte complet (l'app n'est aujourd'hui pas hébergée chez un HDS certifié —
// ce document ne doit pas prétendre le contraire).
import { C } from "../lib/utils.js";

function DraftBanner() {
  return (
    <div style={{
      background: "#fef3c7", border: "1.5px solid #fbbf24", borderRadius: 12,
      padding: "14px 18px", marginBottom: 28, fontSize: 13.5, color: "#78350f", lineHeight: 1.6,
    }}>
      ⚠️ <strong>Document de travail.</strong> Ce texte est un modèle générique destiné à
      servir de base — il n'a pas été relu ni validé par un juriste et contient des champs à
      compléter (identité de la société, adresse, hébergeur, contacts). Ne pas considérer
      comme définitif tant qu'il n'a pas été validé.
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 26 }}>
      <h2 style={{ fontSize: 17, fontWeight: 800, color: C.ink, marginBottom: 10 }}>{title}</h2>
      <div style={{ fontSize: 14, color: C.slate, lineHeight: 1.75 }}>{children}</div>
    </div>
  );
}

function Placeholder({ children }) {
  return <span style={{ background: "#fef3c7", padding: "1px 5px", borderRadius: 4, fontWeight: 600 }}>{children}</span>;
}

function MentionsContent() {
  return (
    <>
      <Section title="Éditeur du site">
        <p>
          Le site et l'application OrdoMail sont édités par <Placeholder>[Raison sociale]</Placeholder>,
          {" "}<Placeholder>[forme juridique — ex. SAS]</Placeholder> au capital de <Placeholder>[montant]</Placeholder> €,
          immatriculée au RCS de <Placeholder>[ville]</Placeholder> sous le numéro <Placeholder>[SIREN/SIRET]</Placeholder>,
          dont le siège social est situé <Placeholder>[adresse complète]</Placeholder>.
        </p>
        <p>Numéro de TVA intracommunautaire : <Placeholder>[FR...]</Placeholder></p>
      </Section>
      <Section title="Directeur de la publication">
        <p><Placeholder>[Nom du directeur de la publication]</Placeholder></p>
      </Section>
      <Section title="Hébergement">
        <p>
          L'application est hébergée par Supabase (infrastructure cloud). Coordonnées complètes
          de l'hébergeur : <Placeholder>[raison sociale, adresse]</Placeholder>.
        </p>
        <p>
          ⚠️ À la date de rédaction de ce document, cet hébergement n'est <strong>pas</strong> certifié
          Hébergeur de Données de Santé (HDS) au sens de l'article L1111-8 du Code de la santé
          publique. Aucune mention de certification HDS ne doit être affichée ailleurs sur le
          site tant que cette situation n'a pas changé.
        </p>
      </Section>
      <Section title="Propriété intellectuelle">
        <p>
          L'ensemble des éléments du site et de l'application (textes, logos, interface, code)
          est protégé par le droit de la propriété intellectuelle. Toute reproduction non
          autorisée est interdite.
        </p>
      </Section>
      <Section title="Contact">
        <p>Pour toute question : <Placeholder>[email de contact]</Placeholder></p>
      </Section>
    </>
  );
}

function CguContent() {
  return (
    <>
      <Section title="1. Objet">
        <p>
          Les présentes Conditions Générales d'Utilisation et de Vente (CGU/CGV) régissent
          l'accès et l'utilisation de la plateforme OrdoMail par les pharmacies clientes
          (ci-après « le Client ») ainsi que les modalités d'abonnement payant.
        </p>
      </Section>
      <Section title="2. Acceptation">
        <p>
          La création d'un compte pharmacie et/ou la souscription à un abonnement emportent
          acceptation pleine et entière des présentes CGU/CGV.
        </p>
      </Section>
      <Section title="3. Description du service">
        <p>
          OrdoMail permet à une pharmacie de recevoir les ordonnances de ses patients (dépôt
          direct via QR code ou envoi par e-mail dédié), de les centraliser dans un tableau de
          bord et d'y accéder pour préparation et impression.
        </p>
      </Section>
      <Section title="4. Compte et accès">
        <p>
          Le Client est responsable de la confidentialité de ses identifiants (titulaire) et
          des codes PIN de ses postes vendeurs, ainsi que de toute activité réalisée depuis son
          compte.
        </p>
      </Section>
      <Section title="5. Abonnement, tarifs et paiement">
        <p>
          L'accès aux fonctionnalités payantes est soumis à un abonnement récurrent (mensuel ou
          annuel selon le plan choisi), facturé via notre prestataire de paiement Stripe. Les
          tarifs en vigueur sont ceux affichés sur la page Tarifs au moment de la souscription.
          L'abonnement se renouvelle automatiquement à chaque échéance sauf résiliation.
        </p>
      </Section>
      <Section title="6. Durée et résiliation">
        <p>
          L'abonnement peut être résilié à tout moment depuis l'espace client, avec effet à la
          fin de la période en cours (aucun remboursement au prorata sauf disposition légale
          contraire).
        </p>
      </Section>
      <Section title="7. Obligations du Client">
        <p>
          Le Client s'engage à n'utiliser le service que dans le cadre de son activité
          officinale légitime, à ne déposer que des données exactes, et à respecter la
          réglementation applicable au traitement des données de santé de ses patients.
        </p>
      </Section>
      <Section title="8. Disponibilité et responsabilité">
        <p>
          OrdoMail met en œuvre des moyens raisonnables pour assurer la disponibilité du
          service, sans garantie de continuité absolue. La responsabilité d'OrdoMail ne saurait
          être engagée en cas de force majeure, de panne d'un prestataire tiers, ou d'usage non
          conforme du service par le Client.
        </p>
      </Section>
      <Section title="9. Données personnelles">
        <p>
          Le traitement des données personnelles est décrit dans la <Placeholder>Politique de
          confidentialité</Placeholder>, qui fait partie intégrante des présentes.
        </p>
      </Section>
      <Section title="10. Sous-traitance des données personnelles (art. 28 RGPD)">
        <p>
          Pour les données de santé des patients de la pharmacie, OrdoMail agit en qualité de{" "}
          <strong>sous-traitant</strong> au sens de l'article 28 du RGPD, la pharmacie demeurant
          responsable de traitement vis-à-vis de ses patients. Pour les données du compte
          pharmacie lui-même (identifiants titulaire, PIN vendeurs, facturation), OrdoMail agit
          en qualité de responsable de traitement — voir la Politique de confidentialité.
        </p>
        <p>
          <strong>Instructions documentées.</strong> OrdoMail ne traite les données patient que
          sur instruction documentée de la pharmacie (le paramétrage et l'usage normal du
          service constituent cette instruction), sauf obligation légale contraire.
        </p>
        <p>
          <strong>Sous-traitants ultérieurs.</strong> OrdoMail a recours aux sous-traitants
          suivants pour l'exécution du service : Supabase (hébergement base de données et
          stockage de fichiers), Stripe (paiement), Postmark (envoi et réception des e-mails).
          Le Client est informé de tout ajout ou remplacement d'un sous-traitant ultérieur et
          dispose d'un délai de <Placeholder>[30 jours — à confirmer]</Placeholder> pour
          s'opposer au changement pour un motif légitime.
        </p>
        <p>
          <strong>Sécurité.</strong> OrdoMail met en œuvre les mesures de sécurité décrites dans
          la Politique de confidentialité et s'engage à notifier le Client dans les meilleurs
          délais de toute violation de données concernant ses patients, en lui fournissant les
          informations nécessaires à sa propre notification auprès de la CNIL et des personnes
          concernées si la violation présente un risque pour leurs droits et libertés.
        </p>
        <p>
          <strong>Assistance.</strong> OrdoMail assiste le Client, dans la mesure du possible,
          pour répondre aux demandes d'exercice des droits de ses patients (accès, rectification,
          effacement, opposition) et pour la réalisation, le cas échéant, d'une analyse d'impact
          relative à la protection des données.
        </p>
        <p>
          <strong>Sort des données en fin de contrat.</strong> À la résiliation de l'abonnement,
          les données patient de la pharmacie sont supprimées selon la politique de rétention en
          vigueur (voir Politique de confidentialité), sauf demande d'export préalable formulée
          par le Client dans un délai de <Placeholder>[à définir]</Placeholder> suivant la
          résiliation.
        </p>
        <p>
          <strong>Audit.</strong> Le Client peut demander à OrdoMail les informations nécessaires
          pour démontrer le respect des obligations du présent article, selon des modalités à
          convenir entre les parties.
        </p>
      </Section>
      <Section title="11. Modification des CGU/CGV">
        <p>
          OrdoMail peut modifier les présentes CGU/CGV ; le Client en sera informé et la
          poursuite de l'utilisation du service après notification vaudra acceptation.
        </p>
      </Section>
      <Section title="12. Droit applicable">
        <p>
          Les présentes CGU/CGV sont soumises au droit français. Tout litige relève de la
          compétence des tribunaux de <Placeholder>[ville]</Placeholder>, sauf disposition
          légale impérative contraire.
        </p>
      </Section>
    </>
  );
}

function ConfidentialiteContent() {
  return (
    <>
      <Section title="Responsable de traitement">
        <p>
          <Placeholder>[Raison sociale]</Placeholder>, éditrice d'OrdoMail (voir Mentions
          légales), est responsable du traitement des données décrites ci-dessous.
        </p>
      </Section>
      <Section title="Données collectées">
        <p>
          <strong>Côté pharmacie (titulaire, vendeurs) :</strong> identité, e-mail, PIN des
          postes, données de facturation (traitées par Stripe).
        </p>
        <p>
          <strong>Côté patient :</strong> nom, code de suivi anonyme, et le contenu de
          l'ordonnance déposée — qui constitue une donnée de santé au sens du RGPD (art. 9). Le
          patient n'est jamais authentifié et son ordonnance n'est accessible qu'à la pharmacie
          concernée.
        </p>
      </Section>
      <Section title="Finalités et base légale">
        <p>
          Les données sont traitées pour l'exécution du service (réception et préparation des
          ordonnances) sur la base de l'exécution du contrat conclu avec la pharmacie, et, pour
          les données de santé du patient, sur la base de l'intérêt légitime du patient à voir
          son ordonnance traitée (dépôt volontaire et explicite de sa part).
        </p>
      </Section>
      <Section title="Destinataires et sous-traitants">
        <p>
          Les données sont hébergées et traitées par nos sous-traitants techniques : Supabase
          (base de données et stockage), Stripe (paiement), et Postmark (envoi et réception des
          e-mails). Aucune donnée n'est vendue à des tiers.
        </p>
      </Section>
      <Section title="Durée de conservation">
        <p>
          Les ordonnances (fichier et métadonnées) sont conservées 3 jours après leur dépôt, puis
          supprimées automatiquement chaque nuit — délai retenu pour rester dans le cadre d'une
          prestation de courte durée (voir DEPLOIEMENT_CHECKLIST.md). Les autres données
          (compte pharmacie, facturation) sont conservées <Placeholder>[durée à définir]</Placeholder>.
        </p>
      </Section>
      <Section title="Sécurité">
        <p>
          Accès aux ordonnances strictement limité à la pharmacie concernée (Row Level Security
          côté base de données), lecture de l'ordonnance effectuée localement dans le
          navigateur du patient (aucun envoi à un service tiers d'OCR), connexions chiffrées
          (HTTPS/TLS).
        </p>
      </Section>
      <Section title="Vos droits">
        <p>
          Conformément au RGPD, vous disposez d'un droit d'accès, de rectification,
          d'effacement, d'opposition et de portabilité de vos données, ainsi que du droit
          d'introduire une réclamation auprès de la CNIL. Pour exercer ces droits :
          {" "}<Placeholder>[email de contact DPO]</Placeholder>.
        </p>
      </Section>
    </>
  );
}

const DOCS = {
  mentions:        { title: "Mentions légales",                              Content: MentionsContent },
  cgu:             { title: "Conditions Générales d'Utilisation et de Vente", Content: CguContent },
  confidentialite: { title: "Politique de confidentialité",                  Content: ConfidentialiteContent },
};

function LegalPage({ doc, onBack }) {
  const entry = DOCS[doc] || DOCS.mentions;
  const { title, Content } = entry;
  return (
    <div style={{ minHeight: "100vh", background: C.surface }}>
      <div style={{ background: C.navyD, padding: "16px 20px", display: "flex", alignItems: "center", gap: 12 }}>
        {onBack && (
          <button onClick={onBack} style={{ background: "none", border: "none", color: "#fff", fontSize: 20, cursor: "pointer", padding: 0 }}>←</button>
        )}
        <span style={{ fontSize: 22 }}>💊</span>
        <span style={{ color: "#fff", fontWeight: 800, fontSize: 15 }}>OrdoMail</span>
      </div>
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "32px 20px 60px" }}>
        <h1 style={{ fontSize: 26, fontWeight: 900, color: C.ink, marginBottom: 20 }}>{title}</h1>
        <DraftBanner />
        <Content />
        <div style={{ marginTop: 30, fontSize: 12, color: C.muted }}>
          Dernière mise à jour : 28/07/2026
        </div>
      </div>
    </div>
  );
}

export { LegalPage };
