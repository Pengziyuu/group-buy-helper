-- One-time Production test reset explicitly authorized by the project owner.
-- Clears all resident mutable/test data while preserving campaigns, Auth,
-- canonical LINE identities, and organizer authorization.
do $$
begin
  -- Fail immediately instead of waiting or deadlocking with active writes.
  lock table public.payment,
             public.order_item,
             public.orders,
             public.customer,
             public.campaign_access,
             public.community_resident_block,
             public.community_member
  in access exclusive mode nowait;

  -- Child order_item/payment rows cascade from orders.
  delete from public.orders;
  delete from public.customer;
  delete from public.campaign_access;
  delete from public.community_resident_block;
  delete from public.community_member;
end;
$$;
