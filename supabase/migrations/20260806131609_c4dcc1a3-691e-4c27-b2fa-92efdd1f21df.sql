-- 1) Abonos parciales de mensualidades
CREATE TABLE public.contribution_payments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contribution_id uuid NOT NULL REFERENCES public.monthly_contributions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  channel_id uuid REFERENCES public.channels(id),
  amount numeric NOT NULL,
  payment_date date NOT NULL DEFAULT CURRENT_DATE,
  note text,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.contribution_payments TO authenticated;
GRANT ALL ON public.contribution_payments TO service_role;

ALTER TABLE public.contribution_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ver abonos propios o admin" ON public.contribution_payments
  FOR SELECT TO authenticated
  USING ((auth.uid() = user_id) OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "socio registra abono propio" ON public.contribution_payments
  FOR INSERT TO authenticated
  WITH CHECK ((auth.uid() = user_id) OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "admin actualiza abonos" ON public.contribution_payments
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "admin elimina abonos" ON public.contribution_payments
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER contribution_payments_set_updated_at
  BEFORE UPDATE ON public.contribution_payments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_contribution_payments_contribution ON public.contribution_payments(contribution_id);
CREATE INDEX idx_contribution_payments_channel ON public.contribution_payments(channel_id);

-- 2) Backfill de los aportes ya registrados
INSERT INTO public.contribution_payments (contribution_id, user_id, channel_id, amount, payment_date, note, created_at)
SELECT mc.id, mc.user_id, mc.channel_id, mc.amount,
       COALESCE(mc.confirmed_at, mc.reported_at, mc.created_at)::date,
       mc.note, mc.created_at
FROM public.monthly_contributions mc
WHERE mc.amount > 0;

-- 3) El monto de la mensualidad es la suma de sus abonos
CREATE OR REPLACE FUNCTION public.recalc_contribution_amount()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _cid uuid;
BEGIN
  _cid := COALESCE(NEW.contribution_id, OLD.contribution_id);
  UPDATE public.monthly_contributions mc
     SET amount = COALESCE((SELECT SUM(cp.amount) FROM public.contribution_payments cp WHERE cp.contribution_id = _cid), 0)
   WHERE mc.id = _cid;
  RETURN NULL;
END;
$$;

CREATE TRIGGER contribution_payments_recalc
  AFTER INSERT OR UPDATE OR DELETE ON public.contribution_payments
  FOR EACH ROW EXECUTE FUNCTION public.recalc_contribution_amount();

-- 4) Saldo por pasarela considerando abonos parciales
CREATE OR REPLACE FUNCTION public.channel_balance(_channel_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE((SELECT SUM(cp.amount) FROM public.contribution_payments cp
              JOIN public.monthly_contributions mc ON mc.id = cp.contribution_id
              WHERE cp.channel_id = _channel_id AND mc.status = 'confirmado'), 0)
    + COALESCE((SELECT SUM(amount_capital + amount_interest) FROM public.loan_payments WHERE channel_id = _channel_id AND status = 'confirmado'), 0)
    - COALESCE((SELECT SUM(principal) FROM public.loans WHERE disbursement_channel_id = _channel_id AND status IN ('activo','pagado')), 0)
$$;

REVOKE ALL ON FUNCTION public.channel_balance(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.channel_balance(uuid) TO service_role;

-- 5) Primer ingreso sin contraseña
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS password_set boolean NOT NULL DEFAULT true;

UPDATE public.profiles p SET password_set = false
WHERE EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p.id AND u.email LIKE '%@buenavibra.local');