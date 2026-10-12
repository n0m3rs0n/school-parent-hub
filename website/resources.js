/**
 * ============================================================================
 * RESOURCES — "Ateneo login required" badges + restricted-link swaps
 * ============================================================================
 * The seat plan and formators PDFs contain student names/details. They're
 * still linked (nothing removed), but:
 *   - SHOW_LOGIN_REQUIRED_BADGE adds a visible "Ateneo login required"
 *     badge to every card listed in RESTRICTED, plus a note at the top.
 *   - Paste a restricted copy's link into RESTRICTED[id].url to swap the
 *     card's link to it (e.g. a Drive copy shared only with the ateneo.edu
 *     domain or with specific parents). Leave '' to keep the current link.
 * Cards are matched by data-resource-id in resources.html.
 * ============================================================================
 */
const RESOURCES_CONFIG = {
  SHOW_LOGIN_REQUIRED_BADGE: true,

  RESTRICTED: {
    // TODO(Nomerson): replace with restricted Drive links when ready.
    'formators': { url: '' },
    'seat-plan': { url: '' }
  }
};

(function () {
  Object.keys(RESOURCES_CONFIG.RESTRICTED).forEach(function (id) {
    const card = document.querySelector('.resource-card[data-resource-id="' + id + '"]');
    if (!card) return;

    const swapUrl = RESOURCES_CONFIG.RESTRICTED[id].url;
    if (swapUrl) card.href = swapUrl;

    if (RESOURCES_CONFIG.SHOW_LOGIN_REQUIRED_BADGE) {
      const badge = document.createElement('span');
      badge.className = 'resource-login-badge';
      badge.textContent = 'Ateneo login required';
      const name = card.querySelector('.resource-name');
      (name || card).appendChild(badge);
    }
  });

  const note = document.getElementById('login-note');
  if (note) note.hidden = !RESOURCES_CONFIG.SHOW_LOGIN_REQUIRED_BADGE;
})();
