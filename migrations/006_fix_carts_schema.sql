-- Fix carts table: change PRIMARY KEY from id to user_id
-- Run this in Supabase SQL Editor: https://vyvxamqfaijgmkiraiza.supabase.co/project/_/sql

-- 1. Drop existing RLS policy
DROP POLICY IF EXISTS "Users can manage own cart" ON public.carts;

-- 2. Backup existing data (if any)
CREATE TEMPORARY TABLE carts_backup AS SELECT * FROM public.carts;

-- 3. Drop old table
DROP TABLE IF EXISTS public.carts CASCADE;

-- 4. Recreate table with correct schema
CREATE TABLE public.carts (
  user_id VARCHAR(255) PRIMARY KEY,
  items JSONB DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Restore data with column mapping
INSERT INTO public.carts (user_id, items, updated_at)
SELECT id, items, updated_at FROM carts_backup
ON CONFLICT (user_id) DO NOTHING;

-- 6. Enable RLS
ALTER TABLE public.carts ENABLE ROW LEVEL SECURITY;

-- 7. Create new RLS policy with correct column
CREATE POLICY "Users can manage own cart" ON public.carts 
FOR ALL 
USING (auth.uid()::text = user_id OR public.is_admin());

-- 8. Verify migration
SELECT COUNT(*) as cart_count FROM public.carts;
