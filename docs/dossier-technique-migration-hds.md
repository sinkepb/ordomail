# OrdoMail — Dossier technique pour devis d'hébergement HDS

Document préparé pour accélérer les échanges avec des hébergeurs certifiés HDS
(vérifier leur certification à jour sur le registre officiel de l'ANS avant
tout engagement). Reflète l'état réel du code au 08/08/2026.

---

## 1. Résumé de l'architecture actuelle

OrdoMail est une plateforme SaaS (React/Vite en frontend, hébergée sur
Vercel/Netlify — hors périmètre HDS) dont tout le backend repose aujourd'hui
sur **Supabase** (projet unique, non certifié HDS) :

| Brique | Techno actuelle | À migrer |
|---|---|---|
| Base de données | PostgreSQL managé (Supabase) | Oui |
| Stockage de fichiers | Supabase Storage (S3-compatible) | Oui |
| Fonctions serveur | Deno Edge Functions (Supabase) | Oui |
| Authentification | Supabase Auth (email/mot de passe, MFA TOTP) | Oui |
| Temps réel | Supabase Realtime (WebSocket, `postgres_changes`) | Oui |
| Tâches planifiées | pg_cron (1 job nocturne) | Oui |
| Réception email entrante | Postmark (webhook → edge function) | À statuer avec le DPO |
| Paiement | Stripe (Checkout + webhooks) | Hors périmètre HDS — aucune donnée de santé n'y transite |

Aucun serveur applicatif classique (pas de VM/conteneur Node.js à héberger
séparément) — tout le code serveur est actuellement sous forme de fonctions
Deno serverless.

---

## 2. Base de données — 18 tables

| Table | Contient des données de santé ? | Rôle |
|---|---|---|
| `ordonnances` | **Oui** (fichier joint + métadonnées patient) | Cœur du produit — dépôt/traitement des ordonnances |
| `pharmacies` | Non | Comptes clients (pharmacies) |
| `pharmacie_postes` | Non | Postes vendeurs (PIN de connexion) |
| `pharmacie_users` | Non | Lien compte titulaire ↔ pharmacie |
| `audit_logs` | Indirectement (référence des consultations d'ordonnances) | Journal d'activité |
| `offre_interets` | Non | Intérêt patient pour une offre promo |
| `story_metrics` | Non | Analytics stories patient |
| `appels_patient` | Non | Notifications sonnette |
| `offres_stories` / `stories_content` / `pharmacie_stories_selection` | Non | Contenu marketing/promo |
| `abonnements` / `factures` / `pricing_plans` | Non | Facturation (miroir Stripe) |
| `metriques_journalieres` | Non | Métriques agrégées quotidiennes |
| `ordomail_admins` | Non | Comptes internes OrdoMail (backoffice) |
| `pin_verification_attempts` / `submission_log` | Non | Compteurs anti-abus (rate limiting) |
| `alerts` | Non | Alerting opérationnel interne |

**Seule `ordonnances` (et indirectement `audit_logs`) porte des données de
santé au sens RGPD.** Ça peut influencer une architecture hybride (héberger
uniquement ces tables + le stockage fichiers chez un HDS certifié, le reste
ailleurs) — à valider avec le DPO, cette option réduit potentiellement le
coût mais complexifie l'architecture (deux bases, jointures cross-instance
impossibles nativement).

Extensions Postgres utilisées : `uuid-ossp`, `pgcrypto`. Aucune extension
propriétaire Supabase non portable identifiée dans le schéma.

---

## 3. Stockage de fichiers — 2 buckets

| Bucket | Visibilité | Contenu |
|---|---|---|
| `ordonnances-files` | Privé | **Photos/PDF des ordonnances — données de santé** |
| `logos-pharmacies` | Public | Logos des pharmacies clientes (non sensible) |

Accès actuel via URLs signées à durée limitée (pas d'accès public direct aux
ordonnances).

---

## 4. Fonctions serveur — 13 edge functions Deno

| Fonction | Rôle | Sensibilité |
|---|---|---|
| `submit-ordonnance` | Dépôt d'ordonnance (QR code) — écrit dans `ordonnances` + upload fichier | **Haute** (chemin patient) |
| `receive-email` / `send-email` | Réception d'ordonnance par email (webhook Postmark) | **Haute** |
| `secure-data` | Point d'entrée unique pour toutes les lectures scopées (vendeur/titulaire/admin), vérification de jeton JWT | Haute (contrôle d'accès central) |
| `verify-pin` / `update-pin` | Authentification poste vendeur (PIN 4 chiffres, bcrypt) | Moyenne |
| `verify-admin` | Authentification backoffice OrdoMail Business | Moyenne |
| `register-pharmacie` | Création de compte pharmacie | Moyenne |
| `toggle-interet` | Marquage d'intérêt patient pour une offre | Faible |
| `create-checkout-session` / `change-plan` / `stripe-webhook` | Facturation (Stripe) | Faible (aucune donnée de santé) |
| `snapshot-metriques` | Cron nocturne — calcul de métriques agrégées | Faible |

Toutes utilisent le SDK `@supabase/supabase-js` et une clé de service
(bypass RLS, contrôles d'accès faits explicitement en code). Portage
nécessaire vers l'équivalent runtime de l'hébergeur retenu (conteneurs,
fonctions serverless propriétaires, ou Deno auto-hébergé) — à clarifier avec
chaque candidat : certains hébergeurs HDS ne couvrent que l'IaaS brut, pas
l'exécution de fonctions applicatives.

Secrets actuellement utilisés par ces fonctions (à reprovisionner à
l'identique chez le nouvel hébergeur) : `SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`, `ORDOMAIL_JWT_SECRET`, `STRIPE_SECRET_KEY`,
`STRIPE_WEBHOOK_SECRET`, `APP_URL`, `SNAPSHOT_CRON_SECRET`,
`ALERT_WEBHOOK_URL` (optionnel).

---

## 5. Authentification

- **Titulaire** : email + mot de passe (Supabase Auth), MFA TOTP optionnel
  (`auth.mfa.*`).
- **Vendeur** : PIN à 4 chiffres par poste, pas de session Supabase Auth —
  jeton JWT applicatif signé (HMAC, secret `ORDOMAIL_JWT_SECRET`).
- **Admin backoffice** : email + mot de passe (bcrypt, table
  `ordomail_admins`), jeton JWT applicatif séparé.

À demander à chaque hébergeur : possibilité d'auto-héberger un service
d'identité compatible (ex. Keycloak), ou service d'authentification managé
équivalent couvrant MFA TOTP.

---

## 6. Temps réel et tâches planifiées

- **Realtime** : abonnement WebSocket sur les tables `ordonnances` (nouvelles
  ordonnances) — utilisé par le tableau de bord vendeur pour l'actualisation
  live.
- **pg_cron** : un job nocturne (2h) appelant `snapshot-metriques` avec un
  secret partagé en en-tête HTTP.

---

## 7. Intégrations tierces (hors périmètre HDS)

- **Stripe** — facturation, aucune donnée de santé transmise. Aucun
  changement nécessaire.
- **Postmark** — réception des emails d'ordonnances (webhook entrant). Le
  contenu de l'email (potentiellement une ordonnance en pièce jointe)
  transite par leurs serveurs avant d'atteindre `receive-email` : **point à
  trancher explicitement avec le DPO** — soit ce transit est acceptable
  (sous-traitant supplémentaire à déclarer), soit il faut le remplacer par
  une solution de réception email hébergée chez l'HDS retenu.

---

## 8. Volumétrie (ordres de grandeur à affiner)

*Chiffres à communiquer par vos soins pour un devis précis — l'architecture
actuelle a été dimensionnée pour un usage multi-pharmacies avec pics le
matin (dépôt d'ordonnances), voir `DEPLOIEMENT_CHECKLIST.md` pour le contexte
du test de charge déjà réalisé.*

- Nombre de pharmacies clientes actives : ______
- Ordonnances déposées / jour (pic) : ______
- Taille moyenne d'un fichier d'ordonnance : quelques centaines de Ko à
  quelques Mo (photo ou PDF)
- Rétention actuelle des ordonnances : **illimitée** (aucune purge
  automatique — point de conformité à corriger indépendamment de la
  migration, voir checklist § 8)

---

## 9. Questions à poser à chaque hébergeur candidat

1. Quelles activités précises couvre votre certification HDS (hébergement
   physique / infogérance / infrastructure virtuelle / hébergement
   d'application) ?
2. Proposez-vous une base PostgreSQL managée, ou faut-il l'auto-gérer sur
   votre IaaS ?
3. Quel runtime pour l'exécution de fonctions serverless (Deno natif,
   conteneurs, autre) ?
4. Fournissez-vous un service d'authentification compatible MFA TOTP, ou
   faut-il l'auto-héberger ?
5. Le contrat proposé intègre-t-il nativement les clauses obligatoires
   d'hébergement de données de santé (CSP art. R1111-9 et suivants) ?
6. Politique de sauvegarde (PITR, fréquence, délai de restauration testé) ?

---

*Document généré pour préparer les devis — ne remplace pas la validation
juridique/DPO préalable (cadrage du périmètre exact des données de santé,
choix contractuel) évoquée comme étape 1 de la migration.*
