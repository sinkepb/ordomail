-- Phase 1 tarification : nouvelles limites de postes vendeurs par plan
-- (Essentiel 3, Fluidité 10, Performance illimité — 999 = sentinelle
-- "illimité" déjà utilisée côté frontend, ex. Dashboard.jsx/BillingModule.jsx).
--
-- @dette-technique cette limite reste codée en dur ici (comme avant cette
-- migration) plutôt que lue depuis pricing_plans.max_postes — la
-- centralisation complète (getLimit()) est prévue en Phase 2 du chantier
-- tarification, pas dans cette migration qui ne fait que corriger les
-- chiffres pour qu'ils reflètent les nouveaux plans officiels dès
-- maintenant.
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
    RETURN NEW; -- déjà actif avant cette écriture, pas une (ré)activation
  END IF;

  SELECT plan INTO v_plan FROM pharmacies WHERE id = NEW.pharmacie_id;
  v_limit := CASE v_plan WHEN 'starter' THEN 3 WHEN 'standard' THEN 10 WHEN 'pro' THEN 999 ELSE 3 END;

  SELECT count(*) INTO v_count FROM pharmacie_postes
    WHERE pharmacie_id = NEW.pharmacie_id AND actif = TRUE AND id <> NEW.id;

  IF v_count + 1 > v_limit THEN
    RAISE EXCEPTION 'Limite de postes actifs atteinte pour ce plan (% max)', v_limit;
  END IF;
  RETURN NEW;
END;
$function$
