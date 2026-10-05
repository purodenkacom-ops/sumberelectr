-- Complete migration for admin settings page
-- Run this in Supabase SQL Editor: https://vyvxamqfaijgmkiraiza.supabase.co/project/_/sql

-- 1. Drop and recreate settings table with proper schema
DROP TABLE IF EXISTS public.settings CASCADE;

CREATE TABLE public.settings (
  id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  type VARCHAR(50) NOT NULL UNIQUE,
  numbers JSONB,
  rotation_index INTEGER DEFAULT 0,
  chat_ids JSONB,
  value JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Create pickup_locations table for Biteship integration
CREATE TABLE IF NOT EXISTS public.pickup_locations (
  id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name VARCHAR(255) NOT NULL,
  contact_name VARCHAR(255),
  contact_phone VARCHAR(50),
  address TEXT NOT NULL,
  postal_code VARCHAR(20),
  area_id_ref VARCHAR(255),
  area_id VARCHAR(255),
  area JSONB,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Add icon and discount columns to categories table
ALTER TABLE public.categories 
ADD COLUMN IF NOT EXISTS icon TEXT,
ADD COLUMN IF NOT EXISTS discount_percent INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS discount_active BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS discount_start TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS discount_end TIMESTAMPTZ;

-- 4. Enable RLS
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pickup_locations ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies: Admin only
DROP POLICY IF EXISTS "Admin can manage settings" ON public.settings;
CREATE POLICY "Admin can manage settings" ON public.settings FOR ALL USING (public.is_admin());

DROP POLICY IF EXISTS "Admin can manage pickup locations" ON public.pickup_locations;
CREATE POLICY "Admin can manage pickup locations" ON public.pickup_locations FOR ALL USING (public.is_admin());

-- 6. Create indexes
CREATE INDEX IF NOT EXISTS idx_pickup_locations_created_at ON public.pickup_locations(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_categories_discount_active ON public.categories(discount_active) WHERE discount_active = true;

-- 7. Insert default WhatsApp and Telegram settings
INSERT INTO public.settings (type, numbers, rotation_index, chat_ids, value)
VALUES 
  ('whatsapp', '[]'::jsonb, 0, NULL, '{}'::jsonb),
  ('telegram', NULL, NULL, '[]'::jsonb, '{}'::jsonb)
ON CONFLICT (type) DO NOTHING;

-- 8. Insert default pickups settings
INSERT INTO public.settings (type, value)
VALUES ('pickups', '{"primaryId": ""}'::jsonb)
ON CONFLICT (type) DO NOTHING;
