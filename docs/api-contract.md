# ClaimEase API contract

Owners: Member 1 (frontend) and Member 2 (backend). The types and Zod schemas live in `types/api.ts`. Change both files together.

## Conventions

- JSON in and out. Field names are snake_case, matching the database.
- Amounts are numbers in rupees (up to 2 decimals). Dates are `"YYYY-MM-DD"`.
- "Today" means today in India (Asia/Kolkata).
- The signed-in employee is decided by the server. For the demo it is always **E001 (Meera Nair, L2)**. Requests never send `employee_id`.
- The server makes every policy decision. The frontend shows `status` and `policy_check` as returned.

## Errors

Every error uses this shape:

```json
{ "error": { "code": "EXPENSE_TOO_OLD", "message": "Expenses older than 60 days cannot be claimed.", "fields": {} } }
```

| HTTP | `code` | When |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Body is not JSON or fails the schema. `fields` lists messages per field. |
| 422 | `UNKNOWN_CATEGORY` | No policy rule for this category at the employee's grade. |
| 422 | `FUTURE_DATE` | `expense_date` is after today. |
| 422 | `EXPENSE_TOO_OLD` | `expense_date` is more than 60 days before today. |
| 401 | `UNAUTHORIZED` | Route needs a signed-in user and the session or bearer token is missing, invalid or expired. |
| 403 | `FORBIDDEN` | The user is authenticated but lacks the required authorization, such as active finance membership. |
| 409 | `CLAIM_NOT_REVIEWABLE` | The claim has already been reviewed or is not awaiting finance review. |
| 404 | `NOT_FOUND` | Employee record missing. |
| 500 | `SERVER_ERROR` | Database or configuration error. |

## Authentication (server helper)

Routes that need a real signed-in user (for example Finance Review) use `lib/server/auth-user.ts`. The existing claim routes still act as E001 until login is wired up.

```ts
import { requireVerifiedUser } from "@/lib/server/auth-user";

const auth = await requireVerifiedUser();
if (!auth.ok) return auth.response; // 401 UNAUTHORIZED
auth.user.id;       // Supabase Auth user id (UUID), verified with auth.getUser()
auth.user.email;    // string | null
auth.user.supabase; // client acting as this user (row level security applies)
```

- The token is read from `Authorization: Bearer <access_token>`, or else from the Supabase session cookie `sb-<project-ref>-auth-token` written by the Supabase browser client.
- Identity always comes from Supabase Auth, never from an id sent in the request body, and never from the service-role client.
- `getVerifiedUser()` returns the same user or `null`, for code that is not a route.
- Expired tokens give 401. The browser client refreshes the session; the server does not.
- Finance routes return `403 FORBIDDEN` when the signed-in user does not have active finance membership.

## Endpoints

### `GET /api/me`

The signed-in employee.

```json
{ "employee": { "id": "E001", "name": "Meera Nair", "email": "meera.nair@orbitline.example.com", "grade": "L2", "department": "Consulting", "manager_name": "Ravi Shankar", "base_city": "Chennai" } }
```

### `GET /api/categories`

Policy rules for the signed-in employee's grade, sorted by category.

```json
{ "categories": [ { "category": "client_entertainment", "grade": "L2", "max_amount": 3000, "receipt_required_above": 0, "notes": "Client meals. Write the client name in the description" } ] }
```

Categories: `local_travel`, `outstation_travel`, `hotel_metro`, `hotel_non_metro`, `meals`, `client_entertainment`, `internet`, `mobile`, `training`.

### `GET /api/claims`

The signed-in employee's claims, newest first.

```json
{ "claims": [ { "id": 5, "employee_id": "E001", "category": "client_entertainment", "amount": 3600, "expense_date": "2026-11-07", "description": "Dinner with Nexora Retail team", "has_receipt": true, "status": "flagged", "policy_check": "Above L2 limit of 3000 for client_entertainment", "created_at": "2026-11-07T10:00:00+00:00" } ] }
```

### `GET /api/finance/claims`

Requires a verified Supabase Auth user with active finance membership. Returns claims with status `submitted` or `flagged`, newest first, with employee details for review. Returns `401 UNAUTHORIZED` when the user is not signed in and `403 FORBIDDEN` when the user lacks active finance membership.

```json
{
  "claims": [
    {
      "id": 21,
      "employee_id": "E006",
      "category": "meals",
      "amount": 720,
      "expense_date": "2026-11-10",
      "description": "Client visit meal",
      "has_receipt": true,
      "status": "submitted",
      "policy_check": "Within policy",
      "created_at": "2026-11-10T10:00:00.000Z",
      "employee": {
        "id": "E006",
        "name": "Fatima Sheikh",
        "grade": "L2",
        "department": "Finance",
        "manager_name": "Gopal Iyer",
        "base_city": "Mumbai"
      }
    }
  ]
}
```

### `POST /api/finance/claims/{id}/approve`

Requires active finance membership. Approves a claim only while its status is `submitted` or `flagged`. The status update and audit entry are committed atomically. Returns the updated claim.

### `POST /api/finance/claims/{id}/reject`

Requires active finance membership and a non-empty reason:

```json
{ "reason": "Missing business purpose" }
```

Rejects a claim only while its status is `submitted` or `flagged`. The status update and audit entry, including the verified reviewer and reason, are committed atomically. Invalid or repeated transitions return `409 CLAIM_NOT_REVIEWABLE`.

### `POST /api/claims`

Request:

```json
{ "category": "meals", "amount": 650, "expense_date": "2026-11-10", "description": "Lunch during Pune client visit", "has_receipt": true }
```

| Field | Type | Rules |
|---|---|---|
| `category` | string | One of the categories above |
| `amount` | number | > 0, at most 2 decimals |
| `expense_date` | string | `YYYY-MM-DD` |
| `description` | string | 1 to 500 characters after trimming |
| `has_receipt` | boolean | Optional, default `false` |

The server checks the rules in this order:

1. The date is in the future: rejected with `422 FUTURE_DATE`. Nothing is saved.
2. The date is more than 60 days ago: rejected with `422 EXPENSE_TOO_OLD`. Nothing is saved.
3. No rule exists for the category at the employee's grade: rejected with `422 UNKNOWN_CATEGORY`.
4. `amount` > `max_amount`: saved with `status: "flagged"` and `policy_check: "Above L2 limit of 800 for meals"`.
5. Otherwise: saved with `status: "submitted"` and `policy_check: "Within policy"`.

Response `201`:

```json
{ "claim": { "id": 16, "employee_id": "E001", "category": "meals", "amount": 650, "expense_date": "2026-11-10", "description": "Lunch during Pune client visit", "has_receipt": true, "status": "submitted", "policy_check": "Within policy", "created_at": "2026-11-12T09:30:00+00:00" } }
```

## Planned

- `POST /api/extract`: turns a plain-language message into a draft `POST /api/claims` body. It waits on Member 3's `lib/ai/` interface.
