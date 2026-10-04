# Chapter Calendar

Mobile-first PWA for chapter events, availability, and attendance. It's the first app on a shared chapter hub: one Supabase project handles identity for every hub app.

**Stack:** React 19, Vite, TypeScript, Tailwind CSS 4 · Supabase (Postgres + RLS, Auth, Storage, Edge Functions, Realtime) · Vercel · Resend (email) · Claude API (schedule parsing, server-side only) · Web Push (VAPID)

## Build phases

| Phase | Scope | Status |
| --- | --- | --- |
| 1 | Auth (Google + email/password, password reset, approval), roles, calendar grid, events, RSVPs, .ics feed | **Done** |
| 2 | Schedule wizard, AI parsing, Canvas/ICS sync | |
| 3 | Availability heatmap, night toggles, Members tab | |
| 4 | Attendance (rotating QR + roster), excuse form | |
| 5 | Notifications, admin panel, Excel export, hub Apps menu | |

## Architecture

```
public.members          shared roster (id, name, email, role, member_type, pledge_class, status, active)
public.is_member()      helpers any hub app can use in RLS:
public.is_brother()       approved + active (+ brother / admin / chair)
public.is_admin()
public.is_chair()
public.admin_update_member(...)   the only way to change role / type / status / active

calendar.*              this app's tables: settings, categories, chair_categories,
                        event_series, events, rsvps, feed_tokens
```

- **Roles:** `role` is `admin | chair | member`; `member_type` is `brother | associate`. Associates are always `member`. Chairs manage events only in the categories assigned in `calendar.chair_categories`.
- **Sign-ups** create a `pending` member (as an associate, the most restricted type). Pending, rejected, and inactive members can read nothing but their own member row.
- **Events hidden from Associate Members** are filtered by RLS, so they never leave the database for an AM: not in the UI, the API, or the .ics feed.
- **Recurring events** are stored as one row per occurrence sharing a `series_id`, so RSVPs, attendance, and reminders always point at a concrete event. Repeat rules are expanded in Postgres in `America/New_York`, so 7 PM stays 7 PM across DST.
- **Everything is enforced with RLS**; the UI only hides what would fail anyway. `supabase/tests/database` proves it.

## Local development

Prerequisites: Node 22 and Docker.

```bash
npm install
npx supabase start            # Postgres, Auth, REST, Storage, Edge Functions, Mailpit
cp .env.example .env.local    # paste API URL + anon (publishable) key from `npx supabase status`
npm run dev                   # http://localhost:5173
```

`npx supabase db reset` re-applies migrations and `supabase/seed.sql` (21 fake members and sample events). All seed passwords are `Password123`:

| Email | Role |
| --- | --- |
| president@example.com, secretary@example.com | Admin |
| social@example.com, philanthropy@example.com, rush@example.com | Chair (Socials / Philanthropy / Rush) |
| brother1@example.com … brother9@example.com | Brother |
| am1@example.com … am5@example.com | Associate Member |
| pending1@example.com, pending2@example.com | Pending approval |

Local email (confirmations, resets) goes to Mailpit at http://127.0.0.1:54324, not to real inboxes.

Use `localhost:5173`, not `127.0.0.1:5173`. Email links point at `site_url` (`http://localhost:5173`), and the session cookie belongs to that origin.

After changing SQL, regenerate types with `npm run db:types`.

## Tests

| Command | What it covers |
| --- | --- |
| `npm test` | Unit tests: chapter-time date math (DST, overnight events), week layout, event form validation, permissions, .ics output, category contrast (WCAG AA) |
| `npm run test:db` | pgTAP: RLS for every role (pending, AM, brother, chair, admin, inactive), privilege escalation, RSVP rules, recurrence, feeds |
| `npm run test:e2e` | Playwright (mobile Chrome) against local Supabase + Mailpit: full password reset (request → email → link on a fresh device → new password → sign in; single-use link), sign-up → confirm → pending → admin approval, event creation and AM visibility, RSVPs, chair category limits |

`npm run test:e2e` needs `npx supabase start` running. Set `E2E_PROD=1` to test the production build (with service worker) instead of the dev server. CI (`.github/workflows/ci.yml`) runs all three on every push.

## Environment variables

| Variable | Where | Notes |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | Vercel, `.env.local` | Project URL |
| `VITE_SUPABASE_ANON_KEY` | Vercel, `.env.local` | Anon / publishable key. Safe in the browser; RLS protects data |
| `VITE_APP_NAME` | Vercel (optional) | Shown in the header, title, and install name |
| `VITE_AUTH_COOKIE_DOMAIN` | Vercel (optional) | e.g. `.yourchapter.org`, to share the login across hub subdomains |
| `ANTHROPIC_API_KEY` | Supabase secrets only | Phase 2. Never put it in Vercel or any `VITE_` variable |
| `VITE_VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | Vercel / Supabase secrets | Phase 5 |
| `RESEND_API_KEY` | Supabase secrets | Phase 4+ notification emails. Auth emails use SMTP (below) |
| `CALENDAR_NAME` | Supabase secrets (optional) | Name shown for the subscribed .ics calendar |

## Deploy a test site (staging)

`npm run deploy:staging` (`scripts/deploy-staging.mjs`) puts a test copy online. It's safe to re-run after each phase. It does the following:

1. Creates the Supabase project `chapter-hub-staging`.
2. Applies the migrations.
3. Sets the login settings and email templates.
4. Deploys the site to Vercel.
5. Loads the demo members and sample events, then prints the site link and a new demo password.

It needs, in the environment where it runs:

- `SUPABASE_ACCESS_TOKEN` from https://supabase.com/dashboard/account/tokens
- `VERCEL_TOKEN` from https://vercel.com/account/settings/tokens
- network access to `api.supabase.com`, `*.supabase.co`, `api.vercel.com`, `*.vercel.app`

Until Resend is set up, Supabase's built-in mailer only emails addresses on your Supabase team. Test sign-up and password reset with the email you used for Supabase. Free projects pause after a week unused; re-running the script wakes the project up. Production gets its own clean project (below), never the staging one.

## Production setup

### 1. Supabase

1. Create a project (region **East US** is closest to Gainesville).
2. Link it and push the schema. **Never run `seed.sql` in production.**
   ```bash
   npx supabase login
   npx supabase link --project-ref <ref>
   npx supabase db push
   npx supabase functions deploy ics-feed --no-verify-jwt
   ```
3. **Project Settings → Data API → Exposed schemas:** add `calendar`.
4. **Authentication → Sign In / Providers → Email:** turn on *Confirm email*. Set the minimum password length to 8 and the requirement to *Letters and digits* (this matches the app's validation).
5. **Authentication → URL Configuration:**
   - Site URL: `https://calendar.yourchapter.org`
   - Redirect URLs: `https://calendar.yourchapter.org/**`, `http://localhost:5173/**`, plus your Vercel preview pattern (e.g. `https://*-yourteam.vercel.app/**`).
6. **Authentication → Email Templates:** paste `supabase/templates/confirmation.html` into *Confirm signup*, `recovery.html` into *Reset password*, and `email_change.html` into *Change email address*. These templates send token-hash links that the app redeems only when the member submits the form, so:
   - links work when the email is opened on a different device, and
   - Outlook Safe Links (UF mail) can't burn the one-time token by pre-opening it.
7. **First admin:** sign up in the app, confirm your email, then run this in the SQL editor:
   ```sql
   update public.members
   set status = 'approved', role = 'admin', member_type = 'brother', approved_at = now()
   where email = 'you@ufl.edu';
   ```
   After that, approve everyone else in the app (**Admin** tab). The database refuses to remove the last active admin.

### 2. Resend (all transactional email)

1. In Resend, add and verify your domain (SPF and DKIM DNS records), then create an API key with *Sending access*.
2. In Supabase, go to **Authentication → Emails → SMTP Settings** and enable custom SMTP:
   - Host `smtp.resend.com`, port `465`, username `resend`, password = the Resend API key
   - Sender: `no-reply@yourchapter.org`, sender name: your chapter
3. **Authentication → Rate Limits:** raise *Emails sent per hour* (e.g. 100). Supabase's built-in sender only delivers to your project team's addresses, a few per hour, so members never get its emails. Custom SMTP is required.

### 3. Google sign-in

1. In Google Cloud Console, go to **APIs & Services → OAuth consent screen**. Choose External, add your domain and `supabase.co` as authorized domains, and use the scopes `openid`, `email`, `profile`. Click **Publish app** so any Google account can sign in (otherwise only listed test users can).
2. Go to **Credentials → Create OAuth client ID → Web application**:
   - Authorized JavaScript origins: `https://calendar.yourchapter.org`, `http://localhost:5173`
   - Authorized redirect URIs: `https://<ref>.supabase.co/auth/v1/callback` (and `http://127.0.0.1:54321/auth/v1/callback` for local)
3. In Supabase, go to **Authentication → Sign In / Providers → Google**, enable it, and paste the client ID and secret.
4. Local (optional): export `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID` and `SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET` (or put them in `supabase/.env`), set `enabled = true` under `[auth.external.google]` in `supabase/config.toml`, and restart Supabase.

UF Gatorlink mail is Microsoft 365, so most members will use a personal Google account or email + password. Either works; an admin approves every account.

### 4. Vercel

1. Import the repo. The framework preset is Vite, the build command is `npm run build`, and the output directory is `dist`.
2. Add the `VITE_*` variables above. Deploy, then add your custom domain.
3. `vercel.json` already handles the SPA fallback, service-worker caching headers, and security headers.

### 5. Anthropic API key (phase 2)

```bash
npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
```

It's read only inside Edge Functions. The browser never sees it.

### 6. Web Push VAPID keys (phase 5)

```bash
npx web-push generate-vapid-keys
npx supabase secrets set VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:exec@yourchapter.org
# Vercel: VITE_VAPID_PUBLIC_KEY=...
```

iOS delivers web push only to apps added to the Home Screen (iOS 16.4+). The app shows an *Add to Home Screen* walkthrough on the first visit, and it's always available on the **Me** tab.

## Hub apps: sharing one login

Every chapter app uses the **same Supabase project** (same URL and anon key), so there is one account per member.

1. Host the apps as subdomains of one domain you own, e.g. `calendar.yourchapter.org`, `dues.yourchapter.org`. Cookies can't be shared across `*.vercel.app`, so a custom domain is required.
2. In every app, set `VITE_AUTH_COOKIE_DOMAIN=.yourchapter.org`. This app keeps the session in cookies through `@supabase/ssr`'s `createBrowserClient` (see `src/lib/supabase.ts`). With a shared cookie domain, signing in once signs you in everywhere. New apps should create their client the same way.
3. Add `https://*.yourchapter.org/**` to **Authentication → URL Configuration → Redirect URLs**.
4. Give each app its own schema (e.g. `dues`), add it to *Exposed schemas*, and write RLS with the shared helpers:
   ```sql
   create policy dues_select on dues.payments for select to authenticated
     using (member_id = auth.uid() or (select public.is_admin()));
   ```
   Follow the grants and default privileges at the top of `supabase/migrations/*_calendar_events.sql`.
5. Auth emails (confirm, reset) always link to the Site URL (this app). That's fine because accounts are shared.
6. Phase 5 adds `public.hub_apps` and the header **Apps** menu that links the apps together.

## Testing phase 1

1. Run `npx supabase start`, `npm run dev`, and open http://localhost:5173 on your phone-sized browser window (or your phone via your LAN IP; email links will still say `localhost`).
2. **Sign-up and approval:** create an account. Confirm it from Mailpit (http://127.0.0.1:54324), and you'll land on *Waiting for approval*. Sign in as `president@example.com` in another browser, open **Admin → Pending**, and approve the account. Back in the first browser, tap **Check again**.
3. **Password reset:** use *Forgot password?*, open the email in Mailpit, set a new password, and sign in with it. Opening the same link a second time shows *expired*.
4. **Roles:**
   - `rush@example.com` can only create Rush events.
   - `brother1@example.com` can't create events but can RSVP.
   - `am1@example.com` never sees *Rush planning* or *Big/Little reveal prep*.
5. **Calendar:**
   - Switch between month and week view, swipe between months, and toggle categories.
   - Create a weekly repeating event, edit *this and following*, and delete one occurrence.
   - Check that required events have no RSVP buttons.
6. **Calendar sync:** **Me → Get my calendar link**, then open the URL; it downloads the member's .ics.
7. **Install:** on an iPhone, the first visit shows the Add to Home Screen steps.
