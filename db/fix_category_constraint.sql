ALTER TABLE public.categories DROP CONSTRAINT IF EXISTS categories_slug_key;
ALTER TABLE public.categories ADD CONSTRAINT categories_parent_slug_key UNIQUE (parent_id, slug);
