# PetCare

PetCare is a mobile-first pet medication, symptom, diary, activity, and reminder tracker.

## Local development

```powershell
npm.cmd ci
npm.cmd run dev
npm.cmd run test
npm.cmd run lint
npm.cmd run build
```

The main app always keeps its current UI state in browser local storage under `petcare.local.v1`, including while Google Sheet sync is connected. Before OAuth is configured this is the only persistence layer. While connected, changes are also synchronized to normalized Google Sheet rows, and the local copy keeps navigation/reload usable.

## Google Sheet auto-connect

The production flow is user-owned and starts from the web app:

1. In Google Cloud Console, create an OAuth Web application client.
2. Add `https://petcare-th.vercel.app` as an authorized JavaScript origin.
3. Enable Google Sheets API and Google Drive API.
4. Put the client ID in Vercel as `VITE_GOOGLE_CLIENT_ID`.
5. Open PetCare, go to Settings → Google Sheet, and press **เชื่อมต่อ Google**.
6. On the first connection, PetCare creates `PetCare - <Google email>` in the user’s Drive and creates the schema tabs and headers with no sample health data.
7. Later connections reuse the existing file and save each entity in its normalized tab (`pets`, tracking, symptom/diary/activity logs, catalog, and reminders). `app_state` stores only the normalized-schema version and UI metadata such as `activePetId`; old full-state blobs are read only for backward-compatible migration.

The ประวัติการรักษา screen persists treatment history to `treatment_history`; Settings manages tracking items, symptom catalog entries, and global LINE USER IDs in `reminder_recipients` using `reminder_id = *`. Track checkbox choices are per-log selections and never change tracking-item active state. Tracking edits create a new `tracking_versions` row; historical log snapshots and prior tracking versions are retained when the current item is edited, disabled, or removed.

The LIFF read/write path uses `VITE_GAS_URL` with the deployed `/exec` URL and authenticated POST requests. Sheet IDs and API keys are not sent from LIFF; GAS resolves only the spreadsheet provisioned and linked to the verified LINE identity.

When LINE and Google identities must be linked, the LIFF flow calls `linkGoogleSheet` with the in-memory Google access token. GAS verifies the Google identity, confirms the requested Sheet is owned by that Google account (or provisions a new Sheet), then stores the LINE-user-to-Sheet mapping. Repeated linking and retry reuse that verified mapping and never replace it with another Sheet. There is no arbitrary Sheet-URL mapping endpoint.

OAuth access tokens stay in memory for the active browser session and are not written to local storage. The app does store the full current UI state locally in `petcare.local.v1`. While a remote save is pending or has failed, `petcare.remote-outbox.v1` stores the latest unsynchronized state snapshot; it is removed after that latest save succeeds. Non-secret Sheet connection metadata is stored in `petcare.google-sheet.v1`.

There is currently no in-app disconnect/cleanup button. Reloading or closing the browser drops the in-memory access token but leaves local state, pending outbox data, and connection metadata. Clearing this site's browser data removes those local entries; revoking PetCare in the Google account removes future API access. Neither action deletes the user-owned Google Sheet, which must be deleted separately in Google Drive if desired.

For development, use a separate Google OAuth client and a test Google account. The first-login test should create a new empty Sheet; a second login should reuse the same Sheet.

### Production-like Google test

Use a separate Google Cloud project and test account before enabling production credentials.

1. Create an OAuth Web application client in Google Cloud Console.
2. Add `http://localhost:5173` and the staging/preview URL as authorized JavaScript origins.
3. Enable Google Sheets API and Google Drive API.
4. Add the test Google account to the OAuth consent screen test users.
5. Set `VITE_GOOGLE_CLIENT_ID` in `.env.local` or the staging environment.
6. Start the app, open Settings, accept the PetCare Sheet consent, and connect Google.
7. Verify that the app creates `PetCare - <Google email>` in the user's Drive, creates the schema tabs, saves state, and reuses the same file after reconnecting.
8. Test canceling consent, deleting the Sheet, removing access from the Google account, and reconnecting.

PetCare asks for consent before starting the Google authorization flow. It creates the user's Sheet automatically; customers do not need to create a blank file or paste a spreadsheet link. Local UI state, pending outbox data, and non-secret connection metadata are cached as described above. OAuth access tokens remain in memory for the active browser session.

## LINE reminders

LINE reminders require one LINE Messaging API channel configured by the system owner. Set `LINE_TOKEN`, `LINE_CHANNEL_SECRET`, `LINE_CHANNEL_IDS`, `LINE_ADMIN_USER_IDS`, and `GAS_WEBHOOK_SECRET` once in the deployed Apps Script project; customers must never edit or receive these values. The web app asks each customer for Google consent and a valid LINE User ID, then calls the Google-authenticated `provisionUser` action. GAS verifies that the Google account owns the Sheet, grants the deployed script writer access, creates any missing schema tabs, and stores the LINE-user-to-Sheet mapping. Customers do not open Apps Script or paste a Sheet URL.

### LINE group webhook

In LINE Developers Console → Messaging API, enable **Allow bot to join group chats**, set the Vercel `/api/line/webhook` URL as the Webhook URL, and enable **Use webhook**. The Vercel relay verifies `X-Line-Signature` with `LINE_CHANNEL_SECRET`, then forwards the verified event to the GAS Web App `/exec` using `GAS_WEBHOOK_SECRET`. When the Official Account joins a group or receives a group message, the group ID is stored in Script Properties under `PETCARE_LINE_GROUPS`. The current web UI still needs a group-picker before customers can select a stored group as a reminder recipient.

The web app writes reminders to the normalized `reminders` tab. After updating `gas/Code.gs`, deploy a new Web App version, keep **Execute as me** and **Who has access: Anyone**, then run `installReminderTrigger()` once. The trigger checks both legacy `med_schedules` and normalized `reminders`; normalized reminders created from the UI are sent at 08:00 in the Apps Script project timezone because the current UI stores a date but not a time.

## Deployment status

The production branch is `main`. Vercel deployment requires a valid Vercel login/token and the Google/LINE credentials above; none are stored in this repository.
