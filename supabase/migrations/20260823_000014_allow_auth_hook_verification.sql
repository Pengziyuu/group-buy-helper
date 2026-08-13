-- Allow trusted service-role verification of the Auth hook through PostgREST.
-- Browser roles remain explicitly revoked.
grant execute on function public.line_organizer_access_token_hook(jsonb)
  to service_role;
