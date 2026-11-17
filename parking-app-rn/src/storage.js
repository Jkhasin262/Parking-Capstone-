// Driver reports ("I parked" / "I'm leaving") and your current parking session.
//
// FOR NOW these are saved only on this phone (AsyncStorage), so you can test the flow.
// Next step: swap these functions for a shared database (like Firebase) so every driver
// sees everyone's reports. The rest of the app won't need to change.

import AsyncStorage from "@react-native-async-storage/async-storage";

const REPORTS_KEY = "parking.reports";
const SESSION_KEY = "parking.session";

async function read(key, fallback) {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

async function write(key, value) {
  try {
    if (value === null) await AsyncStorage.removeItem(key);
    else await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* if saving fails the app still works, it just won't remember */
  }
}

// type is "park" or "leave"
export async function addReport(faceId, type) {
  const reports = await read(REPORTS_KEY, []);
  reports.push({ faceId, type, time: Date.now() });
  // Keep only the last day of reports.
  const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
  const kept = reports.filter((r) => r.time >= dayAgo);
  await write(REPORTS_KEY, kept);
  return kept;
}

export function getReports() {
  return read(REPORTS_KEY, []);
}

export function getSession() {
  return read(SESSION_KEY, null);
}

export async function startSession(faceId) {
  const session = { faceId, since: Date.now() };
  await write(SESSION_KEY, session);
  return session;
}

export function endSession() {
  return write(SESSION_KEY, null);
}
