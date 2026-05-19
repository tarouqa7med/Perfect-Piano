// Bridge module: initializes Firebase client and exposes globals for legacy main.js.

import { db, DB_ROOT_PATH, FIREBASE_VERSION } from "./firebaseClient.js";

// Expose to window so legacy js/main.js can access without imports.
window.__VIRTUAL_PIANO_DB__ = db;
window.__VIRTUAL_PIANO_DB_ROOT_PATH__ = DB_ROOT_PATH;
window.__VIRTUAL_PIANO_FIREBASE_VERSION__ = FIREBASE_VERSION;

