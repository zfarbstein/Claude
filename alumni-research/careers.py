"""Decide whether a job title is a "good career": one that usually needs a
college degree. Uses the U.S. Department of Labor's O*NET database (CC BY 4.0),
which rates every occupation in a "job zone" from 1 (little or no preparation)
to 5 (graduate degree); zone 4 means a bachelor's degree is usually needed.

    python3 careers.py "Senior Mechanical Engineer" "Bartender" ...
    python3 careers.py --results          # classify data/output/results.jsonl

The O*NET files are downloaded into data/onet/ on first use.

Used to skip work on jobs that don't need a degree: no web research to confirm
them, no team review, and they sort last in the contact list.
"""
import argparse
import json
import re
import urllib.request

from common import DATA, OUTPUT

ONET = DATA / "onet"
ONET_URL = "https://www.onetcenter.org/dl_files/database/db_30_0_text/"
FILES = ["Job Zones.txt", "Occupation Data.txt", "Alternate Titles.txt", "Sample of Reported Titles.txt"]
DEGREE_ZONE = 4

# Words that change seniority, not the occupation; dropped before matching.
MODIFIERS = {"senior", "sr", "junior", "jr", "lead", "principal", "staff", "chief", "head", "associate",
             "assistant", "deputy", "executive", "global", "regional", "national", "area", "district",
             "acting", "interim", "i", "ii", "iii", "iv", "1", "2", "3"}
# Titles O*NET doesn't phrase the way LinkedIn does.
SENIORITY = [  # (level, pattern), first match wins
    (4, r"\b(vp|svp|evp|avp|vice president|managing director)\b"),
    # "Chief Process Engineer", "Chief Pilot": senior specialists, not C-level.
    (1, r"\bch(ie|ei)f\b(?!.*\bofficer\b).*\b(engineer|pilot|resident|technician|scientist|architect)\b"),
    (5, r"\b(managing member|general counsel|judge|justice|congressman|congresswoman|senator|mayor)\b"
        r"(?<!associate general counsel)(?<!assistant general counsel)(?<!deputy general counsel)"),
    (5, r"\b(founder|co-?founder|owner|ceo|cfo|coo|cto|cio|cmo|chief|cheif|president|shareholder|proprietor)\b"
        r"|(^|\b(managing|senior|founding|equity|tax|audit|general|name|named) )partner\b"
        r"(?! (manager|success|relations|development|programs?|marketing|enablement|account))"),
    (3, r"\b(director|head of)\b"),
    (2, r"\b(manager|supervisor|lead)\b"),
    (1, r"\b(senior|sr|principal)\b"),
]
LEVEL_NAMES = {5: "owner/partner/C-level", 4: "VP", 3: "director", 2: "manager", 1: "senior", 0: ""}


def words(s):
    return re.sub(r"[^a-z0-9 ]+", " ", s.lower().replace("&", " and ")).split()


def load():
    ONET.mkdir(parents=True, exist_ok=True)
    for name in FILES:
        path = ONET / name
        if not path.exists():
            urllib.request.urlretrieve(ONET_URL + name.replace(" ", "%20"), path)
    zone = {}
    for line in open(ONET / "Job Zones.txt", encoding="utf-8").read().splitlines()[1:]:
        code, z = line.split("\t")[:2]
        zone[code] = int(z)
    titles = {}  # normalized title -> set of zones
    for name, col in (("Occupation Data.txt", 1), ("Alternate Titles.txt", 1), ("Sample of Reported Titles.txt", 1)):
        for line in open(ONET / name, encoding="utf-8").read().splitlines()[1:]:
            parts = line.split("\t")
            if parts[0] in zone:
                titles.setdefault(" ".join(words(parts[col])), set()).add(zone[parts[0]])
    return titles


_TITLES = None


def classify(title):
    """Return {"zone": 1-5 or None, "degree": bool or None, "level": 0-5, "matched": str}.

    "degree" is False only when we're confident: the O*NET title covers most of
    the job title and it isn't a manager-level role. Anything unclear is None,
    and None is treated as worth keeping."""
    global _TITLES
    if _TITLES is None:
        _TITLES = load()
    t = " ".join(words(title or ""))
    level = next((lvl for lvl, pat in SENIORITY if re.search(pat, t)), 0)
    if not t:
        return {"zone": None, "degree": None, "level": level, "matched": ""}
    core = " ".join(w for w in t.split() if w not in MODIFIERS)
    best = None
    for cand in (t, core):
        if cand in _TITLES:
            best = cand
            break
    if not best:
        # Longest O*NET title that appears as whole words inside this title.
        for n in range(min(6, len(core.split())), 0, -1):
            ws = core.split()
            grams = [" ".join(ws[i:i + n]) for i in range(len(ws) - n + 1)]
            hits = [g for g in grams if g in _TITLES]
            if hits:
                best = max(hits, key=lambda g: max(_TITLES[g]))
                break
    zone = round(sum(sorted(_TITLES[best])) / len(_TITLES[best])) if best else None
    if level >= 3:  # director and up: O*NET puts these managers at zone 4-5
        zone = max(zone or 0, DEGREE_ZONE)
    degree = None if zone is None else zone >= DEGREE_ZONE
    covers = best and len(best.split()) >= 0.6 * len(core.split() or t.split())
    if degree is False and (level >= 2 or not covers):
        degree = None
    return {"zone": zone, "degree": degree, "level": level, "matched": best or ""}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("titles", nargs="*")
    ap.add_argument("--results", action="store_true", help="classify data/output/results.jsonl")
    args = ap.parse_args()
    titles = args.titles
    if args.results:
        titles = [json.loads(l).get("facts", {}).get("title", "") for l in open(OUTPUT / "results.jsonl")]
        titles = [t for t in titles if t]
    for t in titles:
        c = classify(t)
        verdict = {True: "degree", False: "no degree", None: "unknown"}[c["degree"]]
        print(f"{verdict:9}  zone {c['zone'] or '-'}  {LEVEL_NAMES[c['level']]:22}  {t}  [{c['matched']}]")


if __name__ == "__main__":
    main()
