# OrdoMail — Registre des traitements (RGPD art. 30)

> ⚠️ **Document de travail — brouillon technique, pas un document juridique
> final.** Rédigé à partir de l'analyse du code (08/08/2026), pas d'un audit
> juridique. Les champs marqués **[À valider]** doivent être complétés/validés
> par le DPO ou un juriste avant toute utilisation officielle (contrôle CNIL,
> réponse à une personne concernée, etc.). Ne pas considérer comme définitif.

---

## Responsable de traitement

| Champ | Valeur |
|---|---|
| Raison sociale | **[À compléter]** |
| Forme juridique | **[À compléter]** |
| Adresse du siège | **[À compléter]** |
| Représentant légal | **[À compléter]** |
| DPO | Benjamin SINKEP — désigné 04/09/2026. **[Formalités restantes : notification à la CNIL si obligatoire au regard de l'art. 37 RGPD, publication des coordonnées auprès des personnes concernées, lettre de mission actant les missions/moyens du DPO]** |
| Contact données personnelles | **[À compléter]** (actuellement `contact@ordomail.fr` utilisé dans les documents imprimés — à confirmer comme adresse officielle RGPD) |

**Co-responsabilité à clarifier avec le DPO** : pour chaque pharmacie
cliente, il faut trancher si OrdoMail est *sous-traitant* de la pharmacie
(qui resterait responsable de traitement vis-à-vis de ses patients) ou
*responsable conjoint*. Ce document part de l'hypothèse la plus probable —
OrdoMail sous-traitant pour les données patient, responsable de traitement
pour les données des comptes pharmacie/titulaire/vendeur — **à faire
confirmer explicitement**, ça change les obligations contractuelles
(nécessité d'un DPA — Data Processing Agreement — avec chaque pharmacie).

---

## Traitement 1 — Réception et gestion des ordonnances patients

| | |
|---|---|
| **Finalité** | Permettre à un patient de transmettre son ordonnance à sa pharmacie sans passer par une boîte email généraliste ; permettre à la pharmacie de la préparer et l'imprimer. |
| **Base légale** | Exécution d'une mesure précontractuelle/contractuelle à la demande du patient (dépôt volontaire et explicite) — **[à confirmer avec le DPO]**, alternative possible : intérêt légitime du patient. |
| **Personnes concernées** | Patients des pharmacies clientes. |
| **Catégories de données** | Nom du patient, fichier de l'ordonnance (image/PDF — **donnée de santé, catégorie particulière RGPD art. 9**), numéro de sécurité sociale et médicaments prescrits le cas échéant (extraits par OCR), nom du médecin prescripteur, code de suivi anonyme (`code_patient`), canal de dépôt (QR code ou email), horodatage. |
| **Table(s)/composant(s)** | `ordonnances`, bucket de stockage `ordonnances-files`. |
| **Destinataires internes** | Titulaire et vendeurs de la pharmacie concernée (accès scopé par jeton/session — voir `secure-data`). |
| **Sous-traitants techniques** | Supabase (hébergement base + stockage — **non certifié HDS actuellement, voir dossier migration**), Postmark (transit des emails contenant une ordonnance en pièce jointe — **point à trancher avec le DPO**). |
| **Transfert hors UE** | **[À vérifier]** — dépend de la région d'hébergement réelle du projet Supabase et de Postmark. |
| **Durée de conservation** | **Non définie actuellement — aucune purge automatique.** [À trancher par le DPO : durée + mécanisme d'archivage/suppression]. |
| **Mesures de sécurité** | RLS scopée par pharmacie, URLs de stockage signées à durée limitée, OCR exécuté localement dans le navigateur du patient (le fichier original transite quand même par le serveur pour stockage), chiffrement en transit (HTTPS/TLS), MFA disponible pour le compte titulaire. |

---

## Traitement 2 — Comptes titulaires et vendeurs

| | |
|---|---|
| **Finalité** | Authentification et gestion des accès à la plateforme. |
| **Base légale** | Exécution du contrat (abonnement OrdoMail). |
| **Personnes concernées** | Titulaires de pharmacie (comptes admin) et vendeurs/préparateurs (comptes poste). |
| **Catégories de données** | Titulaire : email, mot de passe (haché, Supabase Auth), nom de la pharmacie, facteur MFA (secret TOTP, si activé). Vendeur : nom du poste, PIN (haché), aucune identité personnelle collectée. |
| **Table(s)** | `pharmacies`, `pharmacie_users`, `pharmacie_postes`. |
| **Sous-traitants** | Supabase (Auth). |
| **Durée de conservation** | Durée de l'abonnement + **[délai post-résiliation à définir]**. |
| **Mesures de sécurité** | Mots de passe hachés (Supabase Auth, bcrypt côté vendeur), rate limiting sur les tentatives de connexion PIN (`pin_verification_attempts`), MFA TOTP disponible pour le titulaire, jeton HMAC signé pour les sessions vendeur (pas de session Supabase Auth persistante). |

---

## Traitement 3 — Facturation et abonnement

| | |
|---|---|
| **Finalité** | Facturation de l'abonnement SaaS. |
| **Base légale** | Exécution du contrat + obligation légale (conservation comptable). |
| **Personnes concernées** | Titulaires de pharmacie (souscripteurs). |
| **Catégories de données** | Email, identifiant client Stripe, historique de facturation, plan souscrit. **Aucune donnée bancaire stockée par OrdoMail** — traitée exclusivement par Stripe. |
| **Table(s)** | `abonnements`, `factures`, `pricing_plans`. |
| **Sous-traitants** | Stripe (paiement — hors périmètre santé). |
| **Durée de conservation** | Durée légale de conservation comptable (**10 ans en France, factures** — à confirmer avec l'expert-comptable/DPO). |
| **Mesures de sécurité** | Aucune donnée de paiement en clair côté OrdoMail ; webhook Stripe vérifié par signature cryptographique. |

---

## Traitement 4 — Engagement patient (stories, offres, intérêts)

| | |
|---|---|
| **Finalité** | Diffuser du contenu santé/quiz et des offres promotionnelles pendant l'attente du patient ; mesurer l'engagement. |
| **Base légale** | Intérêt légitime (contenu affiché de façon anonyme, sans profilage individualisé transmis à des tiers). |
| **Personnes concernées** | Patients ayant déposé une ordonnance. |
| **Catégories de données** | Code patient anonyme (pas de nom), interactions avec les stories (vue, réponse quiz, intérêt offre), durée de consultation. **Aucune donnée de santé** dans ce traitement. |
| **Table(s)** | `offre_interets`, `story_metrics`, `stories_content`, `offres_stories`. |
| **Durée de conservation** | **[À définir]** — actuellement non purgé. |
| **Mesures de sécurité** | Pas de lien direct avec l'identité du patient (code anonyme uniquement), pas de policy SELECT publique sur `offre_interets`. |

---

## Traitement 5 — Journal d'activité (traçabilité interne)

| | |
|---|---|
| **Finalité** | Traçabilité des actions du personnel de la pharmacie sur les ordonnances (obligation de sécurité/accountability RGPD art. 5.2, et utile en cas d'incident). |
| **Base légale** | Obligation légale/intérêt légitime (sécurité du traitement). |
| **Personnes concernées** | Titulaires et vendeurs de la pharmacie (pas les patients directement — le journal référence des actions sur des ordonnances, pas leur contenu). |
| **Catégories de données** | Identifiant utilisateur/poste, rôle, action (consultation/impression/import/connexion/déconnexion/remise en file), référence à l'ordonnance concernée, horodatage. |
| **Table(s)** | `audit_logs`. |
| **Durée de conservation** | **[À définir]** — pas de purge automatique actuellement. |
| **Mesures de sécurité** | Lecture restreinte au titulaire authentifié de la pharmacie concernée (RLS scopée, voir migration 20260808). |

---

## Traitement 6 — Notifications sonnette (appel patient)

| | |
|---|---|
| **Finalité** | Notifier un patient en salle d'attente que son ordonnance est prête. |
| **Base légale** | Exécution du service à la demande du patient. |
| **Personnes concernées** | Patients ayant déposé une ordonnance. |
| **Catégories de données** | Code patient anonyme, horodatage de l'appel. Aucune identité. |
| **Table(s)** | `appels_patient`. |
| **Durée de conservation** | **[À définir]**. |

---

## Traitement 7 — Comptes administrateurs OrdoMail (backoffice interne)

| | |
|---|---|
| **Finalité** | Administration de la plateforme par l'équipe OrdoMail (gestion clients, tarifs, contenu). |
| **Base légale** | Intérêt légitime (fonctionnement interne de l'entreprise). |
| **Personnes concernées** | Employés/opérateurs OrdoMail. |
| **Catégories de données** | Email, mot de passe haché (bcrypt), rôle. |
| **Table(s)** | `ordomail_admins`. |
| **Durée de conservation** | Durée d'emploi/mission + **[délai à définir]**. |
| **Mesures de sécurité** | Rate limiting bcrypt, délai fixe anti-timing attack, jeton signé (pas de session persistante longue). |

---

## Sous-traitants identifiés (à formaliser par DPA — Data Processing Agreement)

| Sous-traitant | Rôle | Données concernées | DPA signé ? |
|---|---|---|---|
| Supabase | Hébergement base de données, stockage fichiers, authentification | Toutes (dont données de santé) | **[À vérifier]** |
| Stripe | Paiement | Facturation, aucune donnée de santé | **[À vérifier]** |
| Postmark | Transit des emails entrants (ordonnances en pièce jointe) | Potentiellement données de santé en transit | **[À vérifier — point signalé au DPO]** |
| Vercel/Netlify | Hébergement frontend | Aucune donnée persistée côté serveur applicatif | **[À vérifier]** |
| Sentry (si `VITE_SENTRY_DSN` configuré) | Monitoring d'erreurs frontend | Logs techniques, masquage des PII déjà en place (`log-mask.ts`) | **[À vérifier]** |

---

## Synthèse des actions ouvertes pour le DPO

1. Confirmer l'identité juridique du responsable de traitement (en-tête de ce document).
2. Trancher le statut OrdoMail/pharmacies (sous-traitant vs responsables conjoints) et la nécessité de DPA avec chaque pharmacie cliente.
3. Fixer une durée de conservation pour **chaque** traitement listé — actuellement aucune purge automatique nulle part dans le code.
4. Vérifier/obtenir les DPA des 5 sous-traitants listés ci-dessus.
5. Statuer sur le cas Postmark (transit d'ordonnances par un tiers non explicitement validé HDS).
6. Confirmer la base légale retenue pour chaque traitement (les hypothèses ci-dessus sont raisonnables mais pas validées juridiquement).

---

*Document généré par analyse du code source — complète le
[dossier technique de migration HDS](dossier-technique-migration-hds.md).
À faire relire et compléter par le DPO avant tout usage officiel.*
