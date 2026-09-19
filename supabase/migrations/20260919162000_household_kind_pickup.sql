-- 領取通知排除「其他」住戶
--
-- 背景：這不是在修現存缺陷。internal_pickup_notification_recipients 與
-- internal_pickup_notification_eligible_hash 兩支查詢都已依 period 篩選
-- phase13（期別 1、3）或 phase2（期別 2）的收件人，
-- 而「其他」住戶的 period 一律是 NULL。SQL 三值邏輯下 NULL 不會落在任何一邊，
-- 所以「其他」本來就已經被兩支函式一致排除，收件人清單與其 eligibility hash
-- 不會因此產生分歧。
--
-- 加上戶籍種類篩選是縱深防禦：日後若有人新增期別、或改動分組條件，
-- 原本靠 NULL 隱性擋住「其他」住戶的保護就會消失。明確寫出 household_kind
-- 篩選條件，讓排除「其他」住戶的意圖不再仰賴 period 恰好是 NULL 這個巧合。
--
-- 兩支函式的收件人條件必須完全一致：寄送流程會分別呼叫這兩支函式算出收件人
-- 清單與其雜湊值，若條件不同，兩者可能算出不同的名單，讓團主在預覽時卡在
-- 「請重新預覽」卻看不出原因。因此這裡只在既有 WHERE 子句中插入同一個新條件，
-- 插入位置在兩支函式中相對一致，join 順序、distinct、order by、
-- 與既有的 custom items 篩選條件維持原樣不動。

create or replace function public.internal_pickup_notification_recipients(
  p_campaign_id uuid,
  p_audience text
)
returns table (
  line_user_id text,
  member_code text,
  display_name text,
  picture_url text,
  period integer,
  unit text,
  paid boolean
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_campaign public.campaign;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;
  if p_campaign_id is null then
    raise exception 'invalid campaign' using errcode = '22023';
  end if;
  if p_audience not in ('phase13', 'phase2') then
    raise exception 'invalid notification audience' using errcode = '22023';
  end if;

  select campaign.* into v_campaign
  from public.campaign campaign
  where campaign.id = p_campaign_id;

  if v_campaign.id is null then
    raise exception 'campaign not found' using errcode = 'P0002';
  end if;
  if v_campaign.opened_at is null or v_campaign.status not in ('closed', 'arrived') then
    raise exception 'campaign must be closed' using errcode = '55000';
  end if;

  return query
  select distinct
    identity_row.line_user_id,
    member.member_code,
    identity_row.display_name,
    identity_row.picture_url,
    customer.period,
    customer.unit,
    coalesce(payment_row.paid, false)
  from public.customer customer
  join public.orders customer_order
    on customer_order.customer_id = customer.id
    and customer_order.campaign_id = v_campaign.id
  join public.community_member member
    on member.community_id = v_campaign.community_id
    and member.user_id = customer.auth_user_id
  join public.line_resident_identity identity_row
    on identity_row.auth_user_id = customer.auth_user_id
  left join public.payment payment_row
    on payment_row.order_id = customer_order.id
  where (
      jsonb_array_length(customer_order.custom_items) > 0
      or exists (select 1 from public.order_item item where item.order_id = customer_order.id and item.qty > 0)
    )
    and customer.household_kind = 'resident'
    and ((p_audience = 'phase13' and customer.period in (1, 3))
      or (p_audience = 'phase2' and customer.period = 2))
  order by customer.period, customer.unit, identity_row.line_user_id;
end;
$$;

create or replace function public.internal_pickup_notification_eligible_hash(
  p_campaign_id uuid,
  p_audience text
)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select encode(
    extensions.digest(
      convert_to(coalesce(string_agg(eligible.line_user_id, E'\n' order by eligible.line_user_id), ''), 'UTF8'),
      'sha256'
    ),
    'hex'
  )
  from (
    select distinct identity_row.line_user_id
    from public.campaign campaign
    join public.orders customer_order
      on customer_order.campaign_id = campaign.id
    join public.customer customer
      on customer.id = customer_order.customer_id
    join public.community_member member
      on member.community_id = campaign.community_id
      and member.user_id = customer.auth_user_id
    join public.line_resident_identity identity_row
      on identity_row.auth_user_id = customer.auth_user_id
    where campaign.id = p_campaign_id
      and (
        jsonb_array_length(customer_order.custom_items) > 0
        or exists (select 1 from public.order_item item where item.order_id = customer_order.id and item.qty > 0)
      )
      and customer.household_kind = 'resident'
      and ((p_audience = 'phase13' and customer.period in (1, 3))
        or (p_audience = 'phase2' and customer.period = 2))
  ) eligible;
$$;

revoke all on function public.internal_pickup_notification_recipients(uuid, text) from public, anon, authenticated;
revoke all on function public.internal_pickup_notification_eligible_hash(uuid, text) from public, anon, authenticated;
grant execute on function public.internal_pickup_notification_recipients(uuid, text) to service_role;
grant execute on function public.internal_pickup_notification_eligible_hash(uuid, text) to service_role;
