-- Add pickup_locations table for Biteship integration

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

-- Enable RLS
ALTER TABLE public.pickup_locations ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Admin only
DROP POLICY IF EXISTS "Admin can manage pickup locations" ON public.pickup_locations;
CREATE POLICY "Admin can manage pickup locations" ON public.pickup_locations FOR ALL USING (public.is_admin());

-- Index for faster queries
CREATE INDEX IF NOT EXISTS idx_pickup_locations_created_at ON public.pickup_locations(created_at DESC);
