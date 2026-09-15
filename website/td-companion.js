/**
 * ============================================================================
 * TD COMPANION SCHEDULE — Front-end logic
 * ============================================================================
 * Reads the TD Tutoring sign-up sheet LIVE (via Google's public gviz JSON
 * feed) and renders it as a schedule with a highlighted "needs a companion"
 * section. Unlike resources.html/important-dates.html, this page is
 * intentionally NOT a static snapshot: it's a sign-up tracker, so showing
 * stale "OPEN" slots after someone has already signed up would be actively
 * misleading. There's no backend involved — Google Sheets' own gviz
 * endpoint is fetched directly from the browser.
 *
 * WHY JSONP INSTEAD OF fetch(): the gviz endpoint doesn't send an
 * Access-Control-Allow-Origin header, so a same-origin-policy fetch() call
 * would be blocked by the browser. Loading it as a <script> tag sidesteps
 * that (script loads aren't subject to CORS), which is exactly why Google
 * formats the response as a JS function call rather than plain JSON —
 * it's designed to be used this way. Passing tqx=responseHandler:NAME
 * makes it call our own callback instead of the default one.
 * ============================================================================
 */

const CONFIG = {
  SHEET_ID: '1LTM3jBpo1aedZaiYHtKJmwjEY7KOimqVZ82frZRNTE4',
  SIGNUP_URL: 'https://docs.google.com/spreadsheets/d/1LTM3jBpo1aedZaiYHtKJmwjEY7KOimqVZ82frZRNTE4/edit?usp=sharing',
  JSONP_TIMEOUT_MS: 10000
};

const dom = {
  loading: document.getElementById('td-loading'),
  error: document.getElementById('td-error'),
  openSection: document.getElementById('td-open-section'),
  openList: document.getElementById('td-open-list'),
  scheduleSection: document.getElementById('td-schedule-section'),
  scheduleList: document.getElementById('td-schedule-list')
};

// ============================================================================
// JSONP LOADER
// ============================================================================
const Jsonp = {
  /** Loads a gviz URL via a <script> tag and resolves with the parsed payload. */
  load(sheetId) {
    return new Promise((resolve, reject) => {
      const callbackName = 'tdCompanionCallback_' + Date.now();
      const script = document.createElement('script');
      let settled = false;

      const cleanup = () => {
        delete window[callbackName];
        script.remove();
        clearTimeout(timer);
      };

      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(new Error('Timed out waiting for the sheet to load.'));
      }, CONFIG.JSONP_TIMEOUT_MS);

      window[callbackName] = (payload) => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(payload);
      };

      script.onerror = () => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(new Error('Failed to load the sheet.'));
      };

      const url = 'https://docs.google.com/spreadsheets/d/' + sheetId +
        '/gviz/tq?tqx=responseHandler:' + callbackName;
      script.src = url;
      document.head.appendChild(script);
    });
  }
};

// ============================================================================
// PARSING — turns the raw gviz table into a clean list of schedule entries
// ============================================================================
const Schedule = {
  DATE_PATTERN: /^[A-Za-z]+\s+\d{1,2},\s*\d{4}$/,

  /**
   * The sheet has decorative title rows before the real header and
   * footer notes after the data — not a clean table. Rather than assume
   * fixed row numbers (fragile if someone inserts a row), this finds the
   * header row by content (first cell === "Date") and then reads data
   * rows until a row's first cell stops looking like a date.
   */
  parse(gvizResponse) {
    const rows = gvizResponse.table.rows;
    const cellAt = (row, i) => (row.c[i] && row.c[i].v != null) ? String(row.c[i].v).trim() : '';

    const headerIndex = rows.findIndex((row) => cellAt(row, 0) === 'Date');
    if (headerIndex === -1) {
      throw new Error('Could not find the header row in the sheet.');
    }

    const entries = [];
    for (let i = headerIndex + 1; i < rows.length; i++) {
      const dateLabel = cellAt(rows[i], 0);
      if (!Schedule.DATE_PATTERN.test(dateLabel)) break; // reached the footer notes

      const activity = cellAt(rows[i], 1);
      const companion = cellAt(rows[i], 2);
      const remarks = cellAt(rows[i], 5);

      entries.push({
        date: new Date(dateLabel),
        dateLabel,
        activity,
        companion,
        remarks,
        status: Schedule.statusFor(companion)
      });
    }

    return entries;
  },

  /** Classifies a row by its companion cell. */
  statusFor(companion) {
    const normalized = companion.toUpperCase();
    if (normalized === 'OPEN') return 'open';
    if (normalized === 'TBC') return 'tbc';
    if (companion) return 'filled';
    return 'note'; // no companion listed — usually a rescheduled/cancelled row explained in remarks
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

  /** The "needs a companion" callout — only upcoming OPEN dates. */
  openDates(entries) {
    const openUpcoming = entries.filter((e) => e.status === 'open' && !Schedule.isPast(e.date));

    if (openUpcoming.length === 0) {
      dom.openSection.hidden = true;
      return;
    }

    dom.openSection.hidden = false;
    dom.openList.innerHTML = openUpcoming.map((e) => `
      <li class="td-open-item">
        <span class="td-open-date">${Render.formatDate(e.date)}</span>
        <span class="td-open-activity">${Render.escapeHtml(e.activity)}</span>
        <a class="td-open-signup" href="${CONFIG.SIGNUP_URL}" target="_blank" rel="noopener noreferrer">Sign up →</a>
      </li>
    `).join('');
  },

  /** The full schedule, in sheet order, with a status badge per row. */
  fullSchedule(entries) {
    dom.scheduleSection.hidden = false;
    dom.scheduleList.innerHTML = entries.map((e) => {
      const passedClass = Schedule.isPast(e.date) ? ' is-passed' : '';
      return `
        <li class="td-schedule-item${passedClass}">
          <div class="td-schedule-main">
            <span class="td-schedule-date">${Render.formatDate(e.date)}</span>
            <span class="td-schedule-activity">${Render.escapeHtml(e.activity)}</span>
            ${Render.statusBadge(e)}
          </div>
          ${e.remarks && e.status !== 'note' ? `<p class="td-schedule-remarks">${Render.escapeHtml(e.remarks)}</p>` : ''}
          ${e.status === 'note' && e.remarks ? `<p class="td-schedule-remarks">${Render.escapeHtml(e.remarks)}</p>` : ''}
        </li>
      `;
    }).join('');
  },

  statusBadge(entry) {
    if (entry.status === 'filled') {
      return `<span class="td-badge td-badge--filled">${Render.escapeHtml(entry.companion)}</span>`;
    }
    if (entry.status === 'open') {
      return '<span class="td-badge td-badge--open">OPEN</span>';
    }
    if (entry.status === 'tbc') {
      return '<span class="td-badge td-badge--tbc">To be confirmed</span>';
    }
    return ''; // 'note' rows explain themselves via remarks, no badge needed
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
  }
};

// ============================================================================
// INIT
// ============================================================================
async function init() {
  Render.showLoading();

  try {
    const response = await Jsonp.load(CONFIG.SHEET_ID);
    if (response.status !== 'ok') {
      throw new Error('Sheet returned an error status.');
    }

    const entries = Schedule.parse(response);
    Render.hideLoading();
    Render.openDates(entries);
    Render.fullSchedule(entries);
  } catch (error) {
    console.error('Failed to load TD schedule:', error);
    Render.showError();
  }
}

document.addEventListener('DOMContentLoaded', init);
