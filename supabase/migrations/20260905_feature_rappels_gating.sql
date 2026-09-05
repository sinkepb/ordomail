-- OrdoMail — chantier tarification : Rappels de renouvellement devient une
-- fonctionnalite du plan Performance (05/09/2026).
--
-- Jusqu'ici disponible sans aucune restriction sur tous les plans (jamais
-- gate lors de sa construction). Decision explicite de l'utilisateur en
-- mettant a jour la page tarifs : meme traitement que offres_stories et
-- sonnette (colonne dediee sur pricing_plans + plan_has_feature()).
--
-- Rappel d'architecture (voir 20260905_fix_plan_has_feature_rls.sql) :
-- rappels_ordonnance n'est jamais ecrite directement par le client (deny-all,
-- uniquement via secure-data en cle de service) — le controle serveur se
-- fait donc explicitement dans le handler rappels_create (planHasFeature(),
-- _shared/planFeatures.ts), pas via une policy RLS. La fonction SQL
-- plan_has_feature() est neanmoins etendue ici pour rester la source de
-- verite unique cote SQL, au cas ou une policy future en aurait besoin.

ALTER TABLE pricing_plans ADD COLUMN IF NOT EXISTS feature_rappels BOOLEAN NOT NULL DEFAULT false;

UPDATE pricing_plans SET feature_rappels = true WHERE id = 'pro';

CREATE OR REPLACE FUNCTION public.plan_has_feature(p_pharmacie_id uuid, p_feature text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT CASE p_feature
       WHEN 'offres_stories' THEN pp.feature_offres_stories
       WHEN 'sonnette'       THEN pp.feature_sonnette
       WHEN 'rappels'        THEN pp.feature_rappels
       ELSE false
     END
     FROM pharmacies ph JOIN pricing_plans pp ON pp.id = ph.plan
     WHERE ph.id = p_pharmacie_id),
    false
  );
$$;
