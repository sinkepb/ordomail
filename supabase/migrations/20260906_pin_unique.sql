-- OrdoMail — PIN unique par pharmacie (06/09/2026).
--
-- Retour direct : le pharmacien controle deja qui accede a quoi via son
-- propre logiciel (LGO) — la distinction "un PIN par poste" est une
-- friction sans utilite reelle pour ces titulaires-la, et le journal
-- d'activite (deja tres granulaire par poste) n'a plus besoin de cette
-- granularite selon l'utilisateur. Ajoute donc un mode "PIN unique" en
-- option, PAR PHARMACIE (le mode par poste reste le defaut, rien ne change
-- pour qui ne bascule pas) : un seul PIN valable sur n'importe quel poste,
-- mais le nombre de CONNEXIONS SIMULTANEES reste borne par le nombre de
-- postes autorises par le plan (meme limite que le mode multi-PIN, juste
-- appliquee differemment — voir plus bas).
ALTER TABLE pharmacies ADD COLUMN IF NOT EXISTS pin_mode TEXT NOT NULL DEFAULT 'multi';
ALTER TABLE pharmacies DROP CONSTRAINT IF EXISTS pharmacies_pin_mode_check;
ALTER TABLE pharmacies ADD CONSTRAINT pharmacies_pin_mode_check CHECK (pin_mode IN ('multi', 'unique'));

ALTER TABLE pharmacies ADD COLUMN IF NOT EXISTS pin_unique_hash TEXT;

-- Suivi des connexions actives sous PIN unique — indispensable pour que la
-- limite du plan soit REELLEMENT appliquee (pas seulement indicative) :
-- contrairement au mode multi-PIN, ou chaque poste est une ligne persistante
-- qu'on peut compter, un PIN unique partage n'a pas d'entite "poste" a
-- compter — il faut donc suivre les connexions elles-memes. Une ligne =
-- une session active ; last_seen_at avance par un "heartbeat" cote client
-- tant que le poste reste ouvert sur le dashboard (voir vendeur_heartbeat,
-- secure-data). Aucune purge explicite necessaire : une session est
-- consideree active seulement si last_seen_at est recent (fenetre glissante
-- verifiee a chaque tentative de connexion, voir verify-pin) — un onglet
-- ferme sans clic sur "Deconnexion" libere donc sa place automatiquement au
-- bout de quelques minutes, sans tache planifiee. "Deconnexion" explicite
-- (vendeur_release_session) libere la place immediatement, sans attendre.
--
-- Meme schema d'acces que pin_verification_attempts (phase1_security) : pas
-- de RLS, jamais lu/ecrit autrement que par le role de service (verify-pin,
-- secure-data), jamais expose via PostgREST direct.
CREATE TABLE IF NOT EXISTS vendeur_sessions (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pharmacie_id UUID NOT NULL REFERENCES pharmacies(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_vendeur_sessions_pharmacie_seen
  ON vendeur_sessions(pharmacie_id, last_seen_at DESC);
