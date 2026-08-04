CREATE TABLE public.caja_pauses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  year integer NOT NULL,
  month integer NOT NULL CHECK (month BETWEEN 1 AND 12),
  note text NOT NULL DEFAULT '',
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (year, month)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.caja_pauses TO authenticated;
GRANT ALL ON public.caja_pauses TO service_role;

ALTER TABLE public.caja_pauses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Autenticados ven meses pausados"
  ON public.caja_pauses FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins gestionan meses pausados"
  ON public.caja_pauses FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER caja_pauses_set_updated_at
  BEFORE UPDATE ON public.caja_pauses
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();