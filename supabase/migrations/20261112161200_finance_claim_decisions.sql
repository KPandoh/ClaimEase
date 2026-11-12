create or replace function public.review_claim(
  p_claim_id bigint,
  p_reviewer_auth_user_id uuid,
  p_action text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_claim public.claims%rowtype;
  v_previous_status text;
  v_new_status text;
begin
  if p_action is null or p_action not in ('approve', 'reject') then
    raise exception using errcode = '22023', message = 'Invalid review action';
  end if;

  if p_action = 'reject' and nullif(btrim(p_reason), '') is null then
    raise exception using errcode = '22023', message = 'A rejection reason is required';
  end if;

  perform 1
  from public.finance_users
  where auth_user_id = p_reviewer_auth_user_id
    and is_active = true
  for share;

  if not found then
    raise exception using errcode = '42501', message = 'Active finance membership is required';
  end if;

  select *
  into v_claim
  from public.claims
  where id = p_claim_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Claim not found';
  end if;

  if v_claim.status not in ('submitted', 'flagged') then
    raise exception using errcode = 'P0001', message = 'Claim is not awaiting finance review';
  end if;

  v_previous_status := v_claim.status;
  v_new_status := case p_action
    when 'approve' then 'approved'
    else 'rejected'
  end;

  update public.claims
  set status = v_new_status
  where id = p_claim_id
  returning * into v_claim;

  insert into public.claim_review_audit (
    claim_id,
    reviewer_auth_user_id,
    action,
    previous_status,
    new_status,
    reason
  )
  values (
    p_claim_id,
    p_reviewer_auth_user_id,
    p_action,
    v_previous_status,
    v_new_status,
    nullif(btrim(p_reason), '')
  );

  return to_jsonb(v_claim);
end;
$$;

revoke all on function public.review_claim(bigint, uuid, text, text) from public, anon, authenticated;
grant execute on function public.review_claim(bigint, uuid, text, text) to service_role;
