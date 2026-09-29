-- Extend the existing one-time intent with two atomic multi-period audiences.
-- Historical phase13/phase2 commands retain their exact semantics.
alter table public.pickup_notification_intent
  drop constraint pickup_notification_intent_audience_check;
alter table public.pickup_notification_intent
  add constraint pickup_notification_intent_audience_check
  check (audience in ('phase13', 'phase2', 'all', 'combined'));

-- Retain existing signatures, grants, SECURITY DEFINER guards and lock order.
-- pg_get_functiondef emits CREATE OR REPLACE FUNCTION; fail rather than silently
-- migrate an unexpected prior definition.
do $$
declare
  v_fn regprocedure;
  v_old text;
  v_new text;
  v_marker text;
begin
  foreach v_fn in array array[
    'public.reserve_pickup_notification_intent(uuid,text,uuid,uuid,text,text)'::regprocedure,
    'public.issue_pickup_notification_reply_command(uuid,uuid,text,uuid,text,text,text,text,text)'::regprocedure,
    'public.internal_pickup_notification_recipients(uuid,text)'::regprocedure,
    'public.internal_pickup_notification_eligible_hash(uuid,text)'::regprocedure,
    'public.claim_pickup_notification_reply_command(text,text,text,text,text,text,text)'::regprocedure
  ] loop
    v_old := pg_get_functiondef(v_fn);
    v_new := replace(v_old, '(''phase13'', ''phase2'')', '(''phase13'', ''phase2'', ''all'', ''combined'')');
    if v_new = v_old and v_fn::text not like '%internal_pickup_notification_eligible_hash%'
      and v_fn::text not like '%claim_pickup_notification_reply_command%' then
      raise exception 'unexpected pickup function audience definition: %', v_fn;
    end if;
    if v_fn::text like '%internal_pickup_notification_%' then
      -- PostgreSQL retains the body text of these functions verbatim.
      v_old := v_new;
      v_new := replace(v_old, '((p_audience = ''phase13'' and customer.period in (1, 3))',
        '((p_audience in (''all'', ''combined'')) or (p_audience = ''phase13'' and customer.period in (1, 3))');
      if v_new = v_old then
        raise exception 'unexpected pickup recipient period predicate: %', v_fn;
      end if;
    end if;
    if v_fn = 'public.internal_pickup_notification_eligible_hash(uuid,text)'::regprocedure then
      -- Legacy phase hashes stay byte-for-byte ID-only. New audiences hash ID:period
      -- in the same ID order as WebCrypto; claim already compares this helper atomically.
      v_old := v_new;
      v_new := replace(v_old, 'select distinct identity_row.line_user_id',
        'select distinct identity_row.line_user_id, customer.period');
      if v_new = v_old then raise exception 'unexpected eligible hash projection'; end if;
      v_old := v_new;
      v_new := replace(v_old, 'string_agg(eligible.line_user_id, E''\n'' order by eligible.line_user_id)',
        'string_agg(case when p_audience in (''all'', ''combined'') then eligible.line_user_id || '':'' || eligible.period::text else eligible.line_user_id end, E''\n'' order by eligible.line_user_id)');
      if v_new = v_old then raise exception 'unexpected eligible hash aggregation'; end if;
    end if;
    if v_fn = 'public.claim_pickup_notification_reply_command(text,text,text,text,text,text,text)'::regprocedure then
      -- Recheck in the same UPDATE that consumes the command, not only a prior IF.
      -- Move replay insertion after the conditional transition so a failed claim
      -- does not consume the webhook event ID.
      v_marker := '  insert into public.line_webhook_event_replay (webhook_event_id, expires_at)
  values (p_webhook_event_id, greatest(v_command.retain_until, clock_timestamp() + interval ''15 minutes''));';
      v_old := v_new;
      v_new := replace(v_old, v_marker, '');
      if v_new = v_old then raise exception 'unexpected pickup claim replay marker'; end if;
      v_old := v_new;
      v_new := replace(v_old, '  v_user_id uuid;', '  v_user_id uuid;
  v_claimed integer;');
      if v_new = v_old then raise exception 'unexpected pickup claim declaration'; end if;
      v_old := v_new;
      v_new := replace(v_old, '  where command_row.intent_token = v_command.intent_token;
  return true;',
        '  where command_row.intent_token = v_command.intent_token
    and public.internal_pickup_notification_eligible_hash(v_intent.campaign_id, v_intent.audience) = p_eligible_hash;
  get diagnostics v_claimed = row_count;
  if v_claimed <> 1 then return false; end if;
' || v_marker || '
  return true;');
      if v_new = v_old then raise exception 'unexpected pickup claim transition'; end if;
    end if;
    execute v_new;
  end loop;
end;
$$;
