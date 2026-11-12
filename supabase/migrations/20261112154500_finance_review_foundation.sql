create table public.finance_users (
  auth_user_id uuid primary key references auth.users(id) on delete cascade,
  employee_id text not null unique references public.employees(id),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.claim_review_audit (
  id bigint generated always as identity primary key,
  claim_id bigint not null references public.claims(id),
  reviewer_auth_user_id uuid not null references auth.users(id),
  action text not null check (action in ('approve', 'reject')),
  previous_status text not null check (previous_status in ('submitted', 'flagged')),
  new_status text not null check (new_status in ('approved', 'rejected')),
  reason text,
  reviewed_at timestamptz not null default now(),
  constraint claim_review_audit_action_status_check
    check (
      (action = 'approve' and new_status = 'approved')
      or (action = 'reject' and new_status = 'rejected')
    )
);

create index claim_review_audit_claim_reviewed_at_idx
  on public.claim_review_audit (claim_id, reviewed_at desc);

alter table public.finance_users enable row level security;
alter table public.claim_review_audit enable row level security;

create function public.prevent_claim_review_audit_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'claim_review_audit is append-only';
end;
$$;

create trigger claim_review_audit_prevent_mutation
before update or delete on public.claim_review_audit
for each row execute function public.prevent_claim_review_audit_mutation();

create trigger claim_review_audit_prevent_truncate
before truncate on public.claim_review_audit
for each statement execute function public.prevent_claim_review_audit_mutation();
