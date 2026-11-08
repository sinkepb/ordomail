-- ═══════════════════════════════════════════════════════════════════════════════
-- ORDOMAIL — Plusieurs ordonnances par rappel — 08/11/2026
--
-- Demande titulaire : dans "Modifier le rappel", pouvoir ajouter ou retirer une
-- ou plusieurs ordonnances jointes (jusqu'ici une seule, figée à la création,
-- via rappels_ordonnance.ordonnance_id — 20260926_rappels_ordonnance_link.sql).
--
-- Table de liaison plutôt qu'un tableau d'UUID dans rappels_ordonnance : les
-- deux clés étrangères garantissent qu'un lien ne survit jamais à la
-- suppression du rappel OU de l'ordonnance (ON DELETE CASCADE des deux côtés —
-- le lien n'a aucun sens sans l'un ou l'autre ; le rappel, lui, n'est jamais
-- supprimé par la suppression d'une ordonnance).
--
-- rappels_ordonnance.ordonnance_id est CONSERVÉE : elle reste la "première"
-- ordonnance liée (maintenue par secure-data à chaque ajout/retrait) pour ne
-- pas casser les lecteurs existants (métrique "avec ordonnance" de
-- secure-data-admin, rappelsStatsLogic). La source de vérité du contenu est
-- désormais cette table.
--
-- RLS activée SANS aucune policy : seule l'edge function secure-data (clé de
-- service, bypass RLS) lit/écrit cette table, après avoir vérifié que rappel ET
-- ordonnance appartiennent à la pharmacie de l'appelant (un poste vendeur n'a
-- pas de session Supabase Auth, aucune policy ne pourrait le protéger).
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE TABLE IF NOT EXISTS rappels_ordonnances_liens (
  rappel_id     UUID NOT NULL REFERENCES rappels_ordonnance(id) ON DELETE CASCADE,
  ordonnance_id UUID NOT NULL REFERENCES ordonnances(id)        ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (rappel_id, ordonnance_id)
);

-- Le PK couvre "les ordonnances d'un rappel" ; cet index couvre le sens inverse
-- ("cette ordonnance est-elle encore utilisée par un autre rappel ?", vérifié
-- avant de supprimer une ordonnance ajoutée manuellement à un rappel).
CREATE INDEX IF NOT EXISTS idx_rappels_ordonnances_liens_ordonnance
  ON rappels_ordonnances_liens (ordonnance_id);

ALTER TABLE rappels_ordonnances_liens ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE rappels_ordonnances_liens IS
  'Ordonnances jointes à un rappel de renouvellement (plusieurs possibles). Accès exclusivement via secure-data (clé de service).';

-- Reprise de l'existant : chaque rappel déjà lié à une ordonnance conserve son lien.
INSERT INTO rappels_ordonnances_liens (rappel_id, ordonnance_id)
SELECT id, ordonnance_id
FROM rappels_ordonnance
WHERE ordonnance_id IS NOT NULL
ON CONFLICT DO NOTHING;

COMMIT;
