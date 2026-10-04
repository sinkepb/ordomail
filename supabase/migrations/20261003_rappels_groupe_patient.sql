-- ═══════════════════════════════════════════════════════════════════════════════
-- ORDOMAIL — Regroupement des rappels d'un même patient — 03/10/2026
--
-- Retour pharmacien : un patient avec plusieurs ordonnances chroniques à
-- renouveler (ex. 3 traitements mensuels) reçoit aujourd'hui un SMS séparé
-- par ordonnance, et génère autant de casiers de préparation séparés pour
-- une seule visite/commande réelle. groupe_id (rempli uniquement quand le
-- scan cron détecte plusieurs rappels dus le même jour pour le même
-- pharmacie_id + téléphone, voir _shared/rappelLogic.ts) permet d'envoyer un
-- seul SMS et d'attribuer un seul casier de préparation partagé.
--
-- Reste NULL pour l'immense majorité des rappels (patient avec un seul
-- traitement) — comportement d'envoi/préparation individuel strictement
-- inchangé dans ce cas.
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE rappels_ordonnance ADD COLUMN IF NOT EXISTS groupe_id UUID;

-- Lecture groupée (page patient, liste pharmacien) : tous les membres d'un
-- même groupe, filtrée par groupe_id seul.
CREATE INDEX IF NOT EXISTS idx_rappels_ordonnance_groupe
  ON rappels_ordonnance (groupe_id) WHERE groupe_id IS NOT NULL;

COMMIT;
