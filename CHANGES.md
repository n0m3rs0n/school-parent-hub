# Changes (Oct 12, 2026), local only, not deployed

Baseline: the first git commit `36c63f4` in this folder. There's also a plain copy in `/workspace/School-Parent-Hub-original/`.
To review: `git status` and `git diff` (new files show as untracked).

## 1. TD Companion: phone numbers no longer reach the browser
- **Why:** `td-companion.js` loaded the whole public TD sheet through Google's gviz feed, so every visitor's browser got every column, including Contact #. The page also linked to the sheet's public `edit?usp=sharing` URL.
- **Code.gs:** new `?view=td` endpoint (`getTdSchedulePayload_`, `readTdSchedule_`). It reads the sheet on Google's side and returns only `date, dateLabel, activity, companion, remarks`. It finds columns by header name and falls back to B/C/F. As a backup, it replaces anything that looks like a phone number (7+ digits) with `[number hidden]`. Results are cached for 60 s.
- **Config:** `CONFIG.TD_SHEET_ID`, `TD_SHEET_TAB`, `TD_INCLUDE_REMARKS` and `TD_CACHE_SECONDS` are in Code.gs only. The sheet ID has been removed from every website file.
- **td-companion.js:** rewritten to use `fetch()` against `API_URL?view=td&k=HUB_KEY` instead of JSONP/gviz.
- **Sign-up link:** the sheet link is replaced by `CONFIG.SIGNUP_FORM_URL = 'REPLACE_WITH_GOOGLE_FORM_URL'` (marked TODO). Until a real `https://` link is set, the sign-up button and the per-row "Sign up →" links are hidden. A "sign-up form coming soon, message the class Viber group" note shows instead.
- **Error text:** "The TD schedule is temporarily unavailable; check the class Viber group."

## 2. Announcements feed: shared key, sender allowlist, tighter Drive sharing
- **Why:** the feed was open to anyone who had the URL. It returned every email labeled "School" in Gmail, and every attachment was shared as "Anyone with the link".
- **Shared key:** `doGet` now requires `?k=` to match Script Property `HUB_KEY`. If the property isn't set, nothing is served (`{"error":"unauthorized"}`). Note: the key can be read in the site's JavaScript, so it only stops casual scraping and indexing. It is not a password.
- **Sender allowlist:** `CONFIG.ALLOWED_SENDER_DOMAINS = ['ateneo.edu']`. Only rows whose sender is `@ateneo.edu` or one of its subdomains are served. The filter runs when the feed is served, so emails already in the sheet are covered and the sheet itself is unchanged.
- **Drive sharing:** `CONFIG.DRIVE_SHARING` now defaults to `'DOMAIN_WITH_LINK'`. Other options are `'PRIVATE'` and `'ANYONE_WITH_LINK'`. If the account can't use domain sharing (a personal Gmail account), the file is left PRIVATE and a log line is written.
- **Trade-off:** parents without access will see Google's "Request access" page instead of the preview.
- **Optional:** `restrictExistingUploadedFiles()` re-applies the setting to files that were already uploaded. It's never run automatically.
- **app.js:** sends `CONFIG.HUB_KEY` (placeholder `REPLACE_WITH_HUB_KEY`). It treats any response that isn't an array as unavailable. Error text: "Announcements are temporarily unavailable; check the class Viber group."

## 3. Resources: "Ateneo login required" badges
- **New `resources.js`:**
  - `RESOURCES_CONFIG.SHOW_LOGIN_REQUIRED_BADGE` (true) adds a "🔒 Ateneo login required" badge to the Formators and Seat Plan cards, plus a note at the top of the page.
  - `RESTRICTED['formators'|'seat-plan'].url`: paste a restricted copy's link there to swap the card's link. Empty means the current link is kept.
- No links were removed.
- **Note:** the badge shows even while the current links are still public. Turn the flag off, or swap in restricted links, so the badge stays accurate.

## 4. Important Dates and TD status
- The "Nov 14–15 TD Home Visit" entry is now "December 5 (Sat) — TD Home Visit (rescheduled from Nov 14–15)", moved into date order (`data-date="2026-12-05"`).
- In `statusFor`, companion cells such as RE-SCHEDULED, CANCELLED, POSTPONED, MOVED, NO SESSION or N/A now become `note`. They show as a neutral grey outlined badge ("Rescheduled", "Cancelled"), not the green companion badge.

## 5. Polish
- **Favicon:** `website/favicon.svg` is a blue tile with a white heart, matching the header icon. It is not the school seal. It's linked from all four pages.
- **Mobile nav:** at ≤480px the header and tab font are slightly smaller, so all four tabs fit at 390px. On narrower phones the tabs scroll sideways with a right-edge fade, and the current tab is scrolled into view (`theme.js`).
- Added a global `[hidden]{display:none!important}` so hidden buttons really hide.
- Version numbers on the file links were bumped (`style.css?v=2`, `app.js?v=2`, `td-companion.js?v=3`) so browsers load the new files instead of cached ones.

## Local preview mock
- Adding `?mock=1` to `index.html` or `td-companion.html` loads `website/mock/announcements.json` / `website/mock/td.json` instead of the live API, and shows a "Preview mode" banner.
- The mock data is fictional ("Parent A", "[SAMPLE]…"). Note that `website/mock/` would be published with the site, which is harmless.
- `shoot.py` now also captures `index-mock-*.png` and `td-companion-mock-*.png`.

## Files
- **Modified:** `apps-script/Code.gs`, `website/app.js`, `website/td-companion.js`, `website/td-companion.html`, `website/index.html`, `website/resources.html`, `website/important-dates.html`, `website/style.css`, `website/theme.js`, `shoot.py`, `README.md` (note only).
- **New:** `website/favicon.svg`, `website/resources.js`, `website/mock/td.json`, `website/mock/announcements.json`, `CHANGES.md`, `SETUP-STEPS.md`.
