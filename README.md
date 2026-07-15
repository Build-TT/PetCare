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

Until Google Sheet credentials are configured, the app stores interactive demo data in browser local storage under `petcare.local.v1`.

## Required production setup

1. Create a Google Sheet for one household and share it as **Editor** with the Google account that deploys Google Apps Script.
2. Copy `gas/Code.gs` into that Apps Script project, run `setupSheets()`, then deploy it as a versioned Web App.
3. In Apps Script Script Properties set `LINE_TOKEN` and, after connecting the Sheet from Settings, `PETCARE_SPREADSHEET_ID` is stored automatically.
4. Create a LINE Messaging API channel. Add recipients through follow/message/group-join webhooks; do not enter a display name as a push recipient ID.
5. In Vercel import `Build-TT/PetCare`, set the required environment variables from `.env.example`, then deploy `main`.

## Deployment status

The feature branch is `feat/petcare-production`. Vercel deployment requires a valid Vercel login/token and the Google/LINE credentials above; none are stored in this repository.
