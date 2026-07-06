-- ============ CAJA SETTINGS (singleton) ============
CREATE TABLE public.caja_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id = true),
  fecha_inicio date NOT NULL DEFAULT date_trunc('year', now())::date,
  fecha_fin date NOT NULL DEFAULT (date_trunc('year', now()) + interval '1 year - 1 day')::date,
  aporte_mensual numeric NOT NULL DEFAULT 10,
  normas text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.caja_settings TO authenticated;
GRANT ALL ON public.caja_settings TO service_role;
ALTER TABLE public.caja_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Todos autenticados leen settings" ON public.caja_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins editan settings" ON public.caja_settings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
INSERT INTO public.caja_settings (id, normas) VALUES (true, 'Escribe aquí las normas de la caja.') ON CONFLICT DO NOTHING;

-- ============ CHANNELS ============
CREATE TABLE public.channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL UNIQUE,
  activo boolean NOT NULL DEFAULT true,
  orden int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.channels TO authenticated;
GRANT ALL ON public.channels TO service_role;
ALTER TABLE public.channels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Autenticados ven canales" ON public.channels FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins gestionan canales" ON public.channels FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.channels (nombre, orden) VALUES
  ('Junior', 1), ('Eradys', 2), ('Binance', 3), ('MercadoPago', 4)
ON CONFLICT (nombre) DO NOTHING;

-- ============ CAMPOS NUEVOS EN TABLAS EXISTENTES ============
DO $$ BEGIN
  CREATE TYPE public.loan_rate_type AS ENUM ('daily','monthly');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.loans
  ADD COLUMN IF NOT EXISTS rate_type public.loan_rate_type NOT NULL DEFAULT 'daily',
  ADD COLUMN IF NOT EXISTS rate_value numeric NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS disbursement_channel_id uuid REFERENCES public.channels(id);

-- Migrar daily_rate (fraccional, ej 0.01) → rate_value en porcentaje (1.00)
UPDATE public.loans SET rate_value = ROUND((daily_rate * 100)::numeric, 4), rate_type = 'daily'
WHERE rate_value = 1 AND daily_rate IS NOT NULL;

ALTER TABLE public.loan_payments
  ADD COLUMN IF NOT EXISTS channel_id uuid REFERENCES public.channels(id);

ALTER TABLE public.monthly_contributions
  ADD COLUMN IF NOT EXISTS channel_id uuid REFERENCES public.channels(id);

-- ============ FUNCIÓN SALDO POR CANAL ============
CREATE OR REPLACE FUNCTION public.channel_balance(_channel_id uuid)
RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    COALESCE((SELECT SUM(amount) FROM public.monthly_contributions WHERE channel_id = _channel_id AND status = 'confirmado'), 0)
    + COALESCE((SELECT SUM(amount_capital + amount_interest) FROM public.loan_payments WHERE channel_id = _channel_id AND status = 'confirmado'), 0)
    - COALESCE((SELECT SUM(principal) FROM public.loans WHERE disbursement_channel_id = _channel_id AND status IN ('activo','pagado')), 0)
$$;
GRANT EXECUTE ON FUNCTION public.channel_balance(uuid) TO authenticated;