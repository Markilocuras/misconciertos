
-- 1. Lock down SECURITY DEFINER functions: revoke default PUBLIC EXECUTE,
--    then grant only to the roles that actually need to call them.

-- update_updated_at_column: only used as a trigger, no role needs EXECUTE.
REVOKE ALL ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;

-- promote_first_user_to_admin: only used as an auth trigger (runs as definer),
--   no client role needs EXECUTE.
REVOKE ALL ON FUNCTION public.promote_first_user_to_admin() FROM PUBLIC, anon, authenticated;

-- has_role: called from client via supabase.rpc("has_role", ...) by signed-in
--   users, and referenced from RLS policies. Keep EXECUTE for authenticated
--   and service_role only; revoke from anon and PUBLIC.
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;

-- 2. Drop the overly-permissive INSERT policy on concert_clicks.
--    The /api/public/hooks/track-click route inserts via supabaseAdmin
--    (service role bypasses RLS), so no anon/authenticated INSERT is needed.
DROP POLICY IF EXISTS "Anyone can insert clicks" ON public.concert_clicks;
REVOKE INSERT ON public.concert_clicks FROM anon, authenticated;
