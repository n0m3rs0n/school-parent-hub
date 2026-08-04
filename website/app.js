/**
 * ============================================================================
 * SCHOOL PARENT INFORMATION HUB — Front-end logic
 * ============================================================================
 * Fetches announcement data from the Apps Script JSON API and renders it
 * as searchable, filterable cards. No frameworks — vanilla ES6, organized
 * into small modules (Config, Api, State, Render, Filters, Sanitize, Modal,
 * Init) so future features (Phase 2/3 in the README) can be added without
 * rewriting this file.
 * ============================================================================
 */

// ============================================================================
// CONFIG — update API_URL after deploying the Apps Script Web App
// ============================================================================
const CONFIG = {
  // Replace with your deployed Apps Script Web App URL, e.g.:
  // "https://script.google.com/macros/s/XXXXXXXXXXXX/exec"
  API_URL: 'https://script.google.com/macros/s/AKfycbyYdXjGYBGFw1PrFbB3-84iFNaYM6rok0818TTyEPL60ObYHBH0z6YQx7vTAzNOgusK/exec',

  // Maps category names to the CSS badge modifier class.
  CATEGORY_BADGE_CLASS: {
    General: 'badge--general',
    Academics: 'badge--academics',
    Events: 'badge--events',
    Finance: 'badge--finance',
    PTA: 'badge--pta',
    Sports: 'badge--sports'
  }
};

// ============================================================================
// STATE
// ============================================================================
const state = {
  allAnnouncements: [], // full dataset as fetched from the API
  filtered: [],         // subset currently shown, after search + category filter
  searchTerm: '',
  category: 'all'
};

// ============================================================================
// DOM REFERENCES
// ============================================================================
const dom = {
  grid: document.getElementById('announcements-grid'),
  loading: document.getElementById('loading-indicator'),
  noResults: document.getElementById('no-results'),
  errorMessage: document.getElementById('error-message'),
  resultCount: document.getElementById('result-count'),
  searchInput: document.getElementById('search-input'),
  categorySelect: document.getElementById('category-select'),
  modalOverlay: document.getElementById('modal-overlay'),
  modalClose: document.getElementById('modal-close'),
  modalTitle: document.getElementById('modal-title'),
  modalDate: document.getElementById('modal-date'),
  modalCategory: document.getElementById('modal-category'),
  modalBody: document.getElementById('modal-body'),
  modalAttachments: document.getElementById('modal-attachments'),
  footerYear: document.getElementById('footer-year')
};

// ============================================================================
// API MODULE — fetching data from the Apps Script backend
// ============================================================================
const Api = {
  /**
   * Fetches the announcement list from the Apps Script Web App.
   * Returns a Promise resolving to an array of announcement objects:
   * { date, title, category, summary, body, attachments }
   */
  async fetchAnnouncements() {
    const response = await fetch(CONFIG.API_URL);
    if (!response.ok) {
      throw new Error('Network response was not OK: ' + response.status);
    }
    return response.json();
  }
};

// ============================================================================
// FILTER MODULE — search + category logic
// ============================================================================
const Filters = {
  /**
   * Applies the current search term and category to the full dataset,
   * storing the result in state.filtered.
   */
  apply() {
    const term = state.searchTerm.trim().toLowerCase();

    state.filtered = state.allAnnouncements.filter((item) => {
      const matchesCategory = state.category === 'all' || item.category === state.category;
      if (!matchesCategory) return false;

      if (!term) return true;

      const haystack = [item.title, item.summary, item.body]
        .join(' ')
        .toLowerCase();

      return haystack.includes(term);
    });
  }
};

// ============================================================================
// RENDER MODULE — turning data into DOM
// ============================================================================
const Render = {
  /**
   * Renders the current state.filtered list as cards, or shows the
   * "no results" message when the list is empty.
   */
  announcements() {
    dom.grid.innerHTML = '';

    if (state.filtered.length === 0) {
      dom.noResults.hidden = false;
      dom.resultCount.textContent = '';
      return;
    }

    dom.noResults.hidden = true;

    const fragment = document.createDocumentFragment();
    state.filtered.forEach((item, index) => {
      fragment.appendChild(Render.card(item, index));
    });
    dom.grid.appendChild(fragment);

    Render.resultCount();
  },

  /** Builds a single announcement card element. */
  card(item, index) {
    const card = document.createElement('article');
    card.className = 'card';

    const badgeClass = CONFIG.CATEGORY_BADGE_CLASS[item.category] || 'badge--general';

    card.innerHTML = `
      <div class="card-header">
        <h3 class="card-title">${Render.escapeHtml(item.title)}</h3>
        <p class="card-date">${Render.formatDate(item.date)}</p>
      </div>
      <span class="badge ${badgeClass}">${Render.escapeHtml(item.category)}</span>
      <p class="card-summary">${Render.escapeHtml(item.summary)}</p>
      <div class="card-footer">
        <button class="read-more-btn" data-index="${index}">Read More →</button>
      </div>
    `;

    return card;
  },

  /** Updates the "N announcements found" status line. */
  resultCount() {
    const count = state.filtered.length;
    dom.resultCount.textContent = `${count} announcement${count === 1 ? '' : 's'} found`;
  },

  /** Formats an ISO date string into a friendly, readable date. */
  formatDate(isoString) {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return '';
    return date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  },

  /** Escapes HTML special characters to prevent markup injection from data. */
  escapeHtml(value) {
    const div = document.createElement('div');
    div.textContent = value == null ? '' : String(value);
    return div.innerHTML;
  },

  showLoading() {
    dom.loading.hidden = false;
    dom.errorMessage.hidden = true;
    dom.noResults.hidden = true;
    dom.grid.innerHTML = '';
  },

  hideLoading() {
    dom.loading.hidden = true;
  },

  showError() {
    dom.errorMessage.hidden = false;
    dom.loading.hidden = true;
    dom.grid.innerHTML = '';
    dom.resultCount.textContent = '';
  }
};

// ============================================================================
// SANITIZE MODULE — whitelist-based HTML cleaner for rendering email bodies
// ============================================================================
// The Apps Script API returns the raw HTML email body as `bodyHtml`. That
// HTML is untrusted (it originates from arbitrary inbound email) and is
// never safe to insert into the page as-is. There's no external sanitizer
// library here (the project intentionally stays dependency-free), so this
// module implements a conservative allowlist: unknown/dangerous tags are
// unwrapped or removed entirely, and every attribute is stripped except a
// hand-verified href/src on links and images.
const Sanitize = {
  ALLOWED_TAGS: new Set([
    'P', 'BR', 'STRONG', 'B', 'EM', 'I', 'U', 'A', 'UL', 'OL', 'LI',
    'SPAN', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE',
    'TABLE', 'THEAD', 'TBODY', 'TR', 'TD', 'TH', 'IMG', 'HR', 'SMALL',
    'SUB', 'SUP'
  ]),

  // Removed along with their entire subtree (never just unwrapped) —
  // these can carry executable content or hijack page behavior.
  REMOVE_ENTIRELY_TAGS: new Set([
    'SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'FORM', 'INPUT',
    'BUTTON', 'LINK', 'META', 'SVG', 'BASE'
  ]),

  /**
   * Parses rawHtml and returns a sanitized DocumentFragment safe to
   * append into the live page.
   */
  toFragment(rawHtml) {
    const fragment = document.createDocumentFragment();
    if (!rawHtml) return fragment;

    const parsedDoc = new DOMParser().parseFromString(rawHtml, 'text/html');
    Sanitize.cleanNode(parsedDoc.body);

    Array.from(parsedDoc.body.childNodes).forEach((node) => {
      fragment.appendChild(document.importNode(node, true));
    });

    return fragment;
  },

  /** Recursively strips disallowed tags/attributes from a node's children. */
  cleanNode(root) {
    Array.from(root.childNodes).forEach((node) => {
      if (node.nodeType === Node.COMMENT_NODE) {
        node.remove();
        return;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return;

      const tag = node.tagName;

      if (Sanitize.REMOVE_ENTIRELY_TAGS.has(tag)) {
        node.remove();
        return;
      }

      // Clean children first so a disallowed tag's still-allowed
      // descendants (e.g. a stray <span> inside a stripped <font>) survive.
      Sanitize.cleanNode(node);

      if (!Sanitize.ALLOWED_TAGS.has(tag)) {
        while (node.firstChild) {
          node.parentNode.insertBefore(node.firstChild, node);
        }
        node.remove();
        return;
      }

      Sanitize.cleanAttributes(node);
    });
  },

  /** Strips every attribute, then re-adds only verified-safe ones. */
  cleanAttributes(el) {
    const tag = el.tagName;
    const safeHref = tag === 'A' ? Sanitize.safeUrl(el.getAttribute('href'), ['http:', 'https:', 'mailto:']) : null;
    const safeSrc = tag === 'IMG' ? Sanitize.safeUrl(el.getAttribute('src'), ['http:', 'https:']) : null;
    const altText = el.getAttribute('alt');

    Array.from(el.attributes).forEach((attr) => el.removeAttribute(attr.name));

    if (tag === 'A') {
      if (!safeHref) return; // leave as a plain, non-clickable span of text
      el.setAttribute('href', safeHref);
      el.setAttribute('target', '_blank');
      el.setAttribute('rel', 'noopener noreferrer');
    }

    if (tag === 'IMG') {
      if (!safeSrc) {
        el.remove(); // no trustworthy source — drop rather than show a broken/unsafe image
        return;
      }
      el.setAttribute('src', safeSrc);
      if (altText) el.setAttribute('alt', altText);
    }
  },

  /** Resolves a URL and returns it only if its protocol is in the allowlist. */
  safeUrl(rawUrl, allowedProtocols) {
    if (!rawUrl) return null;
    try {
      const url = new URL(rawUrl, window.location.href);
      return allowedProtocols.includes(url.protocol) ? url.href : null;
    } catch (e) {
      return null;
    }
  }
};

// ============================================================================
// MODAL MODULE — Read More dialog
// ============================================================================
const Modal = {
  open(item) {
    dom.modalTitle.textContent = item.title;
    dom.modalDate.textContent = Render.formatDate(item.date);

    const badgeClass = CONFIG.CATEGORY_BADGE_CLASS[item.category] || 'badge--general';
    dom.modalCategory.textContent = item.category;
    dom.modalCategory.className = `badge ${badgeClass}`;

    dom.modalBody.innerHTML = '';
    if (item.bodyHtml) {
      dom.modalBody.classList.add('is-rich');
      dom.modalBody.appendChild(Sanitize.toFragment(item.bodyHtml));
    } else {
      dom.modalBody.classList.remove('is-rich');
      dom.modalBody.textContent = item.body || '';
    }

    dom.modalAttachments.innerHTML = '';
    if (item.attachments && item.attachments.length > 0) {
      const label = document.createElement('strong');
      label.textContent = 'Attachments: ';
      dom.modalAttachments.appendChild(label);
      dom.modalAttachments.appendChild(document.createTextNode(item.attachments.join(', ')));
    }

    dom.modalOverlay.hidden = false;
    dom.modalClose.focus();
  },

  close() {
    dom.modalOverlay.hidden = true;
  }
};

// ============================================================================
// EVENT HANDLERS
// ============================================================================
function handleSearchInput(event) {
  state.searchTerm = event.target.value;
  Filters.apply();
  Render.announcements();
}

function handleCategoryChange(event) {
  state.category = event.target.value;
  Filters.apply();
  Render.announcements();
}

function handleGridClick(event) {
  const button = event.target.closest('.read-more-btn');
  if (!button) return;

  const index = Number(button.dataset.index);
  const item = state.filtered[index];
  if (item) Modal.open(item);
}

function handleModalOverlayClick(event) {
  if (event.target === dom.modalOverlay) Modal.close();
}

function handleKeydown(event) {
  if (event.key === 'Escape' && !dom.modalOverlay.hidden) Modal.close();
}

// ============================================================================
// INIT
// ============================================================================
async function init() {
  dom.footerYear.textContent = new Date().getFullYear();

  dom.searchInput.addEventListener('input', handleSearchInput);
  dom.categorySelect.addEventListener('change', handleCategoryChange);
  dom.grid.addEventListener('click', handleGridClick);
  dom.modalClose.addEventListener('click', Modal.close);
  dom.modalOverlay.addEventListener('click', handleModalOverlayClick);
  document.addEventListener('keydown', handleKeydown);

  Render.showLoading();

  try {
    const data = await Api.fetchAnnouncements();
    state.allAnnouncements = Array.isArray(data) ? data : [];
    Filters.apply();
    Render.hideLoading();
    Render.announcements();
  } catch (error) {
    console.error('Failed to load announcements:', error);
    Render.showError();
  }
}

document.addEventListener('DOMContentLoaded', init);
