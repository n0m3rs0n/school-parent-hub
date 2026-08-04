# School Parent Information Hub (Phase 1 MVP)

A free, static website that automatically pulls school announcement emails
out of Gmail and displays them in a searchable, filterable, mobile-friendly
site — no paid services, no database, no backend server to maintain.

```
Gmail (label: School)
      ↓
Google Apps Script (reads, categorizes, dedupes)
      ↓
Google Sheets ("Announcements" tab)
      ↓
Apps Script Web App (doGet → JSON API, public-safe fields only)
      ↓
Static website (GitHub Pages: HTML/CSS/vanilla JS)
```

---

## 1. Project Structure

```
School-Parent-Hub/
│
├── .github/
│   └── workflows/
│       └── deploy.yml     # GitHub Actions: publishes website/ to GitHub Pages
│
├── website/
│   ├── index.html      # Page markup: header, search/filter, cards, modal, footer
│   ├── style.css        # Material-inspired styling, responsive, accessible
│   └── app.js            # Fetches JSON API, renders cards, search/filter/modal logic
│
├── apps-script/
│   └── Code.gs           # Gmail import, categorization, Sheet writer, JSON API
│
├── docs/
│   └── screenshots/       # Put screenshots of the live site here (optional)
│
└── README.md
```

---

## 2. How It Works

1. You label relevant emails in Gmail with the label **School**.
2. Apps Script runs `importEmails()` — manually the first time, then
   automatically every 15 minutes via a time-driven trigger.
3. For each new message (deduplicated by Gmail Message ID), it:
   - Extracts date, subject, sender, plain text body, HTML body, attachment names.
   - Auto-assigns a **Category** (General, Academics, Events, Finance, PTA, Sports)
     based on keyword matching.
   - Writes a summary + all fields into the **Announcements** Google Sheet.
4. The same Apps Script project is deployed as a **Web App**. Its `doGet()`
   function reads the sheet and returns ONLY the public-safe fields as JSON:
   `date, title, category, summary, body, bodyHtml, attachments`.
   It never exposes Message ID, sender email, or import timestamps.
5. The static website (`website/`) fetches that JSON URL and renders cards,
   with client-side search, category filtering, and a "Read More" modal that
   renders the announcement's original HTML formatting (links, lists, tables,
   images) via a hand-written sanitizer in `app.js`.

> **Security note on `bodyHtml`:** this field is the *raw, unsanitized* HTML
> from the original email. It's safe to fetch, but never insert it into a
> page with `innerHTML` without sanitizing first — `website/app.js`'s
> `Sanitize` module does this (strips scripts/styles/event handlers/unsafe
> URLs) before rendering it in the modal. If you build another consumer of
> this API, sanitize `bodyHtml` yourself before rendering it, or stick to
> the plain-text `body` field.

---

## 3. Deploying the Apps Script Backend

1. Go to [Google Sheets](https://sheets.new) and create a new spreadsheet
   (e.g. name it "School Parent Hub Data"). This will hold the `Announcements` sheet.
2. In the Sheet, open **Extensions → Apps Script**.
3. Delete the default `Code.gs` contents and paste in the entire contents of
   [`apps-script/Code.gs`](apps-script/Code.gs) from this project.
4. Click **Save** (the disk icon), and name the project (e.g. "School Parent Hub").

### 3.1 Create the Gmail label

1. In Gmail, create a label named exactly **School** (Settings → Labels → Create new label).
2. Apply this label to the school emails you want imported (manually, or set up
   a Gmail filter that auto-labels mail from your school's domain).

### 3.2 Authorize Gmail and Drive access

1. Back in the Apps Script editor, select the function `setupProject` from the
   function dropdown at the top, then click **Run**.
2. Google will prompt you to authorize the script. Click **Review Permissions**,
   choose your Google account, click **Advanced → Go to [project name] (unsafe)**
   (this warning appears because the script isn't published/verified by Google —
   it's normal for personal scripts), then **Allow**.
3. This authorizes the script to read Gmail, edit the spreadsheet, and create
   files in Google Drive. The Drive permission is used only to host inline
   email images (e.g. a letterhead logo) so they can display on the public
   website — Gmail's `cid:` image references only work inside Gmail itself.
   Those images are uploaded to a folder named **"School Parent Hub - Inline
   Images"** in your Drive, and each uploaded file is shared as "anyone with
   the link can view" — the same public exposure as the announcement it came
   from, nothing more sensitive.
4. `setupProject` will:
   - Create the **Announcements** sheet with the correct header row (if missing).
   - Install a time-driven trigger that runs `importEmails` every 15 minutes.
5. Check the **Executions** tab (left sidebar) to confirm it ran without errors.

> If you're updating an existing deployment to a newer `Code.gs` that added
> the Drive folder feature, re-run `setupProject` (or `importEmails`) once —
> Apps Script will prompt you to re-authorize with the added Drive scope.

### 3.3 Run your first import manually (optional but recommended)

1. Select `importEmails` from the function dropdown and click **Run**.
2. Open your Google Sheet — you should see rows appear in the **Announcements** tab.
3. From now on, this happens automatically every 15 minutes.

---

## 4. Publishing the Web App (JSON API)

1. In the Apps Script editor, click **Deploy → New deployment**.
2. Click the gear icon next to "Select type" and choose **Web app**.
3. Configure:
   - **Description**: e.g. "School Parent Hub API v1"
   - **Execute as**: **Me** (your account)
   - **Who has access**: **Anyone** (this makes the JSON endpoint publicly
     readable — this is required for the static website to fetch it, and is
     safe because `doGet()` only returns public-safe fields)
4. Click **Deploy**.
5. Google will show a **Web app URL** that looks like:
   `https://script.google.com/macros/s/AKfycb.../exec`
6. Copy this URL — you'll paste it into the website next.
7. Test it: open the URL directly in a browser tab. You should see a JSON
   array of announcements (or `[]` if none have been imported yet).

> **Important:** Every time you edit `Code.gs` after this, you must create a
> **new deployment** (or use **Manage deployments → Edit → New version**) for
> the changes to take effect on the live Web App URL.

---

## 5. Configuring and Deploying the Website

1. Open [`website/app.js`](website/app.js) and find this near the top:
   ```js
   const CONFIG = {
     API_URL: 'PASTE_YOUR_APPS_SCRIPT_WEB_APP_URL_HERE',
     ...
   };
   ```
2. Replace `PASTE_YOUR_APPS_SCRIPT_WEB_APP_URL_HERE` with the Web App URL from
   Step 4 above (keep the quotes).
3. Push the whole `School-Parent-Hub` folder (including `.github/`) to a
   GitHub repository, with `website/` as a subfolder — no need to move
   anything to the repo root:
   ```bash
   git init
   git add .
   git commit -m "Initial commit: School Parent Hub"
   git branch -M main
   git remote add origin https://github.com/<your-username>/<repo-name>.git
   git push -u origin main
   ```
4. In the repository, go to **Settings → Pages**.
5. Under **Build and deployment → Source**, choose **GitHub Actions**
   (not "Deploy from a branch"). This repo already includes a workflow at
   [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) that
   publishes only the `website/` folder — it runs automatically:
   - on every push to `main` that touches `website/**`, and
   - on demand from the **Actions** tab (**Run workflow** button) for the
     `Deploy website to GitHub Pages` workflow.
6. Watch it run: go to the **Actions** tab and confirm the workflow
   completes with a green checkmark. The first run may need to be triggered
   manually (**Run workflow**) since enabling Pages doesn't retroactively
   trigger the push event.
7. Once it succeeds, GitHub Pages will show your live URL under
   **Settings → Pages**, in the form
   `https://<your-username>.github.io/<repo-name>/`.
8. Visit the URL — you should see the site load announcements from your
   Apps Script API.

> Editing anything outside `website/` (e.g. `Code.gs` or this README) will
> **not** trigger a redeploy — the workflow only watches `website/**`. Editing
> the website content will redeploy automatically on push to `main`.

---

## 6. Updating the Project

- **To change how emails are categorized**: edit the `CATEGORY_KEYWORDS`
  object in `apps-script/Code.gs`, save, and create a new Web App deployment
  version if the API's data shape changed (categorization changes alone don't
  require a redeploy of the Web App — they just affect future imports — but
  redeploy if you changed `doGet()`).
- **To change the import frequency**: edit `CONFIG.TRIGGER_INTERVAL_MINUTES`
  in `Code.gs`, then delete the old trigger (**Triggers** icon in the left
  sidebar of the Apps Script editor → delete the `importEmails` trigger) and
  re-run `setupProject` to recreate it with the new interval.
- **To update the website's look or behavior**: edit `style.css` / `app.js` /
  `index.html` and push to GitHub — Pages redeploys automatically.
- **To re-import everything from scratch**: clear all rows below the header
  in the Announcements sheet, then run `importEmails` manually (it will treat
  every labeled email as new since MessageIDs will no longer be present).

---

## 7. Troubleshooting

| Problem | Likely Cause | Fix |
|---|---|---|
| `Gmail label "School" not found` in logs | Label doesn't exist or is misspelled | Create a Gmail label named exactly `School` |
| No rows appear after running `importEmails` | No emails have the `School` label yet | Apply the label to at least one email, then re-run |
| Website shows "Something went wrong while loading announcements" | `API_URL` in `app.js` is still the placeholder, or wrong | Confirm you pasted the correct deployed Web App URL, including `/exec` at the end |
| Web App URL returns an HTML login page instead of JSON | "Who has access" wasn't set to "Anyone" | Redeploy with **Who has access: Anyone** |
| Changes to `Code.gs` don't show up on the live API | Web App deployments are versioned snapshots | Use **Manage deployments → Edit → New version** after every code change |
| Duplicate announcements appear | Message ID column was cleared/edited manually | Don't manually edit the `MessageID` column; it's the dedup key |
| Trigger isn't running automatically | Trigger was never created, or was deleted | Re-run `setupProject()` once to recreate it |
| `Exception: You do not have permission to call GmailApp` | Authorization was not completed or was revoked | Re-run `setupProject`, complete the OAuth consent screen fully |

---

## 8. Roadmap

The codebase is intentionally modular so these can be layered in later
without major rewrites.

**Phase 2 — Implemented**
- ✅ Rich text rendering: the "Read More" modal renders the original HTML
  email body (links, lists, tables, images) through a hand-written
  allowlist sanitizer in `app.js` (`Sanitize` module) — see the security
  note in [Section 2](#2-how-it-works).
- ✅ Pagination: the grid shows `CONFIG.PAGE_SIZE` (default 9) announcements
  per page with Prev/Next controls (`Pagination` module in `app.js`).
  Search and category filtering still run across the full fetched dataset —
  only rendering is paginated, so results stay accurate across pages.
- ✅ Inline image hosting (partial "Attachment uploads to Google Drive"):
  inline email images (e.g. letterhead logos) are uploaded to a shared
  Drive folder at import time and shown inline in the "Read More" modal —
  see `resolveInlineImages_` in `Code.gs` and the setup note in
  [Section 3.2](#32-authorize-gmail-and-drive-access). Regular file
  attachments (PDFs, etc.) are still just listed by name, not previewed —
  that's covered by "PDF preview / image preview" below.

**Phase 2 — Not Yet Built**
- PDF preview / image preview (for actual file attachments, not inline images)
- Dark mode
- Monthly archive view
- Print announcement
- Share button
- Better category management (custom categories, per-category colors config)
- Advanced search (date range, sender, multi-category)

**Phase 3**
- Admin dashboard
- Multiple schools / multiple Gmail labels
- User authentication / parent login
- Push notifications
- Email subscriptions
- School calendar integration
- Event management
- Analytics dashboard
- Multi-language support
- Role-based permissions

---

## 9. Tech Stack

Google Apps Script · Google Sheets · HTML5 · CSS3 · Vanilla JavaScript (ES6) · GitHub Pages

No React/Vue/Angular, no Firebase, no paid APIs, no external database — 100% free Google services and static hosting.
