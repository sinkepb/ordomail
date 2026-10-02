-- ═══════════════════════════════════════════════════════════════════════════
-- Diagnostic usage réseau : le produit pivote-t-il vers les rappels ?
-- Lecture seule, aucune écriture. À exécuter sur PROD :
--   npx supabase db query --linked --file supabase/scripts/diagnostic-usage-rappels.sql
-- (vérifier au préalable `npx supabase projects list` / `supabase status` :
-- le link doit pointer vers hdgpkgaznsaocczxvaix, pas vers le preview)
-- ═══════════════════════════════════════════════════════════════════════════

-- 1) Adoption : parmi les pharmacies au plan Performance ('pro', seul plan
--    avec accès aux rappels), combien ont réellement créé au moins un rappel ?
--    Un faible taux ici indiquerait un problème d'onboarding/découverte,
--    pas un désintérêt produit.
SELECT
  p.plan,
  count(*)                                              AS nb_pharmacies,
  count(*) FILTER (WHERE r.pharmacie_id IS NOT NULL)    AS nb_avec_au_moins_1_rappel,
  round(
    100.0 * count(*) FILTER (WHERE r.pharmacie_id IS NOT NULL) / NULLIF(count(*), 0), 1
  )                                                      AS pct_adoption
FROM pharmacies p
LEFT JOIN (SELECT DISTINCT pharmacie_id FROM rappels_ordonnance) r
  ON r.pharmacie_id = p.id
WHERE p.plan_status NOT IN ('canceled')
GROUP BY p.plan
ORDER BY p.plan;

-- 2) Tendance de volume : rappels créés par mois (6 derniers mois).
--    Une courbe montante confirme le pivot ; un plateau suggère un usage
--    ponctuel plutôt qu'un cœur de produit.
SELECT
  date_trunc('month', created_at)::date AS mois,
  count(*)                              AS rappels_crees
FROM rappels_ordonnance
WHERE created_at >= now() - interval '6 months'
GROUP BY 1
ORDER BY 1;

-- 3) Récurrence (stickiness) : distribution du nombre de cycles par rappel.
--    cycle_numero > 1 = le pharmacien a validé un renouvellement et le
--    patient est reparti pour un tour — signe d'un usage installé, pas d'un
--    test one-shot.
SELECT
  cycle_numero,
  count(*) AS nb_rappels
FROM rappels_ordonnance
GROUP BY cycle_numero
ORDER BY cycle_numero;

-- 4) Charge opérationnelle actuelle : répartition des statuts en cours.
--    "a_traiter" élevé = charge de traitement réelle au comptoir, donc un
--    outil utilisé quotidiennement (pas juste paramétré puis oublié).
SELECT statut, count(*) AS nb
FROM rappels_ordonnance
GROUP BY statut
ORDER BY nb DESC;

-- 5) Friction / rejet patient : taux d'opt-out parmi les rappels ayant eu
--    une réponse patient. Un taux élevé indiquerait un canal mal perçu.
SELECT
  count(*) FILTER (WHERE choix_patient IS NOT NULL)               AS reponses_total,
  count(*) FILTER (WHERE choix_patient = 'stop')                  AS opt_out,
  round(
    100.0 * count(*) FILTER (WHERE choix_patient = 'stop')
    / NULLIF(count(*) FILTER (WHERE choix_patient IS NOT NULL), 0), 1
  )                                                                 AS pct_opt_out
FROM rappels_ordonnance;

-- 6) Poids relatif : volume de rappels vs volume d'ordonnances "classiques"
--    (dépôt QR/email) sur les 30 derniers jours, par pharmacie Performance.
--    Si le volume rappels approche ou dépasse le flux d'ordonnances
--    entrantes, le centre de gravité de l'usage a effectivement basculé.
SELECT
  p.id,
  p.nom,
  count(DISTINCT o.id) FILTER (WHERE o.received_at >= now() - interval '30 days') AS ordos_30j,
  count(DISTINCT r.id) FILTER (WHERE r.created_at   >= now() - interval '30 days') AS rappels_crees_30j
FROM pharmacies p
LEFT JOIN ordonnances        o ON o.pharmacie_id = p.id
LEFT JOIN rappels_ordonnance r ON r.pharmacie_id = p.id
WHERE p.plan = 'pro' AND p.plan_status NOT IN ('canceled')
GROUP BY p.id, p.nom
ORDER BY rappels_crees_30j DESC;

-- 7) Volume SMS généré (proxy de coût/valeur) : événements sms_envoye des
--    30 derniers jours, par pharmacie — à rapprocher du quota de 100
--    inclus/mois pour voir combien de pharmacies dépassent déjà
--    régulièrement (signal de dépendance forte à la fonctionnalité).
SELECT
  r.pharmacie_id,
  count(*) FILTER (WHERE e.type = 'sms_envoye' AND e.created_at >= now() - interval '30 days') AS sms_envoyes_30j
FROM rappels_evenements e
JOIN rappels_ordonnance r ON r.id = e.rappel_id
GROUP BY r.pharmacie_id
HAVING count(*) FILTER (WHERE e.type = 'sms_envoye' AND e.created_at >= now() - interval '30 days') > 0
ORDER BY sms_envoyes_30j DESC;
