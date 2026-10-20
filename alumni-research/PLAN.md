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
| PDL credits this month | 64 of 100 free used (51 test + 13 Phase 0) |
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

## 3. Budget

| Step | People | Credits (est.) |
|---|---|---|
| Re-run the 100-person test on Pro | 100 | 50–60 |
| Ages 40–64 | 579 | 290–350 |
| Ages 23–39 | 301 | 140–180 |
| Ages 65+ | 516 | 230–300 |
| Under 23 and unknown age | 106 | skip (mostly students) |
| **Total** | | **~710–890** |

`required` job fields will lower the 65+ number somewhat. Month 1 ($98, 350
credits): test + most of 40–64. Month 2: buy exactly what's left (the script
reports remaining people), likely 350–550 credits ($98–154).

Expected outcome, people searched: verified ~25–35%, needs review ~25–30%
(of which ~85–90% are right), not found ~40%. Replace these with measured
numbers after Phase 3.

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
   - `--ages 40-64,23-39,65+` to order and filter the queue.
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

### Phase 3: Pro re-test (go/no-go)
1. Check the key works and the plan is Pro (one lookup on a test person; the
   response should include a location).
2. Move the 100 test evidence files aside (`data/evidence_free/`); re-run the
   pilot queue.
3. `score.py`, `evaluate.py`. Record: verified count, agreement with the team,
   email/phone match counts, credits used.
4. **Go** if: verified ≥ 25 of 100 **and** no VERIFIED result disagrees with
   the team for a reason other than a dated job change. Otherwise stop, report,
   and propose rule or input changes before spending more.
5. Report to the user before Phase 4.

### Phase 4: main run
1. `prepare.py todo`; run enrichment in age order 40–64, 23–39, 65+; skip under
   23 and unknown age.
2. Stop at the month's remaining credits. Report: people done, left, credits
   used, verified so far.
3. Next month: buy only what's needed, resume (the script skips people with
   evidence).

### Phase 5: score, export, and the sheet
Follow section 5.

### Phase 6: what PDL can't settle
1. **Needs review** → the team's review sheet (section 5.4). Most take under a
   minute with the lead and LinkedIn link.
2. **Not found, working age** → web research per the README's research
   protocol, highest value first (40–64, then 23–39). No LinkedIn automation:
   it violates LinkedIn's terms and gets accounts banned.
3. **Everyone without a verified answer** → alumni survey (draft below, sent by
   the chapter, not by Claude). Survey answers count as verified (self-reported).

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
- Include ages 65+ in the paid run, or leave them to the survey?
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
