-- OrdoMail — rend metriques_journalieres indépendante de la purge (27/08/2026)
--
-- snapshot-metriques recalculait jusqu'ici ordos_mois/ordos_semaine/
-- ordos_total/canal_*_pct/delai_moyen_min en interrogeant directement la
-- table `ordonnances` sur des fenêtres de 7/30 jours voire depuis toujours —
-- ça fonctionnait tant qu'aucune purge n'existait, mais depuis l'activation
-- de la purge à J+3 (voir purge-ordonnances), ces requêtes ne voient plus
-- que 3 jours d'historique : les statistiques cumulées/mensuelles sont
-- silencieusement sous-évaluées pour toutes les pharmacies.
--
-- Colonnes ajoutées pour permettre de recalculer ces agrégats à partir des
-- snapshots quotidiens déjà stockés (aucune donnée patient, jamais purgés)
-- plutôt que depuis la table source :
--   qr_jour / email_jour       : compteurs par canal du jour même
--   delai_moyen_jour           : délai moyen du jour même (pas glissant)
--   delai_count_jour           : nombre d'ordonnances utilisées pour ce
--                                 délai — permet une moyenne pondérée sur
--                                 plusieurs jours plutôt qu'une simple
--                                 moyenne de moyennes.

ALTER TABLE metriques_journalieres ADD COLUMN IF NOT EXISTS qr_jour INTEGER DEFAULT 0;
ALTER TABLE metriques_journalieres ADD COLUMN IF NOT EXISTS email_jour INTEGER DEFAULT 0;
ALTER TABLE metriques_journalieres ADD COLUMN IF NOT EXISTS delai_moyen_jour INTEGER DEFAULT 0;
ALTER TABLE metriques_journalieres ADD COLUMN IF NOT EXISTS delai_count_jour INTEGER DEFAULT 0;
