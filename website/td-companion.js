/**
 * ============================================================================
 * TD COMPANION SCHEDULE — Front-end logic
 * ============================================================================
 * Loads the TD Tutoring schedule from the hub's Apps Script endpoint
 * (?view=td) and renders it as a single chronological list. OPEN rows get a
 * colored border and their own inline "Sign up" link.
 *
 * PRIVACY: the browser no longer reads the Google Sheet directly. The old
 * version fetched the whole public sheet (gviz feed), which also delivered
 * the Contact # column to every visitor. Now Apps Script reads the sheet
 * server-side and returns ONLY date, activity, companion name/status and
 * remarks (with phone-like numbers redacted). The sheet ID lives only in
 * apps-script/Code.gs (CONFIG.TD_SHEET_ID).
 *
 * LOCAL PREVIEW: add ?mock=1 to the URL to load mock/td.json instead of
 * the live endpoint (fictional data, for layout checks only).
 * ============================================================================
 */

const CONFIG = {
  // Same Apps Script Web App /exec URL as API_URL in app.js.
  API_URL: 'https://script.google.com/macros/s/AKfycbzUgDesUEX7Ib1RHecz6kmwzpUgBt5aSxcj50su6c5K1tKph-1xfNzcYMw-5JANGom2/exec',

  // Must match Script Property HUB_KEY in Apps Script (same value as in
  // app.js). Visible to anyone who views source — it's a speed bump
  // against casual scraping, not a password.
  HUB_KEY: 'OF1tf7KPCaMWpBie2c9Ynf5j',

  // TODO(Nomerson): create a Google Form for TD companion sign-ups and paste
  // its share link here (Form > Send > link icon), e.g.
  // 'https://forms.gle/XXXXXXXXXXXX'. While this is the placeholder, the
  // sign-up buttons are hidden and a "coming soon" note is shown instead.
  // Do NOT put the sheet's edit link back here — it exposes phone numbers.
  SIGNUP_FORM_URL: 'REPLACE_WITH_GOOGLE_FORM_URL',

  MOCK_URL: 'mock/td.json',

  // Generous on purpose: a phone on a weak mobile signal can take a while.
  FETCH_TIMEOUT_MS: 20000
};

const USE_MOCK = new URLSearchParams(window.location.search).get('mock') === '1';

const dom = {
  loading: document.getElementById('td-loading'),
  error: document.getElementById('td-error'),
  retry: document.getElementById('td-retry'),
  signupBtn: document.getElementById('td-signup-btn'),
  signupPending: document.getElementById('td-signup-pending'),
  mockBanner: document.getElementById('mock-banner'),
  scheduleSection: document.getElementById('td-schedule-section'),
  scheduleList: document.getElementById('td-schedule-list')
};

// ============================================================================
// API
// ============================================================================
const Api = {
  signupConfigured() {
    return /^https:\/\//.test(CONFIG.SIGNUP_FORM_URL);
  },

  async fetchSchedule() {
    const url = USE_MOCK
      ? CONFIG.MOCK_URL
      : CONFIG.API_URL + '?view=td&k=' + encodeURIComponent(CONFIG.HUB_KEY);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CONFIG.FETCH_TIMEOUT_MS);
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      const payload = await response.json();
      if (!payload || payload.error || !Array.isArray(payload.entries)) {
        throw new Error('Schedule unavailable: ' + ((payload && payload.error) || 'bad response'));
      }
      return payload.entries;
    } finally {
      clearTimeout(timer);
    }
  }
};

// ============================================================================
// PARSING — normalizes API entries
// ============================================================================
const Schedule = {
  /** Entries arrive as { date: 'yyyy-mm-dd', dateLabel, activity, companion, remarks }. */
  normalize(entries) {
    return entries
      .map((e) => {
        const companion = String(e.companion || '').trim();
        const date = new Date(String(e.date) + 'T00:00:00');
        return {
          date,
          activity: String(e.activity || ''),
          companion,
          remarks: String(e.remarks || ''),
          status: Schedule.statusFor(companion)
        };
      })
      .filter((e) => !isNaN(e.date.getTime()));
  },

  // Companion-cell values that describe the SESSION, not a person. These
  // must never render as a green "companion" badge.
  NOTE_PATTERN: /^(RE-?\s?SCHEDULED|CANCELL?ED|POSTPONED|MOVED|NO SESSION|NO CLASS|SUSPENDED|N\/?A)\b/i,

  /** Classifies a row by its companion cell. */
  statusFor(companion) {
    const normalized = companion.trim().toUpperCase();
    if (!normalized) return 'note'; // nothing listed — remarks explain it
    if (normalized === 'OPEN') return 'open';
    if (normalized === 'TBC' || normalized === 'TO BE CONFIRMED') return 'tbc';
    if (Schedule.NOTE_PATTERN.test(normalized)) return 'note';
    return 'filled';
  },

  /** True if the given date is strictly before today (start of day). */
  isPast(date) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return date < today;
  }
};

// ============================================================================
// RENDER
// ============================================================================
const Render = {
  formatDate(date) {
    return date.toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
  },

  escapeHtml(value) {
    const div = document.createElement('div');
    div.textContent = value == null ? '' : String(value);
    return div.innerHTML;
  },

  /** "RE-SCHEDULED" -> "Rescheduled", "CANCELLED" -> "Cancelled". */
  noteLabel(companion) {
    const t = companion.trim().toLowerCase().replace(/-/g, '');
    return t ? t.charAt(0).toUpperCase() + t.slice(1) : '';
  },

  signupCta() {
    if (Api.signupConfigured()) {
      dom.signupBtn.href = CONFIG.SIGNUP_FORM_URL;
      dom.signupBtn.hidden = false;
      dom.signupPending.hidden = true;
    } else {
      dom.signupBtn.hidden = true;
      dom.signupPending.hidden = false;
    }
  },

  /** Short parts for the visual day/month block (the full date stays in
      .td-schedule-date, visually hidden, for screen readers). */
  dateParts(date) {
    return {
      month: date.toLocaleDateString(undefined, { month: 'short' }),
      day: date.getDate(),
      weekday: date.toLocaleDateString(undefined, { weekday: 'short' })
    };
  },

  fullSchedule(entries) {
    dom.scheduleSection.hidden = false;
    dom.scheduleList.innerHTML = entries.map((e, i) => {
      const passed = Schedule.isPast(e.date);
      const isOpenUpcoming = e.status === 'open' && !passed;
      // Presentation only: the first row of each calendar year carries a
      // year label so a list spanning 2026 to 2027 stays unambiguous.
      const year = e.date.getFullYear();
      const startsYear = i === 0 || entries[i - 1].date.getFullYear() !== year;
      const itemClass = 'td-schedule-item' +
        (passed ? ' is-passed' : '') +
        (isOpenUpcoming ? ' is-open' : '') +
        (e.status === 'note' ? ' is-note' : '') +
        (startsYear ? ' td-year-start' : '');
      const parts = Render.dateParts(e.date);

      return `
        <li class="${itemClass}"${startsYear ? ` data-year="${year}"` : ''}>
          <span class="date-block" aria-hidden="true"><span class="date-block-month">${Render.escapeHtml(parts.month)}</span><span class="date-block-day">${parts.day}</span><span class="date-block-dow">${Render.escapeHtml(parts.weekday)}</span></span>
          <div class="td-schedule-main">
            <span class="td-schedule-date visually-hidden">${Render.formatDate(e.date)}</span>
            <span class="td-schedule-activity">${Render.escapeHtml(e.activity)}</span>
            ${e.remarks ? `<p class="td-schedule-remarks">${Render.escapeHtml(e.remarks)}</p>` : ''}
          </div>
          <div class="td-schedule-status">${Render.statusBadge(e)}</div>
        </li>
      `;
    }).join('');
  },

  statusBadge(entry) {
    if (entry.status === 'filled') {
      return `<span class="td-badge td-badge--filled">${Render.escapeHtml(entry.companion)}</span>`;
    }
    if (entry.status === 'open') {
      const signupLink = !Schedule.isPast(entry.date) && Api.signupConfigured()
        ? `<a class="td-open-signup" href="${Render.escapeHtml(CONFIG.SIGNUP_FORM_URL)}" target="_blank" rel="noopener noreferrer">Sign up →</a>`
        : '';
      return `<span class="td-badge td-badge--open">OPEN</span>${signupLink}`;
    }
    if (entry.status === 'tbc') {
      return '<span class="td-badge td-badge--tbc">To be confirmed</span>';
    }
    // 'note': rescheduled / cancelled / blank — neutral, never a green badge.
    const label = Render.noteLabel(entry.companion);
    return label ? `<span class="td-badge td-badge--note">${Render.escapeHtml(label)}</span>` : '';
  },

  showLoading() {
    dom.loading.hidden = false;
    dom.error.hidden = true;
  },

  hideLoading() {
    dom.loading.hidden = true;
  },

  showError() {
    dom.error.hidden = false;
    dom.loading.hidden = true;
    dom.scheduleSection.hidden = true;
  }
};

// ============================================================================
// INIT
// ============================================================================
async function init() {
  Render.signupCta();
  if (USE_MOCK && dom.mockBanner) dom.mockBanner.hidden = false;
  Render.showLoading();

  try {
    const entries = Schedule.normalize(await Api.fetchSchedule());
    Render.hideLoading();
    Render.fullSchedule(entries);
  } catch (error) {
    // warn (not error): an unavailable feed is an expected, handled state.
    console.warn('TD schedule unavailable:', error.message);
    Render.showError();
  }
}

dom.retry.addEventListener('click', init);
document.addEventListener('DOMContentLoaded', init);
