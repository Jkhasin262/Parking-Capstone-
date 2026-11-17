"""Read one NYC parking sign description and turn it into rules the app can check.

Example:
  'NO PARKING (SANITATION BROOM SYMBOL) MONDAY THURSDAY 9AM-10:30AM <-> (SUPERSEDES SP-413C)'
  -> [{kind: 'street_cleaning', days: [1, 4], start: '09:00', end: '10:30', text: ...}]

Days use 0 = Sunday ... 6 = Saturday (same as JavaScript), so the app can compare directly.
"""
import re

DAY_NAMES = {
    "SUNDAY": 0, "SUN": 0, "MONDAY": 1, "MON": 1, "TUESDAY": 2, "TUES": 2, "TUE": 2,
    "WEDNESDAY": 3, "WED": 3, "THURSDAY": 4, "THURS": 4, "THUR": 4, "THU": 4,
    "FRIDAY": 5, "FRI": 5, "SATURDAY": 6, "SAT": 6,
}
ALL_DAYS = [0, 1, 2, 3, 4, 5, 6]
DAY_WORD = r"(?:SUNDAY|MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY|SATURDAY|SUN|MON|TUES|TUE|WED|THURS|THUR|THU|FRI|SAT)"
DAY_GROUP = re.compile(
    rf"\b(?:EXCEPT\s+{DAY_WORD}(?:\s*(?:&|AND|,)\s*{DAY_WORD})*"   # EXCEPT SUNDAY
    rf"|{DAY_WORD}\s*(?:-|THRU|THROUGH)\s*{DAY_WORD}"              # MONDAY-FRIDAY
    rf"|{DAY_WORD}(?:\s*(?:&|AND|,)?\s*{DAY_WORD})*"               # MONDAY THURSDAY
    rf"|SCHOOL\s+DAYS|ALL\s+DAYS)\b"
)
TIME = r"(?:\d{1,2}(?::\d{2})?\s*(?:AM|PM)?|NOON|MIDNIGHT)"
TIME_RANGE = re.compile(rf"({TIME})\s*-\s*({TIME})")

# Signs that aren't parking rules at all (locator numbers, bus route panels, etc.).
SKIP = re.compile(
    r"PAY-BY-CELL|PANEL|REAL TIME|LOCATOR|UNION SQ|METERS ARE NOT IN EFFECT|RIDER|"
    r"CURB LINE|BUILDING LINE|PROPERTY LINE|MUNI-METER|PAY AT MUNI|SEE (?:OTHER|BACK)|"
    r"^\s*(?:<-+>|-+>|<-+)\s*$"
)


def clean(text):
    t = re.sub(r"\(S[UY]PERSEDES[^)]*\)", "", text.upper())
    t = re.sub(r"W/ ?SINGLE ARROW|\bW/(?= )", "", t)
    t = re.sub(r"BUS STOP SIGN", "BUS STOP", t)
    t = re.sub(r"<-+>|-+>|<-+", "", t)
    t = t.replace("(SANITATION BROOM SYMBOL)", "STREET CLEANING")
    t = re.sub(r"\bHMP\b", "HOUR METERED PARKING", t)
    t = re.sub(r"\bAVO\b", "AUTHORIZED VEHICLES ONLY", t)
    # "TRUCK (SYMBOL) TRUCK LOADING ONLY" -> "TRUCK LOADING ONLY": drop the picture's name.
    t = re.sub(r"\b[A-Z/-]+\s*\((?:SYMBOL|SYMBOLS)\)\s*", "", t)
    t = re.sub(r"\s*\((?:BUS & HANDICAP SYMBOLS|ACCESS-A-RIDE SYMBOL)\)", "", t)
    t = re.sub(r"\b(\w+) \1\b", r"\1", t)  # "TAXI TAXI STAND" -> "TAXI STAND"
    return re.sub(r"\s+", " ", t).strip()


def parse_days(group):
    g = group.upper()
    if "SCHOOL" in g:
        return [1, 2, 3, 4, 5]  # approximation: weekdays
    if "ALL" in g:
        return ALL_DAYS
    names = re.findall(DAY_WORD, g)
    nums = [DAY_NAMES[n] for n in names]
    if g.startswith("EXCEPT"):
        return [d for d in ALL_DAYS if d not in nums]
    if re.search(r"-|THRU|THROUGH", g) and len(nums) == 2:
        a, b = nums
        days, d = [], a
        while True:
            days.append(d)
            if d == b:
                break
            d = (d + 1) % 7
        return days
    return sorted(set(nums))


def to_24h(t, fallback_suffix=None):
    t = t.replace(" ", "")
    if t == "NOON":
        return 12 * 60, "PM"
    if t == "MIDNIGHT":
        return 24 * 60, "AM"
    m = re.fullmatch(r"(\d{1,2})(?::(\d{2}))?(AM|PM)?", t)
    h, mins, suf = int(m.group(1)), int(m.group(2) or 0), m.group(3) or fallback_suffix
    if suf == "PM" and h != 12:
        h += 12
    if suf == "AM" and h == 12:
        h = 0
    return h * 60 + mins, suf


def fmt(minutes):
    if minutes >= 24 * 60:
        return "24:00"
    return f"{minutes // 60:02d}:{minutes % 60:02d}"


def parse_range(a, b):
    end, end_suf = to_24h(b)
    start, _ = to_24h(a, fallback_suffix=end_suf)
    if start == 24 * 60:          # "MIDNIGHT-7AM"
        start = 0
    # "11-12:30PM": the start borrowed PM but must be 11 AM.
    if start > end and end_suf == "PM" and not re.search(r"AM|PM", a):
        start -= 12 * 60
    return fmt(start), fmt(end)


def kind_of(t):
    if "STREET CLEANING" in t:
        return "street_cleaning"
    if "COMMERCIAL VEHICLES ONLY" in t:
        return "commercial_only"
    if re.search(r"\bBUS\b", t):
        return "bus_stop"
    if re.search(r"LOADING|AUTHORIZED VEHICLES|\bAVO\b|CONSUL|DIPLOMAT|AMBULETTE|AMBULANCE|DOCTOR|LICENSE PLATES ONLY|TAXI|HOTEL|FIRE|POLICE|PERMIT|CAR SHARE|ELECTRIC", t):
        return "special_zone"
    if "NO STOPPING" in t:
        return "no_stopping"
    if "NO STANDING" in t:
        return "no_standing"
    if "NO PARKING" in t:
        return "no_parking"
    if "HOUR METERED PARKING" in t:
        return "metered"
    if re.search(r"\d+\s*(?:HOUR|MINUTE) PARKING", t):
        return "time_limit"
    return None


def parse_sign(description):
    """Returns a list of rules (one per day/time group), or None if it isn't a parking rule."""
    if not description or SKIP.search(description.upper()):
        return None
    text = clean(description)
    kind = kind_of(text)
    if not kind:
        return None
    hours = None
    m = re.search(r"(\d+)\s*HOUR", text)
    if m and kind in ("metered", "time_limit", "commercial_only"):
        hours = int(m.group(1))

    base = {"kind": kind, "text": text}
    if hours:
        base["hours"] = hours

    times = list(TIME_RANGE.finditer(text))
    if "ANYTIME" in text or not times or kind == "bus_stop":
        return [{**base, "anytime": True}]

    groups = list(DAY_GROUP.finditer(text))
    rules = []
    for tm in times:
        start, end = parse_range(tm.group(1), tm.group(2))
        before = [g for g in groups if g.end() <= tm.start()]
        after = [g for g in groups if g.start() >= tm.end()]
        if len(groups) <= 1:
            days = parse_days(groups[0].group(0)) if groups else ALL_DAYS
        elif before:
            days = parse_days(before[-1].group(0))
        else:
            days = parse_days(after[0].group(0))
        rules.append({**base, "days": days, "start": start, "end": end})
    return rules
