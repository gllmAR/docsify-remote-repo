(function () {
  function docsifyContentFetcher(hook, vm) {
    // Plugin options
    var options = vm.config.docsifyContentFetcher || {};

    var allowedDomains = options.allowedDomains || '';
    var darkmode = options.darkmode || false;

    // Function to get URL parameter
    function getURLParameterByName(name, isTrue = null, isFalse = null, url = window.location.href, returnValue = false) {
      let exists = false;
      let paramValue = null;

      url = decodeURIComponent(url);

      if (Array.isArray(name)) {
        name.forEach(element => {
          var value = getURLParameterByName(element, null, null, url, true);
          if (value === 'true' || value === 'false') {
            exists = true;
            paramValue = value;
          } else if (!exists && value) {
            exists = true;
            paramValue = value;
          }
        });
      } else {
        var regex = new RegExp('[?&]' + name + '(=([^&#]*)|&|#|$)');
        var results = regex.exec(url);
        exists = (results && results[2] !== undefined) ? true : false;
        paramValue = results && results[2] ? results[2] : null;
      }

      if (returnValue && exists) {
        return paramValue;
      } else if (!exists && isFalse) {
        return isFalse;
      }

      if (exists && isTrue) {
        return isTrue;
      }

      if (!exists && isFalse) {
        return isFalse;
      }

      return exists;
    }

    // Function to convert to Boolean
    function convertToBoolean(value) {
      if (value === 'true') {
        return true;
      } else if (value === 'false') {
        return false;
      } else {
        return value;
      }
    }

    // Function to get file extension
    function getFileExtension(filename) {
      if (filename) {
        const dotIndex = filename.lastIndexOf('.');
        if (dotIndex !== -1) {
          return filename.slice(dotIndex);
        }
      }
      return '';
    }

    // Function to get allowed file extensions
    function getAllowedFileExtensions() {
      return ".md,.markdown";
    }

    // Function to check if extension is allowed
    function isExtensionAllowed(fileURL) {
      var allowedExtensions = getAllowedFileExtensions();
      fileURL = fileURL.split('?id')[0];
      var extension = fileURL.split(".").pop();
      return allowedExtensions.includes(extension.toLowerCase());
    }

    // Process the 'basePath' parameter
    if (getURLParameterByName('basePath')) {
      const params = new URLSearchParams(window.location.search);
      params.forEach((value, key) => {
        if (key === 'basePath' && !(allowedDomains === '')) {
          const { hostname } = new URL(value);
          if (!(allowedDomains.includes(hostname))) {
            alert('Only the domain(s) ' + allowedDomains + ' permitted for a Markdown source file URL.');
            throw new Error('Only the domain ' + allowedDomains + ' permitted for a Markdown source file URL.');
          } else {
            vm.config[key] = convertToBoolean(value);
          }
        } else {
          vm.config[key] = convertToBoolean(value);
        }
      });
    }

    // Hook: afterEach
    hook.afterEach(function (html, next) {
      if (vm.config['basePath']) {
        var htmlElement = document.createElement('div');
        htmlElement.innerHTML = html;

        // Adjust links and images
        var url = window.location.href.replace('#/', '');
        var currentBasePath = getURLParameterByName('basePath', null, null, window.location.href, true);

        var paramArray = url.split('&');
        var filteredParams = paramArray.filter(function (param) {
          return !param.includes('homepage') && !param.includes('edit-link') && !param.includes('editLink');
        });
        var URLparms = '&' + filteredParams.join('&');
        url = url.replace(/[?].*/, '');

        const links = Array.from(htmlElement.querySelectorAll('a'));

        let existingEditThisPageLink = getURLParameterByName(['edit-link', 'editLink'], null, null, window.location.href, true);
        let fileExt = getFileExtension(existingEditThisPageLink);
        if (!fileExt) {
          fileExt = getFileExtension(getURLParameterByName('homepage', null, null, window.location.href, true));
        }

        for (const link of links) {
          const href = link.getAttribute('href');
          if (href?.startsWith('#')) {
            let lastSegment = href.replace('#/', '').replace('./', '').replace(fileExt, '');
            if (!lastSegment.startsWith("?id")) {
              let editThisPageLink = '';
              if (existingEditThisPageLink) {
                if (existingEditThisPageLink.endsWith(fileExt)) {
                  editThisPageLink = decodeURIComponent(currentBasePath);
                  if (currentBasePath.includes("raw.githubusercontent.com")) {
                    // GitHub
                    editThisPageLink = editThisPageLink.replace('raw.githubusercontent.com', existingEditThisPageLink.includes('github.dev') ? 'github.dev' : 'github.com')
                      .replace(/\/main/, '/blob/main')
                      .replace(/\/master/, '/blob/master');
                  } else if (currentBasePath.includes("raw.codeberg.page")) {
                    // Codeberg
                    editThisPageLink = editThisPageLink.replace('raw.codeberg.page', 'codeberg.org');
                    editThisPageLink = editThisPageLink + '/src/branch/main/';
                  } else if (currentBasePath.includes("gitlab.com")) {
                    // GitLab
                    editThisPageLink = editThisPageLink.replace('/-/raw/', '/-/blob/');
                  }
                  editThisPageLink = editThisPageLink + '/' + lastSegment + fileExt;
                } else {
                  editThisPageLink = existingEditThisPageLink;
                }
              }
              const editThisPageLinkURLparm = editThisPageLink && `&edit-link=${editThisPageLink}`;
              let newURL = '';
              var isDynamicLink = (isExtensionAllowed(editThisPageLinkURLparm) && !(editThisPageLinkURLparm === "")) || getURLParameterByName('hypothesis');
              if (!isDynamicLink) {
                newURL = `#/${lastSegment}`;
              } else {
                newURL = `${url}?basePath=${currentBasePath}&homepage=${lastSegment}${fileExt}${URLparms}${editThisPageLinkURLparm}`;
              }
              link.setAttribute('href', newURL);
            }
          }
        }

        // Adjust images
        if (currentBasePath.includes("raw.githubusercontent.com") || currentBasePath.includes("raw.codeberg.page") || currentBasePath.includes("gitlab.com")) {
          const images = Array.from(htmlElement.querySelectorAll('img'));
          for (const image of images) {
            let imgUrl = image.getAttribute('src');
            if (imgUrl && !(imgUrl.includes('://') || imgUrl.startsWith('//'))) {
              imgUrl = imgUrl.replace(/^\/+/g, '');
              let adjustedBasePath = currentBasePath;
              if (currentBasePath.includes("gitlab.com")) {
                // Ensure GitLab raw URLs end with a slash
                if (!adjustedBasePath.endsWith('/')) {
                  adjustedBasePath += '/';
                }
              }
              imgUrl = adjustedBasePath + imgUrl;
              image.setAttribute('src', imgUrl);
            }
          }
        }

        // Lazy loading for images
        htmlElement.innerHTML = htmlElement.innerHTML.replace(/<img(.*?)>/g, function (match, p1) {
          if (p1.indexOf('loading=') === -1) {
            return match.replace('>', ' loading="lazy">');
          }
          return match;
        });

        // Error handling: Check if content indicates a 404 error
        if (html.includes('404: Not Found') || html.includes('404 Not Found')) {
          const errorMessage = `# Whoops!\n\nThe requested file **${vm.route.file}** could not be found. Please check the **basePath** and **homepage** parameters.`;
          next(errorMessage);
        } else {
          next(htmlElement.innerHTML);
        }
      } else {
        next(html);
      }
    });

    // Hook: beforeEach
    hook.beforeEach(function (html) {
      // No need for error handling here since response is undefined
      return html;
    });

    // Hook: doneEach
    hook.doneEach(function () {
      if (vm.config['basePath']) {
        // Adjust site name link
        const appName = getURLParameterByName('name', null, null, window.location.href, true);
        if (appName) {
          const appNameLink = document.querySelector('a.app-name-link');
          if (appNameLink) {
            appNameLink.setAttribute('href', '#/');
          }
        }

        // Adjust page title
        let browserTabTitle = getURLParameterByName(['browser-tab-title', 'browserTabTitle'], null, null, window.location.href, true);
        document.title = browserTabTitle || appName || 'Published by Docsify-This';

        // Adjust page content if 'page-title' parameter is present
        let pageTitle = getURLParameterByName(['page-title', 'pageTitle'], null, null, window.location.href, true);
        if (pageTitle) {
          let newh1 = document.createElement("h1");
          newh1.innerHTML = pageTitle;
          let divToMoveTo = document.getElementById("main");
          if (divToMoveTo) {
            divToMoveTo.insertBefore(newh1, divToMoveTo.children[0]);
          }
        }

        // Handle dark mode link colors
        updateThemeModeLinkColors();
      }
    });

    // Function to update theme mode link colors
    function updateThemeModeLinkColors() {
      const darkModeEnabled = getURLParameterByName(['dark-mode', 'darkMode'], null, null, window.location.href, true) || darkmode;

      if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches && darkModeEnabled) {
        // Dark mode
        const linkColorDarkMode = getURLParameterByName(['link-color-dark-mode', 'linkColorDarkMode'], null, null, window.location.href, true);

        if (linkColorDarkMode !== false) {
          setColorProperties('#' + linkColorDarkMode);
          document.documentElement.style.setProperty('--cover-button-primary-color', '#000000');
        } else {
          const linkColor = getURLParameterByName(['link-color', 'linkColor'], null, null, window.location.href, true);
          if (linkColor !== false) {
            setColorProperties('#' + linkColor);
          } else {
            setColorProperties('#1BA1EE');
            document.documentElement.style.setProperty('--cover-button-primary-color', '#000000');
          }
        }

        const coverPageColorDarkMode = getURLParameterByName(['coverpage-color-dark-mode', 'coverpageColorDarkMode'], null, null, window.location.href, true);

        if (coverPageColorDarkMode !== false) {
          document.documentElement.style.setProperty('--cover-background-color', '#' + coverPageColorDarkMode);
        } else {
          document.documentElement.style.setProperty('--cover-background-color', '#262d30');
        }
      } else {
        // Light mode
        const linkColor = getURLParameterByName(['link-color', 'linkColor'], null, null, window.location.href, true);
        document.documentElement.style.setProperty('--cover-button-primary-color', '#FFFFFF');

        if (linkColor !== false) {
          setColorProperties('#' + linkColor);
        } else {
          setColorProperties('#0374B5');
          document.documentElement.style.setProperty('--cover-button-primary-color', '#FFFFFF');
        }

        const coverPageColor = getURLParameterByName(['coverpage-color', 'coverpageColor'], null, null, window.location.href, true);

        if (coverPageColor !== false) {
          document.documentElement.style.setProperty('--cover-background-color', '#' + coverPageColor);
        } else {
          document.documentElement.style.setProperty('--cover-background-color', '#6c8a9a');
        }
      }
    }

    // Function to set color properties
    function setColorProperties(color) {
      document.documentElement.style.setProperty('--navbar-root-color--active', color);
      document.documentElement.style.setProperty('--blockquote-border-color', color);
      document.documentElement.style.setProperty('--sidebar-name-color', color);
      document.documentElement.style.setProperty('--sidebar-nav-link-color--active', color);
      document.documentElement.style.setProperty('--sidebar-nav-link-border-color--active', color);
      document.documentElement.style.setProperty('--link-color', color);
      document.documentElement.style.setProperty('--pagination-title-color', color);
      document.documentElement.style.setProperty('--cover-link-color', color);
      document.documentElement.style.setProperty('--cover-button-primary-background', color);
      document.documentElement.style.setProperty('--cover-button-primary-border', '1px solid ' + color);
      document.documentElement.style.setProperty('--cover-button-color', color);
      document.documentElement.style.setProperty('--cover-button-border', '1px solid ' + color);
      document.documentElement.style.setProperty('--sidebar-nav-pagelink-background--active', 'no-repeat 0px center / 5px 6px linear-gradient(225deg, transparent 2.75px, ' + color + ' 2.75px 4.25px, transparent 4.25px), no-repeat 5px center / 5px 6px linear-gradient(135deg, transparent 2.75px, ' + color + ' 2.75px 4.25px, transparent 4.25px)');
      document.documentElement.style.setProperty('--sidebar-nav-pagelink-background--collapse', 'no-repeat 2px calc(50% - 2.5px) / 6px 5px linear-gradient(45deg, transparent 2.75px, ' + color + ' 2.75px 4.25px, transparent 4px), no-repeat 2px calc(50% + 2.5px) / 6px 5px linear-gradient(135deg, transparent 2.75px, ' + color + ' 2.75px 4.25px, transparent 4px)');
      document.documentElement.style.setProperty('--sidebar-nav-pagelink-background--loaded', 'no-repeat 0px center / 5px 6px linear-gradient(225deg, transparent 2.75px, ' + color + ' 2.75px 4.25px, transparent 4.25px), no-repeat 5px center / 5px 6px linear-gradient(135deg, transparent 2.75px, ' + color + ' 2.75px 4.25px, transparent 4.25px)');
    }

    // Update theme mode on preference change
    if (window.matchMedia) {
      window.matchMedia('(prefers-color-scheme: dark)').addListener(function (e) {
        updateThemeModeLinkColors();
      });
    }
  }

  // Register the plugin
  window.$docsify.plugins = [].concat(docsifyContentFetcher, window.$docsify.plugins);
})();
