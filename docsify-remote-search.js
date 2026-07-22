// docsify-remote-search.js
//
// Augments the Docsify search plugin with results from remote repo pages
// loaded by docsify-remote-repo.js.
//
// Remote pages are indexed when visited.  The index is stored in
// sessionStorage so it survives in-tab refreshes but not new sessions.
//
// Requires: docsify-remote-repo.js (exposes window.__remoteLastMd/Path)
//           Docsify search plugin (provides the .search UI)

// Node.js compatibility stubs (for unit testing; no-op in browsers)
if (typeof window === 'undefined') {
  globalThis.window = { $docsify: { plugins: [] } };
  globalThis.sessionStorage = { getItem: function () { return null; }, setItem: function () {} };
}

(function () {
  'use strict';

  // ═══ INDEX ═════════════════════════════════════════════════════════
  // path → [{ slug, title, body, path }]

  const STORAGE_KEY = 'docsify-remote-search.index';
  const INDEX = new Map();

  function loadIndex() {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      for (const [k, v] of JSON.parse(raw)) INDEX.set(k, v);
    } catch (_) { /* ignore corrupt data */ }
  }

  function saveIndex() {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify([...INDEX]));
    } catch (_) { /* quota exceeded — silently skip */ }
  }

  // ═══ INDEXING ══════════════════════════════════════════════════════

  function stripMarkdown(text) {
    if (!text) return '';
    return text
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')  // images
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')   // links
      .replace(/<[^>]+>/g, '')                     // HTML tags
      .replace(/[`*_~]/g, '')                      // inline formatting
      .trim();
  }

  function indexPage(path, markdown) {
    if (!markdown) return;

    // Use marked.lexer if available (Docsify loads it), else basic heading split
    const entries = [];
    const depth = 6;

    if (window.marked && window.marked.lexer) {
      const tokens = window.marked.lexer(markdown);
      let current = null;

      for (const token of tokens) {
        if (token.type === 'heading' && token.depth <= depth) {
          const title = stripMarkdown(token.text);
          const slug = title.toLowerCase()
            .replace(/[^\w\s-]/g, '').replace(/\s+/g, '-')
            .replace(/-+/g, '-').replace(/^-|-$/g, '');
          current = { slug: '#' + path + '?id=' + slug, title: title, body: '', path: path };
          entries.push(current);
        } else {
          const text = stripMarkdown(token.text || '');
          if (!text) continue;
          if (current) {
            current.body += (current.body ? '\n' : '') + text;
          } else {
            // Content before first heading — use repo name as title
            const name = path.replace(/\/$/, '').split('/').pop() || 'Remote';
            current = { slug: '#' + path, title: name, body: text, path: path };
            entries.push(current);
          }
        }
      }
    } else {
      // Fallback: split by headings with regex
      const sections = markdown.split(/^(#{1,6})\s+(.+)$/m);
      if (sections.length <= 1) {
        // No headings found — index entire content under repo name
        const name = path.replace(/\/$/, '').split('/').pop() || 'Remote';
        const body = stripMarkdown(markdown);
        if (body) entries.push({ slug: '#' + path, title: name, body: body, path: path });
      } else {
        for (let i = 1; i < sections.length; i += 3) {
          const title = stripMarkdown(sections[i + 1] || '');
          const body  = stripMarkdown(sections[i + 2] || '');
          const slug = title.toLowerCase()
            .replace(/[^\w\s-]/g, '').replace(/\s+/g, '-')
            .replace(/-+/g, '-').replace(/^-|-$/g, '');
          entries.push({ slug: '#' + path + '?id=' + slug, title: title, body: body, path: path });
        }
      }
    }

    if (entries.length) {
      INDEX.set(path, entries);
      saveIndex();
    }
  }

  // ═══ PROACTIVE INDEXING ════════════════════════════════════════════
  // When a remote repo page is visited for the first time, discover all
  // pages from the repo's sidebar and fetch/index them in background.

  var _indexedRepos = {};  // repoKey → true
  var _proactiveRenderTimer;

  function fetchFirstOk(urls, i) {
    var API = window.__remoteRepoAPI;
    if (!API || i >= urls.length) return Promise.resolve(null);
    return API.cachedFetch(urls[i]).catch(function () {
      return fetchFirstOk(urls, i + 1);
    });
  }

  function fetchPageMd(host, repo, sub, ref) {
    var API = window.__remoteRepoAPI;
    var h = API.HOSTS[host];
    var r = ref || 'HEAD';
    var isFile  = /\.md$/i.test(sub);
    var maybeMd = !isFile && sub && !/\.\w+$/.test(sub);
    if (isFile)   return API.cachedFetch(h.fileUrl(repo, sub, r));
    if (maybeMd)  return API.cachedFetch(h.fileUrl(repo, sub + '.md', r)).catch(function () {
      return API.cachedFetch(h.readmeUrl(repo, sub, r));
    });
    return API.cachedFetch(h.readmeUrl(repo, sub, r));
  }

  function proactiveIndex(path) {
    var API = window.__remoteRepoAPI;
    if (!API) return;

    var parsed = API.parseRemoteRoute(path);
    if (!parsed) return;

    var split   = API.splitRepoPath(parsed.host, parsed.fullPath);
    var repoKey = parsed.host + '/' + split.repo;
    if (_indexedRepos[repoKey]) return;
    _indexedRepos[repoKey] = true;

    var host = parsed.host;
    var repo = split.repo;
    var h    = API.HOSTS[host];
    if (!h) return;

    var ref = API.getRef ? API.getRef() : 'HEAD';
    var sidebarUrls = API.buildSidebarCascade(host, repo, split.sub, ref);

    fetchFirstOk(sidebarUrls, 0).then(function (sidebarMd) {
      if (!sidebarMd) return;

      var entries = API.parseSidebarEntries(sidebarMd);

      for (var i = 0; i < entries.length; i++) {
        (function (entry) {
          var route = API.resolveEntryHref(entry.href, host, repo, null);
          if (/^https?:\/\//.test(route)) return;      // external link
          if (!route.startsWith('#/remote/')) return;    // non-remote

          var pagePath = route.slice(1);                 // strip leading #
          if (INDEX.has(pagePath)) return;               // already indexed

          var p = API.parseRemoteRoute(pagePath);
          if (!p) return;
          var s = API.splitRepoPath(p.host, p.fullPath);

          fetchPageMd(p.host, s.repo, s.sub, ref).then(function (md) {
            indexPage(pagePath, md);
            // Re-render results if user has an active search query
            clearTimeout(_proactiveRenderTimer);
            _proactiveRenderTimer = setTimeout(renderRemoteResults, 300);
          }).catch(function () { /* unfetchable — skip */ });
        })(entries[i]);
      }
    });
  }

  // ═══ SEARCH ════════════════════════════════════════════════════════

  function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function escapeRegExp(s) {
    return s.replace(/[|\\{}()[\]^$+*?.]/g, '\\$&');
  }

  function normalise(s) {
    return s.normalize ? s.normalize('NFD').replace(/[\u0300-\u036f]/g, '') : s;
  }

  function searchRemote(query) {
    if (!query) return [];
    const results = [];
    const keywords = query.trim().split(/[\s\-，\\/]+/).filter(Boolean);
    if (!keywords.length) return [];
    const patterns = keywords.map(function (k) {
      return new RegExp(escapeRegExp(normalise(k)), 'gi');
    });

    INDEX.forEach(function (entries) {
      for (var i = 0; i < entries.length; i++) {
        var entry = entries[i];
        var score = 0;
        var normTitle   = normalise(entry.title || '');
        var normBody    = normalise(entry.body  || '');

        for (var p = 0; p < patterns.length; p++) {
          patterns[p].lastIndex = 0;
          if (patterns[p].test(normTitle)) score += 3;
          patterns[p].lastIndex = 0;
          if (patterns[p].test(normBody))  score += 2;
        }

        if (score > 0) {
          // Context snippet from body
          var content = '';
          if (normBody) {
            patterns[0].lastIndex = 0;
            var m = patterns[0].exec(normBody);
            if (m) {
              var start = Math.max(0, m.index - 40);
              var end   = Math.min(normBody.length, m.index + 100);
              content = escapeHtml(normBody.slice(start, end));
              for (var q = 0; q < patterns.length; q++) {
                content = content.replace(patterns[q], '<em class="search-keyword">$&</em>');
              }
            }
          }

          var titleHtml = escapeHtml(entry.title || '');
          for (var q2 = 0; q2 < patterns.length; q2++) {
            titleHtml = titleHtml.replace(patterns[q2], '<em class="search-keyword">$&</em>');
          }

          results.push({ score: score, url: entry.slug, title: titleHtml, content: content });
        }
      }
    });

    results.sort(function (a, b) { return b.score - a.score; });
    return results;
  }

  // ═══ UI ════════════════════════════════════════════════════════════

  function getQuery() {
    var input = document.querySelector('.search input');
    return input ? (input.value || '').trim() : '';
  }

  function renderRemoteResults() {
    var panel = document.querySelector('.search .results-panel');
    if (!panel) return;

    // Remove previous remote section
    var old = panel.querySelector('.remote-search-results');
    if (old) old.remove();

    // Always read the actual input value — the clear button (✕) doesn't
    // fire an input event, so a tracked variable can become stale.
    var query = getQuery();
    if (!query) return;
    var matches = searchRemote(query);
    if (!matches.length) return;

    var html = '<p class="remote-search-label" style="font-size:.8em;opacity:.45;margin:.8em 0 .2em;border-top:1px solid var(--border-color,rgba(139,138,203,.14));padding-top:.6em">Remote repositories</p>';
    for (var i = 0; i < matches.length; i++) {
      var post = matches[i];
      var plainTitle = (post.title || '').replace(/<[^>]+>/g, '');
      var snippet = post.content ? '...' + post.content + '...' : '';
      html +=
        '<div class="matching-post" aria-label="remote result ' + (i + 1) + '">' +
          '<a href="' + post.url + '" title="' + plainTitle + '">' +
            '<p class="title clamp-1">' + post.title + '</p>' +
            '<p class="content clamp-2">' + snippet + '</p>' +
          '</a>' +
        '</div>';
    }

    var container = document.createElement('div');
    container.className = 'remote-search-results';
    container.innerHTML = html;
    panel.appendChild(container);

    // Update combined count in status
    var status = document.querySelector('.search .results-status');
    if (status && status.textContent) {
      var localCount = panel.querySelectorAll('.matching-post').length - matches.length;
      var total = localCount + matches.length;
      status.textContent = total ? 'Found ' + total + ' results' : status.textContent;
    }
  }

  function bindSearchInput() {
    var input = document.querySelector('.search input');
    if (!input) return false;
    var timeId;
    input.addEventListener('input', function () {
      clearTimeout(timeId);
      // Run after the native search plugin (which uses 100ms debounce)
      timeId = setTimeout(renderRemoteResults, 160);
    });
    // Also render when native search clears/rerenders
    var panel = document.querySelector('.search .results-panel');
    if (panel) {
      var _skip = false;
      new MutationObserver(function () {
        if (_skip) return;
        _skip = true;
        setTimeout(function () { _skip = false; renderRemoteResults(); }, 20);
      }).observe(panel, { childList: true });
    }
    return true;
  }

  // ═══ PLUGIN ════════════════════════════════════════════════════════

  function plugin(hook, vm) {
    hook.init(function () {
      loadIndex();
    });

    hook.doneEach(function () {
      var path = (vm.route && vm.route.path) || '';
      if (!path.startsWith('/remote/')) return;

      // Always index the current page (immediate / progressive fallback)
      if (window.__remoteLastMd) {
        indexPage(path, window.__remoteLastMd);
      }

      // Proactively fetch & index all pages listed in this repo's sidebar
      proactiveIndex(path);
    });

    hook.mounted(function () {
      // The search plugin may not have created its UI yet — poll briefly
      if (bindSearchInput()) return;
      var attempts = 0;
      var poll = setInterval(function () {
        if (bindSearchInput() || ++attempts > 30) clearInterval(poll);
      }, 200);
    });
  }

  window.$docsify = window.$docsify || {};
  window.$docsify.plugins = (window.$docsify.plugins || []).concat(plugin);

  // ═══ NODE.JS TEST EXPORT ═══════════════════════════════════════════
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      indexPage: indexPage,
      searchRemote: searchRemote,
      proactiveIndex: proactiveIndex,
      INDEX: INDEX,
      _resetIndex: function () { INDEX.clear(); for (var k in _indexedRepos) delete _indexedRepos[k]; },
    };
  }
})();
