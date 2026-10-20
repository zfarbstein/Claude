"""Build the brothers' alumni career directory (an Excel workbook) from the research results.

    python3 directory.py                         # -> data/output/alumni_directory.xlsx
    python3 directory.py --after-libreoffice F   # after recalculating F with LibreOffice (see below)

Tabs: Start Here (instructions), Alumni Directory (confirmed jobs: the research team's Complete /
Partial rows and rows score.py VERIFIED), Needs Review (everyone else, each with a reason and
Decision / Reviewer Notes columns), Fields at a Glance (counts by Field and Job Type).

Field and Job Type come from data/directory_labels.json ({roster row: {"field", "job_type"}}), made
by classifying each job title + employer into FIELDS and TYPES below; rows without a label get
blank ones, so label new people before sharing a new version.

Only career-useful facts go in. The research team's free-text notes (Additional Info) are never
copied: they hold internal matching notes, home-address comparisons and other private details.
Records whose job came from a relative (a different first name on the shared email/phone) keep no
job facts. Nothing here changes the roster or roster_with_research.csv.

The workbook's counts are formulas. Excel and Google Sheets calculate them on open; to store the
results for quick-look previews, recalculate the file with LibreOffice and then run
--after-libreoffice on it.
"""
import argparse
import collections
import csv
import datetime as dt
import json
import re
import shutil
import urllib.parse
import zipfile

from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.worksheet.table import Table, TableStyleInfo

from careers import classify
from common import DATA, OUTPUT, STATE_NAMES, norm, parse_address, parse_date

LABELS = DATA / "directory_labels.json"
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
AMBER = "7A4B00"   # Needs Review headers: white text on it is 7.9:1
FILL_IN = "E8D9B5" # editable review columns (also named "(fill in)", so color isn't the only cue)
INK = "1F1F1F"
LINK = "0B57A4"    # 7:1 on white
thin = Side(style="thin", color="BFBFBF")
SENIORITY = {5: "1 - Owner / Partner / Top Executive", 4: "2 - VP / Managing Director", 3: "3 - Director",
             2: "4 - Manager", 1: "5 - Senior", 0: "6 - Professional"}
STUDENT, RETIRED = "7 - Student / In Training", "8 - Retired"


def font(**kw):
    return Font(name=FONT, size=kw.pop("size", 11), color=kw.pop("color", INK), **kw)


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


def header_row(ws, headers, widths, color):
    for c, (h, w) in enumerate(zip(headers, widths), 1):
        cell = ws.cell(row=1, column=c, value=h)
        cell.font = font(bold=True, color="FFFFFF")
        cell.fill = PatternFill("solid", fgColor=color)
        cell.alignment = Alignment(vertical="center", wrap_text=True)
        cell.border = Border(bottom=thin)
        ws.column_dimensions[get_column_letter(c)].width = w
    ws.row_dimensions[1].height = 32


def link(cell, url, text):
    cell.value = text
    cell.hyperlink = url
    cell.font = font(color=LINK, underline="single")


def add_table(ws, name, ref):
    t = Table(displayName=name, ref=ref)
    t.tableStyleInfo = TableStyleInfo(name="TableStyleLight1", showRowStripes=True)
    ws.add_table(t)


def print_setup(ws, landscape=True, pages_wide=1, title_cols=None):
    ws.page_setup.paperSize = ws.PAPERSIZE_LETTER
    ws.page_setup.pageOrder = "overThenDown"  # a person's whole row prints on consecutive pages
    ws.page_margins.left = ws.page_margins.right = 0.4
    ws.page_margins.top = ws.page_margins.bottom = 0.5
    ws.page_setup.orientation = "landscape" if landscape else "portrait"
    ws.page_setup.fitToWidth = pages_wide
    ws.page_setup.fitToHeight = 0
    ws.sheet_properties.pageSetUpPr.fitToPage = True
    if title_cols:
        ws.print_title_rows = "1:1"
        ws.print_title_cols = title_cols


def sort_key(r):
    lab = labels_for(r)
    return (not lab["field"], lab["field"] == "Other / Unknown", lab["field"],
            seniority(r, lab) or "9", r["last"].lower(), r["first"].lower())


def values(r):
    lab = labels_for(r)
    as_of = None
    if re.fullmatch(r"\d{4}-\d{2}", r["as_of"] or ""):
        as_of = dt.date(int(r["as_of"][:4]), int(r["as_of"][5:7]), 1)
    elif r["source"] == "team" and (r["title"] or r["employer"]):
        as_of = "Research team (2026)"
    return {
        "Last Name": r["last"], "First Name": r["first"], "Field": lab["field"], "Job Type": lab["job_type"],
        "Job Title": r["title"], "Possible Job Title": r["title"], "Employer": r["employer"],
        "Possible Employer": r["employer"], "Seniority": seniority(r, lab), "City": r["city"], "State": r["state"],
        "Initiated": r["init_year"], "Industry (as listed)": r["industry"], "Time at Employer": r["tenure"],
        "Previous Employers": r["previous"], "Source": r["confidence"], "Info As Of": as_of, "Notes": r["notes"],
        "Status": "Unconfirmed: don't contact yet", "Why It Needs Review": r.get("why", ""),
    }


def write_people(ws, name, people, columns, color, wrap):
    headers = [c for c, _ in columns]
    header_row(ws, headers, [w for _, w in columns], color)
    for i, r in enumerate(people, 2):
        vals = values(r)
        for c, h in enumerate(headers, 1):
            cell = ws.cell(row=i, column=c)
            cell.font = font()
            if h == "Email":
                if r["email"]:
                    link(cell, "mailto:" + r["email"], r["email"])
            elif h == "Phone":
                digits = re.sub(r"\D", "", r["phone"])
                if len(digits) == 10:
                    link(cell, "tel:+1" + digits, r["phone"])
                else:
                    cell.value = r["phone"]
            elif h == "LinkedIn":
                if r["linkedin"]:
                    link(cell, r["linkedin"], "LinkedIn profile")
                else:
                    q = urllib.parse.quote_plus(f"{r['first']} {r['last']} University of Florida")
                    link(cell, f"https://www.linkedin.com/search/results/people/?keywords={q}", "Search LinkedIn")
            else:
                cell.value = vals.get(h, "")
                if h == "Initiated":
                    cell.number_format = "0"
                if h == "Info As Of" and isinstance(cell.value, dt.date):
                    cell.number_format = "mmm yyyy"
            cell.alignment = Alignment(vertical="top", wrap_text=h in wrap, horizontal="left")
    add_table(ws, name, f"A1:{get_column_letter(len(headers))}{max(len(people), 1) + 1}")
    ws.freeze_panes = "C2"
    print_setup(ws, pages_wide=3, title_cols="A:B")
    # Field / Job Type stay on the shared lists, so the counts keep working after edits.
    for h, ref in (("Field", f"Lists!$A$2:$A${len(FIELDS) + 1}"), ("Job Type", f"Lists!$B$2:$B${len(TYPES) + 1}")):
        col = get_column_letter(headers.index(h) + 1)
        dv = DataValidation(type="list", formula1=ref, allow_blank=True, showErrorMessage=True, errorStyle="warning",
                            errorTitle=h, error=f"Pick a {h} from the list so it's counted on Fields at a Glance.")
        dv.add(f"{col}2:{col}2000")
        ws.add_data_validation(dv)
    return headers


def build_workbook(recs, out):
    global by_row
    by_row = load_labels()
    wb = Workbook()
    start = wb.active
    start.title = "Start Here"
    main = sorted([r for r in recs if r["tier"] == "main"], key=sort_key)
    review = sorted([r for r in recs if r["tier"] == "review"], key=sort_key)

    # ---------------------------------------------------------------- Alumni Directory
    dws = wb.create_sheet("Alumni Directory")
    dws.sheet_properties.tabColor = RED
    DIR_COLS = [("Last Name", 16), ("First Name", 13), ("Field", 42), ("Job Type", 36), ("Job Title", 38),
                ("Employer", 32), ("Notes", 34), ("Seniority", 35), ("City", 18), ("State", 20), ("Email", 32),
                ("Phone", 16), ("LinkedIn", 18), ("Initiated", 13), ("Industry (as listed)", 28),
                ("Time at Employer", 18), ("Previous Employers", 40), ("Source", 29), ("Info As Of", 20)]
    write_people(dws, "AlumniDirectory", main, DIR_COLS, RED,
                 wrap={"Job Title", "Employer", "Notes", "Previous Employers", "Industry (as listed)", "Time at Employer"})

    # ---------------------------------------------------------------- Needs Review
    rws = wb.create_sheet("Needs Review")
    rws.sheet_properties.tabColor = AMBER
    RV_COLS = [("Last Name", 16), ("First Name", 13), ("Status", 29), ("Why It Needs Review", 58),
               ("Decision (fill in)", 17), ("Reviewer Notes (fill in)", 30), ("LinkedIn", 18), ("Field", 42),
               ("Job Type", 36), ("Possible Job Title", 38), ("Possible Employer", 32), ("Seniority", 35), ("City", 18),
               ("State", 20), ("Email", 32), ("Phone", 16), ("Initiated", 13), ("Industry (as listed)", 28),
               ("Time at Employer", 18), ("Previous Employers", 40), ("Notes", 30), ("Info As Of", 20)]
    h = write_people(rws, "NeedsReview", review, RV_COLS, AMBER,
                     wrap={"Why It Needs Review", "Reviewer Notes (fill in)", "Notes", "Previous Employers",
                           "Possible Job Title", "Possible Employer", "Industry (as listed)", "Time at Employer"})
    dcol = get_column_letter(h.index("Decision (fill in)") + 1)
    ncol = get_column_letter(h.index("Reviewer Notes (fill in)") + 1)
    dv = DataValidation(type="list", formula1='"Correct,Wrong person,Unsure"', allow_blank=True, showInputMessage=True,
                        promptTitle="Decision", prompt="After checking LinkedIn, choose Correct, Wrong person or Unsure.",
                        showErrorMessage=True, errorStyle="warning", errorTitle="Decision",
                        error="Please choose Correct, Wrong person or Unsure.")
    dv.add(f"{dcol}2:{dcol}2000")
    rws.add_data_validation(dv)
    edge = Side(style="medium", color=AMBER)
    for row in range(1, len(review) + 202):
        for col in (dcol, ncol):
            cell = rws[f"{col}{row}"]
            if row > 1:
                cell.fill = PatternFill("solid", fgColor=FILL_IN)
            cell.border = Border(left=edge if col == dcol else cell.border.left,
                                 right=edge if col == ncol else cell.border.right,
                                 bottom=cell.border.bottom)

    # ---------------------------------------------------------------- Fields at a Glance
    gl = wb.create_sheet("Fields at a Glance")
    count = lambda key, val: sum(1 for r in main if labels_for(r)[key] == val)
    fields = sorted(FIELDS, key=lambda f: (f == "Other / Unknown", -count("field", f), f))
    types = sorted(TYPES, key=lambda t: (t == "Other", -count("job_type", t), t))
    for c, (hd, w) in enumerate(zip(["Field", "In Directory", "Needs Review", "", "Job Type", "In Directory",
                                     "Needs Review"], [42, 14, 14, 4, 38, 14, 14]), 1):
        gl.column_dimensions[get_column_letter(c)].width = w
        if hd:
            cell = gl.cell(row=1, column=c, value=hd)
            cell.font = font(bold=True, color="FFFFFF")
            cell.fill = PatternFill("solid", fgColor=RED)
            cell.alignment = Alignment(vertical="center", wrap_text=True)
    gl.row_dimensions[1].height = 32
    for i, f in enumerate(fields, 2):
        gl.cell(row=i, column=1, value=f)
        gl.cell(row=i, column=2, value=f"=COUNTIF('Alumni Directory'!C:C,A{i})")
        gl.cell(row=i, column=3, value=f"=COUNTIF('Needs Review'!H:H,A{i})")
    for i, t in enumerate(types, 2):
        gl.cell(row=i, column=5, value=t)
        gl.cell(row=i, column=6, value=f"=COUNTIF('Alumni Directory'!D:D,E{i})")
        gl.cell(row=i, column=7, value=f"=COUNTIF('Needs Review'!I:I,E{i})")
    nf, nt = len(fields) + 1, len(types) + 1
    for row in gl.iter_rows(min_row=2, max_row=max(nf, nt), max_col=7):
        for cell in row:
            if cell.value is not None:
                cell.font = font()
    for col, last in ((1, nf), (5, nt)):
        tot = last + 1
        gl.cell(row=tot, column=col, value="Total")
        for k in (1, 2):
            letter = get_column_letter(col + k)
            gl.cell(row=tot, column=col + k, value=f"=SUM({letter}2:{letter}{last})")
        for k in range(3):
            cell = gl.cell(row=tot, column=col + k)
            cell.font = font(bold=True)
            cell.border = Border(top=Side(style="thin", color=INK))
    add_table(gl, "FieldCounts", f"A1:C{nf}")
    add_table(gl, "JobTypeCounts", f"E1:G{nt}")
    gl.freeze_panes = "A2"
    gl.cell(row=max(nf, nt) + 3, column=1,
            value="Sorted by how many alumni are in the directory. Needs Review counts only rows with a possible "
                  "job.").font = font(italic=True)
    print_setup(gl, landscape=True)

    # Dropdown lists for Field and Job Type, A to Z with the catch-alls last (hidden; edit here to add a value).
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

    # ---------------------------------------------------------------- Start Here
    start.column_dimensions["A"].width = 90
    start.sheet_properties.tabColor = "404040"
    lines = [
        ("title", "Delta Chi UF Alumni Career Directory"),
        ("text", "For Delta Chi brothers only. It has alumni's personal contact details, so please don't forward it "
                 "outside the chapter, post it online, or add these addresses to mailing lists or group texts."),
        ("text", "Use it only for one-to-one career networking: no sales pitches, fundraising or mass emails."),
        ("text", "Information as of October 2026. People change jobs, so check LinkedIn before you reach out."),
        ("head", "What's in this file"),
        ("formula", '="Alumni Directory: "&(COUNTA(\'Alumni Directory\'!A:A)-1)&" alumni whose identity and job have been checked. Start here."'),
        ("formula", '="Needs Review: "&(COUNTA(\'Needs Review\'!A:A)-1)&" alumni we couldn\'t confirm yet. Each row says why. Don\'t contact anyone on this tab until it\'s been checked."'),
        ("text", "Fields at a Glance: how many alumni work in each field and each job type."),
        ("head", "How to sort and filter"),
        ("text", "Each column heading has a filter button. Click it to sort A to Z, or to show only some values, for "
                 "example Field = Law, or Job Type = Engineering."),
        ("text", "Windows: select a heading and press Alt + Down Arrow to open its filter menu. Mac: Option + Down "
                 "Arrow. Ctrl + Shift + L (Mac: Cmd + Shift + F) turns the filter buttons on or off."),
        ("text", "Phone (Excel app): tap a heading, then the filter icon. Google Sheets: use Data > Create a filter."),
        ("text", "The directory starts sorted by Field, then Seniority (most senior first), then last name. To get "
                 "back to it: sort Last Name A to Z, then Seniority A to Z, then Field A to Z (Other / Unknown will "
                 "then sort alphabetically instead of last)."),
        ("text", "Names stay on screen as you scroll right, and headings stay on screen as you scroll down. On a "
                 "small phone screen you can turn this off under View > Freeze Panes."),
        ("head", "What the columns mean"),
        ("text", "Field: the industry of his employer, e.g. Law; Healthcare & Medicine; Banking, Investing & Wealth "
                 "Management."),
        ("text", "Job Type: what he does, e.g. Legal, Engineering, Sales & Business Development. An in-house lawyer "
                 "at a bank is Field = Banking, Investing & Wealth Management, Job Type = Legal."),
        ("text", "Notes: read this before you reach out. It says if the job may have changed, if newer data shows a "
                 "different employer, or if the city came from the chapter's mailing address."),
        ("text", "Seniority: 1 Owner / Partner / Top Executive, 2 VP / Managing Director, 3 Director, 4 Manager, "
                 "5 Senior, 6 Professional, 7 Student / In Training, 8 Retired. Sorting A to Z puts the most senior first."),
        ("text", "City and State: where he works or lives now. Phone numbers and emails are links: tap to call or "
                 "email."),
        ("text", "Initiated: the year he was initiated, to help you introduce yourself."),
        ("text", "Industry (as listed), Time at Employer, Previous Employers: as written on LinkedIn or by the "
                 "research team. Time at Employer may read 'Since 2021' or '4 years'."),
        ("text", "Source: 'Confirmed by research team' means the chapter's research volunteers found and checked him. "
                 "'Verified by data match' means a data provider's record matched his email, phone or UF details plus "
                 "at least one more fact."),
        ("text", "Info As Of: when the job information was last updated."),
        ("head", "Needs Review: how to help"),
        ("text", "These are alumni we couldn't confirm. Possible Job Title and Possible Employer may not be his. "
                 "Don't contact anyone on this tab, or their family, until the row is checked."),
        ("text", "To check one: open the LinkedIn link (or Search LinkedIn), compare the name, UF and city, then pick "
                 "Correct, Wrong person or Unsure in Decision (fill in), and add anything useful in Reviewer Notes "
                 "(fill in). Those are the only two columns to fill in (columns E and F, shaded tan)."),
        ("text", "Some rows say the record belonged to a family member who shares his email or phone. We removed "
                 "that person's details, so those rows have no job; his email or phone on file may reach the family "
                 "member."),
        ("text", "Send the file back to the alumni research team when you've made decisions, so confirmed people "
                 "move to the directory."),
        ("head", "Editing"),
        ("text", "Nothing is locked. Fix a job, add a note, or type a new row right under a table and it joins the "
                 "table. Pick Field and Job Type from their dropdowns so the counts on Fields at a Glance include it."),
        ("text", "If an alumnus asks to be removed or corrected, delete or fix his row and tell the alumni research "
                 "team so the master roster is updated too."),
        ("head", "Reaching out"),
        ("text", "Say you're a Delta Chi brother at UF, mention his initiation year or a shared major, and ask a "
                 "specific question (15 minutes of advice, how he got into the field). Keep it short and thank him "
                 "either way."),
    ]
    STYLE = {"title": font(size=18, bold=True, color=RED), "head": font(size=13, bold=True, color=RED),
             "text": font(), "formula": font()}
    for i, (kind, text) in enumerate(lines, 1):
        c = start.cell(row=i, column=1, value=text)
        c.font = STYLE[kind]
        c.alignment = Alignment(wrap_text=True, vertical="top")
    start.sheet_view.showGridLines = False
    print_setup(start, landscape=False)

    wb.properties.title = "Delta Chi UF Alumni Career Directory"
    wb.properties.subject = "Alumni jobs and contacts, sortable by field and job type"
    wb.properties.creator = "Delta Chi UF alumni research"
    wb.properties.description = "For Delta Chi brothers only. Information as of October 2026."
    wb.properties.language = "en-US"
    wb.active = 0
    wb.save(out)
    return main, review


def after_libreoffice(path):
    """A LibreOffice recalculation (which stores the formula results that phone and Drive previews
    show) drops every table's style and writes each sheet's print titles twice, which makes desktop
    Excel offer to repair the file. Put the styles back and keep one print-titles name per sheet."""
    tmp = str(path) + ".tmp"
    STYLE = ('<tableStyleInfo name="TableStyleLight1" showFirstColumn="0" showLastColumn="0" '
             'showRowStripes="1" showColumnStripes="0"/>')
    fixed = 0
    with zipfile.ZipFile(path) as zin, zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED) as zout:
        for item in zin.infolist():
            data = zin.read(item.filename)
            if re.fullmatch(r"xl/tables/table\d+\.xml", item.filename):
                xml = data.decode("utf-8")
                if "<tableStyleInfo" not in xml:
                    xml = re.sub(r"(</table>\s*)$", STYLE + r"\1", xml)
                    fixed += 1
                data = xml.encode("utf-8")
            if item.filename == "xl/workbook.xml":
                # LibreOffice writes each sheet's print titles twice; Excel would ask to repair the file.
                xml, seen = data.decode("utf-8"), set()
                def once(m):
                    attrs = dict(re.findall(r'(\w+)="([^"]*)"', m.group(1)))
                    key = (attrs.get("name"), attrs.get("localSheetId"))
                    if key in seen:
                        return ""
                    seen.add(key)
                    return m.group(0)
                new = re.sub(r"<definedName\b([^>]*)>.*?</definedName>", once, xml, flags=re.S)
                if new != xml:
                    print("removed duplicate defined names")
                data = new.encode("utf-8")
            zout.writestr(item, data)
    shutil.move(tmp, path)
    return fixed


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--after-libreoffice", metavar="XLSX", help="fix a workbook after a LibreOffice recalculation")
    ap.add_argument("--out", default=str(OUTPUT / "alumni_directory.xlsx"))
    args = ap.parse_args()
    if args.after_libreoffice:
        print(f"restored style on {after_libreoffice(args.after_libreoffice)} tables")
        return
    recs, skipped = build_records()
    main_rows, review = build_workbook(recs, args.out)
    unlabeled = sum(1 for r in recs if (r["title"] or r["employer"]) and r["row"] not in by_row)
    print(f"wrote {args.out}: {len(main_rows)} in the directory, {len(review)} need review; "
          f"left out: {dict(skipped) or 'none'}")
    if unlabeled:
        print(f"{unlabeled} people with a job have no Field / Job Type yet (add them to {LABELS.name})")


if __name__ == "__main__":
    main()
