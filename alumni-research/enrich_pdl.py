"""Look people up in People Data Labs and turn each match into evidence.

    PDL_API_KEY=... python3 enrich_pdl.py [--max-matches 100] [--max-age 64] [--contact email] [--dry-run]

For each person in data/queue.jsonl without an evidence file:
  1. look up by roster email (strongest: the match is tied to that address),
  2. else by roster phone,
  3. else by name + "University of Florida", trying the informal and legal
     first name with the roster city, the roster state, and no location.
PDL only charges for matches. --max-matches stops before the plan runs out.
This is for members contacting alumni about jobs, so by default PDL only
returns (and charges for) people with a current job title and employer.
People the team hasn't tried yet ("Not Started") go first: under 65, 71% of
their credits verified someone, vs. 0-50% for people the team marked "Unable
to Find" / "Unable to Verify" or left blank. Then roster email, phone only,
name only, and younger before older (fewer retirees with no current job).

PDL scores a correct email-only match 4-6 out of 10, so each kind of lookup
has its own minimum (MIN_LIKELIHOOD). A wrong phone match (recycled number)
scored 4, so phone needs 7. Responses are cached in data/pdl_cache/ so the
same query is never paid for twice, and every paid match is logged in
data/pdl_ledger.jsonl.

PDL is a database, not a web page, so each response is saved as plain text
under a "pdl:" pseudo-URL in data/pages/. Evidence quotes are lines of that
text, and score.py checks them against it like any other page.
"""
import argparse
import datetime as dt
import hashlib
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

from common import DATA, EVIDENCE, QUEUE
from fetch import PAGES, page_path

API = "https://api.peopledatalabs.com/v5/person/enrich"
# PDL's 1-10 confidence, per kind of lookup (see the docstring).
MIN_LIKELIHOOD = {"email": 4, "phone": 7, "name": 8}
CACHE = DATA / "pdl_cache"
LEDGER = DATA / "pdl_ledger.jsonl"


def cache_path(params):
    return CACHE / (hashlib.sha256(json.dumps(params, sort_keys=True).encode()).hexdigest()[:16] + ".json")


def cached_lookup(key, by, params, required=None):
    """Return the response (or None for no match) and whether it cost a credit.

    A cached 404 asked at a lower minimum is also a 404 at a higher one, and a
    cached match below the current minimum counts as no match."""
    min_l = MIN_LIKELIHOOD[by]
    query = {**params, **({"required": required} if required else {})}
    path = cache_path(query)
    if path.exists():
        c = json.load(open(path))
        if c["min_likelihood"] <= min_l:
            resp = c["response"]
            return (resp if resp and (resp.get("likelihood") or 0) >= min_l else None), False
    resp = lookup(key, query, min_l)
    CACHE.mkdir(parents=True, exist_ok=True)
    json.dump({"min_likelihood": min_l, "response": resp}, open(path, "w"))
    return resp, resp is not None


def lookup(key, params, min_likelihood, tries=6):
    q = urllib.parse.urlencode({**params, "min_likelihood": min_likelihood, "titlecase": "true",
                                "include_if_matched": "true"})
    req = urllib.request.Request(f"{API}?{q}", headers={"X-Api-Key": key, "Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return None  # no match, not charged
        if e.code == 429 and tries > 1:  # free plan allows only a few calls a minute
            time.sleep(int(e.headers.get("Retry-After") or 60))
            return lookup(key, params, min_likelihood, tries - 1)
        body = e.read().decode(errors="replace")[:300]
        raise SystemExit(f"PDL error {e.code}: {body}")
    except (urllib.error.URLError, ConnectionError, TimeoutError):
        if tries <= 1:  # e.g. connection reset during the handshake: nothing was sent
            raise
        time.sleep(2 ** (7 - tries))
        return lookup(key, params, min_likelihood, tries - 1)


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
    matched = resp.get("matched") or []
    matched_line = "matched on: " + ", ".join(matched)
    lines = page_lines(d)
    PAGES.mkdir(parents=True, exist_ok=True)
    page_path(url).write_text(f"URL: {url}\nlikelihood: {resp.get('likelihood')}\n{matched_line}\n\n"
                              + "\n".join(lines))

    def anchor(line, **extra):
        return {"url": url, "quote": line, "fetched": True, **extra}

    anchors = {"locations": []}
    if by in ("email", "phone"):
        anchors["lookup_match"] = anchor(matched_line, by=by, likelihood=resp.get("likelihood"), matched=matched)
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
    # Name + UF is what reaches likelihood 8; name + location alone rarely
    # scores above 4. Roster addresses can be old, so also try without the city.
    firsts = list(dict.fromkeys(n for n in (p["informal"], p["first"]) if n))
    places = [f"{p['city']}, {p['state']}" if p["city"] else None, p["state"] or None, None]
    for place in dict.fromkeys(places):
        for first in firsts:
            params = {"first_name": first, "last_name": p["last"], "school": "University of Florida"}
            if place:
                params["location"] = place
            yield "name", params


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--max-matches", type=int, default=100)
    ap.add_argument("--min-age", type=int, help="only people at least this old (unknown age is left out)")
    ap.add_argument("--max-age", type=int, help="only people at most this old (unknown age is left out)")
    ap.add_argument("--contact", choices=["email", "phone", "name"],
                    help="only people with a roster email / only a phone / neither")
    ap.add_argument("--required", default="job_title AND job_company_name",
                    help='PDL "required" fields; matches without them are not returned or charged ("" for none)')
    ap.add_argument("--dry-run", action="store_true", help="show the lookups without calling PDL")
    args = ap.parse_args()
    # The environment setting was first saved as DL_API_KEY; accept both.
    key = os.environ.get("PDL_API_KEY") or os.environ.get("DL_API_KEY")
    if not key and not args.dry_run:
        raise SystemExit("PDL_API_KEY is not set (add it in the environment settings, then start a new session)")

    people = [json.loads(line) for line in open(QUEUE)]
    if args.min_age is not None:
        people = [p for p in people if p["age"] is not None and p["age"] >= args.min_age]
    if args.max_age is not None:
        people = [p for p in people if p["age"] is not None and p["age"] <= args.max_age]
    group = lambda p: "email" if p["email"] else "phone" if len(p["phone"]) == 10 else "name"
    people.sort(key=lambda p: (p.get("research_status", "Not Started") != "Not Started",
                               ["email", "phone", "name"].index(group(p)), p["age"] or 0))
    if args.contact:
        people = [p for p in people if group(p) == args.contact]

    EVIDENCE.mkdir(parents=True, exist_ok=True)
    month = dt.date.today().strftime("%Y-%m")
    if LEDGER.exists():
        used = sum(1 for e in map(json.loads, open(LEDGER)) if e["date"].startswith(month))
        print(f"{used} PDL matches already logged this month")
    matches = 0
    for p in people:
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
            resp, charged = cached_lookup(key, by, params, args.required)
            if charged:
                matches += 1
                with open(LEDGER, "a") as f:
                    f.write(json.dumps({"date": dt.date.today().isoformat(), "row": p["row"], "by": by}) + "\n")
            if resp:
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
