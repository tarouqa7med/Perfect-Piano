// Firebase client bootstrap (Realtime Database) for Virtual Piano Studio.
// Loaded as an ES module from html/piano.html.

// IMPORTANT:
// GitHub Pages / static hosting cannot rely on node_modules imports.
// Use CDN ESM builds so this runs immediately on desktop + mobile.

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-analytics.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyDneKIErjTn4iOp3jI9XMnWxlQGpcRx7Ow",
  authDomain: "perfect-piano-c2fa5.firebaseapp.com",
  projectId: "perfect-piano-c2fa5",
  storageBucket: "perfect-piano-c2fa5.firebasestorage.app",
  messagingSenderId: "1052803741930",
  appId: "1:1052803741930:web:e27e0fe3c4f43e922bff93",
  measurementId: "G-FYW1KM0ZE9",
  databaseURL: "https://perfect-piano-c2fa5-default-rtdb.firebaseio.com",
};

const app = initializeApp(firebaseConfig);

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

