-- The organizer chooses a local Taipei date and minute; the timestamp column
-- stores the corresponding absolute instant. The old noon-only checks reject
-- valid selections such as 18:30. Keep minute precision, not a fixed hour.
alter table public.campaign
  drop constraint campaign_auto_close_taipei_noon,
  add constraint campaign_auto_close_minute_precision check (
    auto_close_at is null or extract(second from auto_close_at) = 0
  );

alter table public.campaign_draft
  drop constraint campaign_draft_auto_close_taipei_noon,
  add constraint campaign_draft_auto_close_minute_precision check (
    auto_close_at is null or extract(second from auto_close_at) = 0
  );
