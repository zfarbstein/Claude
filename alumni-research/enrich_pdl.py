"""Look people up in People Data Labs and turn each match into evidence.

    PDL_API_KEY=... python3 enrich_pdl.py [--max-matches 100] [--dry-run]

For each person in data/queue.jsonl without an evidence file:
  1. look up by roster email (strongest: the match is tied to that address),
  2. else by roster phone,
  3. else by name + "University of Florida" + roster city/state.
PDL only charges for matches. --max-matches stops before the plan runs out.

PDL is a database, not a web page, so each response is saved as plain text
under a "pdl:" pseudo-URL in data/pages/. Evidence quotes are lines of that
text, and score.py checks them against it like any other page.
"""
import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

from common import EVIDENCE, QUEUE
from fetch import PAGES, page_path

API = "https://api.peopledatalabs.com/v5/person/enrich"
MIN_LIKELIHOOD = 8  # PDL's 1-10 confidence; 8+ is its "high confidence" band


def lookup(key, params, tries=6):
    q = urllib.parse.urlencode({**params, "min_likelihood": MIN_LIKELIHOOD, "titlecase": "true"})
    req = urllib.request.Request(f"{API}?{q}", headers={"X-Api-Key": key, "Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return None  # no match, not charged
        if e.code == 429 and tries > 1:  # free plan allows only a few calls a minute
            time.sleep(int(e.headers.get("Retry-After") or 60))
            return lookup(key, params, tries - 1)
        body = e.read().decode(errors="replace")[:300]
        raise SystemExit(f"PDL error {e.code}: {body}")


def year(date):
    return int(date[:4]) if date and date[:4].isdigit() else None


def page_lines(d):
    """Flatten the fields we use into 'label: value' lines."""
    lines = [f"name: {d.get('full_name') or ''}",
             f"job title: {d.get('job_title') or ''}",
             f"job company: {d.get('job_company_name') or ''}",
             f"job start: {d.get('job_start_date') or ''}",
             f"job last verified: {d.get('job_last_verified') or d.get('job_last_changed') or ''}",
             f"industry: {d.get('job_company_industry') or d.get('industry') or ''}",
             f"location: {d.get('location_locality') or ''}, {d.get('location_region') or ''}",
             f"linkedin: {d.get('linkedin_url') or ''}",
             f"birth year: {d.get('birth_year') or ''}"]
    for name in d.get("location_names") or []:
        lines.append(f"past location: {name}")
    for e in d.get("education") or []:
        school = (e.get("school") or {}).get("name") or ""
        lines.append(f"education: {school} | {e.get('start_date') or ''} - {e.get('end_date') or ''}")
    for x in d.get("experience") or []:
        company = (x.get("company") or {}).get("name") or ""
        title = (x.get("title") or {}).get("name") or ""
        lines.append(f"experience: {title} at {company} | {x.get('start_date') or ''} - {x.get('end_date') or 'present'}")
    return lines


def unmask(v):
    """The free plan sends `true` for fields it withholds; treat those as missing."""
    if isinstance(v, bool):
        return None
    if isinstance(v, dict):
        return {k: unmask(x) for k, x in v.items()}
    if isinstance(v, list):
        return [unmask(x) for x in v]
    return v


def evidence_from(person, resp, by):
    d = unmask(resp["data"])
    url = f"pdl:{person['row']}:{by}"
    lines = page_lines(d)
    PAGES.mkdir(parents=True, exist_ok=True)
    page_path(url).write_text(f"URL: {url}\nlikelihood: {resp.get('likelihood')}\n\n" + "\n".join(lines))

    def anchor(line, **extra):
        return {"url": url, "quote": line, "fetched": True, **extra}

    anchors = {"locations": []}
    if by in ("email", "phone"):
        anchors["lookup_match"] = anchor(lines[0], by=by, likelihood=resp.get("likelihood"))
    for line, e in zip([l for l in lines if l.startswith("education: ")], d.get("education") or []):
        school = ((e.get("school") or {}).get("name") or "").lower()
        if "university of florida" in school and "central" not in school and "south" not in school \
                and "north" not in school and "international" not in school and "gulf coast" not in school:
            anchors.setdefault("uf_education", anchor(line))
            end = year(e.get("end_date"))
            if end and "grad_year" not in anchors:
                anchors["grad_year"] = anchor(line, year=end)
    if d.get("birth_year"):
        anchors["birth_year"] = anchor(f"birth year: {d['birth_year']}", year=d["birth_year"])
    if d.get("location_locality"):
        line = f"location: {d.get('location_locality') or ''}, {d.get('location_region') or ''}"
        anchors["locations"].append(anchor(line, city=d["location_locality"], state=d.get("location_region") or ""))
    for name in d.get("location_names") or []:
        parts = [p.strip() for p in name.split(",")]
        if len(parts) >= 2:
            anchors["locations"].append(anchor(f"past location: {name}", city=parts[0], state=parts[1]))

    current = (d.get("job_company_name") or "").lower()
    previous = []
    for x in d.get("experience") or []:
        name = (x.get("company") or {}).get("name") or ""
        if name and name.lower() != current and name not in previous:
            previous.append(name)
    start = d.get("job_start_date") or ""
    return {
        "name_on_source": d.get("full_name") or "",
        "sources": [{"url": url}] + ([{"url": "https://" + d["linkedin_url"]}] if d.get("linkedin_url") else []),
        "facts": {
            "title": d.get("job_title") or "",
            "employer": d.get("job_company_name") or "",
            "industry": d.get("job_company_industry") or d.get("industry") or "",
            "previous_employers": ", ".join(previous[:3]),
            "years_at_company": f"since {start}" if start else "",
            "city": d.get("location_locality") or "",
            "state": d.get("location_region") or "",
            "linkedin": d.get("linkedin_url") or "",
            "as_of": d.get("job_last_verified") or d.get("job_last_changed") or "",
            "source_url": url,
        },
        "anchors": anchors,
        "conflicts": [],
        "notes": f"People Data Labs match by {by}, likelihood {resp.get('likelihood')}",
    }


def queries(p):
    if p["email"]:
        yield "email", {"email": p["email"]}
    if p["phone"] and len(p["phone"]) == 10:
        yield "phone", {"phone": "+1" + p["phone"]}
    params = {"first_name": p["informal"] or p["first"], "last_name": p["last"], "school": "University of Florida"}
    if p["city"]:
        params["location"] = f"{p['city']}, {p['state']}"
    yield "name", params


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--max-matches", type=int, default=100)
    ap.add_argument("--dry-run", action="store_true", help="show the lookups without calling PDL")
    args = ap.parse_args()
    key = os.environ.get("PDL_API_KEY")
    if not key and not args.dry_run:
        raise SystemExit("PDL_API_KEY is not set (add it in the environment settings, then start a new session)")

    EVIDENCE.mkdir(parents=True, exist_ok=True)
    matches = 0
    for line in open(QUEUE):
        p = json.loads(line)
        out = EVIDENCE / f"{p['row']}.json"
        if out.exists():
            continue
        if matches >= args.max_matches:
            print(f"stopping: reached {args.max_matches} matches")
            break
        searched, candidate = [], None
        for by, params in queries(p):
            searched.append(f"PDL enrich by {by}")
            if args.dry_run:
                continue
            resp = lookup(key, params)
            if resp:
                matches += 1
                candidate = evidence_from(p, resp, by)
                break
        if args.dry_run:
            print(p["row"], searched)
            continue
        json.dump({"row": p["row"], "searched": searched,
                   "candidates": [candidate] if candidate else [], "deceased": None},
                  open(out, "w"), indent=1)
        print(f"row {p['row']}: {'match by ' + searched[-1].split()[-1] if candidate else 'no match'}")
        sys.stdout.flush()
    print(f"{matches} PDL matches used")


if __name__ == "__main__":
    main()
