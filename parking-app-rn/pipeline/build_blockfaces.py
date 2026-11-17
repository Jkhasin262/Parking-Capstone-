"""Build data/blockfaces.geojson for the app from two NYC Open Data files.

Usage:
  python build_blockfaces.py <Centerline.geojson> <Parking_Regulation_Locations_and_Signs.csv> <output.geojson>

What it does, in plain words:
  1. From the street map (Centerline), draws a straight line for each street (E 61-80 St)
     and each avenue (Park, Lexington, 3rd, 2nd, 1st), then finds every corner where they cross.
  2. Makes a "block face" for each side of each block: e.g. E 63 St between 3rd and 2nd Ave,
     north side. It's drawn along the curb, a little in from both corners.
  3. Reads every parking sign in the area, turns its text into rules (signs.py), and attaches
     the rules to the block face the sign is on.
"""
import csv
import json
import math
import statistics
import sys
from collections import defaultdict

from names import AVENUES, STREETS, norm, pretty
from signs import parse_sign

M_PER_DEG = 111320.0
REF_LAT = 40.77
COS = math.cos(math.radians(REF_LAT))
FT = 0.3048

# Only use map points around the test area when fitting lines (all these roads are straight here).
BOX = (-73.978, 40.755, -73.940, 40.783)  # west, south, east, north


def to_xy(lng, lat):
    return (lng * M_PER_DEG * COS, lat * M_PER_DEG)


def to_lnglat(x, y):
    return [round(x / (M_PER_DEG * COS), 7), round(y / M_PER_DEG, 7)]


def fit_line(points):
    """Best straight line through points: (center point, unit direction)."""
    n = len(points)
    cx = sum(p[0] for p in points) / n
    cy = sum(p[1] for p in points) / n
    sxx = sum((p[0] - cx) ** 2 for p in points)
    syy = sum((p[1] - cy) ** 2 for p in points)
    sxy = sum((p[0] - cx) * (p[1] - cy) for p in points)
    angle = 0.5 * math.atan2(2 * sxy, sxx - syy)
    return (cx, cy), (math.cos(angle), math.sin(angle))


def intersect(line_a, line_b):
    (ax, ay), (adx, ady) = line_a
    (bx, by), (bdx, bdy) = line_b
    det = adx * (-bdy) - ady * (-bdx)
    t = ((bx - ax) * (-bdy) - (by - ay) * (-bdx)) / det
    return (ax + t * adx, ay + t * ady)


def load_roads(centerline_path):
    """Returns {name: {"points": {trafdir: [xy...]}, "width_ft": median width}} for our streets/avenues."""
    wanted = set(STREETS) | set(AVENUES)
    with open(centerline_path) as f:
        data = json.load(f)
    roads = defaultdict(lambda: {"points": defaultdict(list), "widths": []})
    for feat in data["features"]:
        p = feat["properties"]
        if p.get("boroughcode") != "1" or p.get("rw_type") != "1":
            continue
        name = norm(p.get("full_street_name"))
        if name not in wanted:
            continue
        geom = feat["geometry"]
        lines = geom["coordinates"] if geom["type"] == "MultiLineString" else [geom["coordinates"]]
        inside = False
        for line in lines:
            for lng, lat in line:
                if BOX[0] <= lng <= BOX[2] and BOX[1] <= lat <= BOX[3]:
                    roads[name]["points"][p.get("trafdir") or "?"].append(to_xy(lng, lat))
                    inside = True
        if inside and p.get("streetwidth"):
            roads[name]["widths"].append(float(p["streetwidth"]))
    for name in wanted:
        if name not in roads:
            sys.exit(f"Couldn't find {name} in the centerline file.")
    return roads


def road_lines(road):
    """A road is either one roadbed, or two (like Park Ave, with a median): then one line per side."""
    pts = road["points"]
    width = statistics.median(road["widths"]) * FT
    ft, tf = pts.get("FT", []), pts.get("TF", [])
    if len(ft) >= 4 and len(tf) >= 4:
        la, lb = fit_line(ft), fit_line(tf)
        # distance between the two roadbeds
        (ax, ay), (dx, dy) = la
        bx, by = lb[0]
        gap = abs((bx - ax) * (-dy) + (by - ay) * dx)
        if gap > 8:
            return [la, lb], width
    allpts = [p for group in pts.values() for p in group]
    return [fit_line(allpts)], width


def main(centerline_path, signs_path, out_path):
    roads = load_roads(centerline_path)

    # Grid directions: "north" runs along the avenues from 61st toward 80th; "east" runs along the
    # streets from Park toward 1st Ave.
    street_line = {s: road_lines(roads[s]) for s in STREETS}
    avenue_line = {a: road_lines(roads[a]) for a in AVENUES}
    c61 = intersect(street_line["E 61 ST"][0][0], avenue_line["3 AVE"][0][0])
    c80 = intersect(street_line["E 80 ST"][0][0], avenue_line["3 AVE"][0][0])
    cpark = intersect(street_line["E 70 ST"][0][0], avenue_line["PARK AVE"][0][0])
    c1st = intersect(street_line["E 70 ST"][0][0], avenue_line["1 AVE"][0][0])
    north = unit(c80[0] - c61[0], c80[1] - c61[1])
    east = unit(c1st[0] - cpark[0], c1st[1] - cpark[1])

    def side_line(lines, toward):
        """Pick the roadbed on the given side (for divided roads like Park Ave)."""
        if len(lines) == 1:
            return lines[0]
        return max(lines, key=lambda l: l[0][0] * toward[0] + l[0][1] * toward[1])

    faces = {}

    def add_face(on, a, b, side, line, half_width, trim_a, trim_b, toward):
        """Curb line of `line` on side `toward`, from crossing road a to crossing road b."""
        start = intersect(line, a)
        end = intersect(line, b)
        dx, dy = unit(end[0] - start[0], end[1] - start[1])
        offset = max(half_width - 1.2, 2.0)  # center of the parking lane, just in from the curb
        ox, oy = toward[0] * offset, toward[1] * offset
        p1 = (start[0] + dx * trim_a + ox, start[1] + dy * trim_a + oy)
        p2 = (end[0] - dx * trim_b + ox, end[1] - dy * trim_b + oy)
        return {"coords": [to_lnglat(*p1), to_lnglat(*p2)]}

    # Street faces: each street, between each pair of neighboring avenues, north and south side.
    for s in STREETS:
        (slines, swidth) = street_line[s]
        sline = slines[0]
        for i in range(len(AVENUES) - 1):
            wa, ea = AVENUES[i], AVENUES[i + 1]
            wlines, wwidth = avenue_line[wa]
            elines, ewidth = avenue_line[ea]
            west_bed = side_line(wlines, east)          # roadbed of the west avenue closest to this block
            east_bed = side_line(elines, (-east[0], -east[1]))
            trim_w = (wwidth if len(wlines) == 1 else wwidth) / 2 + 5
            trim_e = (ewidth if len(elines) == 1 else ewidth) / 2 + 5
            for side, toward in (("N", north), ("S", (-north[0], -north[1]))):
                key = (s, wa, ea, side)
                faces[key] = add_face(s, west_bed, east_bed, side, sline, swidth / 2, trim_w, trim_e, toward)

    # Avenue faces: each avenue, between each pair of neighboring streets, west and east side.
    for a in AVENUES:
        alines, awidth = avenue_line[a]
        for i in range(len(STREETS) - 1):
            ss, ns = STREETS[i], STREETS[i + 1]
            sline_s, swidth_s = street_line[ss]
            sline_n, swidth_n = street_line[ns]
            for side, toward in (("W", (-east[0], -east[1])), ("E", east)):
                bed = side_line(alines, toward)
                key = (a, ss, ns, side)
                faces[key] = add_face(a, sline_s[0], sline_n[0], side, bed, awidth / 2,
                                      swidth_s / 2 + 5, swidth_n / 2 + 5, toward)

    # Signs -> rules on the right face.
    order = {name: i for i, name in enumerate(STREETS)} | {name: i for i, name in enumerate(AVENUES)}
    rules_by_face = defaultdict(list)
    seen = defaultdict(set)
    matched = unmatched = 0
    with open(signs_path, newline="") as f:
        for row in csv.DictReader(f):
            if row["borough"] != "Manhattan":
                continue
            on, fr, to = norm(row["on_street"]), norm(row["from_street"]), norm(row["to_street"])
            if on not in order or fr not in order or to not in order:
                continue
            a, b = sorted([fr, to], key=lambda n: order[n])
            key = (on, a, b, row["side_of_street"].strip().upper())
            if key not in faces:
                unmatched += 1
                continue
            matched += 1
            for rule in parse_sign(row["sign_description"]) or []:
                sig = json.dumps(rule, sort_keys=True)
                if sig not in seen[key]:
                    seen[key].add(sig)
                    rules_by_face[key].append(rule)

    # Decide which "anytime" no-parking signs cover only part of a block (near a corner or
    # hydrant) vs. the whole block. If a block has any sign that allows parking at some time,
    # the anytime restriction is only part of the block.
    for key, rules in rules_by_face.items():
        allows = any(
            r["kind"] in ("metered", "time_limit", "street_cleaning", "commercial_only")
            or (r["kind"] in ("no_parking", "no_standing", "no_stopping") and not r.get("anytime"))
            for r in rules
        )
        for r in rules:
            if r["kind"] in ("bus_stop", "special_zone"):
                r["partial"] = True
            elif r.get("anytime") and r["kind"] in ("no_parking", "no_standing", "no_stopping"):
                r["partial"] = allows
        rules.sort(key=sort_key)

    features = []
    for (on, a, b, side), face in faces.items():
        rules = rules_by_face.get((on, a, b, side), [])
        features.append({
            "type": "Feature",
            "geometry": {"type": "LineString", "coordinates": face["coords"]},
            "properties": {
                "id": f"{on}|{a}|{b}|{side}".replace(" ", "_"),
                "street": pretty(on),
                "from": pretty(a),
                "to": pretty(b),
                "side": {"N": "north", "S": "south", "E": "east", "W": "west"}[side],
                "rules": rules,
            },
        })

    with open(out_path, "w") as f:
        json.dump({"type": "FeatureCollection", "features": features}, f, separators=(",", ":"))
    with_rules = sum(1 for ft in features if ft["properties"]["rules"])
    print(f"{len(features)} block faces, {with_rules} with sign rules; "
          f"{matched} signs matched, {unmatched} on blocks outside the grid")


def unit(x, y):
    d = math.hypot(x, y)
    return (x / d, y / d)


def sort_key(rule):
    # whole-block restrictions first, then meters, then partial zones
    if rule.get("partial"):
        return 2
    if rule["kind"] in ("metered", "time_limit"):
        return 1
    return 0


if __name__ == "__main__":
    if len(sys.argv) != 4:
        sys.exit(__doc__)
    main(*sys.argv[1:])
