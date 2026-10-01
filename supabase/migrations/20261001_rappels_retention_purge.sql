-- ═══════════════════════════════════════════════════════════════════════════════
-- OrdoMail — Rétention/purge des rappels de renouvellement (01/10/2026, audit RGPD)
--
-- rappels_ordonnance/rappels_evenements (nom/prénom/téléphone/commentaire
-- patient) ne faisaient l'objet d'aucune purge : la FK
-- rappels_ordonnance.ordonnance_id est en ON DELETE SET NULL, le rappel est
-- conçu pour survivre à la suppression de l'ordonnance liée, indéfiniment.
-- Un rappel "terminé" (cycle clos, plus aucune relance à venir) restait donc
-- en base pour toujours — art. 5.1.e RGPD (limitation de la conservation).
--
-- Même garde-fou que ordonnances_retention_days (20260809_retention_purge.sql) :
-- NULL par défaut = purge désactivée tant qu'une durée n'est pas validée et
-- configurée depuis le backoffice, jamais un défaut silencieux sur des
-- données de santé. Ne purge QUE les rappels "terminé" — un rappel encore
-- actif (en_attente/sms_envoye/a_appeler/a_traiter/prepare) fait partie d'un
-- suivi en cours, son âge seul ne justifie jamais sa suppression.
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE retention_settings ADD COLUMN IF NOT EXISTS rappels_retention_days INTEGER;
ALTER TABLE retention_settings ADD CONSTRAINT retention_settings_rappels_positive
  CHECK (rappels_retention_days IS NULL OR rappels_retention_days > 0);

-- Purge par mise à jour (date_traite/updated_at) du dernier cycle "terminé",
-- pas par date de création — un rappel réactivé plusieurs fois reste
-- légitimement en base tant que son dernier cycle clos est récent.
CREATE INDEX IF NOT EXISTS idx_rappels_ordonnance_purge
  ON rappels_ordonnance (statut, updated_at) WHERE statut = 'termine';

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- Après exécution : configurer rappels_retention_days depuis le backoffice
-- (onglet Rétention/Purge) une fois une durée validée par le DPO — sans ça,
-- aucun rappel n'est purgé (par conception, voir commentaire ci-dessus).
-- ─────────────────────────────────────────────────────────────────────────────
