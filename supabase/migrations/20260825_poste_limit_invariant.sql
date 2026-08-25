-- OrdoMail — invariant : jamais plus de postes actifs que la limite du plan (25/08/2026)
--
-- Jusqu'ici seule la logique applicative empêchait de dépasser la limite —
-- Dashboard.jsx:addPoste vérifie côté client avant la création, mais rien
-- n'empêchait de RÉACTIVER un poste désactivé (le petit interrupteur actif/
-- inactif de l'onglet Postes) au-delà de la limite, et rien côté base
-- n'empêchait un appel direct à l'API REST. Un compte "Pharmacie de la Paix"
-- (plan standard, limite 5) avait ainsi 6 postes actifs en production.
--
-- Ce trigger couvre le sens "empêcher de dépasser" (création ou réactivation).
-- Le sens symétrique — le plan RÉTRÉCIT (rétrogradage) — est traité par
-- trimExcessPostes (_shared/trimPostes.ts, appelé depuis change-plan,
-- stripe-webhook et secure-data-admin:admin_update_plan) qui désactive les
-- postes excédentaires : un trigger sur pharmacie_postes ne peut rien faire
-- quand c'est pharmacies.plan qui change.

CREATE OR REPLACE FUNCTION check_poste_limit() RETURNS TRIGGER AS $$
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
  v_limit := CASE v_plan WHEN 'starter' THEN 2 WHEN 'standard' THEN 5 WHEN 'pro' THEN 15 ELSE 2 END;

  SELECT count(*) INTO v_count FROM pharmacie_postes
    WHERE pharmacie_id = NEW.pharmacie_id AND actif = TRUE AND id <> NEW.id;

  IF v_count + 1 > v_limit THEN
    RAISE EXCEPTION 'Limite de postes actifs atteinte pour ce plan (% max)', v_limit;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_check_poste_limit ON pharmacie_postes;
CREATE TRIGGER trg_check_poste_limit
  BEFORE INSERT OR UPDATE ON pharmacie_postes
  FOR EACH ROW EXECUTE FUNCTION check_poste_limit();

-- Nettoyage : désactive les postes déjà excédentaires (les plus récents
-- d'abord, cohérent avec UpgradeModal.jsx qui garde les postes les plus
-- anciens actifs lors d'un rétrogradage).
WITH ranked AS (
  SELECT pp.id,
    row_number() OVER (PARTITION BY pp.pharmacie_id ORDER BY pp.created_at ASC) AS rn,
    CASE ph.plan WHEN 'starter' THEN 2 WHEN 'standard' THEN 5 WHEN 'pro' THEN 15 ELSE 2 END AS limite
  FROM pharmacie_postes pp
  JOIN pharmacies ph ON ph.id = pp.pharmacie_id
  WHERE pp.actif = TRUE
)
UPDATE pharmacie_postes SET actif = FALSE
WHERE id IN (SELECT id FROM ranked WHERE rn > limite);
