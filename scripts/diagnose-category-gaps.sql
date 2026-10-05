-- Identify products with missing categories or unmatched slugs
SELECT p.id, p.name, p.category, p.category_slug
FROM public.products p
LEFT JOIN public.categories c ON LOWER(p.category_slug) = LOWER(c.slug)
WHERE c.id IS NULL;
