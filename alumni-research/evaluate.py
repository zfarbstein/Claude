"""Pilot only: compare results against what the team had already found.

    python3 evaluate.py
"""
import json

from common import ANSWER_KEY, OUTPUT, norm


def same_employer(a, b):
    a, b = norm(a), norm(b)
    return bool(a and b and (a in b or b in a))


def main():
    key = {k["row"]: k for k in map(json.loads, open(ANSWER_KEY))}
    results = [json.loads(l) for l in open(OUTPUT / "results.jsonl")]
    tally = {}
    for r in results:
        k = key[r["row"]]
        group = "already researched by team" if k["known"] else "never researched"
        employer = r.get("facts", {}).get("employer", "")
        if r["status"] == "VERIFIED":
            verdict = "VERIFIED, agrees with team" if same_employer(employer, k["Current Employer"]) else (
                "VERIFIED, team has no answer" if not k["known"] else "VERIFIED, DISAGREES with team")
        else:
            verdict = r["status"]
        tally.setdefault(group, {}).setdefault(verdict, 0)
        tally[group][verdict] += 1
        if k["known"]:
            print(f"row {r['row']:>5} {r['name']:<26} {r['status']:<13} "
                  f"found: {employer or '-':<30} team: {k['Current Employer'] or '-'}")
    print()
    for group, counts in tally.items():
        print(f"{group}: {sum(counts.values())} people")
        for verdict, n in sorted(counts.items()):
            print(f"   {verdict}: {n}")


if __name__ == "__main__":
    main()
