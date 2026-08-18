-- Administración con alcance: un principal global y administradores por socio.
-- La autorización se aplica con RLS para que filtros/URLs del cliente no puedan
-- ampliar el acceso.

CREATE TABLE IF NOT EXISTS public.admin_socio_assignments (
  admin_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  socio_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  PRIMARY KEY (admin_id, socio_id),
  CHECK (admin_id <> socio_id)
);

CREATE INDEX IF NOT EXISTS admin_socio_assignments_socio_id_idx
  ON public.admin_socio_assignments (socio_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_socio_assignments TO authenticated;
GRANT ALL ON public.admin_socio_assignments TO service_role;
ALTER TABLE public.admin_socio_assignments ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_principal(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM auth.users
    WHERE id = _user_id AND lower(email) = lower('Henryabache@gmail.com')
  )
$$;

CREATE OR REPLACE FUNCTION public.can_access_socio(_admin_id uuid, _socio_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.is_principal(_admin_id)
    OR (
      public.has_role(_admin_id, 'admin'::public.app_role)
      AND NOT public.has_role(_socio_id, 'admin'::public.app_role)
      AND EXISTS (
        SELECT 1 FROM public.admin_socio_assignments asa
        WHERE asa.admin_id = _admin_id AND asa.socio_id = _socio_id
      )
    )
$$;

-- Make the specified account principal both for existing users and future signups.
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'::public.app_role
FROM auth.users
WHERE lower(email) = lower('Henryabache@gmail.com')
ON CONFLICT (user_id, role) DO NOTHING;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _is_first boolean;
BEGIN
  SELECT NOT EXISTS (SELECT 1 FROM public.profiles) INTO _is_first;
  INSERT INTO public.profiles (id, full_name, status)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
          CASE WHEN _is_first THEN 'activo'::public.profile_status ELSE 'pendiente'::public.profile_status END);
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'socio') ON CONFLICT DO NOTHING;
  IF _is_first OR lower(NEW.email) = lower('Henryabache@gmail.com') THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin') ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

CREATE POLICY "Principal gestiona asignaciones" ON public.admin_socio_assignments
  FOR ALL TO authenticated
  USING (public.is_principal(auth.uid()))
  WITH CHECK (public.is_principal(auth.uid()));
CREATE POLICY "Admin ve sus asignaciones" ON public.admin_socio_assignments
  FOR SELECT TO authenticated USING (admin_id = auth.uid());

-- Replace global-admin policies on member data with scoped authorization.
DROP POLICY IF EXISTS "socios ven su perfil" ON public.profiles;
DROP POLICY IF EXISTS "socios actualizan su perfil" ON public.profiles;
DROP POLICY IF EXISTS "admin inserta perfiles" ON public.profiles;
DROP POLICY IF EXISTS "admin elimina perfiles" ON public.profiles;
CREATE POLICY "ver perfil propio o socio autorizado" ON public.profiles FOR SELECT TO authenticated
  USING (auth.uid() = id OR public.can_access_socio(auth.uid(), id));
CREATE POLICY "actualizar perfil propio o socio autorizado" ON public.profiles FOR UPDATE TO authenticated
  USING (auth.uid() = id OR public.can_access_socio(auth.uid(), id))
  WITH CHECK (auth.uid() = id OR public.can_access_socio(auth.uid(), id));
CREATE POLICY "principal inserta perfiles" ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (public.is_principal(auth.uid()));
CREATE POLICY "principal elimina perfiles" ON public.profiles FOR DELETE TO authenticated
  USING (public.is_principal(auth.uid()));

DROP POLICY IF EXISTS "usuarios ven sus roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins insertan roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins borran roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins actualizan roles" ON public.user_roles;
CREATE POLICY "usuarios ven rol propio o principal" ON public.user_roles FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.is_principal(auth.uid()));
CREATE POLICY "principal gestiona roles" ON public.user_roles FOR ALL TO authenticated
  USING (public.is_principal(auth.uid())) WITH CHECK (public.is_principal(auth.uid()));

DROP POLICY IF EXISTS "ver aportes propios o admin" ON public.monthly_contributions;
DROP POLICY IF EXISTS "socio reporta aporte propio" ON public.monthly_contributions;
DROP POLICY IF EXISTS "admin actualiza aportes" ON public.monthly_contributions;
DROP POLICY IF EXISTS "admin elimina aportes" ON public.monthly_contributions;
CREATE POLICY "ver aportes propios o autorizados" ON public.monthly_contributions FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.can_access_socio(auth.uid(), user_id));
CREATE POLICY "crear aportes propios o autorizados" ON public.monthly_contributions FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id OR public.can_access_socio(auth.uid(), user_id));
CREATE POLICY "actualizar aportes propios pendientes o autorizados" ON public.monthly_contributions FOR UPDATE TO authenticated USING (public.can_access_socio(auth.uid(), user_id) OR (auth.uid() = user_id AND status = 'pendiente')) WITH CHECK (public.can_access_socio(auth.uid(), user_id) OR (auth.uid() = user_id AND status = 'pendiente'));
CREATE POLICY "eliminar aportes autorizados" ON public.monthly_contributions FOR DELETE TO authenticated USING (public.can_access_socio(auth.uid(), user_id));

DROP POLICY IF EXISTS "ver prestamos propios o admin" ON public.loans;
DROP POLICY IF EXISTS "socio solicita prestamo" ON public.loans;
DROP POLICY IF EXISTS "admin actualiza prestamos" ON public.loans;
DROP POLICY IF EXISTS "admin elimina prestamos" ON public.loans;
CREATE POLICY "ver prestamos propios o autorizados" ON public.loans FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.can_access_socio(auth.uid(), user_id));
CREATE POLICY "crear prestamos propios o autorizados" ON public.loans FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id OR public.can_access_socio(auth.uid(), user_id));
CREATE POLICY "actualizar prestamos autorizados" ON public.loans FOR UPDATE TO authenticated USING (public.can_access_socio(auth.uid(), user_id)) WITH CHECK (public.can_access_socio(auth.uid(), user_id));
CREATE POLICY "eliminar prestamos autorizados" ON public.loans FOR DELETE TO authenticated USING (public.can_access_socio(auth.uid(), user_id));

DROP POLICY IF EXISTS "ver pagos propios o admin" ON public.loan_payments;
DROP POLICY IF EXISTS "socio reporta pago propio" ON public.loan_payments;
DROP POLICY IF EXISTS "admin actualiza pagos" ON public.loan_payments;
DROP POLICY IF EXISTS "admin elimina pagos" ON public.loan_payments;
CREATE POLICY "ver pagos propios o autorizados" ON public.loan_payments FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.can_access_socio(auth.uid(), user_id));
CREATE POLICY "crear pagos propios o autorizados" ON public.loan_payments FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id OR public.can_access_socio(auth.uid(), user_id));
CREATE POLICY "actualizar pagos autorizados" ON public.loan_payments FOR UPDATE TO authenticated USING (public.can_access_socio(auth.uid(), user_id)) WITH CHECK (public.can_access_socio(auth.uid(), user_id));
CREATE POLICY "eliminar pagos autorizados" ON public.loan_payments FOR DELETE TO authenticated USING (public.can_access_socio(auth.uid(), user_id));

DROP POLICY IF EXISTS "ver abonos propios o admin" ON public.contribution_payments;
DROP POLICY IF EXISTS "socio registra abono propio" ON public.contribution_payments;
DROP POLICY IF EXISTS "admin actualiza abonos" ON public.contribution_payments;
DROP POLICY IF EXISTS "admin elimina abonos" ON public.contribution_payments;
CREATE POLICY "ver abonos propios o autorizados" ON public.contribution_payments FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.can_access_socio(auth.uid(), user_id));
CREATE POLICY "crear abonos propios o autorizados" ON public.contribution_payments FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id OR public.can_access_socio(auth.uid(), user_id));
CREATE POLICY "actualizar abonos autorizados" ON public.contribution_payments FOR UPDATE TO authenticated USING (public.can_access_socio(auth.uid(), user_id)) WITH CHECK (public.can_access_socio(auth.uid(), user_id));
CREATE POLICY "eliminar abonos autorizados" ON public.contribution_payments FOR DELETE TO authenticated USING (public.can_access_socio(auth.uid(), user_id));

-- Global operational settings and administrator-only requests belong to the principal.
DROP POLICY IF EXISTS "Admins editan settings" ON public.caja_settings;
CREATE POLICY "Principal edita settings" ON public.caja_settings FOR ALL TO authenticated USING (public.is_principal(auth.uid())) WITH CHECK (public.is_principal(auth.uid()));
DROP POLICY IF EXISTS "Admins gestionan canales" ON public.channels;
CREATE POLICY "Principal gestiona canales" ON public.channels FOR ALL TO authenticated USING (public.is_principal(auth.uid())) WITH CHECK (public.is_principal(auth.uid()));
DROP POLICY IF EXISTS "Admins gestionan meses pausados" ON public.caja_pauses;
CREATE POLICY "Principal gestiona meses pausados" ON public.caja_pauses FOR ALL TO authenticated USING (public.is_principal(auth.uid())) WITH CHECK (public.is_principal(auth.uid()));
DROP POLICY IF EXISTS "Admins manage invitations" ON public.invitations;
CREATE POLICY "Principal gestiona invitaciones" ON public.invitations FOR ALL TO authenticated USING (public.is_principal(auth.uid())) WITH CHECK (public.is_principal(auth.uid()));
DROP POLICY IF EXISTS "Admins ven solicitudes de recuperacion" ON public.recovery_requests;
CREATE POLICY "Principal ve solicitudes de recuperacion" ON public.recovery_requests FOR SELECT TO authenticated USING (public.is_principal(auth.uid()));

REVOKE EXECUTE ON FUNCTION public.is_principal(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_access_socio(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_principal(uuid), public.can_access_socio(uuid, uuid) TO authenticated, service_role;
