// The bottom panels: home (legend + "I parked"), block details, confirm, and parked.
// Only one shows at a time; App.js decides which.

import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { COLORS, FONTS, STATUS_TEXT } from "../theme";
import { LABELS } from "../logic/scoring";
import { describeRule, faceName, formatDayTime, formatTime } from "../format";

export function Button({ label, onPress, variant = "primary" }) {
  const secondary = variant === "secondary";
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.btn, secondary && styles.btnSecondary, pressed && { opacity: 0.8 }]}
    >
      <Text style={[styles.btnText, secondary && styles.btnTextSecondary]}>{label}</Text>
    </Pressable>
  );
}

function Sheet({ children, bottomInset }) {
  return <View style={[styles.sheet, { paddingBottom: 24 + bottomInset }]}>{children}</View>;
}

function Handle() {
  return <View style={styles.handle} />;
}

function Eyebrow({ children }) {
  return <Text style={styles.eyebrow}>{children}</Text>;
}

const LEGEND = [
  { label: "Likely", color: COLORS.likely },
  { label: "Maybe", color: COLORS.maybe },
  { label: "Unlikely", color: COLORS.unlikely },
  { label: "No parking", color: COLORS.noparking, dashed: true },
];

export function HomeSheet({ onParked, bottomInset }) {
  return (
    <Sheet bottomInset={bottomInset}>
      <Eyebrow>Street parking right now</Eyebrow>
      <View style={styles.legend}>
        {LEGEND.map((item) => (
          <View key={item.label} style={styles.legendItem}>
            {item.dashed ? (
              <View style={styles.swatchRow}>
                {[0, 1, 2, 3].map((i) => (
                  <View key={i} style={[styles.dash, { backgroundColor: item.color }]} />
                ))}
              </View>
            ) : (
              <View style={[styles.swatch, { backgroundColor: item.color }]} />
            )}
            <Text style={styles.legendText}>{item.label}</Text>
          </View>
        ))}
      </View>
      <Button label="I parked" onPress={onParked} />
    </Sheet>
  );
}

function SignCards({ rules, active }) {
  // The same sign text can appear as several rules (one per day group); show each sign once.
  const shown = [];
  for (const rule of rules) {
    const text = describeRule(rule);
    const existing = shown.find((s) => s.text === text);
    if (existing) existing.now = existing.now || active.includes(rule);
    else shown.push({ rule, text, now: active.includes(rule) });
  }
  if (!shown.length) return <Text style={styles.muted}>No sign data for this block yet.</Text>;
  return (
    <ScrollView style={{ maxHeight: 260 }} contentContainerStyle={styles.signs}>
      {shown.map(({ rule, text, now }) => {
        const green = rule.kind === "metered" || rule.kind === "time_limit";
        return (
          <View key={text} style={[styles.sign, now && styles.signNow]}>
            <Text style={[styles.signText, { color: green ? COLORS.likely : COLORS.unlikely }]}>{text}</Text>
            {rule.partial ? <Text style={styles.signNote}>Part of block</Text> : null}
          </View>
        );
      })}
    </ScrollView>
  );
}

export function DetailsSheet({ face, score, onClose, onDirections, bottomInset }) {
  const { street, between } = faceName(face);
  return (
    <Sheet bottomInset={bottomInset}>
      <Handle />
      <View style={styles.head}>
        <View style={{ flex: 1 }}>
          <Text style={styles.h1}>{street}</Text>
          <Text style={styles.muted}>{between}</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} style={styles.iconBtn}>
          <Text style={styles.close}>✕</Text>
        </Pressable>
      </View>
      <View style={styles.statusRow}>
        <Text style={[styles.status, { color: STATUS_TEXT[score.status] }]}>{LABELS[score.status]}</Text>
        {score.detail ? <Text style={styles.muted}>{score.detail}</Text> : null}
      </View>
      <Eyebrow>Signs on this block</Eyebrow>
      <SignCards rules={face.properties.rules || []} active={score.active} />
      <Button label="Get directions" onPress={onDirections} />
    </Sheet>
  );
}

export function ConfirmSheet({ face, onYes, onPick, bottomInset }) {
  const { street, between } = faceName(face);
  return (
    <Sheet bottomInset={bottomInset}>
      <Handle />
      <Text style={styles.h1}>Is this where you parked?</Text>
      <View style={styles.box}>
        <Text style={styles.strong}>{street}</Text>
        <Text style={styles.muted}>{between}</Text>
      </View>
      <Button label="Yes, I parked here" onPress={onYes} />
      <Button label="Choose another block" variant="secondary" onPress={onPick} />
    </Sheet>
  );
}

export function ParkedSheet({ face, session, next, onLeaving, bottomInset }) {
  const { street, between } = faceName(face);
  return (
    <Sheet bottomInset={bottomInset}>
      <Handle />
      <View>
        <Eyebrow>Parked since {formatTime(new Date(session.since))}</Eyebrow>
        <Text style={[styles.h1, { marginTop: 4 }]}>{street}</Text>
        <Text style={styles.muted}>{between}</Text>
      </View>
      {next ? (
        <View style={styles.warning}>
          <Text style={styles.warningTitle}>Move by {formatDayTime(next.at)}</Text>
          <Text style={styles.muted}>{describeRule(next.rule)}</Text>
        </View>
      ) : null}
      <Button label="I'm leaving" onPress={onLeaving} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "#FFFFFF",
    borderTopWidth: 1,
    borderColor: COLORS.line,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    paddingTop: 12,
    paddingHorizontal: 16,
    gap: 14,
  },
  handle: { alignSelf: "center", width: 36, height: 4, borderRadius: 2, backgroundColor: COLORS.line },
  eyebrow: { fontFamily: FONTS.bold, fontSize: 11, letterSpacing: 0.9, textTransform: "uppercase", color: COLORS.muted },
  h1: { fontFamily: FONTS.black, fontSize: 24, lineHeight: 28, color: COLORS.ink },
  strong: { fontFamily: FONTS.black, fontSize: 18, color: COLORS.ink },
  muted: { fontFamily: FONTS.regular, fontSize: 14, color: COLORS.muted, marginTop: 4 },
  head: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  iconBtn: {
    width: 44,
    height: 44,
    borderWidth: 1,
    borderColor: COLORS.line,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  close: { fontSize: 18, color: COLORS.ink },
  legend: { flexDirection: "row", justifyContent: "space-between" },
  legendItem: { gap: 6 },
  swatch: { width: 36, height: 5 },
  swatchRow: { flexDirection: "row", gap: 4, width: 36, height: 5 },
  dash: { width: 6, height: 5 },
  legendText: { fontFamily: FONTS.semibold, fontSize: 13, color: COLORS.ink },
  statusRow: { paddingVertical: 12, borderTopWidth: 1, borderBottomWidth: 1, borderColor: COLORS.divider },
  status: { fontFamily: FONTS.black, fontSize: 20 },
  signs: { flexDirection: "row", flexWrap: "wrap", gap: 8, padding: 3 },
  sign: {
    width: "48%",
    borderWidth: 2,
    borderColor: COLORS.ink,
    borderRadius: 4,
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: "center",
  },
  signNow: { borderWidth: 4 },
  signText: { fontFamily: FONTS.black, fontSize: 13, lineHeight: 16, textAlign: "center", textTransform: "uppercase" },
  signNote: { fontFamily: FONTS.bold, fontSize: 11, color: COLORS.muted, marginTop: 4 },
  box: { padding: 14, borderWidth: 1, borderColor: COLORS.line, borderRadius: 8 },
  warning: { padding: 14, borderWidth: 2, borderColor: COLORS.unlikely, borderRadius: 4 },
  warningTitle: { fontFamily: FONTS.black, fontSize: 16, color: "#B01E28" },
  btn: { height: 56, borderRadius: 8, backgroundColor: COLORS.ink, alignItems: "center", justifyContent: "center" },
  btnSecondary: { height: 52, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: COLORS.ink },
  btnText: { fontFamily: FONTS.black, fontSize: 17, color: "#FFFFFF" },
  btnTextSecondary: { fontFamily: FONTS.bold, fontSize: 16, color: COLORS.ink },
});
