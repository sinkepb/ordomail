# Audit complet OrdoMail — 05/10/2026

Périmètre : code front (`src/`), Edge Functions (`supabase/functions/`), migrations (`supabase/migrations/`), CI, dépendances, documentation. Audit de code et de mesures ; les tests de bout en bout dans un navigateur, les tests de charge et la vérification du schéma de production n'ont pas été réalisés.

## Note globale : 6,2 / 10

Le produit est fonctionnel et testé sur ses parties critiques (rappels, ordonnances, sonnette). Les faiblesses principales sont la taille de certains composants, un contrôle d'accès encore fragile sur les actions patient, et l'accessibilité, très peu traitée.

| Domaine | Note | Commentaire |
|---|---|---|
| Sécurité | 6,0 | Bonnes bases (RLS, CORS allowlist, secrets cron par fonction, signature Stripe). Points ouverts importants. |
| Fiabilité et tests | 6,5 | 183 tests réussis, 16 ignorés ; couverture front limitée. |
| Architecture et modularité | 5,0 | Trois composants géants ; découpage serveur réussi. |
| Qualité de code | 6,0 | 86 `any` dans les Edge Functions, 21 avertissements lint, 19 `console.log`. |
| Performance | 5,5 | Bundle OpenCV de 15,5 Mo chargé à la demande ; bundle principal de 400 Ko. |
| Accessibilité | 4,0 | 7 images sans `alt`, 3 attributs ARIA dans tout le front. |
| Données et conformité | 6,0 | Suppression logique, purge, registre des traitements. Pas de certification HDS. |
| Déploiement et exploitation | 6,5 | CI (build, lint, tests, audit prod), monitoring et suivi des cron jobs. Déploiement manuel. |
| Dépendances | 7,5 | Audit prod : une vulnérabilité faible. Hautes en développement uniquement. |
| Documentation | 7,0 | Nombreux documents ; plusieurs sont des instantanés datés. |
| Expérience utilisateur | non noté | Pas de test dans le navigateur à cette étape. |

## 1. Sécurité — 6,0

**Acquis vérifiés**
- RLS activée sur les tables sensibles ; `appels_patient` restreint à la lecture du titulaire (migration 20261006).
- CORS en allowlist explicite, sans wildcard Vercel.
- Secrets cron distincts par fonction, comparés en temps constant.
- Webhook Stripe vérifié par signature.
- Aucune clé `service_role` dans le front.
- Filtrage par `pharmacie_id` sur les lectures et écritures de `secure-data`.

**Points ouverts**
| Gravité | Constat | Action |
|---|---|---|
| Élevée | Réservation et intérêt sur offres : un code patient à 4 caractères (environ 208 000 combinaisons par pharmacie) suffit à agir pour un autre patient. | Jeton signé côté patient, ou code plus long, avec limite par (pharmacie, code). |
| Élevée | Limite de requêtes lue sur `X-Forwarded-For`, contournable si le gateway ne réécrit pas l'en-tête. | Vérifier le comportement réel du gateway ; utiliser l'IP de confiance. |
| Élevée | Canal Realtime `appels:<pharmacieId>` public : n'importe qui connaissant l'identifiant de la pharmacie peut écouter les codes appelés. | Canaux privés avec politiques Realtime. |
| Moyenne | `register-pharmacie` rattache un utilisateur à une pharmacie sans session. | Exiger une session ou un jeton de confirmation. |
| Moyenne | Jetons vendeur et admin en `sessionStorage`, non révocables côté serveur. | Révocation serveur ; évaluer un stockage plus restrictif. |
| Moyenne | Token de rappel dans la query string (`resolve-rappel`), donc dans les logs d'accès. | Passer le token en en-tête ou en corps. |
| Moyenne | Secrets de webhook dans l'URL (`receive-email`, `send-email`). | Déplacer dans un en-tête. |
| Faible | `plan_has_feature` exécutable par `anon` (lecture seule). | `REVOKE` explicite. |
| Faible | `pin_hash` des postes renvoyé à l'admin (`secure-data-admin`). | Ne pas renvoyer le hash. |
| Faible | `.env.local` suivi par Git (il contient seulement l'URL et la clé anon du preview, publiques par conception). | `git rm --cached .env.local` après validation. |

**Non vérifié** : schéma réel de production (politiques non versionnées), corps complet de certaines fonctions, configuration Realtime.

## 2. Fiabilité et tests — 6,5

- 183 tests réussis, 16 ignorés (ceux qui demandent des secrets absents), 17 fichiers de test.
- Tests serveur solides sur les handlers de rappels (préparation, suppression, réponse), la logique de regroupement et les migrations de données.
- Tests front limités : 6 fichiers couvrent utilitaires et composants rappels. `PatientPage`, `Dashboard`, `LoginPage` ne sont pas testés.
- Tests de bout en bout Playwright : 4 scénarios, non exécutés dans la CI.
- Les correctifs récents (groupes, cadrage, sonnette) sont vérifiés par tests unitaires, pas encore par tests de parcours.

**Action** : ajouter des tests de parcours sur le dépôt d'ordonnance et la préparation de groupe ; intégrer Playwright à la CI.

## 3. Architecture et modularité — 5,0

Fichiers les plus volumineux (lignes / états `useState`) :
- `PatientPage.jsx` : 1 686 lignes, 24 états.
- `Dashboard.jsx` : 1 482 lignes, 53 états.
- `OrdoCard.jsx` : 746 lignes ; `RappelsSection.jsx` : 744 lignes ; `LoginPage.jsx` : 696 lignes ; `print.jsx` : 693 lignes.

Acquis : `secure-data` découpé en quatre domaines, handlers testables avec client injecté, composants rappels extraits, convention de découpage documentée.

**Action** : continuer le découpage de `Dashboard.jsx` et `PatientPage.jsx` (sous-composants et hooks), en commençant par la partie cadrage et envoi de `PatientPage`.

## 4. Qualité de code — 6,0

- 21 avertissements ESLint, 0 erreur.
- 86 occurrences de `: any` dans les Edge Functions.
- 19 `console.log` dans `src/`, dont certains affichent des identifiants partiellement masqués.
- Un marqueur TODO/FIXME restant.
- Commentaires historiques très longs (dates, retours) : utiles pour le suivi, mais alourdissent les fichiers.

**Action** : passer les avertissements ESLint à zéro, typer les réponses Supabase principales, retirer les `console.log` de production.

## 5. Performance — 5,5

- Bundle OpenCV de 15,5 Mo, chargé à la demande (bon réflexe), mais lourd sur téléphone en réseau faible.
- Bundle principal de 401 Ko, bundle PDF de 390 Ko.
- Le recadrage et l'OCR tournent dans le navigateur du patient : coût variable selon l'appareil.

**Action** : mesurer le temps réel sur un téléphone d'entrée de gamme ; envisager un traitement côté serveur pour les appareils lents ; découper le bundle PDF.

## 6. Accessibilité — 4,0

- 7 balises `<img>` sans attribut `alt`.
- 3 attributs `aria-*` dans tout le front.
- Contrastes non vérifiés ; navigation au clavier non testée.
- L'écran de cadrage (nouveau) utilise des poignées au pointeur, sans alternative au clavier.

**Action** : audit d'accessibilité avec un outil (axe, Lighthouse) ; ajouter `alt`, rôles, et une alternative clavier au cadrage.

## 7. Données et conformité — 6,0

Acquis : suppression logique avec purge de rétention, export RGPD, demande de suppression de compte, registre des traitements (`docs/registre-traitements.md`), dossier technique HDS (`docs/dossier-technique-migration-hds.md`).

Manques : aucune certification HDS obtenue ; DPA à signer avec chaque pharmacie ; chiffrement au repos et en transit à documenter avec l'hébergeur.

## 8. Déploiement et exploitation — 6,5

Acquis : CI bloquante sur build, lint, tests et audit des dépendances de production ; suivi des cron jobs dans le backoffice ; alertes en base (`alerts`) ; sauvegarde avant migration.

Points faibles :
- Migrations appliquées à la main sur preview (la CLI ne suit pas l'historique) ; risque de dérive entre environnements.
- Pas de parité automatique preview / production.
- Déploiement des fonctions manuel, sans pipeline.

**Action** : réparer l'historique de migrations avec `supabase migration repair`, puis automatiser le déploiement des fonctions dans la CI sur `main` après validation.

## 9. Dépendances — 7,5

- `npm audit --omit=dev` : une vulnérabilité faible.
- Vulnérabilités élevées et modérées limitées aux dépendances de développement (esbuild, eslint), sans effet sur le bundle livré.

**Action** : mettre à jour esbuild et eslint quand c'est possible sans régression.

## 10. Documentation — 7,0

Acquis : README, guides titulaire et vendeur, dossier technique, registre, audits datés, plaquette commerciale, checklist de déploiement référencée dans la CI.

Points faibles : plusieurs audits datés s'accumulent sans index ; la documentation technique des Edge Functions n'est pas centralisée.

**Action** : tenir un index des audits et une fiche par fonction Edge.

## Priorités recommandées

1. **Avant toute nouvelle mise en production** : jeton ou code plus long pour les offres ; canaux Realtime privés ; contrôle du gateway pour la limite de requêtes.
2. **Court terme** : `register-pharmacie` avec session ; `REVOKE` sur `plan_has_feature` ; retrait de `pin_hash` ; `.env.local` hors du suivi Git.
3. **Court terme** : tests de parcours (ordonnance, groupe, sonnette) et Playwright dans la CI.
4. **Moyen terme** : découpage de `Dashboard.jsx` et `PatientPage.jsx` ; accessibilité ; réduction des `any`.
5. **Moyen terme** : réparation de l'historique des migrations et automatisation des déploiements.

## Limites de cet audit

- Pas de test dans un navigateur, ni sur mobile réel.
- Pas de test de charge.
- Schéma de production non vérifié directement.
- Pas de revue humaine complète : les notes sont des jugements de code et de mesures, à confronter à un audit externe avant toute certification.
