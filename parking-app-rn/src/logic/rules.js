// Parking rules: decides whether parking is allowed on a block face at a given time.
//
// Each block face has a list of rules made from NYC parking signs, like:
//   { kind: "street_cleaning", days: [5], start: "08:00", end: "09:30", text: "NO PARKING 8-9:30AM FRI" }
//   { kind: "metered", days: [1,2,3,4,5,6], start: "08:00", end: "19:00", hours: 2, text: "2 HOUR METERED PARKING" }
// days use 0 = Sunday ... 6 = Saturday. A rule with no start/end applies all day.

// Rule kinds that mean "you can't leave a parked car here" while they're active.
// Rules marked partial (bus stops, loading zones, no standing near a corner) only cover part
// of the block, so they never gray out the whole block.
// "commercial_only" (trucks/vans only) blocks regular cars unless a regular meter on the same
// block is also active then, which means part of the block is still open to cars.
const BLOCKING = new Set(["no_parking", "no_standing", "no_stopping", "street_cleaning"]);

function toMinutes(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

// Is this rule active at this moment?
export function ruleActiveAt(rule, date) {
  if (rule.days && !rule.days.includes(date.getDay())) return false;
  if (!rule.start || !rule.end) return true; // all day (signs that say ANYTIME)
  const now = date.getHours() * 60 + date.getMinutes();
  const start = toMinutes(rule.start);
  const end = toMinutes(rule.end);
  // Handles overnight rules too, like 10PM-6AM.
  return start <= end ? now >= start && now < end : now >= start || now < end;
}

function blocks(rule, ctx) {
  if (rule.partial || !BLOCKING.has(rule.kind)) return false;
  // When alternate side parking is suspended (holidays, snow), street cleaning rules don't apply.
  if (rule.kind === "street_cleaning" && ctx.aspSuspended) return false;
  return true;
}

// Main check: can you park here right now?
// Returns { allowed, reason, active } where active = the rules in effect now.
export function parkingStatus(rules, date, ctx = {}) {
  const active = (rules || []).filter((r) => ruleActiveAt(r, date));
  const carMeterOpen = active.some((r) => r.kind === "metered" || r.kind === "time_limit");
  const blocker =
    active.find((r) => blocks(r, ctx)) ||
    (!carMeterOpen && active.find((r) => r.kind === "commercial_only"));
  return {
    allowed: !blocker,
    reason: blocker ? blocker.text || blocker.kind : null,
    active,
  };
}

// When is the next time you'd have to move your car? Looks ahead up to 7 days.
// Returns { at: Date, rule } or null.
export function nextRestriction(rules, from, ctx = {}) {
  let best = null;
  for (const rule of rules || []) {
    if (!blocks(rule, ctx) || !rule.start) continue;
    for (let d = 0; d < 8; d++) {
      const day = new Date(from);
      day.setDate(day.getDate() + d);
      if (rule.days && !rule.days.includes(day.getDay())) continue;
      const [h, m] = rule.start.split(":").map(Number);
      day.setHours(h, m, 0, 0);
      if (day > from && (!best || day < best.at)) best = { at: day, rule };
      if (day > from) break;
    }
  }
  return best;
}
