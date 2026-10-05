-- Fix product weights: ensure positive default numeric
UPDATE public.products
SET weight = 500
WHERE weight IS NULL OR weight <= 0;

-- Ensure minimum wholesale is at least 1
UPDATE public.products
SET min_wholesale = 1
WHERE min_wholesale IS NULL OR min_wholesale <= 0;
