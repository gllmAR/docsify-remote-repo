#!/usr/bin/env node
// Unit tests for docsify-remote-repo.js (v4)
// Run:  node docsify-remote-repo.test.js

'use strict';
const assert = require('node:assert/strict');
const {
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
  escapeHtml,
  cachedFetch,
  getSubmodules,
  _getRef,
  parseFrontmatter,
  _resetLastRepo,
} = require('./docsify-remote-repo.js');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    _resetLastRepo();
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    console.log(`  ✗ ${name}`);
    console.log(`    ${e.message}`);
  }
}

// ═══════════════════════════════════════════════════════════════════
console.log('\n── rewriteRepoLinks ──');

test('rewrites :repo single-quoted link', () => {
  const md = "Check [wam](https://gitlab.com/sr-expo/venues/2026/wam ':repo') for details.";
  assert.equal(rewriteRepoLinks(md), "Check [wam](/remote/gitlab.com/sr-expo/venues/2026/wam) for details.");
});

test('rewrites :repo double-quoted link', () => {
  const md = '[my-lib](https://github.com/owner/repo ":repo")';
  assert.equal(rewriteRepoLinks(md), '[my-lib](/remote/github.com/owner/repo)');
});

test('strips trailing slash from URL', () => {
  const md = "[repo](https://codeberg.org/user/proj/ ':repo')";
  assert.equal(rewriteRepoLinks(md), '[repo](/remote/codeberg.org/user/proj)');
});

test('leaves links without :repo untouched', () => {
  const md = '[normal](https://github.com/owner/repo)';
  assert.equal(rewriteRepoLinks(md), md);
});

test('leaves links with other titles untouched', () => {
  const md = "[click](https://github.com/owner/repo 'my tooltip')";
  assert.equal(rewriteRepoLinks(md), md);
});

test('rewrites multiple :repo links in same content', () => {
  const md = "- [a](https://github.com/x/a ':repo')\n- [b](https://gitlab.com/y/b ':repo')";
  const expected = "- [a](/remote/github.com/x/a)\n- [b](/remote/gitlab.com/y/b)";
  assert.equal(rewriteRepoLinks(md), expected);
});

test('works in heading context (gitrepos output)', () => {
  const md = "## [wam](https://gitlab.com/sr-expo/venues/2026/wam ':repo')";
  assert.equal(rewriteRepoLinks(md), '## [wam](/remote/gitlab.com/sr-expo/venues/2026/wam)');
});

test('rewrites nested image-link (gitrepos grid)', () => {
  const md = "* [![obs-lua](https://codeberg.org/gllm/obs-lua/raw/HEAD/_cover.jpg)](https://codeberg.org/gllm/obs-lua ':repo')";
  assert.equal(rewriteRepoLinks(md),
    '* [![obs-lua](https://codeberg.org/gllm/obs-lua/raw/HEAD/_cover.jpg)](/remote/codeberg.org/gllm/obs-lua)');
});

test('KNOWN_HOSTS matches HOSTS keys', () => {
  assert.deepEqual(KNOWN_HOSTS, Object.keys(HOSTS));
});

// ═══════════════════════════════════════════════════════════════════
console.log('\n── collectRepoLinks ──');

test('collects repo links from markdown', () => {
  const md = "- [a](https://github.com/x/a ':repo')\n- [b](https://gitlab.com/y/b ':repo')";
  assert.deepEqual(collectRepoLinks(md), [
    { text: 'a', href: '#/remote/github.com/x/a' },
    { text: 'b', href: '#/remote/gitlab.com/y/b' },
  ]);
});

test('returns empty for no :repo links', () => {
  assert.deepEqual(collectRepoLinks('[normal](https://github.com/foo/bar)'), []);
});

test('strips trailing slash from collected links', () => {
  const md = "[r](https://codeberg.org/u/p/ ':repo')";
  assert.deepEqual(collectRepoLinks(md), [
    { text: 'r', href: '#/remote/codeberg.org/u/p' },
  ]);
});

test('extracts alt text from nested image-link', () => {
  const md = "* [![my-repo](https://example.com/_cover.jpg)](https://github.com/x/my-repo ':repo')";
  assert.deepEqual(collectRepoLinks(md), [
    { text: 'my-repo', href: '#/remote/github.com/x/my-repo' },
  ]);
});

test('collects mixed plain and image-link :repo items', () => {
  const md = "* [plain](https://github.com/x/a ':repo')\n" +
    "* [![img](https://example.com/_cover.jpg)](https://github.com/x/b ':repo')";
  assert.deepEqual(collectRepoLinks(md), [
    { text: 'plain', href: '#/remote/github.com/x/a' },
    { text: 'img', href: '#/remote/github.com/x/b' },
  ]);
});

// ═══════════════════════════════════════════════════════════════════
console.log('\n── parseRemoteRoute ──');

test('parses github route', () => {
  const r = parseRemoteRoute('/remote/github.com/user/repo');
  assert.deepEqual(r, { host: 'github.com', fullPath: 'user/repo' });
});

test('parses gitlab route with subgroups', () => {
  const r = parseRemoteRoute('/remote/gitlab.com/group/sub/proj');
  assert.deepEqual(r, { host: 'gitlab.com', fullPath: 'group/sub/proj' });
});

test('parses codeberg route', () => {
  const r = parseRemoteRoute('/remote/codeberg.org/user/repo');
  assert.deepEqual(r, { host: 'codeberg.org', fullPath: 'user/repo' });
});

test('strips trailing slash', () => {
  const r = parseRemoteRoute('/remote/github.com/user/repo/');
  assert.equal(r.fullPath, 'user/repo');
});

test('returns null for unknown host', () => {
  assert.equal(parseRemoteRoute('/remote/unknown.com/x/y'), null);
});

test('returns null for non-remote path', () => {
  assert.equal(parseRemoteRoute('/git/github/'), null);
});

test('returns null for missing path after host', () => {
  assert.equal(parseRemoteRoute('/remote/github.com/'), null);
});

// ═══════════════════════════════════════════════════════════════════
console.log('\n── splitRepoPath ──');

test('github: splits at depth 2', () => {
  const { repo, sub } = splitRepoPath('github.com', 'user/repo/sub/dir');
  assert.equal(repo, 'user/repo');
  assert.equal(sub, 'sub/dir');
});

test('github: no sub-path', () => {
  const { repo, sub } = splitRepoPath('github.com', 'user/repo');
  assert.equal(repo, 'user/repo');
  assert.equal(sub, '');
});

test('codeberg: splits at depth 2', () => {
  const { repo, sub } = splitRepoPath('codeberg.org', 'gllm/myrepo/docs/page');
  assert.equal(repo, 'gllm/myrepo');
  assert.equal(sub, 'docs/page');
});

test('gitlab: uses fullPath when no registry', () => {
  // No registry set — treat entire path as repo
  delete window.__remoteRepoRegistry;
  const { repo, sub } = splitRepoPath('gitlab.com', 'group/sub/proj');
  assert.equal(repo, 'group/sub/proj');
  assert.equal(sub, '');
});

test('gitlab: uses registry to find repo boundary', () => {
  window.__remoteRepoRegistry = new Set([
    'gitlab.com/group/sub/proj',
  ]);
  const { repo, sub } = splitRepoPath('gitlab.com', 'group/sub/proj/docs/page');
  assert.equal(repo, 'group/sub/proj');
  assert.equal(sub, 'docs/page');
  delete window.__remoteRepoRegistry;
});

test('gitlab: registry picks longest match', () => {
  window.__remoteRepoRegistry = new Set([
    'gitlab.com/group',
    'gitlab.com/group/sub/proj',
  ]);
  const { repo, sub } = splitRepoPath('gitlab.com', 'group/sub/proj/readme');
  assert.equal(repo, 'group/sub/proj');
  assert.equal(sub, 'readme');
  delete window.__remoteRepoRegistry;
});

test('remembers last repo for sub-nav', () => {
  // First visit sets _lastRepo
  splitRepoPath('github.com', 'user/repo/docs');
  // Second visit reuses cached prefix
  const { repo, sub } = splitRepoPath('github.com', 'user/repo/other/path');
  assert.equal(repo, 'user/repo');
  assert.equal(sub, 'other/path');
});

// ═══════════════════════════════════════════════════════════════════
console.log('\n── HOSTS URL builders ──');

test('github rawBase', () => {
  assert.equal(HOSTS['github.com'].rawBase('user/repo'),
    'https://raw.githubusercontent.com/user/repo/HEAD/');
});

test('github readmeUrl root', () => {
  assert.equal(HOSTS['github.com'].readmeUrl('user/repo', ''),
    'https://raw.githubusercontent.com/user/repo/HEAD/README.md');
});

test('github readmeUrl sub-dir', () => {
  assert.equal(HOSTS['github.com'].readmeUrl('user/repo', 'docs'),
    'https://raw.githubusercontent.com/user/repo/HEAD/docs/README.md');
});

test('github fileUrl', () => {
  assert.equal(HOSTS['github.com'].fileUrl('user/repo', 'img/logo.png'),
    'https://raw.githubusercontent.com/user/repo/HEAD/img/logo.png');
});

test('gitlab rawBase', () => {
  assert.equal(HOSTS['gitlab.com'].rawBase('group/proj'),
    'https://gitlab.com/group/proj/-/raw/HEAD/');
});

test('gitlab readmeUrl uses API', () => {
  const url = HOSTS['gitlab.com'].readmeUrl('group/proj', '');
  assert.ok(url.includes('/api/v4/projects/'));
  assert.ok(url.includes('README.md'));
});

test('gitlab sidebarUrls includes group fallback', () => {
  const urls = HOSTS['gitlab.com'].sidebarUrls('mygroup/myrepo');
  assert.equal(urls.length, 2);
  assert.ok(urls[1].includes('mygroup%2Fmygroup.gitlab.io'));
});

test('gitlab sidebarUrls no duplicate for pages repo', () => {
  const urls = HOSTS['gitlab.com'].sidebarUrls('mygroup/mygroup.gitlab.io');
  assert.equal(urls.length, 1);
});

test('codeberg rawBase uses API', () => {
  assert.equal(HOSTS['codeberg.org'].rawBase('gllm/repo'),
    'https://codeberg.org/api/v1/repos/gllm/repo/raw/');
});

test('codeberg readmeUrl', () => {
  assert.equal(HOSTS['codeberg.org'].readmeUrl('gllm/repo', ''),
    'https://codeberg.org/api/v1/repos/gllm/repo/raw/README.md');
});

// ═══════════════════════════════════════════════════════════════════
console.log('\n── buildContext ──');

test('root context', () => {
  const ctx = buildContext('github.com', 'user/repo', '');
  assert.equal(ctx.routePrefix, '/remote/github.com/user/repo');
  assert.equal(ctx.sub, '');
  assert.ok(ctx.readmeUrl.endsWith('README.md'));
  assert.equal(ctx.mdFileUrl, null);
});

test('sub-dir context', () => {
  const ctx = buildContext('github.com', 'user/repo', 'docs/guide');
  assert.equal(ctx.sub, 'docs/guide');
  assert.ok(ctx.base.endsWith('docs/guide/'));
  assert.ok(ctx.readmeUrl.includes('docs/guide/README.md'));
  // 'docs/guide' has no extension → maybeMd → mdFileUrl set
  assert.ok(ctx.mdFileUrl.includes('docs/guide.md'));
});

test('.md file context', () => {
  const ctx = buildContext('github.com', 'user/repo', 'docs/page.md');
  assert.ok(ctx.readmeUrl.includes('docs/page.md'));
  assert.equal(ctx.mdFileUrl, null);
  assert.ok(ctx.base.endsWith('docs/'));
});

// ═══════════════════════════════════════════════════════════════════
console.log('\n── buildSidebarCascade ──');

test('root: only root + fallbacks', () => {
  const urls = buildSidebarCascade('github.com', 'user/repo', '');
  assert.equal(urls.length, 1); // just root _sidebar.md
  assert.ok(urls[0].includes('_sidebar.md'));
});

test('sub-dir: walks up then root', () => {
  const urls = buildSidebarCascade('github.com', 'user/repo', 'a/b/c');
  // a/b/c/_sidebar, a/b/_sidebar, a/_sidebar, root _sidebar
  assert.equal(urls.length, 4);
  assert.ok(urls[0].includes('a/b/c/_sidebar.md'));
  assert.ok(urls[1].includes('a/b/_sidebar.md'));
  assert.ok(urls[2].includes('a/_sidebar.md'));
  assert.ok(urls[3].includes('user/repo/HEAD/_sidebar.md'));
});

test('gitlab sub-dir: includes group fallback at end', () => {
  const urls = buildSidebarCascade('gitlab.com', 'group/proj', 'docs');
  // docs/_sidebar, root _sidebar (API), group fallback
  assert.equal(urls.length, 3);
  assert.ok(urls[0].includes('docs'));
  assert.ok(urls[2].includes('gitlab.io'));
});

test('.md file sub: starts from parent dir', () => {
  const urls = buildSidebarCascade('github.com', 'user/repo', 'docs/page.md');
  // docs/ has an extension matched by the /[^/]*$/ strip
  // so we get docs/_sidebar.md then root
  assert.ok(urls.length >= 2);
  assert.ok(urls[0].includes('docs/_sidebar.md'));
});

test('no duplicate root URL', () => {
  const urls = buildSidebarCascade('github.com', 'user/repo', 'sub');
  const rootUrl = HOSTS['github.com'].sidebarUrls('user/repo')[0];
  assert.equal(urls.filter(u => u === rootUrl).length, 1);
});

// ═══════════════════════════════════════════════════════════════════
console.log('\n── rewriteMarkdown ──');

function mkCtx(overrides) {
  return Object.assign({
    host: 'github.com',
    repo: 'user/repo',
    sub: '',
    routePrefix: '/remote/github.com/user/repo',
    rawBase: 'https://raw.githubusercontent.com/user/repo/HEAD/',
    base: 'https://raw.githubusercontent.com/user/repo/HEAD/',
  }, overrides);
}

test('images: relative → absolute raw', () => {
  const md = rewriteMarkdown('![logo](img/logo.png)', mkCtx());
  assert.ok(md.includes('https://raw.githubusercontent.com/user/repo/HEAD/img/logo.png'));
});

test('images: absolute → raw from root', () => {
  const md = rewriteMarkdown('![x](/assets/pic.jpg)', mkCtx({
    base: 'https://raw.githubusercontent.com/user/repo/HEAD/docs/',
  }));
  assert.ok(md.includes('https://raw.githubusercontent.com/user/repo/HEAD/assets/pic.jpg'));
});

test('images: already absolute URL untouched', () => {
  const md = rewriteMarkdown('![x](https://example.com/pic.png)', mkCtx());
  assert.ok(md.includes('https://example.com/pic.png'));
});

test('links: relative .md → docsify route', () => {
  const md = rewriteMarkdown('[Guide](guide.md)', mkCtx());
  // Should produce a route, not a raw URL
  assert.ok(md.includes('/remote/'));
  assert.ok(!md.includes('raw.githubusercontent'));
});

test('links: relative dir → docsify route', () => {
  const md = rewriteMarkdown('[Docs](docs/)', mkCtx());
  assert.ok(md.includes('/remote/github.com/user/repo/docs'));
});

test('links: absolute path → repo-relative route', () => {
  const md = rewriteMarkdown('[Home](/)', mkCtx());
  assert.ok(md.includes('/remote/github.com/user/repo'));
});

test('links: README.md stripped from route', () => {
  const md = rewriteMarkdown('[Read](sub/README.md)', mkCtx());
  assert.ok(!md.includes('README.md'));
  assert.ok(md.includes('/remote/github.com/user/repo/sub'));
});

test('links: fragment → ?id= param', () => {
  const md = rewriteMarkdown('[Section](page#heading)', mkCtx());
  assert.ok(md.includes('?id=heading'));
});

test('links: non-navigable file → raw URL', () => {
  const md = rewriteMarkdown('[PDF](docs/file.pdf)', mkCtx());
  assert.ok(md.includes('raw.githubusercontent.com'));
  assert.ok(md.includes('file.pdf'));
});

test('links: external URL untouched', () => {
  const md = rewriteMarkdown('[Go](https://example.com/page)', mkCtx());
  assert.equal(md, '[Go](https://example.com/page)');
});

test('UNC paths → file: URI', () => {
  const md = rewriteMarkdown('[Share](\\\\server\\share\\dir)', mkCtx());
  assert.ok(md.includes('file://'));
  assert.ok(md.includes('server/share/dir'));
});

test('HTML img src rewritten', () => {
  const md = rewriteMarkdown('<img src="photo.jpg">', mkCtx());
  assert.ok(md.includes('raw.githubusercontent.com'));
});

test('SVG object → img', () => {
  const md = rewriteMarkdown('<object data="logo.svg" type="image/svg+xml"></object>', mkCtx());
  assert.ok(md.includes('<img'));
  assert.ok(!md.includes('<object'));
  assert.ok(!md.includes('type='));
});

test('sub-path context: relative links resolve correctly', () => {
  const ctx = mkCtx({
    sub: 'docs/guide',
    base: 'https://raw.githubusercontent.com/user/repo/HEAD/docs/guide/',
  });
  const md = rewriteMarkdown('[Sibling](../other)', ctx);
  assert.ok(md.includes('/remote/github.com/user/repo/docs/other'));
});

test('sub-path context: images resolve from sub-dir base', () => {
  const ctx = mkCtx({
    sub: 'docs',
    base: 'https://raw.githubusercontent.com/user/repo/HEAD/docs/',
  });
  const md = rewriteMarkdown('![img](screenshot.png)', ctx);
  assert.ok(md.includes('docs/screenshot.png'));
});

// ── Code fence / inline code protection ──

test('fenced code block: image not rewritten', () => {
  const md = rewriteMarkdown('```markdown\n![Mon Image](./medias/mon-image.jpg)\n```', mkCtx());
  assert.ok(md.includes('![Mon Image](./medias/mon-image.jpg)'));
  assert.ok(!md.includes('raw.githubusercontent'));
});

test('fenced code block: link not rewritten', () => {
  const md = rewriteMarkdown('```md\n[Guide](./guide/)\n```', mkCtx());
  assert.ok(md.includes('[Guide](./guide/)'));
});

test('fenced code block with tildes', () => {
  const md = rewriteMarkdown('~~~\n![x](./img.png)\n~~~', mkCtx());
  assert.ok(md.includes('![x](./img.png)'));
});

test('inline code: image not rewritten', () => {
  const md = rewriteMarkdown('Use `![alt](./path.png)` syntax', mkCtx());
  assert.ok(md.includes('`![alt](./path.png)`'));
});

test('inline code: link not rewritten', () => {
  const md = rewriteMarkdown('Type `[text](url)` to link', mkCtx());
  assert.ok(md.includes('`[text](url)`'));
});

test('real image outside code fence still rewritten', () => {
  const md = rewriteMarkdown('```\ncode\n```\n\n![real](img.png)\n\n```\nmore code\n```', mkCtx());
  // The real image should be rewritten
  assert.ok(md.includes('raw.githubusercontent.com'));
  assert.ok(md.includes('img.png'));
});

test('HTML inside fenced code not rewritten', () => {
  const md = rewriteMarkdown('```html\n<img src="photo.jpg">\n```', mkCtx());
  assert.ok(md.includes('<img src="photo.jpg">'));
});

// ── Nested image-links ──

test('nested image-link: both img and href rewritten', () => {
  const md = rewriteMarkdown(
    '[![Cover](./modules/fx/_cover.png)](./modules/fx/)',
    mkCtx()
  );
  // Image src → absolute raw URL
  assert.ok(md.includes('raw.githubusercontent.com/user/repo/HEAD/modules/fx/_cover.png'));
  // Outer link → docsify route (dir, so navigable)
  assert.ok(md.includes('/remote/github.com/user/repo/modules/fx'));
  // Should not contain the original relative paths
  assert.ok(!md.includes('(./modules/fx/_cover.png)'));
  assert.ok(!md.includes('](./modules/fx/)'));
});

test('nested image-link: absolute img path', () => {
  const md = rewriteMarkdown(
    '[![Logo](/img/logo.png)](/about/)',
    mkCtx()
  );
  assert.ok(md.includes('raw.githubusercontent.com/user/repo/HEAD/img/logo.png'));
  assert.ok(md.includes('/remote/github.com/user/repo/about'));
});

test('nested image-link: external URLs untouched', () => {
  const md = rewriteMarkdown(
    '[![Badge](https://img.shields.io/badge.svg)](https://example.com)',
    mkCtx()
  );
  assert.ok(md.includes('https://img.shields.io/badge.svg'));
  assert.ok(md.includes('https://example.com'));
});

test('nested image-link: non-navigable file href → raw URL', () => {
  const md = rewriteMarkdown(
    '[![Preview](./thumb.png)](./doc/schema.pdf)',
    mkCtx()
  );
  // PDF → non-navigable → should become raw URL
  assert.ok(md.includes('raw.githubusercontent.com'));
  assert.ok(md.includes('schema.pdf'));
});

test('nested image-link: in sub-path context', () => {
  const ctx = mkCtx({
    sub: 'docs',
    base: 'https://raw.githubusercontent.com/user/repo/HEAD/docs/',
  });
  const md = rewriteMarkdown('[![X](./img.png)](./sub/)', ctx);
  assert.ok(md.includes('docs/img.png'));
  assert.ok(md.includes('/remote/github.com/user/repo/docs/sub'));
});

// ═══════════════════════════════════════════════════════════════════
console.log('\n── parseSidebarEntries ──');

test('parses basic sidebar', () => {
  const entries = parseSidebarEntries(
    '* [Home](/)\n* [Guide](/guide/)\n  * [Intro](/guide/intro)\n'
  );
  assert.equal(entries.length, 3);
  assert.equal(entries[0].text, 'Home');
  assert.equal(entries[0].indent, 0);
  assert.equal(entries[2].indent, 2);
});

test('handles dash and star bullets', () => {
  const entries = parseSidebarEntries('- [A](a)\n* [B](b)\n');
  assert.equal(entries.length, 2);
});

test('skips non-link lines', () => {
  const entries = parseSidebarEntries('# Title\n* [A](a)\nPlain text\n');
  assert.equal(entries.length, 1);
});

test('parses 3-level nesting', () => {
  const md = [
    '* [L1](/l1/)',
    '  * [L2](/l1/l2/)',
    '    * [L3](/l1/l2/l3/)',
  ].join('\n');
  const entries = parseSidebarEntries(md);
  assert.equal(entries.length, 3);
  assert.equal(entries[0].indent, 0);
  assert.equal(entries[1].indent, 2);
  assert.equal(entries[2].indent, 4);
});

test('parses 5-level nesting with HTML comments in text', () => {
  const md = [
    '* [Savoirs](/03-savoirs/)',
    '  * [Scène interactive](/03-savoirs/01/)',
    '    * [Logiciels](/03-savoirs/01/03-logiciels/)',
    '      * [Moteurs de jeu](/03-savoirs/01/03-logiciels/02-moteurs-de-jeu/)',
    '        * [Godot](/03-savoirs/01/03-logiciels/02-moteurs-de-jeu/godot/)',
  ].join('\n');
  const entries = parseSidebarEntries(md);
  assert.equal(entries.length, 5);
  assert.deepEqual(
    entries.map(e => e.indent),
    [0, 2, 4, 6, 8]
  );
  assert.equal(entries[4].text, 'Godot');
  assert.equal(entries[4].href, '/03-savoirs/01/03-logiciels/02-moteurs-de-jeu/godot/');
});

test('HTML comments in link text are preserved (rendered invisible)', () => {
  const md = '* [S1 : <!-- %: S1 -->2025-08-22<!-- %; -->](/01-deroulement/01/)\n';
  const entries = parseSidebarEntries(md);
  assert.equal(entries.length, 1);
  assert.ok(entries[0].text.includes('S1 :'));
  assert.ok(entries[0].text.includes('2025-08-22'));
  assert.equal(entries[0].href, '/01-deroulement/01/');
});

test('5-level tree produces balanced HTML', () => {
  const entries = [
    { indent: 0, text: 'L1', href: '/1' },
    { indent: 2, text: 'L2', href: '/2' },
    { indent: 4, text: 'L3', href: '/3' },
    { indent: 6, text: 'L4', href: '/4' },
    { indent: 8, text: 'L5', href: '/5' },
    { indent: 0, text: 'Other', href: '/o' },
  ];
  const html = buildSidebarTree(entries, 'github.com', 'u/r', 'u/r');
  const opens  = (html.match(/<ul>/g) || []).length;
  const closes = (html.match(/<\/ul>/g) || []).length;
  assert.equal(opens, closes, `<ul> mismatch: ${opens} vs ${closes}`);
  const liOpens  = (html.match(/<li>/g) || []).length;
  const liCloses = (html.match(/<\/li>/g) || []).length;
  assert.equal(liOpens, liCloses, `<li> mismatch: ${liOpens} vs ${liCloses}`);
  assert.equal(liOpens, 6);
  // Should have 4 nested <ul> levels
  assert.equal(opens, 4);
});

test('tree + TOC assembly', () => {
  const entries = [
    { indent: 0, text: 'Home', href: '/' },
    { indent: 0, text: 'Guide', href: '/guide' },
  ];
  const tree = buildSidebarTree(entries, 'github.com', 'u/r', 'u/r');
  const toc = buildTocHtml('## Overview\n### Details\n', '/remote/github.com/u/r');
  const tocSection = toc ? '<li class="rn-toc-divider"></li>' + toc : '';
  const combined = tree + tocSection;
  // Tree items present
  assert.ok(combined.includes('>Home</a>'));
  assert.ok(combined.includes('>Guide</a>'));
  // TOC divider present
  assert.ok(combined.includes('rn-toc-divider'));
  // TOC headings present
  assert.ok(combined.includes('Overview'));
  assert.ok(combined.includes('Details'));
});

// ═══════════════════════════════════════════════════════════════════
console.log('\n── resolveEntryHref ──');

test('absolute URL unchanged', () => {
  assert.equal(
    resolveEntryHref('https://example.com', 'github.com', 'u/r', 'u/r'),
    'https://example.com'
  );
});

test('hash anchor → repo route + hash', () => {
  const href = resolveEntryHref('#section', 'github.com', 'u/r', 'u/r');
  assert.equal(href, '#/remote/github.com/u/r#section');
});

test('absolute path → uses absRoot', () => {
  const href = resolveEntryHref('/docs/page', 'github.com', 'user/repo', 'user/repo');
  assert.equal(href, '#/remote/github.com/user/repo/docs/page');
});

test('absolute path with group absRoot', () => {
  const href = resolveEntryHref('/docs', 'gitlab.com', 'group/sub/proj', 'group');
  assert.equal(href, '#/remote/gitlab.com/group/docs');
});

test('relative path → resolved from repo', () => {
  const href = resolveEntryHref('sub/page', 'github.com', 'u/r', 'u/r');
  assert.ok(href.includes('#/remote/'));
  assert.ok(href.includes('sub/page'));
});

test('README.md stripped', () => {
  const href = resolveEntryHref('/docs/README.md', 'github.com', 'u/r', 'u/r');
  assert.ok(!href.includes('README.md'));
  assert.ok(href.includes('/docs'));
});

// ═══════════════════════════════════════════════════════════════════
console.log('\n── buildSidebarTree ──');

test('empty entries → empty string', () => {
  assert.equal(buildSidebarTree([], 'github.com', 'u/r', 'u/r'), '');
});

test('flat list', () => {
  const entries = [
    { indent: 0, text: 'A', href: '/a' },
    { indent: 0, text: 'B', href: '/b' },
  ];
  const html = buildSidebarTree(entries, 'github.com', 'u/r', 'u/r');
  assert.ok(html.includes('<li><a'));
  assert.ok(html.includes('>A</a>'));
  assert.ok(html.includes('>B</a>'));
  assert.ok(!html.includes('<ul>')); // no nesting
});

test('nested list produces <ul>', () => {
  const entries = [
    { indent: 0, text: 'Parent', href: '/p' },
    { indent: 2, text: 'Child',  href: '/p/c' },
  ];
  const html = buildSidebarTree(entries, 'github.com', 'u/r', 'u/r');
  assert.ok(html.includes('<ul>'));
  assert.ok(html.includes('Parent'));
  assert.ok(html.includes('Child'));
});

test('3-level nesting correct tag balance', () => {
  const entries = [
    { indent: 0, text: 'L1', href: '/1' },
    { indent: 2, text: 'L2', href: '/2' },
    { indent: 4, text: 'L3', href: '/3' },
    { indent: 0, text: 'Back', href: '/b' },
  ];
  const html = buildSidebarTree(entries, 'github.com', 'u/r', 'u/r');
  const opens  = (html.match(/<ul>/g) || []).length;
  const closes = (html.match(/<\/ul>/g) || []).length;
  assert.equal(opens, closes, `<ul> open/close mismatch: ${opens} vs ${closes}`);
  const liOpens  = (html.match(/<li>/g) || []).length;
  const liCloses = (html.match(/<\/li>/g) || []).length;
  assert.equal(liOpens, liCloses, `<li> open/close mismatch: ${liOpens} vs ${liCloses}`);
});

// ═══════════════════════════════════════════════════════════════════
console.log('\n── resolveNavHref ──');

test('absolute path → repo-relative route', () => {
  const href = resolveNavHref('/docs/page', '', '/remote/github.com/u/r', '/remote/github.com/u/r');
  assert.equal(href, '/remote/github.com/u/r/docs/page');
});

test('absolute README.md stripped', () => {
  const href = resolveNavHref('/sub/README.md', '', '/remote/github.com/u/r', '/remote/github.com/u/r');
  assert.equal(href, '/remote/github.com/u/r/sub');
});

test('relative path → resolved against current route', () => {
  const href = resolveNavHref('sibling', '', '/remote/github.com/u/r', '/remote/github.com/u/r/docs');
  assert.equal(href, '/remote/github.com/u/r/docs/sibling');
});

test('relative ../other resolved', () => {
  const href = resolveNavHref('../other', '', '/remote/github.com/u/r', '/remote/github.com/u/r/docs/guide');
  assert.equal(href, '/remote/github.com/u/r/docs/other');
});

test('with fragment → ?id= suffix', () => {
  const href = resolveNavHref('page', 'section', '/remote/github.com/u/r', '/remote/github.com/u/r');
  assert.ok(href.includes('?id=section'));
});

test('trailing slash stripped from route', () => {
  const href = resolveNavHref('docs/', '', '/remote/github.com/u/r', '/remote/github.com/u/r');
  assert.ok(!href.endsWith('/'));
});

test('root / → routePrefix only', () => {
  const href = resolveNavHref('/', '', '/remote/github.com/u/r', '/remote/github.com/u/r');
  assert.equal(href, '/remote/github.com/u/r');
});

// ═══════════════════════════════════════════════════════════════════
console.log('\n── findPrevNext ──');

test('middle entry → prev and next', () => {
  const entries = [
    { indent: 0, text: 'A', href: '/a' },
    { indent: 0, text: 'B', href: '/b' },
    { indent: 0, text: 'C', href: '/c' },
  ];
  const { prev, next } = findPrevNext(entries, 'github.com', 'u/r', 'u/r',
    '/remote/github.com/u/r/b', false, []);
  assert.equal(prev.text, 'A');
  assert.equal(next.text, 'C');
});

test('first entry → no prev, has next', () => {
  const entries = [
    { indent: 0, text: 'A', href: '/a' },
    { indent: 0, text: 'B', href: '/b' },
  ];
  const { prev, next } = findPrevNext(entries, 'github.com', 'u/r', 'u/r',
    '/remote/github.com/u/r/a', false, []);
  assert.equal(prev, null);
  assert.equal(next.text, 'B');
});

test('last entry → has prev, no next', () => {
  const entries = [
    { indent: 0, text: 'A', href: '/a' },
    { indent: 0, text: 'B', href: '/b' },
  ];
  const { prev, next } = findPrevNext(entries, 'github.com', 'u/r', 'u/r',
    '/remote/github.com/u/r/b', false, []);
  assert.equal(prev.text, 'A');
  assert.equal(next, null);
});

test('route not found → next is first entry', () => {
  const entries = [
    { indent: 0, text: 'A', href: '/a' },
    { indent: 0, text: 'B', href: '/b' },
  ];
  const { prev, next } = findPrevNext(entries, 'github.com', 'u/r', 'u/r',
    '/remote/github.com/u/r', false, []);
  assert.equal(prev, null);
  assert.equal(next.text, 'A');
});

test('cross-project: at first entry → prev from repo list', () => {
  const entries = [{ indent: 0, text: 'Page', href: '/page' }];
  const repoList = [
    { text: 'Repo A', href: '#/remote/github.com/x/a' },
    { text: 'Repo B', href: '#/remote/github.com/u/r' },
  ];
  const { prev } = findPrevNext(entries, 'github.com', 'u/r', 'u/r',
    '/remote/github.com/u/r/page', true, repoList);
  assert.equal(prev.text, 'Repo A');
});

test('cross-project: at last entry → next from repo list', () => {
  const entries = [{ indent: 0, text: 'Page', href: '/page' }];
  const repoList = [
    { text: 'Repo B', href: '#/remote/github.com/u/r' },
    { text: 'Repo C', href: '#/remote/github.com/x/c' },
  ];
  const { next } = findPrevNext(entries, 'github.com', 'u/r', 'u/r',
    '/remote/github.com/u/r/page', true, repoList);
  assert.equal(next.text, 'Repo C');
});

test('cross-project disabled → no cross-repo links', () => {
  const entries = [{ indent: 0, text: 'Page', href: '/page' }];
  const repoList = [
    { text: 'Repo A', href: '#/remote/github.com/x/a' },
    { text: 'Repo B', href: '#/remote/github.com/u/r' },
    { text: 'Repo C', href: '#/remote/github.com/x/c' },
  ];
  const { prev, next } = findPrevNext(entries, 'github.com', 'u/r', 'u/r',
    '/remote/github.com/u/r/page', false, repoList);
  assert.equal(prev, null);
  assert.equal(next, null);
});

test('HTML comments stripped from pagination text', () => {
  const entries = [
    { indent: 0, text: 'S1 : <!-- date -->2025', href: '/s1' },
    { indent: 0, text: 'S2', href: '/s2' },
  ];
  const { prev } = findPrevNext(entries, 'github.com', 'u/r', 'u/r',
    '/remote/github.com/u/r/s2', false, []);
  assert.equal(prev.text, 'S1 : 2025');
});

// ═══════════════════════════════════════════════════════════════════
console.log('\n── parseGitmodules ──');

test('parses HTTPS submodule entries', () => {
  const text = [
    '[submodule "art/thing"]',
    '\tpath = art/thing',
    '\turl = https://gitlab.com/group/art-thing.git',
    '[submodule "tools/docsh"]',
    '\tpath = tools/docsh',
    '\turl = https://gitlab.com/org/tools/docsh',
  ].join('\n');
  const m = parseGitmodules(text, 'gitlab.com', 'org/proj');
  assert.equal(m.size, 2);
  assert.deepEqual(m.get('art/thing'), { host: 'gitlab.com', repoPath: 'group/art-thing' });
  assert.deepEqual(m.get('tools/docsh'), { host: 'gitlab.com', repoPath: 'org/tools/docsh' });
});

test('strips .git suffix', () => {
  const text = '[submodule "x"]\n\tpath = x\n\turl = https://github.com/o/r.git\n';
  const m = parseGitmodules(text, 'github.com', 'o/parent');
  assert.equal(m.get('x').repoPath, 'o/r');
});

test('handles SSH URLs', () => {
  const text = '[submodule "x"]\n\tpath = x\n\turl = git@github.com:owner/repo.git\n';
  const m = parseGitmodules(text, 'github.com', 'owner/parent');
  assert.equal(m.get('x').host, 'github.com');
  assert.equal(m.get('x').repoPath, 'owner/repo');
});

test('handles relative URLs', () => {
  const text = '[submodule "sub"]\n\tpath = sub\n\turl = ../sibling\n';
  const m = parseGitmodules(text, 'gitlab.com', 'group/parent');
  assert.equal(m.get('sub').repoPath, 'group/sibling');
});

test('skips entries with missing path or url', () => {
  const text = '[submodule "a"]\n\tpath = a\n[submodule "b"]\n\turl = https://x.com/o/r\n';
  const m = parseGitmodules(text, 'github.com', 'o/p');
  assert.equal(m.size, 0);
});

test('skips entries for unknown hosts', () => {
  const text = '[submodule "x"]\n\tpath = x\n\turl = https://bitbucket.org/o/r\n';
  const m = parseGitmodules(text, 'github.com', 'o/p');
  assert.equal(m.size, 0);
});

// ═══════════════════════════════════════════════════════════════════
console.log('\n── resolveSubmodule ──');

test('exact match', () => {
  const mods = new Map([['art/thing', { host: 'gitlab.com', repoPath: 'g/art-thing' }]]);
  const r = resolveSubmodule(mods, 'art/thing');
  assert.equal(r.host, 'gitlab.com');
  assert.equal(r.repoPath, 'g/art-thing');
  assert.equal(r.remaining, '');
});

test('sub-path within submodule', () => {
  const mods = new Map([['art/thing', { host: 'gitlab.com', repoPath: 'g/art-thing' }]]);
  const r = resolveSubmodule(mods, 'art/thing/docs/page');
  assert.equal(r.remaining, 'docs/page');
});

test('no match', () => {
  const mods = new Map([['art/thing', { host: 'gitlab.com', repoPath: 'g/art-thing' }]]);
  assert.equal(resolveSubmodule(mods, 'other/path'), null);
});

test('null/empty modules', () => {
  assert.equal(resolveSubmodule(null, 'anything'), null);
  assert.equal(resolveSubmodule(new Map(), 'anything'), null);
});

test('strips leading ./ from relPath', () => {
  const mods = new Map([['sub', { host: 'github.com', repoPath: 'o/r' }]]);
  const r = resolveSubmodule(mods, './sub/file.jpg');
  assert.equal(r.remaining, 'file.jpg');
});

// ═══════════════════════════════════════════════════════════════════
console.log('\n── rewriteMarkdown with submodules ──');

test('image in submodule → submodule rawBase', () => {
  const ctx = mkCtx({ sub: '1_artworks', base: 'https://raw.githubusercontent.com/user/repo/HEAD/1_artworks/' });
  const subs = new Map([['1_artworks/inflo', { host: 'github.com', repoPath: 'other/inflo' }]]);
  const md = rewriteMarkdown('![cover](inflo/_cover.jpg)', ctx, subs);
  assert.ok(md.includes('https://raw.githubusercontent.com/other/inflo/HEAD/_cover.jpg'));
  assert.ok(!md.includes('user/repo'));
});

test('image not in submodule → normal raw URL', () => {
  const ctx = mkCtx({ sub: '1_artworks', base: 'https://raw.githubusercontent.com/user/repo/HEAD/1_artworks/' });
  const subs = new Map([['1_artworks/inflo', { host: 'github.com', repoPath: 'other/inflo' }]]);
  const md = rewriteMarkdown('![x](local.jpg)', ctx, subs);
  assert.ok(md.includes('1_artworks/local.jpg'));
});

test('link to submodule dir → submodule route', () => {
  const ctx = mkCtx({ sub: '1_artworks', base: 'https://raw.githubusercontent.com/user/repo/HEAD/1_artworks/' });
  const subs = new Map([['1_artworks/inflo', { host: 'github.com', repoPath: 'other/inflo' }]]);
  const md = rewriteMarkdown('[Inflo](inflo/)', ctx, subs);
  assert.ok(md.includes('/remote/github.com/other/inflo'));
  assert.ok(!md.includes('user/repo'));
});

test('nested image-link: both img and href use submodule', () => {
  const ctx = mkCtx({ sub: '1_artworks', base: 'https://raw.githubusercontent.com/user/repo/HEAD/1_artworks/' });
  const subs = new Map([['1_artworks/inflo', { host: 'github.com', repoPath: 'other/inflo' }]]);
  const md = rewriteMarkdown('[![Cover](inflo/_cover.png)](inflo/)', ctx, subs);
  assert.ok(md.includes('other/inflo/HEAD/_cover.png'), 'image should use submodule rawBase');
  assert.ok(md.includes('/remote/github.com/other/inflo'), 'link should use submodule route');
});

test('HTML img in submodule → submodule rawBase', () => {
  const ctx = mkCtx({ sub: '1_artworks', base: 'https://raw.githubusercontent.com/user/repo/HEAD/1_artworks/' });
  const subs = new Map([['1_artworks/inflo', { host: 'github.com', repoPath: 'other/inflo' }]]);
  const md = rewriteMarkdown('<img src="inflo/photo.jpg">', ctx, subs);
  assert.ok(md.includes('other/inflo/HEAD/photo.jpg'));
});

test('no submodules → unchanged behavior', () => {
  const ctx = mkCtx();
  const md1 = rewriteMarkdown('![x](img.png)', ctx);
  const md2 = rewriteMarkdown('![x](img.png)', ctx, null);
  const md3 = rewriteMarkdown('![x](img.png)', ctx, new Map());
  assert.equal(md1, md2);
  assert.equal(md1, md3);
});

test('HTML comments stripped from pagination text', () => {
  const entries = [
    { indent: 0, text: 'S1 : <!-- date -->2025', href: '/s1' },
    { indent: 0, text: 'S2', href: '/s2' },
  ];
  const { prev } = findPrevNext(entries, 'github.com', 'u/r', 'u/r',
    '/remote/github.com/u/r/s2', false, []);
  assert.equal(prev.text, 'S1 : 2025');
});

// ═══════════════════════════════════════════════════════════════════
console.log('\n── buildTocHtml ──');

test('extracts h2 and h3', () => {
  const md = '# Title\n## Section\n### Sub\nText\n## Other\n';
  const html = buildTocHtml(md, '/remote/github.com/u/r');
  assert.ok(html.includes('Section'));
  assert.ok(html.includes('Sub'));
  assert.ok(html.includes('Other'));
  assert.ok(!html.includes('Title')); // h1 excluded
});

test('setext h2 detected', () => {
  const md = 'My Section\n----------\nContent\n';
  const html = buildTocHtml(md, '/r');
  assert.ok(html.includes('My Section'));
});

test('h3 gets rn-h3 class', () => {
  const md = '### Deep\n';
  const html = buildTocHtml(md, '/r');
  assert.ok(html.includes('class="rn-h3"'));
});

test('slugs are URL-safe', () => {
  const md = '## Hello World! (yes)\n';
  const html = buildTocHtml(md, '/r');
  assert.ok(html.includes('?id=hello-world-yes'));
});

test('empty markdown → empty string', () => {
  assert.equal(buildTocHtml('', '/r'), '');
});

// ═══════════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════════
console.log('\n── HOSTS URL builders with custom ref ──');

test('github rawBase with custom ref', () => {
  assert.equal(HOSTS['github.com'].rawBase('user/repo', 'main'),
    'https://raw.githubusercontent.com/user/repo/main/');
});

test('github readmeUrl with custom ref', () => {
  assert.equal(HOSTS['github.com'].readmeUrl('user/repo', '', 'v2.0'),
    'https://raw.githubusercontent.com/user/repo/v2.0/README.md');
});

test('github fileUrl with custom ref', () => {
  assert.equal(HOSTS['github.com'].fileUrl('user/repo', 'img/logo.png', 'develop'),
    'https://raw.githubusercontent.com/user/repo/develop/img/logo.png');
});

test('github sidebarUrls with custom ref', () => {
  assert.ok(HOSTS['github.com'].sidebarUrls('user/repo', 'main')[0].includes('/main/_sidebar.md'));
});

test('gitlab rawBase with custom ref', () => {
  assert.equal(HOSTS['gitlab.com'].rawBase('group/proj', 'develop'),
    'https://gitlab.com/group/proj/-/raw/develop/');
});

test('gitlab fileUrl HEAD — no ?ref= appended', () => {
  const url = HOSTS['gitlab.com'].fileUrl('group/proj', 'README.md', 'HEAD');
  assert.ok(!url.includes('?ref='));
});

test('gitlab fileUrl custom ref appends ?ref=', () => {
  const url = HOSTS['gitlab.com'].fileUrl('group/proj', 'README.md', 'main');
  assert.ok(url.includes('?ref=main'));
});

test('codeberg fileUrl with custom ref appends ?ref=', () => {
  const url = HOSTS['codeberg.org'].fileUrl('user/repo', 'README.md', 'develop');
  assert.ok(url.includes('?ref=develop'));
});

test('codeberg fileUrl HEAD — no ?ref= appended', () => {
  const url = HOSTS['codeberg.org'].fileUrl('user/repo', 'README.md', 'HEAD');
  assert.ok(!url.includes('?ref='));
});

// ═══════════════════════════════════════════════════════════════════
console.log('\n── _getRef / buildContext ref ──');

test('_getRef defaults to HEAD', () => {
  delete window.$docsify.remoteRepo;
  assert.equal(_getRef(), 'HEAD');
});

test('_getRef reads remoteRepo.ref from config', () => {
  window.$docsify.remoteRepo = { ref: 'main' };
  assert.equal(_getRef(), 'main');
  delete window.$docsify.remoteRepo;
});

test('buildContext includes ref field', () => {
  const ctx = buildContext('github.com', 'user/repo', '');
  assert.equal(ctx.ref, 'HEAD');
});

test('buildContext uses configured ref in URLs', () => {
  window.$docsify.remoteRepo = { ref: 'main' };
  const ctx = buildContext('github.com', 'user/repo', '');
  assert.equal(ctx.ref, 'main');
  assert.ok(ctx.rawBase.includes('/main/'));
  assert.ok(ctx.readmeUrl.includes('/main/'));
  delete window.$docsify.remoteRepo;
});

test('buildSidebarCascade with custom ref', () => {
  const urls = buildSidebarCascade('github.com', 'user/repo', '', 'main');
  assert.ok(urls[0].includes('/main/_sidebar.md'));
});

test('buildSidebarCascade defaults to HEAD', () => {
  const urls = buildSidebarCascade('github.com', 'user/repo', '');
  assert.ok(urls[0].includes('/HEAD/_sidebar.md'));
});

// ═══════════════════════════════════════════════════════════════════
console.log('\n── splitRepoPath: registry before _lastRepo (fix #4) ──');

test('gitlab: registry takes priority over stale _lastRepo', () => {
  // Simulate previous navigation that set _lastRepo to a parent path
  splitRepoPath('gitlab.com', 'a/b');  // sets _lastRepo = { host: 'gitlab.com', repo: 'a/b' }
  window.__remoteRepoRegistry = new Set(['gitlab.com/a/b/c']);
  const { repo, sub } = splitRepoPath('gitlab.com', 'a/b/c/page');
  assert.equal(repo, 'a/b/c');  // registry wins, NOT _lastRepo's 'a/b'
  assert.equal(sub, 'page');
  delete window.__remoteRepoRegistry;
});

test('gitlab: _lastRepo cache used when registry absent', () => {
  delete window.__remoteRepoRegistry;
  splitRepoPath('gitlab.com', 'group/proj');  // sets _lastRepo
  const { repo, sub } = splitRepoPath('gitlab.com', 'group/proj/sub/path');
  assert.equal(repo, 'group/proj');
  assert.equal(sub, 'sub/path');
});

// ═══════════════════════════════════════════════════════════════════
console.log('\n── rewriteMarkdown: iframe/embed (fix #6) ──');

test('iframe src rewritten to absolute raw URL', () => {
  const md = rewriteMarkdown('<iframe src="demo.html"></iframe>', mkCtx());
  assert.ok(md.includes('raw.githubusercontent.com'));
  assert.ok(md.includes('demo.html'));
});

test('embed src rewritten to absolute raw URL', () => {
  const md = rewriteMarkdown('<embed src="data.pdf">', mkCtx());
  assert.ok(md.includes('raw.githubusercontent.com'));
  assert.ok(md.includes('data.pdf'));
});

test('iframe external src untouched', () => {
  const md = rewriteMarkdown('<iframe src="https://example.com/video"></iframe>', mkCtx());
  assert.ok(md.includes('https://example.com/video'));
  assert.ok(!md.includes('raw.githubusercontent.com'));
});

// ═══════════════════════════════════════════════════════════════════
console.log('\n── escapeHtml (fix #2) ──');

test('escapes & < > " \'', () => {
  assert.equal(escapeHtml('a & b < c > d "e" \'f\''),
    'a &amp; b &lt; c &gt; d &quot;e&quot; &#39;f&#39;');
});

test('no-op on plain text', () => {
  assert.equal(escapeHtml('hello world'), 'hello world');
});

test('buildSidebarTree: XSS in link text is escaped', () => {
  const entries = [{ indent: 0, text: '<script>alert(1)</script>', href: '/x' }];
  const html = buildSidebarTree(entries, 'github.com', 'u/r', 'u/r');
  assert.ok(!html.includes('<script>'), 'script tag must not appear verbatim');
  assert.ok(html.includes('&lt;script&gt;'));
});

test('buildSidebarTree: HTML comments stripped from link text', () => {
  const entries = [{ indent: 0, text: 'S1 : <!-- meta -->2025<!-- end -->', href: '/s1' }];
  const html = buildSidebarTree(entries, 'github.com', 'u/r', 'u/r');
  assert.ok(html.includes('S1 :'));
  assert.ok(html.includes('2025'));
  assert.ok(!html.includes('<!--'));
});

test('buildTocHtml: XSS in heading text is stripped/escaped', () => {
  const md = '## <script>alert(1)</script>\n';
  const html = buildTocHtml(md, '/r');
  // HTML tags are stripped before escaping; neither raw nor escaped tag appears
  assert.ok(!html.includes('<script>'), 'script tag must not appear verbatim');
  assert.ok(!html.includes('&lt;script&gt;'), 'stripped tag should not appear escaped either');
  // Safe visible text content remains
  assert.ok(html.includes('alert(1)'));
});

// ═══════════════════════════════════════════════════════════════════
console.log('\n── buildTocHtml: unicode slugs (fix #1) ──');

test('slug preserves French accented letters', () => {
  const md = '## Déroûlement et séquence\n';
  const html = buildTocHtml(md, '/r');
  assert.ok(html.includes('?id=déroûlement-et-séquence'), `got: ${html}`);
});

test('slug preserves other Unicode letters', () => {
  const md = '## Présentation étape par étape\n';
  const html = buildTocHtml(md, '/r');
  assert.ok(html.includes('presentation') || html.includes('présentation'),
    `slug should keep accented letters, got: ${html}`);
});

test('old ASCII-only test still passes', () => {
  const md = '## Hello World! (yes)\n';
  const html = buildTocHtml(md, '/r');
  assert.ok(html.includes('?id=hello-world-yes'));
});

// ═══════════════════════════════════════════════════════════════════
console.log('\n── parseFrontmatter ──');

test('parses simple key:value block', () => {
  const md = '---\npdf: report.pdf\ntitle: My Doc\n---\n# Heading\n';
  const { fm, body } = parseFrontmatter(md);
  assert.deepEqual(fm, { pdf: 'report.pdf', title: 'My Doc' });
  assert.equal(body, '# Heading\n');
});

test('returns null fm when no frontmatter', () => {
  const md = '# Just a heading\nNo frontmatter here.\n';
  const { fm, body } = parseFrontmatter(md);
  assert.equal(fm, null);
  assert.equal(body, md);
});

test('strips frontmatter block from body', () => {
  const md = '---\npdf: doc.pdf\n---\n\nFirst paragraph.';
  const { body } = parseFrontmatter(md);
  assert.ok(!body.includes('---'));
  assert.ok(!body.includes('pdf:'));
  assert.ok(body.includes('First paragraph.'));
});

test('handles CRLF line endings', () => {
  const md = '---\r\npdf: x.pdf\r\n---\r\nBody text';
  const { fm } = parseFrontmatter(md);
  assert.ok(fm !== null);
  assert.equal(fm.pdf, 'x.pdf');
});

test('real-world MediaMesh funding frontmatter', () => {
  const md = '---\npdf: mediamesh_funding.pdf\ndoc_label: Funding Proposal\n---\n# Funding Proposal\n';
  const { fm, body } = parseFrontmatter(md);
  assert.equal(fm.pdf, 'mediamesh_funding.pdf');
  assert.equal(fm.doc_label, 'Funding Proposal');
  assert.ok(body.startsWith('# Funding Proposal'));
  assert.ok(!body.includes('pdf:'));
});

test('ignores lines without colon', () => {
  const md = '---\ntitle: Hello\nbadline\npdf: doc.pdf\n---\nBody';
  const { fm } = parseFrontmatter(md);
  assert.equal(fm.title, 'Hello');
  assert.equal(fm.pdf, 'doc.pdf');
  assert.ok(!('badline' in fm));
});

test('values with colons are preserved', () => {
  const md = '---\nurl: https://example.com/path\n---\nBody';
  const { fm } = parseFrontmatter(md);
  assert.equal(fm.url, 'https://example.com/path');
});

test('trailing whitespace on closing --- is tolerated', () => {
  const md = '---\npdf: x.pdf\n---   \nBody';
  const { fm } = parseFrontmatter(md);
  assert.ok(fm !== null);
  assert.equal(fm.pdf, 'x.pdf');
});

// ═══════════════════════════════════════════════════════════════════
console.log('\n── cachedFetch ──');

// Mock fetch for cachedFetch tests
let fetchCount = 0;
let fetchResponses = [];
let fetchErrors = [];

function resetMockFetch() {
  fetchCount = 0;
  fetchResponses = [];
  fetchErrors = [];
}

function mockResponse(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, text: () => Promise.resolve(body) };
}

globalThis.fetch = function (url) {
  fetchCount++;
  const err = fetchErrors.shift();
  if (err) return Promise.reject(err);
  const resp = fetchResponses.shift();
  if (resp) return Promise.resolve(typeof resp === 'function' ? resp() : resp);
  return Promise.resolve(mockResponse(url));
};

test('fetches and caches result', async () => {
  resetMockFetch();
  fetchResponses.push(mockResponse('content A', 200));
  const r1 = await cachedFetch('https://example.com/a');
  assert.equal(r1, 'content A');
  assert.equal(fetchCount, 1);
  // second call should return cached, no new fetch
  const r2 = await cachedFetch('https://example.com/a');
  assert.equal(r2, 'content A');
  assert.equal(fetchCount, 1);
});

test('deduplicates concurrent requests for same URL', async () => {
  resetMockFetch();
  fetchResponses.push(mockResponse('shared', 200));
  const [r1, r2] = await Promise.all([
    cachedFetch('https://example.com/concurrent'),
    cachedFetch('https://example.com/concurrent'),
  ]);
  assert.equal(r1, 'shared');
  assert.equal(r2, 'shared');
  assert.equal(fetchCount, 1);
});

test('different URLs fetch independently', async () => {
  resetMockFetch();
  fetchResponses.push(mockResponse('one', 200), mockResponse('two', 200));
  const [r1, r2] = await Promise.all([
    cachedFetch('https://example.com/x'),
    cachedFetch('https://example.com/y'),
  ]);
  assert.equal(r1, 'one');
  assert.equal(r2, 'two');
  assert.equal(fetchCount, 2);
});

test('4xx errors remain cached (permanent client error)', async () => {
  resetMockFetch();
  fetchResponses.push(mockResponse('forbidden', 403));
  try { await cachedFetch('https://example.com/403'); } catch (e) { /* expected */ }
  assert.equal(fetchCount, 1);
  // Second attempt should NOT retry — 4xx stays cached
  fetchResponses.push(mockResponse('ok', 200)); // if retried, would get this
  try { await cachedFetch('https://example.com/403'); } catch (e) {
    assert.ok(e.message.includes('403'));
  }
  // Should NOT have fetched again if 4xx was properly cached
  assert.equal(fetchCount, 1);
});

test('5xx errors clear cache (transient error, retry)', async () => {
  resetMockFetch();
  fetchResponses.push(mockResponse('error', 500));
  try { await cachedFetch('https://example.com/500'); } catch (e) { /* expected */ }
  assert.equal(fetchCount, 1);
  // 5xx should clear cache, so next call retries
  fetchResponses.push(mockResponse('recovered', 200));
  const r = await cachedFetch('https://example.com/500');
  assert.equal(r, 'recovered');
  assert.equal(fetchCount, 2);
});

test('network errors clear cache (retry)', async () => {
  resetMockFetch();
  fetchErrors.push(new Error('Network failure'));
  try { await cachedFetch('https://example.com/net'); } catch (e) { /* expected */ }
  assert.equal(fetchCount, 1);
  // Network error should clear cache
  fetchResponses.push(mockResponse('after-net', 200));
  const r = await cachedFetch('https://example.com/net');
  assert.equal(r, 'after-net');
  assert.equal(fetchCount, 2);
});

test('3xx status is treated as ok', async () => {
  resetMockFetch();
  // 304 Not Modified — r.ok = true for < 400
  fetchResponses.push(mockResponse('cached-content', 304));
  const r = await cachedFetch('https://example.com/304');
  assert.equal(r, 'cached-content');
});

test('FIFO eviction when cache exceeds 200 entries', async () => {
  resetMockFetch();
  // Fill cache with 200 unique URLs
  for (let i = 0; i < 200; i++) {
    fetchResponses.push(mockResponse(`content-${i}`, 200));
  }
  const firstUrl = 'https://example.com/first';
  fetchResponses[0] = mockResponse('first-entry', 200);
  // First entry
  await cachedFetch(firstUrl);
  // Fill rest
  for (let i = 1; i < 200; i++) {
    await cachedFetch(`https://example.com/${i}`);
  }
  // Cache is now full. First entry should still be cached.
  // Add one more — should evict the oldest (first entry)
  fetchResponses.push(mockResponse('new-entry', 200));
  await cachedFetch('https://example.com/new');
  assert.equal(fetchCount, 201);
  // Now first entry should be evicted and re-fetched
  fetchResponses.push(mockResponse('first-re-fetched', 200));
  const reFetchResult = await cachedFetch(firstUrl);
  assert.equal(reFetchResult, 'first-re-fetched');
  assert.equal(fetchCount, 202);
});

// ═══════════════════════════════════════════════════════════════════
console.log('\n── getSubmodules ──');

test('fetches and parses .gitmodules', async () => {
  resetMockFetch();
  const gitmodulesBody = [
    '[submodule "lib/dep"]',
    '\tpath = lib/dep',
    '\turl = https://github.com/other/dep.git',
  ].join('\n');
  fetchResponses.push(mockResponse(gitmodulesBody, 200));
  const mods = await getSubmodules('github.com', 'owner/repo', 'HEAD');
  assert.equal(mods.size, 1);
  const entry = mods.get('lib/dep');
  assert.equal(entry.host, 'github.com');
  assert.equal(entry.repoPath, 'other/dep');
});

test('failed .gitmodules fetch returns empty Map', async () => {
  resetMockFetch();
  fetchResponses.push(mockResponse('not found', 404));
  const mods = await getSubmodules('github.com', 'owner/repo', 'main');
  assert.equal(mods.size, 0);
});

test('caches submodule results', async () => {
  resetMockFetch();
  fetchResponses.push(mockResponse('[submodule "x"]\n\tpath = x\n\turl = https://github.com/o/r\n', 200));
  await getSubmodules('github.com', 'o/p', 'HEAD');
  assert.equal(fetchCount, 1);
  await getSubmodules('github.com', 'o/p', 'HEAD');
  // Should use cached result, not re-fetch
  assert.equal(fetchCount, 1);
});

test('registers submodule repos in __remoteRepoRegistry', async () => {
  resetMockFetch();
  window.__remoteRepoRegistry = new Set();
  fetchResponses.push(mockResponse(
    '[submodule "sub"]\n\tpath = sub\n\turl = https://gitlab.com/group/subrepo\n', 200));
  await getSubmodules('gitlab.com', 'group/parent', 'HEAD');
  assert.ok(window.__remoteRepoRegistry.has('gitlab.com/group/subrepo'));
  delete window.__remoteRepoRegistry;
});

// ═══════════════════════════════════════════════════════════════════
console.log('\n── Additional edge cases ──');

test('buildContext with codeberg host', () => {
  const ctx = buildContext('codeberg.org', 'user/repo', 'docs');
  assert.equal(ctx.host, 'codeberg.org');
  assert.equal(ctx.routePrefix, '/remote/codeberg.org/user/repo');
  assert.ok(ctx.readmeUrl.includes('/api/v1/repos/'));
  assert.ok(ctx.readmeUrl.includes('/raw/docs/README.md'));
});

test('parseSidebarEntries with empty markdown', () => {
  assert.deepEqual(parseSidebarEntries(''), []);
  assert.deepEqual(parseSidebarEntries('\n\n'), []);
});

test('buildTocHtml with null/undefined markdown', () => {
  assert.equal(buildTocHtml(null, '/r'), '');
  assert.equal(buildTocHtml(undefined, '/r'), '');
});

test('splitRepoPath: github deep path', () => {
  _resetLastRepo();
  const { repo, sub } = splitRepoPath('github.com', 'user/repo/a/b/c/d');
  assert.equal(repo, 'user/repo');
  assert.equal(sub, 'a/b/c/d');
});

test('buildSidebarCascade: codeberg root', () => {
  const urls = buildSidebarCascade('codeberg.org', 'user/repo', '');
  assert.equal(urls.length, 1);
  assert.ok(urls[0].includes('/raw/_sidebar.md'));
});

test('buildSidebarCascade: codeberg sub with ref', () => {
  const urls = buildSidebarCascade('codeberg.org', 'user/repo', 'docs/api', 'main');
  assert.ok(urls[0].includes('/raw/docs/api/_sidebar.md'));
  assert.ok(urls[0].includes('?ref=main'));
});

test('resolveNavHref: relative path without trailing slash', () => {
  const href = resolveNavHref('other', '', '/remote/github.com/u/r', '/remote/github.com/u/r');
  assert.equal(href, '/remote/github.com/u/r/other');
});

test('KNOWN_HOSTS includes all three hosts', () => {
  assert.ok(KNOWN_HOSTS.includes('github.com'));
  assert.ok(KNOWN_HOSTS.includes('gitlab.com'));
  assert.ok(KNOWN_HOSTS.includes('codeberg.org'));
});

test('codeberg sidebarUrls with ref', () => {
  const urls = HOSTS['codeberg.org'].sidebarUrls('user/repo', 'dev');
  assert.ok(urls[0].includes('/raw/_sidebar.md'));
});

test('rewriteMarkdown: image with leading ./ in sub-path', () => {
  const ctx = mkCtx({ sub: 'docs', base: 'https://raw.githubusercontent.com/user/repo/HEAD/docs/' });
  const md = rewriteMarkdown('![img](./pic.png)', ctx);
  assert.ok(md.includes('docs/pic.png'));
});

test('rewriteMarkdown: href with query params preserved as raw URL', () => {
  const ctx = mkCtx();
  const md = rewriteMarkdown('[x](file.pdf?v=2)', ctx);
  assert.ok(md.includes('raw.githubusercontent.com'));
  assert.ok(md.includes('file.pdf'));
  assert.ok(md.includes('v=2'));
});


console.log(`  ${passed} passed, ${failed} failed`);
console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
process.exit(failed ? 1 : 0);
