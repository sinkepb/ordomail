-- ═══════════════════════════════════════════════════════════════════════════════
-- ORDOMAIL — Backfill email_reception pour les pharmacies existantes — 09/08/2026
--
-- register-pharmacie génère depuis toujours un email_reception à l'inscription,
-- mais certaines pharmacies en base (créées avant cette fonctionnalité, ou via
-- une insertion manuelle) ont email_reception = NULL. Le dashboard retombait
-- alors sur l'UUID brut de la pharmacie comme adresse affichée dans l'onglet
-- Paramètres > Email — illisible et jamais réellement fonctionnel pour la
-- réception d'ordonnances (send-email route les emails entrants par une
-- correspondance EXACTE sur email_reception, donc une pharmacie sans cette
-- colonne renseignée ne peut recevoir aucune ordonnance par email).
--
-- Même format que register-pharmacie (16/07/2026 → 09/08/2026) : "pharmacie-"
-- + 4 caractères dérivés de l'UUID de la pharmacie, PAS du nom (évite toute
-- collision entre deux pharmacies au nom identique/proche, et ne fuite pas le
-- nom de l'officine dans une adresse email publique).
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

UPDATE pharmacies
SET email_slug      = 'pharmacie-' || upper(right(replace(id::text, '-', ''), 4)),
    email_reception = 'pharmacie-' || upper(right(replace(id::text, '-', ''), 4)) || '@in.ordomail.fr'
WHERE email_reception IS NULL;

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- Le code à 4 caractères est dérivé de l'UUID (unique par construction), mais sa
-- troncature à 4 caractères n'est unique qu'avec une probabilité très élevée
-- (pas garantie à 100 % sur un grand volume). email_reception porte une
-- contrainte UNIQUE (schema.sql) : si une collision existe entre deux
-- pharmacies concernées par ce backfill, cette migration échouera avec une
-- erreur "duplicate key value violates unique constraint" — dans ce cas,
-- identifier la ligne en conflit et lui appliquer une variante manuelle
-- (ex: prendre 5 caractères, ou une autre tranche de l'UUID) avant de relancer.
-- ─────────────────────────────────────────────────────────────────────────────
