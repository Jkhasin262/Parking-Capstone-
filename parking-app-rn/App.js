// The app itself: draws the map, colors the blocks, and runs the "I parked" / "I'm leaving" flow.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Keyboard, Linking, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import MapView, { Polyline } from "react-native-maps";
import * as Location from "expo-location";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import { useFonts } from "expo-font";
// Import only the 4 weights we use, so the app doesn't ship all 18 font files.
import { Overpass_400Regular } from "@expo-google-fonts/overpass/400Regular";
import { Overpass_600SemiBold } from "@expo-google-fonts/overpass/600SemiBold";
import { Overpass_700Bold } from "@expo-google-fonts/overpass/700Bold";
import { Overpass_800ExtraBold } from "@expo-google-fonts/overpass/800ExtraBold";

import { CONFIG } from "./src/config";
import { COLORS, FONTS } from "./src/theme";
import { scoreFace } from "./src/logic/scoring";
import { nextRestriction } from "./src/logic/rules";
import { nearestFace, midpoint } from "./src/logic/geo";
import { toLatLngs } from "./src/format";
import * as storage from "./src/storage";
import { ConfirmSheet, DetailsSheet, HomeSheet, ParkedSheet } from "./src/components/Sheets";

const BLOCK_DATA = require("./assets/blockfaces.json");
const FACES = BLOCK_DATA.features.filter((f) => f.geometry && f.geometry.type === "LineString");
const BY_ID = new Map(FACES.map((f) => [f.properties.id, f]));
const LINES = new Map(FACES.map((f) => [f.properties.id, toLatLngs(f)]));
const LINE_COLORS = {
  likely: COLORS.likely,
  maybe: COLORS.maybe,
  unlikely: COLORS.unlikely,
  noparking: COLORS.noparking,
};

export default function App() {
  const [fontsLoaded] = useFonts({ Overpass_400Regular, Overpass_600SemiBold, Overpass_700Bold, Overpass_800ExtraBold });
  if (!fontsLoaded) return null;
  return (
    <SafeAreaProvider>
      <ParkingScreen />
    </SafeAreaProvider>
  );
}

function ParkingScreen() {
  const insets = useSafeAreaInsets();
  const mapRef = useRef(null);

  const [reports, setReports] = useState([]);
  const [session, setSession] = useState(null);
  const [now, setNow] = useState(new Date());
  const [aspSuspended, setAspSuspended] = useState(false);
  const [position, setPosition] = useState(null); // [lng, lat]
  const [sheet, setSheet] = useState("home"); // home | details | confirm | parked
  const [selectedId, setSelectedId] = useState(null);
  const [pendingId, setPendingId] = useState(null);
  const [picking, setPicking] = useState(false);
  const [toast, setToast] = useState(null);
  const [query, setQuery] = useState("");
  const toastTimer = useRef(null);

  const showToast = useCallback((text, ms) => {
    setToast(text);
    clearTimeout(toastTimer.current);
    if (ms) toastTimer.current = setTimeout(() => setToast(null), ms);
  }, []);

  // Load saved reports and parking session, and check alternate side parking.
  useEffect(() => {
    (async () => {
      setReports(await storage.getReports());
      const saved = await storage.getSession();
      if (saved && BY_ID.has(saved.faceId)) {
        setSession(saved);
        setSelectedId(saved.faceId);
        setSheet("parked");
      }
      setAspSuspended(await loadAspStatus());
    })();
  }, []);

  // Re-score blocks every minute.
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), CONFIG.refreshSeconds * 1000);
    return () => clearInterval(t);
  }, []);

  // Ask for location, then follow it.
  useEffect(() => {
    let sub;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        showToast("Location is off. You can still tap blocks on the map.", 4000);
        return;
      }
      sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, distanceInterval: 10 },
        (loc) => setPosition([loc.coords.longitude, loc.coords.latitude]),
      );
    })();
    return () => sub && sub.remove();
  }, [showToast]);

  // The color of every block right now.
  const scores = useMemo(() => {
    const ctx = { aspSuspended };
    const m = new Map();
    for (const f of FACES) m.set(f.properties.id, scoreFace(f, reports, now, ctx, CONFIG.reportWindowMinutes));
    return m;
  }, [reports, now, aspSuspended]);

  // ---------- Actions ----------

  const openDetails = (id) => {
    setSelectedId(id);
    setSheet("details");
  };

  const openConfirm = (id) => {
    setPendingId(id);
    setSelectedId(id);
    setSheet("confirm");
  };

  const startPicking = (message) => {
    setPicking(true);
    setSelectedId(null);
    setSheet("home");
    showToast(message);
  };

  const onMapPress = (e) => {
    Keyboard.dismiss();
    const { latitude, longitude } = e.nativeEvent.coordinate;
    const hit = nearestFace([longitude, latitude], FACES, CONFIG.tapMaxMeters);
    if (!hit) return;
    const id = hit.face.properties.id;
    if (picking) {
      setPicking(false);
      setToast(null);
      openConfirm(id);
    } else {
      openDetails(id);
    }
  };

  const onParked = async () => {
    let here = position;
    if (!here) {
      try {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
        here = [loc.coords.longitude, loc.coords.latitude];
      } catch {
        return startPicking("Location is off. Tap the block where you parked.");
      }
    }
    const hit = nearestFace(here, FACES, CONFIG.snapMaxMeters);
    if (hit) openConfirm(hit.face.properties.id);
    else startPicking("Couldn't match your location to a block. Tap the block where you parked.");
  };

  const onConfirm = async () => {
    setReports(await storage.addReport(pendingId, "park"));
    setSession(await storage.startSession(pendingId));
    setNow(new Date());
    setSheet("parked");
  };

  const onLeaving = async () => {
    if (session) setReports(await storage.addReport(session.faceId, "leave"));
    await storage.endSession();
    setSession(null);
    setSelectedId(null);
    setNow(new Date());
    setSheet("home");
    showToast("Thanks. Drivers nearby will see the opening.", 3000);
  };

  const onClose = () => {
    if (session) {
      setSelectedId(session.faceId);
      setSheet("parked");
    } else {
      setSelectedId(null);
      setSheet("home");
    }
  };

  const onDirections = () => {
    const [lng, lat] = midpoint(BY_ID.get(selectedId));
    const url =
      Platform.OS === "ios"
        ? `http://maps.apple.com/?daddr=${lat},${lng}&dirflg=d`
        : `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;
    Linking.openURL(url);
  };

  const recenter = () => {
    const target = position
      ? { longitude: position[0], latitude: position[1] }
      : CONFIG.center;
    mapRef.current?.animateToRegion({ ...target, latitudeDelta: 0.006, longitudeDelta: 0.006 }, 400);
  };

  // Destination search (free OpenStreetMap search, limited to around the test area).
  const onSearch = async () => {
    const q = query.trim();
    if (!q) return;
    Keyboard.dismiss();
    const { latitude: lat, longitude: lng } = CONFIG.center;
    const box = [lng - 0.03, lat + 0.03, lng + 0.03, lat - 0.03].join(",");
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&bounded=1&viewbox=${box}&q=${encodeURIComponent(q + ", New York")}`;
      const res = await fetch(url, { headers: { "User-Agent": "StreetParkingMVP/1.0" } });
      const results = await res.json();
      if (!results.length) return showToast("No match near the test area.", 3000);
      mapRef.current?.animateToRegion(
        { latitude: Number(results[0].lat), longitude: Number(results[0].lon), latitudeDelta: 0.005, longitudeDelta: 0.005 },
        500,
      );
    } catch {
      showToast("Search isn't available right now.", 3000);
    }
  };

  // ---------- Screen ----------

  const selectedFace = selectedId ? BY_ID.get(selectedId) : null;
  const sessionFace = session ? BY_ID.get(session.faceId) : null;
  const mins = Math.max(0, Math.round((Date.now() - now.getTime()) / 60000));

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        initialRegion={{ ...CONFIG.center, ...CONFIG.span }}
        showsUserLocation
        showsPointsOfInterests={false}
        onPress={onMapPress}
      >
        {selectedFace ? (
          <Polyline coordinates={LINES.get(selectedId)} strokeColor={COLORS.ink} strokeWidth={11} zIndex={0} />
        ) : null}
        {FACES.map((f) => {
          const id = f.properties.id;
          const status = scores.get(id).status;
          return (
            <Polyline
              key={id}
              coordinates={LINES.get(id)}
              strokeColor={LINE_COLORS[status]}
              strokeWidth={5}
              lineDashPattern={status === "noparking" ? [6, 5] : undefined}
              zIndex={1}
            />
          );
        })}
      </MapView>

      <View style={[styles.top, { top: insets.top + 8 }]} pointerEvents="box-none">
        <View style={styles.search}>
          <Text style={styles.searchIcon}>⌕</Text>
          <TextInput
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={onSearch}
            placeholder="Search a destination"
            placeholderTextColor={COLORS.muted}
            returnKeyType="search"
            accessibilityLabel="Search a destination"
            style={styles.searchInput}
          />
        </View>
        <View style={styles.topRow} pointerEvents="box-none">
          <Text style={styles.updated}>
            {CONFIG.areaName} · updated {mins < 1 ? "just now" : `${mins} min ago`}
          </Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Center on my location" onPress={recenter} style={styles.iconBtn}>
            <Text style={styles.recenter}>➤</Text>
          </Pressable>
        </View>
        {toast ? <Text style={styles.toast}>{toast}</Text> : null}
      </View>

      {sheet === "home" && <HomeSheet onParked={onParked} bottomInset={insets.bottom} />}
      {sheet === "details" && selectedFace && (
        <DetailsSheet
          face={selectedFace}
          score={scores.get(selectedId)}
          onClose={onClose}
          onDirections={onDirections}
          bottomInset={insets.bottom}
        />
      )}
      {sheet === "confirm" && pendingId && (
        <ConfirmSheet
          face={BY_ID.get(pendingId)}
          onYes={onConfirm}
          onPick={() => startPicking("Tap the block where you parked.")}
          bottomInset={insets.bottom}
        />
      )}
      {sheet === "parked" && sessionFace && (
        <ParkedSheet
          face={sessionFace}
          session={session}
          next={nextRestriction(sessionFace.properties.rules, now, { aspSuspended })}
          onLeaving={onLeaving}
          bottomInset={insets.bottom}
        />
      )}
    </View>
  );
}

// Alternate side parking status from the NYC 311 API (needs a free key in src/config.js).
// NOTE: check the response shape against the 311 API docs once you have a key.
async function loadAspStatus() {
  if (!CONFIG.nyc311Key) return false;
  try {
    const d = new Date();
    const day = `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
    const res = await fetch(`https://api.nyc.gov/public/api/GetCalendar?fromdate=${day}&todate=${day}`, {
      headers: { "Ocp-Apim-Subscription-Key": CONFIG.nyc311Key },
    });
    const text = JSON.stringify(await res.json()).toLowerCase();
    const asp = text.match(/alternate side parking[^}]*?"status(?:_name)?"\s*:\s*"([^"]+)"/);
    return !!asp && asp[1].includes("suspend");
  } catch {
    return false; // assume rules are in effect if we can't tell
  }
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#ECEAE5" },
  top: { position: "absolute", left: 12, right: 12, gap: 8 },
  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    height: 48,
    paddingHorizontal: 14,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: COLORS.line,
    borderRadius: 8,
  },
  searchIcon: { fontSize: 20, color: COLORS.ink },
  searchInput: { flex: 1, fontFamily: FONTS.regular, fontSize: 16, color: COLORS.ink },
  topRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  updated: {
    fontFamily: FONTS.semibold,
    fontSize: 12,
    color: "#4A4740",
    backgroundColor: "rgba(255,255,255,0.92)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    overflow: "hidden",
  },
  iconBtn: {
    width: 44,
    height: 44,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: COLORS.line,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  recenter: { fontSize: 18, color: COLORS.blue, transform: [{ rotate: "-45deg" }] },
  toast: {
    fontFamily: FONTS.semibold,
    fontSize: 14,
    color: "#FFFFFF",
    backgroundColor: COLORS.ink,
    padding: 12,
    borderRadius: 8,
    overflow: "hidden",
  },
});
