
-- 1) Drop overly-broad anon read policy on invitations
DROP POLICY IF EXISTS "Anyone can read invitation by code for validation" ON public.invitations;

-- 2) Tighten SECURITY DEFINER function EXECUTE privileges
REVOKE EXECUTE ON FUNCTION public.channel_balance(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
-- has_role must remain callable by authenticated because RLS policies use it
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.channel_balance(uuid) TO authenticated, service_role;
