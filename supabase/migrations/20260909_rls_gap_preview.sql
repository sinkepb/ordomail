-- OrdoMail — comble un écart RLS entre preview et production (09/09/2026)
--
-- Détecté par les Security Advisors Supabase sur le projet preview
-- (uygaqxruuxpfhvzjuksy) : trois tables avaient RLS désactivée alors que la
-- production (hdgpkgaznsaocczxvaix) l'a déjà activée depuis leur création —
-- un écart de configuration entre les deux projets, pas une régression du
-- schéma versionné ici. N'importe qui muni de la seule clé publique `anon`
-- pouvait donc lire/modifier/supprimer ces données sur preview :
--
--  - ordomail_admins        : email + hash bcrypt des comptes admin backoffice
--                              (le plus grave des trois — fuite d'identifiants)
--  - metriques_journalieres : statistiques d'activité de TOUTES les pharmacies
--  - offres_stories         : avait déjà ses policies RLS écrites
--                              (pharmacie_select/insert/update/delete_own_offres,
--                              public_read_offres_actives) mais RLS n'était
--                              jamais activée sur la table elle-même — un
--                              classique "policies écrites, RLS pas activée"
--                              déjà repéré par l'advisor (policy_exists_rls_disabled).
--
-- Alignement strict sur la configuration déjà en place et déjà éprouvée en
-- production — voir vérification live (pg_class.relrowsecurity, grants) :
--  - offres_stories : ENABLE suffit, les policies existantes reproduisent déjà
--    le bon accès (pharmacien scopé à sa pharmacie + lecture publique des
--    offres actives pour PatientPage) — aucun changement fonctionnel attendu.
--  - metriques_journalieres : ENABLE sans policy, comme en production — cette
--    table n'est censée être écrite/lue que par le rôle de service
--    (snapshot-metriques, cron). Le bouton "Recalculer" et l'historique de
--    ClientDetail.jsx (src/lib/supabase/metriques.js) appellent aujourd'hui
--    cette table en direct avec le client anon/authenticated : ce chemin est
--    déjà silencieusement non fonctionnel en production (0 ligne renvoyée)
--    depuis que la table y est verrouillée — signalé séparément, hors
--    périmètre de ce correctif de sécurité.
--  - ordomail_admins : donnée la plus sensible des trois → même défense en
--    profondeur que vendeur_sessions (20260906_vendeur_sessions_rls.sql) :
--    ENABLE + FORCE + REVOKE explicite, en plus de l'absence de policy. Le
--    seul accès prévu passe par les fonctions SQL SECURITY DEFINER
--    verify_admin_login/verify_admin_password (déjà REVOKE FROM PUBLIC) ou le
--    rôle de service dans supabase/functions/verify-admin.

ALTER TABLE offres_stories ENABLE ROW LEVEL SECURITY;

ALTER TABLE metriques_journalieres ENABLE ROW LEVEL SECURITY;

ALTER TABLE ordomail_admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE ordomail_admins FORCE ROW LEVEL SECURITY;
REVOKE ALL ON ordomail_admins FROM anon, authenticated;
