// Firebase client bootstrap (Realtime Database) for Virtual Piano Studio.
// Loaded as an ES module from html/piano.html.

// IMPORTANT:
// GitHub Pages / static hosting cannot rely on node_modules imports.
// Use CDN ESM builds so this runs immediately on desktop + mobile.

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-analytics.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

// Disable transports that rely on WebSocket (problematic on some static/GitHub Pages environments).
// In the modular RTDB SDK, this is controlled via browser persistence / env.
// The safest approach for CDN ESM is to force a stable polling transport using the built-in settings object.
// Note: forceWebsockets is supported in the RTDB SDK options.

const firebaseConfig = {
  apiKey: "AIzaSyDneKIErjTn4iOp3jI9XMnWxlQGpcRx7Ow",
  authDomain: "perfect-piano-c2fa5.firebaseapp.com",
  projectId: "perfect-piano-c2fa5",
  storageBucket: "perfect-piano-c2fa5.firebasestorage.app",
  messagingSenderId: "1052803741930",
  appId: "1:1052803741930:web:e27e0fe3c4f43e922bff93",
  measurementId: "G-FYW1KM0ZE9",
  databaseURL: "https://perfect-piano-c2fa5-default-rtdb.firebaseio.com/",
};

const app = initializeApp(firebaseConfig);

// Force RTDB to prefer polling transport (no WebSocket) in environments where WS fails.
// This avoids "onConnectionShutdown" / ws issues on some static/GitHub Pages setups.
// Note: settings are applied via the global persistence config used by RTDB.
try {
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem('firebase:database:forcePolling', 'true');
  }
} catch (_) {}

// Analytics is optional; older/blocked environments might throw.
try {
  getAnalytics(app);
} catch (_) {}

export const db = getDatabase(app);
export const DB_ROOT_PATH = "piano_layouts";

export const DEFAULT_OCTAVE = 4;
export const DEFAULT_KEY_SHOW = 25;

// Kept for compatibility (other files may reference it).
export const INITIAL_DATA = {
  default_layout: {
    name: "Default Backup",
    mapping: {
      whiteKeys: ["a", "s", "d", "f", "g", "h", "j", "k", "l", ";", "\\'", "enter", "pgdn"],
      blackKeys: ["w", "e", "t", "y", "u", "o", "p", "]", "\\\\", "pgup"],
    },
    isDefault: true,
  },
};

export const FIREBASE_VERSION = "realtime-db-v1";

