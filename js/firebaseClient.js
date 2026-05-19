// Firebase client bootstrap (Realtime Database) for Virtual Piano Studio.
// Loaded as an ES module from html/piano.html.

import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getDatabase } from "firebase/database";

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
try { getAnalytics(app); } catch (_) {}

export const db = getDatabase(app);
export const DB_ROOT_PATH = "piano_layouts";
export const FIREBASE_VERSION = "realtime-db-v1";

