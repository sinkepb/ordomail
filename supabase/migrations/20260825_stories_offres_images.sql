-- OrdoMail — image_url pour stories_content et offres_stories (25/08/2026)
--
-- Permet d'illustrer une story santé ou une offre pharmacie d'une image,
-- affichée aux patients à la place/en complément de l'emoji. Bucket public
-- (pas de donnée de santé ici — contenu marketing/éditorial déjà visible de
-- tout patient qui ouvre ses stories) : contrairement à ordonnances-files,
-- une lecture publique directe est appropriée, pas besoin d'URL signée.
--
-- Écriture : toujours via une edge function (clé de service), jamais en
-- direct — même convention que le reste de ce dépôt depuis le durcissement
-- du 18/08/2026 (voir 20260818_close_storage_anon_write.sql). Aucune policy
-- INSERT/UPDATE/DELETE n'est donc créée ici : seule la lecture publique
-- l'est, l'écriture contourne RLS via la clé de service côté serveur.

ALTER TABLE stories_content ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE offres_stories  ADD COLUMN IF NOT EXISTS image_url TEXT;

INSERT INTO storage.buckets (id, name, public)
VALUES ('story-images', 'story-images', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "public_read_story_images" ON storage.objects;
CREATE POLICY "public_read_story_images" ON storage.objects
  FOR SELECT
  USING (bucket_id = 'story-images');
