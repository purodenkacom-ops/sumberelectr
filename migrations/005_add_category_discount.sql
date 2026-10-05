-- Add discount columns to categories table

ALTER TABLE public.categories 
ADD COLUMN IF NOT EXISTS discount_percent INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS discount_active BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS discount_start TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS discount_end TIMESTAMPTZ;

-- Create index for active discounts
CREATE INDEX IF NOT EXISTS idx_categories_discount_active ON public.categories(discount_active) WHERE discount_active = true;
