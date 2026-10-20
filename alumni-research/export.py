"""Write a copy of the roster with the research results added.

    python3 export.py              # -> data/output/roster_with_research.csv
    python3 export.py --promote    # also fill the team's blank job columns (PLAN 5.3)

Nothing the team already entered is changed. Results go into new "AI ..."
columns. Only VERIFIED rows get facts filled in; NEEDS REVIEW rows get the
lead and the reason it was not verified, so a person can check it.

--promote copies a VERIFIED job into the team's own columns only when every
one of those columns is blank, Research Status is blank or "Not Started", and
the job isn't flagged as possibly outdated. Run without it first: it prints
how many rows it would change, and the user approves that number.
"""
import argparse
import csv
import datetime as dt
import json

from careers import LEVEL_NAMES, classify
from common import JOB_COLUMNS, OUTPUT, TODAY, norm, read_roster

AI_COLUMNS = ["AI Status", "AI Job Title", "AI Employer", "AI Industry", "AI Previous Employers",
              "AI Years at Company", "AI City", "AI State", "AI LinkedIn", "AI Data As Of", "AI Evidence",
              "AI Why Not Verified", "AI Sources", "AI Degree Job", "AI Seniority", "AI Flags"]
FACT_KEYS = ["title", "employer", "industry", "previous_employers", "years_at_company", "city", "state", "linkedin", "as_of"]
PROMOTABLE = {"VERIFIED", "TEAM CONFIRMED"}


def parse_month(s):
    """'2024-03-15', '2024-03' or '2024' -> date, else None."""
    s = (s or "").strip()
    for fmt, n in (("%Y-%m-%d", 10), ("%Y-%m", 7), ("%Y", 4)):
        try:
            return dt.datetime.strptime(s[:n], fmt).date()
        except ValueError:
            pass
    return None


def outdated(facts):
    """VERIFIED proves identity, not that the job is current (PLAN Phase 0b)."""
    if not (facts.get("title") or facts.get("employer")):
        return False
    seen = parse_month(facts.get("as_of"))
    old = seen is not None and (TODAY - seen).days > 730
    return old or not facts.get("years_at_company")


def same_employer(a, b):
    a, b = norm(a), norm(b)
    return bool(a and b and (a in b or b in a))


def team_values(facts):
    """The AI facts in the formats the team uses (PLAN 5.3)."""
    start = parse_month((facts.get("years_at_company") or "").replace("since", ""))
    linkedin = facts.get("linkedin") or ""
    if linkedin and not linkedin.startswith("http"):
        linkedin = "https://www." + linkedin.removeprefix("www.")
    return {
        "Current Job Title": facts.get("title") or "",
        "Current Employer": facts.get("employer") or "",
        "Industry/Field": (facts.get("industry") or "").title(),
        "Any Previous Notable Employers": facts.get("previous_employers") or "",
        "Years at Current Company": str((TODAY - start).days // 365) if start else "",
        "Current City": facts.get("city") or "",
        "State": facts.get("state") or "",
        "LinkedIn Profile": linkedin,
    }


def promotable(row, r, facts):
    return (r["status"] in PROMOTABLE and not any(row[c].strip() for c in JOB_COLUMNS)
            and row["Research Status"].strip() in ("", "Not Started") and not outdated(facts))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--promote", action="store_true", help="fill the team's blank job columns (user-approved)")
    args = ap.parse_args()

    results = {}
    path = OUTPUT / "results.jsonl"
    if path.exists():
        results = {r["row"]: r for r in map(json.loads, open(path))}
    rows = read_roster()
    original = list(rows[0].keys())
    out = OUTPUT / "roster_with_research.csv"
    counts, would_promote, promoted = {}, 0, set()
    with open(out, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=original + AI_COLUMNS)
        w.writeheader()
        for i, row in enumerate(rows):
            row = dict(row)
            r = results.get(i + 2)
            extra = dict.fromkeys(AI_COLUMNS, "")
            if r and r["status"] != "NOT RESEARCHED":
                facts = r.get("facts") or {}
                lead = r["status"] == "NEEDS REVIEW"
                counts[r["status"]] = counts.get(r["status"], 0) + 1
                extra["AI Status"] = r["status"]
                for col, key in zip(AI_COLUMNS[1:10], FACT_KEYS):
                    val = facts.get(key, "")
                    extra[col] = f"(unverified) {val}" if lead and val else val
                flags = []
                if outdated(facts):
                    flags.append("possibly outdated")
                    extra["AI Data As Of"] = (extra["AI Data As Of"] + " (possibly outdated)").strip()
                if row["Current Employer"].strip() and facts.get("employer") \
                        and not same_employer(facts["employer"], row["Current Employer"]):
                    flags.append("differs from team")
                extra["AI Flags"] = "; ".join(flags)
                extra["AI Evidence"] = "; ".join(r.get("reasons", []))
                extra["AI Why Not Verified"] = "; ".join(r.get("why_not_verified", []))
                srcs = [s["url"] if isinstance(s, dict) else s for s in r.get("sources", [])]
                extra["AI Sources"] = " ".join(srcs)
                if facts.get("title"):
                    c = classify(facts["title"])
                    extra["AI Degree Job"] = {True: "yes", False: "no", None: "unclear"}[c["degree"]]
                    extra["AI Seniority"] = LEVEL_NAMES[c["level"]]
                if promotable(row, r, facts):
                    would_promote += 1
                    if args.promote:
                        row.update({k: v for k, v in team_values(facts).items() if v})
                        row["Research Status"] = "AI Verified"
                        promoted.add(i)
            w.writerow({**row, **extra})

    # PLAN 5.6: same rows, and every original value unchanged except promoted rows.
    check = read_roster_from(out)
    assert len(check) == len(rows), "row count changed"
    for i, (a, b) in enumerate(zip(rows, check)):
        cols = [c for c in original if i not in promoted or c not in JOB_COLUMNS + ["Research Status"]]
        assert all(a[c] == b[c] for c in cols), f"row {i + 2}: an original value changed"
    print(f"wrote {out} ({len(rows)} rows, original columns checked)")
    print("AI Status:", counts)
    if args.promote:
        print(f"filled the team's job columns on {len(promoted)} rows (Research Status = AI Verified)")
    else:
        print(f"{would_promote} VERIFIED rows could fill the team's blank job columns (--promote, with approval)")


def read_roster_from(path):
    with open(path, encoding="utf-8", newline="") as f:
        return list(csv.DictReader(f))


if __name__ == "__main__":
    main()
