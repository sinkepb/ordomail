-- OrdoMail — Corrige vendeur_sessions : RLS absente + anon en accès complet
-- (06/09/2026, trouvé lors de l'audit "mise en prod").
--
-- Même bug que pin_verification_attempts/submission_log corrigé le 26/07/2026
-- (20260726_live_advisor_fixes.sql) — le commentaire de création de la table
-- dans 20260906_pin_unique.sql affirmait explicitement suivre "le même schéma
-- d'accès que pin_verification_attempts : pas de RLS, jamais lu/écrit
-- autrement que par le rôle de service", mais le REVOKE + ENABLE RLS
-- correspondant n'a jamais été écrit. Confirmé en direct sur preview ET
-- production : anon disposait de INSERT/SELECT/UPDATE/DELETE/TRUNCATE sans
-- aucune RLS — n'importe qui muni de la clé anon publique pouvait DELETE ou
-- TRUNCATE cette table via l'API REST pour réinitialiser à volonté le
-- compteur de connexions simultanées du mode PIN unique, contournant
-- entièrement la limite de postes du plan payant qu'elle est censée faire
-- respecter (verify-pin, secure-data:vendeur_release_session).
ALTER TABLE vendeur_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendeur_sessions FORCE ROW LEVEL SECURITY;

REVOKE ALL ON vendeur_sessions FROM anon, authenticated;
