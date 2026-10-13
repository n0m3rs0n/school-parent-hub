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
  API_URL: 'https://script.google.com/macros/s/AKfycbyLZKbqBHHC_NCp8X68_oyUFb6gudXUk_uzRU5xoQH5ecq4A3lGiHaZHi2-HQS6-mtY/exec',

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

  /** POSTs a sign-up. text/plain body = no CORS preflight (Apps Script can't answer one). */
  async signup(date, name, mobile) {
    if (USE_MOCK) {
      await new Promise((r) => setTimeout(r, 600));
      if (/^taken\b/i.test(name)) return { ok: false, error: 'taken' }; // mock test hook
      return { ok: true, date, name };
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CONFIG.FETCH_TIMEOUT_MS);
    try {
      const response = await fetch(CONFIG.API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'td_signup', k: CONFIG.HUB_KEY, date, name, mobile }),
        redirect: 'follow',
        signal: controller.signal
      });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return await response.json();
    } finally {
      clearTimeout(timer);
    }
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

  /** Home-visit rows (e.g. "(Saturday) Home Visit") get their own label. */
  isHomeVisit(entry) {
    return /home\s*visit/i.test(entry.activity);
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

  isoDate(date) {
    const p = (n) => String(n).padStart(2, '0');
    return date.getFullYear() + '-' + p(date.getMonth() + 1) + '-' + p(date.getDate());
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
    // In-page sign-up replaced the external form: always show the hint.
    if (dom.signupBtn) dom.signupBtn.hidden = true;
    if (dom.signupPending) dom.signupPending.hidden = false;
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
      // Home visits are not Tuesday school sessions: label them clearly and
      // warn that the standard assembly time/place may not apply. Details
      // (8:00 AM–12:00 NN, up to 5 parents) confirmed by Nomerson for Dec 5.
      // No meeting place was given, so none is shown.
      const homeVisit = Schedule.isHomeVisit(e);
      const itemClass = 'td-schedule-item' +
        (passed ? ' is-passed' : '') +
        (isOpenUpcoming ? ' is-open' : '') +
        (e.status === 'note' ? ' is-note' : '') +
        (homeVisit ? ' is-home-visit' : '') +
        (startsYear ? ' td-year-start' : '');
      const parts = Render.dateParts(e.date);

      return `
        <li class="${itemClass}"${startsYear ? ` data-year="${year}"` : ''}>
          <span class="date-block" aria-hidden="true"><span class="date-block-month">${Render.escapeHtml(parts.month)}</span><span class="date-block-day">${parts.day}</span><span class="date-block-dow">${Render.escapeHtml(parts.weekday)}</span></span>
          <div class="td-schedule-main">
            <span class="td-schedule-date visually-hidden">${Render.formatDate(e.date)}</span>
            ${homeVisit ? '<span class="td-tag td-tag--home">Home visit</span>' : ''}
            <span class="td-schedule-activity">${Render.escapeHtml(e.activity)}</span>
            ${homeVisit && e.status !== 'note' ? '<p class="td-schedule-remarks td-home-note">Not a regular Tuesday session: runs 8:00 AM–12:00 NN, and up to 5 parents can join. The Tuesday assembly details above don’t apply; meeting place to be confirmed.</p>' : ''}
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
      const signupLink = !Schedule.isPast(entry.date)
        ? `<button type="button" class="td-open-signup" data-date="${Render.isoDate(entry.date)}" aria-label="Sign up as companion for ${Render.escapeHtml(Render.formatDate(entry.date))}">Sign up</button>`
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
// SIGN-UP DIALOG
// ============================================================================
const Signup = {
  el: null,
  date: null,
  opener: null,
  busy: false,

  MOBILE_RE: /^(?:09\d{9}|\+639\d{9})$/,

  build() {
    const d = document.createElement('dialog');
    d.className = 'signup-dialog';
    d.setAttribute('aria-labelledby', 'signup-title');
    d.innerHTML = `
      <form class="signup-form" novalidate>
        <div class="signup-head">
          <p class="eyebrow">Volunteer as companion</p>
          <h2 id="signup-title" class="signup-title">Sign up</h2>
          <p class="signup-when" id="signup-when"></p>
          <button type="button" class="signup-close" aria-label="Close">
            <svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6L6 18"/></svg>
          </button>
        </div>
        <div class="signup-fields">
          <div class="signup-field">
            <label for="signup-name">Parent name <span class="req" aria-hidden="true">*</span></label>
            <input id="signup-name" name="name" type="text" autocomplete="name" maxlength="60" required aria-describedby="signup-name-err" />
            <p class="signup-err" id="signup-name-err" aria-live="polite"></p>
          </div>
          <div class="signup-field">
            <label for="signup-mobile">Mobile number <span class="req" aria-hidden="true">*</span></label>
            <input id="signup-mobile" name="mobile" type="tel" inputmode="tel" autocomplete="tel" maxlength="20" placeholder="09XXXXXXXXX" required aria-describedby="signup-mobile-hint signup-mobile-err" />
            <p class="signup-hint" id="signup-mobile-hint">Format 09XXXXXXXXX or +639XXXXXXXXX.</p>
            <p class="signup-err" id="signup-mobile-err" aria-live="polite"></p>
          </div>
          <p class="signup-consent">Your number is only visible to the Class Parent Reps.</p>
          <p class="signup-status" role="alert"></p>
        </div>
        <div class="signup-actions">
          <button type="button" class="signup-cancel">Cancel</button>
          <button type="submit" class="signup-submit">Sign up</button>
        </div>
      </form>
      <div class="signup-done" hidden>
        <h2 class="signup-title" tabindex="-1">Thank you!</h2>
        <p class="signup-done-text"></p>
        <div class="signup-actions"><button type="button" class="signup-submit signup-done-close">Done</button></div>
      </div>`;
    document.body.appendChild(d);
    this.el = d;
    this.form = d.querySelector('form');
    this.name = d.querySelector('#signup-name');
    this.mobile = d.querySelector('#signup-mobile');
    this.status = d.querySelector('.signup-status');
    this.submitBtn = d.querySelector('.signup-submit');
    this.done = d.querySelector('.signup-done');
    this.form.addEventListener('submit', (ev) => { ev.preventDefault(); this.submit(); });
    d.querySelector('.signup-close').addEventListener('click', () => this.close());
    d.querySelector('.signup-cancel').addEventListener('click', () => this.close());
    d.querySelector('.signup-done-close').addEventListener('click', () => this.close());
    d.addEventListener('click', (ev) => { if (ev.target === d) this.close(); }); // backdrop
    d.addEventListener('cancel', (ev) => { if (this.busy) ev.preventDefault(); });
    d.addEventListener('close', () => {
      // Return focus to the opener; if the row was re-rendered, to the list heading.
      if (this.opener && document.contains(this.opener)) { this.opener.focus(); return; }
      const h = document.querySelector('.td-section-title');
      if (h) { h.setAttribute('tabindex', '-1'); h.focus(); }
    });
  },

  open(date, opener) {
    if (!this.el) this.build();
    this.date = date;
    this.opener = opener;
    this.form.hidden = false;
    this.done.hidden = true;
    this.form.reset();
    this.setError('name', '');
    this.setError('mobile', '');
    this.status.textContent = '';
    this.setBusy(false);
    const dt = new Date(date + 'T00:00:00');
    this.el.querySelector('#signup-when').textContent = Render.formatDate(dt);
    this.el.showModal();
    this.name.focus();
  },

  close() {
    if (this.busy) return;
    if (this.el && this.el.open) this.el.close();
  },

  setError(field, msg) {
    const input = field === 'name' ? this.name : this.mobile;
    this.el.querySelector('#signup-' + field + '-err').textContent = msg;
    input.setAttribute('aria-invalid', msg ? 'true' : 'false');
  },

  setBusy(b) {
    this.busy = b;
    this.submitBtn.disabled = b;
    this.submitBtn.textContent = b ? 'Signing up…' : 'Sign up';
  },

  validate() {
    const name = this.name.value.replace(/\s+/g, ' ').trim();
    const mobile = this.mobile.value.replace(/[\s().-]/g, '');
    let ok = true;
    if (name.length < 2) { this.setError('name', 'Please enter your name.'); ok = false; }
    else if (/^[=+\-@]/.test(name)) { this.setError('name', 'Name can’t start with = + - or @.'); ok = false; }
    else this.setError('name', '');
    if (!mobile) { this.setError('mobile', 'Please enter your mobile number.'); ok = false; }
    else if (!this.MOBILE_RE.test(mobile)) { this.setError('mobile', 'Use 09XXXXXXXXX or +639XXXXXXXXX.'); ok = false; }
    else this.setError('mobile', '');
    if (!ok) (this.name.getAttribute('aria-invalid') === 'true' ? this.name : this.mobile).focus();
    return ok ? { name, mobile } : null;
  },

  async submit() {
    if (this.busy) return;
    this.status.textContent = '';
    const v = this.validate();
    if (!v) return;
    this.setBusy(true);
    let res;
    try {
      res = await Api.signup(this.date, v.name, v.mobile);
    } catch (err) {
      console.warn('Sign-up failed:', err.message);
      res = { ok: false, error: 'network' };
    }
    this.setBusy(false);
    if (res && res.ok) {
      Signup.markFilled(this.date, res.name || v.name);
      this.form.hidden = true;
      this.done.hidden = false;
      this.done.querySelector('.signup-done-text').textContent =
        `You’re signed up as companion for ${Render.formatDate(new Date(this.date + 'T00:00:00'))}. The Class Parent Reps will reach out if needed.`;
      this.done.querySelector('.signup-title').focus();
      return;
    }
    const err = res && res.error;
    if (err === 'taken') {
      this.status.textContent = 'Sorry, someone just signed up for this date. The list has been refreshed; please pick another OPEN date.';
      refreshSchedule();
    } else if (err === 'invalid_mobile') {
      this.setError('mobile', 'Use 09XXXXXXXXX or +639XXXXXXXXX.');
    } else if (err === 'invalid_name') {
      this.setError('name', 'Please enter your name.');
    } else if (err === 'busy') {
      this.status.textContent = 'The sheet is busy right now. Please try again in a few seconds.';
    } else {
      this.status.textContent = 'Couldn’t send your sign-up. Check your connection and try again, or message the class Viber group.';
    }
  },

  /** Updates the row in place: navy check badge with the name, no button. */
  markFilled(date, name) {
    const btn = dom.scheduleList.querySelector(`.td-open-signup[data-date="${date}"]`);
    if (!btn) return;
    const li = btn.closest('.td-schedule-item');
    li.classList.remove('is-open');
    li.querySelector('.td-schedule-status').innerHTML =
      `<span class="td-badge td-badge--filled">${Render.escapeHtml(name)}</span>`;
  }
};

dom.scheduleList.addEventListener('click', (ev) => {
  const btn = ev.target.closest('.td-open-signup');
  if (btn) Signup.open(btn.dataset.date, btn);
});

async function refreshSchedule() {
  try {
    Render.fullSchedule(Schedule.normalize(await Api.fetchSchedule()));
  } catch (error) {
    console.warn('TD schedule refresh failed:', error.message);
  }
}

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
