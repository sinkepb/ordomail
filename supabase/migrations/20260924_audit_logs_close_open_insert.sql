-- ═══════════════════════════════════════════════════════════════════════════════
-- ORDOMAIL — Ferme l'INSERT direct sur audit_logs — 24/09/2026
--
-- @fix (audit du 23/09/2026) — la policy "audit_logs_insert" (WITH CHECK(true),
-- créée le 08/08/2026) autorisait N'IMPORTE QUI possédant la clé anon publique
-- à insérer des lignes arbitraires dans le journal d'audit, pour n'importe
-- quelle pharmacie_id. C'était un compromis DÉLIBÉRÉ à l'époque : un poste
-- vendeur (PIN) n'a pas de session Supabase Auth, donc get_user_pharmacie_id()
-- (qui dépend de auth.uid()) renvoie toujours NULL pour lui — impossible de
-- scoper une policy RLS "sa propre pharmacie" pour ces sessions-là, et aucune
-- edge function ne portait encore cette écriture pour vérifier l'appelant
-- côté serveur.
--
-- Ce compromis n'est plus nécessaire : src/lib/supabase/audit.js:addAuditLog()
-- passe désormais par la nouvelle ressource secure-data:audit_log_create, qui
-- vérifie le jeton vendeur/la session titulaire côté serveur (resolveCaller)
-- puis écrit avec la clé de service (bypass RLS). Plus aucun code du dépôt
-- n'insère directement dans audit_logs depuis le client (vérifié par recherche
-- exhaustive dans src/) — les deux policies INSERT (celle-ci et la version
-- restreinte "audit_logs_insert_own_pharmacie" ajoutée le 23/09/2026, qui
-- n'était de toute façon rendue sans effet que par la présence de celle-ci)
-- peuvent donc être fermées : plus aucun appelant client n'écrit jamais
-- directement dans cette table.
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

DROP POLICY IF EXISTS "audit_logs_insert" ON audit_logs;
DROP POLICY IF EXISTS "audit_logs_insert_own_pharmacie" ON audit_logs;

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- Après exécution : déployer secure-data (nouvelle ressource audit_log_create).
-- Vérification manuelle recommandée : se connecter comme vendeur (PIN) ET
-- comme titulaire, imprimer/consulter une ordonnance, se déconnecter, puis
-- confirmer que le Journal d'activité (LogsPanel) affiche bien les nouvelles
-- entrées — et qu'un INSERT anon direct sur audit_logs (curl/REST) échoue
-- désormais avec une violation RLS.
-- ─────────────────────────────────────────────────────────────────────────────
