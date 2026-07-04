
-- =========== ENUMS ===========
CREATE TYPE public.app_role AS ENUM ('admin', 'socio');
CREATE TYPE public.profile_status AS ENUM ('pendiente', 'activo', 'retirado');
CREATE TYPE public.contribution_status AS ENUM ('pendiente', 'reportado', 'confirmado');
CREATE TYPE public.loan_status AS ENUM ('pendiente_aprobacion', 'activo', 'pagado', 'rechazado');
CREATE TYPE public.payment_status AS ENUM ('reportado', 'confirmado');

-- =========== PROFILES ===========
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL DEFAULT '',
  phone TEXT,
  cedula TEXT,
  status public.profile_status NOT NULL DEFAULT 'pendiente',
  num_acciones INTEGER NOT NULL DEFAULT 1 CHECK (num_acciones >= 0),
  theme_preference TEXT NOT NULL DEFAULT 'system' CHECK (theme_preference IN ('system','light','dark')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- =========== USER ROLES ===========
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- =========== has_role (security definer) ===========
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

-- =========== MONTHLY CONTRIBUTIONS ===========
CREATE TABLE public.monthly_contributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  num_acciones INTEGER NOT NULL DEFAULT 1,
  amount NUMERIC(10,2) NOT NULL,
  status public.contribution_status NOT NULL DEFAULT 'pendiente',
  note TEXT,
  reported_at TIMESTAMPTZ,
  confirmed_at TIMESTAMPTZ,
  confirmed_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, year, month)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.monthly_contributions TO authenticated;
GRANT ALL ON public.monthly_contributions TO service_role;
ALTER TABLE public.monthly_contributions ENABLE ROW LEVEL SECURITY;

-- =========== LOANS ===========
CREATE TABLE public.loans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  principal NUMERIC(10,2) NOT NULL CHECK (principal > 0),
  daily_rate NUMERIC(6,4) NOT NULL DEFAULT 0.01,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_at TIMESTAMPTZ,
  approved_by UUID REFERENCES auth.users(id),
  disbursed_at TIMESTAMPTZ,
  status public.loan_status NOT NULL DEFAULT 'pendiente_aprobacion',
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.loans TO authenticated;
GRANT ALL ON public.loans TO service_role;
ALTER TABLE public.loans ENABLE ROW LEVEL SECURITY;

-- =========== LOAN PAYMENTS ===========
CREATE TABLE public.loan_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id UUID NOT NULL REFERENCES public.loans(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount_capital NUMERIC(10,2) NOT NULL DEFAULT 0,
  amount_interest NUMERIC(10,2) NOT NULL DEFAULT 0,
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  status public.payment_status NOT NULL DEFAULT 'reportado',
  note TEXT,
  reported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  confirmed_at TIMESTAMPTZ,
  confirmed_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.loan_payments TO authenticated;
GRANT ALL ON public.loan_payments TO service_role;
ALTER TABLE public.loan_payments ENABLE ROW LEVEL SECURITY;

-- =========== POLICIES ===========
-- profiles
CREATE POLICY "socios ven su perfil" ON public.profiles FOR SELECT TO authenticated
  USING (auth.uid() = id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "socios actualizan su perfil" ON public.profiles FOR UPDATE TO authenticated
  USING (auth.uid() = id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admin inserta perfiles" ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admin elimina perfiles" ON public.profiles FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- user_roles: solo lectura; admin gestiona via service_role/server fns
CREATE POLICY "usuarios ven sus roles" ON public.user_roles FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

-- monthly_contributions
CREATE POLICY "ver aportes propios o admin" ON public.monthly_contributions FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "socio reporta aporte propio" ON public.monthly_contributions FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admin actualiza aportes" ON public.monthly_contributions FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR (auth.uid() = user_id AND status = 'pendiente'));
CREATE POLICY "admin elimina aportes" ON public.monthly_contributions FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- loans
CREATE POLICY "ver prestamos propios o admin" ON public.loans FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "socio solicita prestamo" ON public.loans FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admin actualiza prestamos" ON public.loans FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admin elimina prestamos" ON public.loans FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- loan_payments
CREATE POLICY "ver pagos propios o admin" ON public.loan_payments FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "socio reporta pago propio" ON public.loan_payments FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admin actualiza pagos" ON public.loan_payments FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admin elimina pagos" ON public.loan_payments FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- =========== TRIGGER: auto-crear perfil + rol al registrar ===========
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _is_first BOOLEAN;
BEGIN
  SELECT NOT EXISTS (SELECT 1 FROM public.profiles) INTO _is_first;

  INSERT INTO public.profiles (id, full_name, status)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    CASE WHEN _is_first THEN 'activo'::public.profile_status ELSE 'pendiente'::public.profile_status END
  );

  IF _is_first THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'socio');
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'socio');
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- updated_at trigger para profiles
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER profiles_set_updated_at BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
