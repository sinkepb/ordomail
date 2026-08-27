-- Recherche floue (pg_trgm) sur le référentiel pharmacies, utilisée par
-- l'edge function search-pharmacies-referentiel (autocomplete inscription).
CREATE OR REPLACE FUNCTION search_pharmacies_referentiel(q TEXT, max_results INTEGER DEFAULT 8)
RETURNS TABLE (siret TEXT, nom TEXT, adresse TEXT, code_postal TEXT, commune TEXT)
LANGUAGE SQL STABLE AS $$
  -- % (trgm) attrape les fautes de frappe/variantes ; ILIKE préfixe garantit
  -- que les débuts de mots exacts remontent aussi pour une requête courte
  -- (2-3 caractères), où le signal trigram seul est souvent trop faible.
  SELECT siret, nom, adresse, code_postal, commune
  FROM pharmacies_referentiel
  WHERE nom % q OR commune % q OR nom ILIKE q || '%' OR commune ILIKE q || '%'
  ORDER BY GREATEST(similarity(nom, q), similarity(commune, q)) DESC
  LIMIT max_results;
$$;
