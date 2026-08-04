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
 * 4. Writes the message data into the "Announcements" Google Sheet.
 * 5. Exposes a doGet() JSON API that the public website reads from.
 * 6. Installs a time-driven trigger that repeats this process every 15 minutes.
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
 *      (this also triggers the Gmail authorization prompt)
 *   5. Deploy > New deployment > Web app to get the JSON API URL.
 *
 * FUTURE PHASES (NOT IMPLEMENTED YET — see README "Roadmap")
 * ------------------------------------------------------------------
 * Phase 2: Drive attachment uploads, PDF/image preview, dark mode,
 *          pagination, monthly archive, print/share, rich text, advanced search.
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
  MAX_CELL_LENGTH: 49000
};

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
  const bodyHtml = message.getBody() || '';
  const date = message.getDate();
  const messageId = message.getId();
  const attachmentNames = message.getAttachments().map(function (a) { return a.getName(); }).join(', ');

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
  row[COLUMNS.indexOf('Attachments')] = attachmentNames;
  row[COLUMNS.indexOf('MessageID')] = messageId;
  row[COLUMNS.indexOf('ImportedAt')] = new Date();

  return row;
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
 * Returns ONLY the fields safe for public display:
 *   date, title, category, summary, body, attachments
 * Never returns MessageID, Sender, or ImportedAt (internal-only fields).
 *
 * Response is sorted newest-first.
 */
function doGet(e) {
  const sheet = getOrCreateSheet_();
  const lastRow = sheet.getLastRow();

  let announcements = [];

  if (lastRow >= 2) {
    const data = sheet.getRange(2, 1, lastRow - 1, COLUMNS.length).getValues();
    announcements = data.map(rowToPublicJson_);

    // Newest first, by date column.
    announcements.sort(function (a, b) {
      return new Date(b.date) - new Date(a.date);
    });
  }

  return ContentService
    .createTextOutput(JSON.stringify(announcements))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Maps one raw sheet row to the public JSON shape, deliberately
 * excluding any field not meant for public consumption.
 */
function rowToPublicJson_(row) {
  const get = function (columnName) { return row[COLUMNS.indexOf(columnName)]; };

  const attachmentsRaw = get('Attachments');
  const attachments = attachmentsRaw
    ? String(attachmentsRaw).split(',').map(function (s) { return s.trim(); }).filter(String)
    : [];

  return {
    date: get('Date') instanceof Date ? get('Date').toISOString() : get('Date'),
    title: get('Subject'),
    category: get('Category'),
    summary: get('Summary'),
    body: get('BodyText'),
    attachments: attachments
    // Intentionally omitted: MessageID, Sender, ImportedAt, BodyHTML
  };
}
