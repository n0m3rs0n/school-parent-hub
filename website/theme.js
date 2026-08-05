/**
 * ============================================================================
 * DARK MODE TOGGLE — shared by index.html and resources.html
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
    toggleButton.textContent = isDark ? '☀️' : '🌙';
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
