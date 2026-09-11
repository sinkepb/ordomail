-- Alignement de schéma preview/production suite à l'audit de parité du 11/09/2026.
-- offre_interets.offre_type manquait sur preview (présent sur schema.sql / prod) :
-- toggle-interet écrit cette colonne, son absence cassait la fonction sur preview.
ALTER TABLE offre_interets ADD COLUMN IF NOT EXISTS offre_type text;

-- metriques_journalieres et ordomail_admins avaient une PK differente sur
-- preview (composite / email) que sur prod (id surrogate). Alignement complet
-- decouvert en copiant les donnees de prod vers preview le 11/09/2026.
ALTER TABLE metriques_journalieres ADD COLUMN IF NOT EXISTS id uuid;
ALTER TABLE metriques_journalieres ADD COLUMN IF NOT EXISTS created_at timestamptz;
UPDATE metriques_journalieres SET id = gen_random_uuid() WHERE id IS NULL;
ALTER TABLE metriques_journalieres ALTER COLUMN id SET NOT NULL;
ALTER TABLE metriques_journalieres ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE metriques_journalieres DROP CONSTRAINT IF EXISTS metriques_journalieres_pkey;
ALTER TABLE metriques_journalieres ADD CONSTRAINT metriques_journalieres_pkey PRIMARY KEY (id);
ALTER TABLE metriques_journalieres ADD CONSTRAINT metriques_journalieres_pharmacie_id_date_key UNIQUE (pharmacie_id, date);

ALTER TABLE ordomail_admins ADD COLUMN IF NOT EXISTS id uuid;
ALTER TABLE ordomail_admins ADD COLUMN IF NOT EXISTS last_login timestamptz;
UPDATE ordomail_admins SET id = gen_random_uuid() WHERE id IS NULL;
ALTER TABLE ordomail_admins ALTER COLUMN id SET NOT NULL;
ALTER TABLE ordomail_admins ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE ordomail_admins DROP CONSTRAINT IF EXISTS ordomail_admins_pkey;
ALTER TABLE ordomail_admins ADD CONSTRAINT ordomail_admins_pkey PRIMARY KEY (id);
ALTER TABLE ordomail_admins ADD CONSTRAINT ordomail_admins_email_key UNIQUE (email);
