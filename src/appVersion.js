// Must match PETCARE_BACKEND_VERSION in gas/Code.gs — appVersion.test.js
// enforces it, because the two are deployed separately and a stale constant
// here makes Settings blame a backend that is actually up to date.
export const APP_VERSION = import.meta.env.VITE_APP_VERSION || '2026.08.03.1'
