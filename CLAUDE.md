# OrdoMail — conventions de développement

## Approche modulaire (02/10/2026)

Pour tout nouveau développement ou toute extension significative d'une
fonctionnalité existante : découper par défaut, ne pas laisser grossir un
fichier container jusqu'à devenir un god component.

Contexte : l'audit de dette technique du 02/10/2026 a trouvé
`RappelsSection.jsx` à 1323 lignes, ~30 `useState`, 0 test — un frein direct
à la vitesse d'itération sur le module (rappels de renouvellement) qui porte
l'essentiel de l'engagement client. Le découpage effectué ce jour-là (voir
`src/components/rappels/`) sert de patron à reproduire.

Règles concrètes :
- **Séparer logique pure et UI** dès qu'une fonction ne dépend pas de l'état
  React (formatage, validation, calcul de date, détection de pattern) →
  fichier `.js` à part, testable indépendamment sans monter de composant.
- **Un composant modal/formulaire = un fichier.** Dès qu'un fichier contient
  plus d'un composant exporté top-level (hors le composant container
  lui-même), extraire les autres dans des fichiers séparés, idéalement dans
  un sous-dossier nommé d'après le domaine (ex. `components/rappels/`,
  `components/offres/`).
- **Constantes et libellés partagés** (statuts, labels, mappings d'icônes)
  dans leur propre fichier, importés plutôt que redéfinis localement.
- **Taille indicative d'alerte : ~400-500 lignes** pour un fichier de
  composant React. Au-delà, chercher une frontière naturelle à extraire
  avant d'ajouter la fonctionnalité suivante, pas après.
- **Tester ce qui est extrait.** Une fonction pure sortie d'un composant
  pour la modularité doit gagner un test au passage si elle n'en a pas —
  c'est tout l'intérêt de l'extraction, pas juste cosmétique.
- Ce découpage est un déplacement de code, pas une réécriture : à chaque
  extraction, vérifier lint + build + tests avant de considérer le
  changement terminé, exactement comme pour n'importe quelle autre
  modification.

Cette convention s'applique aux prochains chantiers de développement, pas
seulement au module rappels où elle a été appliquée en premier.
