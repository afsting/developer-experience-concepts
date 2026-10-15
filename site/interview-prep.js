/**
 * interview-prep.js — Renders the admin-only interview practice guide.
 *
 * This page ships no content: the guide is fetched from an admin-gated
 * API (GET /auth/admin/interview-prep), which re-checks the signed
 * session's admin claim server-side. Non-admins just see the 403 message.
 */
(function () {
  'use strict';

  function esc(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  var statusEl = document.getElementById('prep-status');
  var contentEl = document.getElementById('prep-content');
  var navEl = document.getElementById('prep-nav');

  function renderOutline(q) {
    return '<article class="prep-card" id="outline-' + q.n + '">' +
      '<h3><span class="prep-num">' + q.n + '</span> ' + esc(q.question) + '</h3>' +
      '<p class="prep-story">Story: <strong>' + esc(q.story) + '</strong> &middot; ' +
      '<a href="#answer-' + q.n + '">Full answer &darr;</a></p>' +
      '<ul class="prep-outline">' +
      q.outline.map(function (o) {
        return '<li><span class="prep-label">' + esc(o.label) + '</span> ' + esc(o.text) + '</li>';
      }).join('') +
      '</ul></article>';
  }

  function renderAnswer(q) {
    return '<article class="prep-answer" id="answer-' + q.n + '">' +
      '<h3><span class="prep-num">' + q.n + '</span> ' + esc(q.question) + '</h3>' +
      '<p class="prep-story">Story: <strong>' + esc(q.story) + '</strong> &middot; ' +
      '<a href="#outline-' + q.n + '">&uarr; Outline</a></p>' +
      q.answer.map(function (p) { return '<p>' + esc(p) + '</p>'; }).join('') +
      '</article>';
  }

  function render(data) {
    var qs = data.questions || [];

    contentEl.innerHTML =
      '<h2 id="overview">' + esc(data.title) + '</h2>' +
      '<p class="prep-narrative">' + esc(data.narrative) + '</p>' +
      '<div class="prep-grid">' +
        '<section><h3>How to use this guide</h3><ul>' +
          (data.howToUse || []).map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') +
        '</ul></section>' +
        '<section><h3>Themes to reinforce</h3><ul>' +
          (data.themes || []).map(function (t) {
            return '<li><strong>' + esc(t.name) + ':</strong> ' + esc(t.text) + '</li>';
          }).join('') +
        '</ul></section>' +
      '</div>' +
      '<h2 id="story-map">Story map</h2>' +
      '<div class="plan-table-wrapper"><table class="prep-table"><thead><tr><th>Story</th><th>Best used for</th></tr></thead><tbody>' +
        (data.storyMap || []).map(function (s) {
          return '<tr><td>' + esc(s.story) + '</td><td>' + esc(s.usedFor) + '</td></tr>';
        }).join('') +
      '</tbody></table></div>' +
      '<h2 id="outlines">Quick reference: outlines</h2>' +
      qs.map(renderOutline).join('') +
      '<h2 id="answers">Full answers</h2>' +
      qs.map(renderAnswer).join('');

    navEl.querySelector('ul').innerHTML =
      '<li><a href="#overview">Overview</a></li>' +
      '<li><a href="#story-map">Story map</a></li>' +
      '<li><a href="#outlines">Outlines</a></li>' +
      '<li><a href="#answers">Full answers</a></li>' +
      '<li class="side-nav-heading" aria-hidden="true">Questions</li>' +
      qs.map(function (q) {
        return '<li><a href="#outline-' + q.n + '">' + q.n + '. ' + esc(q.short) + '</a></li>';
      }).join('');

    statusEl.hidden = true;
    contentEl.hidden = false;
    navEl.hidden = false;

    // Content is injected after load, so the browser's own anchor jump
    // (e.g. a bookmarked #answer-5) has nothing to land on yet.
    if (window.location.hash) {
      var target = document.getElementById(window.location.hash.slice(1));
      if (target) target.scrollIntoView();
    }
  }

  fetch('/auth/admin/interview-prep', { credentials: 'same-origin' })
    .then(function (response) {
      if (response.status === 403) throw new Error('This page is available to admins only.');
      if (response.status === 404) throw new Error('No interview prep content has been published yet.');
      if (!response.ok) throw new Error('Could not load interview prep (' + response.status + ').');
      return response.json();
    })
    .then(render)
    .catch(function (err) {
      statusEl.textContent = err.message;
    });
})();
