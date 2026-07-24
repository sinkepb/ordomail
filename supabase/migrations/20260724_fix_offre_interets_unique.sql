-- ═══════════════════════════════════════════════════════════════════════════════
-- ORDOMAIL — Correctif offre_interets (24/07/2026) — contrainte unique manquante
--
-- À exécuter manuellement (Supabase SQL Editor), comme les migrations
-- précédentes.
--
-- Bug rapporté en direct : un patient qui déclare son intérêt pour une offre
-- (story) voit son clic pris en compte côté écran (mise à jour optimiste dans
-- PatientPage.jsx), mais rien n'apparaît jamais au dashboard vendeur.
--
-- Cause : PatientPage.jsx écrit via
--   sb.from('offre_interets').upsert({...}, { onConflict: 'code_patient,offre_id,date_jour' })
-- mais aucune contrainte UNIQUE sur (code_patient, offre_id, date_jour) n'a
-- jamais existé sur cette table (ni dans schema.sql, ni en base). Sans elle,
-- Postgres rejette l'upsert avec l'erreur "no unique or exclusion constraint
-- matching the ON CONFLICT specification" — et comme l'appel ne vérifie jamais
-- le résultat ({ error }), l'échec est totalement silencieux côté client.
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- Idempotent : ne fait rien si déjà présente (ex: ré-exécution du script).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'offre_interets_patient_offre_jour_key'
  ) THEN
    ALTER TABLE offre_interets
      ADD CONSTRAINT offre_interets_patient_offre_jour_key
      UNIQUE (code_patient, offre_id, date_jour);
  END IF;
END $$;

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- Vérification manuelle recommandée après exécution :
--   SELECT conname FROM pg_constraint WHERE conrelid = 'offre_interets'::regclass;
--   -- doit lister offre_interets_patient_offre_jour_key
--
-- Si cette étape échoue avec une erreur de doublons ("could not create unique
-- index... duplicate key"), cela signifierait que des lignes en double existent
-- déjà (peu probable puisque les upserts échouaient silencieusement jusqu'ici) —
-- dans ce cas, identifier et dédupliquer avant de relancer :
--   SELECT code_patient, offre_id, date_jour, count(*)
--   FROM offre_interets GROUP BY 1,2,3 HAVING count(*) > 1;
-- ─────────────────────────────────────────────────────────────────────────────
