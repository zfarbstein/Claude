# Alumni research

Fills in job info for the alumni roster without guessing. The research step
only **collects evidence**: every claim needs a URL and a quote read from the
page itself. A fixed rule set in `score.py` then decides who is **VERIFIED**.
Everyone else is **NEEDS REVIEW** (a lead plus the reason it wasn't verified)
or **NOT FOUND**. The rules are written so that a wrong match is far less
likely than a missed one.

## Pipeline

```
data/roster.csv                      the exported roster (never committed)
   │  prepare.py todo                skip >100 years old, already researched, duplicates
   ▼
data/queue.jsonl                     one line per person to research
   │  research (Claude, web search + reading pages; see "Research protocol")
   ▼
data/evidence/<row>.json             candidates + quoted, sourced evidence
   │  score.py                       fixed rules → VERIFIED / NEEDS REVIEW / NOT FOUND
   ▼
data/output/results.jsonl
   │  export.py
   ▼
data/output/roster_with_research.csv roster + "AI ..." columns; original columns untouched
```

`prepare.py pilot` instead builds a test batch mixing people the team already
researched (a blind answer key) with new ones; `evaluate.py` compares.

## Running with People Data Labs

Needs `PDL_API_KEY` in the environment's settings (a new session picks it up)
and the roster CSV uploaded to the session.

```
mkdir -p data && cp "<uploaded roster csv>" data/roster.csv
python3 prepare.py pilot --known 50 --new 50 --seed 11   # first time: test batch
python3 enrich_pdl.py --max-matches 100                   # free plan = 100 matches/month
python3 score.py && python3 evaluate.py && python3 export.py
```

For the full run, use `python3 prepare.py todo` instead of the pilot, and set
`--max-matches` to what the plan has left. PDL only charges for matches, and
people who already have an evidence file are skipped, so the run can be
resumed next month.

## When is someone VERIFIED?

All of:
1. Name matches: exact last name; first name is the legal name, informal name,
   or a standard nickname.
2. One identity proof:
   - the roster email or phone appears on the page, or the person is listed on
     the website of their roster work-email domain; **or**
   - People Data Labs matched the roster email/phone with high confidence
     **and** one more fact fits (UF, city, grad year or birth year); **or**
   - UF attendance **and** Delta Chi are shown; **or**
   - UF attendance **and two** of: lives/lived in the roster city, UF grad year
     fits the initiation year, birth year matches.
3. Nothing contradicts the roster (grad year, birth year, …).
4. No second plausible UF person with the same name turned up.
5. The job facts have a source URL.
6. Every quote was read from the page itself, not a search-engine summary.

`python3 -m unittest test_score` checks each rule.

## Research protocol (for whoever runs the research step)

Per person, search the name (quoted) with "University of Florida", with the
roster city, and with the informal first name. Don't put birthdays, street
addresses or phone numbers in search queries. Open promising pages and record
each candidate in `data/evidence/<row>.json`:

```json
{
  "row": 123,
  "searched": ["\"Jon Sample\" University of Florida"],
  "candidates": [{
    "name_on_source": "Jon A. Sample",
    "sources": [{"url": "https://…"}],
    "facts": {"title": "", "employer": "", "industry": "", "previous_employers": "",
              "years_at_company": "", "city": "", "state": "", "linkedin": "",
              "source_url": "https://…"},
    "anchors": {
      "uf_education":  {"url": "…", "quote": "verbatim text", "fetched": true},
      "delta_chi":     {"url": "…", "quote": "…", "fetched": true},
      "email_match":   {"url": "…", "quote": "…", "fetched": true},
      "phone_match":   {"url": "…", "quote": "…", "fetched": true},
      "employer_site": {"url": "…", "quote": "…", "fetched": true},
      "grad_year":     {"url": "…", "quote": "…", "year": 2002, "fetched": true},
      "birth_year":    {"url": "…", "quote": "…", "year": 1980, "fetched": true},
      "locations": [{"city": "Tampa", "state": "FL", "url": "…", "quote": "…", "fetched": true}]
    },
    "conflicts": ["anything that doesn't fit the roster"],
    "notes": ""
  }],
  "deceased": null
}
```

Record every same-name candidate you find, not just the best one; the
ambiguity rule depends on it. Leave out anchors you didn't find.

## Privacy

`data/` holds personal information and is git-ignored. Don't commit it or
paste it anywhere public.
