"""Write a copy of the roster with the research results added.

    python3 export.py          # -> data/output/roster_with_research.csv

Nothing the team already entered is changed. Results go into new "AI ..."
columns. Only VERIFIED rows get facts filled in; NEEDS REVIEW rows get the
lead and the reason it was not verified, so a person can check it.
"""
import csv
import json

from careers import LEVEL_NAMES, classify
from common import OUTPUT, read_roster

AI_COLUMNS = ["AI Status", "AI Job Title", "AI Employer", "AI Industry", "AI Previous Employers",
              "AI Years at Company", "AI City", "AI State", "AI LinkedIn", "AI Data As Of", "AI Evidence",
              "AI Why Not Verified", "AI Sources", "AI Degree Job", "AI Seniority"]
FACT_KEYS = ["title", "employer", "industry", "previous_employers", "years_at_company", "city", "state", "linkedin", "as_of"]


def main():
    results = {}
    path = OUTPUT / "results.jsonl"
    if path.exists():
        results = {r["row"]: r for r in map(json.loads, open(path))}
    rows = read_roster()
    out = OUTPUT / "roster_with_research.csv"
    with open(out, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()) + AI_COLUMNS)
        w.writeheader()
        for i, row in enumerate(rows):
            r = results.get(i + 2)
            extra = dict.fromkeys(AI_COLUMNS, "")
            if r:
                facts = r.get("facts") or {}
                lead = r["status"] == "NEEDS REVIEW"
                extra["AI Status"] = r["status"]
                for col, key in zip(AI_COLUMNS[1:10], FACT_KEYS):
                    val = facts.get(key, "")
                    extra[col] = f"(unverified) {val}" if lead and val else val
                extra["AI Evidence"] = "; ".join(r.get("reasons", []))
                extra["AI Why Not Verified"] = "; ".join(r.get("why_not_verified", []))
                srcs = [s["url"] if isinstance(s, dict) else s for s in r.get("sources", [])]
                extra["AI Sources"] = " ".join(srcs)
                if facts.get("title"):
                    c = classify(facts["title"])
                    extra["AI Degree Job"] = {True: "yes", False: "no", None: "unclear"}[c["degree"]]
                    extra["AI Seniority"] = LEVEL_NAMES[c["level"]]
            w.writerow({**row, **extra})
    print(f"wrote {out}")


if __name__ == "__main__":
    main()
