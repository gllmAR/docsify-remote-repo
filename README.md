# docsify-remote-repo.js

A browser-side plugin for [Docsify 5](https://docsify.js.org) that renders remote repository README.md files inline — turning any Docsify site into a multi-repo documentation portal. Supports GitHub, GitLab, and Codeberg.

## Live Demo

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>docsify-remote-repo demo</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <!-- Docsify 5 theme -->
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/docsify@^5.0.0-rc/dist/themes/core.min.css">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/docsify@^5.0.0-rc/dist/themes/addons/core-dark.min.css" media="(prefers-color-scheme: dark)">
</head>
<body>
  <div id="app"></div>
  <script>
    window.$docsify = {
      name: 'Docs',
      homepage: 'README.md',
      loadSidebar: true,
      subMaxLevel: 2,
      // Optional: pin remote repos to a specific branch/tag
      // remoteRepo: { ref: 'main' },
      // Optional: enable cross-project pagination
      // pagination: { crossChapter: true },
    };
  </script>
  <!-- Plugin must load before Docsify so it registers hooks + aliases in time -->
  <script src="https://raw.githubusercontent.com/gllmar/docsify-remote-repo/HEAD/docsify-remote-repo.js"></script>
  <!-- Docsify 5 core -->
  <script src="https://cdn.jsdelivr.net/npm/docsify@^5.0.0-rc/dist/docsify.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/docsify@^5.0.0-rc/dist/plugins/front-matter.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/docsify@^5.0.0-rc/dist/plugins/search.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/docsify-sidebar-collapse/dist/docsify-sidebar-collapse.min.js"></script>
</body>
</html>
```

Then in your homepage markdown, create links to repos using the `':repo'` title:

```markdown
## Projects

- [SN — Balado](https://codeberg.org/tim-montmorency/sn ':repo')
- [Introduction à la création multimédia](https://codeberg.org/tim-montmorency/582705MO-2026-1 ':repo')
- [Pharmakon](https://gitlab.com/sr-expo/artwork/2025/pharmakon ':repo')
```

Clicking any link navigates to `#/remote/{host}/{repo}` and renders the remote README inline, complete with sidebar and pagination.

## Example Repos

The plugin handles complex real-world scenarios out of the box:

| Repo | Host | Demonstrates |
|------|------|-------------|
| [SN — Balado](https://codeberg.org/tim-montmorency/sn ':repo') | Codeberg | Submodules (balado), multi-language README, lexicon TOML, CI scripts |
| [582705MO-2026-1](https://codeberg.org/tim-montmorency/582705MO-2026-1 ':repo') | Codeberg | Deep sidebar nesting (5-level), multiple submodules (docsh, typst), `_sidebar.md` across directories, CI/CD with Codeberg Pages |
| [Pharmakon](https://gitlab.com/sr-expo/artwork/2025/pharmakon ':repo') | GitLab | Variable-depth subgroups (`sr-expo/artwork/2025/pharmakon`), GitLab pages fallback |

These repos feature sidebar cascading, heading TOC generation, nested image-link grids, submodule-aware media rewriting, cross-project navigation, and YAML frontmatter — all handled automatically.

### Sidebar links

Use **explicit `/remote/...` paths** in your sidebar. The `:repo` rewriting only runs on page content, not sidebar markdown in Docsify 5 RC:

```markdown
- Projects
  - [SN — Balado](/remote/codeberg.org/tim-montmorency/sn)
  - [Création multimédia](/remote/codeberg.org/tim-montmorency/582705MO-2026-1)
  - [Pharmakon](/remote/gitlab.com/sr-expo/artwork/2025/pharmakon)
```

### Git submodules for offline access

Add repos as git submodules under `projects/` if you want local copies for development or offline browsing. The sidebar still uses `/remote/` paths — the plugin always fetches live content from the forge:

```bash
git submodule add https://codeberg.org/tim-montmorency/sn projects/sn
git submodule add https://codeberg.org/tim-montmorency/582705MO-2026-1 projects/582705MO-2026-1
git submodule add https://gitlab.com/sr-expo/artwork/2025/pharmakon projects/pharmakon
```

## Usage

### Installation

A single `<script>` tag — no build step, no dependencies. Load it **before** Docsify:

```html
<!-- Plugin (before Docsify) -->
<script src="https://raw.githubusercontent.com/gllmar/docsify-remote-repo/HEAD/docsify-remote-repo.js"></script>
<!-- Docsify 5 RC -->
<script src="https://cdn.jsdelivr.net/npm/docsify@^5.0.0-rc/dist/docsify.min.js"></script>
```

### Link syntax

| Pattern | Result |
|---------|--------|
| `[label](https://github.com/owner/repo ':repo')` | Renders the repo README inline |
| `[![img](src)](https://... ':repo')` | Image-link card (gitrepos grid pattern) |

Only links with `:repo` (or `":repo"`) in the title position are rewritten. Other links pass through untouched.

### Configuration

All options live under `window.$docsify`:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `remoteRepo.ref` | string | `'HEAD'` | Branch, tag, or commit to fetch from (e.g. `'main'`, `'v2.0'`) |
| `pagination.crossChapter` | boolean | `false` | Enable prev/next links across repos listed on the same page |

## Supported Hosts

| Host | URL pattern | Sidebar source | Subgroups |
|------|------------|----------------|-----------|
| **github.com** | `owner/repo` | `_sidebar.md` in repo | No (fixed depth 2) |
| **gitlab.com** | `group/.../repo` | `_sidebar.md` in repo, falls back to group pages | Yes (variable depth) |
| **codeberg.org** | `owner/repo` | `_sidebar.md` in repo | No (fixed depth 2) |

## Route Structure

```
#/remote/{host}/{repo}[/{path}]
```

Examples:
- `#/remote/github.com/vuejs/core` — renders `README.md` from vuejs/core
- `#/remote/github.com/vuejs/core/docs/guide` — renders `docs/guide/README.md`
- `#/remote/gitlab.com/group/sub/proj/docs` — GitLab subgroup support

## Sidebar Pipeline

When viewing a remote page, the plugin builds a contextual sidebar by trying URLs in this order:

1. **Walk up** from the current path — `{path}/_sidebar.md`, `{parent}/_sidebar.md`, ..., root `_sidebar.md`
2. **Host fallbacks** — e.g., GitLab group pages `_sidebar.md`
3. **TOC fallback** — auto-generated from page headings (h2, h3)

If the standard Docsify sidebar is loaded (`.sidebar-nav`), the remote sidebar is injected at the top. The sidebar includes:
- Back link to the previous non-remote page
- Repo name link
- Source repository and website icon links
- Nested page navigation with active highlighting
- Page-level table of contents

## Pagination

When used with [docsify-pagination](https://github.com/imyelo/docsify-pagination), sidebar entries drive prev/next links. Enable `pagination.crossChapter: true` to navigate between repos listed on the same source page.

## Submodule Support

If a repo contains a `.gitmodules` file, the plugin automatically:
- Rewrites image/media URLs in submodule content to the submodule's raw URLs
- Redirects navigation to submodule paths to the submodule's own remote route

## Frontmatter

Remote markdown with YAML frontmatter blocks is handled:
- The frontmatter block is parsed and stripped (not rendered as text)
- Values are merged into `vm.frontmatter` for downstream plugins (e.g., `docsify-pdf-link`)
- Relative `pdf` paths are resolved to absolute raw URLs

## Browser API

Companion plugins can access internals via `window.__remoteRepoAPI`:

```js
const { HOSTS, cachedFetch, parseSidebarEntries, resolveEntryHref,
        parseRemoteRoute, splitRepoPath, buildSidebarCascade } = window.__remoteRepoAPI;
```

## License

MIT
