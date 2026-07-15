-- Revoke EXECUTE on channel_balance from authenticated; only service_role calls it via server fn.
REVOKE EXECUTE ON FUNCTION public.channel_balance(uuid) FROM authenticated, PUBLIC;

-- Add WITH CHECK to admin loans update policy to prevent row-swap edge cases (defense-in-depth).
DROP POLICY IF EXISTS "admin actualiza prestamos" ON public.loans;
CREATE POLICY "admin actualiza prestamos"
ON public.loans
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
