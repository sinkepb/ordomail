-- ═══════════════════════════════════════════════════════════════════════════════
-- OrdoMail — Canal d'opposition patient pour les rappels (01/10/2026, audit RGPD)
--
-- Jusqu'ici, le patient n'avait que 3 choix (tout renouveler/rien/partiel) :
-- aucun moyen de signifier "ne plus me recontacter". Ajoute un 4e choix
-- "stop" (lien SMS patient ou enregistré par le pharmacien après appel) qui
-- termine définitivement le suivi et marque opt_out=true, pour empêcher
-- toute réactivation ultérieure de CE rappel par le pharmacien.
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE rappels_ordonnance ADD COLUMN IF NOT EXISTS opt_out BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE rappels_ordonnance DROP CONSTRAINT IF EXISTS rappels_ordonnance_choix_patient_check;
ALTER TABLE rappels_ordonnance ADD CONSTRAINT rappels_ordonnance_choix_patient_check
  CHECK (choix_patient IN ('tout_renouveler','rien','partiel','stop'));
