# Move MeterTrack to a real cloud backend

Today everything — users, passwords, DCU assignments, scans and settings — lives only in the browser of the device that made it. Clear the browser and it's gone; a second phone sees nothing. This moves all of it to Lovable Cloud, keeps the Google Sheet working exactly as it does now, and adds proper sign-in with enforced permissions.

## What changes for you

- **Sign in** stays username + password, the same as now, but the account is checked in the cloud instead of on the phone. Anyone signing in on any device sees the same data.
- **The first administrator is created by you in Cloud > Users**, not from the login page. The public page will only ever sign people in — never create accounts.
- **Administrators** then add, disable, and delete other users, set each one as administrator or standard, and assign a DCU location to each standard user — from the Admin screen, as today.
- **Standard users** only see and scan meters for the DCU location assigned to them. This is now enforced on the server, so it can't be bypassed.
- **Scans** save to the cloud **and** to your Google Sheet exactly as they do now. Nothing about the sheet layout, carton numbering, duplicate checking, or sync changes.
- **Settings** (columns, carton size, scan sounds, spreadsheet ID) become shared across the team, editable by administrators only.

## What stays the same

The scanner, flashlight, camera switching, duplicate detection, carton flow, inventory table, Excel export, and every Google Sheets feature keep their current behaviour and appearance.

## Technical outline

**Enable Lovable Cloud**, then one migration creating (all with GRANTs, RLS on, and policies):

- `app_role` enum (`admin`, `standard`) and `user_roles` (user_id, role) — roles never on the profile table; `has_role(uuid, app_role)` security-definer function used by all policies.
- `profiles` — id (FK `auth.users`, cascade), username (unique, citext-normalized), assigned_dcu_id, enabled, created_at. Trigger auto-creates a row on signup from user metadata.
- `dcus` — id, name, site, active. Seeded in the migration with the 12 master sites.
- `scans` — meter_serial (unique, normalized), dcu_id, carton_id, scanned_at, status, notes, session_id, bulk_carton, sheets_exported_at, created_by.
- `app_settings` — single-row table mirroring `AppSettings`; read by authenticated, written by admins only.

Policies: admins full access via `has_role`; standard users SELECT/INSERT scans only where `dcu_id` matches their `profiles.assigned_dcu_id`; only admins UPDATE/DELETE scans, manage dcus, profiles, roles, and settings.

**Auth**: username-only, so auth calls use a deterministic synthetic email `${normalized_username}@metertrack.local`; `enable_email_auth` plus auto-confirm (the synthetic address can't receive mail). Email password reset is therefore unavailable — admins reset passwords instead. The first admin is created in Cloud > Users; a one-time step grants that user the `admin` role and a profile row. No public sign-up path.

**App changes**:
- Replace `src/lib/storage.ts` internals with server functions in `src/lib/data.functions.ts` (`requireSupabaseAuth` middleware, RLS as the caller) — same exported function names where possible so the pages change minimally.
- Move the sign-in screen in `__root.tsx` to `supabase.auth.signInWithPassword` with the synthetic email; keep the existing card layout, drop the role dropdown (role comes from the database). Add the root `onAuthStateChange` subscriber and proper sign-out cleanup.
- Put `/user`, `/inventory`, `/operations`, `/admin`, `/settings` under the managed `_authenticated` layout; `/` stays public and redirects signed-in users.
- Scan save writes to the cloud first, then runs the existing Google Sheets sync — `sheets.functions.ts` is untouched.
- Admin screen user management switches to server functions that create auth users (service role, admin-verified), assign roles, and set DCU assignments.

Existing localStorage data is not migrated; the Google Sheet remains the historical record.
