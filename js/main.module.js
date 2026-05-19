// Main entry as ES module to support Firebase integration.
// This file imports the existing logic from main.js by reusing it as a module.
// NOTE: We keep current main.js as a script for now.

import "./firebaseBootstrapBridge.js";

// Load the legacy script into module context by dynamic injection.
// (We avoid rewriting the entire app into module form in one step.)
const legacy = document.createElement('script');
legacy.src = "../js/main.js";
legacy.type = "text/javascript";
legacy.async = false;
legacy.defer = false;
document.body.appendChild(legacy);

