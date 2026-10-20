"""Decide, with fixed rules, whether each researched person is VERIFIED.

The research step only collects evidence (with a URL and a verbatim quote for
every claim). This script makes the call, so the bar for "verified" cannot
drift from person to person.

    python3 score.py            # writes data/output/results.jsonl

A candidate is VERIFIED only when ALL of these hold:
  1. The name on the source matches the roster (exact last name; first name is
     the legal name, informal name, or a standard nickname).
  2. It has an identity proof:
       a. the roster email or phone number appears on the source, or the
          person is named on the website of their roster work-email domain, OR
       a2. a data provider (People Data Labs) matched the roster email
          (likelihood 4+) or phone (7+), reports that it matched on that
          input, AND one more fact fits (UF, city, grad year or birth
          year), OR
       b. UF attendance is shown AND Delta Chi membership is shown, OR
       c. UF attendance is shown AND at least two of: lives/lived in the
          roster city, UF graduation year fits the initiation year, birth
          year matches the roster.
  3. Nothing contradicts the roster (graduation year, birth year, a different
     school only, etc.).
  4. No other candidate found for the same person also passes 1 and 2a/2b/2c
     at the UF level (two plausible UF people with that name = ambiguous).
  5. The job facts themselves come with a source URL.
  6. Every quote used above was read from the page itself (fetch.py saves a
     copy and the quote must appear in it word for word), not from a
     search-engine summary.

Anything else is NEEDS REVIEW (a lead with its evidence) or NOT FOUND.
"""
import json
import re
from urllib.parse import urlparse

from common import EVIDENCE, OUTPUT, QUEUE, name_matches, same_city
from fetch import quote_on_page


LOOKUP_MIN = {"email": 4, "phone": 7}


def has(anchor):
    """An anchor counts only if it carries a URL and a verbatim quote that was
    read from the page itself. Search-engine summaries can be wrong, so quotes
    taken only from a summary ("fetched": false) never count toward VERIFIED."""
    return bool(anchor and anchor.get("url") and anchor.get("quote") and anchor.get("fetched")
                and quote_on_page(anchor["url"], anchor["quote"]))


def domain_of(url):
    return re.sub(r"^www\.", "", urlparse(url).netloc.lower())


def grad_year_fits(person, year):
    # Initiation is normally freshman/sophomore year; allow transfers and
    # grad school (law, med, masters) up to 8 years after initiation.
    return person["init_year"] is not None and person["init_year"] - 1 <= year <= person["init_year"] + 8


def assess(person, cand):
    a = cand.get("anchors", {})
    reasons, problems = [], []

    if not name_matches(person, cand.get("name_on_source", "")):
        problems.append(f"name on source '{cand.get('name_on_source')}' does not match roster")

    email = has(a.get("email_match")) and person["email"] and person["email"] in a["email_match"]["quote"].lower()
    phone = has(a.get("phone_match")) and person["phone"] and person["phone"] in "".join(
        ch for ch in a["phone_match"]["quote"] if ch.isdigit())
    work_domain = person["work_email_domain"]
    domain = has(a.get("employer_site")) and work_domain and (
        domain_of(a["employer_site"]["url"]) == work_domain
        or domain_of(a["employer_site"]["url"]).endswith("." + work_domain))
    uf = has(a.get("uf_education"))
    dchi = has(a.get("delta_chi"))

    loc = False
    for place in a.get("locations", []):
        if has(place) and same_city(person, place.get("city", ""), place.get("state", "")):
            loc = True
    grad = None
    if has(a.get("grad_year")):
        grad = grad_year_fits(person, int(a["grad_year"]["year"]))
        if not grad:
            problems.append(f"UF graduation year {a['grad_year']['year']} does not fit initiation {person['init_year']}")
    birth = None
    if has(a.get("birth_year")):
        birth = person["birth_year"] is not None and abs(int(a["birth_year"]["year"]) - person["birth_year"]) <= 1
        if not birth:
            problems.append(f"birth year {a['birth_year']['year']} does not match roster")

    for c in cand.get("conflicts", []):
        problems.append(f"conflict: {c}")

    if email:
        reasons.append("roster email appears on source")
    if phone:
        reasons.append("roster phone appears on source")
    if domain:
        reasons.append(f"named on {work_domain}, the domain of the roster email")
    if uf:
        reasons.append("UF attendance shown")
    if dchi:
        reasons.append("Delta Chi shown")
    if loc:
        reasons.append(f"lives/lived in roster city ({person['city']}, {person['state']})")
    if grad:
        reasons.append(f"UF grad year {a['grad_year']['year']} fits initiation {person['init_year']}")
    if birth:
        reasons.append("birth year matches")

    unread = [k for k, v in a.items() if isinstance(v, dict) and v.get("quote") and not v.get("fetched")]
    unread += ["location" for p in a.get("locations", []) if p.get("quote") and not p.get("fetched")]
    if unread:
        reasons.append("seen only in search summaries, not confirmed on the page: " + ", ".join(unread))

    supporting = sum([loc, bool(grad), bool(birth)])
    # A data-provider record found by looking up the roster email/phone. The
    # provider can merge profiles wrongly, so it also needs one fact that fits.
    # PDL scores a correct email-only match 4-6; a recycled phone number
    # scored 4, so phone needs 7.
    lm = a.get("lookup_match") or {}
    lookup = (has(lm) and lm.get("by") in LOOKUP_MIN and lm["by"] in (lm.get("matched") or [])
              and (lm.get("likelihood") or 0) >= LOOKUP_MIN[lm["by"]] and (uf or supporting >= 1))
    if lookup:
        reasons.append(f"data provider matched the roster {a['lookup_match']['by']}")
    identity = email or phone or domain or lookup or (uf and dchi) or (uf and supporting >= 2)
    # For the ambiguity check any UF claim counts, even an unconfirmed one:
    # a second UF person with the same name should block verification.
    uf_level = identity or bool(a.get("uf_education"))
    return identity, uf_level, reasons, problems


def facts_sourced(cand):
    f = cand.get("facts", {})
    return bool((f.get("title") or f.get("employer")) and f.get("source_url"))


def decide(person, ev):
    if ev is None:
        return {"status": "NOT RESEARCHED"}
    cands = []
    for c in ev.get("candidates", []):
        identity, uf_level, reasons, problems = assess(person, c)
        cands.append({"cand": c, "identity": identity, "uf_level": uf_level,
                      "reasons": reasons, "problems": problems})

    passing = [c for c in cands if c["identity"] and not c["problems"]]
    plausible = [c for c in cands if c["uf_level"]]

    if len(passing) == 1 and len(plausible) == 1 and facts_sourced(passing[0]["cand"]):
        c = passing[0]
        return {"status": "VERIFIED", "facts": c["cand"]["facts"], "reasons": c["reasons"],
                "sources": c["cand"].get("sources", [])}

    if ev.get("deceased") and has(ev["deceased"]) and ev["deceased"].get("dob_exact_match"):
        return {"status": "VERIFIED DECEASED", "reasons": ["obituary birth date matches roster exactly"],
                "sources": [ev["deceased"]["url"]], "facts": {}}

    if cands:
        best = max(cands, key=lambda c: (c["identity"], c["uf_level"], len(c["reasons"]) - len(c["problems"])))
        why = []
        if len(plausible) > 1:
            why.append(f"{len(plausible)} different plausible people found")
        if not best["identity"]:
            why.append("not enough independent proof it is the same person")
        if best["problems"]:
            why += best["problems"]
        if best["identity"] and not facts_sourced(best["cand"]):
            why.append("identity confirmed but no sourced current job")
        return {"status": "NEEDS REVIEW", "facts": best["cand"].get("facts", {}),
                "reasons": best["reasons"], "why_not_verified": why,
                "sources": best["cand"].get("sources", []),
                "deceased_lead": ev.get("deceased")}

    return {"status": "NOT FOUND", "searched": ev.get("searched", []),
            "deceased_lead": ev.get("deceased")}


def main():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    counts = {}
    with open(OUTPUT / "results.jsonl", "w") as out:
        for line in open(QUEUE):
            person = json.loads(line)
            path = EVIDENCE / f"{person['row']}.json"
            ev = json.load(open(path)) if path.exists() else None
            result = {"row": person["row"], "name": f"{person['first']} {person['last']}", **decide(person, ev)}
            counts[result["status"]] = counts.get(result["status"], 0) + 1
            out.write(json.dumps(result) + "\n")
    print(counts)


if __name__ == "__main__":
    main()
