/**
 * ============================================================================
 * SCHOOL PARENT INFORMATION HUB — Apps Script Backend
 * ============================================================================
 *
 * WHAT THIS FILE DOES
 * --------------------
 * 1. Scans Gmail for messages with the label "School".
 * 2. Skips any message that has already been imported (dedup by Message ID).
 * 3. Auto-categorizes each message using keyword matching.
 * 4. Uploads inline email images (e.g. letterhead logos) to a shared Drive
 *    folder and rewrites the HTML body to point at them, since Gmail's
 *    cid: image references don't resolve outside Gmail.
 * 5. Writes the message data into the "Announcements" Google Sheet.
 * 6. Exposes a doGet() JSON API that the public website reads from:
 *      ?k=KEY            -> announcements (allowlisted senders only)
 *      ?view=td&k=KEY    -> TD Companion schedule (safe columns only)
 *    Both require the shared key stored in Script Property HUB_KEY.
 * 7. Installs a time-driven trigger that repeats this process every 15 minutes.
 *
 * SETUP
 * -----
 * See the project README.md for full step-by-step deployment instructions.
 * In short:
 *   1. Create/open a Google Sheet, open Extensions > Apps Script.
 *   2. Paste this file in as "Code.gs".
 *   3. In Gmail, create a label called "School" and apply it to relevant mail.
 *   4. Run `setupProject` once from the Apps Script editor to:
 *        - create the "Announcements" sheet with headers
 *        - install the 15-minute time trigger
 *      (this also triggers the Gmail + Drive authorization prompt)
 *   5. Deploy > New deployment > Web app to get the JSON API URL.
 *
 * FUTURE PHASES (NOT IMPLEMENTED YET — see README "Roadmap")
 * ------------------------------------------------------------------
 * Phase 2: PDF/image attachment preview, dark mode, monthly archive,
 *          print/share, better category management, advanced search.
 * Phase 3: Admin dashboard, multi-school/multi-label support, auth,
 *          push notifications, email subscriptions, calendar integration, etc.
 *
 * The code below is intentionally organized into small, single-purpose
 * functions and named constants so those future features can be added
 * without reworking the core import/categorize/serve pipeline.
 * ============================================================================
 */

// ============================================================================
// CONFIGURATION — change these values to match your setup
// ============================================================================

const CONFIG = {
  // Gmail label to read announcements from. Must exist in Gmail already.
  GMAIL_LABEL: 'School',

  // Name of the sheet (tab) where announcements are stored.
  SHEET_NAME: 'Announcements',

  // How often the auto-import trigger should run, in minutes.
  TRIGGER_INTERVAL_MINUTES: 15,

  // Max number of Gmail threads fetched per run (safety cap to avoid
  // execution-time limits on very large mailboxes).
  MAX_THREADS_PER_RUN: 100,

  // Default category when no keyword matches.
  DEFAULT_CATEGORY: 'General',

  // Length (characters) of the auto-generated plain-text summary.
  SUMMARY_LENGTH: 220,

  // Google Sheets hard-caps a single cell at 50,000 characters. Body
  // fields (especially HTML with inline styles/images) can exceed that,
  // so we truncate before writing. Kept comfortably under the real limit.
  MAX_CELL_LENGTH: 49000,

  // Drive folder where inline email images (e.g. letterhead logos) get
  // uploaded so they can be shown on the website — a cid: image
  // reference only resolves inside Gmail, not in a browser. Sharing is
  // controlled by DRIVE_SHARING below.
  INLINE_IMAGE_FOLDER_NAME: 'School Parent Hub - Inline Images',

  // Drive folder for real file attachments (PDFs, images, etc. — not
  // inline email images), uploaded so the website can preview them
  // instead of just listing a filename. Sharing: see DRIVE_SHARING.
  ATTACHMENT_FOLDER_NAME: 'School Parent Hub - Attachments',

  // How uploaded attachments / inline images are shared. Previously every
  // file was set to "Anyone with the link", which made school memos
  // viewable by anyone who got hold of a link. Options:
  //   'DOMAIN_WITH_LINK' (default) — anyone signed in to the same Google
  //       Workspace domain as the script owner, with the link. Only works
  //       if the owner account is a Workspace (e.g. school) account; on a
  //       personal @gmail.com account Drive rejects it and we fall back to
  //       'PRIVATE' automatically (see applyDriveSharing_).
  //   'PRIVATE' — no new sharing is added; the file inherits whatever
  //       sharing the parent folder has. Easiest way to share with a
  //       specific list of parents: share the FOLDER with them in Drive.
  //   'ANYONE_WITH_LINK' — the old behavior. Only use if you accept that
  //       anyone with a link can open the file.
  // Trade-off: with anything stricter than ANYONE_WITH_LINK, parents who
  // don't have access will see Google's "Request access" page instead of
  // the preview.
  DRIVE_SHARING: 'DOMAIN_WITH_LINK',

  // ---------------- Website feed access ----------------
  // Name of the Script Property holding the shared key the website must
  // send as ?k=... (Project Settings > Script Properties). If the property
  // is missing, the feed is CLOSED (fails safe) until you set it.
  // NOTE: the key is visible in the website's JavaScript, so it only stops
  // casual/bot access to the raw feed — it is not real authentication.
  HUB_KEY_PROPERTY: 'HUB_KEY',

  // Only announcements whose Sender address is on one of these domains
  // (or a subdomain, e.g. "students.ateneo.edu") are returned by the feed.
  // Anything else accidentally labeled "School" in Gmail stays private.
  // Set to [] to disable this filter (not recommended).
  ALLOWED_SENDER_DOMAINS: ['ateneo.edu'],

  // ---------------- TD Companion schedule ----------------
  // ID of the TD Tutoring sign-up Google Sheet — the long string between
  // /d/ and /edit in its URL. Lives ONLY here (server side) so the website
  // never needs public access to the sheet, which contains phone numbers.
  // The script owner's Google account must be able to open this sheet.
  TD_SHEET_ID: '1LTM3jBpo1aedZaiYHtKJmwjEY7KOimqVZ82frZRNTE4',

  // Tab name inside the TD sheet. Leave '' to use the first tab.
  TD_SHEET_TAB: '',

  // Include the Remarks column (e.g. "Moved to Dec 5")? Phone-number-like
  // strings are redacted from it either way (see redactPhoneNumbers_).
  TD_INCLUDE_REMARKS: true,

  // Seconds to cache the TD schedule response (keeps sheet reads low but
  // still shows a new sign-up within a minute).
  TD_CACHE_SECONDS: 60
};

// Script Properties keys used to cache Drive folder IDs so we don't
// search/create them again on every single message.
const INLINE_IMAGE_FOLDER_ID_PROPERTY = 'INLINE_IMAGE_FOLDER_ID';
const ATTACHMENT_FOLDER_ID_PROPERTY = 'ATTACHMENT_FOLDER_ID';

// Column order for the Announcements sheet. Keeping this as a single
// source of truth means both the writer (importEmails) and the reader
// (doGet) stay in sync if columns are ever added/reordered later.
const COLUMNS = [
  'Date',        // 0
  'Subject',     // 1
  'Sender',      // 2
  'Category',    // 3
  'Summary',     // 4
  'BodyText',    // 5
  'BodyHTML',    // 6
  'Attachments', // 7
  'MessageID',   // 8
  'ImportedAt'   // 9
];

// Keyword map used for auto-categorization. Matching is case-insensitive
// and checked against the combined subject + body text of each email.
// Order matters only in that the FIRST category with a keyword hit wins,
// so put more specific categories before more general ones if needed.
//
// To add a brand-new category, just add a key here — no other file needs
// to change. The website (app.js) builds its category filter chips from
// whatever categories actually show up in the data, and auto-assigns any
// category without an explicit entry in CONFIG.CATEGORY_COLORS a
// deterministic fallback color. Add an entry there too if you want to
// pick that new category's color yourself instead of the automatic one.
const CATEGORY_KEYWORDS = {
  Finance: ['tuition', 'payment', 'invoice', 'fee', 'fees', 'balance due', 'billing', 'refund'],
  PTA: ['pta', 'parent teacher association', 'volunteer', 'fundraiser', 'fundraising'],
  Sports: ['sports', 'soccer', 'basketball', 'baseball', 'track and field', 'game schedule', 'tryouts', 'athletics'],
  Events: ['event', 'assembly', 'field trip', 'ceremony', 'concert', 'festival', 'open house', 'celebration'],
  Academics: ['homework', 'exam', 'test', 'grade', 'grades', 'report card', 'curriculum', 'assignment', 'academic'],
  General: [] // fallback — no keywords, used only as CONFIG.DEFAULT_CATEGORY
};

// ============================================================================
// ONE-TIME SETUP
// ============================================================================

/**
 * Run this once manually from the Apps Script editor.
 * - Creates the Announcements sheet with headers (if missing).
 * - Installs the recurring import trigger (if missing).
 * - Triggers the Gmail/Sheets authorization prompt.
 */
function setupProject() {
  getOrCreateSheet_();
  createTriggerIfMissing_();
  Logger.log('Setup complete. Announcements sheet is ready and the 15-minute trigger is installed.');
}

/**
 * Creates the time-driven trigger that runs importEmails() automatically.
 * Safe to call multiple times — it will not create duplicate triggers.
 */
function createTriggerIfMissing_() {
  const triggers = ScriptApp.getProjectTriggers();
  const exists = triggers.some(function (t) {
    return t.getHandlerFunction() === 'importEmails';
  });

  if (!exists) {
    ScriptApp.newTrigger('importEmails')
      .timeBased()
      .everyMinutes(CONFIG.TRIGGER_INTERVAL_MINUTES)
      .create();
    Logger.log('Created time trigger: importEmails every ' + CONFIG.TRIGGER_INTERVAL_MINUTES + ' minutes.');
  } else {
    Logger.log('Time trigger already exists — skipped creation.');
  }
}

// ============================================================================
// SHEET HELPERS
// ============================================================================

/**
 * Returns the Announcements sheet, creating it (with headers) if it
 * doesn't exist yet. Centralizing this means every function that touches
 * the sheet gets the same guarantees about headers being present.
 */
function getOrCreateSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(CONFIG.SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.SHEET_NAME);
    sheet.appendRow(COLUMNS);
    sheet.setFrozenRows(1);
  }

  return sheet;
}

/**
 * Builds a Set of Message IDs already present in the sheet, so we can
 * cheaply skip emails that were imported on a previous run.
 */
function getExistingMessageIds_(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return new Set(); // header row only, nothing imported yet

  const idColumnIndex = COLUMNS.indexOf('MessageID') + 1; // 1-based for Range
  const ids = sheet.getRange(2, idColumnIndex, lastRow - 1, 1).getValues();
  return new Set(ids.map(function (row) { return row[0]; }).filter(String));
}

// ============================================================================
// IMPORT PIPELINE
// ============================================================================

/**
 * Main entry point, called manually or by the 15-minute trigger.
 * Reads Gmail messages under CONFIG.GMAIL_LABEL, skips duplicates,
 * categorizes and summarizes each new message, and appends rows to
 * the Announcements sheet.
 */
function importEmails() {
  const sheet = getOrCreateSheet_();
  const existingIds = getExistingMessageIds_(sheet);

  const label = GmailApp.getUserLabelByName(CONFIG.GMAIL_LABEL);
  if (!label) {
    Logger.log('Gmail label "' + CONFIG.GMAIL_LABEL + '" not found. Create it in Gmail first.');
    return;
  }

  const threads = label.getThreads(0, CONFIG.MAX_THREADS_PER_RUN);
  const rowsToAppend = [];

  threads.forEach(function (thread) {
    thread.getMessages().forEach(function (message) {
      const messageId = message.getId();

      // Skip messages we've already imported.
      if (existingIds.has(messageId)) return;

      const row = buildRowFromMessage_(message);
      rowsToAppend.push(row);

      // Prevent double-import within the same run if a thread has
      // duplicate/looped messages.
      existingIds.add(messageId);
    });
  });

  if (rowsToAppend.length === 0) {
    Logger.log('No new emails to import.');
    return;
  }

  // Bulk-write for efficiency instead of appendRow() in a loop.
  const startRow = sheet.getLastRow() + 1;
  sheet.getRange(startRow, 1, rowsToAppend.length, COLUMNS.length).setValues(rowsToAppend);

  Logger.log('Imported ' + rowsToAppend.length + ' new email(s).');
}

/**
 * Converts a single GmailMessage into a sheet row matching COLUMNS order.
 */
function buildRowFromMessage_(message) {
  const subject = message.getSubject() || '(no subject)';
  const sender = message.getFrom() || '';
  const bodyText = message.getPlainBody() || '';
  const rawBodyHtml = message.getBody() || '';
  const bodyHtml = resolveInlineImages_(rawBodyHtml, message);
  const date = message.getDate();
  const messageId = message.getId();

  // Excludes inline images (e.g. the letterhead logo) — those are now
  // rendered inline via resolveInlineImages_ above, not listed as
  // separate downloadable attachments. Uploads each real attachment to
  // Drive so the website can preview PDFs/images instead of just naming
  // them; stored as a JSON string (see rowToPublicJson_ for the reader).
  const attachments = JSON.stringify(uploadAttachmentsToDrive_(message));

  // Categorize/summarize from the untruncated text, then truncate only
  // what actually gets written to the sheet (cells cap at 50,000 chars).
  const category = categorizeMessage_(subject, bodyText);
  const summary = buildSummary_(bodyText);

  const row = [];
  row[COLUMNS.indexOf('Date')] = date;
  row[COLUMNS.indexOf('Subject')] = subject;
  row[COLUMNS.indexOf('Sender')] = sender;
  row[COLUMNS.indexOf('Category')] = category;
  row[COLUMNS.indexOf('Summary')] = summary;
  row[COLUMNS.indexOf('BodyText')] = truncateForCell_(bodyText);
  row[COLUMNS.indexOf('BodyHTML')] = truncateForCell_(bodyHtml);
  row[COLUMNS.indexOf('Attachments')] = truncateForCell_(attachments);
  row[COLUMNS.indexOf('MessageID')] = messageId;
  row[COLUMNS.indexOf('ImportedAt')] = new Date();

  return row;
}

/**
 * Replaces cid: image references in an HTML email body (which only
 * resolve inside Gmail) with public Drive-hosted URLs, so the website
 * can actually display them (e.g. a letterhead logo).
 *
 * LIMITATION: Apps Script's basic Gmail service doesn't expose each
 * inline image's real Content-ID, so cid: references are matched to
 * inline image blobs positionally (the Nth cid: reference in the HTML
 * gets the Nth inline image found). This is reliable for the common
 * case of a single embedded image (e.g. a logo) and is a limitation of
 * the free/basic Gmail API — full correctness would require enabling
 * the Gmail Advanced Service to read raw MIME headers.
 */
function resolveInlineImages_(bodyHtml, message) {
  if (!bodyHtml || bodyHtml.indexOf('cid:') === -1) return bodyHtml;

  const inlineImages = message.getAttachments({ includeAttachments: false, includeInlineImages: true });
  if (inlineImages.length === 0) return bodyHtml;

  const folder = getOrCreateInlineImageFolder_();
  const cidPattern = /cid:([^"'\s)>]+)/g;
  const cidToUrl = {};
  let imageIndex = 0;
  let match;

  while ((match = cidPattern.exec(bodyHtml)) !== null) {
    const cid = match[1];
    if (cidToUrl[cid]) continue; // already resolved this one

    if (imageIndex >= inlineImages.length) break; // more cid: refs than images found
    const url = uploadInlineImageToDrive_(folder, inlineImages[imageIndex]);
    imageIndex++;

    if (url) cidToUrl[cid] = url;
  }

  let resolvedHtml = bodyHtml;
  Object.keys(cidToUrl).forEach(function (cid) {
    resolvedHtml = resolvedHtml.split('cid:' + cid).join(cidToUrl[cid]);
  });

  return resolvedHtml;
}

/**
 * Uploads one inline image blob to the shared Drive folder and returns
 * a publicly viewable URL, or null if the upload fails for any reason
 * (quota, permissions, etc.) — callers fall back to leaving the cid:
 * reference as-is, which the website's sanitizer safely drops.
 */
function uploadInlineImageToDrive_(folder, imageBlob) {
  try {
    const file = folder.createFile(imageBlob);
    applyDriveSharing_(file);
    return 'https://drive.google.com/thumbnail?id=' + file.getId() + '&sz=w1000';
  } catch (e) {
    Logger.log('Failed to upload inline image to Drive: ' + e.message);
    return null;
  }
}

/**
 * Uploads every real (non-inline) attachment on a message to Drive so
 * the website can preview it, and returns an array of plain objects
 * ready to be JSON-stringified into the sheet:
 *   { name, mimeType, previewUrl, viewUrl }
 * previewUrl is only set for images/PDFs (the two types the website
 * knows how to preview inline) — null for anything else. viewUrl is a
 * regular Drive "open" link and is always set when the upload succeeds.
 * If an individual upload fails, that attachment still gets a { name }
 * entry so the filename is at least visible, matching the old behavior.
 */
function uploadAttachmentsToDrive_(message) {
  const realAttachments = message.getAttachments({ includeInlineImages: false, includeAttachments: true });
  if (realAttachments.length === 0) return [];

  const folder = getOrCreateAttachmentFolder_();

  return realAttachments.map(function (attachmentBlob) {
    const name = attachmentBlob.getName();
    const mimeType = attachmentBlob.getContentType();

    try {
      const file = folder.createFile(attachmentBlob);
      applyDriveSharing_(file);
      const fileId = file.getId();

      const isPreviewable = mimeType === 'application/pdf' || mimeType.indexOf('image/') === 0;
      const previewUrl = isPreviewable
        ? (mimeType === 'application/pdf'
          ? 'https://drive.google.com/file/d/' + fileId + '/preview'
          : 'https://drive.google.com/thumbnail?id=' + fileId + '&sz=w1000')
        : null;

      return {
        name: name,
        mimeType: mimeType,
        previewUrl: previewUrl,
        viewUrl: 'https://drive.google.com/file/d/' + fileId + '/view?usp=sharing'
      };
    } catch (e) {
      Logger.log('Failed to upload attachment "' + name + '" to Drive: ' + e.message);
      return { name: name, mimeType: mimeType, previewUrl: null, viewUrl: null };
    }
  });
}

/**
 * Applies CONFIG.DRIVE_SHARING to a newly uploaded file. Never throws:
 * if the requested mode isn't allowed for this account (e.g.
 * DOMAIN_WITH_LINK on a personal Gmail account), the file is simply left
 * PRIVATE (inheriting the folder's sharing) and a note is logged.
 */
function applyDriveSharing_(file) {
  const mode = CONFIG.DRIVE_SHARING;
  if (mode === 'PRIVATE') return;

  try {
    if (mode === 'ANYONE_WITH_LINK') {
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    } else {
      // Default / 'DOMAIN_WITH_LINK'
      file.setSharing(DriveApp.Access.DOMAIN_WITH_LINK, DriveApp.Permission.VIEW);
    }
  } catch (e) {
    Logger.log('Could not apply sharing "' + mode + '" (left as PRIVATE): ' + e.message);
  }
}

/**
 * OPTIONAL, run manually once from the editor if you want to tighten files
 * that were already uploaded under the old "anyone with the link" rule.
 * Re-applies CONFIG.DRIVE_SHARING (or makes them PRIVATE) for every file
 * in both hub folders. Nothing calls this automatically.
 */
function restrictExistingUploadedFiles() {
  [getOrCreateInlineImageFolder_(), getOrCreateAttachmentFolder_()].forEach(function (folder) {
    const files = folder.getFiles();
    while (files.hasNext()) {
      const file = files.next();
      try {
        file.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.NONE);
      } catch (e) {
        Logger.log('Could not reset sharing on ' + file.getName() + ': ' + e.message);
      }
      applyDriveSharing_(file);
    }
  });
  Logger.log('Re-applied sharing "' + CONFIG.DRIVE_SHARING + '" to existing uploads.');
}

/**
 * Returns the Drive folder used to host inline email images, creating
 * it on first use and caching its ID in Script Properties so we don't
 * search/create it again on every message.
 */
function getOrCreateInlineImageFolder_() {
  return getOrCreateDriveFolder_(CONFIG.INLINE_IMAGE_FOLDER_NAME, INLINE_IMAGE_FOLDER_ID_PROPERTY);
}

/**
 * Returns the Drive folder used to host real file attachments (PDFs,
 * images, etc.), creating it on first use and caching its ID the same
 * way as getOrCreateInlineImageFolder_.
 */
function getOrCreateAttachmentFolder_() {
  return getOrCreateDriveFolder_(CONFIG.ATTACHMENT_FOLDER_NAME, ATTACHMENT_FOLDER_ID_PROPERTY);
}

/**
 * Shared implementation behind the two folder getters above: looks up a
 * cached folder ID in Script Properties, falls back to finding/creating
 * the folder by name, and caches the result for next time.
 */
function getOrCreateDriveFolder_(folderName, propertyKey) {
  const properties = PropertiesService.getScriptProperties();
  const cachedId = properties.getProperty(propertyKey);

  if (cachedId) {
    try {
      return DriveApp.getFolderById(cachedId);
    } catch (e) {
      // Cached folder was deleted/moved — fall through and recreate it.
    }
  }

  const existing = DriveApp.getFoldersByName(folderName);
  const folder = existing.hasNext() ? existing.next() : DriveApp.createFolder(folderName);

  properties.setProperty(propertyKey, folder.getId());
  return folder;
}

/**
 * Truncates text to fit within a single Google Sheets cell
 * (CONFIG.MAX_CELL_LENGTH), appending a marker so it's clear the
 * stored value was cut short.
 */
function truncateForCell_(text) {
  if (!text || text.length <= CONFIG.MAX_CELL_LENGTH) return text;

  const marker = '... [truncated]';
  return text.substring(0, CONFIG.MAX_CELL_LENGTH - marker.length) + marker;
}

/**
 * Picks a category by scanning subject + body for keyword hits.
 * Falls back to CONFIG.DEFAULT_CATEGORY when nothing matches.
 */
function categorizeMessage_(subject, bodyText) {
  const haystack = (subject + ' ' + bodyText).toLowerCase();

  for (const category in CATEGORY_KEYWORDS) {
    const keywords = CATEGORY_KEYWORDS[category];
    for (let i = 0; i < keywords.length; i++) {
      if (haystack.indexOf(keywords[i].toLowerCase()) !== -1) {
        return category;
      }
    }
  }

  return CONFIG.DEFAULT_CATEGORY;
}

/**
 * Builds a short plain-text summary by trimming the body to
 * CONFIG.SUMMARY_LENGTH characters on a word boundary.
 */
function buildSummary_(bodyText) {
  const cleaned = bodyText.replace(/\s+/g, ' ').trim();
  if (cleaned.length <= CONFIG.SUMMARY_LENGTH) return cleaned;

  const truncated = cleaned.substring(0, CONFIG.SUMMARY_LENGTH);
  const lastSpace = truncated.lastIndexOf(' ');
  return truncated.substring(0, lastSpace > 0 ? lastSpace : CONFIG.SUMMARY_LENGTH) + '...';
}

// ============================================================================
// JSON API — public-facing, PRIVACY-SAFE endpoint
// ============================================================================

/**
 * Handles GET requests to the deployed Web App URL.
 *
 *   ?k=KEY            -> announcements array (see below)
 *   ?view=td&k=KEY    -> TD Companion schedule, safe columns only
 *
 * Every request must carry the shared key (Script Property HUB_KEY);
 * otherwise { error: 'unauthorized' } is returned. (Apps Script web apps
 * can't set HTTP status codes, so errors are signalled in the JSON body.)
 *
 * Announcements: returns ONLY the fields safe for display:
 *   date, title, category, summary, body, bodyHtml, attachments
 * Never returns MessageID, Sender, or ImportedAt (internal-only fields),
 * and only rows whose sender is on CONFIG.ALLOWED_SENDER_DOMAINS.
 * Sorted newest-first.
 */
function doGet(e) {
  const params = (e && e.parameter) || {};

  if (!isAuthorized_(params.k)) {
    return jsonOutput_({ error: 'unauthorized' });
  }

  if (params.view === 'td') {
    return jsonOutput_(getTdSchedulePayload_());
  }

  return jsonOutput_(getAnnouncements_());
}

// ============================================================================
// TD COMPANION SIGN-UP (doPost)
// ============================================================================
// The browser POSTs a JSON string with Content-Type text/plain (a "simple"
// request, so no CORS preflight, which Apps Script cannot answer):
//   { action: 'td_signup', k: HUB_KEY, date: 'yyyy-mm-dd', name, mobile }
// Responses: { ok: true, date, name } or { ok: false, error: '...' }.
// The mobile number is NEVER returned and never appears in doGet output
// (readTdSchedule_ only reads Date/Activity/Companion/Remarks columns).

const TD_CACHE_KEY = 'td-schedule-v1';
const TD_SIGNUPS_TAB = 'TD Signups';

function doPost(e) {
  let body;
  try {
    body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return jsonOutput_({ ok: false, error: 'bad_request' });
  }
  if (!body || typeof body !== 'object') return jsonOutput_({ ok: false, error: 'bad_request' });
  if (!isAuthorized_(body.k)) return jsonOutput_({ ok: false, error: 'unauthorized' });
  if (body.action === 'td_signup') return jsonOutput_(handleTdSignup_(body));
  return jsonOutput_({ ok: false, error: 'unknown_action' });
}

function handleTdSignup_(body) {
  const date = String(body.date || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, error: 'invalid_date' };
  const name = sanitizeName_(body.name);
  if (name.length < 2) return { ok: false, error: 'invalid_name' };
  const mobile = normalizePhMobile_(body.mobile);
  if (!mobile) return { ok: false, error: 'invalid_mobile' };

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return { ok: false, error: 'busy' };
  try {
    const ss = SpreadsheetApp.openById(CONFIG.TD_SHEET_ID);
    const sheet = CONFIG.TD_SHEET_TAB ? ss.getSheetByName(CONFIG.TD_SHEET_TAB) : ss.getSheets()[0];
    if (!sheet) return { ok: false, error: 'td_unavailable' };

    const range = sheet.getDataRange();
    const values = range.getValues();
    const display = range.getDisplayValues();
    // Same layout detection as readTdSchedule_.
    const headerIndex = display.findIndex(function (row) {
      return String(row[0]).trim().toLowerCase() === 'date';
    });
    if (headerIndex === -1) return { ok: false, error: 'td_unavailable' };
    const header = display[headerIndex].map(function (h) { return String(h).trim().toLowerCase(); });
    const ci = header.findIndex(function (h) { return /companion/.test(h); });
    const companionCol = ci !== -1 ? ci : 2;
    // Existing contact column, if the sheet has one (header like
    // "Contact #", "Contact No.", "Phone", "Mobile", "Cellphone").
    const contactCol = header.findIndex(function (h) { return /contact|phone|mobile|cell|number|no\./.test(h); });

    const tz = Session.getScriptTimeZone();
    let rowIndex = -1;
    for (let r = headerIndex + 1; r < values.length; r++) {
      const d = toDate_(values[r][0], display[r][0]);
      if (!d) break;
      if (Utilities.formatDate(d, tz, 'yyyy-MM-dd') === date) { rowIndex = r; break; }
    }
    if (rowIndex === -1) return { ok: false, error: 'not_found' };

    // Re-read the live cell (not the cache) so two parents can't both win.
    if (String(display[rowIndex][companionCol]).trim().toUpperCase() !== 'OPEN') {
      return { ok: false, error: 'taken' };
    }

    sheet.getRange(rowIndex + 1, companionCol + 1).setValue(name);
    let wroteContact = false;
    if (contactCol !== -1 && contactCol !== companionCol && contactCol !== 0) {
      sheet.getRange(rowIndex + 1, contactCol + 1).setValue("'" + mobile);
      wroteContact = true;
    }
    // Private log, always (also the only copy of the number when the sheet
    // has no contact column). Keep this tab unshared / owner-only.
    appendTdSignupLog_(ss, date, name, mobile, wroteContact);
    SpreadsheetApp.flush();
    CacheService.getScriptCache().remove(TD_CACHE_KEY);
    return { ok: true, date: date, name: name };
  } catch (err) {
    Logger.log('TD signup failed: ' + err.message);
    return { ok: false, error: 'server_error' };
  } finally {
    lock.releaseLock();
  }
}

function appendTdSignupLog_(ss, date, name, mobile, wroteContact) {
  let log = ss.getSheetByName(TD_SIGNUPS_TAB);
  if (!log) {
    log = ss.insertSheet(TD_SIGNUPS_TAB);
    log.appendRow(['Timestamp', 'Date', 'Name', 'Mobile', 'Mobile also in schedule row']);
    log.setFrozenRows(1);
  }
  log.appendRow([new Date(), date, name, "'" + mobile, wroteContact ? 'yes' : 'no']);
}

/** Trim, collapse whitespace, cap length, block formula injection. */
function sanitizeName_(value) {
  let s = String(value == null ? '' : value)
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  s = s.replace(/^[=+\-@\s]+/, '');
  s = redactPhoneNumbers_(s);
  return s.slice(0, 60).trim();
}

/** Accepts 09XXXXXXXXX or +639XXXXXXXXX (spaces/dashes ok); returns canonical 09XXXXXXXXX or ''. */
function normalizePhMobile_(value) {
  const s = String(value == null ? '' : value).slice(0, 30).replace(/[\s().-]/g, '');
  let m = s.match(/^\+639(\d{9})$/) || s.match(/^639(\d{9})$/) || s.match(/^09(\d{9})$/);
  return m ? '09' + m[1] : '';
}

/** Wraps any value as a JSON ContentService response. */
function jsonOutput_(value) {
  return ContentService
    .createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * True if the supplied key matches Script Property HUB_KEY. If the
 * property hasn't been set yet, everything is refused (fail closed).
 */
function isAuthorized_(suppliedKey) {
  const expected = PropertiesService.getScriptProperties().getProperty(CONFIG.HUB_KEY_PROPERTY);
  if (!expected) return false;
  return typeof suppliedKey === 'string' && suppliedKey === expected;
}

/** Reads the Announcements sheet and returns the public, filtered list. */
function getAnnouncements_() {
  const sheet = getOrCreateSheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  const senderIndex = COLUMNS.indexOf('Sender');
  const data = sheet.getRange(2, 1, lastRow - 1, COLUMNS.length).getValues();

  const announcements = data
    .filter(function (row) { return isAllowedSender_(row[senderIndex]); })
    .map(rowToPublicJson_);

  // Newest first, by date column.
  announcements.sort(function (a, b) {
    return new Date(b.date) - new Date(a.date);
  });

  return announcements;
}

/**
 * True if a Gmail "From" value (e.g. 'Ms. Cruz <cruz@ateneo.edu>') is on
 * one of CONFIG.ALLOWED_SENDER_DOMAINS, exact domain or any subdomain.
 */
function isAllowedSender_(fromValue) {
  const domains = CONFIG.ALLOWED_SENDER_DOMAINS || [];
  if (domains.length === 0) return true; // filter disabled

  const text = String(fromValue || '').toLowerCase();
  const bracketed = text.match(/<([^>]+)>/);
  const address = (bracketed ? bracketed[1] : text).trim();
  const at = address.lastIndexOf('@');
  if (at === -1) return false;
  const domain = address.substring(at + 1);

  return domains.some(function (allowed) {
    allowed = String(allowed).toLowerCase();
    return domain === allowed || domain.slice(-(allowed.length + 1)) === '.' + allowed;
  });
}

// ============================================================================
// TD COMPANION SCHEDULE — server-side read of the sign-up sheet
// ============================================================================

/**
 * Returns { updatedAt, entries: [{ date, dateLabel, activity, companion,
 * remarks }] } built from the TD sign-up sheet. ONLY these columns are
 * ever read into the response — contact numbers and any other columns in
 * the sheet never leave Google's servers. Cached for CONFIG.TD_CACHE_SECONDS.
 */
function getTdSchedulePayload_() {
  const cache = CacheService.getScriptCache();
  const cacheKey = TD_CACHE_KEY;
  const cached = cache.get(cacheKey);
  if (cached) return JSON.parse(cached);

  let payload;
  try {
    payload = { updatedAt: new Date().toISOString(), entries: readTdSchedule_() };
  } catch (err) {
    Logger.log('TD schedule read failed: ' + err.message);
    return { error: 'td_unavailable' }; // not cached, so the next request retries
  }

  const json = JSON.stringify(payload);
  if (json.length < 90000) cache.put(cacheKey, json, CONFIG.TD_CACHE_SECONDS);
  return payload;
}

/**
 * The sheet has decorative title rows before the real header and footer
 * notes after the data — not a clean table. This finds the header row by
 * content (first cell === "Date"), locates the Activity / Companion /
 * Remarks columns by header text (falling back to the historical column
 * positions B, C, F), and reads data rows until the first cell stops
 * looking like a date.
 */
function readTdSchedule_() {
  if (!CONFIG.TD_SHEET_ID) throw new Error('CONFIG.TD_SHEET_ID is not set.');

  const ss = SpreadsheetApp.openById(CONFIG.TD_SHEET_ID);
  const sheet = CONFIG.TD_SHEET_TAB ? ss.getSheetByName(CONFIG.TD_SHEET_TAB) : ss.getSheets()[0];
  if (!sheet) throw new Error('TD sheet tab not found: ' + CONFIG.TD_SHEET_TAB);

  const range = sheet.getDataRange();
  const values = range.getValues();          // real Date objects where cells are dates
  const display = range.getDisplayValues();  // what a person sees in each cell

  const headerIndex = display.findIndex(function (row) {
    return String(row[0]).trim().toLowerCase() === 'date';
  });
  if (headerIndex === -1) throw new Error('Could not find the "Date" header row.');

  const header = display[headerIndex].map(function (h) { return String(h).trim().toLowerCase(); });
  const findCol = function (pattern, fallback) {
    const i = header.findIndex(function (h) { return pattern.test(h); });
    return i !== -1 ? i : fallback;
  };
  const activityCol = findCol(/activity/, 1);
  const companionCol = findCol(/companion/, 2);
  const remarksCol = findCol(/remark/, 5);

  const entries = [];
  for (let r = headerIndex + 1; r < values.length; r++) {
    const date = toDate_(values[r][0], display[r][0]);
    if (!date) break; // reached the footer notes

    entries.push({
      date: Utilities.formatDate(date, Session.getScriptTimeZone(), 'yyyy-MM-dd'),
      dateLabel: String(display[r][0]).trim(),
      activity: redactPhoneNumbers_(display[r][activityCol]),
      companion: redactPhoneNumbers_(display[r][companionCol]),
      remarks: CONFIG.TD_INCLUDE_REMARKS ? redactPhoneNumbers_(display[r][remarksCol]) : ''
    });
  }
  return entries;
}

/** Returns a Date for a real date cell or a text cell like "September 8, 2026", else null. */
function toDate_(rawValue, displayValue) {
  if (rawValue instanceof Date && !isNaN(rawValue.getTime())) return rawValue;
  const text = String(displayValue || '').trim();
  if (!/^[A-Za-z]+\.?\s+\d{1,2},\s*\d{4}$/.test(text)) return null;
  const parsed = new Date(text.replace('.', ''));
  return isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Defense in depth: blanks out anything that looks like a phone number
 * (7+ digits, allowing spaces/dashes/dots/parentheses and a leading +),
 * in case someone types a number into a "safe" column.
 */
function redactPhoneNumbers_(value) {
  const text = value == null ? '' : String(value).trim();
  return text.replace(/\+?\(?\d[\d\s().-]{5,}\d/g, function (match) {
    return match.replace(/\D/g, '').length >= 7 ? '[number hidden]' : match;
  });
}

/**
 * Maps one raw sheet row to the public JSON shape, deliberately
 * excluding any field not meant for public consumption.
 */
function rowToPublicJson_(row) {
  const get = function (columnName) { return row[COLUMNS.indexOf(columnName)]; };

  const attachments = parseAttachmentsCell_(get('Attachments'));

  return {
    date: get('Date') instanceof Date ? get('Date').toISOString() : get('Date'),
    title: get('Subject'),
    category: get('Category'),
    summary: get('Summary'),
    body: get('BodyText'),
    bodyHtml: get('BodyHTML'),
    attachments: attachments
    // Intentionally omitted: MessageID, Sender, ImportedAt
  };
}

/**
 * Parses the Attachments cell into an array of
 * { name, mimeType, previewUrl, viewUrl } objects.
 *
 * Handles two formats for backward compatibility: rows imported after
 * this feature shipped store a JSON array with full preview metadata;
 * rows imported before it store a plain comma-separated list of
 * filenames (the old format). Old rows still show up correctly as
 * filenames, just without a preview — re-import (delete the row and
 * let the next scheduled run re-pull it) to get previews for those too.
 */
function parseAttachmentsCell_(rawValue) {
  if (!rawValue) return [];

  try {
    const parsed = JSON.parse(rawValue);
    if (Array.isArray(parsed)) return parsed;
  } catch (e) {
    // Not JSON — fall through to the legacy plain-text format below.
  }

  return String(rawValue)
    .split(',')
    .map(function (name) { return name.trim(); })
    .filter(String)
    .map(function (name) { return { name: name, mimeType: null, previewUrl: null, viewUrl: null }; });
}
