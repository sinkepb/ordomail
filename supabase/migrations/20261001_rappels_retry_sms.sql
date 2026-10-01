-- ═══════════════════════════════════════════════════════════════════════════════
-- OrdoMail — Compteur d'échecs SMS consécutifs pour les rappels (01/10/2026)
--
-- Jusqu'ici, un échec d'envoi SMS (runRappelScan) laissait le rappel en
-- "en_attente" sans y toucher : il était ré-essayé automatiquement au
-- prochain passage du cron, mais indéfiniment et sans aucune visibilité pour
-- le pharmacien si l'échec est permanent (numéro invalide, par exemple) —
-- retry silencieux à vie, jamais d'escalade vers un appel comme pour le
-- "sans réponse" (voir 20261001_rappels_relance_escalade.sql).
--
-- sms_echecs_consecutifs compte les échecs d'affilée pour CE cycle ; remis à
-- zéro dès qu'un envoi réussit ou qu'un nouveau cycle démarre (rappels_traiter/
-- rappels_reactiver, même principe que relance_sms_envoyee). Au-delà d'un
-- seuil (voir _shared/rappelLogic.ts:SMS_ECHEC_MAX), le rappel bascule en
-- "à appeler" au lieu de continuer à retenter du SMS qui ne partira jamais.
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE rappels_ordonnance ADD COLUMN IF NOT EXISTS sms_echecs_consecutifs INT NOT NULL DEFAULT 0;
