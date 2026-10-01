-- Shorter campaign links, step 2 of 2: new campaigns get 8-character codes.
-- Apply to production only after the site that opens /c/<8 characters> links is live;
-- campaigns that already exist keep their 36-character codes and links.
alter table public.campaign alter column slug set default public.random_campaign_slug();
