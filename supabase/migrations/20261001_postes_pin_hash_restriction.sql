-- ═══════════════════════════════════════════════════════════════════════════════
-- OrdoMail — Restriction de colonnes sur pharmacie_postes (01/10/2026, audit)
--
-- "postes_titulaire_own" (FOR ALL, 20260723_phase1_security.sql:124-128) n'a
-- aucune restriction de colonnes : un titulaire authentifié peut lire
-- pin_hash (bcrypt) de ses propres postes via l'API REST directe. Pas un IDOR
-- inter-pharmacie, mais un PIN à 4 chiffres se casse hors-ligne en quelques
-- secondes une fois le hash récupéré, hors du contrôle serveur normal
-- (verify-pin applique normalement un rate limit par poste).
--
-- Même pattern que pharmacies_public_lookup (REVOKE SELECT + GRANT SELECT
-- colonnes) — restreint SEULEMENT le SELECT, les policies RLS existantes
-- (INSERT/UPDATE/DELETE via "postes_titulaire_own") ne sont pas touchées.
-- Vérifié sans régression : src/lib/supabase/pharmacies.js:91 exclut déjà
-- explicitement pin_hash (et pin, colonne legacy) de tout payload écrit par
-- le titulaire ("ce champ ne doit JAMAIS être écrit par ce chemin") — seul
-- update-pin (clé de service, bcrypt) écrit ce champ. Le retour de
-- .upsert().select() n'inclura simplement plus pin_hash/pin, valeur jamais
-- lue par l'appelant (Dashboard.jsx:184, résultat de savePostes() ignoré).
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

REVOKE SELECT ON pharmacie_postes FROM authenticated;
GRANT SELECT (id, pharmacie_id, nom, actif, created_at) ON pharmacie_postes TO authenticated;

COMMIT;
