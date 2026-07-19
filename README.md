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

Until Google OAuth is configured, the app runs in demo mode and stores the interactive demo state in browser local storage under `petcare.local.v1`.

## Google Sheet auto-connect

The production flow is user-owned and starts from the web app:

1. In Google Cloud Console, create an OAuth Web application client.
2. Add `https://petcare-th.vercel.app` as an authorized JavaScript origin.
3. Enable Google Sheets API and Google Drive API.
4. Put the client ID in Vercel as `VITE_GOOGLE_CLIENT_ID`.
5. Open PetCare, go to Settings → Google Sheet, and press **เชื่อมต่อ Google**.
6. On the first connection, PetCare creates `PetCare - <Google email>` in the user’s Drive and creates the schema tabs and headers with no sample health data.
7. Later connections reuse the existing file and save the current tracker state in the `app_state` tab.

The legacy Apps Script/LIFF write path uses `VITE_GAS_URL` with the deployed `/exec` URL. Do not use `GAS_WEB_APP_URL`, because Vite only exposes variables prefixed with `VITE_` to browser code.

Access tokens stay in memory for the active browser session. The app does not store Google tokens or spreadsheet contents in local storage. Disconnecting does not delete the user’s Sheet.

For development, use a separate Google OAuth client and a test Google account. The first-login test should create a new empty Sheet; a second login should reuse the same Sheet.

## LINE reminders

LINE reminders still require a LINE Messaging API channel, channel access token, webhook recipient IDs, and the Apps Script trigger configuration described in `gas/Code.gs`. These credentials must be configured separately and must never be committed.

For group webhooks, configure LINE Developers to call the production Vercel endpoint at `/api/line/webhook`. Vercel verifies `X-Line-Signature` with `LINE_CHANNEL_SECRET`, then relays verified events to the deployed Apps Script `/exec` URL using `GAS_WEBHOOK_SECRET`. Store the same `GAS_WEBHOOK_SECRET` value in Vercel Production Environment Variables and Apps Script Properties. Captured group IDs are stored in the Apps Script property `PETCARE_LINE_GROUPS`.

## Deployment status

The production branch is `main`. Vercel deployment requires a valid Vercel login/token and the Google/LINE credentials above; none are stored in this repository.
