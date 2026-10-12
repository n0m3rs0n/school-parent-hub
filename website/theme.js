/**
 * ============================================================================
 * DARK MODE TOGGLE — shared by every page
 * ============================================================================
 * The initial theme (light/dark) is already applied before this file loads
 * — see the small inline script in each page's <head>, which reads the
 * same localStorage key synchronously to avoid a flash of the wrong theme
 * on load. This file only wires up the toggle button's click behavior.
 */
(function () {
  const STORAGE_KEY = 'theme';
  const toggleButton = document.getElementById('theme-toggle');
  if (!toggleButton) return;

  function currentTheme() {
    return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  }

  function updateButton() {
    const isDark = currentTheme() === 'dark';
    // Icon (moon/sun SVG) is swapped by CSS from [data-theme]; only the label changes here.
    toggleButton.setAttribute('aria-label', isDark ? 'Switch to light mode' : 'Switch to dark mode');
  }

  toggleButton.addEventListener('click', function () {
    const next = currentTheme() === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem(STORAGE_KEY, next);
    updateButton();
  });

  updateButton();
})();

/* On narrow screens the nav scrolls horizontally; make sure the current
   page's tab is visible instead of possibly clipped at the right edge. */
(function () {
  const nav = document.querySelector('.site-nav');
  const active = nav && nav.querySelector('.site-nav-link.is-active');
  if (!active || nav.scrollWidth <= nav.clientWidth) return;
  nav.classList.add('is-scrollable');
  // Only scroll as far as needed to show the whole active tab (plus room
  // for the edge fade), so earlier tabs stay visible when possible.
  const navBox = nav.getBoundingClientRect();
  const tabBox = active.getBoundingClientRect();
  const overflow = tabBox.right - navBox.right + 48;
  if (overflow > 0) nav.scrollLeft = overflow;
})();
