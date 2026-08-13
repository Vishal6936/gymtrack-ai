GymTrack AI — Minimal v2 Updated

Navigation:
Dashboard | Snapshot | Activity | Log | Plan | Body | Notes | Settings

Design direction:
- Clean, minimal, aesthetic dark UI.
- Mostly neutral graphite surfaces and typography.
- Color is used sparingly for meaningful states only.
- No decorative aurora background, rainbow headers, or glowing gradients.
- Consistent restrained buttons, borders, spacing and typography.
- Mobile-first layout; the page itself never needs horizontal scrolling.

Dashboard:
- Compact Today status.
- Real Daily Workout Completion chart for the last 30 days.
- Actual completion percentage is calculated from planned vs completed exercises.
- Rest days are neutral/blank; missed planned workouts are 0%.
- Visible percentage Y-axis, dates, hover/tap tooltips and a mobile-friendly chart height.
- Shows 30-day average and workout days.
- Shows both Current Day Streak and Longest Streak.

Snapshot:
- Each exercise history contains exactly four visible columns:
  Date | Set 1 | Set 2 | Set 3
- No visible volume column, percentage column, set 4, set 5, or extra statistics.
- The app still calculates session volume internally for analysis and comparisons.
- Only the Date cell is conditionally colored.
- Green = current session volume increased versus the previous comparable session.
- Red = current session volume decreased.
- Neutral gray = no meaningful comparison / first recorded session.
- Mobile layout keeps the Snapshot screen within the viewport; only the contained table may scroll if ever necessary.

Activity:
- Calendar interaction remains unchanged: select a date and details appear immediately below.

Log:
- Clean date navigation and compact exercise cards.
- Exactly 3 sets per exercise; no Set 4 or Set 5.
- Existing historical sets are displayed/saved as a maximum of 3.
- Add Exercise remains available.
- Load Workout remains available and opens Saved Workouts.
- Save Workout is the primary action and stays accessible in a sticky action group.
- Load Workout is secondary; Add Exercise is secondary outlined.

Plan:
- Weekly Plan remains the normal weekly structure.
- Saved Workouts are retained for reusable/custom workouts.
- Saved Workouts can be Loaded, Edited, or Deleted.
- New Saved Workout replaces the old template-oriented terminology.
- No unnecessary template-management architecture.

Body:
- Existing measurement functionality remains.
- Save Measurements is treated as the primary action.
- Add Measurement remains secondary.

Notes:
- Existing notes functionality remains with the same visual button hierarchy.

Settings:
- Intentionally quiet and simple: text, subtle dividers, compact controls and data actions.

Data note:
Existing localStorage data is preserved. The redesign changes presentation and the visible logging/history model; it does not intentionally erase existing workout history, measurements, notes, plans or saved workouts.
