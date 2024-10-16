# docsify-remote-repo.js

A hosted plugin version of **Docsify-This** principle that allows you to display remote Markdown files with full Docsify features, including custom themes, plugins, and URL parameter customization.

## Table of Contents

- [Introduction](#introduction)
- [Features](#features)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
- [Usage](#usage)
  - [Loading Remote Markdown Files](#loading-remote-markdown-files)
  - [Customizing Appearance and Behavior](#customizing-appearance-and-behavior)
- [Configuration](#configuration)
  - [Allowed Domains](#allowed-domains)
  - [Docsify Configuration](#docsify-configuration)
- [Plugin Details](#plugin-details)
- [Examples](#examples)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [License](#license)
- [Instructions to Use This Project](#instructions-to-use-this-project)

## Introduction

This project provides a customizable **Docsify** setup that can display remote Markdown files from a specified repository. By using the `docsify-content-fetcher.js` plugin, you can ingest remote repositories, adjust links and images, and customize the viewer's experience through URL parameters.

## Features

- **Display Remote Markdown Files**: Load and display Markdown files from remote repositories like GitHub, GitLab, and Codeberg.
- **Customizable Appearance**: Adjust themes, colors, fonts, and more using URL parameters.
- **Plugin Support**: Easily include additional Docsify plugins like search, pagination, and zoom image.
- **Dark Mode Support**: Automatically adjust to the user's system preferences for light or dark mode.
- **Error Handling**: Gracefully handle missing files and display custom error messages.
- **Easy Hosting**: Host your own version on platforms like GitHub Pages.

## Getting Started

### Prerequisites

- A web server or hosting platform that can serve static files (e.g., GitHub Pages, Netlify).
- Basic knowledge of HTML and JavaScript.

### Installation

1. **Clone the Repository** (if applicable):

   ```bash
   git clone https://github.com/your-username/your-repo.git
   ```

2. **Download the Necessary Files**:

   - `index.html`: The main HTML file.
   - `docsify-content-fetcher.js`: The Docsify plugin for fetching remote content.

3. **Place the Files**:

   - Ensure both `index.html` and `docsify-content-fetcher.js` are in the same directory.

## Usage

### Loading Remote Markdown Files

To display a remote Markdown file, use the following URL structure:

```
https://your-domain.com/?basePath=REMOTE_BASE_PATH&homepage=FILENAME.md
```

- **`REMOTE_BASE_PATH`**: The raw URL to the base directory of your remote repository (e.g., a GitHub `raw.githubusercontent.com` URL, GitLab raw URL, or Codeberg raw URL).
- **`FILENAME.md`**: The name of the Markdown file to display as the homepage.

**Examples**:

- **GitHub**:

  ```
  https://your-domain.com/?basePath=https://raw.githubusercontent.com/username/repo/main&homepage=README.md
  ```

- **GitLab**:

  ```
  https://your-domain.com/?basePath=https://gitlab.com/username/repo/-/raw/main&homepage=README.md
  ```

- **Codeberg**:

  ```
  https://your-domain.com/?basePath=https://codeberg.org/username/repo/raw/branch/main&homepage=README.md
  ```

### Customizing Appearance and Behavior

You can customize the viewer's experience by adding URL parameters:

- **`name`**: Sets the site name displayed in the sidebar.

  ```
  &name=My%20Documentation
  ```

- **`repo`**: Sets the repository link in the sidebar.

  ```
  &repo=https://github.com/username/repo
  ```

- **`theme`**: Sets the Docsify theme (`vue`, `buble`, `dark`, `pure`).

  ```
  &theme=dark
  ```

- **`dark-mode`**: Enables dark mode (`true` or `false`).

  ```
  &dark-mode=true
  ```

- **`link-color`**: Sets the link color (hex code without `#`).

  ```
  &link-color=ff0000
  ```

- **`coverpage`**: Enables the cover page (`true` or `false`).

  ```
  &coverpage=true
  ```

- **`loadSidebar`**: Enables the sidebar (`true` or `false`).

  ```
  &loadSidebar=true
  ```

- **`loadNavbar`**: Enables the navbar (`true` or `false`).

  ```
  &loadNavbar=true
  ```

**Combined Example**:

```
https://your-domain.com/?basePath=https://raw.githubusercontent.com/username/repo/main&homepage=README.md&name=My%20Docs&dark-mode=true&link-color=ff0000
```

## Configuration

### Allowed Domains

To restrict the domains from which content can be loaded, set the `allowedDomains` variable in `docsify-content-fetcher.js`:

```javascript
var allowedDomains = options.allowedDomains || 'githubusercontent.com,raw.githubusercontent.com,gitlab.com';
```

- Include any domains you wish to allow, separated by commas.

### Docsify Configuration

In `index.html`, you can adjust the Docsify configuration:

```html
<script>
  window.$docsify = {
    name: '',
    repo: '',
    homepage: 'README.md',
    loadSidebar: true,
    loadNavbar: true,
    subMaxLevel: 2,
    executeScript: true,
    docsifyContentFetcher: {
      allowedDomains: 'githubusercontent.com,raw.githubusercontent.com,gitlab.com',
      darkmode: true,
    },
    // Other configurations...
  };
</script>
```

## Plugin Details

The `docsify-content-fetcher.js` plugin handles:

- **Fetching Remote Content**: Processes the `basePath` and `homepage` parameters to load remote content.
- **Adjusting Links and Images**: Modifies links and image paths to work correctly with remote content from GitHub, GitLab, or Codeberg.
- **URL Parameter Handling**: Reads URL parameters to customize appearance and behavior.
- **Error Handling**: Detects and displays custom messages for missing files or errors.
- **Dark Mode Support**: Adjusts colors based on the user's system preferences and URL parameters.

## Examples

### Display a Remote Markdown File from GitHub

```
https://your-domain.com/?basePath=https://raw.githubusercontent.com/username/repo/main&homepage=docs/guide.md
```

### Display a Remote Markdown File from GitLab

```
https://your-domain.com/?basePath=https://gitlab.com/username/repo/-/raw/main&homepage=docs/guide.md
```

### Enable Dark Mode and Set Custom Link Color

```
https://your-domain.com/?basePath=https://raw.githubusercontent.com/username/repo/main&homepage=docs/guide.md&dark-mode=true&link-color=00ff00
```

### Disable Sidebar and Navbar

```
https://your-domain.com/?basePath=https://raw.githubusercontent.com/username/repo/main&homepage=docs/guide.md&loadSidebar=false&loadNavbar=false
```

## Troubleshooting

- **Missing Files (404 Errors)**:

  - Ensure the `basePath` and `homepage` parameters point to existing files.
  - If `_navbar.md` or `_sidebar.md` are missing, either add them to your repository or disable `loadNavbar` and `loadSidebar` in the configuration.

- **CORS Issues**:

  - When loading content from remote origins, ensure the server allows cross-origin requests.
  - GitHub's `raw.githubusercontent.com` and GitLab's raw URLs support CORS.

- **Plugin Errors**:

  - Check the browser console for errors.
  - Ensure `docsify-content-fetcher.js` is correctly linked in `index.html` and accessible.

- **Layout Issues**:

  - If you experience a flash of unstyled content (FOUC), ensure CSS files are properly linked and loaded.

## Contributing

Contributions are welcome! Please follow these steps:

1. **Fork the Repository**: Create your own fork on GitHub or GitLab.
2. **Create a Branch**: Work on your feature or fix in a new branch.
3. **Commit Changes**: Make clear and concise commit messages.
4. **Submit a Pull Request**: Describe your changes and submit a PR.

## License

This project is licensed under the [MIT License](LICENSE).

---

## Instructions to Use This Project

1. **Download the Files**:

   - Save the `index.html`, `docsify-content-fetcher.js`, and `README.md` files.

2. **Host on GitHub Pages, GitLab Pages, or Your Preferred Platform**:

   - **GitHub Pages**:

     - Create a new GitHub repository (if you don't have one already).
     - Commit the files to the repository.
     - Enable GitHub Pages in your repository settings. Choose the branch where the files are located and set the root folder as the source.
     - Your page will be available at `https://[your-username].github.io/[repository-name]/`.

   - **GitLab Pages**:

     - Create a new GitLab repository.
     - Commit the files to the repository.
     - Configure GitLab Pages by adding a `.gitlab-ci.yml` file with the appropriate configuration.
     - Your page will be available at `https://[your-username].gitlab.io/[repository-name]/`.

   - **Other Platforms**:

     - Upload the files to your web server or hosting service.

3. **Access Your Hosted Page**:

   - Use the URL structure described in the [Usage](#usage) section to load remote Markdown files.

4. **Customize as Needed**:

   - Modify the `index.html` and `docsify-content-fetcher.js` files to suit your needs.
   - Add custom styles or plugins as desired.

---

Feel free to reach out if you have any questions or need further assistance. Happy documenting!