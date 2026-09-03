-- Phase 2 tarification : centralisation des fonctionnalités par plan.
-- Jusqu'ici, offresStories (Offres/Stories) n'était vérifié QUE côté
-- frontend (PLAN_LIMITS.offresStories, jamais lu en base) — un titulaire
-- Essentiel pouvait créer une offre en appelant directement l'API REST,
-- contournant complètement la restriction. Corrigé ici par des colonnes
-- dédiées sur pricing_plans (configurables en backoffice) + une policy RLS
-- qui les vérifie réellement à l'écriture.

ALTER TABLE pricing_plans ADD COLUMN IF NOT EXISTS feature_offres_stories BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE pricing_plans ADD COLUMN IF NOT EXISTS feature_sonnette       BOOLEAN NOT NULL DEFAULT false;

UPDATE pricing_plans SET feature_offres_stories = true, feature_sonnette = true WHERE id IN ('standard', 'pro');

-- Fonction centrale — lue par RLS (offres_stories) et disponible pour toute
-- policy future ayant besoin d'un contrôle par fonctionnalité. Équivalent
-- SQL du hasFeature() JS (src/lib/plans.js) et Deno (_shared/planFeatures.ts).
CREATE OR REPLACE FUNCTION plan_has_feature(p_pharmacie_id UUID, p_feature TEXT)
RETURNS BOOLEAN LANGUAGE SQL STABLE AS $$
  SELECT COALESCE(
    (SELECT CASE p_feature
       WHEN 'offres_stories' THEN pp.feature_offres_stories
       WHEN 'sonnette'       THEN pp.feature_sonnette
       ELSE false
     END
     FROM pharmacies ph JOIN pricing_plans pp ON pp.id = ph.plan
     WHERE ph.id = p_pharmacie_id),
    false
  );
$$;

-- offres_stories : l'ancienne policy "ALL" (pharmacie_owns_offres) ne
-- distinguait pas la création (à restreindre par plan) de la modification/
-- suppression d'une offre déjà existante (jamais bloquée par un changement
-- de plan ultérieur — un downgrade ne doit pas rendre orphelines des offres
-- déjà créées, cohérent avec "pas de perte immédiate de fonctionnalités").
DROP POLICY IF EXISTS pharmacie_owns_offres ON offres_stories;

CREATE POLICY pharmacie_select_own_offres ON offres_stories FOR SELECT
  USING (pharmacie_id IN (SELECT pharmacie_id FROM pharmacie_users WHERE id = auth.uid()));

CREATE POLICY pharmacie_insert_own_offres ON offres_stories FOR INSERT
  WITH CHECK (
    pharmacie_id IN (SELECT pharmacie_id FROM pharmacie_users WHERE id = auth.uid())
    AND plan_has_feature(pharmacie_id, 'offres_stories')
  );

CREATE POLICY pharmacie_update_own_offres ON offres_stories FOR UPDATE
  USING (pharmacie_id IN (SELECT pharmacie_id FROM pharmacie_users WHERE id = auth.uid()));

CREATE POLICY pharmacie_delete_own_offres ON offres_stories FOR DELETE
  USING (pharmacie_id IN (SELECT pharmacie_id FROM pharmacie_users WHERE id = auth.uid()));

-- Limite de postes : le trigger avait ses propres valeurs codées en dur
-- (2/5/15, corrigées en 3/10/999 en Phase 1) au lieu de lire pricing_plans —
-- même dette technique que trimPostes.ts (edge function change-plan),
-- corrigée ici pour les deux à la fois (source unique désormais).
CREATE OR REPLACE FUNCTION public.check_poste_limit()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_plan  TEXT;
  v_limit INT;
  v_count INT;
BEGIN
  IF NEW.actif IS NOT TRUE THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.actif IS TRUE THEN
    RETURN NEW;
  END IF;

  SELECT plan INTO v_plan FROM pharmacies WHERE id = NEW.pharmacie_id;
  SELECT max_postes INTO v_limit FROM pricing_plans WHERE id = v_plan;
  IF v_limit IS NULL THEN v_limit := 3; END IF; -- repli = limite Essentiel

  SELECT count(*) INTO v_count FROM pharmacie_postes
    WHERE pharmacie_id = NEW.pharmacie_id AND actif = TRUE AND id <> NEW.id;

  IF v_count + 1 > v_limit THEN
    RAISE EXCEPTION 'Limite de postes actifs atteinte pour ce plan (% max)', v_limit;
  END IF;
  RETURN NEW;
END;
$function$
