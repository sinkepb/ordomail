-- OrdoMail — corrige plan_has_feature(), inutilisable depuis une policy RLS
-- cote client (05/09/2026).
--
-- Bug trouve en testant la publication de stories de catalogue PDF : AUCUNE
-- offre (peu importe le type — promo/service/fidelite/avis_google/catalogue)
-- ne pouvait plus etre creee depuis le client, en preview comme en
-- production. Repere via reproduction directe (curl + JWT du testeur) :
-- l'insertion echouait avec "new row violates row-level security policy for
-- table offres_stories", meme pour une offre "promo" toute simple creee via
-- le formulaire standard "+ Nouvelle offre" — rien a voir avec le nouveau
-- module PDF en lui-meme.
--
-- Cause racine : pricing_plans a ete verrouillee des sa creation
-- (20260724_phase3_pricing.sql) — RLS + FORCE ROW LEVEL SECURITY, aucune
-- policy pour anon/authenticated, lecture reservee a secure-data (cle de
-- service). C'etait deliberement le cas AVANT que plan_has_feature() ne soit
-- introduite (20260829_phase2_feature_gating.sql) pour la policy
-- "pharmacie_insert_own_offres" (offres_stories) : cette fonction, en
-- LANGUAGE SQL simple (pas SECURITY DEFINER), s'execute avec les droits du
-- role appelant. Invoquee par le role authenticated via cette policy RLS,
-- elle ne peut donc jamais lire pricing_plans (deny-all) — le JOIN ne
-- renvoie aucune ligne, COALESCE retombe sur false, et la policy rejette
-- systematiquement toute creation d'offre, quel que soit le plan reel de la
-- pharmacie. Confirme en simulant le contexte RLS exact (SET LOCAL ROLE
-- authenticated + request.jwt.claims) sur preview ET production.
--
-- Correction : SECURITY DEFINER + search_path fixe (bonne pratique pour
-- toute fonction SECURITY DEFINER, evite un detournement par un search_path
-- non qualifie). Le proprietaire de la fonction (postgres, qui migre) a
-- rolbypassrls=true — le SECURITY DEFINER contourne donc bien le verrou de
-- pricing_plans, qui reste par ailleurs inchangee (toujours illisible en
-- lecture directe pour anon/authenticated, seule la valeur booleenne dérivee
-- est exposee via cette fonction).
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
       ELSE false
     END
     FROM pharmacies ph JOIN pricing_plans pp ON pp.id = ph.plan
     WHERE ph.id = p_pharmacie_id),
    false
  );
$$;
