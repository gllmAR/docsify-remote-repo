(function () {
    function remoteRepoPlugin(hook, vm) {
      // Plugin options
      var options = vm.config.remoteRepoPlugin || {};
  
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
                    if (currentBasePath.includes("githubusercontent.com")) {
                      editThisPageLink = editThisPageLink.replace('raw.githubusercontent.com', existingEditThisPageLink.includes('github.dev') ? 'github.dev' : 'github.com')
                        .replace(/\/main/, '/blob/main')
                        .replace(/\/master/, '/blob/master');
                    } else if (currentBasePath.includes("codeberg.page")) {
                      editThisPageLink = editThisPageLink.replace('raw.codeberg.page', 'codeberg.org');
                      editThisPageLink = editThisPageLink + '/src/branch/main/';
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
          if (currentBasePath.includes("raw.githubusercontent.com") || currentBasePath.includes("raw.codeberg.page")) {
            const images = Array.from(htmlElement.querySelectorAll('img'));
            for (const image of images) {
              let imgUrl = image.getAttribute('src');
              if (imgUrl && !(imgUrl.includes('://') || imgUrl.startsWith('//'))) {
                imgUrl = imgUrl.replace(/^\/+/g, '');
                imgUrl = currentBasePath + '/' + imgUrl;
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
  
          next(htmlElement.innerHTML);
        } else {
          next(html);
        }
      });
  
      // Hook: beforeEach
      hook.beforeEach(function (html) {
        if (vm.config['basePath']) {
          // Error handling
          const { file, response } = vm.route;
          const { ok, status } = response;
          if (ok === false) {
            let errorMessage;
            switch (status) {
              case 404:
                errorMessage = `Looks like the file **${vm.route.file}** couldn't be found on the server. Please check if the **basePath** and **homepage** URL parameters are correct or if the file has been moved or deleted.\n\nError code ${status}`;
                break;
              case 500:
                errorMessage = `The server encountered an internal error while trying to fetch **${vm.route.file}**.\nError code ${status}`;
                break;
              case 403:
                errorMessage = `Access to **${vm.route.file}** is forbidden. You may not have the necessary permissions to view this file.\nError code ${status}`;
                break;
              case 401:
                errorMessage = `Unauthorized access. Please make sure you are logged in and have the appropriate permissions to access **${vm.route.file}**.\nError code ${status}`;
                break;
              case 0:
                errorMessage = `An error occurred while trying to fetch **${vm.route.file}**. This could be due to one of the following reasons:
                \n- Cross-Origin Request Blocked: The server at the requested origin may not allow cross-origin requests. Please check the server's [CORS settings](https://www.w3.org/wiki/CORS_Enabled).
                \n- Network Issue: There may be a problem with your internet connection or the server could be unreachable.
                \n- Request Aborted: The request might have been canceled before it could complete.
                \n- File Not Found (404): The file might not exist or the URL could be incorrect, but the error response was blocked due to cross-origin restrictions.\n\nError code ${status}`;
                break;
              default:
                errorMessage = `An unexpected error occurred while requesting the file **${vm.route.file}**.\nError code ${status}`;
            }
            return [
              `# Whoops!`,
              errorMessage,
            ].join('\n\n');
          }
  
          // Additional processing can be added here
        }
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
  
          // Additional adjustments can be added here
        }
      });
  
      // Hook: ready
      hook.ready(function () {
        if (vm.config['basePath']) {
          return; // Exit if basePath is present
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
        document.documentElement.style.setProperty('--link-color', color);
        // You can set additional CSS variables here as needed
      }
  
      // Update theme mode on preference change
      if (window.matchMedia) {
        window.matchMedia('(prefers-color-scheme: dark)').addListener(function (e) {
          updateThemeModeLinkColors();
        });
      }
    }
  
    // Register the plugin
    window.$docsify.plugins = [].concat(remoteRepoPlugin, window.$docsify.plugins);
  })();
  