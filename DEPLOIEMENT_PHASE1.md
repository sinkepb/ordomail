# OrdoMail — Déploiement Phase 1 (sécurité)

Ce document liste ce qui a été modifié dans le code et **l'ordre exact** à respecter
pour déployer sans casser la production. Ne pas déployer le frontend avant d'avoir
fait les étapes 1 et 2 — le nouveau code suppose que la migration est appliquée et
que les secrets existent.

## Ce qui marche déjà, sans rien déployer (testable en local tout de suite)

- **XSS corrigée** (nom patient échappé avant impression/PDF) — `npm run dev` suffit.
- **Porte dérobée admin supprimée** (le repli `admin@ordomail.fr` / `admin2025` n'est
  plus utilisable que si `VITE_DEMO_MODE=true`, plus jamais sur un simple échec réseau).

Tout le reste (PIN hashés, jetons, RLS, submit-ordonnance protégé) ne prend effet
qu'après les étapes ci-dessous, car ça touche la base Supabase et les edge functions.

## 1. Appliquer la migration SQL

Ouvrir `supabase/migrations/20260723_phase1_security.sql`, le relire (il est commenté),
puis l'exécuter dans **Supabase Dashboard → SQL Editor** sur le projet concerné.
Idéalement sur un projet de test d'abord si vous en avez un.

Ce script :
- ajoute `pin_hash` à `pharmacie_postes` et hash automatiquement les PIN en clair existants
- ajoute `qr_token` à `pharmacies` (génère un jeton aléatoire pour les pharmacies existantes)
- crée `pin_verification_attempts` et `submission_log` (limitation de débit)
- réinitialise toutes les policies RLS de `ordonnances`, `pharmacies`, `pharmacie_postes`,
  `offre_interets` et les recrée restrictives (plus d'accès anonyme direct)

Vérification après exécution (avec la clé **anon**, sans session) :
```
GET {SUPABASE_URL}/rest/v1/ordonnances?select=id&limit=1
```
Avant la migration cette requête renvoyait des données (c'est la faille confirmée dans
l'audit). Après la migration, elle doit renvoyer un tableau vide `[]`.

## 2. Définir le secret partagé des jetons

```bash
supabase secrets set ORDOMAIL_JWT_SECRET=$(openssl rand -hex 32)
```

Une seule valeur, longue et aléatoire, partagée par `verify-pin`, `verify-admin` et
`secure-data` (ce sont eux qui signent/vérifient les jetons vendeur et admin — voir
`supabase/functions/_shared/jwt.ts`). Si ce secret n'est pas défini, ces trois
fonctions échoueront (erreur explicite, pas de repli silencieux).

## 3. Déployer les edge functions modifiées

```bash
supabase functions deploy verify-pin
supabase functions deploy update-pin
supabase functions deploy verify-admin
supabase functions deploy submit-ordonnance
supabase functions deploy secure-data
```

`secure-data` est une **nouvelle** fonction (elle remplace les lectures directes en
clé anon de `fetchOrdonnances`, des offres, et de la liste pharmacies du backoffice).

## 4. Déployer le frontend

`npm run build` puis déploiement habituel (Vercel/Netlify). À ce stade seulement,
le nouveau frontend (qui envoie les jetons, le `qr_token` du QR code, etc.) est
cohérent avec le backend.

## Ce qu'il faudra retester manuellement après déploiement

- **Connexion vendeur** (code pharmacie + PIN) — le PIN existant doit continuer à
  fonctionner (il a été hashé automatiquement par la migration, pas changé).
- **Modification d'un PIN** depuis les paramètres pharmacie (titulaire connecté).
- **QR code** : le régénérer depuis l'onglet QR/NFC après déploiement (il embarque
  maintenant `qr_token` dans l'URL — les QR codes déjà imprimés avant la migration
  ne contenaient pas ce paramètre et seront rejetés par `submit-ordonnance`).
- **Dépôt d'ordonnance par QR code** (avec un QR fraîchement régénéré).
- **Backoffice OrdoMail Business** : connexion, liste des clients, modification d'un
  contrat/plan.
- **Impression d'une ordonnance** dont le nom patient contient des caractères
  spéciaux (`<`, `>`, `&`) — doit s'afficher tel quel, sans rien exécuter.

## Limites connues de cette phase (pas encore couvertes)

Pour rester dans le périmètre convenu de la phase 1, certains points repérés pendant
l'implémentation n'ont pas été traités — à considérer pour la phase 2 :

- `change-plan` (auto-changement de plan par le titulaire) et `snapshot-metriques`
  (cron nocturne) restent des edge functions sans vérification d'appelant.
- Les policies des **buckets de stockage** (`ordonnances-files`, `storage.objects`)
  n'ont pas été auditées ni modifiées dans cette phase — seules les tables
  Postgres l'ont été.
- `StoriesContentAdmin` et quelques écrans secondaires du backoffice utilisent
  encore la clé anon pour lire/écrire `stories_content` (contenu marketing, pas
  des données de santé — risque jugé faible, non traité ici).
- Le bug fonctionnel préexistant où `submit-ordonnance` ignore le `session_code`
  envoyé par le patient (les ordonnances déposées par QR code n'obtiennent jamais
  de `code_patient`, contrairement à celles reçues par email) n'a pas été corrigé —
  hors périmètre sécurité de cette phase.
