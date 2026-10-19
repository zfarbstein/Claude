"""Shared helpers: roster parsing, name normalisation, location matching."""
import csv
import datetime as dt
import re
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DATA = ROOT / "data"
ROSTER = DATA / "roster.csv"
QUEUE = DATA / "queue.jsonl"
ANSWER_KEY = DATA / "answer_key.jsonl"  # pilot only; the researcher never reads it
EVIDENCE = DATA / "evidence"
OUTPUT = DATA / "output"

TODAY = dt.date.today()
MAX_AGE = 100

JOB_COLUMNS = [
    "Current Job Title", "Current Employer", "Industry/Field",
    "Any Previous Notable Employers", "Years at Current Company",
    "Current City", "State", "LinkedIn Profile",
]

GENERIC_EMAIL_DOMAINS = {
    "gmail.com", "yahoo.com", "hotmail.com", "aol.com", "outlook.com", "icloud.com",
    "me.com", "mac.com", "msn.com", "live.com", "comcast.net", "att.net", "bellsouth.net",
    "verizon.net", "cox.net", "earthlink.net", "sbcglobal.net", "charter.net", "ufl.edu",
    "protonmail.com", "ymail.com", "rocketmail.com", "juno.com", "mindspring.com",
    "embarqmail.com", "tampabay.rr.com", "cfl.rr.com", "rr.com", "q.com", "windstream.net",
    "frontier.com", "optonline.net", "netzero.net", "gmx.com", "mail.com", "duck.com",
}

# Common nickname <-> legal-name pairs. Used only to decide whether the first
# name on a web page is compatible with the roster; the last name must always
# match exactly.
NICKNAMES = {
    "william": {"will", "bill", "billy", "liam", "willie"},
    "robert": {"rob", "bob", "bobby", "robbie", "bert"},
    "richard": {"rich", "rick", "ricky", "dick"},
    "james": {"jim", "jimmy", "jamie"},
    "john": {"jack", "johnny", "jon"},
    "jonathan": {"jon", "john", "jonny"},
    "joseph": {"joe", "joey"},
    "michael": {"mike", "mikey", "mick"},
    "christopher": {"chris", "topher"},
    "matthew": {"matt"},
    "daniel": {"dan", "danny"},
    "david": {"dave", "davey"},
    "thomas": {"tom", "tommy"},
    "charles": {"charlie", "chuck", "chas"},
    "edward": {"ed", "eddie", "ted", "ned"},
    "anthony": {"tony"},
    "andrew": {"andy", "drew"},
    "alexander": {"alex", "xander", "zander"},
    "benjamin": {"ben", "benji"},
    "nicholas": {"nick", "nicky"},
    "stephen": {"steve", "stevie"},
    "steven": {"steve", "stevie"},
    "gregory": {"greg"},
    "jeffrey": {"jeff"},
    "geoffrey": {"geoff", "jeff"},
    "kenneth": {"ken", "kenny"},
    "ronald": {"ron", "ronnie"},
    "donald": {"don", "donnie"},
    "timothy": {"tim", "timmy"},
    "patrick": {"pat", "paddy"},
    "peter": {"pete"},
    "samuel": {"sam", "sammy"},
    "zachary": {"zach", "zack"},
    "jacob": {"jake"},
    "joshua": {"josh"},
    "lawrence": {"larry"},
    "leonard": {"len", "lenny", "leo"},
    "raymond": {"ray"},
    "gerald": {"jerry", "gerry"},
    "douglas": {"doug"},
    "frederick": {"fred", "freddie"},
    "harold": {"hal", "harry"},
    "henry": {"hank", "harry"},
    "eugene": {"gene"},
    "francis": {"frank"},
    "franklin": {"frank"},
    "philip": {"phil"},
    "phillip": {"phil"},
    "theodore": {"ted", "teddy", "theo"},
    "walter": {"walt"},
    "albert": {"al", "bert"},
    "alan": {"al"},
    "allen": {"al"},
    "alfred": {"al", "fred"},
    "arthur": {"art"},
    "bradley": {"brad"},
    "bradford": {"brad"},
    "cameron": {"cam"},
    "dennis": {"denny"},
    "jeremy": {"jerry"},
    "jerome": {"jerry"},
    "kevin": {"kev"},
    "louis": {"lou"},
    "maxwell": {"max"},
    "nathaniel": {"nate", "nathan"},
    "nathan": {"nate"},
    "randall": {"randy"},
    "russell": {"russ"},
    "terrence": {"terry"},
    "vincent": {"vince", "vinny"},
    "jacques": {"jack"},
    "frederic": {"fred"},
    "herbert": {"herb"},
    "stanley": {"stan"},
    "clifford": {"cliff"},
    "joel": {"joe"},
    "mitchell": {"mitch"},
    "spencer": {"spence"},
}


def norm(s):
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z]", "", s.lower())


def norm_words(s):
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9 ]", " ", s.lower()).split()


def first_names(legal, informal):
    names = {norm(legal), norm(informal)} - {""}
    for n in list(names):
        names |= NICKNAMES.get(n, set())
        names |= {k for k, v in NICKNAMES.items() if n in v}
    return names


def name_matches(roster, name_on_source):
    """Last name must match exactly; first name must be the legal name, the
    informal name, or a known nickname of either."""
    words = [norm(w) for w in norm_words(name_on_source)]
    words = [w for w in words if w not in {"jr", "sr", "ii", "iii", "iv", "dr", "md", "esq", "cpa", "pe", "phd", "cfa", "mba", "jd"}]
    if len(words) < 2:
        return False
    last_ok = norm(roster["last"]) in {words[-1], "".join(words[1:]), "".join(words[-2:])}
    first_ok = words[0] in first_names(roster["first"], roster["informal"])
    # "B. Scott LaMont" style: legal first initial, then a middle name.
    if len(words[0]) == 1 and len(words) >= 3 and words[0] == norm(roster["first"])[:1]:
        first_ok = True
    return last_ok and first_ok


def parse_date(s):
    try:
        return dt.datetime.strptime(s.strip(), "%m/%d/%Y").date()
    except ValueError:
        return None


def age_on(dob, day=TODAY):
    return day.year - dob.year - ((day.month, day.day) < (dob.month, dob.day))


def parse_address(addr):
    """Roster addresses look like 'street\\ncity, ST  zip\\nUSA'."""
    for line in reversed((addr or "").splitlines()):
        m = re.match(r"\s*(.+?),\s*([A-Za-z]{2})\s+(\d{5})", line)
        if m:
            return m.group(1).strip().title(), m.group(2).upper(), m.group(3)
    return "", "", ""


STATE_NAMES = {
    "alabama": "AL", "alaska": "AK", "arizona": "AZ", "arkansas": "AR", "california": "CA",
    "colorado": "CO", "connecticut": "CT", "delaware": "DE", "florida": "FL", "georgia": "GA",
    "hawaii": "HI", "idaho": "ID", "illinois": "IL", "indiana": "IN", "iowa": "IA",
    "kansas": "KS", "kentucky": "KY", "louisiana": "LA", "maine": "ME", "maryland": "MD",
    "massachusetts": "MA", "michigan": "MI", "minnesota": "MN", "mississippi": "MS",
    "missouri": "MO", "montana": "MT", "nebraska": "NE", "nevada": "NV", "newhampshire": "NH",
    "newjersey": "NJ", "newmexico": "NM", "newyork": "NY", "northcarolina": "NC",
    "northdakota": "ND", "ohio": "OH", "oklahoma": "OK", "oregon": "OR", "pennsylvania": "PA",
    "rhodeisland": "RI", "southcarolina": "SC", "southdakota": "SD", "tennessee": "TN",
    "texas": "TX", "utah": "UT", "vermont": "VT", "virginia": "VA", "washington": "WA",
    "westvirginia": "WV", "wisconsin": "WI", "wyoming": "WY", "districtofcolumbia": "DC",
}


def state_code(s):
    n = norm(s)
    if len(n) == 2:
        return n.upper()
    return STATE_NAMES.get(n, "")


def same_city(roster, city, state):
    return (
        bool(roster["city"])
        and norm(city) == norm(roster["city"])
        and state_code(state) == roster["state"]
    )


def read_roster():
    with open(ROSTER, encoding="utf-8", errors="replace", newline="") as f:
        return list(csv.DictReader(f))
