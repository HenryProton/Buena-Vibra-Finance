
-- Create trigger to auto-create profile + roles on new signups
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Backfill existing auth users who don't have a profile yet
DO $$
DECLARE
  u RECORD;
  _is_first BOOLEAN;
BEGIN
  FOR u IN
    SELECT au.id, au.email, au.raw_user_meta_data
    FROM auth.users au
    LEFT JOIN public.profiles p ON p.id = au.id
    WHERE p.id IS NULL
    ORDER BY au.created_at ASC
  LOOP
    SELECT NOT EXISTS (SELECT 1 FROM public.profiles) INTO _is_first;

    INSERT INTO public.profiles (id, full_name, status)
    VALUES (
      u.id,
      COALESCE(u.raw_user_meta_data->>'full_name', split_part(u.email, '@', 1)),
      CASE WHEN _is_first THEN 'activo'::public.profile_status ELSE 'pendiente'::public.profile_status END
    );

    IF _is_first THEN
      INSERT INTO public.user_roles (user_id, role) VALUES (u.id, 'admin') ON CONFLICT DO NOTHING;
    END IF;
    INSERT INTO public.user_roles (user_id, role) VALUES (u.id, 'socio') ON CONFLICT DO NOTHING;
  END LOOP;
END $$;
