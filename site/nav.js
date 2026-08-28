// Shared global (top-level) navigation, rendered identically into every
// page's `#global-nav` mount point (inside the header) so feature nav only
// needs to change in one place. Page-specific sub-navigation (in-page
// section jump links) is rendered as a fixed left-edge `.side-nav` and
// stays hardcoded in each page's own HTML, since it's unique to that page
// anyway.
(function () {
  'use strict';

  var GLOBAL_NAV = [
    { page: 'resume', href: 'index.html', label: 'Resume' },
    { page: 'dora-metrics', href: 'dora-metrics.html', label: 'DORA Metrics' },
    { page: 'security-scorecard', href: 'security-scorecard.html', label: 'Security Scorecard' },
    { page: '100-day-plan', href: '100-day-plan.html', label: '100-Day Plan' },
    { page: 'how-it-was-built', href: 'how-it-was-built.html', label: 'How This Was Built' },
  ];

  // The Admin link is only shown to the visitor whose most recent OTP
  // verification came back with `admin: true` (see login.html). This is a
  // UI convenience only, not a security boundary — the /admin API and
  // admin.html's own Lambda both re-check the signed session cookie
  // server-side regardless of what's shown in nav.
  function isAdmin() {
    try {
      return window.localStorage.getItem('isAdmin') === 'true';
    } catch (e) {
      return false;
    }
  }

  function renderGlobalNav() {
    var mount = document.getElementById('global-nav');
    if (!mount) return;

    var items = GLOBAL_NAV.slice();
    if (isAdmin()) {
      items.push({ page: 'admin', href: 'admin.html', label: 'Admin' });
    }

    var currentPage = document.body.getAttribute('data-page');

    var ul = document.createElement('ul');
    items.forEach(function (item) {
      var li = document.createElement('li');
      var a = document.createElement('a');
      a.href = item.href;
      a.textContent = item.label;
      if (item.page === currentPage) {
        a.setAttribute('aria-current', 'page');
      }
      li.appendChild(a);
      ul.appendChild(li);
    });

    mount.appendChild(ul);
  }

  renderGlobalNav();
})();
