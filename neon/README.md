# Zenvyra Neon cutover

Status: local registration, email OTP, password reset and browser save/reload verified. Production deployment READY on https://www.zenvyra.hu.

1. Authenticate the Neon CLI and select/create a dedicated AWS Zenvyra project.
2. Create an isolated branch. Enable Managed Auth and Data API.
3. Apply schema.sql once on that new branch, verify policies and grants.
4. Register https://www.zenvyra.hu and https://zenvyra.hu as trusted domains.
5. Configure email verification codes and SMTP. Configure Google OAuth separately.
6. Set NEXT_PUBLIC_NEON_URL to https://<connection-host>/<database-name> locally.
   This is a public endpoint, never a postgres:// connection string or secret.
7. Test signup, email verification, login, reload, profile and every log type.
   Check unauthenticated denial and isolation between two different users.
8. Only after successful checks, set the Vercel production variable and deploy.
9. Keep the Supabase project and backups. Existing password hashes cannot transfer;
   old user-owned data needs an explicit old-to-new user ID mapping before import.

Rollback: remove NEXT_PUBLIC_NEON_URL and redeploy to select the old Supabase
configuration. That service must be running for rollback to restore account access.

Verified on migration-test (2026-10-08):
- Managed Auth signup and password login for two synthetic accounts.
- Email verification was marked administratively for these synthetic accounts only; this does not verify email delivery.
- Data API insert and read for all eight tables.
- Other user reads return no rows; forged ownership inserts are rejected for all eight tables.
- Unauthenticated profile access is denied.
- RLS enabled on all eight public tables.

Project: fancy-wave-15474912, AWS Frankfurt.
Test branch: br-mute-feather-b24zxdjd (migration-test).
The main branch has not been provisioned or deployed.
Still required: real email OTP, authenticated browser save/reload and production configuration.
Social buttons are hidden for Neon until a provider is configured and tested.

## Next.js session configuration
Set server-only NEON_AUTH_BASE_URL and NEON_AUTH_COOKIE_SECRET (random 32+ characters)
in addition to NEXT_PUBLIC_NEON_URL. Keep the cookie secret stable across deployments.
Never expose the cookie secret as NEXT_PUBLIC_ or commit it.
/api/auth/[...path] proxies Managed Auth so cookies stay on the application origin.
Data API requests use the signed JWT from /api/auth/token; opaque session tokens
must not be used as Data API bearer tokens.

Browser verification on migration-test, 2026-10-08:
- Password sign-in with a synthetic verified account.
- Four-step profile creation; database record independently checked.
- Water (300 ml) and mood (3) saved from the UI and independently checked in Postgres.
- Reload retained the session, completed profile and 300 ml water entry.
- Sign-out returned to the public landing; subsequent password login restored the completed profile and 300 ml entry.
- Profile load errors now show retry instead of starting onboarding again.
- Production build and TypeScript passed; lint has zero errors and two image warnings.

Production remains unchanged. Real email OTP completion, password-reset delivery,
production SMTP/domain setup and Vercel cutover still need verification.

## Production environment (2026-10-08)
Project fancy-wave-15474912; branch production (br-fragrant-bird-b256yasw).
Created from the verified migration-test branch, including the user's tested account.
Public endpoint: https://ep-little-salad-b2y8axew.c-6.eu-central-1.aws.neon.tech/neondb
Auth URL: https://ep-little-salad-b2y8axew.neonauth.c-6.eu-central-1.aws.neon.tech/neondb/auth
Trusted domains: https://www.zenvyra.hu and https://zenvyra.hu.
Vercel project: zenvyra-new (prj_EHi7bdv8JlC0NssoUzCoGEUnOtOQ).
The production cookie secret is generated separately and stored only in Vercel.
Local .env.local stays on migration-test to isolate future local testing.
Shared Neon mail delivery remains configured; custom SMTP is not yet provisioned.

Live verification: password login, same-origin session and signed JWT, completed profile read, water insert and independent readback passed via www.zenvyra.hu.
Deployment: dpl_pTPWR9EvhCxumsdoTkY1p3LXctwj. Git publication of local changes still pending.
