-- Normalize category slug to lowercase and alphanumeric hyphens
UPDATE public.categories
SET slug = LOWER(REGEXP_REPLACE(TRIM(name), '[^a-zA-Z0-9]+', '-', 'g'))
WHERE slug IS NULL OR slug = '';

-- Normalize products category_slug
UPDATE public.products
SET category_slug = LOWER(REGEXP_REPLACE(TRIM(category), '[^a-zA-Z0-9]+', '-', 'g'))
WHERE category_slug IS NULL OR category_slug = '';
