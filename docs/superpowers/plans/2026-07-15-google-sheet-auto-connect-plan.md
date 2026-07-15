# Google Sheet Auto-Connect Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a signed-in Google user create or reuse a private PetCare spreadsheet from the web app, initialize the schema automatically, and persist the current tracker state so reloads use the same Sheet.

**Architecture:** The Vercel-hosted React app uses Google Identity Services token authentication in the browser. It calls Google Drive/Sheets APIs with the in-memory access token to find or create one spreadsheet named `PetCare - <email>`, creates the required tabs and headers, and stores the UI state in a dedicated `app_state` tab. No Google credentials are stored in localStorage or committed to the repository. Existing local demo mode remains available only when `VITE_GOOGLE_CLIENT_ID` is absent.

**Tech Stack:** React 18, Vite, Google Identity Services OAuth token client, Google Drive v3 REST API, Google Sheets v4 REST API, Vitest, Testing Library.

## Global Constraints

- Keep the approved five-item bottom navigation and all existing page tabs unchanged.
- Use the existing brown/tan visual system; only the Google Sheet status control may be added inside Settings.
- Never put access tokens, client secrets, or spreadsheet contents in source control or localStorage.
- A first login creates an empty PetCare spreadsheet with schema headers only; it must not seed pets, medicines, symptoms, diary entries, or reminders.
- A later login reuses the user’s existing PetCare spreadsheet and must not create duplicates.
- If Google credentials are absent, preserve the current local demo behavior and show a clear connection status.

### Task 1: Define the Google connection and schema modules

**Files:**
- Create: `src/googleAuth.js`
- Create: `src/googleSheets.js`
- Create: `src/googleAuth.test.js`
- Create: `src/googleSheets.test.js`
- Modify: `.env.example`

**Interfaces:**
- `googleAuth.js` exports `isGoogleConfigured()`, `loadGoogleIdentityServices()`, `requestGoogleAccessToken()`, and `getGoogleUserProfile()`.
- `googleSheets.js` exports `PETCARE_SHEETS`, `createOrFindPetCareSheet(accessToken, email)`, `loadAppState(accessToken, spreadsheetId)`, and `saveAppState(accessToken, spreadsheetId, state)`.

- [ ] **Step 1: Write failing unit tests** for token configuration, spreadsheet naming, schema headers, and app-state JSON round-trip.
- [ ] **Step 2: Run `npm.cmd test -- --run src/googleAuth.test.js src/googleSheets.test.js` and verify the new tests fail because modules are missing.
- [ ] **Step 3: Implement the modules.** Use `https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/spreadsheets`; use Drive `files.list` with an exact name query, Sheets `spreadsheets.create`, `batchUpdate` to add tabs, and `values.update` to write row-one headers. Add an `app_state` tab with `key`, `value`, and `updated_at` columns.
- [ ] **Step 4: Run the focused tests and verify they pass.
- [ ] **Step 5: Commit `feat: add browser Google Sheet connection services`.

### Task 2: Add connection state and Settings controls

**Files:**
- Create: `src/components/GoogleSheetConnection.jsx`
- Create: `src/components/GoogleSheetConnection.test.jsx`
- Modify: `src/App.jsx`
- Modify: `src/index.css`

**Interfaces:**
- `GoogleSheetConnection` accepts `{ onConnected }` and renders the existing Settings card style with `Sign in with Google`, connected status, open-sheet link, and disconnect action.
- It returns `{ email, spreadsheetId, spreadsheetUrl }` to the parent after successful setup.

- [ ] **Step 1: Write failing component tests** for demo status, successful connect callback, and disconnect preserving the remote Sheet.
- [ ] **Step 2: Run the focused component test and verify failure.
- [ ] **Step 3: Implement the component using the services from Task 1. Keep access tokens in React memory only; keep only non-sensitive connection metadata in memory.
- [ ] **Step 4: Replace only the Google Sheet Settings item in `App.jsx`; leave all other Settings items and navigation unchanged.
- [ ] **Step 5: Add compact responsive styles and run the focused test.
- [ ] **Step 6: Commit `feat: add Google Sheet connection settings control`.

### Task 3: Persist tracker state in the connected Sheet

**Files:**
- Create: `src/remoteState.js`
- Create: `src/remoteState.test.js`
- Modify: `src/App.jsx`

**Interfaces:**
- `remoteState.js` exports `loadRemoteState(accessToken, spreadsheetId)` and `saveRemoteState(accessToken, spreadsheetId, state)`.

- [ ] **Step 1: Write failing tests** for empty `app_state` returning the existing seed state and for saving/loading valid JSON.
- [ ] **Step 2: Run the focused tests and verify failure.
- [ ] **Step 3: Implement the repository on top of `loadAppState`/`saveAppState`; only serialize the existing `tracks`, `logs`, and `reminders` state used by the current UI.
- [ ] **Step 4: Hydrate App state after connection and debounce subsequent saves by 500 ms; display an error status without discarding local in-memory edits when a request fails.
- [ ] **Step 5: Run all tests and verify existing navigation tests remain green.
- [ ] **Step 6: Commit `feat: persist tracker state to connected Google Sheet`.

### Task 4: Production configuration and user documentation

**Files:**
- Modify: `index.html`
- Modify: `.env.example`
- Modify: `README.md`

- [ ] **Step 1: Add a dynamic GIS script loader; do not load third-party scripts when the client ID is absent.
- [ ] **Step 2: Document Google Cloud OAuth setup, authorized origin `https://petcare-th.vercel.app`, required scopes, Vercel variable `VITE_GOOGLE_CLIENT_ID`, and the expected first-login flow.
- [ ] **Step 3: Document test-account reset behavior and confirm disconnect never deletes a Sheet.
- [ ] **Step 4: Run `npm.cmd test -- --run`, `npm.cmd run lint`, and `npm.cmd run build`.
- [ ] **Step 5: Commit `docs: document Google Sheet auto-connect setup`.

### Task 5: Verification and delivery

**Files:**
- No source changes unless a verification failure requires a targeted fix.

- [ ] **Step 1: Run the full test suite, lint, and production build from the isolated worktree.
- [ ] **Step 2: Inspect `git diff --check` and confirm only planned files changed.
- [ ] **Step 3: Push `feat/google-sheet-auth` and report the exact Vercel/GitHub setup still required: Google OAuth client ID and authorized origin.

