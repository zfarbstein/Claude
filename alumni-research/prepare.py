"""Build the research queue from the roster.

    python3 prepare.py todo                  # everyone who still needs research
    python3 prepare.py pilot --known 20 --new 10 --seed 7 --exclude-file seen.txt

The pilot mixes people the team already researched ("known", used as a blind
answer key) with people nobody has researched yet ("new"). The answer key goes
to a separate file that the research step never reads.
"""
import argparse
import json
import random
import re

from common import (
    ANSWER_KEY, DATA, GENERIC_EMAIL_DOMAINS, JOB_COLUMNS, MAX_AGE, QUEUE,
    age_on, norm, parse_address, parse_date, read_roster,
)

DONE_STATUSES = {"complete", "deceased"}


def person(rownum, r):
    dob = parse_date(r["Date Of Birth"])
    init = parse_date(r["Initiation Date"])
    city, state, zipcode = parse_address(r["Primary Address"])
    email = r["Primary Email"].strip().lower()
    domain = email.split("@")[-1] if "@" in email else ""
    return {
        "row": rownum,
        "first": r["Legal First Name"].strip(),
        "informal": r["Informal First Name"].strip(),
        "last": r["Legal Last Name"].strip(),
        "birth_year": dob.year if dob else None,
        "dob": dob.isoformat() if dob else None,
        "age": age_on(dob) if dob else None,
        "init_year": init.year if init else None,
        "city": city,
        "state": state,
        "zip": zipcode,
        "email": email,
        "work_email_domain": domain if domain and domain not in GENERIC_EMAIL_DOMAINS else "",
        "phone": re.sub(r"\D", "", r["Primary Phone"])[-10:],
    }


def skip_reason(p, r):
    if p["age"] is not None and p["age"] > MAX_AGE:
        return f"over {MAX_AGE}"
    if r["Research Status"].strip().lower() in DONE_STATUSES:
        return "already researched"
    if any(r[c].strip() for c in JOB_COLUMNS):
        return "already has job info"
    return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("mode", choices=["todo", "pilot"])
    ap.add_argument("--known", type=int, default=20)
    ap.add_argument("--new", type=int, default=10)
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--exclude-file", help="names (First Last per line) to leave out of the pilot")
    args = ap.parse_args()

    rows = read_roster()
    people = [(person(i + 2, r), r) for i, r in enumerate(rows)]  # row 1 is the header

    # Exact duplicate rows (same name and birthday) are researched once.
    seen, unique = set(), []
    for p, r in people:
        key = (norm(p["first"]), norm(p["last"]), p["dob"])
        if key in seen:
            continue
        seen.add(key)
        unique.append((p, r))

    if args.mode == "todo":
        queue = [p for p, r in unique if not skip_reason(p, r)]
        key = []
    else:
        excluded = set()
        if args.exclude_file:
            excluded = {norm(l) for l in open(args.exclude_file) if l.strip()}
        alive = [(p, r) for p, r in unique
                 if (p["age"] or 0) <= MAX_AGE and norm(p["first"] + p["last"]) not in excluded]
        known = [(p, r) for p, r in alive
                 if r["Research Status"].strip() == "Complete" and r["LinkedIn Profile"].strip()]
        new = [(p, r) for p, r in alive if r["Research Status"].strip() == "Not Started"]
        rng = random.Random(args.seed)
        known = rng.sample(known, args.known)
        new = rng.sample(new, args.new)
        picked = known + new
        rng.shuffle(picked)
        queue = [p for p, _ in picked]
        key = [{"row": p["row"], "known": (p, r) in known,
                **{c: r[c] for c in JOB_COLUMNS + ["Research Status", "Additional Info"]}}
               for p, r in picked]

    DATA.mkdir(exist_ok=True)
    with open(QUEUE, "w") as f:
        for p in queue:
            f.write(json.dumps(p) + "\n")
    with open(ANSWER_KEY, "w") as f:
        for k in key:
            f.write(json.dumps(k) + "\n")

    skipped = {}
    for p, r in unique:
        why = skip_reason(p, r)
        if why:
            skipped[why] = skipped.get(why, 0) + 1
    print(f"{len(rows)} roster rows, {len(rows) - len(unique)} exact duplicates collapsed")
    print(f"skipped in a full run: {skipped}")
    print(f"queue: {len(queue)} people -> {QUEUE}")


if __name__ == "__main__":
    main()
