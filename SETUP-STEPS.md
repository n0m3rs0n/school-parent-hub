# Setup steps (do these yourself, in order)

Nothing below has been done yet. Items marked ⚠️ are ones I couldn't check against your exact screen.

## 0. Pick a hub key
Make up a random string of about 24 letters and numbers, with no spaces or `&`. Example format: `k7Qm2xR9vB4tLp8wZc3nHs6d`.
You'll paste this same string in three places.

## A. Apps Script
1. Open the Announcements Google Sheet, then go to **Extensions → Apps Script**.
2. Open **Code.gs**. Select all (Ctrl/Cmd+A), paste the new `apps-script/Code.gs`, then click **💾 Save project**.
3. Near the top of the file, check `TD_SHEET_ID` inside `CONFIG`.
   - It's already set to the current TD sheet's ID.
   - If the sheet ever changes, replace it with the long ID between `/d/` and `/edit` in the sheet's URL, then save.
   - Your Google account must be able to open that sheet.
4. Click **⚙️ Project Settings** (gear in the left sidebar).
5. Scroll to **Script Properties**, then click **Add script property** (or **Edit script properties** if some already exist).
6. Enter Property `HUB_KEY` and paste your key as the Value, then click **Save script properties**.
7. Click **Deploy → New deployment**.
8. Click the ⚙️ next to "Select type" and choose **Web app**.
9. Fill in the deployment settings:
   - Description: `v2 key + TD endpoint`
   - **Execute as: Me**
   - **Who has access: Anyone**
10. Click **Deploy**.
    - If Google asks you to authorize, click **Authorize access** and choose your account.
    - ⚠️ If you see "Google hasn't verified this app", click **Advanced → Go to … (unsafe)**, then **Allow**. The new code reads the TD sheet by ID, so a new permission prompt may appear.
11. Copy the **Web app URL**. It ends in `/exec`.
12. Tip: if you'd rather keep the old URL, use **Deploy → Manage deployments → ✏️ (edit) → Version: New version → Deploy** instead of steps 7–11.
13. Test in a private/incognito browser window:
    - `…/exec`: you should see `{"error":"unauthorized"}`
    - `…/exec?k=YOURKEY`: you should see the announcements list
    - `…/exec?view=td&k=YOURKEY`: you should see `{"updatedAt":…,"entries":[…]}`. There should be no phone numbers in it.
14. ⚠️ The current deployment returns **403**. If the test in step 13 also gives 403 or a Google sign-in page:
    - Check "Who has access" again.
    - If you're signed in with an ateneo.edu (Workspace) account, the school admin may not allow "Anyone". Then you'd only see "Anyone within ateneo.edu". If so, deploy from a personal Gmail account instead.
15. Optional: to tighten files that were already uploaded, choose `restrictExistingUploadedFiles` in the function dropdown and click **Run** once.

## B. Website config
In both `website/app.js` and `website/td-companion.js`, set these in `CONFIG`:
- `API_URL`: the `/exec` URL from step A11
- `HUB_KEY`: your key

Then commit and push to `main`. GitHub Pages will redeploy on its own.

## C. TD Google Sheet
1. Open the TD sheet and click **Share** (top right).
2. Under **General access**, change "Anyone with the link" to **Restricted**, then click **Done**.
   - Keep yourself (the Apps Script owner) on the access list, or the website can't read the schedule.
   - ⚠️ If you're not the owner and the dropdown is greyed out, the owner has to change it, or turn on "Editors can change permissions" (⚙️ in the Share dialog).
   - "Viewer" access for anyone with the link would still expose the phone numbers. Use Restricted.

## D. Google Form for sign-ups
1. Go to **forms.google.com** and click **+ Blank form**.
2. Title: "11-Escribano TD Companion Sign-up".
3. Add these questions:
   - Parent name (Short answer, **Required**)
   - Session date (Dropdown, listing the OPEN dates, **Required**)
   - Contact number (Short answer, **Required**). Only you see the responses.
4. Optional: open the **Responses** tab and click **Link to Sheets** to collect answers in a private sheet.
5. Click **Send** (top right), then the **🔗 link** tab.
6. Tick **Shorten URL** and click **Copy**.
7. Paste the link into `SIGNUP_FORM_URL` in `website/td-companion.js`, then commit and push.
8. When someone signs up, type their **name** (not their number) into the TD sheet's Companion column.

## E. Resources (optional)
To use restricted copies of the Seat Plan or Formators:
1. Make a copy in Drive and share it only with the Ateneo domain or with specific parents.
2. Paste its link into `RESTRICTED[...].url` in `website/resources.js`.

To hide the "Ateneo login required" badges, set `SHOW_LOGIN_REQUIRED_BADGE: false`.
