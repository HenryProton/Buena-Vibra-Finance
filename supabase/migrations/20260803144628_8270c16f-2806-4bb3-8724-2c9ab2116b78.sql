CREATE TABLE public.recovery_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  identifier text NOT NULL,
  channel text NOT NULL DEFAULT 'email',
  code text NOT NULL,
  full_name text,
  destination text,
  delivered boolean NOT NULL DEFAULT false,
  attempts integer NOT NULL DEFAULT 0,
  used_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '20 minutes'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_recovery_requests_identifier ON public.recovery_requests (lower(identifier));
CREATE INDEX idx_recovery_requests_created ON public.recovery_requests (created_at DESC);

GRANT ALL ON public.recovery_requests TO service_role;
ALTER TABLE public.recovery_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins ven solicitudes de recuperacion"
ON public.recovery_requests FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

GRANT SELECT ON public.recovery_requests TO authenticated;