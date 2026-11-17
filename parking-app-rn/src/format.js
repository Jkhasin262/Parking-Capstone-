// Turning block and rule data into the words shown on screen.

export function faceName(face) {
  const p = face.properties;
  const side = p.side ? `${p.side} side` : "";
  return {
    street: p.street || "Unnamed block",
    between: p.from && p.to ? `${p.from} to ${p.to}${side ? " · " + side : ""}` : side,
  };
}

const DAY_ABBR = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

export function describeRule(rule) {
  if (rule.text) return rule.text;
  const days = rule.days ? rule.days.map((d) => DAY_ABBR[d]).join(" ") : "ANYTIME";
  const time = rule.start ? `${rule.start}–${rule.end}` : "";
  const name = rule.kind.replace("_", " ").toUpperCase();
  return `${rule.hours ? rule.hours + " HOUR " : ""}${name} ${time} ${days}`.trim();
}

export function formatTime(date) {
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function formatDayTime(date) {
  return date.toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" });
}

// Block faces store points as [lng, lat]; the map wants { latitude, longitude }.
export function toLatLngs(face) {
  return face.geometry.coordinates.map(([longitude, latitude]) => ({ latitude, longitude }));
}
