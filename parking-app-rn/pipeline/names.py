"""Turn the many ways NYC writes street names into one standard form, e.g.
'EAST   63 STREET', 'E  63 ST', 'E 63RD ST' -> 'E 63 ST'; '3 AVENUE', 'THIRD AVE' -> '3 AVE'."""
import re

ORDINAL_WORDS = {"FIRST": "1", "SECOND": "2", "THIRD": "3"}
STREETS = [f"E {n} ST" for n in range(61, 81)]                       # E 61 ST ... E 80 ST
AVENUES = ["PARK AVE", "LEXINGTON AVE", "3 AVE", "2 AVE", "1 AVE"]    # west -> east


def norm(name):
    if not name:
        return ""
    s = re.sub(r"\s+", " ", name.upper()).strip()
    s = re.sub(r"\bEAST\b", "E", s)
    s = re.sub(r"\bSTREET\b", "ST", s)
    s = re.sub(r"\bAVENUE\b", "AVE", s)
    s = re.sub(r"\b(\d+)(ST|ND|RD|TH)\b", r"\1", s)
    for word, num in ORDINAL_WORDS.items():
        s = re.sub(rf"\b{word} AVE\b", f"{num} AVE", s)
    return s


def pretty(name):
    """'E 63 ST' -> 'E 63rd St', '3 AVE' -> '3rd Ave', 'LEXINGTON AVE' -> 'Lexington Ave'."""
    def ordinal(n):
        n = int(n)
        suf = "th" if 10 <= n % 100 <= 20 else {1: "st", 2: "nd", 3: "rd"}.get(n % 10, "th")
        return f"{n}{suf}"
    parts = []
    for w in name.split():
        if w.isdigit():
            parts.append(ordinal(w))
        elif w == "E":
            parts.append("E")
        else:
            parts.append(w.capitalize())
    return " ".join(parts)
