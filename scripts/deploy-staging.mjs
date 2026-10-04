// Puts a STAGING copy of the app online: a Supabase project + a Vercel site, loaded with the
// fake demo members from supabase/seed.sql so every role can be tried. Safe to re-run.
//
//   npm run deploy:staging
//
// Needs SUPABASE_ACCESS_TOKEN and VERCEL_TOKEN (optional: VERCEL_TEAM_ID, SUPABASE_ORG_ID,
// DEMO_PASSWORD) and network access to api.supabase.com, *.supabase.co, api.vercel.com and
// *.vercel.app. Never point this at the production project: it creates demo accounts.
import { execFileSync } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const PROJECT_NAME = process.env.STAGING_PROJECT_NAME ?? 'chapter-hub-staging'
const SITE_NAME = process.env.STAGING_SITE_NAME ?? 'chapter-calendar-staging'
const REGION = 'us-east-1'

const need = (name) => {
  if (!process.env[name]) throw new Error(`Set ${name} first (see README "Deploy a test site").`)
  return process.env[name]
}
const sbToken = need('SUPABASE_ACCESS_TOKEN')
const vcToken = need('VERCEL_TOKEN')
const vcTeam = process.env.VERCEL_TEAM_ID ? `teamId=${process.env.VERCEL_TEAM_ID}` : ''

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const log = (msg) => console.log(`• ${msg}`)

async function call(url, token, method, body, headers = {}) {
  const isBytes = body instanceof Uint8Array
  const res = await fetch(url, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      ...(body !== undefined && !isBytes ? { 'content-type': 'application/json' } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : isBytes ? body : JSON.stringify(body),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`${method} ${url} -> ${res.status}: ${text.slice(0, 600)}`)
  try {
    return text ? JSON.parse(text) : null
  } catch {
    return text
  }
}
const sb = (method, path, body) => call(`https://api.supabase.com${path}`, sbToken, method, body)
const vc = (method, path, body, headers) =>
  call(`https://api.vercel.com${path}${vcTeam ? (path.includes('?') ? '&' : '?') + vcTeam : ''}`, vcToken, method, body, headers)
const sql = (ref, query) => sb('POST', `/v1/projects/${ref}/database/query`, { query })

async function ensureProject() {
  const projects = await sb('GET', '/v1/projects')
  let project = projects.find((p) => p.name === PROJECT_NAME)
  if (!project) {
    const orgs = await sb('GET', '/v1/organizations')
    const org = orgs.find((o) => o.id === process.env.SUPABASE_ORG_ID) ?? orgs[0]
    if (!org) throw new Error('No Supabase organization on this account.')
    log(`Creating Supabase project "${PROJECT_NAME}" (${REGION})`)
    project = await sb('POST', '/v1/projects', {
      name: PROJECT_NAME,
      organization_id: org.id,
      region: REGION,
      db_pass: randomBytes(24).toString('base64url'),
    })
  }
  const ref = project.ref ?? project.id
  for (let i = 0; i < 90; i++) {
    const p = await sb('GET', `/v1/projects/${ref}`)
    if (p.status === 'ACTIVE_HEALTHY') return ref
    // Free projects pause after a week without use.
    if (p.status === 'INACTIVE' && i === 0) await sb('POST', `/v1/projects/${ref}/restore`)
    if (i === 0) log(`Waiting for the database (status: ${p.status})…`)
    await sleep(10_000)
  }
  throw new Error('The Supabase project did not become healthy within 15 minutes.')
}

async function apiKeys(ref) {
  const keys = await sb('GET', `/v1/projects/${ref}/api-keys?reveal=true`)
  const pick = (...names) => keys.find((k) => names.includes(k.name) || names.includes(k.type))?.api_key
  const publicKey = pick('anon', 'publishable')
  const serviceKey = pick('service_role', 'secret')
  if (!publicKey || !serviceKey) throw new Error('Could not read the project API keys.')
  return { publicKey, serviceKey }
}

async function migrate(ref) {
  await sql(
    ref,
    `create schema if not exists supabase_migrations;
     create table if not exists supabase_migrations.schema_migrations (version text primary key, statements text[], name text);`,
  )
  const done = new Set((await sql(ref, 'select version from supabase_migrations.schema_migrations')).map((r) => r.version))
  for (const file of readdirSync('supabase/migrations').filter((f) => f.endsWith('.sql')).sort()) {
    const [version, ...name] = file.replace(/\.sql$/, '').split('_')
    if (done.has(version)) continue
    log(`Applying migration ${file}`)
    const body = readFileSync(join('supabase/migrations', file), 'utf8')
    await sql(
      ref,
      `begin;\n${body}\ninsert into supabase_migrations.schema_migrations (version, name) values ('${version}', '${name.join('_')}');\ncommit;`,
    )
  }
}

async function configureAuth(ref, siteUrl) {
  await sb('PATCH', `/v1/projects/${ref}/postgrest`, { db_schema: 'public,graphql_public,calendar' })
  const template = (f) => readFileSync(join('supabase/templates', f), 'utf8')
  await sb('PATCH', `/v1/projects/${ref}/config/auth`, {
    site_url: siteUrl,
    uri_allow_list: `${siteUrl}/**,http://localhost:5173/**`,
    external_email_enabled: true,
    mailer_autoconfirm: false,
    mailer_secure_email_change_enabled: true,
    password_min_length: 8,
    password_required_characters: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ:0123456789',
    mailer_subjects_confirmation: 'Confirm your email',
    mailer_templates_confirmation_content: template('confirmation.html'),
    mailer_subjects_recovery: 'Reset your password',
    mailer_templates_recovery_content: template('recovery.html'),
    mailer_subjects_email_change: 'Confirm your new email',
    mailer_templates_email_change_content: template('email_change.html'),
  })
}

const listFiles = (dir) =>
  readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? listFiles(join(dir, f)) : [join(dir, f)]))

async function deploySite(env) {
  log('Building the app')
  execFileSync('npm', ['run', 'build'], { stdio: 'inherit', env: { ...process.env, ...env } })
  // The site is uploaded pre-built, so drop the build settings from vercel.json.
  const config = JSON.parse(readFileSync('vercel.json', 'utf8'))
  for (const key of ['$schema', 'framework', 'buildCommand', 'outputDirectory', 'installCommand']) delete config[key]
  const files = [
    ...listFiles('dist').map((f) => ({ file: relative('dist', f), data: readFileSync(f) })),
    { file: 'vercel.json', data: Buffer.from(JSON.stringify(config)) },
  ]
  log(`Uploading ${files.length} files to Vercel`)
  for (const f of files) {
    f.sha = createHash('sha1').update(f.data).digest('hex')
    await vc('POST', '/v2/files', f.data, { 'content-type': 'application/octet-stream', 'x-vercel-digest': f.sha })
  }
  let d = await vc('POST', '/v13/deployments?skipAutoDetectionConfirmation=1', {
    name: SITE_NAME,
    target: 'production',
    files: files.map((f) => ({ file: f.file, sha: f.sha, size: f.data.length })),
    projectSettings: { framework: null, buildCommand: null, installCommand: null, outputDirectory: null, devCommand: null },
  })
  for (let i = 0; i < 60 && !['READY', 'ERROR', 'CANCELED'].includes(d.readyState); i++) {
    await sleep(5_000)
    d = await vc('GET', `/v13/deployments/${d.id}`)
  }
  if (d.readyState !== 'READY') throw new Error(`Vercel deployment ended as ${d.readyState}`)
  // A test site should open without a Vercel login wall.
  await vc('PATCH', `/v9/projects/${SITE_NAME}`, { ssoProtection: null }).catch((e) =>
    log(`Couldn't turn off Vercel deployment protection: ${e.message}`),
  )
  const host = (d.alias ?? []).find((a) => a.endsWith('.vercel.app')) ?? d.url
  return `https://${host}`
}

async function seedDemo(ref, serviceKey, password) {
  const base = `https://${ref}.supabase.co/auth/v1/admin/users`
  const headers = {
    apikey: serviceKey,
    'content-type': 'application/json',
    // Legacy keys are JWTs and also go in Authorization; new sb_secret_ keys must not.
    ...(serviceKey.startsWith('eyJ') ? { authorization: `Bearer ${serviceKey}` } : {}),
  }
  const seed = readFileSync('supabase/seed.sql', 'utf8')
  const people = JSON.parse(seed.match(/v_people jsonb := '(\[[\s\S]*?\])';/)[1].replaceAll("''", "'"))

  const existing = new Map()
  for (let page = 1; ; page++) {
    const res = await fetch(`${base}?page=${page}&per_page=200`, { headers })
    if (!res.ok) throw new Error(`Listing users failed: ${res.status} ${await res.text()}`)
    const { users } = await res.json()
    for (const u of users) existing.set(u.email?.toLowerCase(), u.id)
    if (users.length < 200) break
  }
  log(`Creating ${people.length} demo members`)
  for (const p of people) {
    const id = existing.get(p.email)
    const res = id
      ? await fetch(`${base}/${id}`, { method: 'PUT', headers, body: JSON.stringify({ password }) })
      : await fetch(base, {
          method: 'POST',
          headers,
          body: JSON.stringify({ email: p.email, password, email_confirm: true, user_metadata: { full_name: p.name } }),
        })
    if (!res.ok) throw new Error(`Demo member ${p.email}: ${res.status} ${await res.text()}`)
  }

  const json = JSON.stringify(people).replaceAll("'", "''")
  await sql(
    ref,
    `update public.members m set
       role = p.role::public.member_role,
       member_type = p.type::public.member_type,
       status = p.status::public.member_status,
       pledge_class = p.class,
       approved_at = case when p.status = 'approved' then coalesce(m.approved_at, now() - interval '200 days') end
     from jsonb_to_recordset('${json}'::jsonb) as p(email text, role text, type text, class text, status text)
     where lower(m.email) = lower(p.email);`,
  )
  const [{ count }] = await sql(ref, 'select count(*)::int as count from calendar.events')
  if (count === 0) {
    log('Adding sample events')
    await sql(ref, seed.slice(seed.indexOf('-- Sample events')))
  }
}

async function smokeTest(siteUrl, ref, publicKey, password) {
  const page = await fetch(siteUrl)
  if (!page.ok || !(await page.text()).includes('id="root"')) throw new Error(`Site check failed: ${page.status}`)
  const auth = await fetch(`https://${ref}.supabase.co/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: publicKey, 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'am1@example.com', password }),
  }).then((r) => r.json())
  if (!auth.access_token) throw new Error(`Demo sign-in failed: ${JSON.stringify(auth)}`)
  const events = await fetch(`https://${ref}.supabase.co/rest/v1/events?select=title,hidden_from_associates`, {
    headers: { apikey: publicKey, authorization: `Bearer ${auth.access_token}`, 'accept-profile': 'calendar' },
  }).then((r) => r.json())
  if (!Array.isArray(events) || events.length === 0) throw new Error(`Event check failed: ${JSON.stringify(events)}`)
  if (events.some((e) => e.hidden_from_associates)) throw new Error('RLS check failed: an associate can see hidden events')
}

const ref = await ensureProject()
const { publicKey, serviceKey } = await apiKeys(ref)
await migrate(ref)
const siteUrl = await deploySite({ VITE_SUPABASE_URL: `https://${ref}.supabase.co`, VITE_SUPABASE_ANON_KEY: publicKey })
await configureAuth(ref, siteUrl)
log('Deploying the Edge Functions')
// Feeds, cron jobs and the notification sender check their own credentials; the rest need a signed-in member.
for (const [name, ownAuth] of [
  ['ics-feed', true],
  ['sync-canvas', true],
  ['send-notifications', true],
  ['parse-schedule', false],
  ['import-calendar', false],
  ['submit-excuse', false],
]) {
  execFileSync('npx', ['supabase', 'functions', 'deploy', name, '--project-ref', ref, '--use-api', ...(ownAuth ? ['--no-verify-jwt'] : [])], {
    stdio: 'inherit',
  })
}
const password = process.env.DEMO_PASSWORD ?? `Gator-${randomBytes(3).toString('hex')}-${10 + (randomBytes(1)[0] % 90)}`
await seedDemo(ref, serviceKey, password)
await smokeTest(siteUrl, ref, publicKey, password)

console.log(`
Test site:        ${siteUrl}
Demo password:    ${password}   (every demo account below)
Admin:            president@example.com
Brother:          brother1@example.com
Pledge:           am1@example.com
Pending:          pending1@example.com
Supabase:         https://supabase.com/dashboard/project/${ref}
`)
