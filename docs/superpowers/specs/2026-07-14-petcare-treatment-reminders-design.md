# PetCare Treatment, Tracking, and Reminders UX/UI Design

Date: 2026-07-14

Status: Approved reference design

## Purpose

Extend PetCare from a basic medication schedule into a mobile-first pet health companion. It must help caregivers track treatment changes, capture symptoms immediately, keep a daily diary, see symptom patterns, and send flexible LINE reminders.

This document is the source of truth for future UX/UI changes unless explicitly superseded.

## Visual Direction

- Style: warm, clean, rounded pet-care web app.
- Primary color: `#624a3e`.
- Secondary/accent color: `#e2c9ab`.
- Surfaces: off-white and pale warm-beige cards; minimal borders; generous whitespace.
- Typography: Kanit as the primary Thai/English font. Use `Noto Sans Thai` and system fonts as fallbacks.
- Accessibility: base text at least 16 px; important values 18–24 px; buttons 16–18 px; symptom buttons use two columns on mobile for comfortable touch targets.
- Language: a persistent TH/EN setting, exposed in Settings and available as a compact toggle where needed.
- Navigation: fixed bottom navigation with five items: Home, Insights, Diary, Reminders, Manage. Content must reserve bottom padding so the navigation never covers it.

## Main Navigation and Screens

### 1. Home / Treatment Hub

The pet-focused home screen. It shows the selected pet and the active treatment card.

- Active treatment: medicine name, current dose, frequency, next scheduled time, and `Mark taken` action.
- Example: `Prednisolone 5 mg`, starting 13 July, either explicitly at 09:00 and 21:00 or every 12 hours.
- A completed dose log records the actual time and dose used.
- Symptom quick logging: caregiver-configured symptom chips such as sleepy, vomiting, panting, and itchiness. One tap immediately creates a symptom log with the current timestamp and the linked treatment. A separate action supports a backdated time and optional detail.
- Diary entry: free-text daily note for food, sleep, activity, stool, behaviour, or contextual observations.
- Recent treatment timeline: medication doses, symptoms, and diary entries in chronological order.

### 2. Insights

Treatment-specific symptom analysis.

- Period filters: 7 days, 30 days, custom range, and a selected-day mode.
- Daily frequency graph for short ranges and monthly aggregation for multi-month ranges.
- Selected-day hourly bar chart. Selecting a bar shows the symptom logs in that hour.
- Summary cards: total symptoms, most frequent symptom, busiest date, and most frequent time window.
- Per-symptom summary, for example: `Sleepy: 7 times, most often 12:00–18:00`.
- Use the visual system above: large labels, warm brown active bar, muted beige comparison bars.

### 3. Diary

Daily free-form health and lifestyle record.

- Date selector.
- New-entry field with optional tags in a future iteration.
- Timeline of entries for the selected date.
- Diary data remains separate from symptoms but is visible in the treatment timeline and useful when reviewing causes.

### 4. Reminders

A dedicated reminder list with an add action and optional near-due filter.

Supported reminder types:

1. Vaccination.
2. Deworming.
3. Blood test or health check.
4. Follow-up, such as an echocardiogram or pancreatitis follow-up.
5. Medication, with medicine name and dose such as `Vetmedin 1.25 mg`.

Each list card shows type, title, next due date/time, recurrence summary, and recipient chips.

Reminder editor fields:

- Pet.
- Type.
- Title and optional detail.
- Start date/time.
- Frequency: once, every X hours/days/months/years, or every hour/day/month/year.
- End rule: no end date, end on date, or stop after N occurrences.
- Multiple LINE recipients per task.
- Active/inactive state.

The default end rule is `No end date`; an end date is not required and does not improve performance. Store one recurrence rule and the next due time, rather than pre-generating future reminders. For safety and usability, surface an annual review prompt for active reminders with no end date.

Overdue reminders must not spam the recipient. Record reminder deliveries per due occurrence; send at the scheduled due time and use a deliberate, configurable escalation rule rather than sending again every trigger run.

### 5. Manage

Configuration area containing:

- Pets: add, edit, archive, and open a pet detail/history screen.
- Treatment plans: manage medicine, dose, start date, explicit times or interval frequency, and active state.
- Symptom catalogue: create, edit, reorder, or deactivate symptom quick-log chips.
- LINE recipients: save a display name and recipient identifier; select multiple recipients for each reminder.
- Google Sheet data source: connect and validate a spreadsheet.
- Language: Thai or English.

## Google Sheet Connection

Users can connect a chosen Google Sheet from Settings by pasting its URL.

Connection flow:

1. User shares the spreadsheet with the Google identity that runs the application Apps Script.
2. User pastes the spreadsheet URL.
3. The app extracts and validates the Sheet ID and checks write access.
4. The backend creates missing tabs and headers without deleting existing data.
5. The app saves the connected data-source configuration and confirms success.

Suggested tabs:

- `pets`
- `treatments`
- `medication_logs`
- `symptoms`
- `diary_entries`
- `reminders`
- `reminder_deliveries`
- `line_recipients`

The frontend must not rely on a public browser API key alone to write data to an arbitrary sheet. Apps Script should perform validation, setup, and writes.

## LINE Recipient Rules

Each reminder can select one or more saved recipients. A recipient represents a LINE Messaging API `userId`, `groupId`, or `roomId`, plus a readable display name.

The UI must not imply that a normal searchable LINE handle is enough. The bot can push to a user who is eligible to receive its messages, or to a group/room the bot has joined. Recipient IDs should be captured from an authorized connection/setup flow and validated before use.

## Key User Flows

### Record a treatment response

1. Open Home for a pet.
2. Mark a dose taken or observe a symptom.
3. A dose records actual time/dose; a symptom chip records the current time automatically.
4. Optionally add diary context.
5. Open Insights to compare the treatment timeline and symptom frequency.

### Create a reminder

1. Open Reminders and choose Add.
2. Select a type and pet.
3. Enter title, dates, frequency, and end rule.
4. Select one or more LINE recipients.
5. Save; backend calculates `next_due` and sends future notifications.

## Error Handling and Empty States

- Clearly report failed saves; do not show a successful state unless Apps Script confirms the write.
- Explain missing Google Sheet sharing permissions and provide the identity that needs access.
- Do not allow invalid recurrence values: interval must be positive; selected-time schedules need at least one time; end date cannot precede start date.
- A failed LINE delivery is logged against the due occurrence and shown in the reminder detail for troubleshooting.
- Empty states should offer the relevant action: add a pet, create treatment, add a symptom, connect a sheet, or create a reminder.

## Design References

Interactive brainstorming mockups are stored temporarily under `.superpowers/brainstorm/` during the design session. The stable requirements are recorded in this document, not dependent on the local companion server.
