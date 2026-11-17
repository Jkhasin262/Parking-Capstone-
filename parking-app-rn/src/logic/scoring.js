// Scoring: turns rules + driver reports into a color for each block face.
//
// Version 1 is simple on purpose (the AI model comes later, once we have weeks of reports):
//   1. If the signs say no parking right now -> "noparking" (gray)
//   2. If drivers reported recently -> count spots opening up (leaves minus parks)
//   3. No recent reports -> a rough guess from the time of day

import { parkingStatus } from "./rules.js";

export const LABELS = {
  likely: "Likely to find a spot",
  maybe: "Maybe",
  unlikely: "Unlikely",
  noparking: "No parking right now",
};

// Rough guess when nobody has reported. Residential blocks fill up evenings and overnight.
function baselineGuess(date) {
  const h = date.getHours();
  const weekend = date.getDay() === 0 || date.getDay() === 6;
  if (h >= 18 || h < 7) return "unlikely";
  if (!weekend && h >= 10 && h < 16) return "maybe";
  return "unlikely";
}

export function scoreFace(face, reports, date, ctx, windowMinutes) {
  const status = parkingStatus(face.properties.rules, date, ctx);
  if (!status.allowed) {
    return { status: "noparking", basis: "signs", detail: status.reason, active: status.active };
  }

  const since = date.getTime() - windowMinutes * 60 * 1000;
  const recent = reports.filter((r) => r.faceId === face.properties.id && r.time >= since);
  if (recent.length === 0) {
    return { status: baselineGuess(date), basis: "estimate", detail: "Estimate based on time of day", active: status.active };
  }

  const leaves = recent.filter((r) => r.type === "leave").length;
  const parks = recent.filter((r) => r.type === "park").length;
  // Go through reports in order: a "leave" opens a spot, a "park" fills one (never below zero).
  // So "someone parked, then left" still counts as 1 open spot.
  let openings = 0;
  for (const r of [...recent].sort((a, b) => a.time - b.time)) {
    openings = Math.max(0, openings + (r.type === "leave" ? 1 : -1));
  }
  const result = openings >= 2 ? "likely" : openings === 1 ? "maybe" : "unlikely";
  const mins = Math.max(1, Math.round((date.getTime() - Math.max(...recent.map((r) => r.time))) / 60000));
  const detail = `${leaves} left, ${parks} parked in the last ${windowMinutes} min (latest ${mins} min ago)`;
  return { status: result, basis: "reports", detail, active: status.active };
}
