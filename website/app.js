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

  // Explicit color for known categories. To customize a category's color,
  // or add a brand-new category, just add/edit an entry here — nothing
  // else in this file, index.html, or style.css needs to change. Category
  // chips and card badges are both generated dynamically from whatever
  // categories actually appear in the fetched data (see Render.categoryColor
  // and Render.buildCategoryChips), so a category doesn't even need an
  // entry here to work — see CATEGORY_FALLBACK_PALETTE below.
  CATEGORY_COLORS: {
    General: '#6b7280',
    Academics: '#1a56db',
    Events: '#7c3aed',
    Finance: '#b45309',
    PTA: '#be185d',
    Sports: '#0e9f6e'
  },

  // Color for any category NOT listed in CATEGORY_COLORS above (e.g. a
  // brand-new category added on the Apps Script side that nobody's
  // assigned a color to yet). Picked deterministically from the category
  // name so the same unlisted category always gets the same color, both
  // within a session and across future visits.
  CATEGORY_FALLBACK_PALETTE: ['#0891b2', '#c2410c', '#4d7c0f', '#9333ea', '#be123c', '#0d9488'],

  // Announcements shown per page. All filtering/searching still happens
  // across the full fetched dataset — only rendering is paginated.
  PAGE_SIZE: 9
};

// ============================================================================
// STATE
// ============================================================================
const state = {
  allAnnouncements: [], // full dataset as fetched from the API
  filtered: [],         // subset matching search + filters, across all pages
  searchTerm: '',
  selectedCategories: new Set(), // empty = no category restriction ("All")
  dateFrom: '', // yyyy-mm-dd from <input type="date">, or '' for no lower bound
  dateTo: '',   // yyyy-mm-dd, or '' for no upper bound
  currentPage: 1
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
  categoryChips: document.getElementById('category-chips'),
  advancedSearchToggle: document.getElementById('advanced-search-toggle'),
  advancedSearchPanel: document.getElementById('advanced-search-panel'),
  dateFrom: document.getElementById('date-from'),
  dateTo: document.getElementById('date-to'),
  dateClear: document.getElementById('date-clear'),
  modalOverlay: document.getElementById('modal-overlay'),
  modalClose: document.getElementById('modal-close'),
  modalTitle: document.getElementById('modal-title'),
  modalDate: document.getElementById('modal-date'),
  modalCategory: document.getElementById('modal-category'),
  modalBody: document.getElementById('modal-body'),
  modalAttachments: document.getElementById('modal-attachments'),
  footerYear: document.getElementById('footer-year'),
  pagination: document.getElementById('pagination'),
  paginationPrev: document.getElementById('pagination-prev'),
  paginationNext: document.getElementById('pagination-next'),
  paginationStatus: document.getElementById('pagination-status')
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
   * Applies the current search term, category selection, and date range
   * to the full dataset, storing the result in state.filtered.
   */
  apply() {
    const term = state.searchTerm.trim().toLowerCase();
    const hasCategoryFilter = state.selectedCategories.size > 0;

    // Bounds are inclusive: dateFrom's whole day counts, as does dateTo's.
    const fromBound = state.dateFrom ? new Date(state.dateFrom + 'T00:00:00') : null;
    const toBound = state.dateTo ? new Date(state.dateTo + 'T23:59:59') : null;

    state.filtered = state.allAnnouncements.filter((item) => {
      if (hasCategoryFilter && !state.selectedCategories.has(item.category)) return false;

      if (fromBound || toBound) {
        const itemDate = new Date(item.date);
        if (fromBound && itemDate < fromBound) return false;
        if (toBound && itemDate > toBound) return false;
      }

      if (!term) return true;

      const haystack = [item.title, item.summary, item.body]
        .join(' ')
        .toLowerCase();

      return haystack.includes(term);
    });

    // A new search/filter always starts back on page 1.
    state.currentPage = 1;
  }
};

// ============================================================================
// RENDER MODULE — turning data into DOM
// ============================================================================
const Render = {
  /**
   * Renders the current page of state.filtered as cards, or shows the
   * "no results" message when the filtered list is empty.
   */
  announcements() {
    dom.grid.innerHTML = '';

    if (state.filtered.length === 0) {
      dom.noResults.hidden = false;
      dom.resultCount.textContent = '';
      Pagination.render();
      return;
    }

    dom.noResults.hidden = true;

    const pageItems = Pagination.getPageItems();
    const pageStartIndex = (state.currentPage - 1) * CONFIG.PAGE_SIZE;

    const fragment = document.createDocumentFragment();
    pageItems.forEach((item, i) => {
      // Use the item's absolute index within state.filtered (not its
      // position on this page) so Read More can look it back up correctly.
      fragment.appendChild(Render.card(item, pageStartIndex + i));
    });
    dom.grid.appendChild(fragment);

    Render.resultCount();
    Pagination.render();
  },

  /** Builds a single announcement card element. */
  card(item, index) {
    const card = document.createElement('article');
    card.className = 'card';

    const badgeColor = Render.categoryColor(item.category);

    card.innerHTML = `
      <div class="card-header">
        <h3 class="card-title">${Render.escapeHtml(item.title)}</h3>
        <p class="card-date">${Render.formatDate(item.date)}</p>
      </div>
      <span class="badge" style="background-color: ${badgeColor}">${Render.escapeHtml(item.category)}</span>
      <p class="card-summary">${Render.escapeHtml(item.summary)}</p>
      <div class="card-footer">
        <button class="read-more-btn" data-index="${index}">Read More →</button>
      </div>
    `;

    return card;
  },

  /**
   * Resolves a category name to a display color: an explicit entry in
   * CONFIG.CATEGORY_COLORS if one exists, otherwise a color picked
   * deterministically from CONFIG.CATEGORY_FALLBACK_PALETTE based on the
   * category name, so any category works without needing a config edit,
   * and repeat visits/renders always get the same color for that name.
   */
  categoryColor(category) {
    if (CONFIG.CATEGORY_COLORS[category]) return CONFIG.CATEGORY_COLORS[category];

    let hash = 0;
    for (let i = 0; i < category.length; i++) {
      hash = (hash * 31 + category.charCodeAt(i)) >>> 0;
    }
    const palette = CONFIG.CATEGORY_FALLBACK_PALETTE;
    return palette[hash % palette.length];
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

  /**
   * Builds the attachments block for the Read More modal: an inline
   * image or embedded PDF preview when the API provides one, otherwise
   * just a filename (linked to Drive if a viewUrl is available).
   */
  attachments(attachmentList) {
    const container = document.createElement('div');

    const label = document.createElement('strong');
    label.textContent = 'Attachments';
    container.appendChild(label);

    const list = document.createElement('div');
    list.className = 'attachment-list';
    attachmentList.forEach((attachment) => {
      list.appendChild(Render.attachmentItem(attachment));
    });
    container.appendChild(list);

    return container;
  },

  /** Builds a single attachment's preview + filename link. */
  attachmentItem(attachment) {
    const item = document.createElement('div');
    item.className = 'attachment-item';

    const mimeType = attachment.mimeType || '';
    const isImage = mimeType.indexOf('image/') === 0;
    const isPdf = mimeType === 'application/pdf';

    if (isImage && attachment.previewUrl) {
      const link = document.createElement('a');
      link.href = attachment.viewUrl || attachment.previewUrl;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';

      const img = document.createElement('img');
      img.src = attachment.previewUrl;
      img.alt = attachment.name || 'Attachment image';
      img.className = 'attachment-image-preview';
      img.loading = 'lazy';

      link.appendChild(img);
      item.appendChild(link);
    } else if (isPdf && attachment.previewUrl) {
      const iframe = document.createElement('iframe');
      iframe.src = attachment.previewUrl;
      iframe.className = 'attachment-pdf-preview';
      iframe.loading = 'lazy';
      iframe.title = attachment.name || 'PDF preview';
      item.appendChild(iframe);
    }

    const nameRow = document.createElement('div');
    nameRow.className = 'attachment-name-row';

    if (attachment.viewUrl) {
      const nameLink = document.createElement('a');
      nameLink.href = attachment.viewUrl;
      nameLink.target = '_blank';
      nameLink.rel = 'noopener noreferrer';
      nameLink.textContent = attachment.name;
      nameRow.appendChild(nameLink);
    } else {
      nameRow.textContent = attachment.name;
    }

    item.appendChild(nameRow);
    return item;
  },

  /**
   * Builds one chip per distinct category found in the fetched data
   * (alongside the "All" chip already in the HTML), each colored via
   * Render.categoryColor. Called once after data loads — the "All" chip
   * is the only one that's static markup.
   */
  buildCategoryChips() {
    const categories = [...new Set(state.allAnnouncements.map((item) => item.category))].sort();

    categories.forEach((category) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'category-chip';
      chip.dataset.category = category;
      chip.textContent = category;
      chip.style.setProperty('--chip-color', Render.categoryColor(category));
      dom.categoryChips.appendChild(chip);
    });
  },

  /** Syncs each category chip's active state with state.selectedCategories. */
  syncCategoryChips() {
    const noneSelected = state.selectedCategories.size === 0;

    dom.categoryChips.querySelectorAll('.category-chip').forEach((chip) => {
      const isAll = chip.dataset.category === 'all';
      const isActive = isAll ? noneSelected : state.selectedCategories.has(chip.dataset.category);
      chip.classList.toggle('is-active', isActive);
    });
  },

  showLoading() {
    dom.loading.hidden = false;
    dom.errorMessage.hidden = true;
    dom.noResults.hidden = true;
    dom.pagination.hidden = true;
    dom.grid.innerHTML = '';
  },

  hideLoading() {
    dom.loading.hidden = true;
  },

  showError() {
    dom.errorMessage.hidden = false;
    dom.loading.hidden = true;
    dom.pagination.hidden = true;
    dom.grid.innerHTML = '';
    dom.resultCount.textContent = '';
  }
};

// ============================================================================
// PAGINATION MODULE — slices state.filtered into pages for the grid
// ============================================================================
const Pagination = {
  totalPages() {
    return Math.max(1, Math.ceil(state.filtered.length / CONFIG.PAGE_SIZE));
  },

  /** Returns the slice of state.filtered belonging to state.currentPage. */
  getPageItems() {
    const start = (state.currentPage - 1) * CONFIG.PAGE_SIZE;
    return state.filtered.slice(start, start + CONFIG.PAGE_SIZE);
  },

  goTo(page) {
    const clamped = Math.min(Math.max(1, page), Pagination.totalPages());
    if (clamped === state.currentPage) return;

    state.currentPage = clamped;
    Render.announcements();
    dom.grid.scrollIntoView({ behavior: 'smooth', block: 'start' });
  },

  /** Shows/hides and updates the Prev/Next controls for the current state. */
  render() {
    const total = Pagination.totalPages();

    if (state.filtered.length === 0 || total <= 1) {
      dom.pagination.hidden = true;
      return;
    }

    dom.pagination.hidden = false;
    dom.paginationStatus.textContent = `Page ${state.currentPage} of ${total}`;
    dom.paginationPrev.disabled = state.currentPage <= 1;
    dom.paginationNext.disabled = state.currentPage >= total;
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
    const safeColspan = (tag === 'TD' || tag === 'TH') ? Sanitize.safeSpan(el.getAttribute('colspan')) : null;
    const safeRowspan = (tag === 'TD' || tag === 'TH') ? Sanitize.safeSpan(el.getAttribute('rowspan')) : null;

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

    // Structural only — no colors/fonts/widths are restored, so every
    // announcement keeps the site's own look regardless of sender styling.
    // Kept safe because these are plain positive integers, not free text.
    if (safeColspan) el.setAttribute('colspan', safeColspan);
    if (safeRowspan) el.setAttribute('rowspan', safeRowspan);
  },

  /** Validates a table colspan/rowspan value: a positive integer, capped to a sane max. */
  safeSpan(rawValue) {
    const n = parseInt(rawValue, 10);
    if (!Number.isInteger(n) || n < 1) return null;
    return String(Math.min(n, 20));
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

    dom.modalCategory.textContent = item.category;
    dom.modalCategory.className = 'badge';
    dom.modalCategory.style.backgroundColor = Render.categoryColor(item.category);

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
      dom.modalAttachments.appendChild(Render.attachments(item.attachments));
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

function handleCategoryChipClick(event) {
  const chip = event.target.closest('.category-chip');
  if (!chip) return;

  if (chip.dataset.category === 'all') {
    state.selectedCategories.clear();
  } else {
    if (state.selectedCategories.has(chip.dataset.category)) {
      state.selectedCategories.delete(chip.dataset.category);
    } else {
      state.selectedCategories.add(chip.dataset.category);
    }
  }

  Render.syncCategoryChips();
  Filters.apply();
  Render.announcements();
}

function handleDateChange() {
  state.dateFrom = dom.dateFrom.value;
  state.dateTo = dom.dateTo.value;
  Filters.apply();
  Render.announcements();
}

function handleDateClear() {
  dom.dateFrom.value = '';
  dom.dateTo.value = '';
  state.dateFrom = '';
  state.dateTo = '';
  Filters.apply();
  Render.announcements();
}

function handleAdvancedSearchToggle() {
  const isExpanded = dom.advancedSearchToggle.getAttribute('aria-expanded') === 'true';
  dom.advancedSearchToggle.setAttribute('aria-expanded', String(!isExpanded));
  dom.advancedSearchToggle.textContent = isExpanded
    ? '▸ Advanced search (date range)'
    : '▾ Advanced search (date range)';
  dom.advancedSearchPanel.hidden = isExpanded;
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

function handlePaginationPrev() {
  Pagination.goTo(state.currentPage - 1);
}

function handlePaginationNext() {
  Pagination.goTo(state.currentPage + 1);
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
  dom.categoryChips.addEventListener('click', handleCategoryChipClick);
  dom.advancedSearchToggle.addEventListener('click', handleAdvancedSearchToggle);
  dom.dateFrom.addEventListener('change', handleDateChange);
  dom.dateTo.addEventListener('change', handleDateChange);
  dom.dateClear.addEventListener('click', handleDateClear);
  dom.grid.addEventListener('click', handleGridClick);
  dom.modalClose.addEventListener('click', Modal.close);
  dom.modalOverlay.addEventListener('click', handleModalOverlayClick);
  document.addEventListener('keydown', handleKeydown);
  dom.paginationPrev.addEventListener('click', handlePaginationPrev);
  dom.paginationNext.addEventListener('click', handlePaginationNext);

  Render.showLoading();

  try {
    const data = await Api.fetchAnnouncements();
    state.allAnnouncements = Array.isArray(data) ? data : [];
    Render.buildCategoryChips();
    Filters.apply();
    Render.hideLoading();
    Render.announcements();
  } catch (error) {
    console.error('Failed to load announcements:', error);
    Render.showError();
  }
}

document.addEventListener('DOMContentLoaded', init);
