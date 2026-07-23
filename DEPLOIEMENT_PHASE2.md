# OrdoMail — Phase 2 (qualité de code)

Contrairement aux phases 1 et 3, la phase 2 n'a besoin d'aucun déploiement
Supabase (pas de migration, pas de secret, pas d'edge function touchée). Tout
est côté outillage/frontend : `git pull`, `npm install`, c'est tout.

## Ce qui a été fait

- **5 fichiers morts supprimés** + ~1700 lignes de code mort/dupliqué (composant
  admin inaccessible, jeu de données factice mort, écran de facturation jamais
  rendu nulle part).
- **`supabase/schema.sql` reconstruit** pour refléter le schéma réellement
  déployé (`pharmacie_postes` et non `postes`, `pin_hash`, `qr_token`,
  `pricing_plans`, etc.) — l'ancien fichier n'avait jamais été synchronisé avec
  la base réelle depuis l'origine du projet. Reste un best-effort par
  inspection du code, pas un vrai dump — à remplacer par
  `supabase db dump --schema public` dès que possible.
- **ESLint + Prettier** (`npm run lint`, `npm run format`). En les activant,
  **8 bugs réels ont été trouvés et corrigés** (détail dans le commit
  `feat(phase2): ESLint + Prettier + schema.sql reconcilie...`) :
  - `authSignInPSC` jamais importé (bouton PSC démo aurait planté)
  - `updateOrdoExtracted`/`uploadOrdoFile` utilisés sans import (OCR/upload
    auraient planté)
  - PIN vendeur en démo : référence à un `pharmacieId` inexistant (x2)
  - Changement de plan : référence à un `setPharmacie` inexistant (x3) —
    remplacé par un callback `onPlanChanged` proprement passé en prop
  - Backoffice : bouton sonnette mutait une prop et appelait un `onRefresh`
    inexistant — remplacé par un état local
  - `ViewerModal` : Hook appelé après un retour anticipé (Rules of Hooks)
  - `generateInvoiceHTML` utilisé sans import
- **CI GitHub Actions** (`.github/workflows/ci.yml`) : lint + tests + build
  sur chaque push/PR vers `main`/`develop`.
- **Vitest** : 12 tests sur `escapeHtml` (anti-XSS, phase 1) et
  `signToken`/`verifyToken` (jetons vendeur/admin, phase 1).
- **Découpage (premier lot)** : `LogsPanel`, `QRCode` et `StoriesContentAdmin`
  extraits dans `src/components/`, avec leurs imports propres.

## Ce qui reste ouvert

- **Découpage complet** de `PharmacieDashboard`/`ParametresTab` (Dashboard.jsx)
  et `AdminDashboardLive`/`ContratEditor` (AdminPage.jsx) — composants encore
  à 500-1000+ lignes avec un état partagé imbriqué. Volontairement non traité
  dans cette passe : ce sont exactement les composants où les 8 bugs ci-dessus
  ont été trouvés (confusion de scope entre composants) ; les redécouper
  juste après les avoir corrigés aurait été le moment le plus risqué pour le
  faire sans une vraie suite de tests de composants (pas encore en place).
- **153 avertissements ESLint restants** (variables/imports inutilisés,
  dépendances `useEffect` manquantes) — non bloquants, laissés en `warning`
  pour un nettoyage incrémental plutôt qu'un gros diff d'un coup.
- **Prettier n'a pas été appliqué** rétroactivement sur les 15 000 lignes
  existantes (aurait produit un diff massif sans rapport avec la logique) —
  disponible via `npm run format` pour les nouveaux fichiers/PR.
