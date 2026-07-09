# Pet Tracker Hybrid Requirements

Date: 2026-07-09
Project: Pet Tracker / PetCare
Audience: product owner, household users, and developers
Status: Draft for review

## Executive Summary

Pet Tracker is a lightweight pet health and medication tracking system for a household or small pet-care team. The current product lets users manage pets, record health/activity logs, manage medication schedules, track due medicine, and receive LINE medication reminders. It uses a Vite React frontend, Google Sheets as the datastore, Google Apps Script for writes and reminder jobs, and optional LINE LIFF entry points.

The requirement direction is hybrid:

- Preserve the current working model: simple mobile-first UI, Google Sheets storage, LINE reminder integration, and Thai/English support.
- Document the current system as functional requirements so it can be maintained safely.
- Define improvement requirements for reliability, security, validation, reminders, and developer maintainability.
- Provide a prioritized roadmap and backlog with acceptance criteria.

## Product Goals

1. Help caregivers keep a shared, low-friction record of pet health events.
2. Make routine medicine tracking visible and actionable.
3. Send reliable LINE reminders for due medication.
4. Keep setup simple enough for a personal or family deployment.
5. Make the system maintainable by documenting data, flows, APIs, and known gaps.

## Non-goals

1. The system is not a veterinary diagnosis tool.
2. The system does not need multi-tenant SaaS accounts in the next iteration.
3. The system does not need complex analytics, billing, or inventory management.
4. The system does not need offline-first sync beyond current local cache behavior unless added in a future phase.

## Current System Overview

### Runtime Components

- Frontend: React 18, Vite, browser/LIFF-compatible SPA.
- Backend: Google Apps Script Web App in `gas/Code.gs`.
- Database: Google Sheets with `pets`, `logs`, `log_types`, and `med_schedules` tabs.
- Read path: frontend reads Google Sheets API directly.
- Write path: frontend sends GET requests to Apps Script Web App.
- Reminder path: hourly Apps Script trigger checks medication schedules and pushes LINE messages.
- Deployment: static frontend can deploy to Vercel; `vercel.json` rewrites routes to `index.html`.

### Current Routes

| Route | Component | Purpose |
| --- | --- | --- |
| `/` | `src/App.jsx` | Dashboard with pets, due medicine, quick logs, recent logs |
| `/?page=log` | `src/liff/AddLog.jsx` | Add a health/activity log |
| `/?page=pets` | `src/liff/ManagePets.jsx` | Manage pet profiles |
| `/?page=meds` | `src/liff/ManageMeds.jsx` | Manage medication schedules and mark taken |
| `/?page=types` | `src/liff/ManageTypes.jsx` | Manage custom log types |
| `/?page=pet&id={pet_id}` | `src/pages/PetDetail.jsx` | Pet detail timeline and log deletion |

### Current Data Tabs

| Sheet | Purpose |
| --- | --- |
| `pets` | Pet profiles and active/soft-delete state |
| `log_types` | Customizable health/activity log type metadata |
| `logs` | Health/activity timeline records |
| `med_schedules` | Medication schedules, next due date, and active state |

## User Roles

### Caregiver

Primary day-to-day user. Needs to:

- View pets and recent care activity.
- Add quick logs such as pee, poop, symptom, medicine, vaccine, and checkup.
- Record free-text details when needed.
- See medicine due today and mark it as taken.

### Household Admin

User who configures the system. Needs to:

- Add, edit, and remove pets.
- Create and maintain medication schedules.
- Add or deactivate custom log types.
- Configure LINE reminders and deployment settings.

### Developer / Maintainer

Technical operator. Needs to:

- Understand frontend, Apps Script, Sheets, and LINE integration boundaries.
- Safely change schedule logic in both frontend and backend.
- Debug configuration and reminder failures.
- Deploy updates to the static frontend and Apps Script backend.

## Functional Requirements

### Dashboard

| ID | Requirement | Acceptance Criteria |
| --- | --- | --- |
| FR-DASH-001 | The dashboard shall show all active pets. | Pets with `active` equal to `FALSE` are hidden. Active pets show name, species icon, and latest log summary where available. |
| FR-DASH-002 | The dashboard shall show medicine due today. | Active schedules where `isScheduledOn(schedule, today)` is true are listed with pet name, medicine name, dose, and time. |
| FR-DASH-003 | The dashboard shall provide quick log entry from each pet card. | User can tap quick actions for pee, poop, and symptom; the add-log page opens with pet and type preselected. |
| FR-DASH-004 | The dashboard shall show recent logs. | Logs are sorted by datetime descending and the latest 12 are displayed with pet, type, detail, and date/time. |
| FR-DASH-005 | The dashboard shall support manual refresh. | User can refresh data, dashboard cache is invalidated, and sheets are re-read. |

### Pet Management

| ID | Requirement | Acceptance Criteria |
| --- | --- | --- |
| FR-PET-001 | Admin shall be able to add a pet. | Required fields: name and species. Optional fields: breed, birthdate, color. New row is written to `pets` with `active=TRUE`. |
| FR-PET-002 | Admin shall be able to edit an existing pet. | Existing row is updated by `id`; `created_at` remains unchanged. |
| FR-PET-003 | Admin shall be able to remove a pet without deleting history. | Delete sets `active=FALSE`; logs for the pet remain in `logs`. |
| FR-PET-004 | Pet species shall support dog, cat, and other. | UI displays species-specific icon and translated species label. |

### Log Entry

| ID | Requirement | Acceptance Criteria |
| --- | --- | --- |
| FR-LOG-001 | Caregiver shall be able to add a log for an active pet. | Required fields: pet, log type, datetime. Optional field: detail. Successful save appends a `logs` row. |
| FR-LOG-002 | Add-log page shall support preselected pet and type from URL. | `?page=log&pet={id}&type={key}` sets valid values when loaded. Invalid values are ignored. |
| FR-LOG-003 | The system shall support custom log types. | Active rows in `log_types` are shown; if none exist, built-in fallback types are used. |
| FR-LOG-004 | Pet detail page shall show a pet-specific timeline. | Logs for selected pet are sorted newest first and can be filtered by used log type. |
| FR-LOG-005 | Caregiver shall be able to delete a log. | Delete confirms with the user, calls Apps Script `deleteLog`, physically removes the row, and refreshes timeline/cache. |

### Log Type Management

| ID | Requirement | Acceptance Criteria |
| --- | --- | --- |
| FR-TYPE-001 | Admin shall be able to add a custom log type. | At least one label is required. System generates a `custom_` key when new. |
| FR-TYPE-002 | Admin shall be able to edit a log type. | Existing row is updated by `key`; icon and labels can be changed. |
| FR-TYPE-003 | Admin shall be able to deactivate a log type. | Deactivation sets `active=FALSE`; old logs keep their stored type key. |
| FR-TYPE-004 | Log types shall be ordered. | UI sorts active types by numeric `order`. |

### Medication Schedules

| ID | Requirement | Acceptance Criteria |
| --- | --- | --- |
| FR-MED-001 | Admin shall be able to create a medication schedule. | Required fields: pet, medicine name, schedule type, time, start date. Optional field: dose. |
| FR-MED-002 | Admin shall be able to edit an existing schedule. | Existing row is updated and `next_due` is recomputed. |
| FR-MED-003 | Admin shall be able to deactivate a schedule. | Delete sets `active=FALSE`; historical logs remain. |
| FR-MED-004 | Caregiver shall be able to mark medicine as taken. | `last_done` becomes today, `next_due` is recomputed from tomorrow, and a `med` log is appended. |
| FR-MED-005 | The UI shall show due-today schedules. | Schedules due today are highlighted and can be marked taken. |

### Schedule Rules

| ID | Requirement | Acceptance Criteria |
| --- | --- | --- |
| FR-SCHED-001 | Daily schedules shall be due every day on or after start date. | Dates before `start_date` are not due; all dates on/after are due. |
| FR-SCHED-002 | Monthly schedules shall be due on a configured day of month. | If a month has fewer days, due day is clamped to the last day of that month. |
| FR-SCHED-003 | Every-N-month schedules shall repeat from start month. | A due date matches when month offset modulo N is zero and day matches configured/clamped day. |
| FR-SCHED-004 | Cycle schedules shall support on/off day cycles. | Schedule is due for `on` days, skipped for `off` days, repeating from start date. |
| FR-SCHED-005 | Frontend and Apps Script schedule logic shall remain equivalent. | Same inputs produce same `isScheduledOn` and `computeNextDue` results. |

### LINE Reminders

| ID | Requirement | Acceptance Criteria |
| --- | --- | --- |
| FR-LINE-001 | System shall support LINE push reminders. | Apps Script uses `LINE_TOKEN` and `TARGET_ID` script properties to push due medicine messages. |
| FR-LINE-002 | Reminder trigger shall run on an hourly schedule. | `installReminderTrigger()` creates one hourly `checkReminders` trigger after deleting duplicates. |
| FR-LINE-003 | Reminder message shall identify pet and medicine. | Message includes pet name, medicine name, and dose when present. |
| FR-LINE-004 | Reminder sending shall be skipped safely when LINE config is missing. | Missing token or target logs a message and does not crash trigger. |

### Localization

| ID | Requirement | Acceptance Criteria |
| --- | --- | --- |
| FR-I18N-001 | UI shall support Thai and English. | Language state is stored in `localStorage['lang']`; components rerender on `langchange`. |
| FR-I18N-002 | Core labels and log type fallback labels shall be translated. | Dashboard, forms, buttons, schedule labels, and default log types show Thai/English where available. |

## Data Requirements

### `pets`

Required columns: `id`, `name`, `species`, `active`, `created_at`.

Optional columns: `breed`, `birthdate`, `photo`, `color`, `order`.

Rules:

- `id` must be unique.
- `active=FALSE` means hidden from active UI.
- New writes must store species as one of `dog`, `cat`, or `other_pet`.

### `log_types`

Required columns: `key`, `label_th`, `label_en`, `icon`, `active`, `order`.

Optional column: `needs_detail`.

Rules:

- `key` must be unique.
- Inactive types are hidden from entry UI.
- Existing logs can reference inactive types.

### `logs`

Required columns: `id`, `pet_id`, `type`, `datetime`, `created_at`.

Optional column: `detail`.

Rules:

- New writes must use a `pet_id` that exists in `pets`; legacy orphan logs may still be displayed only when explicitly queried by pet ID.
- New writes must use a `type` that exists in `log_types.key` or a fallback built-in key.
- New writes must store `datetime` as local `YYYY-MM-DDTHH:mm`.

### `med_schedules`

Required columns: `id`, `pet_id`, `med_name`, `schedule_type`, `config`, `time`, `start_date`, `active`, `created_at`.

Optional columns: `dose`, `last_done`, `next_due`.

Rules:

- `schedule_type` must be one of `daily`, `monthly`, `every_n_months`, or `cycle`.
- `config` must be JSON compatible with schedule type.
- `time` must be `HH:mm`.
- `next_due` is derived and recomputed on create/edit/mark taken.

## Integration Requirements

| ID | Requirement | Acceptance Criteria |
| --- | --- | --- |
| INT-SHEETS-001 | Frontend shall read Google Sheets using `VITE_SHEET_ID` and `VITE_API_KEY`. | Missing config surfaces an error; successful reads return row objects keyed by header row. |
| INT-GAS-001 | Frontend shall send write actions to Apps Script using `VITE_GAS_URL`. | Mutations call `sendToGAS(payload)` and receive JSON response. |
| INT-LIFF-001 | LIFF SDK shall initialize only when configured. | Empty LIFF ID skips initialization without crashing normal browser usage. |
| INT-LINE-001 | Apps Script shall use script properties for LINE credentials. | Credentials are not bundled in frontend code. |

## Non-functional Requirements

| ID | Requirement | Acceptance Criteria |
| --- | --- | --- |
| NFR-UX-001 | UI shall be mobile-first and usable inside LINE. | Touch targets are large enough; bottom navigation remains available; forms fit common phone widths. |
| NFR-PERF-001 | Dashboard shall avoid excessive Sheets API reads. | 5-minute localStorage cache is used and invalidated after mutations. |
| NFR-REL-001 | Mutation failures shall not silently appear successful. | Phase 1 shall make frontend mutations throw or show an error when Apps Script returns `status:error`. |
| NFR-SEC-001 | Write access shall not depend only on obscurity of the Apps Script URL. | Phase 2 shall add a write token or auth layer. |
| NFR-MAINT-001 | Schedule logic shall be testable and synchronized. | A shared test matrix covers frontend and Apps Script behavior. |
| NFR-OPS-001 | Setup steps shall be documented and repeatable. | Maintainer can create sheets, deploy GAS, configure env vars, and install reminder trigger from docs. |

## Current Gaps and Risks

### Security

- Apps Script Web App is expected to be public, so the URL acts like a write secret.
- Writes use GET query parameters, exposing data in URLs, browser history, and logs.
- There is no user-level authorization.
- Frontend API key and sheet ID are public in browser bundle; API key restrictions are required.

### Reliability

- `sendToGAS` checks HTTP status but callers do not consistently reject JSON `{status:"error"}`.
- Reminder trigger checks only the hour; minute precision is not guaranteed.
- No duplicate-reminder guard exists. A trigger rerun in the same hour can send duplicate reminders.
- LINE push failures are not inspected or surfaced.

### Maintainability

- Schedule logic is duplicated in `src/schedule.js` and `gas/Code.gs`.
- There are no automated tests for schedule edge cases.
- Inline styles make global UI consistency harder as the app grows.
- `petTracker.md` documents the system but is currently untracked.

### Data Integrity

- Apps Script has limited required-field validation.
- Log deletion is physical, while pet and schedule deletion are soft; this is acceptable but should be explicit.
- `needs_detail` exists in data but is not enforced by UI.
- Cross-sheet references are not validated before writes.

## To-be Improvement Requirements

| ID | Requirement | Priority | Acceptance Criteria |
| --- | --- | --- | --- |
| IR-API-001 | Move write API from GET query params to POST JSON. | High | Apps Script supports `doPost`; frontend mutations use POST; GET remains temporarily compatible or is deprecated with notice. |
| IR-API-002 | Standardize Apps Script responses. | High | All actions return `{status, code, message, data}`; frontend throws on non-ok status. |
| IR-SEC-001 | Add shared write token or lightweight auth. | High | Mutations without valid token are rejected; token is stored in env/script properties, not hardcoded. |
| IR-REM-001 | Prevent duplicate reminders. | High | System records last reminder date/hour per schedule and does not push duplicate message for same due window. |
| IR-TEST-001 | Add schedule logic tests. | High | Daily, monthly clamp, every-N-month, cycle, pre-start-date, and next-due cases are covered. |
| IR-VAL-001 | Add backend validation for required fields and enum values. | Medium | Invalid payloads return `VALIDATION_ERROR` with field details. |
| IR-LIFF-001 | Move LIFF IDs to environment configuration. | Medium | `LIFF_IDS` no longer requires source-code edit for deployment. |
| IR-UX-001 | Enforce `needs_detail` when configured. | Medium | Log types marked `needs_detail=TRUE` require detail before save. |
| IR-OPS-001 | Add operational runbook. | Medium | Setup, deploy, trigger install, failure checks, and rollback steps are documented. |
| IR-UI-001 | Consolidate UI styles into components/classes. | Low | Buttons, cards, chips, forms, and nav share reusable style primitives. |

## Roadmap

### Phase 1: Stabilize Current System

Goal: make existing behavior safer without changing product scope.

- Add response/error handling for Apps Script `status:error`.
- Add backend validation for required fields.
- Add duplicate-reminder protection.
- Add tests or a test matrix for schedule logic.
- Track `petTracker.md` or replace it with reviewed docs.

### Phase 2: Secure and Harden Integrations

Goal: reduce risk around public writes and LINE reminder operations.

- Move mutation API to POST JSON.
- Add shared write token or lightweight authorization.
- Inspect LINE API responses and log failures.
- Move LIFF IDs to environment config.
- Add operational runbook.

### Phase 3: Improve Product Experience

Goal: make the product easier for caregivers and admins.

- Enforce required details for configured log types.
- Add richer pet detail summary, such as last medicine, last symptom, and upcoming medicine.
- Improve medication history visibility.
- Add export/backup guidance or UI affordance.
- Consolidate UI components for maintainability.

## Prioritized Backlog

### BL-API-001: Throw on Apps Script JSON errors

Priority: High

As a caregiver, I need failed saves to show an error so I do not think data was recorded when it was not.

Acceptance criteria:

- `sendToGAS` parses JSON.
- If `status !== "ok"`, it throws an error with the returned message/code.
- Save/delete pages show existing error toast on JSON error.
- Successful saves continue to work.

### BL-REM-001: Prevent duplicate LINE reminders

Priority: High

As a caregiver, I need each due medicine reminder sent once per due window so the LINE group is not spammed.

Acceptance criteria:

- `med_schedules` or a new reminder log stores last reminded date/hour.
- `checkReminders` skips schedules already reminded for the current date/hour.
- Marking medicine taken still creates a medication log.
- Missing reminder metadata does not break old schedules.

### BL-TEST-001: Add schedule logic test matrix

Priority: High

As a maintainer, I need confidence that frontend and backend schedule calculations match.

Acceptance criteria:

- Test cases cover daily, monthly day clamp, every-N-months, cycle, before-start-date, and next-due search.
- Expected outputs are documented in a shared test matrix.
- Any change to schedule logic must update the matrix.

### BL-SEC-001: Add write token

Priority: High

As an admin, I need write endpoints protected from casual misuse by anyone who discovers the Apps Script URL.

Acceptance criteria:

- Frontend sends a write token from environment config.
- Apps Script compares token to script property.
- Missing or invalid token returns `AUTH_REQUIRED` or `AUTH_FAILED`.
- Read-only Google Sheets access remains unchanged.

### BL-API-002: Support POST JSON mutations

Priority: High

As a maintainer, I need write payloads sent as JSON instead of URL query strings.

Acceptance criteria:

- Apps Script implements `doPost`.
- Frontend `sendToGAS` uses POST JSON.
- Required actions still map to the same Apps Script functions.
- Errors return consistent JSON response format.

### BL-VAL-001: Backend payload validation

Priority: Medium

As a maintainer, I need invalid input rejected before it corrupts sheets.

Acceptance criteria:

- Required fields are checked per action.
- Enums are validated for species and schedule type.
- Invalid `config` JSON returns `VALIDATION_ERROR`.
- Error response identifies the invalid field.

### BL-UX-001: Enforce detail requirement for log types

Priority: Medium

As an admin, I need log types marked as requiring details to actually require a note.

Acceptance criteria:

- Add-log page detects selected type `needs_detail=TRUE`.
- Save is disabled or rejected when detail is empty.
- UI labels communicate that detail is required for that type.

### BL-OPS-001: Write deployment and operations runbook

Priority: Medium

As a maintainer, I need setup and recovery steps documented.

Acceptance criteria:

- Runbook explains Sheet setup, Apps Script deployment, env vars, script properties, and trigger installation.
- Runbook explains how to send a test LINE push.
- Runbook includes common failures and checks.

### BL-UI-001: Extract reusable UI primitives

Priority: Low

As a developer, I need consistent reusable UI primitives so new pages do not copy inline styles.

Acceptance criteria:

- Button, card, chip, page, field, and nav styles are centralized.
- Existing screens keep the same behavior.
- Mobile layout remains at least as usable as current version.

## Open Decisions

1. Whether the write-token requirement is enough, or if LINE login/group membership should become an authorization source.
2. Whether reminder timing needs minute-level precision or hourly reminders are acceptable.
3. Whether physical log deletion should remain allowed, or logs should become soft-deleted for auditability.
4. Whether `petTracker.md` should be kept as system documentation or replaced by docs under `docs/`.

## Definition of Done for Requirement Adoption

1. Product owner accepts the scope and priorities.
2. Developer confirms the data/API requirements match current code or intended changes.
3. Phase 1 backlog is converted into implementation tasks.
4. Schedule logic changes include documented test cases.
5. Security-sensitive changes include deployment notes for env vars and script properties.
