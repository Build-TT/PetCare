# PetCare production hotfixes — 2026-08-03

Three production defects reported on the GitHub deployment:

1. **Frequent Google reconnect** — GIS access tokens live ~1 h. The app discards
   `expires_in`, never refreshes silently mid-session, and the launch-time silent
   restore omits `login_hint`, so it fails whenever the browser has several Google
   sessions. Every expiry surfaces as "กด Reconnect".
2. **`Invalid data[86]: … more than the maximum of 50000 characters in a single
   cell`** — `savePetCareState` writes the whole app state as one JSON string into
   `app_state!A3` (`account_state`). With base64 pet photos the blob exceeds the
   Sheets 50 000-chars/cell hard limit, and because `values:batchUpdate` is atomic
   the entire save fails — nothing syncs at all.
3. **Shared (child) device sees no data / "ไม่มี sheet petCare"** — invited devices
   read exclusively the `account_state` row via Apps Script `accountReadState`.
   Because of defect 2 that row is never written, so the child reads `null`.
   Secondary UX trap: a child who connects their own Google Drive can never see the
   owner's Sheet (the `drive.file` scope only lists files this app created under
   *their* account) and gets "ยังไม่พบ Sheet ที่ชื่อเกี่ยวกับ PetCare ใน Google Drive"
   with no explanation of the invited-login flow.

## Global Constraints

- **Chunk contract (binds Tasks 2 and 3 — must match byte-for-byte):**
  - The serialized state JSON string is split into chunks of at most
    **45000** characters (constant `ACCOUNT_STATE_CHUNK_SIZE = 45000`).
  - Row keys: chunk 1 uses key `account_state` (unchanged), chunk N≥2 uses key
    `account_state#N` (e.g. `account_state#2`, `account_state#3`).
  - Readers collect all rows whose key is `account_state` or `account_state#N`,
    order them (base row first, then N ascending), concatenate the values, then
    `JSON.parse`. A failed parse returns `null` exactly like today. A single
    un-chunked `account_state` row (old format) must keep working — it is simply
    one chunk.
  - Writers must remove stale chunk rows from previous saves (a shrink from 3
    chunks to 1 must not leave `account_state#2/#3` behind).
- **Version bump:** `PETCARE_BACKEND_VERSION` in `gas/Code.gs` and the fallback in
  `src/appVersion.js` both become `'2026.08.03.1'` (done once, in Task 3;
  `src/appVersion.test.js` enforces the match).
- No new npm dependencies. Tests are vitest (`npx vitest run <file>`), full suite
  `npm test`, production build `npm run build`.
- Existing sync/merge semantics (baselines, reconcile, three-way merge) must not
  change; all existing tests keep passing.
- All user-facing strings stay Thai, matching the tone of existing copy.

## Task 1 — Silent Google token lifecycle (`src/googleAuth.js`)

**Files:** `src/googleAuth.js`, `src/googleAuth.test.js`

Current behavior: `requestGoogleAccessToken({ prompt })` resolves only
`response.access_token` (line 53) and discards `expires_in`; there is no cache, no
`login_hint`, and no way to renew without the caller handling UI.

Required changes:

1. Module-level token cache `{ accessToken, expiresAt }`.
   - In the token client callback, on success record
     `expiresAt = Date.now() + (Number(response.expires_in) || 3600) * 1000`.
2. `requestGoogleAccessToken({ prompt = '', loginHint = '' } = {})`
   - Pass `login_hint: loginHint` (only when non-empty) through
     `tokenClient.requestAccessToken({ prompt, ...(loginHint ? { login_hint: loginHint } : {}) })`.
   - Keep every existing error message unchanged.
3. New export `async function ensureGoogleAccessToken({ email = '', minTtlMs = 5 * 60_000 } = {})`
   - Returns the cached token when `expiresAt - Date.now() > minTtlMs`.
   - Otherwise performs a **silent** request: `requestGoogleAccessToken({ prompt: 'none', loginHint: email })`,
     caches and returns the fresh token. Errors propagate to the caller
     (the caller decides whether to show reconnect UI).
4. New export `function getCachedGoogleAccessToken()` → the cached token string if
   still valid for at least 60 s, else `''`.
5. New export `function clearGoogleTokenCache()` (used by tests and logout paths).

**Tests (write first, watch fail):** stub `window.google.accounts.oauth2.initTokenClient`
to capture config and simulate callbacks. Cover:
- resolves token and records expiry from `expires_in`;
- `ensureGoogleAccessToken` returns cached token without a second
  `requestAccessToken` call while fresh;
- `ensureGoogleAccessToken` silently re-requests with `prompt: 'none'` and
  `login_hint` when expired;
- silent failure propagates the error;
- `getCachedGoogleAccessToken` returns `''` after `clearGoogleTokenCache()`.

## Task 2 — Chunked `account_state` in the web client (`src/googleSheets.js`)

**Files:** `src/googleSheets.js`, `src/googleSheets.test.js`

Follow the **Chunk contract** in Global Constraints.

1. Export `encodeAccountStateRows(json, timestamp)` → array of `[key, value, timestamp]`
   rows per the contract, and `decodeAccountStateRows(rows)` → the reassembled JSON
   string or `''` (accepts the full `app_state!A2:C` value grid; rows may appear in
   any order; ignores non-account keys such as `ui_state`).
2. `savePetCareState` (currently pushes one `app_state!A3:C3` entry at line 653):
   - Replace the single push with one entry per chunk row: chunk i (1-based) targets
     `app_state!A{2+i}:C{2+i}` (chunk 1 → row 3, chunk 2 → row 4, …).
   - Extend the existing `values:batchClear` call so rows
     `app_state!A{3+n}:C42` (n = chunk count) are cleared on every save, removing
     stale chunks (42 rows ≈ 1.8 MB of state — far above any realistic size). The
     clear must not touch rows 1–2 (`headers`, `ui_state`).
3. `loadAppState` (line 204): reassemble via `decodeAccountStateRows` before falling
   back to the `ui_state` row. Old single-row sheets keep working.
4. Photo safety net inside `serializeNormalizedState`: leave values untouched **except**
   when a `photo` cell value would exceed 49 000 chars — write `''` instead for that
   cell only (never throw away other columns; never mutate the caller's state
   object). This prevents one legacy oversized photo from blocking sync for the
   whole account (Task 4 compresses photos so this guard should rarely fire).

**Tests (write first):**
- round-trip: a state whose JSON is > 100 000 chars produces ≥ 3 chunk rows, each
  value ≤ 45 000 chars; `decodeAccountStateRows` restores the exact JSON.
- `savePetCareState` with a big state emits `app_state!A3:C3`, `A4:C4`, … entries
  and a batchClear range starting right after the last chunk row.
- `loadAppState` reads a chunked sheet and returns the parsed state; still reads
  legacy single-row `account_state` and `ui_state` sheets.
- oversized `photo` (> 49 000 chars) serializes as `''` for that cell while `name`
  etc. survive; a normal photo passes through unchanged.

## Task 3 — Chunked `account_state` in the Apps Script backend (`gas/Code.gs`)

**Files:** `gas/Code.gs`, `src/appVersion.js`, new tests in `src/gasSecurity.test.js`
(use the existing `makeGasSandbox` harness with a fake `openById` sheet).

Follow the **Chunk contract** in Global Constraints.

1. `accountReadState` (line 539): instead of taking the first `account_state` row,
   collect and reassemble all chunk rows per the contract, then parse. Behavior on
   parse failure (return `{ status: 'ok', state: null }`) is unchanged.
2. `accountSaveStateUnsafe` (lines 639-642): replace the single-row write with:
   - read the sheet's data range once;
   - keep every row whose key is **not** `account_state`/`account_state#N` in their
     existing order (e.g. `ui_state`);
   - append the new chunk rows (`JSON.stringify(persistedState)` split per the
     contract, timestamp `nowIso()` on every chunk row);
   - rewrite in ONE atomic `setValues` call covering rows 2..max(previous last
     row, 1+kept+chunks): pad the values array with `['','','']` rows up to the
     previous extent so old chunk tails are overwritten in the same call (no
     separate `clearContent` — a reader between two calls would otherwise see
     fresh chunks plus a stale tail and fail to parse).
3. Bump `PETCARE_BACKEND_VERSION` to `'2026.08.03.1'` and update `src/appVersion.js`
   fallback to match.

**Tests (write first):** with a fake `app_state` sheet object recording
`getDataRange/getRange/setValues/clearContent`:
- a state serializing beyond 45 000 chars is written as multiple chunk rows, none
  exceeding 45 000 chars, and `accountReadState` on those rows returns the full state;
- saving a small state after a large one leaves no `account_state#N` rows behind;
- a legacy sheet with one `account_state` row still reads correctly.

## Task 4 — Photo compression + app wiring + child-device guidance

**Files:** new `src/photo.js` + `src/photo.test.js`, `src/App.jsx`,
`src/components/GoogleSheetConnection.jsx`

1. **`src/photo.js`** — `export async function compressPhotoToDataUrl(source, { maxChars = 40000, render } = {})`
   - `source`: a `File`/`Blob` or an existing data-URL string.
   - Strategy ladder: try (dimension, quality) pairs
     `[512, 0.85] → [512, 0.7] → [384, 0.7] → [384, 0.55] → [256, 0.55] → [256, 0.4]`,
     returning the first `image/jpeg` data URL whose `.length ≤ maxChars`; if none
     fits, return the smallest attempt.
   - `render` is an injectable async `(source, maxDimension, quality) => dataUrl`
     used by tests; the default implementation uses an `Image`/`createImageBitmap`
     plus canvas `toDataURL('image/jpeg', quality)` and scales the longest edge down
     to `maxDimension` (never upscale).
   - If the environment cannot render (no canvas, decode error), return the
     original data URL unchanged (`File` sources fall back to a plain
     `FileReader.readAsDataURL` result).
2. **`src/App.jsx`**
   - `handleProfilePhoto` (line 893): compress the chosen file via
     `compressPhotoToDataUrl` before `setProfilePhoto`.
   - One-time migration effect: after mount, if any non-demo pet has
     `photo.length > 45000`, recompress those photos and `setPets` once (guard so it
     never loops; skip silently when compression is unavailable).
   - **Token wiring** (uses Task 1 API):
     - `restoreGoogleConnection` (line 813): call
       `requestGoogleAccessToken({ prompt: 'none', loginHint: rememberedGoogleSheet?.email || '' })`.
     - In the debounced save effect (line 424) and the visibility refresh
       (line 851), for `mode !== 'account'` connections resolve the token as
       `await ensureGoogleAccessToken({ email: googleConnection.email })` and pass
       that instead of the possibly-stale `googleConnection.accessToken`; on an
       error whose message contains `401`, retry exactly once with a fresh
       `ensureGoogleAccessToken` result before reporting the existing error UI.
       Keep account-mode behavior untouched.
3. **`src/components/GoogleSheetConnection.jsx`** — the empty-picker message
   (line 93) gains one explanatory line for invited users:
   `ยังไม่พบ Sheet ที่ชื่อเกี่ยวกับ PetCare ใน Google Drive — ถ้าคุณได้รับการแชร์จากคนอื่น ไม่ต้องเลือก Sheet ที่นี่ ให้ออกจากระบบแล้วเข้าสู่ระบบด้วย Google ด้วยอีเมลที่ถูกเชิญ ระบบจะเปิดข้อมูลที่แชร์ให้อัตโนมัติ`
4. **Tests:** `src/photo.test.js` drives the ladder with an injected `render` stub
   (returns controllable lengths) — verifies order of attempts, early exit,
   smallest-result fallback, and pass-through when `render` throws. App-level sync
   tests must keep passing; extend `App.sync.integration.test.jsx` mocks only if the
   new imports require it.

## Deployment notes (manual, after merge — surface to the user)

- **Order matters: redeploy the Apps Script backend BEFORE the web app.** The two
  sides share the chunked `account_state` contract, and only one ordering is safe:
  - *Old GAS + new web* (web first) is **broken**: the old backend still reads a
    single `account_state` cell, so any state of ~45–50k characters or more is
    truncated mid-JSON and every invited/child device sees `state: null` — no data.
  - *New GAS + old web* (GAS first) is **safe**: the new backend reads and writes
    all chunk rows, and a still-cached old PWA build only risks leaving a stale
    chunk tail behind when it saves. The atomic rewrite in this branch self-heals
    that on the very next save from a new build, because the whole chunk range —
    fresh chunks plus blank padding to the previous extent — is now written in a
    single `setValues` / `values:batchUpdate`.
- Redeploy `gas/Code.gs` to Apps Script (new version `2026.08.03.1`); child devices
  keep seeing `state: null` until both the web app **and** GAS are deployed and the
  owner device performs one successful save.
- The reconnect fix cannot mint long-lived tokens (browser-only OAuth has no
  refresh token); it renews silently as long as the phone's browser stays signed in
  to Google. Advise the user to stay signed in to google.com in the same browser.
