-- OrdoMail — Réactivation d'un rappel terminé (07/09/2026).
--
-- Jusqu'ici, un rappel "termine" ne pouvait plus repartir : le pharmacien
-- devait recréer un rappel entièrement (nom/prénom/téléphone/consentement)
-- pour le même patient, retour direct jugé inutilement lourd. secure-data
-- expose désormais "rappels_reactiver" qui repasse le rappel en "en_attente"
-- (même logique que "rappels_traiter" : cycle_numero+1, date de relance
-- J+21 par défaut) — ajoute simplement "reactive" aux types d'événements
-- déjà journalisés pour ce rappel.
ALTER TABLE rappels_evenements DROP CONSTRAINT IF EXISTS rappels_evenements_type_check;
ALTER TABLE rappels_evenements ADD CONSTRAINT rappels_evenements_type_check
  CHECK (type IN ('cree','sms_envoye','sms_echec','reponse_patient','traite','termine','reactive'));
