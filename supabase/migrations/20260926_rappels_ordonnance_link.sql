-- ═══════════════════════════════════════════════════════════════════════════════
-- ORDOMAIL — Lien rappel ↔ ordonnance — 26/09/2026
--
-- Demande titulaire : chaque rappel de renouvellement doit pouvoir être créé
-- directement depuis une ordonnance précise (nom du patient pré-rempli
-- automatiquement) et donner accès en un clic au fichier de cette ordonnance
-- depuis la liste des rappels. Jusqu'ici, rappels_ordonnance ne conservait
-- aucun lien vers l'ordonnance d'origine (voir Dashboard.jsx : le nom/médecin
-- étaient déjà préremplis depuis l'OCR de l'ordonnance, mais l'identifiant
-- lui-même n'était jamais transmis ni stocké).
--
-- Nullable et ON DELETE SET NULL (même logique que audit_logs.ordonnance_id) :
-- un rappel créé sans ordonnance sélectionnée reste valide, et la suppression
-- ultérieure de l'ordonnance source (purge RGPD, suppression manuelle) ne doit
-- jamais entraîner la perte du rappel/historique associé — seul le lien
-- disparaît.
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE rappels_ordonnance
  ADD COLUMN IF NOT EXISTS ordonnance_id UUID REFERENCES ordonnances(id) ON DELETE SET NULL;

COMMENT ON COLUMN rappels_ordonnance.ordonnance_id IS
  'Ordonnance à l''origine du rappel (optionnelle) — permet de consulter le fichier depuis la liste des rappels. NULL si créé sans ordonnance sélectionnée, ou si l''ordonnance source a depuis été supprimée.';

-- Accélère rappels_ordonnance_fichier (secure-data) qui filtre par id de
-- rappel puis lit ordonnance_id — pas un index sur ordonnance_id lui-même
-- (aucune requête ne cherche encore "les rappels d'une ordonnance donnée").

COMMIT;
