// Settings for the whole app. Change things here instead of digging through the code.

export const CONFIG = {
  // Where the map opens: around E 70th St & 3rd Ave.
  center: { latitude: 40.7688, longitude: -73.9612 },
  // How much map is visible at first (smaller = more zoomed in).
  span: { latitudeDelta: 0.012, longitudeDelta: 0.012 },

  // Test area: E 61st to E 80th St, Park Ave to 1st Ave (all outside the congestion zone).
  areaName: "Upper East Side",

  // How far back driver reports count when scoring a block.
  reportWindowMinutes: 20,

  // "I parked" snaps your GPS to the nearest block face within this distance.
  snapMaxMeters: 40,

  // Tapping the map selects a block face if the tap is this close to one.
  tapMaxMeters: 25,

  // How often block colors refresh.
  refreshSeconds: 60,

  // Free NYC 311 API key for alternate side parking status (https://api-portal.nyc.gov).
  // Leave empty and the app assumes street cleaning rules are in effect.
  nyc311Key: "",
};
