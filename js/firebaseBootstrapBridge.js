// Bridge module: initializes Firebase client and exposes globals for legacy main.js.

import { db, DB_ROOT_PATH, FIREBASE_VERSION } from "./firebaseClient.js";

// Expose to window so legacy js/main.js can access without imports.
window.__VIRTUAL_PIANO_DB__ = db;
window.__VIRTUAL_PIANO_DB_ROOT_PATH__ = DB_ROOT_PATH;
window.__VIRTUAL_PIANO_FIREBASE_VERSION__ = FIREBASE_VERSION;

// HEALTH CHECK: Realtime Database connectivity
// This prints only when the Firebase connection is established.
try {
  import('https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js').then(({ ref, onValue }) => {
    const connectedRef = ref(db, '.info/connected');
    onValue(connectedRef, (snap) => {
      if (snap && snap.val() === true) {
        console.log('HEALTH CHECK: Connected');
      }
    });
  }).catch((e) => console.warn('HEALTH CHECK: failed to init', e));
} catch (e) {
  console.warn('HEALTH CHECK: failed', e);
}


