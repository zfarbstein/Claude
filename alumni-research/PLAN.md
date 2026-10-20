# Plan: full roster run on People Data Labs Pro

Written 2026-10-20, after the free-plan test. This is the working protocol for
whoever (Claude or a person) runs the next sessions. Follow it in order. It
holds no personal data; numbers only.

**Goal.** Help members find jobs through alumni, so the useful output is
*current, correct* employer and title for working-age alumni. Accuracy beats
coverage: a wrong employer sends someone to the wrong person.

---

## 1. Where things stand

| | |
|---|---|
| Roster | 1,853 rows, 10 exact duplicates |
| Skipped in a full run | 221 already researched, 54 already have job info, 16 over 100 |
| Full-run queue | 1,552 people; 50 already have evidence from the test, so **1,502 left** |
| Free-plan test (100 people) | 0 verified, 50 needs review, 50 not found |
| Test leads vs the team's answers | 19 agree, 2 disagree (both look like recent job changes), 6 no employer |
| PDL credits this month | 100 of 100 free used (51 test, 13 Phase 0, 36 Phase 0b) |
| Known setup bug | Environment variable is named `DL_API_KEY`; scripts read `PDL_API_KEY` |

Why nothing verified: on the free plan all 50 matches came from name lookups
(0 of 53 email and 0 of 68 phone lookups matched), and no match included a
location (birth year only 5 of 50). Of the 50 matches, 43 show UF and 34 show
UF plus a grad year that fits. Those 34 are one fact short of VERIFIED, and
the missing fact (city or birth year) is what the free plan withholds.

Match rate by age in the test was flat: 23–39 45%, 40–64 53%, 65+ 53%.

## 2. Research findings (checked 2026-10-20)

Each claim from the planning conversation, checked against PDL's docs and
pricing pages.

**2.1 Free plan hides contact and address data. Confirmed.**
PDL's pricing page: "Free plan: emails, phone, & address data is obfuscated.
Unlock with Pro." Third-party reviews say withheld fields come back as
`true`/`false` (matches what we saw, and is why the script now strips them).

**2.2 Email and phone lookups. Settled by Phase 0: they work on the free plan;
our threshold was discarding them.**
PDL documents that `email`, `phone` (must be `+1…`) and `email_hash` each work
as a lookup on their own. The 0-of-121 in the test was our own setting:
`enrich_pdl.py` asks for likelihood ≥ 8, and PDL scores an email-only or
phone-only match 4–7 even when it's right. See "Phase 0 results" below.
Inputs available among the 1,502 left: 645 emails, 990 phones, **1,071 with at
least one**. Email mix: 267 gmail, ~180 older providers (aol, bellsouth,
comcast, msn, hotmail), 48 `ufl.edu` (student addresses, mostly dead, but PDL
keeps historical emails so they can still match).

**2.3 Misses are free. Confirmed.**
PDL charges per match (HTTP 200). No match returns 404 and isn't billed. Bulk
enrichment bills each 200 "as though you made each request individually."

**2.4 Only paying for people with a current job. Confirmed, Pro only.**
The `required` parameter makes PDL return (and bill) only records that have the
listed fields, e.g. `required=job_title AND job_company_name`. Limits: fields
must be available under the key's plan (so not on free), and a field used as an
input can't also be required. It can't tell whether the job is still current,
so retirees with a stale listed job still cost a credit.

**2.5 More name versions find more people. Partly wrong; corrected.**
PDL's docs: name + location alone "will rarely return a likelihood score above
4"; name alone scores 2–5. We require 8. Our 8–9 matches came from name **+
school** (+ city). So:
- Dropping the school is pointless; it will never reach 8.
- Dropping the city (name + UF only) is free to try and may help people whose
  roster address is old. Expect a modest gain, not a large one.
- Legal vs informal first name: PDL doesn't document nickname handling. Try
  both; misses are free.
- State-only location (e.g. "Florida") is another free variant.
- `birth_date` is a documented PDL input and would raise confidence, but it
  sends date of birth to a vendor. **User decision; default off.**
- `include_if_matched=true` returns which inputs PDL matched on. Use it: it
  turns "PDL matched the email" into direct evidence.

**2.6 65 people list a work email that names their employer. Overstated;
corrected.**
64 roster emails are on non-generic domains, but about 15 are old internet
providers (e.g. `netzero.com`, `swbell.net`, `peoplepc.com`, regional `rr.com`
subdomains) and a few are schools. About 45 look like real employers, and the
address may be years old. Treat as a lead and a strong lookup input, not an
answer. Add the ISP domains to `GENERIC_EMAIL_DOMAINS`.

**2.7 Rate limits.** Docs say free = 100 calls/min, paid = 1,000/min (we were
throttled sooner on free; the script now waits and retries). The Bulk API
takes 100 people per call. Speed isn't a constraint on Pro.

**2.8 Alumni survey response.** No fraternity-specific benchmark found.
University alumni surveys: NC State 17–19%; an email-only law alumni survey 3%;
MBA alumni 20–61% of valid emails. Reminders help. Plan on **10–20%**, i.e.
roughly 100–200 of the people left after PDL.

**2.9 The queue includes the team's hardest cases.** Research Status among
roster rows: 181 "Unable to Find", 51 "Unable to Verify", 113 "Unc", 19
"Partial". These are in the queue because they aren't "Complete". Expect lower
match rates there. (Ask the team what "Unc" means.)

## 3. Scope and budget

**Scope (decided by the user, 2026-10-20):**
- Only **Alumnus** member status (`prepare.py` skips the 99 others).
- Only people **with a current job listed**: every lookup sends
  `required=job_title AND job_company_name` (the default), so PDL neither
  returns nor charges for anyone without one.
- **Under 65** (`--max-age 64`), on **one $98 month** (350 credits). 65+ only
  if credits are left or the user decides later.
- Order within the run: roster email first, then phone only, then name only
  (the script does this), so a short budget cuts the lowest-value lookups.

Projection, alumni aged 22–64 not yet looked up (894, incl. 21 test people to
redo on Pro; the 20 already verified/reviewed in Phase 0b aren't repeated):

| Group | People | Charged (has a job) | Credits | Cost | Verified | Needs review w/ job | Team confirms (est.) | No match / no job (free) |
|---|---|---|---|---|---|---|---|---|
| Email | 381 | ~45% | ~171 | ~$48 | ~114 (30%) | ~57 | ~43 (75%) | ~210 |
| Phone only | 214 | ~30% | ~64 | ~$18 | ~43 (20%) | ~21 | ~13 (60%) | ~150 |
| Name only | 299 | ~40% | ~120 | ~$34 | ~45 (15%) | ~75 | ~52 (70%) | ~179 |
| **Total** | **894** | | **~355** | **~$99** | **~202** | **~153** | **~108** | **~539** |

- **~310 contactable alumni** (202 verified + ~108 confirmed in review), about
  **$0.32 each**.
- 350 credits is right at the estimate. If match rates run 25% high (~445
  credits), the money runs out partway through the name-only group, leaving
  roughly 90–100 of those people. Finish them next month, or raise the
  plan's credits (~$0.28 each).
- Not in this run: 65+ (519 alumni: 164 / 220 / 135) ≈ 170 credits for ~97
  verified + ~48 confirmed; unknown age (16) ≈ 6 credits.
- Rates: email from the Phase 0b re-run (24 people the team hadn't
  researched); phone-only and name-only extrapolated. "Team confirms" counts a
  relative sharing the email/phone as wrong.

### Earlier estimate (all 1,502, before the scope decisions)

The fixed settings match more people (0.84 credits per person with an email,
vs. 0.5 before), so the run costs more but verifies far more. Of the 1,502
left, 645 have an email, about 430 more have only a phone, and about 430 have
neither (name-only; these need Pro's location data to verify).

| Step | People | Credits (est.) |
|---|---|---|
| Ages 40–64 | 579 | 400–490 |
| Ages 23–39 | 301 | 200–250 |
| Ages 65+ | 516 | 330–430 |
| Under 23 and unknown age | 106 | skip (mostly students) |
| **Total** | | **~930–1,170 (~$260–330)** |

No separate Pro re-test is needed: Phase 0b measured the email/phone path.
Spot-check a few name-only matches on Pro for location data instead.
`--required "job_title AND job_company_name"` lowers the count (people without
a listed job aren't charged); use it for 65+ at least.
Month 1 ($98, 350 credits): ages 40–64 with email or phone first. Month 2 on:
buy what's left; the ledger shows usage.

Projected outcome for the 1,502 left, by contact info (2026-10-20). Rates use
the test people the team had **not** researched (the pool the rest come
from); the team's researched people verified far more often (18 of 27 vs. 6
of 24) and would overstate it. Email rates are measured on 24 people; phone-only
and neither are extrapolated until Phase 3 measures them.

| Segment | People | Verified | Needs review | Not found |
|---|---|---|---|---|
| Email, age 23+ | 553 | ~30% (166) | ~45% (249) | ~25% (138) |
| Email, under 23 (students) | 92 | ~10% (9) | ~40% (37) | ~50% (46) |
| Phone only (53% are 65+) | 426 | ~20% (85) | ~25% (107) | ~55% (234) |
| Neither (name only; Pro needed) | 431 | ~15% (65) | ~40% (172) | ~45% (194) |
| **Total** | **1,502** | **~325 (22%)** | **~565 (38%)** | **~610 (41%)** |

Needs review is mixed. In the re-run, 6 of 19 were a **relative** sharing the
roster email or phone (spouse or parent: different first name), 9 the right
person with no job listed, 4 the right person with a job. Projected for the
~565: ~195 (35%) become a confirmed job after team review, ~190 are the right
person with no job info, ~180 are a relative or wrong person. Relatives are
rejected by the name rule but still cost a credit.

Net: ~520 usable answers (~35% of the 1,502), plus the ~275 the team already
has. Range for verified: ~280–400.

## 4. Phases

### Phase 0: done 2026-10-20 (13 free credits; 36 left this month)
Test people PDL had already matched by name, with a roster email and a
LinkedIn on the match; looked up again with `min_likelihood=2` and
`include_if_matched=true`. Raw responses in `data/phase0/` (not in git).

| Lookup | Tried | Returned | Same person as the name match | Likelihood |
|---|---|---|---|---|
| Email only | 8 | 7 | **7 of 7** | 4–6 |
| Phone only | 5 | 4 | 2 of 4 | right ones 7, wrong ones 4 |
| LinkedIn URL (control) | 2 | 2 | 2 of 2 | 9 |

- Every email match was the right person, and PDL's `matched` field confirmed
  it matched on the email. All 7 also show UF, which with an email match
  satisfies rule 2: **all 7 would be VERIFIED on the free plan** once the
  threshold is fixed. 6 of 7 have an employer.
- The two phone matches at likelihood 4 were different people (different last
  name, no UF): recycled numbers. The scoring's exact-last-name rule would
  reject them, but they still cost credits.
- Caveat: these 8 were people PDL already knew, so 7 of 8 overstates the hit
  rate for emails in general.

Consequences, folded into Phase 1:
- Email lookups use `min_likelihood=4`, and count as proof only when PDL's
  `matched` includes `email`.
- Phone lookups use `min_likelihood=7` (misses are free; wrong people aren't).
- `score.py` rule 2: replace the flat "likelihood ≥ 8" with the above.
- The free plan can verify people by email. Pro is still worth it for speed
  (100 vs. ~1,000+ matches a month) and for location, which name-only matches
  need as their second fact.

### Phase 0b: free re-run with the fixes (done 2026-10-20)
Code changes from Phase 1 items 1–3 are in (per-input minimums,
`include_if_matched`, name variants, age limits, `--required`, response cache,
credit ledger, ISP domains, scoring rule + tests). Re-ran the 53 test people
who have a roster email, with the last 36 free credits (Phase 0's 7 email
matches came from the cache at no cost). 51 got through before credits ran
out. Free-plan evidence from the first test is kept in `data/evidence_free_v1/`.

| | Free test, old settings (100) | Re-run, people with email (51) |
|---|---|---|
| Verified | 0 | **24 (47%)** |
| Needs review | 50 | 19 |
| Not found | 50 | 8 |
| Matches by email / phone / name | 0 / 0 / 50 | 29 / 11 / 3 |
| Credits per person | 0.5 | 0.84 |

- All 24 verified came from an email (18) or phone (6) match plus UF.
- Of the 18 verified people the team had researched, **none is a different
  person**. 14 have the team's employer. 4 differ on the job only: 2 where
  PDL's job is newer (records checked Aug–Sep 2026; one started Feb 2026), 1
  where PDL shows an old job with no start date, 1 with a junk job field
  (a school name as the title, data from 2022).
- Lesson: VERIFIED proves identity, not that the job is current. `export.py`
  must flag a job with no start date or data older than 2 years (section 5.2),
  and team review should look at those first.
- 0 free credits left this month (ledger: 100).

### Phase 1: code changes, before subscribing (no credits)
1. `enrich_pdl.py`
   - Lookup order per person: email → phone → (first name variants × location
     variants) where name variants = informal, legal, and location variants =
     roster city, roster state, none; always with `school=University of Florida`.
     Stop at the first match.
   - `--required "job_title AND job_company_name"` flag, on by default for the
     full run.
   - `include_if_matched=true`; store the matched inputs in evidence and the
     saved page text, so `score.py` can use "email matched" as proof.
   - Per-input thresholds from Phase 0: email 4, phone 7, name 8.
   - `--max-age` / `--min-age` to run under 65 first.
   - `--budget N` that counts matches across runs (read existing evidence), so
     a resumed run can't overspend.
   - Read `PDL_API_KEY`, falling back to `DL_API_KEY`, until the setting is
     renamed.
   - Optional: Bulk API (100 per call).
2. `common.py`: add the old ISP domains to `GENERIC_EMAIL_DOMAINS`.
3. `score.py`: accept a PDL email match (likelihood ≥ 4) or phone match
   (≥ 7) as the identity proof in rule 2 only when `matched` lists that input;
   still needs one more fact. Unit tests for both, and for a phone match at 4
   being rejected.
4. Before paying: spend this month's remaining free credits re-running the
   test people who have an email, with the fixed settings, and re-score. This
   gives a free, measured verified rate.
5. `export.py`: changes in section 5.
6. `review.py` (new): builds the review sheet and merges decisions back
   (section 5).
7. Unit tests pass; dry run (`--dry-run`) on the pilot queue shows the lookup
   order without calling PDL.

### Phase 2: user subscribes
User buys Pro at 350 credits/month and renames the environment variable to
`PDL_API_KEY`, then starts a new session. No action until both are done.

### Phase 3: Pro check (small)
Phase 0b already passed the go/no-go (24 of 51 verified, no wrong person).
1. Check the key works and the plan is Pro: one lookup on a test person; the
   response should include a location and contact fields, and a test with
   `required` should return 404 for someone with no job.
2. No separate re-test: the 21 test people under 65 still to redo are in the
   main run, and the email-first order measures each path as it goes.
3. After the email group (~170 credits), report verified counts to the user
   and compare with the projection before continuing.

### Phase 4: main run
1. `prepare.py todo` (alumni only); `enrich_pdl.py --max-age 64 --max-matches
   <credits left>`. The job-required filter and email → phone → name order are
   on by default. 65+ (`--min-age 65`) and unknown age only if the user says.
2. Stop at the month's remaining credits. Report: people done, left, credits
   used, verified so far.
3. Next month: buy only what's needed, resume (the script skips people with
   evidence).

### Phase 5: score, export, and the sheet
Follow section 5.

### Phase 6: everyone PDL didn't place (no match, or no job listed)
Because lookups require a listed job, PDL people without one come back as "no
match" for free; they land here with everyone PDL doesn't have. Nobody is
dropped: every alumnus under 65 without a verified job goes through 6a and 6b.
Goal is **good careers**, so effort and output rank by career value (6d).

**6a. Professional registries (free, automatic, official).** For every person
left: NPI registry (doctors, dentists, other health providers; API), FINRA
BrokerCheck (brokers and advisors, current firm; API), Florida Bar directory
(lawyers; shows law school and admission year), Florida DBPR license lookup
(CPAs, engineers, architects, real estate brokers, contractors). These are
good careers by definition. A hit counts only with an exact name match, a
single matching record, and the roster state or city; otherwise it's a lead.
A Florida Bar record showing UF law plus a fitting admission year can verify
under rule 2c; the others are usually needs-review leads. Build as
`registries.py`, writing evidence in the same format.

**6b. Web research by Claude**, per the README protocol, for people 6a didn't
place. Pilot 2026-10-20 on 6 alumni under 65 that PDL couldn't place (5
distinctive names, 1 common):
- 4 of 6 got a plausible job lead (a federal agency research director with a
  UF engineering degree; a VP of strategic sourcing in the roster city; a
  clinic executive director in the roster city; a possible attorney, weak).
  The common name and one other found nothing.
- **0 of 6 verified.** The pages that tie the person to UF are LinkedIn
  (can't be fetched or automated) or search summaries (don't count); the
  fetchable pages (company org charts, agency bios) give job and city only.
- The first plain search found nothing for all 6; the second, with city and
  role words, found the 4. Budget 2–4 searches and up to 3 page fetches per
  person.
- So 6b produces **needs-review leads with links** for the team, not
  verifications, unless a company or agency bio mentions UF.
- Scale: ~540 people under 65. Several sessions; could be parallelized with
  subagents if the user opts in.

**6c. Team review + survey.** Leads from PDL, 6a and 6b go to the review
sheet (5.4); the team opens the LinkedIn link and marks correct or wrong. The
survey (section 9) covers the rest; self-reported answers count as verified.

**6d. Career value.** Store PDL's `job_title_levels` (owner, partner, cxo,
vp, director, manager, senior, …), company and industry; for registry and web
leads, derive the level from the title and license. Add an `AI Seniority`
column; sort the review sheet and the final contact list by it (partner /
owner / C-level / VP / director / licensed professional first). Web research
goes in age order 35–64, then 22–34 (established careers first). A lead whose
job is clearly entry-level or unrelated to a career path is recorded and not
researched further. The user defines "good career" precisely (section 8).

---

## 5. Sheet protocol: how results get into the roster

### 5.1 Rules that never bend
- The original export is never edited. Output is a **copy**:
  `data/output/roster_with_research.csv`.
- A value the team entered is never changed or cleared. Not job columns,
  Research Status, Additional Info, contact info, nothing.
- Nothing personal is committed to git or put anywhere public. The sheet goes
  only where the user says (they upload it, or Claude uses the user's Google
  Drive connector if they ask).
- Every filled value is traceable to a source URL (or `pdl:` record) in
  `AI Sources`, with the data date in `AI Data As Of`.
- Deceased: never inferred. A death notice is flagged in `AI Why Not Verified`
  for a person to confirm.

### 5.2 The AI columns (always written)
Appended after the team's columns, one row per roster row, regenerated from
`results.jsonl` every run:

| Status | AI fact columns | AI Why Not Verified |
|---|---|---|
| VERIFIED | filled | blank |
| NEEDS REVIEW | filled, each prefixed `(unverified)` | the reason |
| NOT FOUND | blank | "no confident match" |
| not searched | blank (AI Status blank) | blank |

Additions to `export.py`:
- `AI Status` gains `TEAM CONFIRMED` / `TEAM REJECTED` from review decisions
  (5.4).
- Flag `possibly outdated` in `AI Data As Of` when the data is over 2 years old.
- Flag `differs from team` when the team has an employer and the AI one doesn't
  match (the team's value stays; this only marks it for a look).

### 5.3 Filling the team's columns (only with user approval)
The team's own columns (Current Job Title, Current Employer, Industry/Field,
Any Previous Notable Employers, Years at Current Company, Current City, State,
LinkedIn Profile) are filled only when **all** hold:
1. AI Status is VERIFIED or TEAM CONFIRMED;
2. every one of those team columns is blank for that row;
3. Research Status is blank or "Not Started";
4. the user has approved promotion in the current session, after seeing the
   count of rows it would change.

Then, in the team's formats:
- Years at Current Company: whole years from the start date (e.g. `3`).
- State: full name (`Florida`), as most team rows use.
- LinkedIn Profile: full `https://www.linkedin.com/in/...` URL.
- Industry/Field: PDL's industry, title-cased.
- Research Status: `AI Verified` (a new value so the team can filter and spot
  check). Additional Info: untouched.

Anything else stays in the AI columns only.

### 5.4 Team review loop
1. `review.py build` writes `data/output/review.csv`: one row per NEEDS REVIEW
   person, highest value first (age 40–64, then 23–39, then 65+), with roster
   row, name, roster city, the lead (title, employer, city, as-of), why not
   verified, LinkedIn link (or a LinkedIn search link), and a blank
   **Decision** column (`correct` / `wrong` / `unsure`) plus **Notes**.
2. The team fills Decision, looking at profiles by hand.
3. User uploads the filled file; it's saved as `data/review_decisions.csv`.
4. `review.py merge`: `correct` → TEAM CONFIRMED (eligible for 5.3), `wrong` →
   TEAM REJECTED (facts cleared from AI columns), `unsure` → unchanged. Re-run
   `export.py`.
5. Decisions persist across re-runs; a later PDL run never overrides a team
   decision.

### 5.5 Survey answers
Survey responses come back as a CSV; each is matched to a roster row by email
(then name + initiation year, with a person checking ties). They fill the AI
columns with `AI Status = SELF-REPORTED` and are eligible for 5.3.

### 5.6 Checks before handing over a sheet
- Row count equals the roster's; every original column is byte-for-byte
  unchanged (script compares).
- Counts by AI Status match `score.py`'s summary.
- Spot-check 10 random VERIFIED rows by opening their sources.
- Tell the user what changed since the last sheet.

---

## 6. Session-start checklist
1. `git pull`; read this file and the README.
2. Upload the latest roster export to `data/roster.csv` (data/ isn't in git).
   If continuing a run, the user must also re-upload `data/evidence/` and
   `data/output/` or they're gone: the container doesn't keep them. Ask for a
   zip at the end of each session (see 7).
3. `echo ${PDL_API_KEY:+set}`; `python3 -m unittest test_score`.
4. Find the phase you're in from the last report; don't redo spent credits.

## 7. End-of-session checklist
1. Report: phase, credits used and left, counts by status, anything that needs
   a decision.
2. Package `data/evidence/`, `data/output/`, `data/review_decisions.csv` into a
   zip in the scratchpad and hand it to the user (it's personal data; never
   commit it). Without it, the next session pays again for the same lookups.
3. Commit and push code changes only.

## 8. Decisions waiting on the user
- Send date of birth to PDL as a lookup input? (default no)
- What counts as a "good career" for the contact list: a minimum level
  (e.g. manager and up, or any licensed professional), industries to
  favor, and whether to keep everyone but sorted, or drop the rest?
- Run web research (6b) with parallel subagents (faster, uses more of the
  plan's usage), or one session at a time?
- Allow filling the team's columns (5.3) at all, or AI columns only?
- Who sends the survey, and from what address?
- What does Research Status "Unc" mean?

## 9. Survey draft (for the chapter to send)
Subject: Delta Chi UF alumni network: help current members find jobs

> We're building an alumni network so undergrads and young alumni can reach
> brothers in their field. Two minutes: where are you working now?
> [form link]

Form fields: name, initiation year, current employer, title, industry, city and
state, LinkedIn URL, "OK to be contacted by members about careers?" (yes/no).
Send twice, a week apart.

## Sources
- PDL pricing: https://www.peopledatalabs.com/pricing/person
- PDL self-serve pricing tiers: https://support.peopledatalabs.com/hc/en-us/articles/25794271805211-Pricing
- PDL pricing overview (charged per match): https://support.peopledatalabs.com/hc/en-us/articles/23553812020891-Pricing-Overview
- Person Enrichment reference (inputs, likelihood, rate limits, billing): https://docs.peopledatalabs.com/docs/reference-person-enrichment-api
- Input parameters (`required`, `include_if_matched`): https://docs.peopledatalabs.com/docs/input-parameters-person-enrichment-api
- Bulk enrichment: https://docs.peopledatalabs.com/docs/bulk-enrichment-api
- Free plan masking (third party): https://pipeline.zoominfo.com/sales/people-data-labs-features
- Alumni survey response rates: https://report.isa.ncsu.edu/Survey/Alumni/2018/alum18.intro.pdf,
  https://www.cwu.edu/about/offices/institutional-effectiveness/_documents/law-and-justice-2015-alumni-survey.pdf,
  https://www.gmac.com/-/media/files/gmac/research/measuring-program-roi/methodologymbaalumniperspectivessurveys.pdf
