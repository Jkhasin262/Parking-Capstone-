# Street Parking: iPhone app (React Native + Expo), MVP

Shows how likely you are to find street parking on each block near you, using real NYC
parking signs. Test area: Upper East Side, E 61st to E 80th St, Park Ave to 1st Ave.

## Run it on your iPhone

One-time setup on your Mac:

1. Install **Node.js** (the LTS version) from nodejs.org. This runs the app's build tools.
2. Install **VS Code** from code.visualstudio.com. This is where you'll edit the code.
3. On your iPhone, install **Expo Go** from the App Store.

Get the code onto your Mac:

4. Upload this folder's contents to your GitHub repo (see the steps in chat), then in VS Code:
   **Clone Git Repository** → paste your repo's URL → pick a folder → **Open**.
5. In VS Code, open the Terminal (**Terminal → New Terminal**) and run:
   `npm install`
   This downloads the libraries listed in `package.json` into a `node_modules` folder (takes a minute).

Run it:

6. In the same terminal, run: `npx expo start`
7. A QR code appears. Open your iPhone's **Camera** app and point it at the QR code, then tap the
   banner. The app opens in Expo Go. (Phone and Mac must be on the same Wi-Fi.)
8. Allow location when asked.

While `npx expo start` is running, any change you save in VS Code shows up on your phone right away.

## How the code is organized

| File | What it does |
| --- | --- |
| `App.js` | The main screen: Apple Map, colored block lines, search bar, and which panel is showing |
| `src/components/Sheets.js` | The bottom panels: legend + "I parked", block details, confirm, parked |
| `src/logic/rules.js` | Reads a block's parking rules and decides if parking is allowed right now |
| `src/logic/scoring.js` | Picks each block's color from the rules plus recent driver reports |
| `src/logic/geo.js` | Map math: snaps your GPS location (or a tap) to the nearest block |
| `src/storage.js` | Saves "I parked" / "I'm leaving" reports (on this phone for now) |
| `src/config.js` | Settings: map start point, report window, API keys |
| `src/theme.js` | Colors and fonts from the mockups |
| `assets/blockfaces.json` | All 350 block faces in the test area with their sign rules |
| `pipeline/` | Python scripts that build `blockfaces.json` from NYC Open Data files |
| `app.json` | App name, iPhone settings, and the location permission message |

## How a block gets its color

1. **Signs say no parking right now** (street cleaning, no-standing hours, commercial only) → gray dashed.
2. **Drivers reported in the last 20 minutes** → each "leaving" opens a spot, each "parked" fills one:
   2+ open = green, 1 = yellow, 0 = red.
3. **No recent reports** → a rough guess from the time of day (the AI model replaces this later).

## Updating the block data (every month or two)

NYC changes signs over time. Download the two NYC Open Data files again (**Parking Regulation
Locations and Signs** as CSV, **Centerline** as GeoJSON), then from this folder run:

`python3 pipeline/build_blockfaces.py <Centerline .geojson> <signs .csv> assets/blockfaces.json`

To change the test area, edit `STREETS` and `AVENUES` at the top of `pipeline/names.py`.

## Later: putting it in the App Store

Expo Go is for testing. To publish, you'll need an Apple Developer account ($99/year), then
Expo's build service makes the real app file: `npx eas-cli@latest build --platform ios`.
Before that, change `com.yourname.streetparking` in `app.json` to your own unique ID.

## Known limits of version 1

- Reports are saved only on the phone that made them. Next step: a shared database.
- Some signs only cover part of a block (bus stops, loading zones). Those show as "Part of block"
  and don't gray out the whole block.
