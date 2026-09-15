/**
 * login.js — Sign-in form logic for login.html.
 *
 * Extracted from an inline <script> so the CloudFront ResponseHeadersPolicy
 * can enforce a script-src 'self' Content-Security-Policy with no
 * 'unsafe-inline'. Reachable pre-auth same as every other *.js file —
 * that CloudFront behavior has no session-check function attached at
 * all (see infra/cloudfront-functions/session-check.js), unlike
 * login.html itself, which needs an explicit URI exemption on the
 * default (HTML) behavior where the gate actually runs.
 */
(function () {
  'use strict';

  var requestForm = document.getElementById('request-form');
  var verifyForm = document.getElementById('verify-form');
  var messageEl = document.getElementById('message');
  var emailInput = document.getElementById('email');
  var codeInput = document.getElementById('code');
  var requestSubmit = document.getElementById('request-submit');
  var verifySubmit = document.getElementById('verify-submit');
  var startOverBtn = document.getElementById('start-over');

  var submittedEmail = '';

  function showMessage(text, kind) {
    messageEl.textContent = text;
    messageEl.className = 'message visible ' + kind;
  }

  function clearMessage() {
    messageEl.className = 'message';
    messageEl.textContent = '';
  }

  requestForm.addEventListener('submit', function (event) {
    event.preventDefault();
    clearMessage();
    submittedEmail = emailInput.value.trim();
    requestSubmit.disabled = true;

    fetch('/auth/request-code', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ email: submittedEmail }),
    })
      .then(function (response) {
        return response.json().catch(function () { return {}; }).then(function (data) {
          if (!response.ok) {
            throw new Error(data && data.message ? data.message : 'Something went wrong sending the code. Please try again.');
          }
          requestForm.hidden = true;
          verifyForm.hidden = false;
          showMessage(data && data.message ? data.message : 'If that email is allowlisted, a verification code was sent. Check your inbox.', 'info');
          codeInput.focus();
        });
      })
      .catch(function (err) {
        showMessage(err && err.message ? err.message : 'Something went wrong sending the code. Please try again.', 'error');
      })
      .finally(function () {
        requestSubmit.disabled = false;
      });
  });

  verifyForm.addEventListener('submit', function (event) {
    event.preventDefault();
    clearMessage();
    verifySubmit.disabled = true;

    fetch('/auth/verify-code', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ email: submittedEmail, code: codeInput.value.trim() }),
    })
      .then(function (response) {
        if (!response.ok) {
          throw new Error('invalid');
        }
        return response.json().catch(function () { return {}; });
      })
      .then(function () {
        window.location.href = '/';
      })
      .catch(function () {
        showMessage('That code is invalid or expired. Please try again.', 'error');
      })
      .finally(function () {
        verifySubmit.disabled = false;
      });
  });

  startOverBtn.addEventListener('click', function () {
    clearMessage();
    verifyForm.hidden = true;
    requestForm.hidden = false;
    codeInput.value = '';
    emailInput.focus();
  });
})();
