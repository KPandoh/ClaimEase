# Finance Review Supabase setup

## Apply the migrations

Confirm the existing `20261112000000_ps5_schema_and_seed.sql` migration is already applied. Do not rerun it; it drops and recreates the application tables.

Apply these additive migrations once, in filename order:

1. `20261112154500_finance_review_foundation.sql`
2. `20261112161200_finance_claim_decisions.sql`

The second migration creates the atomic `review_claim` RPC and grants execution to `service_role`; the API calls it only after finance authorization.

## Register a finance reviewer

Create or confirm the reviewer’s Supabase Auth account in the Supabase Dashboard. The seeded employee records `E006` and `E007` do not automatically have Auth accounts. Find the real Auth UUID and select the corresponding existing employee ID:

```sql
select id, email
from auth.users
where email = '<REVIEWER_EMAIL>';

select id, name, department
from public.employees
where id = '<EXISTING_EMPLOYEE_ID>';
```

Replace the placeholders with the actual values, then run this once in the Supabase SQL Editor:

```sql
insert into public.finance_users (auth_user_id, employee_id, is_active)
values ('<REVIEWER_AUTH_USER_UUID>'::uuid, '<EXISTING_EMPLOYEE_ID>', true);
```

The Auth UUID must come from `auth.users`; do not invent one. The employee must already exist in `public.employees`. The table has unique constraints, so do not rerun the insert for an already registered reviewer.

Verify the registration:

```sql
select fu.auth_user_id, fu.employee_id, e.name, fu.is_active
from public.finance_users as fu
join public.employees as e on e.id = fu.employee_id
where fu.auth_user_id = '<REVIEWER_AUTH_USER_UUID>'::uuid;
```

## Sign-in integration

Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in `.env.local` (copy `.env.example` as a starting point). Create the reviewer account in Supabase Auth, then sign in at `/login`. The browser client persists and refreshes the Supabase session; `authenticatedFetch` sends its access token as an `Authorization: Bearer` header, which the API verifies server-side.

Sign-in alone does not grant finance access. The reviewer must also have an active `finance_users` row registered as above. The service-role key remains server-only.
