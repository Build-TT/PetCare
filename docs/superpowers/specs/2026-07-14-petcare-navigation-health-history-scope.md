# PetCare Navigation, Health Overview, and Treatment History Scope Addendum

Date: 2026-07-14

Status: Proposed scope for review before mockup update

Reference: `2026-07-14-petcare-treatment-reminders-design.md`

## Goal

Refine the previous navigation and add the health-overview, lifestyle tracking, and treatment-history features needed for a caregiver to monitor a pet and discuss a complete history with a veterinarian.

## Global Pet Profile Context

- Every main screen displays the selected pet profile as a round icon at the upper right.
- Tapping the icon opens a profile switcher with all active pets and an `Add pet` action.
- Switching profile immediately changes all screen data and default create targets: Home, Symptom Tracking, Diary & Activity, Reminders, and Manage.
- A route may explicitly retain a selected pet when opening a detail or edit page; no record may be silently saved against a different pet.

## Primary Navigation

Use five fixed bottom-navigation destinations. Reserve content padding for the fixed bar.

1. **Home** — pet overview and overall health graph.
2. **Symptom Tracking** — active medicine/treatment tracking and its detail views.
3. **Diary & Activity** — diary plus pee, poop, walking, and weight logs.
4. **Reminders** — scheduled LINE reminders.
5. **Manage** — configuration and pet history.

The previous standalone Insights destination moves into the selected treatment detail so graphs always have treatment context.

## Home: Pet Overview and Overall Health Graph

Home summarizes the currently selected pet.

- Show profile identity, active treatments, due medication/reminder information, and recent health activity.
- Add an overall-health chart with selectable metric and time scale.
- Metrics: symptom frequency, pee frequency, poop frequency, walking/exercise, and weight.
- Time scales:
  - **Day:** hourly buckets.
  - **Month:** daily buckets.
  - **Year:** monthly buckets.
- Symptoms, pee, and poop use count bars.
- Walking shows count and total duration; a duration in minutes is optional when creating a walking record.
- Weight uses a kilogram line graph and only plots dates with a recorded value.
- Tapping a chart bucket opens the logs represented by the bucket.
- The overview is descriptive only; it must not label the pet as healthy/unhealthy or make a medical diagnosis.

## Symptom Tracking

### Active Tracking List

- Show all active medicine/treatment tracking items for the selected pet.
- Each card shows medicine/treatment name, dose where relevant, recurrence, next due time, and a concise recent-symptom indicator.
- Add a new tracking item with name, optional dose, explicit times or interval frequency, start date, optional end date, and active state.
- Example: `Vetmedin 1.25 mg`, twice daily or every 12 hours.

### Treatment Detail

Opening an active tracking item shows three sections/tabs:

1. **Insights:** daily, monthly, custom-range, and selected-day hourly symptom graphs; symptom summaries; filtered log drill-down.
2. **Treatment Hub:** next dose, mark-taken action, one-tap symptom chips, and add-diary action.
3. **History:** all linked medication, symptom, and diary records, grouped by month.

History requirements:

- Filter by date/date range and symptom.
- Show original date and time.
- Edit or delete each record.
- Recalculate any affected graph immediately after successful save/delete.

## Diary & Activity

### Diary Tab

- Show diary logs for the latest month by default.
- Allow month selection and date filtering.
- Create entries from this tab or from Treatment Hub.
- Edit and delete entries.

### Activity Tab

Supported record types: pee, poop, walking/exercise, and weight.

- Tapping pee, poop, or walking opens a compact record form.
- Date/time defaults to the current time and can be changed.
- Note is optional.
- Walking also has an optional duration in minutes.
- Weight records a required numeric value in kilograms, an editable date/time, and an optional note.
- Show one month of history by default with month selector and type filters (pee, poop, walking, weight).
- Allow editing and deleting every activity record.

## Reminders

Reminder types are limited to:

1. Deworming.
2. Health check.
3. Blood test.
4. Other.

When `Other` is selected, a custom title is required. Existing medication dosing remains a treatment-tracking concern; a medication reminder may be created when required by reusing the treatment schedule rather than creating a duplicate reminder rule.

Each reminder supports start date/time, recurrence, optional end rule, active state, and multiple LINE recipients. Delivery records prevent duplicate sends for the same due occurrence.

## Manage

Manage contains:

- Symptom catalogue used by Treatment Hub quick-log chips.
- LINE recipients.
- Google Sheet connection.
- TH/EN language preference.
- Pet profile management.
- Treatment history.

## Treatment History

Treatment history is a separate pet-profile feature for long-lived or resolved medical cases. It is not a replacement for active tracking.

### Case Record

Create a case with:

- Title, for example `Pancreatitis` or `Spinal surgery`.
- Type: diagnosis/condition, surgery, accident, or other treatment.
- Start date, optional end date, and status: active treatment, follow-up, or completed.
- Hospital/veterinarian and free-text notes.
- Important events such as tests, surgery, medicine changes, and follow-up results.

### Case Detail and Veterinarian Discussion View

- A chronological timeline of case events.
- Link zero or more active tracking items to a case.
- Filtered medication, symptom, diary, activity, and weight records for a selected case/date range.
- A concise chronological summary intended for a veterinary consultation.
- This release stores text-only history and event details. Photo/PDF attachments are explicitly out of scope until storage and sharing requirements are separately defined.

## Secondary Screens

- Profile switcher and add-pet form.
- Pet detail/edit/archive screen.
- Create/edit active tracking screen.
- Treatment detail with Insights, Hub, and History tabs.
- Create/edit symptom, medication, diary, pee, poop, walking, and weight records.
- Create/edit reminder screen.
- LINE recipient management screen.
- Google Sheet connect/validation screen.
- Treatment history list, case editor, case detail, and consultation-summary view.

## Data and Integrity Notes

- All health data must include `pet_id`, `datetime`, and audit-friendly creation/update metadata.
- Activity records additionally use `activity_type`, optional `duration_minutes`, optional `weight_kg`, and optional note.
- Health-history cases use a stable `case_id`; linked tracking/log records store an optional `case_id`.
- Editing/deleting records must update the data source and invalidate relevant cached summaries/graphs.
- The Google Sheet setup must add missing tabs/columns non-destructively.

## Acceptance Criteria

- Selecting a profile changes every main view to that pet's records and all quick-add defaults.
- A caregiver can create an active medication tracking item, log a dose/symptom, filter its history, and edit/delete a log.
- Diary and activity histories are editable, filterable, and month-selectable.
- Health graph supports metric selection and day/month/year aggregation as specified.
- Reminders support the four specified types; `Other` cannot save without a title.
- A treatment-history case can link current tracking items and present its timeline for veterinary discussion.
- No health graph, label, or alert presents itself as a diagnosis.
