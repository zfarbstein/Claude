# Chapter Calendar

Mobile-first PWA for chapter events, availability, and attendance. It's the first app on a shared chapter hub: one Supabase project handles identity for every hub app.

**Stack:** React 19, Vite, TypeScript, Tailwind CSS 4 · Supabase (Postgres + RLS, Auth, Storage, Edge Functions, Realtime) · Vercel · Resend (email) · Claude API (schedule parsing, server-side only) · Web Push (VAPID)

## Build phases

| Phase | Scope | Status |
| --- | --- | --- |
| 1 | Auth (Google + email/password, password reset, approval), admin / brother / pledge views, calendar grid, events, RSVPs, .ics feed | **Done** |
| 2 | Schedule wizard, AI parsing, Canvas/ICS sync, semesters | **Done** |
| 3 | Availability heatmap, night toggles, Members tab | **Done** |
| 4 | Attendance (rotating QR + roster), excuse form | **Done** |
| 5 | Notifications, admin panel, Excel export, hub Apps menu | **Done** |

## Demo inside Claude (no accounts needed)

`npm run build:demo` builds the real app with Supabase swapped for an in-browser stand-in (`src/demo`) and packs it into one HTML page. That page is published as a private claude.ai Artifact for testing each phase before anything is deployed.

The demo includes:
- the sample members and events
- a **Demo** button for switching accounts and resetting the data
- an inbox that catches the emails the app sends (sign-up, password reset, excuse alerts, notification emails)
- a stand-in for the 5-minute notification job, so scheduled notifications and reminders arrive while the demo is open

Phone push notifications and the camera scanner can't run inside Claude's preview; there, notifications show under the bell and check-in uses the 6-digit code.

The stand-in follows the same permission rules as the RLS policies. The real rules are tested against Postgres by `npm run test:db`. `npm run test:demo` smoke-tests the demo build.

## Architecture

```
public.members          shared roster (id, name, email, role, member_type, pledge_class, status, active)
public.is_member()      helpers any hub app can use in RLS:
public.is_brother()       approved + active (+ brother / admin)
public.is_admin()
public.admin_update_member(...)   the only way to change role / type / status / active

public.hub_apps         apps in the chapter hub (header "Apps" menu in every app)

calendar.*              this app's tables: settings, categories, event_series, events, rsvps,
                        feed_tokens, semesters, schedule_submissions, weekly_blocks,
                        dated_items, schedule_uploads, night_marks, attendance,
                        checkin_secrets, excuses, push_subscriptions, notifications,
                        notification_inbox
```

- **Three views:** admin (exec), brother, pledge. Stored as `role` (`admin | member`) plus `member_type` (`brother | associate`); pledges are always `member`. Only admins create, edit and delete chapter events.
- **Schedules (phase 2):** `calendar.semesters`, `schedule_submissions`, `weekly_blocks` (classes, weekly obligations), `dated_items` (exams block availability, deadlines don't), `schedule_uploads` (originals + parser output for admin review, files in the private `schedule-uploads` bucket). Members only write through `calendar.save_schedule_step()`, after confirming the parsed list. The calendar stays locked until all three steps are saved for the current semester.
- **Availability (phase 3):** a member's *night* (default 7–11 PM, set in **Admin → Settings**) is *busy* if they marked it unavailable or anything on their schedule overlaps it (classes, weekly obligations, exams, one-off obligations; deadlines never count), *unknown* if they haven't finished this semester's schedule, otherwise *free*. Brothers and admins see the heatmap (`calendar.night_summary`); admins also see names and reasons (`night_detail`). Pledges see only their own nights. Nobody can mark themselves out of a night with a required chapter event; the app links to the excuse form instead.
- **Members tab (phase 3):** brothers and admins only. `calendar.member_schedule()` returns a member's weekly grid and busy items: full details for the member and admins, busy times only for other brothers.
- **Attendance (phase 4):** each event has a secret; the check-in code is HMAC-SHA256(secret, 30-second window), shown as a QR code (`/attendance/<event>/code`) that links to `/checkin?e=…&c=…`. The current and previous code work, only from 15 minutes before the start until the end, and 8 wrong codes lock a member out for 10 minutes. Admins mark anyone Present/Absent/Excused on the roster. The dashboard counts required events (and any event where attendance was taken); no record means absent, excused doesn't count against anyone, and members who joined later aren't counted.
- **Excuses (phase 4):** for required events, from now until 7 days after. Optional proof goes to the private `excuse-attachments` bucket. `submit-excuse` saves it as the member and emails the secretary; approving marks the member Excused and notifies them.
- **Notifications (phase 5):** every notification is a row in `calendar.notifications`. `send-notifications` (pg_cron every 5 minutes, or immediately when an admin sends one) queues due reminders (24 h and 1 h before required events and events members RSVP'd going/maybe to, skipping approved excuses; the weekly "mark your nights" reminder), writes each recipient's in-app inbox row (the bell), sends Web Push (RFC 8291/8292 in `_shared/webpush.ts`, no dependencies), and emails members it couldn't push to. 1-hour and weekly reminders are push-only, to keep email volume low.
- **Edge Functions:** `parse-schedule` (Claude reads typed text and photos), `import-calendar` (Canvas feed, .ics file or link), `sync-canvas` (daily, via pg_cron + pg_net), `ics-feed`, `submit-excuse`, `send-notifications`.
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
| brother1@example.com … brother9@example.com (+ social@, philanthropy@, rush@) | Brother |
| am1@example.com … am5@example.com | Pledge |
| brother2@, brother9@, am5@ | Haven't set up their schedule yet (see the setup wizard) |
| pending1@example.com, pending2@example.com | Pending approval |

Local email (confirmations, resets, excuse alerts, notification emails) goes to Mailpit at http://127.0.0.1:54324, not to real inboxes.

Use `localhost:5173`, not `127.0.0.1:5173`. Email links point at `site_url` (`http://localhost:5173`), and the session cookie belongs to that origin.

After changing SQL, regenerate types with `npm run db:types`.

## Tests

| Command | What it covers |
| --- | --- |
| `npm test` | Unit tests: chapter-time date math (DST, overnight events), event form validation, permissions, .ics output and parsing (Canvas UTC times, exam keywords), AI result clean-up, category contrast (WCAG AA), heatmap colors, attendance %, check-in QR parsing, the six-sheet Excel export, Web Push encryption and VAPID signatures, email escaping |
| `npm run test:db` | pgTAP: RLS for every role (pending, pledge, brother, admin, inactive), privilege escalation, RSVP rules, recurrence, feeds, schedule saving, Canvas sync, upload folders, night statuses and marks (required nights refused), member directory privacy, check-in codes and windows (wrong-code lockout), roster and attendance report, excuses and reviews, reminders (24 h / 1 h / weekly, dedupe, excused and hidden-event recipients), inbox privacy, hub apps |
| `npm run test:e2e` | Playwright (mobile Chrome) against local Supabase + Mailpit: full password reset (request → email → link on a fresh device → new password → sign in; single-use link), sign-up → confirm → pending → approval → schedule setup, the three-step wizard, event creation and pledge visibility, RSVPs, marking nights and the admin night breakdown, the members tab, QR and typed-code check-in, the roster, excuse with proof → secretary email → approval → notification, sending a notification (inbox + email fallback), the Excel download, hub apps, settings |
| `npm run check:functions` | Type-checks the Edge Functions with Deno |

`npm run test:e2e` needs `npx supabase start` running. Set `E2E_PROD=1` to test the production build (with service worker) instead of the dev server. CI (`.github/workflows/ci.yml`) runs all three on every push.

## Environment variables

| Variable | Where | Notes |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | Vercel, `.env.local` | Project URL |
| `VITE_SUPABASE_ANON_KEY` | Vercel, `.env.local` | Anon / publishable key. Safe in the browser; RLS protects data |
| `VITE_APP_NAME` | Vercel (optional) | Shown in the header, title, and install name |
| `VITE_AUTH_COOKIE_DOMAIN` | Vercel (optional) | e.g. `.yourchapter.org`, to share the login across hub subdomains |
| `ANTHROPIC_API_KEY` | Supabase secrets only | Phase 2. Never put it in Vercel or any `VITE_` variable |
| `VITE_VAPID_PUBLIC_KEY` | Vercel | Web Push public key (`npm run vapid`) |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | Supabase secrets | Web Push signing. Keep the private key secret |
| `RESEND_API_KEY` / `EMAIL_FROM` / `APP_URL` | Supabase secrets | Excuse alerts and notification emails (auth emails use SMTP, below). `APP_URL` is the site, for links |
| `CRON_SECRET` | Supabase secrets | Shared with Vault so pg_cron can call `sync-canvas` and `send-notifications` |
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

### 5. Anthropic API key (schedule reading)

```bash
npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
npx supabase functions deploy parse-schedule import-calendar
```

It's read only inside the `parse-schedule` Edge Function; the browser never sees it. Each member can run at most 25 readings a day. Locally, put `ANTHROPIC_API_KEY=...` in `supabase/functions/.env` (gitignored) and restart Supabase; without it, the app asks members to type their schedule into the list instead.

### 6. Daily Canvas sync

```bash
npx supabase secrets set CRON_SECRET=<long random string>
npx supabase functions deploy sync-canvas --no-verify-jwt
```

Then, in the SQL editor:

```sql
select vault.create_secret('https://<ref>.supabase.co', 'project_url');
select vault.create_secret('<the same CRON_SECRET>', 'cron_secret');
```

The `sync-canvas-feeds` pg_cron job (created by the schedules migration) runs every morning and updates each member's exams and deadlines from their saved Canvas feed. It keeps the member's exam/deadline choices and removals, and records failures in `schedule_submissions.canvas_sync_error`.

### 7. Excuses and notifications (phases 4–5)

```bash
npm run vapid    # prints a new VAPID key pair
npx supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:exec@yourchapter.org
npx supabase secrets set RESEND_API_KEY=re_... EMAIL_FROM="Chapter Calendar <calendar@yourchapter.org>" APP_URL=https://calendar.yourchapter.org
npx supabase functions deploy submit-excuse
npx supabase functions deploy send-notifications --no-verify-jwt
# Vercel: VITE_VAPID_PUBLIC_KEY=<the same public key>, then redeploy
```

- The `send-notifications` pg_cron job (every 5 minutes) uses the same Vault secrets as the Canvas sync (step 6).
- Set the secretary's email in **Admin → Settings**; every new excuse is emailed there.
- iOS delivers web push only to apps added to the Home Screen (iOS 16.4+). **Me → Notifications** walks iPhone users through it.
- Members without push get the important notifications by email (announcements, schedule reminders, excuse decisions, 24-hour event reminders). Turn this off in **Admin → Settings** if you're near Resend's sending limits.

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
6. List the apps in **Admin → Apps** (`public.hub_apps`). Every app shows them in its header **Apps** menu (it appears once there are two or more); other hub apps should read the same table. Update the *Calendar* row's link to its full URL once it has a domain.

## Manual test checklist

Locally (`npx supabase start`, `npm run dev`, http://localhost:5173) or in the Claude demo. Seed passwords are `Password123`; local email is in Mailpit (http://127.0.0.1:54324).

1. **Accounts:** sign up, confirm the email, approve the account as `president@example.com` (**Admin → Members**), reset a password.
2. **Calendar:** month/week views, category filter, repeating events, RSVPs; `am1@` never sees *Rush planning*.
3. **Schedule:** sign in as `brother2@` and finish the three setup steps.
4. **Availability:** **Calendar → Availability** as `brother1@`: tap a night, mark it unavailable with a reason; tap a Sunday (chapter meeting) and follow *Request an excuse*. As an admin, the same night lists who's busy and why.
5. **Members:** as a brother, open a member: weekly grid, busy times, nights (no class names). As an admin, the same page shows details.
6. **Attendance:** as an admin, open an event happening now → **Check-in code**. As another member, scan it (or type the code under it on **Check in**). The admin roster updates; mark others Present/Absent/Excused. **Admin → Attendance** shows the dashboard.
7. **Excuses:** submit one with a photo; the secretary gets an email; approve it in **Admin → Excuses**; the member is marked Excused and notified.
8. **Notifications:** **Me → Notifications** to turn on push (production build, installed app on iPhone). **Admin → Notify** to send now or schedule; the bell shows it. **Admin → Schedules** to remind members who haven't submitted.
9. **Admin:** settings (night hours, secretary email, colors, excuse rules, reminders), **Export** (.xlsx with six sheets), **Apps**.
