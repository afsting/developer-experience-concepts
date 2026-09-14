/**
 * admin.js — Allowlist admin table + magic-link generator, for admin.html.
 *
 * Extracted from an inline <script> so the CloudFront ResponseHeadersPolicy
 * can enforce a script-src 'self' Content-Security-Policy with no
 * 'unsafe-inline'.
 */
(function () {
  'use strict';

  var entriesBody = document.getElementById('entries-body');
  var addForm = document.getElementById('add-form');
  var statusEl = document.getElementById('status');

  function setStatus(text, kind) {
    statusEl.textContent = text;
    statusEl.className = 'status ' + (kind || '');
  }

  function esc(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function renderEntries(entries) {
    if (!entries.length) {
      entriesBody.innerHTML = '<tr><td colspan="4">No entries yet.</td></tr>';
      return;
    }
    entriesBody.innerHTML = entries.map(function (entry) {
      return '<tr>' +
        '<td>' + esc(entry.type) + '</td>' +
        '<td>' + esc(entry.value) + '</td>' +
        '<td>' + (entry.admin ? 'Yes' : '') + '</td>' +
        '<td><button type="button" class="danger" data-type="' + esc(entry.type) + '" data-value="' + esc(entry.value) + '">Remove</button></td>' +
        '</tr>';
    }).join('');
  }

  function loadEntries() {
    fetch('/auth/admin/allowlist', { credentials: 'same-origin' })
      .then(function (response) {
        if (response.status === 403) {
          entriesBody.innerHTML = '<tr><td colspan="4">You do not have admin access.</td></tr>';
          addForm.hidden = true;
          throw new Error('forbidden');
        }
        return response.json();
      })
      .then(function (data) {
        renderEntries(data.entries || []);
      })
      .catch(function (err) {
        if (err.message !== 'forbidden') {
          setStatus('Failed to load allowlist.', 'error');
        }
      });
  }

  entriesBody.addEventListener('click', function (event) {
    var button = event.target.closest('button[data-type]');
    if (!button) return;
    var type = button.getAttribute('data-type');
    var value = button.getAttribute('data-value');
    if (!window.confirm('Remove ' + type + ' "' + value + '" from the allowlist?')) return;

    fetch('/auth/admin/allowlist?type=' + encodeURIComponent(type) + '&value=' + encodeURIComponent(value), {
      method: 'DELETE',
      credentials: 'same-origin',
    })
      .then(function (response) {
        if (!response.ok) throw new Error('failed');
        setStatus('Removed.', 'ok');
        loadEntries();
      })
      .catch(function () {
        setStatus('Failed to remove entry.', 'error');
      });
  });

  addForm.addEventListener('submit', function (event) {
    event.preventDefault();
    var type = document.getElementById('type').value;
    var value = document.getElementById('value').value.trim();
    var admin = document.getElementById('admin').checked;

    fetch('/auth/admin/allowlist', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ type: type, value: value, admin: admin }),
    })
      .then(function (response) {
        if (!response.ok) throw new Error('failed');
        addForm.reset();
        setStatus('Added.', 'ok');
        loadEntries();
      })
      .catch(function () {
        setStatus('Failed to add entry.', 'error');
      });
  });

  var magicLinkForm = document.getElementById('magic-link-form');
  var magicLinkResult = document.getElementById('magic-link-result');
  var magicLinkUrl = document.getElementById('magic-link-url');
  var magicLinkExpiry = document.getElementById('magic-link-expiry');

  magicLinkForm.addEventListener('submit', function (event) {
    event.preventDefault();
    var email = document.getElementById('magic-link-email').value.trim();
    magicLinkResult.hidden = true;

    fetch('/auth/admin/magic-link', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ email: email }),
    })
      .then(function (response) {
        return response.json().catch(function () { return {}; }).then(function (data) {
          if (!response.ok) {
            throw new Error(data && data.message ? data.message : 'Failed to generate link.');
          }
          magicLinkUrl.value = data.url;
          magicLinkExpiry.textContent = data.expiresInHours;
          magicLinkResult.hidden = false;
          magicLinkUrl.focus();
          magicLinkUrl.select();
          setStatus('Link generated.', 'ok');
        });
      })
      .catch(function (err) {
        setStatus(err && err.message ? err.message : 'Failed to generate link.', 'error');
      });
  });

  loadEntries();
})();
