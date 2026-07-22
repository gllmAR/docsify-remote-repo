#!/usr/bin/env node
// Unit tests for docsify-remote-search.js
// Run:  node docsify-remote-search.test.js

'use strict';
const assert = require('node:assert/strict');
const {
  indexPage,
  searchRemote,
  proactiveIndex,
  INDEX,
  _resetIndex,
} = require('./docsify-remote-search.js');

let passed = 0;
let failed = 0;

const _queue = [];
function test(name, fn) { _queue.push({ name, fn }); }
function section(name) { _queue.push({ section: name }); }

// ═══════════════════════════════════════════════════════════════════
section('indexPage');

test('indexes simple markdown with headings', () => {
  indexPage('/remote/github.com/user/repo', '# My Repo\n\nHello world\n\n## Section\n\nBody text here');
  assert.ok(INDEX.has('/remote/github.com/user/repo'));
  const entries = INDEX.get('/remote/github.com/user/repo');
  assert.ok(entries.length >= 2);
  assert.equal(entries[0].title, 'My Repo');
  assert.ok(entries[0].body.includes('Hello world'));
  assert.equal(entries[1].title, 'Section');
  assert.ok(entries[1].body.includes('Body text'));
});

test('indexes page with no headings using repo name', () => {
  indexPage('/remote/github.com/user/mylib', 'Just some content\nwith no headings');
  const entries = INDEX.get('/remote/github.com/user/mylib');
  assert.ok(entries.length >= 1);
  assert.equal(entries[0].title, 'mylib');
  assert.ok(entries[0].body.includes('Just some content'));
});

test('generates correct slug links', () => {
  indexPage('/remote/codeberg.org/user/proj', '# Title\n\ntext\n\n## Sub Section\n\nbody');
  const entries = INDEX.get('/remote/codeberg.org/user/proj');
  assert.ok(entries[0].slug.includes('/remote/codeberg.org/user/proj'));
  assert.ok(entries[1].slug.includes('?id=sub-section'));
});

test('strips markdown formatting from indexed text', () => {
  indexPage('/remote/github.com/x/y', '# Title\n\nSee [this link](http://foo.com) and **bold** text');
  const entries = INDEX.get('/remote/github.com/x/y');
  assert.ok(entries[0].body.includes('this link'));
  assert.ok(entries[0].body.includes('bold text'));
  assert.ok(!entries[0].body.includes('['));
  assert.ok(!entries[0].body.includes('**'));
});

test('handles empty markdown gracefully', () => {
  indexPage('/remote/github.com/a/b', '');
  assert.ok(!INDEX.has('/remote/github.com/a/b'));
});

test('overwrites previous index for same path', () => {
  indexPage('/remote/github.com/a/b', '# First\n\ntext1');
  indexPage('/remote/github.com/a/b', '# Second\n\ntext2');
  const entries = INDEX.get('/remote/github.com/a/b');
  assert.equal(entries[0].title, 'Second');
});

// ═══════════════════════════════════════════════════════════════════
section('searchRemote');

test('finds matching entry by title', () => {
  indexPage('/remote/github.com/user/repo', '# Arduino Controller\n\nA cool device');
  const results = searchRemote('arduino');
  assert.ok(results.length > 0);
  assert.ok(results[0].title.toLowerCase().includes('arduino'));
});

test('finds matching entry by body', () => {
  indexPage('/remote/github.com/user/repo', '# Intro\n\nThis uses infrared sensors');
  const results = searchRemote('infrared');
  assert.ok(results.length > 0);
});

test('title match scores higher than body match', () => {
  indexPage('/remote/github.com/a/b', '# Theremin Project\n\nSome text');
  indexPage('/remote/github.com/c/d', '# Other\n\nMentions theremin once');
  const results = searchRemote('theremin');
  assert.ok(results.length >= 2);
  // Title match should come first
  assert.ok(results[0].url.includes('/a/b'));
});

test('returns empty array for no matches', () => {
  indexPage('/remote/github.com/a/b', '# Hello\n\nWorld');
  const results = searchRemote('nonexistent');
  assert.equal(results.length, 0);
});

test('returns empty array for empty query', () => {
  indexPage('/remote/github.com/a/b', '# Hello\n\nWorld');
  assert.equal(searchRemote('').length, 0);
  assert.equal(searchRemote('   ').length, 0);
});

test('handles multi-word query', () => {
  indexPage('/remote/github.com/a/b', '# Arduino\n\nInfrared sensor project');
  const results = searchRemote('infrared sensor');
  assert.ok(results.length > 0);
});

test('search is case-insensitive', () => {
  indexPage('/remote/github.com/a/b', '# Pure Data\n\nVisual programming');
  assert.ok(searchRemote('pure data').length > 0);
  assert.ok(searchRemote('PURE DATA').length > 0);
  assert.ok(searchRemote('Pure Data').length > 0);
});

test('search ignores diacritical marks', () => {
  indexPage('/remote/github.com/a/b', '# Pédalier\n\nVélo électrique');
  assert.ok(searchRemote('pedalier').length > 0);
  assert.ok(searchRemote('velo').length > 0);
  assert.ok(searchRemote('electrique').length > 0);
});

test('search results contain highlighted title', () => {
  indexPage('/remote/github.com/a/b', '# Arduino Board\n\nSome text');
  const results = searchRemote('arduino');
  assert.ok(results[0].title.includes('<em'));
});

test('search results contain context snippet', () => {
  indexPage('/remote/github.com/a/b', '# Title\n\nThe quick brown fox jumps over the lazy dog');
  const results = searchRemote('fox');
  assert.ok(results[0].content.length > 0);
  assert.ok(results[0].content.includes('fox'));
});

test('searches across multiple indexed pages', () => {
  indexPage('/remote/github.com/a/one', '# First\n\nAlpha content');
  indexPage('/remote/github.com/b/two', '# Second\n\nBeta content');
  indexPage('/remote/github.com/c/three', '# Third\n\nAlpha again');
  const results = searchRemote('alpha');
  assert.equal(results.length, 2);
});

// ═══════════════════════════════════════════════════════════════════
section('INDEX management');

test('_resetIndex clears the index', () => {
  indexPage('/remote/github.com/a/b', '# Hello\n\nworld');
  assert.ok(INDEX.size > 0);
  _resetIndex();
  assert.equal(INDEX.size, 0);
  assert.equal(searchRemote('hello').length, 0);
});

test('index stores path on each entry', () => {
  const path = '/remote/github.com/user/myrepo';
  indexPage(path, '# Title\n\nBody');
  const entries = INDEX.get(path);
  assert.equal(entries[0].path, path);
});

// ═══════════════════════════════════════════════════════════════════
section('proactiveIndex');

test('no-ops when __remoteRepoAPI is missing', () => {
  delete window.__remoteRepoAPI;
  // Should not throw
  proactiveIndex('/remote/github.com/user/repo');
  assert.equal(INDEX.size, 0);
});

test('no-ops for non-remote path', () => {
  window.__remoteRepoAPI = {
    parseRemoteRoute: () => null,
  };
  proactiveIndex('/wiki/page');
  assert.equal(INDEX.size, 0);
  delete window.__remoteRepoAPI;
});

test('fetches sidebar and indexes all entries', async () => {
  const sidebarMd = '- [Home](/)\n- [Guide](guide)\n- [API](api/)\n';
  const pages = {
    'https://raw.githubusercontent.com/user/repo/HEAD/_sidebar.md': sidebarMd,
    'https://raw.githubusercontent.com/user/repo/HEAD/README.md': '# Home\n\nWelcome to the repo',
    'https://raw.githubusercontent.com/user/repo/HEAD/guide.md': '# Guide\n\nStep by step',
    'https://raw.githubusercontent.com/user/repo/HEAD/api/README.md': '# API\n\nEndpoints here',
  };

  window.__remoteRepoAPI = {
    getRef: () => 'HEAD',
    HOSTS: {
      'github.com': {
        repoDepth: 2,
        readmeUrl: (repo, sub) => `https://raw.githubusercontent.com/${repo}/HEAD/${sub ? sub + '/' : ''}README.md`,
        fileUrl: (repo, path) => `https://raw.githubusercontent.com/${repo}/HEAD/${path}`,
        sidebarUrls: (repo) => [`https://raw.githubusercontent.com/${repo}/HEAD/_sidebar.md`],
      },
    },
    cachedFetch: (url) => pages[url]
      ? Promise.resolve(pages[url])
      : Promise.reject(new Error('HTTP 404')),
    parseRemoteRoute: (path) => {
      const m = path.match(/^\/remote\/([^/]+)\/(.+)$/);
      return m ? { host: m[1], fullPath: m[2].replace(/\/$/, '') } : null;
    },
    splitRepoPath: (host, full) => {
      const segs = full.split('/');
      return { repo: segs.slice(0, 2).join('/'), sub: segs.slice(2).join('/') };
    },
    buildSidebarCascade: (host, repo) => [
      `https://raw.githubusercontent.com/${repo}/HEAD/_sidebar.md`,
    ],
    parseSidebarEntries: (md) => {
      const entries = [];
      for (const line of md.split('\n')) {
        const m = line.match(/^(\s*)[-*]\s*\[([^\]]+)\]\(([^)]+)\)/);
        if (m) entries.push({ indent: m[1].length, text: m[2], href: m[3] });
      }
      return entries;
    },
    resolveEntryHref: (href, host, repo) => {
      if (/^https?:\/\//.test(href)) return href;
      const clean = href.replace(/(^|\/)README\.md$/i, '$1').trim().replace(/\/$/, '');
      if (clean === '' || clean === '/') return `#/remote/${host}/${repo}`;
      return `#/remote/${host}/${repo}/${clean.replace(/^\//, '')}`;
    },
  };

  proactiveIndex('/remote/github.com/user/repo');
  // Allow async fetches to complete
  await new Promise(r => setTimeout(r, 50));

  // Should have indexed Home, Guide, and API pages
  assert.ok(INDEX.size >= 2, 'expected at least 2 indexed pages, got ' + INDEX.size);
  const guideResults = searchRemote('step by step');
  assert.ok(guideResults.length > 0, 'guide page should be found');
  const apiResults = searchRemote('endpoints');
  assert.ok(apiResults.length > 0, 'API page should be found');

  delete window.__remoteRepoAPI;
});

test('does not re-index same repo on second visit', async () => {
  let fetchCount = 0;
  const sidebarMd = '- [Home](/)\n';
  window.__remoteRepoAPI = {
    getRef: () => 'HEAD',
    HOSTS: {
      'github.com': {
        repoDepth: 2,
        readmeUrl: (repo, sub) => `https://raw.githubusercontent.com/${repo}/HEAD/${sub ? sub + '/' : ''}README.md`,
        fileUrl: (repo, path) => `https://raw.githubusercontent.com/${repo}/HEAD/${path}`,
        sidebarUrls: (repo) => [`https://raw.githubusercontent.com/${repo}/HEAD/_sidebar.md`],
      },
    },
    cachedFetch: (url) => {
      fetchCount++;
      if (url.includes('_sidebar.md')) return Promise.resolve(sidebarMd);
      return Promise.resolve('# Page\n\nContent');
    },
    parseRemoteRoute: (path) => {
      const m = path.match(/^\/remote\/([^/]+)\/(.+)$/);
      return m ? { host: m[1], fullPath: m[2].replace(/\/$/, '') } : null;
    },
    splitRepoPath: (host, full) => {
      const segs = full.split('/');
      return { repo: segs.slice(0, 2).join('/'), sub: segs.slice(2).join('/') };
    },
    buildSidebarCascade: (host, repo) => [
      `https://raw.githubusercontent.com/${repo}/HEAD/_sidebar.md`,
    ],
    parseSidebarEntries: (md) => {
      const entries = [];
      for (const line of md.split('\n')) {
        const m = line.match(/^(\s*)[-*]\s*\[([^\]]+)\]\(([^)]+)\)/);
        if (m) entries.push({ indent: m[1].length, text: m[2], href: m[3] });
      }
      return entries;
    },
    resolveEntryHref: (href, host, repo) => {
      const clean = href.replace(/(^|\/)README\.md$/i, '$1').trim().replace(/\/$/, '');
      if (clean === '' || clean === '/') return `#/remote/${host}/${repo}`;
      return `#/remote/${host}/${repo}/${clean.replace(/^\//, '')}`;
    },
  };

  proactiveIndex('/remote/github.com/user/repo2');
  await new Promise(r => setTimeout(r, 50));
  const first = fetchCount;

  proactiveIndex('/remote/github.com/user/repo2/sub');
  await new Promise(r => setTimeout(r, 50));

  // Second call should NOT have triggered additional fetches
  assert.equal(fetchCount, first, 'repo should not be re-indexed');

  delete window.__remoteRepoAPI;
});

test('skips external links in sidebar', async () => {
  const sidebarMd = '- [External](https://example.com)\n- [Local](guide)\n';
  window.__remoteRepoAPI = {
    getRef: () => 'HEAD',
    HOSTS: {
      'github.com': {
        repoDepth: 2,
        readmeUrl: (repo, sub) => `https://raw.githubusercontent.com/${repo}/HEAD/${sub ? sub + '/' : ''}README.md`,
        fileUrl: (repo, path) => `https://raw.githubusercontent.com/${repo}/HEAD/${path}`,
        sidebarUrls: (repo) => [`https://raw.githubusercontent.com/${repo}/HEAD/_sidebar.md`],
      },
    },
    cachedFetch: (url) => {
      if (url.includes('_sidebar.md')) return Promise.resolve(sidebarMd);
      if (url.includes('guide')) return Promise.resolve('# Guide\n\nGuide body');
      return Promise.reject(new Error('HTTP 404'));
    },
    parseRemoteRoute: (path) => {
      const m = path.match(/^\/remote\/([^/]+)\/(.+)$/);
      return m ? { host: m[1], fullPath: m[2].replace(/\/$/, '') } : null;
    },
    splitRepoPath: (host, full) => {
      const segs = full.split('/');
      return { repo: segs.slice(0, 2).join('/'), sub: segs.slice(2).join('/') };
    },
    buildSidebarCascade: (host, repo) => [
      `https://raw.githubusercontent.com/${repo}/HEAD/_sidebar.md`,
    ],
    parseSidebarEntries: (md) => {
      const entries = [];
      for (const line of md.split('\n')) {
        const m = line.match(/^(\s*)[-*]\s*\[([^\]]+)\]\(([^)]+)\)/);
        if (m) entries.push({ indent: m[1].length, text: m[2], href: m[3] });
      }
      return entries;
    },
    resolveEntryHref: (href, host, repo) => {
      if (/^https?:\/\//.test(href)) return href;
      const clean = href.replace(/(^|\/)README\.md$/i, '$1').trim().replace(/\/$/, '');
      if (clean === '' || clean === '/') return `#/remote/${host}/${repo}`;
      return `#/remote/${host}/${repo}/${clean.replace(/^\//, '')}`;
    },
  };

  proactiveIndex('/remote/github.com/user/repo3');
  await new Promise(r => setTimeout(r, 50));

  // Only the local guide should be indexed, not external
  const guideResults = searchRemote('guide body');
  assert.ok(guideResults.length > 0, 'local page should be indexed');
  // No entry for example.com
  let hasExternal = false;
  INDEX.forEach((entries) => {
    entries.forEach(e => { if (e.path.includes('example.com')) hasExternal = true; });
  });
  assert.ok(!hasExternal, 'external links should not be indexed');

  delete window.__remoteRepoAPI;
});

test('propagates configured ref to sidebar and page URLs', async () => {
  const urlsFetched = [];
  window.$docsify.remoteRepo = { ref: 'main' };
  window.__remoteRepoAPI = {
    getRef: () => 'main',
    HOSTS: {
      'github.com': {
        repoDepth: 2,
        readmeUrl: (repo, sub, ref) => `https://raw.githubusercontent.com/${repo}/${ref}/${sub ? sub + '/' : ''}README.md`,
        fileUrl: (repo, path, ref) => `https://raw.githubusercontent.com/${repo}/${ref}/${path}`,
        sidebarUrls: () => [],
      },
    },
    cachedFetch: (url) => {
      urlsFetched.push(url);
      return Promise.resolve('# Page\n\nContent');
    },
    parseRemoteRoute: (path) => {
      const m = path.match(/^\/remote\/([^/]+)\/(.+)$/);
      return m ? { host: m[1], fullPath: m[2].replace(/\/$/, '') } : null;
    },
    splitRepoPath: (host, full) => {
      const segs = full.split('/');
      return { repo: segs.slice(0, 2).join('/'), sub: segs.slice(2).join('/') };
    },
    buildSidebarCascade: (host, repo, sub, ref) => [
      `https://raw.githubusercontent.com/${repo}/${ref}/_sidebar.md`,
    ],
    parseSidebarEntries: () => [
      { indent: 0, text: 'Guide', href: '/guide' },
    ],
    resolveEntryHref: (href, host, repo) => `#/remote/${host}/${repo}/guide`,
  };

  proactiveIndex('/remote/github.com/user/repo');
  await new Promise(r => setTimeout(r, 50));

  // All fetched URLs should use 'main', not 'HEAD'
  for (const url of urlsFetched) {
    assert.ok(url.includes('/main/'), `URL should use 'main' ref, got: ${url}`);
    assert.ok(!url.includes('/HEAD/'), `URL should not use HEAD: ${url}`);
  }

  delete window.__remoteRepoAPI;
  delete window.$docsify.remoteRepo;
});

// ═══════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════

(async function () {
  for (const item of _queue) {
    if (item.section) { console.log(`\n── ${item.section} ──`); continue; }
    _resetIndex();
    try {
      await item.fn();
      passed++;
      console.log(`  \u2713 ${item.name}`);
    } catch (e) {
      failed++;
      console.log(`  \u2717 ${item.name}`);
      console.log(`    ${e.message}`);
    }
  }
  console.log('\n' + '━'.repeat(42));
  console.log(`  ${passed} passed, ${failed} failed`);
  console.log('━'.repeat(42) + '\n');
  process.exit(failed > 0 ? 1 : 0);
})();
