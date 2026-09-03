-- OrdoMail — "Offres mobile" (03/09/2026) : création d'une offre en prenant une
-- photo au comptoir + un prix, via un lien magique scanné depuis le dashboard
-- PC (aucun mot de passe côté mobile) ; catalogue de ~30 modèles saisonniers
-- activables en un clic ; gestion des ruptures ; réservation "Click & Collect"
-- (JAMAIS de paiement Stripe pour ce produit — encaissement physique au TPE).
--
-- offres_stories : nouvelles colonnes.
--   prix        : optionnel — sans lui, pas de bouton "Ajouter à la commande"
--                 côté patient (offre purement informative, comme avant).
--   epuise      : distinct de `actif` — `actif=false` = le titulaire a mis en
--                 pause/retiré l'offre ; `epuise=true` = rupture de stock
--                 temporaire signalée par le personnel (le produit "existe"
--                 toujours, juste plus au comptoir maintenant). La policy
--                 anon existante (public_read_offres_actives, qual actif=true)
--                 continue de laisser voir la ligne en temps réel quand elle
--                 passe epuise=true — nécessaire pour que l'écran patient
--                 affiche "Produit en rupture" au lieu de simplement perdre
--                 l'événement Realtime.
--   template_id : NULL si créée manuellement (PC ou mobile) ; sinon référence
--                 le modèle du catalogue dont elle est issue (permet de
--                 retrouver/réactiver la bonne ligne quand on retoggle un
--                 modèle plutôt que d'en recréer une nouvelle à chaque fois).
--   created_via : traçabilité simple ('pc' | 'mobile' | 'template'), pas de
--                 comportement différent selon la valeur pour l'instant.
ALTER TABLE offres_stories ADD COLUMN IF NOT EXISTS prix        NUMERIC;
ALTER TABLE offres_stories ADD COLUMN IF NOT EXISTS epuise      BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE offres_stories ADD COLUMN IF NOT EXISTS created_via TEXT NOT NULL DEFAULT 'pc' CHECK (created_via IN ('pc','mobile','template'));

-- ─────────────────────────────────────────────────────────────────────────────
-- Catalogue des modèles d'offres saisonnières — "zéro design" : le titulaire
-- (ou le vendeur, voir secure-data) n'a qu'à activer/désactiver un bouton,
-- aucune saisie. Catalogue global (pas par pharmacie) ; template_id sur
-- offres_stories relie l'instance créée par une pharmacie au modèle activé.
CREATE TABLE IF NOT EXISTS offre_templates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  titre       TEXT NOT NULL,
  description TEXT,
  emoji       TEXT NOT NULL DEFAULT '🎁',
  badge       TEXT,
  couleur     TEXT NOT NULL DEFAULT '#1a3a6e',
  type        TEXT NOT NULL DEFAULT 'promo' CHECK (type IN ('promo','service','fidelite')),
  saison      TEXT NOT NULL DEFAULT 'toute_annee' CHECK (saison IN ('hiver','printemps','ete','automne','toute_annee')),
  ordre       INT NOT NULL DEFAULT 0,
  actif       BOOLEAN NOT NULL DEFAULT true, -- retrait du catalogue global par OrdoMail, pas par pharmacie
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Lu/écrit uniquement via secure-data (service role) — catalogue global, pas
-- de données par pharmacie à protéger, mais même convention que le reste
-- (alerts, retention_settings…) : aucun accès direct anon/authenticated.
ALTER TABLE offre_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE offre_templates FORCE ROW LEVEL SECURITY;
REVOKE ALL ON offre_templates FROM anon, authenticated;

ALTER TABLE offres_stories ADD COLUMN IF NOT EXISTS template_id UUID REFERENCES offre_templates(id) ON DELETE SET NULL;
-- Une pharmacie n'a qu'une seule instance active par modèle — retoggle
-- réactive/désactive la même ligne plutôt que d'en empiler de nouvelles.
CREATE UNIQUE INDEX IF NOT EXISTS idx_offres_stories_pharmacie_template
  ON offres_stories (pharmacie_id, template_id) WHERE template_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- Réservations "Click & Collect" — le bouton patient "Ajouter à la commande"
-- N'EST PAS un paiement (aucun Stripe ici, voir description de la mission) :
-- juste une intention de retrait, encaissée physiquement au comptoir. Même
-- modèle d'accès que offre_interets/pin_verification_attempts : aucune policy
-- anon/authenticated, écriture uniquement via edge function service-role
-- (reserver-offre côté patient, secure-data côté pharmacie pour la file
-- d'attente/le marquage "récupérée").
CREATE TABLE IF NOT EXISTS offre_reservations (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pharmacie_id UUID NOT NULL REFERENCES pharmacies(id) ON DELETE CASCADE,
  offre_id     UUID NOT NULL REFERENCES offres_stories(id) ON DELETE CASCADE,
  code_patient TEXT NOT NULL,
  quantite     INT NOT NULL DEFAULT 1 CHECK (quantite > 0),
  statut       TEXT NOT NULL DEFAULT 'en_attente' CHECK (statut IN ('en_attente','recuperee','annulee')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Une seule réservation "en attente" par (offre, patient) — retaper sur
-- "Ajouter à la commande" incrémente la quantité plutôt que de dupliquer la
-- ligne (voir reserver-offre : upsert sur ce même triplet logique).
CREATE UNIQUE INDEX IF NOT EXISTS idx_offre_reservations_en_attente
  ON offre_reservations (offre_id, code_patient) WHERE statut = 'en_attente';
CREATE INDEX IF NOT EXISTS idx_offre_reservations_pharmacie_pending
  ON offre_reservations (pharmacie_id, statut, created_at);

ALTER TABLE offre_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE offre_reservations FORCE ROW LEVEL SECURITY;
REVOKE ALL ON offre_reservations FROM anon, authenticated;
