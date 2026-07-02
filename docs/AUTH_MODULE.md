# Auth Module Documentation

## Purpose

Authentication uses **Clerk** for sign-in/sign-up. Application roles are stored in Clerk `publicMetadata.roles` and enforced client-side via `useAuth()`.

## Routes

- **File:** `src/routes/auth.tsx`
- **Path:** `/auth` — Clerk sign-in UI

## Role Model

Defined in `src/lib/auth.ts`:

| Role | Typical access |
|------|----------------|
| `super_admin` | Full access + admin |
| `ceo` | Executive modules |
| `hr` | People ops |
| `finance` | Money modules |
| `manager` | Team + limited ops |

`ROLE_PRIORITY` resolves primary role; `hasRole` / `hasAnyRole` guard nav and pages.

## Server Verification

- `src/lib/clerk-auth.server.ts` — `verifyToken`, `requireClerkEmailFromSessionToken`
- Used by protected server functions (e.g. notetaker admin actions)

## Environment

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Client |
| `CLERK_SECRET_KEY` | Server token verify |

## Demo / Temporary Behaviors

- Local unlock codes for Time Dashboard (session/localStorage)
- Demo role switching (localStorage) — intended for merge removal in Palisade integration

## Nav vs Route Guards

Some nav items show broader roles than route layouts enforce (e.g. Bonus nav includes `finance` but `/bonus` layout allows only `ceo` + `super_admin`). Align guards when hardening.

## File Map

| File | Role |
|------|------|
| `src/lib/auth.ts` | Client auth context |
| `src/lib/clerk-auth.server.ts` | Server verification |
| `src/routes/auth.tsx` | Auth route |
| `src/components/AppShell.tsx` | Nav role filters |
