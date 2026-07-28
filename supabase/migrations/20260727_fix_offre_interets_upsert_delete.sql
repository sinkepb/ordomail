-- ═══════════════════════════════════════════════════════════════════════════════
-- ORDOMAIL — Correctif offre_interets : marquage d'intérêt patient (27/07/2026)
--
-- Bug rapporté en direct : le patient clique pour marquer son intérêt pour une
-- offre, mais le vendeur ne voit jamais rien apparaître.
--
-- Cause n°1 (le vrai bouchon, confirmé en direct par appel REST anon
-- reproduisant exactement l'appel client — succès en INSERT simple, échec
-- identique en upsert) : PatientPage.jsx utilisait
--   sb.from('offre_interets').upsert({...}, {onConflict:'code_patient,offre_id,date_jour'})
-- soit un INSERT ... ON CONFLICT DO UPDATE. Postgres exige pour cette syntaxe
-- que l'appelant dispose d'une visibilité SELECT sur la table (pour vérifier
-- l'existence d'une ligne en conflit), MÊME quand aucun conflit ne se produit
-- réellement. offre_interets n'a volontairement jamais eu de policy SELECT
-- pour anon (le patient n'est jamais authentifié). Résultat : chaque appel
-- échouait systématiquement avec "new row violates row-level security policy".
-- → Corrigé côté client (PatientPage.jsx) : INSERT simple, puis UPDATE filtré
--   uniquement en cas de conflit réel (23505) — un UPDATE simple (avec WHERE,
--   pas via ON CONFLICT) ne nécessite PAS de policy SELECT, confirmé en direct.
--
-- Cause n°2 (bug adjacent, silencieux, découvert pendant le diagnostic) : le
-- retrait d'intérêt (re-clic) faisait un DELETE filtré. Or un DELETE, comme un
-- INSERT ... ON CONFLICT, exige AUSSI la visibilité SELECT de la ligne pour
-- déterminer ce qui est éligible à la suppression — confirmé en direct via
-- EXPLAIN (VERBOSE) : sans policy SELECT pour anon, le plan affiche
-- "One-Time Filter: false" et 0 ligne n'est jamais réellement supprimée, SANS
-- lever d'erreur (contrairement à INSERT/UPDATE qui échouent bruyamment sur un
-- WITH CHECK non satisfait). Le client croyait donc l'opération réussie.
--
-- Plutôt que d'ajouter une policy SELECT pour anon (ce qui exposerait tout le
-- contenu de la table — intérêts de TOUS les patients de TOUTES les pharmacies
-- — à quiconque possède la clé anon publique), on remplace le retrait par
-- suppression par un simple flag `actif`, mis à jour via UPDATE (qui, comme
-- confirmé ci-dessus, ne nécessite aucune policy SELECT).
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE offre_interets ADD COLUMN IF NOT EXISTS actif BOOLEAN NOT NULL DEFAULT true;

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- Vérification manuelle recommandée après exécution :
--   -- INSERT simple (doit réussir sans erreur RLS, avec la clé anon) :
--   curl -X POST ".../rest/v1/offre_interets" -H "apikey: <anon>" \
--     -H "Authorization: Bearer <anon>" -H "Content-Type: application/json" \
--     -d '{"pharmacie_id":"...","code_patient":"1A23","offre_id":"...","date_jour":"2026-07-27"}'
--   -- UPDATE simple pour retirer l'intérêt (doit réussir ET persister) :
--   curl -X PATCH ".../rest/v1/offre_interets?code_patient=eq.1A23&offre_id=eq...&date_jour=eq.2026-07-27" \
--     -H "apikey: <anon>" -H "Authorization: Bearer <anon>" -H "Content-Type: application/json" \
--     -d '{"actif":false}'
--   -- puis SELECT (via service_role) pour confirmer actif=false a bien été
--   -- persisté, pas seulement un 204 trompeur.
-- ─────────────────────────────────────────────────────────────────────────────
