-- Drop old settings table and recreate with proper schema
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

-- Enable RLS
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Admin only
DROP POLICY IF EXISTS "Admin can manage settings" ON public.settings;
CREATE POLICY "Admin can manage settings" ON public.settings FOR ALL USING (public.is_admin());

-- Insert default WhatsApp and Telegram settings
INSERT INTO public.settings (type, numbers, rotation_index, chat_ids, value)
VALUES 
  ('whatsapp', '[]'::jsonb, 0, NULL, '{}'::jsonb),
  ('telegram', NULL, NULL, '[]'::jsonb, '{}'::jsonb)
ON CONFLICT (type) DO NOTHING;
