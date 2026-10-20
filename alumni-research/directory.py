"""Build the brothers' alumni career directory (an Excel workbook) from the research results.

    python3 directory.py            # -> data/output/alumni_directory.xlsx

Tabs, in order: Start Here; Find Your Field (each field links to its own tab, highest Score first); Top
Picks (Score 8+); All Alumni (the master list: research team Complete / Partial rows and rows score.py
VERIFIED); Needs Review (everyone else, each with a reason and Decision / Reviewer Notes columns); one
tab per field. Laid out for a phone: Name, then Score, Job Title and Employer first, Name frozen.

Field and Job Type come from data/directory_labels.json and Score (1-10, career-networking value, with a
short reason) from data/directory_scores.json, both keyed by roster row and made by classifying /
scoring each job title + employer (no names). People without them get blanks, so label and score new
people before sharing a new version.

Only career-useful facts go in. The research team's free-text notes (Additional Info) are never
copied: they hold internal matching notes, home-address comparisons and other private details.
Records whose job came from a relative (a different first name on the shared email/phone) keep no
job facts. Nothing here changes the roster or roster_with_research.csv. The workbook has no
formulas, so it shows the same everywhere, including phone previews; counts are a snapshot.
"""
import argparse
import collections
import csv
import datetime as dt
import json
import re
import urllib.parse

from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.worksheet.hyperlink import Hyperlink
from openpyxl.worksheet.table import Table, TableStyleInfo

from careers import classify
from common import DATA, OUTPUT, STATE_NAMES, norm, parse_address, parse_date

LABELS = DATA / "directory_labels.json"
SCORES = DATA / "directory_scores.json"
FIELDS = [
    "Accounting & Tax",
    "Banking, Investing & Wealth Management",
    "Insurance",
    "Real Estate",
    "Consulting",
    "Law",
    "Healthcare & Medicine",
    "Pharma, Biotech & Medical Devices",
    "Technology & Software",
    "Telecommunications",
    "Engineering Services",
    "Aerospace & Defense",
    "Construction & Architecture",
    "Manufacturing & Industrial",
    "Energy, Utilities & Environment",
    "Transportation & Logistics",
    "Retail & Consumer Products",
    "Food, Restaurants & Hospitality",
    "Sports, Media & Entertainment",
    "Marketing & Advertising",
    "Education & Research",
    "Government & Public Service",
    "Military",
    "Nonprofit & Religious",
    "Other / Unknown",
]
TYPES = [
    "Executive / Owner / Founder",
    "Finance & Accounting",
    "Investing & Wealth Management",
    "Legal",
    "Medical & Clinical",
    "Engineering",
    "Software, Data & IT",
    "Sales & Business Development",
    "Marketing & Communications",
    "Operations & General Management",
    "Project & Program Management",
    "Consulting & Strategy",
    "Real Estate & Property",
    "Teaching, Research & Science",
    "Public Service & Military",
    "Construction & Skilled Trades",
    "Design & Creative",
    "Human Resources & Recruiting",
    "Pilot & Aviation",
    "Student / Resident / In Training",
    "Retired",
    "Other",
]
by_row = {}


def read_roster_copy():
    with open(OUTPUT / "roster_with_research.csv", encoding="utf-8", newline="") as f:
        return list(csv.DictReader(f))


def load_labels():
    return {int(k): v for k, v in json.load(open(LABELS)).items()} if LABELS.exists() else {}


PLACEHOLDER = {"", "n/a", "na", "none", "unable to locate profile", "-", "unknown", "not found", "null",
               "dont know", "don't know", "does not say", "usa", "capital region"}
DEAD = re.compile(r"\b(deceased|passed away|obituary|funeral|died|in memoriam)\b", re.I)
DOUBT = re.compile(r"probabl|likely|need(s)? (to be )?conf(ir|ri)m|conf(ir|ri)mation|unconfirmed|not sure|unsure|has got to be"
                   r"|might be|possibly|uncertain|out of date|stale|unverified|(can'?t|could ?n[o']t|unable to) "
                   r"(confirm|verify)", re.I)
TYPOS = {"cheif": "Chief", "attourney": "Attorney", "cirriculum": "Curriculum", "liscended": "Licensed",
         "execuitve": "Executive", "cooridinator": "Coordinator", "ifrastructure": "Infrastructure",
         "concervancy": "Conservancy", "comission": "Commission", "ttorney": "Attorney", "logitician": "Logistician",
         "statitician": "Statistician", "manufacutring": "Manufacturing", "maitenance": "Maintenance",
         "consulatant": "Consultant", "mangement": "Management", "mangager": "Manager", "realestate": "Real Estate",
         "pitssburgh": "Pittsburgh", "lauterdale": "Lauderdale", "indiannapolis": "Indianapolis"}
CITY_FIX = {"ft. lauterdale": "Ft. Lauderdale", "ft lauterdale": "Ft. Lauderdale", "indiannapolis": "Indianapolis",
            "fort meyers": "Fort Myers", "pitssburgh": "Pittsburgh", "washington d.c.": "Washington",
            "washington dc": "Washington", "d.c.": "Washington", "dc": "Washington"}
DC = {"washington d.c.", "washington dc", "d.c.", "dc", "washington, d.c.", "washington, dc"}
# Hedges the research team wrote inside a value, e.g. "(profile likely out of date)".
HEDGE = re.compile(r"\s*[(\[][^)\]]*\b(likely|maybe|stale|out of date|not sure|unsure|probably)\b[^)\]]*[)\]]", re.I)
ACRONYMS = {"us", "usa", "td", "bny", "ey", "ge", "usg", "fis", "ibm", "kpmg", "pwc", "hca", "aig", "ups", "cbre",
            "jll", "llc", "llp", "pllc", "cpa", "pa", "pc", "nasa", "faa", "fbi", "cia", "dod", "uf", "usf", "ucf",
            "fsu", "hr", "it", "ai", "cvs", "bdo", "rsm", "jp", "abc", "nbc", "cbs", "espn", "hbo", "att", "pnc",
            "usaa", "mit", "nih", "cdc", "fdic", "sec", "usda", "noaa", "va", "ceo", "cfo", "coo", "cto", "vp",
            "svp", "evp", "avp", "md", "rn", "pe", "cfa", "cfp", "mba", "jd", "phd", "iii", "ii", "iv", "nfl",
            "nba", "mlb", "nhl", "ncaa", "sap", "aws", "gm", "bmw", "hp", "nyc"}
STATE_FULL = {}
for name in ["Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado", "Connecticut", "Delaware",
             "Florida", "Georgia", "Hawaii", "Idaho", "Illinois", "Indiana", "Iowa", "Kansas", "Kentucky",
             "Louisiana", "Maine", "Maryland", "Massachusetts", "Michigan", "Minnesota", "Mississippi", "Missouri",
             "Montana", "Nebraska", "Nevada", "New Hampshire", "New Jersey", "New Mexico", "New York",
             "North Carolina", "North Dakota", "Ohio", "Oklahoma", "Oregon", "Pennsylvania", "Rhode Island",
             "South Carolina", "South Dakota", "Tennessee", "Texas", "Utah", "Vermont", "Virginia", "Washington",
             "West Virginia", "Wisconsin", "Wyoming", "District of Columbia"]:
    STATE_FULL[STATE_NAMES[re.sub(r"[^a-z]", "", name.lower())]] = name


def clean(v):
    v = re.sub(r"\s+", " ", (v or "").strip())
    # "<name> stop here": a volunteer's bookmark left in a job column
    return "" if v.lower().strip(" .?") in PLACEHOLDER or v.lower().endswith("stop here") else v


def fix_text(v):
    """Obvious typos, acronyms the data provider title-cased ('Kpmg Us'), all-lowercase names."""
    v = clean(v)
    if not v:
        return v
    v = HEDGE.sub("", v).strip()
    lower = v == v.lower()
    def token(m):
        t = m.group(0)
        if "." in t.strip(".,") or "@" in t:  # a web address or domain: leave it alone
            return t
        def word(w):
            w = w.group(0)
            fix = TYPOS.get(w.lower())
            if fix:
                return fix.lower() if w.islower() and not lower else fix.upper() if w.isupper() and len(w) > 1 else fix
            if lower:
                w = w.capitalize()
            if w.lower() in ACRONYMS and (w.istitle() or w.islower()) and len(w) > 1:
                return w.upper()
            return w
        return re.sub(r"[A-Za-z]+", word, t)
    return re.sub(r"\S+", token, v)


def state_full(s):
    """Full state name, so a filter on 'Florida' catches 'FL'; '' when it isn't a US state."""
    s = clean(s).strip(" ?.")
    if not s:
        return ""
    if re.fullmatch(r"(washington )?d\.? ?c\.?", s, re.I):
        return "District of Columbia"
    if s.lower() == "virgina":
        return "Virginia"
    code = s.upper() if len(s) == 2 else STATE_NAMES.get(re.sub(r"[^a-z]", "", s.lower()))
    if STATE_FULL.get(code):
        return STATE_FULL[code]
    return s.title() if len(s) > 2 and s.lower() not in {"usa", "us", "united states"} else ""  # e.g. "England"


def location(city, state):
    """(city, state, note). 'X or Y', 'City?' and '(maybe ...)' keep their first value with an
    uncertainty note; 'St. Paul/Minneapolis' is one metro area; 'Tampa Bay area (Oldsmar)' keeps the town."""
    city, state = clean(city), clean(state)
    if len(city) > 40 or re.search(r"\b(currently|if not|student)\b", city, re.I):
        return "", state_full(re.split(r"\s*(?:/|\bor\b)", state, maxsplit=1)[0]), "Location uncertain"
    uncertain = bool(re.search(r"\?|\bmaybe\b|\bor\b", city + " " + state, re.I))
    m = re.match(r".*\barea\s*\(([^)]+)\)", city, re.I)
    if m and not re.search(r"\bmaybe\b", m.group(1), re.I):
        city = m.group(1)
    city = re.split(r"\s*(?:\(|\?|/|\bor\b)", city, maxsplit=1)[0].strip(" ,")
    first_state = re.split(r"\s*(?:/|\bor\b)", state, maxsplit=1)[0]
    full = state_full(first_state)
    if city.lower() in DC:
        full = "District of Columbia"
    city = CITY_FIX.get(city.lower(), fix_text(city) if city else "")
    return city, full, ("Location uncertain" if uncertain else "")


def phone(v):
    d = re.sub(r"\D", "", v or "")
    if len(d) == 11 and d[0] == "1":
        d = d[1:]
    if len(d) == 10:
        return f"({d[:3]}) {d[3:6]}-{d[6:]}"
    return clean(v)  # not a US number: show it as typed


def linkedin(v):
    v = clean(v)
    if not v or "linkedin.com" not in v.lower():
        return ""
    v = v.split("?")[0].rstrip("/")
    v = re.sub(r"^(https?://)?(www\.)?", "", v, flags=re.I)
    return "https://www." + v


def years_text(v):
    v = HEDGE.sub("", clean(v)).strip()
    if re.fullmatch(r"\d+", v):
        return f"{v} year" + ("" if v == "1" else "s")
    return v


def ai_since(f):
    m = re.search(r"(\d{4})", f.get("years_at_company") or "")
    return f"Since {m.group(1)}" if m else ""


def month(d):
    d = (d or "")[:7]
    return d if re.fullmatch(r"\d{4}-\d{2}", d) else ""


def same_employer(a, b):
    a, b = norm(a), norm(b)
    return bool(a and b and (a in b or b in a))


def build_records():
    """One record per alumnus to show, with tier "main" (confirmed) or "review"."""
    rows = read_roster_copy()
    results = {r["row"]: r for r in map(json.loads, open(OUTPUT / "results.jsonl"))}
    recs, seen, skipped = [], set(), collections.Counter()
    for i, r in enumerate(rows):
        rownum = i + 2
        status = r["Research Status"].strip()
        if r["Member Status"].strip() != "Alumnus" or status == "Deceased":
            continue
        if DEAD.search(r["Additional Info"]):
            skipped["death noted by research team"] += 1
            continue
        dob = parse_date(r["Date Of Birth"])
        key = (norm(r["Legal First Name"]), norm(r["Legal Last Name"]), dob)
        if key in seen:
            continue
        seen.add(key)
        res = results.get(rownum) or {}
        facts = res.get("facts") or {}
        notes, rec = [], None
        team_title, team_employer = clean(r["Current Job Title"]), clean(r["Current Employer"])
        team_job = bool(team_title or team_employer) and status != "AI Verified"
        if team_job:
            team_text = " ".join([r["Additional Info"], team_title, team_employer, r["Years at Current Company"]])
            doubt = DOUBT.search(team_text) or "(no longer active)" in team_employer.lower()
            if team_title.lower() == "unemployed":
                tier, why, team_title = "review", "No current job listed", ""
            elif status in ("Complete", "Partial") and doubt:
                tier, why = "review", "Research team's notes say this match or job isn't certain"
            elif status in ("Complete", "Partial") or res.get("status") == "VERIFIED":
                tier, why = "main", ""
            else:
                label = {"Unc": "Unconfirmed"}.get(status, status)
                tier, why = "review", f"Research team marked this '{label}': they couldn't confirm it's him"
            conf = ("Confirmed by research team" if status in ("Complete", "Partial")
                    else "Verified by data match" if res.get("status") == "VERIFIED" else "Needs review")
            if res.get("status") == "VERIFIED" and facts.get("employer") and not same_employer(facts["employer"], team_employer):
                asof = month(facts.get("as_of"))
                notes.append(f"Newer data{' (' + asof + ')' if asof else ''} shows: "
                             f"{fix_text(facts.get('title'))} at {fix_text(facts.get('employer'))}")
            city, st, loc_note = location(r["Current City"], r["State"])
            rec = dict(tier=tier, confidence=conf, title=fix_text(team_title), employer=fix_text(team_employer),
                       industry=fix_text(r["Industry/Field"]), previous=fix_text(r["Any Previous Notable Employers"]),
                       tenure=years_text(r["Years at Current Company"]), city=city, state=st,
                       linkedin=linkedin(r["LinkedIn Profile"]), as_of="", source="team", why=why)
            if loc_note:
                notes.append(loc_note)
        elif res.get("status") == "VERIFIED" and (facts.get("title") or facts.get("employer")):
            city, st, loc_note = location(facts.get("city"), facts.get("state"))
            employer = facts.get("employer", "")
            if "possibly outdated" in r["AI Flags"]:
                notes.append("Job may have changed: check LinkedIn first")
            if "(no longer active)" in employer.lower():
                employer = re.sub(r"\s*\(no longer active\)", "", employer, flags=re.I)
                notes.append("Company may have closed: check LinkedIn first")
            rec = dict(tier="main", confidence="Verified by data match", title=fix_text(facts.get("title")),
                       employer=fix_text(employer), industry=fix_text(facts.get("industry")),
                       previous=fix_text(facts.get("previous_employers")), tenure=ai_since(facts), city=city, state=st,
                       linkedin=linkedin(facts.get("linkedin")), as_of=month(facts.get("as_of")), source="ai", why="")
        elif res.get("status") == "NEEDS REVIEW":
            why_raw = res.get("why_not_verified") or []
            relative = any(w.startswith("name on source") for w in why_raw)
            reasons = []
            for w in why_raw:
                g = re.match(r"UF graduation year (\d+) does not fit initiation (\d+)", w)
                if g:
                    reasons.append(f"Record shows UF graduation in {g.group(1)}, but he was initiated in {g.group(2)}: "
                                   "may be a different person")
                elif w.startswith("birth year"):
                    reasons.append("Birth year on the record doesn't match the roster: may be a different person")
                elif w.startswith("not enough independent proof") and not relative:
                    reasons.append("Name matches and some details fit, but not enough to be sure it's him")
                elif w.startswith("identity confirmed but no sourced current job"):
                    reasons.append("It's him, but no current job is listed")
                elif "different plausible people" in w:
                    reasons.append("More than one person with this name went to UF")
            if relative:
                # The record is a family member's: show none of it.
                reasons = ["The record we found belongs to a family member who shares his email or phone, so there's "
                           "no job for him yet. His email or phone on file may reach that family member."]
                facts = {}
            city, st, loc_note = location(facts.get("city"), facts.get("state"))
            rec = dict(tier="review", confidence="Needs review", title=fix_text(facts.get("title")),
                       employer=fix_text(facts.get("employer")), industry=fix_text(facts.get("industry")),
                       previous=fix_text(facts.get("previous_employers")), tenure=ai_since(facts), city=city, state=st,
                       linkedin=linkedin(facts.get("linkedin")), as_of=month(facts.get("as_of")), source="ai",
                       why="; ".join(dict.fromkeys(reasons)) or "Not enough to be sure it's him", relative=relative)
            if "possibly outdated" in r["AI Flags"] and facts:
                notes.append("Job may have changed")
        elif status in ("Unable to Verify", "Unc", "Partial", "Complete") and clean(r["Additional Info"]):
            why = ("Research team found him, but no current job is confirmed (their notes are in the master roster)"
                   if status in ("Partial", "Complete") else
                   "Research team noted a possible match but couldn't confirm it (their notes are in the master roster)")
            rec = dict(tier="review", confidence="Needs review", title="", employer="", industry="", previous="",
                       tenure="", city="", state="", linkedin="", as_of="", source="team", why=why)
        if not rec:
            continue
        if rec["tier"] == "review":
            rec["confidence"] = "Needs review"
        if not rec["city"]:
            city, st, _ = parse_address(r["Primary Address"])
            if city:
                rec["city"], rec["state"] = CITY_FIX.get(city.lower(), fix_text(city)), STATE_FULL.get(st, st)
                notes.append("City from chapter mailing address")
        level = classify(rec["title"])["level"] if rec["title"] else 0
        # His own firm ("Jon Sample CPA", "Sample & Doe, P.A."): an owner, whatever the title says.
        last = norm(r["Legal Last Name"])
        if (rec["title"] and level <= 1 and len(last) >= 4 and last in [norm(w) for w in re.findall(r"[A-Za-z]+", re.sub(r"\(.*?\)", "", rec["employer"]))]
                and not re.search(r"associate|assistant|intern|analyst|student", rec["title"], re.I)):
            level = 5
        init = parse_date(r["Initiation Date"])
        first = clean(r["Informal First Name"]) or clean(r["Legal First Name"])
        rec.update(id=len(recs) + 1, row=rownum, first=first, last=clean(r["Legal Last Name"]),
                   init_year=init.year if init else None, email=clean(r["Primary Email"]).lower(),
                   phone=phone(r["Primary Phone"]), level=level,
                   notes="; ".join(notes))
        recs.append(rec)
    return recs, skipped


FONT = "Arial"
RED = "8C1D1D"     # Delta Chi red: white text on it is 9.1:1
AMBER = "7A4B00"   # Needs Review headers: white text on it is 7.4:1
FILL_IN = "E8D9B5" # editable review columns (also named "(fill in)", so color isn't the only cue)
INK = "1F1F1F"
LINK = "0B57A4"    # 7:1 on white
thin = Side(style="thin", color="BFBFBF")
SENIORITY = {5: "1 - Owner / Partner / Top Executive", 4: "2 - VP / Managing Director", 3: "3 - Director",
             2: "4 - Manager", 1: "5 - Senior", 0: "6 - Professional"}
STUDENT, RETIRED = "7 - Student / In Training", "8 - Retired"
# Sheet names can't hold "/" or run past 31 characters.
TAB = {"Banking, Investing & Wealth Management": "Banking & Investing",
       "Pharma, Biotech & Medical Devices": "Pharma, Biotech & Med Devices", "Other / Unknown": "Other"}
STATE_CODE = {}
scores = {}


def font(**kw):
    return Font(name=FONT, size=kw.pop("size", 11), color=kw.pop("color", INK), **kw)


def load_scores():
    return {int(k): v for k, v in json.load(open(SCORES)).items()} if SCORES.exists() else {}


def labels_for(r):
    """Field / Job Type for a record; blank when there's no job to classify."""
    if not (r["title"] or r["employer"]):
        return {"field": "", "job_type": ""}
    lab = dict(by_row.get(r["row"]) or {"field": "", "job_type": ""})
    if r["title"].lower().startswith("retired") or "emeritus" in r["title"].lower():
        lab["job_type"] = "Retired"
    return lab


def seniority(r, lab):
    if not r["title"]:
        return ""
    if lab["job_type"] == "Retired":
        return RETIRED
    if lab["job_type"] == "Student / Resident / In Training":
        return STUDENT
    return SENIORITY[r["level"]]


def score(r):
    s = scores.get(r["row"]) if (r["title"] or r["employer"]) else None
    return (s["score"], s["reason"]) if s else (None, "")


def location_text(r):
    """'Tampa, FL'; a foreign region stays as written."""
    if not STATE_CODE:
        STATE_CODE.update({name: code for code, name in STATE_FULL.items()})
    st = STATE_CODE.get(r["state"], r["state"])
    return ", ".join(x for x in (r["city"], st) if x)


def linkedin_username(url):
    m = re.search(r"linkedin\.com/in/([^/?#]+)", url or "")
    return urllib.parse.unquote(m.group(1)) if m else ""


def best_first(r):
    s, _ = score(r)
    return (s is None, -(s or 0), r["first"].lower(), r["last"].lower())


def link(cell, target, text, internal=False):
    cell.value = text
    if internal:
        cell.hyperlink = Hyperlink(ref=cell.coordinate, location=target, display=text)
    else:
        cell.hyperlink = target
    cell.font = font(color=LINK, underline="single")


def print_setup(ws, landscape=True, pages_wide=1, title_rows=None):
    ws.page_setup.paperSize = ws.PAPERSIZE_LETTER
    ws.page_setup.pageOrder = "overThenDown"  # a person's whole row prints on consecutive pages
    ws.page_margins.left = ws.page_margins.right = 0.4
    ws.page_margins.top = ws.page_margins.bottom = 0.5
    ws.page_setup.orientation = "landscape" if landscape else "portrait"
    ws.page_setup.fitToWidth = pages_wide
    ws.page_setup.fitToHeight = 0
    ws.sheet_properties.pageSetUpPr.fitToPage = True
    if title_rows:
        ws.print_title_rows = title_rows
        ws.print_title_cols = "A:A"


# Column name -> width. Each people tab picks its columns from here, most useful first (iPhone shows the
# first few columns; Name stays on screen when scrolling right).
WIDTH = {"Name": 22, "Score": 8, "Job Title": 30, "Employer": 26, "Field": 30, "Job Type": 26, "Location": 20,
         "Notes": 26, "Email": 30, "Phone": 15, "LinkedIn": 44, "LinkedIn Username": 24, "Initiated": 11,
         "Why This Score": 28, "Seniority": 30, "State": 16, "Industry (as listed)": 26, "Time at Employer": 16,
         "Previous Employers": 34, "Source": 27, "Info As Of": 16, "Last Name": 16, "Status": 29,
         "Why It Needs Review": 44, "Decision (fill in)": 17, "Reviewer Notes (fill in)": 28,
         "Possible Job Title": 30, "Possible Employer": 26}
WRAP = {"Job Title", "Employer", "Notes", "Previous Employers", "Industry (as listed)", "Time at Employer",
        "LinkedIn", "Why This Score", "Why It Needs Review", "Reviewer Notes (fill in)", "Possible Job Title",
        "Possible Employer", "Field", "Job Type"}
PEOPLE = ["Name", "Score", "Job Title", "Employer", "Job Type", "Location", "Notes", "Email", "Phone", "LinkedIn",
          "LinkedIn Username", "Initiated", "Why This Score", "Seniority", "Industry (as listed)",
          "Time at Employer", "Previous Employers", "Source", "Info As Of"]
ALL = PEOPLE[:4] + ["Field"] + PEOPLE[4:] + ["State", "Last Name"]
REVIEW = ["Name", "Status", "Why It Needs Review", "Decision (fill in)", "Reviewer Notes (fill in)", "Score",
          "Possible Job Title", "Possible Employer", "Field", "Job Type", "Location", "LinkedIn", "LinkedIn Username",
          "Email", "Phone", "Initiated", "Why This Score", "Industry (as listed)", "Time at Employer",
          "Previous Employers", "Notes", "Info As Of", "State"]


def values(r):
    lab = labels_for(r)
    s, why = score(r)
    as_of = None
    if re.fullmatch(r"\d{4}-\d{2}", r["as_of"] or ""):
        as_of = dt.date(int(r["as_of"][:4]), int(r["as_of"][5:7]), 1)
    elif r["source"] == "team" and (r["title"] or r["employer"]):
        as_of = "Research team (2026)"
    return {
        "Name": f"{r['first']} {r['last']}".strip(), "Last Name": r["last"], "Score": s, "Why This Score": why,
        "Job Title": r["title"], "Possible Job Title": r["title"], "Employer": r["employer"],
        "Possible Employer": r["employer"], "Field": lab["field"], "Job Type": lab["job_type"],
        "Seniority": seniority(r, lab), "Location": location_text(r), "State": r["state"], "Initiated": r["init_year"],
        "Industry (as listed)": r["industry"], "Time at Employer": r["tenure"], "Previous Employers": r["previous"],
        "Source": r["confidence"], "Info As Of": as_of, "Notes": r["notes"],
        "LinkedIn Username": linkedin_username(r["linkedin"]),
        "Status": "Unconfirmed: don't contact yet", "Why It Needs Review": r.get("why", ""),
    }


def people_table(ws, name, people, columns, color, top=1):
    """Write a header row at `top` and one row per person, as an Excel table with filter buttons."""
    for c, h in enumerate(columns, 1):
        cell = ws.cell(row=top, column=c, value=h)
        cell.font = font(bold=True, color="FFFFFF")
        cell.fill = PatternFill("solid", fgColor=color)
        cell.alignment = Alignment(vertical="center", wrap_text=True)
        cell.border = Border(bottom=thin)
        ws.column_dimensions[get_column_letter(c)].width = WIDTH[h]
    ws.row_dimensions[top].height = 32
    for i, r in enumerate(people, top + 1):
        vals = values(r)
        for c, h in enumerate(columns, 1):
            cell = ws.cell(row=i, column=c)
            cell.font = font()
            if h == "Email" and r["email"]:
                link(cell, "mailto:" + r["email"], r["email"])
            elif h == "Phone" and r["phone"]:
                digits = re.sub(r"\D", "", r["phone"])
                if len(digits) == 10:
                    link(cell, "tel:+1" + digits, r["phone"])
                else:
                    cell.value = r["phone"]
            elif h == "LinkedIn":
                if r["linkedin"]:
                    # The full address, not "LinkedIn profile": phone previews that can't follow
                    # spreadsheet links can still long-press, copy or auto-link a visible address.
                    link(cell, r["linkedin"], urllib.parse.unquote(r["linkedin"].replace("https://", "")))
                else:
                    q = urllib.parse.quote_plus(f"{r['first']} {r['last']} University of Florida")
                    link(cell, f"https://www.linkedin.com/search/results/people/?keywords={q}", "Search LinkedIn")
            else:
                cell.value = vals.get(h, "")
                if h == "Initiated":
                    cell.number_format = "0"
                if h == "Info As Of" and isinstance(cell.value, dt.date):
                    cell.number_format = "mmm yyyy"
                if h == "Score":
                    cell.font = font(bold=(cell.value or 0) >= 8)
            cell.alignment = Alignment(vertical="top", wrap_text=h in WRAP,
                                       horizontal="center" if h == "Score" else "left")
    t = Table(displayName=name, ref=f"A{top}:{get_column_letter(len(columns))}{top + max(len(people), 1)}")
    t.tableStyleInfo = TableStyleInfo(name="TableStyleLight1", showRowStripes=True)
    ws.add_table(t)
    ws.freeze_panes = f"B{top + 1}"  # header row and the Name column stay on screen
    print_setup(ws, pages_wide=2, title_rows=f"{top}:{top}")


def dropdowns(ws, columns, rows=2000):
    for h, ref in (("Field", f"Lists!$A$2:$A${len(FIELDS) + 1}"), ("Job Type", f"Lists!$B$2:$B${len(TYPES) + 1}")):
        col = get_column_letter(columns.index(h) + 1)
        dv = DataValidation(type="list", formula1=ref, allow_blank=True, showErrorMessage=True, errorStyle="warning",
                            errorTitle=h, error=f"Pick a {h} from the list.")
        dv.add(f"{col}2:{col}{rows}")
        ws.add_data_validation(dv)


def text_rows(ws, lines, width=62):
    """A one-column page of headings and short paragraphs (narrow, so it fits a phone screen)."""
    ws.column_dimensions["A"].width = width
    styles = {"title": font(size=18, bold=True, color=RED), "head": font(size=13, bold=True, color=RED),
              "text": font(size=12)}
    for i, (kind, text) in enumerate(lines, 1):
        c = ws.cell(row=i, column=1, value=text)
        c.font = styles[kind]
        c.alignment = Alignment(wrap_text=True, vertical="top")
    ws.sheet_view.showGridLines = False


def build_workbook(recs, out):
    global by_row, scores
    by_row, scores = load_labels(), load_scores()
    main = [r for r in recs if r["tier"] == "main"]
    review = sorted([r for r in recs if r["tier"] == "review"], key=best_first)
    by_field = collections.defaultdict(list)
    for r in main:
        by_field[labels_for(r)["field"] or "Other / Unknown"].append(r)
    fields = sorted(by_field, key=lambda f: (f == "Other / Unknown", f))
    top_picks = sorted([r for r in main if (score(r)[0] or 0) >= 8], key=best_first)
    all_sorted = sorted(main, key=lambda r: ((labels_for(r)["field"] or "Other / Unknown") == "Other / Unknown",
                                             labels_for(r)["field"], best_first(r)))
    month = dt.date.today().strftime("%B %Y")

    wb = Workbook()
    start = wb.active
    start.title = "Start Here"
    start.sheet_properties.tabColor = "404040"

    # ------------------------------------------------------------ Find Your Field
    ff = wb.create_sheet("Find Your Field")
    ff.sheet_properties.tabColor = RED
    for c, (h, w) in enumerate((("Field (tap to see everyone)", 40), ("Alumni", 10), ("Top Score", 11)), 1):
        cell = ff.cell(row=1, column=c, value=h)
        cell.font = font(bold=True, color="FFFFFF")
        cell.fill = PatternFill("solid", fgColor=RED)
        cell.alignment = Alignment(vertical="center", wrap_text=True)
        ff.column_dimensions[get_column_letter(c)].width = w
    ff.row_dimensions[1].height = 32
    for i, f in enumerate(fields, 2):
        tab = TAB.get(f, f)
        link(ff.cell(row=i, column=1), f"'{tab}'!A1", f, internal=True)
        ff.cell(row=i, column=2, value=len(by_field[f])).font = font()
        ff.cell(row=i, column=3, value=max((score(r)[0] or 0) for r in by_field[f]) or None).font = font()
        for c in (2, 3):
            ff.cell(row=i, column=c).alignment = Alignment(horizontal="center")
    t = Table(displayName="FindYourField", ref=f"A1:C{len(fields) + 1}")
    t.tableStyleInfo = TableStyleInfo(name="TableStyleLight1", showRowStripes=True)
    ff.add_table(t)
    ff.freeze_panes = "A2"
    ff.cell(row=len(fields) + 3, column=1,
            value=f"Counts as of {month}. Each field's tab lists everyone in it, highest Score first.").font = \
        font(italic=True)
    print_setup(ff, landscape=False)

    # ------------------------------------------------------------ Top Picks, All Alumni, Needs Review
    tp = wb.create_sheet("Top Picks")
    tp.sheet_properties.tabColor = RED
    people_table(tp, "TopPicks", top_picks, PEOPLE[:4] + ["Field"] + PEOPLE[4:], RED)

    al = wb.create_sheet("All Alumni")
    al.sheet_properties.tabColor = RED
    people_table(al, "AllAlumni", all_sorted, ALL, RED)
    dropdowns(al, ALL)

    rv = wb.create_sheet("Needs Review")
    rv.sheet_properties.tabColor = AMBER
    people_table(rv, "NeedsReview", review, REVIEW, AMBER)
    dropdowns(rv, REVIEW)
    dcol = get_column_letter(REVIEW.index("Decision (fill in)") + 1)
    ncol = get_column_letter(REVIEW.index("Reviewer Notes (fill in)") + 1)
    dv = DataValidation(type="list", formula1='"Correct,Wrong person,Unsure"', allow_blank=True,
                        showInputMessage=True, promptTitle="Decision",
                        prompt="After checking LinkedIn, choose Correct, Wrong person or Unsure.",
                        showErrorMessage=True, errorStyle="warning", errorTitle="Decision",
                        error="Please choose Correct, Wrong person or Unsure.")
    dv.add(f"{dcol}2:{dcol}2000")
    rv.add_data_validation(dv)
    edge = Side(style="medium", color=AMBER)
    for row in range(1, len(review) + 202):
        for col in (dcol, ncol):
            cell = rv[f"{col}{row}"]
            if row > 1:
                cell.fill = PatternFill("solid", fgColor=FILL_IN)
            cell.border = Border(left=edge if col == dcol else cell.border.left,
                                 right=edge if col == ncol else cell.border.right, bottom=cell.border.bottom)

    # ------------------------------------------------------------ one tab per field
    for n, f in enumerate(fields, 1):
        ws = wb.create_sheet(TAB.get(f, f))
        people = sorted(by_field[f], key=best_first)
        ws["A1"] = f"{f}: {len(people)} alumni, highest Score first"
        ws["A1"].font = font(size=14, bold=True, color=RED)
        link(ws["A2"], "'Find Your Field'!A1", "Back to Find Your Field", internal=True)
        people_table(ws, f"Field{n}", people, PEOPLE, RED, top=3)

    # ------------------------------------------------------------ dropdown lists (hidden)
    lists = wb.create_sheet("Lists")
    lists["A1"], lists["B1"] = "Field list", "Job Type list"
    for i, f in enumerate(sorted(FIELDS, key=lambda f: (f == "Other / Unknown", f)), 2):
        lists.cell(row=i, column=1, value=f)
    for i, t in enumerate(sorted(TYPES, key=lambda t: (t in ("Other", "Retired"), t == "Other", t)), 2):
        lists.cell(row=i, column=2, value=t)
    for row in lists.iter_rows():
        for cell in row:
            cell.font = font(bold=cell.row == 1)
    lists.column_dimensions["A"].width, lists.column_dimensions["B"].width = 42, 38
    lists.sheet_state = "hidden"

    # ------------------------------------------------------------ Start Here
    text_rows(start, [
        ("title", "Delta Chi UF Alumni Career Directory"),
        ("text", f"{len(main)} alumni with a confirmed job, in {len(fields)} fields. Information as of {month}."),
        ("text", "For Delta Chi brothers only: please don't forward it, post it, or add these contacts to mailing "
                 "lists or group texts. Use it for one-to-one career networking only: no sales pitches, "
                 "fundraising or mass emails."),
        ("head", "How to use it"),
        ("text", "1. Open the Find Your Field tab and tap your field. You'll see everyone in it, highest Score first."),
        ("text", "2. Start with the highest scores. Score (1 to 10) is how useful the contact is likely to be for "
                 "internships, jobs and advice: how senior he is, whether the job needs a degree, how established "
                 "the employer is, and how well it fits what brothers study. 'Why This Score' explains it."),
        ("text", "3. Look him up on LinkedIn first: tap the LinkedIn link, or type his LinkedIn Username into the "
                 "LinkedIn app's search. Then email him or message him on LinkedIn."),
        ("text", "Top Picks lists everyone scoring 8 or more. All Alumni lists everyone, with a Field column you "
                 "can filter."),
        ("head", "On an iPhone"),
        ("text", "Open the file in the free Excel app (or Google Sheets): tap the file, tap Share, then choose "
                 "Excel. A quick preview (from a text, an email or the Files app) can't tap links; there, "
                 "press and hold an address to open or copy it."),
        ("text", "Switch tabs with the tab bar at the bottom of the screen, or tap 'Back to Find Your Field' at "
                 "the top of each field's tab. Names stay on screen as you scroll right."),
        ("text", "To sort or filter in the Excel app, tap a column heading, then the filter button."),
        ("head", "What the columns mean"),
        ("text", "Job Type: what he does (e.g. Legal, Engineering, Sales). Field: his employer's industry."),
        ("text", "Notes: read before reaching out. It says if the job may have changed or newer data shows a "
                 "different employer."),
        ("text", "Location: where he works or lives now. Initiated: the year he was initiated, to help you "
                 "introduce yourself."),
        ("text", "Source: 'Confirmed by research team' (checked by the chapter's research volunteers) or "
                 "'Verified by data match' (a data provider's record matched his email, phone or UF details plus "
                 "at least one more fact). Info As Of: when the job information was last updated."),
        ("head", "Needs Review"),
        ("text", f"{len(review)} alumni we couldn't confirm yet. Don't contact anyone on this tab, or their "
                 "family, until the row is checked. Each row says why."),
        ("text", "To help: open the LinkedIn link, compare the name, UF and city, then choose Correct, Wrong "
                 "person or Unsure in 'Decision (fill in)' and add anything useful in 'Reviewer Notes (fill in)' "
                 "(the two tan columns). Send the file back to the alumni research team."),
        ("text", "Rows that say the record belonged to a family member have no job on purpose: we removed that "
                 "person's details. His email or phone on file may reach the family member."),
        ("head", "Editing"),
        ("text", "Nothing is locked. All Alumni is the master list; the field tabs, Top Picks and the counts are "
                 f"a snapshot from {month}. Send corrections, or an alumnus's request to be removed, to the "
                 "alumni research team so the master roster and the next version are updated."),
        ("head", "Reaching out"),
        ("text", "Say you're a Delta Chi brother at UF, mention his initiation year or a shared major, and ask a "
                 "specific question (15 minutes of advice, how he got into the field). Keep it short and thank "
                 "him either way."),
    ])
    print_setup(start, landscape=False)

    wb.properties.title = "Delta Chi UF Alumni Career Directory"
    wb.properties.subject = "Alumni jobs and contacts by field, with a career-value score"
    wb.properties.creator = "Delta Chi UF alumni research"
    wb.properties.description = f"For Delta Chi brothers only. Information as of {month}."
    wb.properties.language = "en-US"
    wb.active = 0
    wb.save(out)
    return main, review, fields, top_picks


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(OUTPUT / "alumni_directory.xlsx"))
    args = ap.parse_args()
    recs, skipped = build_records()
    main_rows, review, fields, top = build_workbook(recs, args.out)
    jobs = [r for r in recs if r["title"] or r["employer"]]
    print(f"wrote {args.out}: {len(main_rows)} in the directory across {len(fields)} field tabs, "
          f"{len(top)} top picks, {len(review)} need review; left out: {dict(skipped) or 'none'}")
    for what, d in (("Field / Job Type", by_row), ("Score", scores)):
        missing = sum(1 for r in jobs if r["row"] not in d)
        if missing:
            print(f"{missing} people with a job have no {what} yet")


if __name__ == "__main__":
    main()
