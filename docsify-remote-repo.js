// docsify-remote-repo.js  (v4)
//
// Renders remote repo README.md files inline within Docsify 5.
// Injects a contextual sidebar from the repo's _sidebar.md (with
// group-level fallback and heading-based TOC as last resort).
//
// Usage:  [label](https://github.com/owner/repo ':repo')
// Route:  #/remote/{host}/{user/org/repo[/sub/path]}
//
// The plugin self-registers the Docsify aliases it needs — no external
// _remote.md placeholder file or manual alias config required.
//
// Architecture:
//   1. Link rewriting     → ':repo' marked links → #/remote/ routes
//   2. Pure route parsing  → context object (no shared mutable state)
//   3. Cached fetch        → deduplicates concurrent requests
//   4. Markdown rewriting  → relative URLs → absolute raw / Docsify routes
//   5. Sidebar pipeline    → fetch cascade with generation counter

// Node.js compatibility stubs (for unit testing; no-op in browsers)
if (typeof window === 'undefined') { globalThis.window = { $docsify: { plugins: [] } }; }
if (typeof document === 'undefined') { globalThis.document = { getElementById: () => null, querySelector: () => null, head: { appendChild() {} }, createElement: () => ({ dataset: {}, set textContent(v) {}, set innerHTML(v) {}, set id(v) {} }) }; }

(function () {
  'use strict';

  // ═══ HOST CONFIGURATIONS ═══════════════════════════════════════════
  // Each host: rawBase (browser-loaded assets), API URLs (CORS-safe JS fetch).
  // All methods receive the resolved repo root (e.g. 'user/repo').

  const HOSTS = {
    'github.com': {
      repoDepth: 2,
      rawBase:     (repo, ref = 'HEAD') => `https://raw.githubusercontent.com/${repo}/${ref}/`,
      readmeUrl:   (repo, sub, ref = 'HEAD') => {
        const dir = sub ? sub.replace(/\/?$/, '/') : '';
        return `https://raw.githubusercontent.com/${repo}/${ref}/${dir}README.md`;
      },
      fileUrl:     (repo, path, ref = 'HEAD') => `https://raw.githubusercontent.com/${repo}/${ref}/${path}`,
      sidebarUrls: (repo, ref = 'HEAD') => [`https://raw.githubusercontent.com/${repo}/${ref}/_sidebar.md`],
    },

    'gitlab.com': {
      repoDepth: null, // variable (subgroups)
      rawBase: (repo, ref = 'HEAD') => `https://gitlab.com/${repo}/-/raw/${ref}/`,
      _api(repo, file, ref = '') {
        const base = `https://gitlab.com/api/v4/projects/${encodeURIComponent(repo)}` +
                     `/repository/files/${encodeURIComponent(file)}/raw`;
        return ref && ref !== 'HEAD' ? `${base}?ref=${encodeURIComponent(ref)}` : base;
      },
      readmeUrl(repo, sub, ref = 'HEAD') {
        const file = sub ? sub.replace(/\/?$/, '/') + 'README.md' : 'README.md';
        return this._api(repo, file, ref);
      },
      fileUrl(repo, path, ref = 'HEAD') { return this._api(repo, path, ref); },
      sidebarUrls(repo, ref = 'HEAD') {
        const urls = [this._api(repo, '_sidebar.md', ref)];
        const group = repo.split('/')[0];
        const pages = `${group}/${group}.gitlab.io`;
        if (pages !== repo) urls.push(this._api(pages, '_sidebar.md')); // group pages always HEAD
        return urls;
      },
    },

    'codeberg.org': {
      repoDepth: 2,
      rawBase:  (repo) => `https://codeberg.org/api/v1/repos/${repo}/raw/`,
      _api(repo, path, ref = '') {
        const url = `https://codeberg.org/api/v1/repos/${repo}/raw/${path}`;
        return ref && ref !== 'HEAD' ? `${url}?ref=${encodeURIComponent(ref)}` : url;
      },
      readmeUrl(repo, sub, ref = 'HEAD') {
        const dir = sub ? sub.replace(/\/?$/, '/') : '';
        return this._api(repo, dir + 'README.md', ref);
      },
      fileUrl(repo, path, ref = 'HEAD') { return this._api(repo, path, ref); },
      sidebarUrls(repo, ref = 'HEAD') { return [this._api(repo, '_sidebar.md', ref)]; },
    },
  };

  // ═══ FETCH CACHE ═══════════════════════════════════════════════════
  // Caches the Promise (not the result) to deduplicate concurrent requests.

  const _CACHE_MAX = 200;
  const _cache = new Map();

  function cachedFetch(url) {
    if (_cache.has(url)) return _cache.get(url);
    // FIFO eviction when cache is full
    if (_cache.size >= _CACHE_MAX) _cache.delete(_cache.keys().next().value);
    const p = fetch(url).then(r => {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.text();
    });
    _cache.set(url, p);
    // Keep permanent client errors cached (4xx); retry transient errors (5xx, network)
    p.catch(e => {
      const m = e.message.match(/HTTP (\d+)/);
      const code = m ? parseInt(m[1]) : 0;
      if (code < 400 || code >= 500) _cache.delete(url);
    });
    return p;
  }

  // ═══ HOST LIST (for link detection) ═════════════════════════════════

  const KNOWN_HOSTS = Object.keys(HOSTS);

  // ═══ LINK REWRITING ════════════════════════════════════════════════
  // Rewrites repo links in page markdown:
  //   [label](https://github.com/owner/repo ':repo') → [label](/remote/github.com/owner/repo)
  //   [![img](src)](https://... ':repo')              → [![img](src)](/remote/...)
  // Docsify's markdown renderer converts /path links to #/path routes.

  // Text capture allows nested ![alt](src) (image-link pattern from gitrepos grid).
  const REPO_LINK_RE = /\[((?:[^\[\]]|\!?\[[^\]]*\](?:\([^)]*\))?)*)\]\(https?:\/\/([^)\s]+?)\s+(['"]):(repo)\3\)/g;

  function rewriteRepoLinks(md) {
    return md.replace(REPO_LINK_RE, function (_, text, urlPath, _q, _tag) {
      // urlPath = 'github.com/owner/repo' (protocol already stripped by regex)
      return `[${text}](/remote/${urlPath.replace(/\/+$/, '')})`;
    });
  }

  /** Collect the list of repo links from markdown for cross-project pagination. */
  function collectRepoLinks(md) {
    const list = [];
    REPO_LINK_RE.lastIndex = 0;
    let m;
    while ((m = REPO_LINK_RE.exec(md)) !== null) {
      let text = m[1];
      // Extract alt text from nested image: ![alt](src)
      const imgAlt = text.match(/^!\[([^\]]*)\]/);
      if (imgAlt) text = imgAlt[1];
      const urlPath = m[2].replace(/\/+$/, '');
      list.push({ text, href: '#/remote/' + urlPath });
    }
    return list;
  }

  // ═══ ROUTE PARSING — pure functions ════════════════════════════════

  /** Extract host + fullPath from a /remote/ route. */
  function parseRemoteRoute(path) {
    const m = path.match(/^\/remote\/([^/]+)\/(.+)$/);
    if (!m || !HOSTS[m[1]]) return null;
    return { host: m[1], fullPath: m[2].replace(/\/$/, '') };
  }

  // Remembers the last-resolved repo so sub-path links within the same
  // repo work even when the registry doesn't cover it (e.g. direct bookmarks).
  let _lastRepo = null;

  /** Split fullPath into {repo, sub} using host repoDepth or registry. */
  function splitRepoPath(host, fullPath) {
    const h = HOSTS[host];
    const segs = fullPath.split('/');

    // Fixed-depth hosts (GitHub, Codeberg) — deterministic, no ambiguity
    if (h.repoDepth != null) {
      if (segs.length > h.repoDepth) {
        const repo = segs.slice(0, h.repoDepth).join('/');
        _lastRepo = { host, repo };
        return { repo, sub: segs.slice(h.repoDepth).join('/') };
      }
      _lastRepo = { host, repo: fullPath };
      return { repo: fullPath, sub: '' };
    }

    // Variable-depth (GitLab): registry first for accuracy, then _lastRepo
    // as fallback for direct bookmarks when the registry hasn't been populated.
    const registry = window.__remoteRepoRegistry;
    if (registry) {
      const key = host + '/' + fullPath;
      let bestLen = 0;
      registry.forEach(entry => {
        if (entry.length > bestLen &&
            (key === entry || key.startsWith(entry + '/')))
          bestLen = entry.length;
      });
      if (bestLen > host.length + 1) {
        const cut = bestLen - host.length - 1;
        const repo = fullPath.slice(0, cut);
        _lastRepo = { host, repo };
        return { repo, sub: fullPath.slice(cut + 1) };
      }
    }

    // _lastRepo cache: resolves sub-paths of the same repo without registry
    if (_lastRepo && _lastRepo.host === host &&
        fullPath !== _lastRepo.repo &&
        fullPath.startsWith(_lastRepo.repo + '/')) {
      return { repo: _lastRepo.repo, sub: fullPath.slice(_lastRepo.repo.length + 1) };
    }

    _lastRepo = { host, repo: fullPath };
    return { repo: fullPath, sub: '' };
  }

  /** Get the configured content ref (branch/tag/commit). Defaults to 'HEAD'. */
  function _getRef() {
    return (window.$docsify && window.$docsify.remoteRepo && window.$docsify.remoteRepo.ref) || 'HEAD';
  }

  /** Build a context object with everything needed to fetch + rewrite. */
  function buildContext(host, repo, sub) {
    const h = HOSTS[host];
    const ref = _getRef();
    const rawBase = h.rawBase(repo, ref);
    const isFile  = /\.md$/i.test(sub);
    const maybeMd = !isFile && sub && !/\.\w+$/.test(sub);
    const dir     = isFile
      ? sub.replace(/[^/]*$/, '')
      : (sub ? sub.replace(/\/?$/, '/') : '');

    return {
      host, repo, sub: sub || '',
      ref,
      routePrefix: `/remote/${host}/${repo}`,
      rawBase,
      base:        rawBase + dir,
      readmeUrl:   isFile ? h.fileUrl(repo, sub, ref) : h.readmeUrl(repo, sub, ref),
      mdFileUrl:   maybeMd ? h.fileUrl(repo, sub + '.md', ref) : null,
    };
  }

  /**
   * Build a sidebar URL cascade: walk up from the current sub-path to
   * the repo root, then add host-specific fallbacks (e.g. group pages).
   * Mirrors native Docsify's directory walk-up for _sidebar.md.
   *
   *   sub = '01-deroulement/01' →
   *     repo/01-deroulement/01/_sidebar.md
   *     repo/01-deroulement/_sidebar.md
   *     repo/_sidebar.md            ← always included
   *     group-pages/_sidebar.md     ← host fallback
   */
  function buildSidebarCascade(host, repo, sub, ref = 'HEAD') {
    const h = HOSTS[host];
    const urls = [];
    // Walk up from sub-path directory to root
    if (sub) {
      // If sub points to a file, start from its parent directory
      const dir = /\.\w+$/.test(sub) ? sub.replace(/\/[^/]*$/, '') : sub;
      const parts = dir.split('/').filter(Boolean);
      for (let i = parts.length; i > 0; i--) {
        const prefix = parts.slice(0, i).join('/') + '/';
        urls.push(h.fileUrl(repo, prefix + '_sidebar.md', ref));
      }
    }
    // Root + host-specific fallbacks (group pages, etc.)
    for (const url of h.sidebarUrls(repo, ref)) {
      if (!urls.includes(url)) urls.push(url);
    }
    return urls;
  }

  // ═══ SUBMODULE SUPPORT ═══════════════════════════════════════════
  // Detects git submodules via .gitmodules, enabling:
  //   • Correct image/media URLs for submodule content
  //   • Automatic redirect when navigating to a submodule path

  const _submoduleCache = new Map();

  /** Parse a .gitmodules file into Map<subPath, {host, repoPath}>. */
  function parseGitmodules(text, host, repo) {
    const modules = new Map();
    const parentUrl = 'https://' + host + '/' + repo + '/';
    for (const block of text.split(/^\[submodule\s/m).slice(1)) {
      const pathM = block.match(/^\s*path\s*=\s*(.+?)\s*$/m);
      const urlM  = block.match(/^\s*url\s*=\s*(.+?)\s*$/m);
      if (!pathM || !urlM) continue;
      const subPath = pathM[1].replace(/^\/+|\/+$/g, '');
      let raw = urlM[1].replace(/\.git$/, '');
      // Convert SSH URLs: git@host:path → https://host/path
      raw = raw.replace(/^git@([^:]+):/, 'https://$1/');
      let resolved;
      try { resolved = new URL(raw, parentUrl).href; } catch (e) { continue; }
      const m = resolved.match(/^https?:\/\/([^/]+)\/(.+)$/);
      if (m && HOSTS[m[1]]) {
        modules.set(subPath, { host: m[1], repoPath: m[2].replace(/\/+$/, '') });
      }
    }
    return modules;
  }

  /** Check if a repo-relative path falls inside a submodule. */
  function resolveSubmodule(modules, relPath) {
    if (!modules || !modules.size) return null;
    const norm = relPath.replace(/^\.?\//, '');
    for (const [path, info] of modules) {
      if (norm === path || norm.startsWith(path + '/')) {
        return { host: info.host, repoPath: info.repoPath,
                 remaining: norm === path ? '' : norm.slice(path.length + 1) };
      }
    }
    return null;
  }

  /** Fetch and parse .gitmodules for a repo (cached). */
  function getSubmodules(host, repo, ref) {
    const r = ref || 'HEAD';
    const key = host + '/' + repo + (r !== 'HEAD' ? '@' + r : '');
    if (_submoduleCache.has(key)) return _submoduleCache.get(key);
    const p = cachedFetch(HOSTS[host].fileUrl(repo, '.gitmodules', r))
      .then(function (text) {
        const mods = parseGitmodules(text, host, repo);
        // Register submodule repos for future splitRepoPath resolution
        const reg = window.__remoteRepoRegistry;
        if (reg) mods.forEach(function (v) { reg.add(v.host + '/' + v.repoPath); });
        return mods;
      })
      .catch(function () { return new Map(); });
    _submoduleCache.set(key, p);
    return p;
  }

  // ═══ MARKDOWN REWRITING ════════════════════════════════════════════
  // Rewrites relative URLs in fetched markdown:
  //   • Images / media  → absolute raw-content URLs
  //   • Navigable links → Docsify #/remote/ routes
  //   • Non-navigable   → absolute raw-content URLs

  /** Resolve a navigable href (markdown link or directory) to a Docsify route. */
  function resolveNavHref(cleaned, fragment, routePrefix, currentRoute) {
    const slug = cleaned.replace(/(^|\/)README\.md$/i, '$1').replace(/\/$/, '');
    const suffix = fragment ? '?id=' + fragment : '';
    if (cleaned.charAt(0) === '/') {
      const abs = slug.replace(/^\/+/, '');
      return `${routePrefix}${abs ? '/' + abs : ''}${suffix}`;
    }
    try {
      return new URL(slug || '.', 'https://x' + currentRoute + '/').pathname.replace(/\/$/, '') + suffix;
    } catch (e) {
      return `${currentRoute}/${slug}${suffix}`;
    }
  }

  // ═══ FRONTMATTER PARSING ═══════════════════════════════════════════
  // Remote markdown may begin with a YAML frontmatter block.  Docsify's
  // own front-matter plugin fires BEFORE the remote plugin (beforeEach
  // order), so it only ever sees the placeholder — not the real content.
  // We parse and strip the block ourselves so it doesn't render as text,
  // and override vm.frontmatter so downstream plugins (e.g. docsify-pdf-link)
  // work correctly on remote pages.

  /**
   * Parse a YAML-style frontmatter block from markdown.
   * Handles simple `key: value` lines only (no nested structures).
   * Returns { fm: Object|null, body: String }.
   */
  function parseFrontmatter(md) {
    const m = md.match(/^---\r?\n([\s\S]*?)\r?\n---[ \t]*\r?\n?/);
    if (!m) return { fm: null, body: md };
    const fm = {};
    for (const line of m[1].split('\n')) {
      const kv = line.match(/^([^:#][^:]*?):\s*(.*)$/);
      if (kv) fm[kv[1].trim()] = kv[2].trim();
    }
    return { fm, body: md.slice(m[0].length) };
  }

  function rewriteMarkdown(md, ctx, submodules) {
    const { base, rawBase, routePrefix, sub } = ctx;
    // Current route for relative link resolution
    const currentRoute = sub ? `${routePrefix}/${sub}` : routePrefix;
    // Repo-relative directory for submodule path checks
    const dir = sub
      ? (/\.\w+$/.test(sub) ? sub.replace(/[^/]*$/, '') : sub.replace(/\/?$/, '/'))
      : '';

    // ── Protect fenced code blocks and inline code from rewriting ─────
    // Extract them into placeholders, run all rewrite passes, then restore.
    const codeBlocks = [];
    // Fenced code blocks: ```...``` or ~~~...~~~
    md = md.replace(/^(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\1\s*$/gm, m => {
      codeBlocks.push(m);
      return `\x00CODE${codeBlocks.length - 1}\x00`;
    });
    // Inline code: `...` (non-greedy, single line)
    md = md.replace(/`[^`\n]+`/g, m => {
      codeBlocks.push(m);
      return `\x00CODE${codeBlocks.length - 1}\x00`;
    });

    // ── Nested image-links: [![alt](img)](href) ──────────────────────
    // Must run before separate image/link passes to handle atomically.
    md = md.replace(
      /\[!\[([^\]]*)\]\((?![a-zA-Z][a-zA-Z0-9+.-]*:|#|\\)([^)]+)\)\]\((?![a-zA-Z][a-zA-Z0-9+.-]*:|#|\\)([^)]+)\)/g,
      (_, alt, imgSrc, linkHref) => {
        // Rewrite image src → absolute raw URL (submodule-aware)
        const normImg = imgSrc.replace(/^\.?\//, '');
        const smImg = submodules && imgSrc.charAt(0) !== '/' && resolveSubmodule(submodules, dir + normImg);
        const absImg = smImg
          ? HOSTS[smImg.host].rawBase(smImg.repoPath) + smImg.remaining
          : (imgSrc.charAt(0) === '/' ? rawBase + imgSrc.slice(1) : base + normImg);
        // Rewrite link href → Docsify route or raw URL
        const cleaned = linkHref.replace(/[?].*$/, '').replace(/#.*$/, '');
        const isNav   = !cleaned || /\.md$/i.test(cleaned) ||
                        /\/$/.test(cleaned) || !/\.\w+$/.test(cleaned);
        let absHref;
        if (isNav) {
          const cleanNorm = cleaned.replace(/^\.?\//, '');
          const smLink = submodules && cleaned.charAt(0) !== '/' && resolveSubmodule(submodules, dir + cleanNorm);
          absHref = smLink
            ? `/remote/${smLink.host}/${smLink.repoPath}${smLink.remaining ? '/' + smLink.remaining : ''}`
            : resolveNavHref(cleaned, '', routePrefix, currentRoute);
        } else {
          const normLink = linkHref.replace(/^\.?\//, '');
          absHref = linkHref.charAt(0) === '/' ? rawBase + linkHref.slice(1) : base + normLink;
        }
        return `[![${alt}](${absImg})](${absHref})`;
      }
    );

    // UNC paths: [text](\\host\share) → file: URI
    md = md.replace(
      /\[([^\]]*)\]\(\\\\([^)]+)\)/g,
      (_, t, p) => `[${t}](file://${p.replace(/\\/g, '/')})`
    );

    // Images: ![alt](relative) → absolute raw URL (submodule-aware)
    md = md.replace(
      /!\[([^\]]*)\]\((?![a-zA-Z][a-zA-Z0-9+.-]*:|#|\\)([^)]+)\)/g,
      (_, alt, src) => {
        const norm = src.replace(/^\.?\//, '');
        const sm = submodules && src.charAt(0) !== '/' && resolveSubmodule(submodules, dir + norm);
        if (sm) return `![${alt}](${HOSTS[sm.host].rawBase(sm.repoPath)}${sm.remaining})`;
        const abs = src.charAt(0) === '/' ? rawBase + src.slice(1) : base + norm;
        return `![${alt}](${abs})`;
      }
    );

    // Links: [text](href) → route or raw URL
    md = md.replace(
      /\[([^\]]*)\]\((?![a-zA-Z][a-zA-Z0-9+.-]*:|#|\\)([^)]+)\)/g,
      (_, text, href) => {
        const hashIdx  = href.indexOf('#');
        const pathPart = hashIdx >= 0 ? href.slice(0, hashIdx) : href;
        const fragment = hashIdx >= 0 ? href.slice(hashIdx + 1) : '';
        const cleaned  = pathPart.replace(/[?].*$/, '');
        const isNav    = !cleaned || /\.md$/i.test(cleaned) ||
                         /\/$/.test(cleaned) || !/\.\w+$/.test(cleaned);

        if (isNav) {
          const cleanNorm = cleaned.replace(/^\.?\//, '');
          const sm = submodules && pathPart.charAt(0) !== '/' && resolveSubmodule(submodules, dir + cleanNorm);
          if (sm) {
            const smRoute = `/remote/${sm.host}/${sm.repoPath}${sm.remaining ? '/' + sm.remaining : ''}`;
            const suffix = fragment ? '?id=' + fragment : '';
            return `[${text}](${smRoute}${suffix})`;
          }
          return `[${text}](${resolveNavHref(cleaned, fragment, routePrefix, currentRoute)})`;
        }

        // Non-navigable file → absolute raw URL
        if (pathPart.charAt(0) === '/') {
          return `[${text}](${rawBase}${pathPart.slice(1)}${fragment ? '#' + fragment : ''})`;
        }
        const normHref = href.replace(/^\.?\//, '');
        return `[${text}](${base}${normHref})`;
      }
    );

    // HTML media tags: src/data attributes (submodule-aware)
    md = md.replace(
      /(<(?:img|source|video|audio|object|iframe|embed)\b[^>]*?\b(?:src|data)=["'])(?![a-zA-Z][a-zA-Z0-9+.-]*:|#|\\)([^"']+)(["'])/gi,
      (_, pre, url, q) => {
        const norm = url.replace(/^\.?\//, '');
        const sm = submodules && url.charAt(0) !== '/' && resolveSubmodule(submodules, dir + norm);
        if (sm) return pre + HOSTS[sm.host].rawBase(sm.repoPath) + sm.remaining + q;
        const abs = url.charAt(0) === '/' ? rawBase + url.slice(1) : base + norm;
        return pre + abs + q;
      }
    );

    // <object data="…svg"> → <img>  (CSP frame-ancestors workaround)
    md = md.replace(
      /<object\b([^>]*?)\bdata=(["'])([^"']*\.svg)\2([^>]*)>[\s\S]*?<\/object>/gi,
      (_, before, q, src, after) => {
        const attrs = (before + after).replace(/\btype\s*=\s*["'][^"']*["']/gi, '').trim();
        return `<img src=${q}${src}${q}${attrs ? ' ' + attrs : ''}>`;
      }
    );

    // ── Restore protected code blocks ────────────────────────────────
    md = md.replace(/\x00CODE(\d+)\x00/g, (_, i) => codeBlocks[i]);

    return md;
  }

  // ═══ SIDEBAR ═══════════════════════════════════════════════════════

  /** Escape HTML special characters to prevent XSS when inserting into innerHTML. */
  function escapeHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
             .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  let _sidebarGen = 0;        // generation counter (discards stale fetches)
  let _lastLocal  = '#/';     // last non-remote route for back link
  let _lastMd     = '';       // last fetched markdown (TOC fallback source)
  let _pendingSidebar = null;  // {ctx, routePath} for doneEach sidebar injection
  let _repoList = [];          // [{text, href}] from last gitrepos page (cross-project nav)

  function parseSidebarEntries(md) {
    const entries = [];
    for (const line of md.split('\n')) {
      const m = line.match(/^(\s*)[-*]\s*\[([^\]]+)\]\(([^)]+)\)/);
      if (m) entries.push({ indent: m[1].length, text: m[2], href: m[3] });
    }
    return entries;
  }

  function resolveEntryHref(href, host, repo, absRoot) {
    if (/^https?:\/\//.test(href)) return href;
    if (/^#/.test(href)) return `#/remote/${host}/${repo}${href}`;

    const clean = href.replace(/(^|\/)README\.md$/i, '$1').trim().replace(/\/$/, '');
    if (clean.charAt(0) === '/') {
      return `#/remote/${host}/${absRoot || repo}${clean}`;
    }
    try {
      const resolved = new URL(clean, `https://x/${host}/${repo}/`).pathname.slice(1);
      return `#/remote/${resolved}`.replace(/\/$/, '');
    } catch (e) {
      return `#/remote/${host}/${repo}${clean ? '/' + clean : ''}`;
    }
  }

  function buildSidebarTree(entries, host, repo, absRoot) {
    if (!entries.length) return '';
    const indents = [...new Set(entries.map(e => e.indent))].sort((a, b) => a - b);
    let html = '', prev = 0, started = false;

    for (const e of entries) {
      const lvl  = indents.indexOf(e.indent);
      const href = resolveEntryHref(e.href, host, repo, absRoot);

      if (!started) started = true;
      else if (lvl > prev) { for (let k = 0; k < lvl - prev; k++) html += '<ul>'; }
      else if (lvl < prev) { html += '</li>'; for (let k = 0; k < prev - lvl; k++) html += '</ul></li>'; }
      else html += '</li>';

      const safeText = escapeHtml(e.text.replace(/<!--[\s\S]*?-->/g, '').trim());
      html += `<li><a href="${href}">${safeText}</a>`;
      prev = lvl;
    }
    if (started) { html += '</li>'; for (let k = 0; k < prev; k++) html += '</ul></li>'; }
    return html;
  }

  function buildTocHtml(md, routePath) {
    if (!md) return '';
    let html = '';
    const lines = md.split('\n');
    for (let i = 0; i < lines.length; i++) {
      let level = 0, text = '';
      const m = lines[i].match(/^(#{2,3})\s+(.+)/);
      if (m) { level = m[1].length; text = m[2].replace(/\s+#+\s*$/, '').trim(); }
      if (!level && i + 1 < lines.length && /^-{2,}\s*$/.test(lines[i + 1]) && lines[i].trim()) {
        level = 2; text = lines[i].trim();
      }
      if (!level) continue;

      const slug = text.toLowerCase()
        .replace(/<[^>]+>/g, '').replace(/[^\p{L}\p{N}\s-]/gu, '')
        .replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
      const displayText = escapeHtml(text.replace(/<[^>]+>/g, ''));
      const cls = level === 3 ? ' class="rn-h3"' : '';
      html += `<li${cls}><a href="#${routePath}?id=${slug}">${displayText}</a></li>`;
    }
    return html;
  }

  // ─── Sidebar: CSS + DOM ────────────────────────────────────────────

  function injectStyles() {
    if (document.getElementById('docsify-remote-repo-style')) return;
    const s = document.createElement('style');
    s.id = 'docsify-remote-repo-style';
    s.textContent =
      '#remote-nav-inject{margin-bottom:1.2em;padding-bottom:.8em;' +
        'border-bottom:1px solid var(--border-color,rgba(139,138,203,.14))}' +
      '#remote-nav-inject ul{list-style:none;padding-left:0;margin:0}' +
      '#remote-nav-inject ul ul{padding-left:1em}' +
      '#remote-nav-inject li{padding:.15em 0}' +
      '#remote-nav-inject .rn-back{display:flex;align-items:center;gap:.35em}' +
      '#remote-nav-inject .rn-back>a{opacity:.5;font-size:.85em}' +
      '#remote-nav-inject .rn-back>a:hover{opacity:1}' +
      '#remote-nav-inject .rn-repo a{font-weight:600;color:var(--theme-color,inherit)}' +
      '#remote-nav-inject .rn-repo-icons{display:inline-flex;align-items:center;gap:.2em;margin-left:auto}' +
      '#remote-nav-inject .rn-repo-icons a{display:inline-flex;opacity:.4;transition:opacity .15s}' +
      '#remote-nav-inject .rn-repo-icons a:hover{opacity:.85}' +
      '#remote-nav-inject .rn-repo-icons svg{width:.85em;height:.85em}' +
      '#remote-nav-inject li.active>a{font-weight:600;color:var(--theme-color,inherit)}' +
      '#remote-nav-inject li.active-parent>a{opacity:.85}' +
      '#remote-nav-inject .rn-toc-divider{border-top:1px solid var(--border-color,rgba(139,138,203,.14));' +
        'margin:.6em 0;padding:0;font-size:0;line-height:0}' +
      '#remote-nav-inject .rn-h3{padding-left:1em}';
    document.head.appendChild(s);
  }

  function setSidebar(html, path) {
    const sidebar = document.querySelector('.sidebar-nav') ||
                    document.querySelector('.sidebar ul');
    if (!sidebar) return;
    const old = document.getElementById('remote-nav-inject');
    if (old) old.remove();
    const el = document.createElement('div');
    el.id = 'remote-nav-inject';
    el.dataset.path = path;
    el.innerHTML = '<ul>' + html + '</ul>';
    sidebar.insertBefore(el, sidebar.firstChild);
    // Mark folders for sidebar-collapse plugin compatibility
    el.querySelectorAll('li').forEach(li => {
      if (li.querySelector('ul')) li.classList.add('folder');
    });
    markActive(el, path);
  }

  /** Mark the sidebar entry matching the current route as active,
   *  and its ancestor <li> elements as active-parent. */
  function markActive(container, routePath) {
    const target = ('#' + routePath).replace(/\/$/, '');
    let matched = null;
    for (const a of container.querySelectorAll('a[href]')) {
      // Exact match or match ignoring trailing ?id= fragment and trailing slash
      const href = a.getAttribute('href').replace(/\?id=.*$/, '').replace(/\/$/, '');
      if (href === target) { matched = a; break; }
    }
    if (!matched) return;
    // Mark the <li> containing the matched link
    const li = matched.closest('li');
    if (li) {
      li.classList.add('active');
      // Add 'open' for sidebar-collapse plugin compatibility
      li.classList.add('open');
    }
    // Walk up and mark ancestor <li> elements
    let parent = li && li.parentElement;
    while (parent && container.contains(parent)) {
      if (parent.tagName === 'LI') {
        parent.classList.add('active-parent');
        parent.classList.add('open');
      }
      parent = parent.parentElement;
    }
  }

  function clearSidebar() {
    const el = document.getElementById('remote-nav-inject');
    if (el) el.remove();
  }

  // ─── Pagination: fill prev/next from sidebar entries ───────────────

  /** Pure data logic: find prev/next pagination entries, including cross-project. */
  function findPrevNext(entries, host, repo, absRoot, routePath, crossChapter, repoList) {
    const resolved = entries.map(e => ({
      text: e.text.replace(/<!--[\s\S]*?-->/g, '').trim(),
      href: resolveEntryHref(e.href, host, repo, absRoot),
    }));

    const target = ('#' + routePath).replace(/\/$/, '');
    const idx = resolved.findIndex(e =>
      e.href.replace(/\?id=.*$/, '').replace(/\/$/, '') === target);

    let prev = idx > 0 ? resolved[idx - 1] : null;
    let next = idx < 0
      ? (resolved.length ? resolved[0] : null)
      : (idx < resolved.length - 1 ? resolved[idx + 1] : null);

    if (crossChapter && repoList.length > 1) {
      const repoRoute = ('#/remote/' + host + '/' + repo).replace(/\/$/, '');
      const ri = repoList.findIndex(r => r.href.replace(/\/$/, '') === repoRoute);
      if (ri >= 0) {
        if (!prev && ri > 0) prev = repoList[ri - 1];
        if (!next && ri < repoList.length - 1) next = repoList[ri + 1];
      }
    }

    return { prev, next };
  }

  function fillPagination(entries, host, repo, absRoot, routePath) {
    const container = document.querySelector('.docsify-pagination-container');
    if (!container) return;

    const cfg = (window.$docsify && window.$docsify.pagination) || {};
    const { prev, next } = findPrevNext(entries, host, repo, absRoot, routePath, cfg.crossChapter, _repoList);

    const arrow = (dir, label) => dir === 'prev'
      ? `<svg width="10" height="16" viewBox="0 0 10 16" xmlns="http://www.w3.org/2000/svg"><polyline fill="none" vector-effect="non-scaling-stroke" points="8,2 2,8 8,14"/></svg><span>${label}</span>`
      : `<span>${label}</span><svg width="10" height="16" viewBox="0 0 10 16" xmlns="http://www.w3.org/2000/svg"><polyline fill="none" vector-effect="non-scaling-stroke" points="2,2 8,8 2,14"/></svg>`;

    let html = '';
    if (prev) {
      html += `<div class="pagination-item pagination-item--previous"><a href="${prev.href}">` +
        `<div class="pagination-item-label">${arrow('prev', cfg.previousText || '\u2190')}</div>` +
        `<div class="pagination-item-title">${prev.text}</div></a></div>`;
    }
    if (next) {
      html += `<div class="pagination-item pagination-item--next"><a href="${next.href}">` +
        `<div class="pagination-item-label">${arrow('next', cfg.nextText || '\u2192')}</div>` +
        `<div class="pagination-item-title">${next.text}</div></a></div>`;
    }
    container.innerHTML = html;
  }

  // ─── Sidebar: full pipeline ────────────────────────────────────────

  function runSidebarPipeline(ctx, routePath) {
    const { host, repo, sub } = ctx;
    const sidebarUrls = buildSidebarCascade(host, repo, sub, ctx.ref);
    const repoName  = repo.split('/').pop() || repo;
    const backHref  = _lastLocal || '#/';
    const backLabel = backHref.replace(/^#\//, '').replace(/\/$/, '').split('/').pop() || 'home';

    // SVG icons (Feather-style, matching gitrepos)
    const iconRepo = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" ' +
      'stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' +
      '<line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/>' +
      '<circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/></svg>';
    const iconSite = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" ' +
      'stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>' +
      '<polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>';

    // Build icon links
    const siteUrl = window.__remoteRepoSites && window.__remoteRepoSites.get(host + '/' + repo);
    let icons = `<a href="https://${host}/${repo}" target="_blank" rel="noopener" ` +
      `title="Source repository" aria-label="Source repository">${iconRepo}</a>`;
    if (siteUrl) {
      icons += `<a href="${siteUrl}" target="_blank" rel="noopener" ` +
        `title="Website" aria-label="Website">${iconSite}</a>`;
    }

    const header =
      `<li class="rn-back"><a href="${backHref}">\u2190 ${backLabel}</a>` +
      `<span class="rn-repo-icons">${icons}</span></li>` +
      `<li class="rn-repo"><a href="#/remote/${host}/${repo}">${repoName}</a></li>`;

    // Count how many URLs are sub-directory sidebars (before root + fallbacks)
    const h = HOSTS[host];
    const rootUrls = h.sidebarUrls(repo);
    const rootStart = sidebarUrls.indexOf(rootUrls[0]);

    const gen = ++_sidebarGen;

    function tryUrl(i) {
      if (gen !== _sidebarGen) return; // stale — a newer navigation won
      if (i >= sidebarUrls.length) {
        // All sidebar URLs exhausted — fall back to heading TOC
        injectStyles();
        setSidebar(header + buildTocHtml(_lastMd, routePath), routePath);
        // No sidebar entries, but cross-project links may still apply
        fillPagination([], host, repo, repo, routePath);
        return;
      }
      cachedFetch(sidebarUrls[i])
        .then(md => {
          if (gen !== _sidebarGen) return;
          const entries = parseSidebarEntries(md);
          // Determine absRoot for href resolution:
          //   sub-dir / repo-root sidebar → repo-relative
          //   group fallback → group-relative
          const isGroupFallback = rootStart >= 0 && i > rootStart;
          const absRoot = isGroupFallback ? repo.split('/')[0] : repo;
          const tree = buildSidebarTree(entries, host, repo, absRoot);
          // Append page heading TOC below sidebar tree
          const toc = buildTocHtml(_lastMd, routePath);
          const tocSection = toc ? '<li class="rn-toc-divider"></li>' + toc : '';
          injectStyles();
          setSidebar(header + tree + tocSection, routePath);
          fillPagination(entries, host, repo, absRoot, routePath);
        })
        .catch(() => tryUrl(i + 1));
    }
    tryUrl(0);
  }

  // ═══ INTERNAL PLACEHOLDER ══════════════════════════════════════════
  const PLACEHOLDER = '<!-- docsify-remote-repo-placeholder -->';

  // ═══ PLUGIN ════════════════════════════════════════════════════════

  function plugin(hook, vm) {

    hook.beforeEach(function (content, next) {
      const path = (vm.route && vm.route.path) || '';

      // Local route — rewrite :repo links, capture list, track back-link
      if (!path.startsWith('/remote/')) {
        // Capture repo links for cross-project pagination
        const links = collectRepoLinks(content);
        if (links.length > 0) {
          _repoList = links;
          // Only track back-link from pages that actually list repos
          if (path && path !== '/') _lastLocal = '#' + path;
        }
        _lastMd = '';
        window.__remoteLastMd = '';
        window.__remoteLastPath = '';
        _pendingSidebar = null;
        next(rewriteRepoLinks(content));
        return;
      }

      // Only intercept the placeholder content.
      // Docsify 5 fires beforeEach for sidebar, navbar, AND content.
      if (!content.includes(PLACEHOLDER)) {
        next(content);
        return;
      }

      const parsed = parseRemoteRoute(path);
      if (!parsed) {
        next(`# Remote README\n\n> Cannot resolve \`${path.slice('/remote/'.length)}\``);
        return;
      }

      const { repo, sub } = splitRepoPath(parsed.host, parsed.fullPath);
      const ctx = buildContext(parsed.host, repo, sub);

      // Fetch .gitmodules in parallel for submodule-aware rewriting
      const submodulesP = getSubmodules(parsed.host, repo, ctx.ref);

      // --- Render helpers ---

      function render(md, baseOverride) {
        // Parse + strip YAML frontmatter from the remote markdown.
        // Docsify's front-matter plugin already ran (on the placeholder) so we
        // must handle it here to (a) prevent raw YAML from rendering as text and
        // (b) make vm.frontmatter available to downstream plugins (pdf-link, etc.).
        const { fm, body } = parseFrontmatter(md);
        if (fm) {
          // Merge into vm.frontmatter; resolve relative paths to absolute raw URLs.
          const base = baseOverride || ctx.base;
          if (fm.pdf && !fm.pdf.startsWith('http') && !fm.pdf.startsWith('/')) {
            fm.pdf = base + fm.pdf;
          }
          vm.frontmatter = Object.assign({}, vm.frontmatter || {}, fm);
        }
        const useMd = fm ? body : md;
        _lastMd = useMd;
        window.__remoteLastMd = useMd;
        window.__remoteLastPath = path;
        const rc = baseOverride ? Object.assign({}, ctx, { base: baseOverride }) : ctx;
        _pendingSidebar = { ctx, routePath: path };
        submodulesP.then(function (sm) { next(rewriteMarkdown(useMd, rc, sm)); });
      }

      function showError(url, err) {
        _lastMd = '';
        _pendingSidebar = { ctx, routePath: path };
        const errStr = String(err);
        const isAuth = /40[13]/.test(errStr);
        const hint = isAuth
          ? '\n> \u26a0\ufe0f This repository may be private or require authentication.\n'
          : '';
        next(
          `# Could not load README\n\n` +
          `> **Source:** \`${url}\`\n` +
          `> **Error:** ${errStr}${hint}\n\n` +
          `[Open repository](https://${parsed.host}/${parsed.fullPath})`
        );
      }

      // --- Path cascade: for variable-depth hosts (GitLab) on direct reload ---
      // When the registry is empty (fresh load / bookmark), splitRepoPath treats the
      // entire route as the repo and gets a 404.  Walk backwards from the second-to-last
      // segment down to the minimum 2-segment boundary, trying each as a repo root.
      // The first successful fetch wins; the repo boundary is cached for this session.
      function tryPathCascade(err0) {
        const h = HOSTS[parsed.host];
        // Only for variable-depth hosts where the full path was treated as repo
        if (h.repoDepth != null || parsed.fullPath.split('/').length <= 2) {
          showError(ctx.readmeUrl, err0);
          return;
        }
        const segs = parsed.fullPath.split('/');
        // Build candidates: longest repo prefix first (most specific → least)
        const candidates = [];
        for (let i = segs.length - 1; i >= 2; i--) {
          candidates.push({ repo: segs.slice(0, i).join('/'), sub: segs.slice(i).join('/') });
        }
        function tryCandidate(i) {
          if (i >= candidates.length) { showError(ctx.readmeUrl, err0); return; }
          const { repo: r, sub: s } = candidates[i];
          const nc = buildContext(parsed.host, r, s);
          const pri = nc.mdFileUrl || nc.readmeUrl;
          const fb  = nc.mdFileUrl ? nc.readmeUrl : null;
          function doRender(md, useRawBase) {
            // Register the resolved boundary for the rest of this session
            if (window.__remoteRepoRegistry) window.__remoteRepoRegistry.add(parsed.host + '/' + r);
            _lastRepo = { host: parsed.host, repo: r };
            _lastMd = md;
            window.__remoteLastMd = md;
            window.__remoteLastPath = path;
            const rc = useRawBase ? Object.assign({}, nc, { base: nc.rawBase }) : nc;
            _pendingSidebar = { ctx: nc, routePath: path };
            getSubmodules(parsed.host, r, nc.ref).then(sm => { next(rewriteMarkdown(md, rc, sm)); });
          }
          cachedFetch(pri)
            .then(md => doRender(md, !!nc.mdFileUrl))
            .catch(() => {
              if (fb) {
                cachedFetch(fb).then(md => doRender(md, false)).catch(() => tryCandidate(i + 1));
              } else {
                tryCandidate(i + 1);
              }
            });
        }
        tryCandidate(0);
      }

      function trySubmoduleRedirect(url, err) {
        if (!ctx.sub) { tryPathCascade(err); return; }
        submodulesP.then(function (modules) {
          var match = resolveSubmodule(modules, ctx.sub);
          if (match) {
            var route = '#/remote/' + match.host + '/' + match.repoPath +
                        (match.remaining ? '/' + match.remaining : '');
            _pendingSidebar = null;
            next('');
            setTimeout(function () { window.location.hash = route; }, 0);
          } else {
            showError(url, err);
          }
        });
      }

      // --- Fetch: try .md file first (Docsify strips .md), fall back to dir ---

      const primary  = ctx.mdFileUrl || ctx.readmeUrl;
      const fallback = ctx.mdFileUrl ? ctx.readmeUrl : null;

      cachedFetch(primary)
        .then(md => render(md, ctx.mdFileUrl ? ctx.rawBase : null))
        .catch(err => {
          if (fallback) {
            cachedFetch(fallback)
              .then(md => render(md, null))
              .catch(err2 => trySubmoduleRedirect(primary, err2));
          } else {
            trySubmoduleRedirect(primary, err);
          }
        });
    });

    hook.doneEach(function () {
      const path = (vm.route && vm.route.path) || '';
      if (!path.startsWith('/remote/')) {
        clearSidebar();
        return;
      }
      // Inject remote sidebar after Docsify finishes rendering
      if (_pendingSidebar) {
        runSidebarPipeline(_pendingSidebar.ctx, _pendingSidebar.routePath);
        _pendingSidebar = null;
      }
    });
  }

  // ═══ BROWSER REGISTRATION ═══════════════════════════════════════════
  // Self-register Docsify aliases synchronously at load time (before Docsify
  // starts) so no manual alias config or _remote.md placeholder file is needed.
  // Prepend remote-specific aliases before any existing ones so they match first.
  window.$docsify = window.$docsify || {};
  const _existing = window.$docsify.alias || {};
  window.$docsify.alias = Object.assign({
    '/remote/.*/_sidebar\\.md': '/_sidebar.md',
    '/remote/.*/_navbar\\.md':  '/_navbar.md',
    '/remote/.*': 'data:text/plain,' + encodeURIComponent(PLACEHOLDER),
  }, _existing);
  window.$docsify.plugins = (window.$docsify.plugins || []).concat(plugin);

  // ═══ BROWSER API (for companion plugins) ════════════════════════════
  // Expose internals needed by docsify-remote-search.js
  window.__remoteRepoAPI = {
    HOSTS: HOSTS,
    cachedFetch: cachedFetch,
    parseSidebarEntries: parseSidebarEntries,
    resolveEntryHref: resolveEntryHref,
    parseRemoteRoute: parseRemoteRoute,
    splitRepoPath: splitRepoPath,
    buildSidebarCascade: buildSidebarCascade,
    getRef: _getRef,
  };

  // ═══ NODE.JS TEST EXPORT ═══════════════════════════════════════════
  // Exposes pure functions for unit testing; no-op in browsers.
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      HOSTS,
      KNOWN_HOSTS,
      rewriteRepoLinks,
      collectRepoLinks,
      parseRemoteRoute,
      splitRepoPath,
      buildContext,
      buildSidebarCascade,
      resolveNavHref,
      parseGitmodules,
      resolveSubmodule,
      rewriteMarkdown,
      parseSidebarEntries,
      resolveEntryHref,
      findPrevNext,
      buildSidebarTree,
      buildTocHtml,
      cachedFetch,
      getSubmodules,
      escapeHtml,
      _getRef,
      parseFrontmatter,
      _resetLastRepo() { _lastRepo = null; },
    };
  }
}());
