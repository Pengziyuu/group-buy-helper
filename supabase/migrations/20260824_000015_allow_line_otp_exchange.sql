-- Supabase reports verifyOtp({ type: 'email' }) token exchanges to the
-- custom access-token hook as authentication_method = 'otp'. The token is
-- still minted only by the trusted LINE organizer Edge Function for an
-- internal, non-deliverable address.
create or replace function public.line_organizer_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid;
  v_method text;
begin
  v_user_id := nullif(event ->> 'user_id', '')::uuid;
  v_method := coalesce(event ->> 'authentication_method', '');

  if exists (
    select 1
    from public.line_organizer_identity
    where auth_user_id = v_user_id
  ) and v_method not in ('magiclink', 'otp', 'token_refresh') then
    return jsonb_build_object(
      'error', jsonb_build_object(
        'http_code', 403,
        'message', 'LINE organizer must authenticate through LINE'
      )
    );
  end if;

  return event;
exception
  when invalid_text_representation then
    return jsonb_build_object(
      'error', jsonb_build_object(
        'http_code', 400,
        'message', 'Invalid authentication event'
      )
    );
end;
$$;

revoke all on function public.line_organizer_access_token_hook(jsonb)
  from public, anon, authenticated;
grant execute on function public.line_organizer_access_token_hook(jsonb)
  to supabase_auth_admin, service_role;
