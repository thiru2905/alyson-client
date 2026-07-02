# Admin Module Documentation

## Purpose

Admin (`/admin`) is the super-admin control panel for users/roles and placeholder sections for future platform configuration.

## Route

- **File:** `src/routes/admin.tsx`
- **Path:** `/admin`

## Data Sources

- Supabase: `profiles`, `user_roles`, `departments` (via `UsersRolesDrawer`)
- Other sections are UI placeholders (toast only)

## Key Behaviors

- Hard gate: non-`super_admin` sees Access Denied
- Shows effective roles (+ demo role indicator from `useAuth`)
- **Users & roles** drawer: read/insert/delete `user_roles`
- Placeholder cards: Security/SSO, Data sources, Webhooks, API keys, Audit log

## Access

`super_admin` only

## File Map

| File | Role |
|------|------|
| `src/routes/admin.tsx` | Page |
| `src/lib/auth.ts` | Role helpers |
| `src/components/drawers/UsersRolesDrawer.tsx` | Role management |

## Related

- [AUTH_MODULE.md](./AUTH_MODULE.md) — Clerk integration details
