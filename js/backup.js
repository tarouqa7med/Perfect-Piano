// Immutable default backup data for Virtual Piano Studio.
// IMPORTANT: This file must contain a hardcoded Default Backup that cannot be deleted.

(function () {
  // Expose globals for js/main.js (simple script-loader style: backup.js can be loaded before main.js).
  const DEFAULT_BACKUP = {
    id: 'default-layout-immutable-v1',
    name: 'Default',
    // Required defaults
    octave: 4,
    keysCount: 25,
    instrument: 'piano',

    // Alphabetical (standard) physical keyboard mapping requirement:
    // created backups must start with a standard order from A..Enter.
    // This mapping is represented as midiNote -> physical key char, but midiNote range depends on octave+keysCount.
    // js/main.js will materialize this default mapping for the active visible range.
    // Therefore: keep it as a marker here.
    mappingStrategy: 'alphabetical-A-to-Enter',

    // No custom rebinds preconfigured.
    rebinds: {},

    // UI metadata
    createdAt: 0,
    protected: true
  };

  // Attach to window for compatibility.
  window.__VIRTUAL_PIANO_DEFAULT_BACKUP__ = DEFAULT_BACKUP;
})();

