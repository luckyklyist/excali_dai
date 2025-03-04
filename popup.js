document.addEventListener("DOMContentLoaded", () => {
  displaySavedURLs();
  document
    .getElementById("saveButton")
    .addEventListener("click", initiateUrlSave);

  document
    .getElementById("confirmSaveBtn")
    .addEventListener("click", confirmSave);

  document
    .getElementById("cancelSaveBtn")
    .addEventListener("click", cancelSave);
});

// Global variables to store temporary data between steps
let temporaryUrlData = {
  url: null,
  extractedTitle: null,
};

function initiateUrlSave() {
  chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
    if (!tabs || tabs.length === 0) {
      showMessage("No active tab found.", "error");
      return;
    }

    const tab = tabs[0];
    const url = tab.url;

    if (url && url.includes("excalidraw.com")) {
      try {
        // Show loading state
        const saveButton = document.getElementById("saveButton");
        const originalButtonContent = saveButton.innerHTML;
        saveButton.innerHTML = `
          <svg class="animate-spin w-5 h-5 mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          Processing...
        `;

        // Execute script to find the URL or trigger the share flow
        let extractedUrl = null;
        try {
          const results = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            function: () => {
              return new Promise((resolve) => {
                // Function to get URL from various UI elements
                const getUrlFromUI = () => {
                  // Check if share dialog is open and has link field
                  const linkInput = document.querySelector(
                    'input[readonly][value^="https://excalidraw.com/#"]'
                  );
                  if (linkInput) {
                    return linkInput.value;
                  }

                  // Check for link in export dialog
                  const exportField = document.querySelector(
                    ".ExcTextField__input input[readonly]"
                  );
                  if (
                    exportField &&
                    exportField.value.includes("excalidraw.com")
                  ) {
                    return exportField.value;
                  }

                  return null;
                };

                // First check if link is already available
                let url = getUrlFromUI();
                if (url) {
                  resolve(url);
                  return;
                }

                // If not found, try to click the share button
                const shareButton = document.querySelector(
                  "button.collab-button"
                );
                if (shareButton) {
                  shareButton.click();

                  // Wait for share dialog to open
                  setTimeout(() => {
                    // Try to click "Export to link" button
                    const exportToLinkButton = Array.from(
                      document.querySelectorAll("button")
                    ).find((btn) => btn.textContent.includes("Export to Link"));

                    if (exportToLinkButton) {
                      exportToLinkButton.click();

                      // Wait for the link to be generated
                      setTimeout(() => {
                        url = getUrlFromUI();
                        resolve(url);
                      }, 2000);
                    } else {
                      resolve(null);
                    }
                  }, 1000);
                } else {
                  resolve(null);
                }
              });
            },
          });

          extractedUrl =
            results && results[0] && results[0].result
              ? results[0].result
              : null;
        } catch (scriptError) {
          console.warn("Failed to execute script:", scriptError);
          // Continue with tab URL if script execution fails
        }

        const finalUrl = extractedUrl || url;

        // Restore button state
        saveButton.innerHTML = originalButtonContent;

        // Copy the URL to the clipboard
        await navigator.clipboard.writeText(finalUrl);
        showMessage("URL copied to clipboard!", "success");

        // Format URL for display
        const urlObj = new URL(finalUrl);
        const displayUrl =
          urlObj.pathname === "/"
            ? "Home Canvas"
            : decodeURIComponent(urlObj.hash.split("=")[0].replace("#", "")) ||
              "Excalidraw Drawing";

        // Check if URL already exists in our storage
        chrome.storage.local.get({ savedURLs: [], urlMeta: {} }, (data) => {
          let savedURLs = data.savedURLs;
          let urlMeta = data.urlMeta || {};

          if (savedURLs.includes(finalUrl)) {
            // URL already exists, just update timestamp
            showMessage("URL already saved!", "info");
            urlMeta[finalUrl].timestamp = Date.now();
            chrome.storage.local.set({ urlMeta: urlMeta }, () => {
              displaySavedURLs();
            });
          } else {
            // New URL, show title input
            temporaryUrlData = {
              url: finalUrl,
              extractedTitle: displayUrl,
            };

            // Show the title input field
            const titleInput = document.getElementById("urlTitle");
            titleInput.value = displayUrl;
            document
              .getElementById("titleInputContainer")
              .classList.remove("hidden");
            titleInput.focus();
          }
        });
      } catch (error) {
        console.error("Error:", error);
        showMessage("Could not save URL: " + error.message, "error");
      }
    } else {
      showMessage("This tab is not an Excalidraw page.", "error");
    }
  });
}

function confirmSave() {
  if (!temporaryUrlData.url) {
    showMessage("No URL to save.", "error");
    return;
  }

  const customTitle =
    document.getElementById("urlTitle").value.trim() ||
    temporaryUrlData.extractedTitle;

  // Save the URL using chrome.storage
  chrome.storage.local.get({ savedURLs: [], urlMeta: {} }, (data) => {
    let savedURLs = data.savedURLs;
    let urlMeta = data.urlMeta || {};

    // Create metadata for this URL
    urlMeta[temporaryUrlData.url] = {
      title: customTitle,
      timestamp: Date.now(),
    };

    // Add URL to the beginning of the array
    savedURLs.unshift(temporaryUrlData.url);

    chrome.storage.local.set({ savedURLs: savedURLs, urlMeta: urlMeta }, () => {
      document.getElementById("titleInputContainer").classList.add("hidden");
      temporaryUrlData = { url: null, extractedTitle: null };
      displaySavedURLs();
      showMessage("URL saved successfully!", "success");
    });
  });
}

function cancelSave() {
  document.getElementById("titleInputContainer").classList.add("hidden");
  temporaryUrlData = { url: null, extractedTitle: null };
  showMessage("Save cancelled", "info");
}

function showMessage(msg, type = "success") {
  const msgDiv = document.getElementById("message");

  // Create status icon based on message type
  let icon = "";
  if (type === "success") {
    icon = `<svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
            </svg>`;
  } else if (type === "error") {
    icon = `<svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
            </svg>`;
  } else if (type === "info") {
    icon = `<svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
            </svg>`;
  }

  // Set the message with icon
  msgDiv.innerHTML = `<span class="flex items-center">${icon}${msg}</span>`;

  // Reset classes
  msgDiv.className =
    "mt-3 text-center text-sm font-medium h-6 flex items-center justify-center";

  // Add color based on message type
  if (type === "error") {
    msgDiv.classList.add("text-red-400");
  } else if (type === "success") {
    msgDiv.classList.add("text-green-400");
  } else if (type === "info") {
    msgDiv.classList.add("text-blue-400");
  }

  setTimeout(() => {
    msgDiv.innerHTML = "";
  }, 3000);
}

function displaySavedURLs() {
  chrome.storage.local.get({ savedURLs: [], urlMeta: {} }, (data) => {
    const list = document.getElementById("linkList");
    const urlCount = document.getElementById("urlCount");
    list.innerHTML = "";

    const savedURLs = data.savedURLs;
    const urlMeta = data.urlMeta || {};

    // Update the counter
    urlCount.textContent = savedURLs.length;

    if (savedURLs.length === 0) {
      const emptyState = document.createElement("div");
      emptyState.className = "text-center py-8 fade-in";
      emptyState.innerHTML = `
        <svg class="w-16 h-16 mx-auto text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1" d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z"></path>
        </svg>
        <p class="mt-2 text-gray-400">No URLs saved yet.</p>
        <p class="text-sm text-gray-600 mt-1">Visit Excalidraw and click 'Save Current URL'</p>
      `;
      list.appendChild(emptyState);
      return;
    }

    savedURLs.forEach((url, index) => {
      const meta = urlMeta[url] || {
        title: "Excalidraw Link",
        timestamp: Date.now() - index * 60000, // Fallback timestamps
      };

      const li = document.createElement("li");
      li.className =
        "bg-gray-800 border border-gray-700 rounded-lg shadow-md hover:shadow-lg transition-all duration-200 fade-in";
      if (index === 0) {
        li.classList.add("pulse");
      }

      // Format date
      const date = new Date(meta.timestamp);
      const dateFormatted = `${date.toLocaleDateString()} at ${date.toLocaleTimeString(
        [],
        { hour: "2-digit", minute: "2-digit" }
      )}`;

      // Determine if this is a recent entry (within last hour)
      const isRecent = Date.now() - meta.timestamp < 3600000;
      const newBadge = isRecent
        ? `<span class="bg-indigo-900 text-indigo-200 text-xs px-2 py-0.5 rounded ml-2">New</span>`
        : "";

      // Create content
      li.innerHTML = `
        <div class="p-3">
          <div class="flex items-start justify-between">
            <div>
              <a href="${url}" target="_blank" class="text-indigo-400 hover:text-indigo-300 font-medium mb-1 truncate max-w-xs flex items-center">
                ${meta.title}
                ${newBadge}
              </a>
            </div>
            <div class="flex space-x-1 ml-2">
              <button class="edit-btn p-1 text-gray-400 hover:text-blue-400 rounded hover:bg-gray-700" title="Edit Title">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path>
                </svg>
              </button>
              <button class="copy-btn p-1 text-gray-400 hover:text-indigo-400 rounded hover:bg-gray-700" title="Copy URL">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"></path>
                </svg>
              </button>
              <button class="delete-btn p-1 text-gray-400 hover:text-red-500 rounded hover:bg-gray-700" title="Delete URL">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                </svg>
              </button>
            </div>
          </div>
          <div class="text-xs text-gray-500 truncate mt-1" title="${url}">
            ${url}
          </div>
          <div class="text-xs text-gray-500 mt-2 flex items-center">
            <svg class="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
            </svg>
            ${dateFormatted}
          </div>
        </div>
      `;

      // Add event listeners
      const editBtn = li.querySelector(".edit-btn");
      editBtn.addEventListener("click", (e) => {
        e.stopPropagation();

        // Create inline edit form
        const titleElement = li.querySelector("a");
        const currentTitle = meta.title;

        // Replace title with input field
        const editContainer = document.createElement("div");
        editContainer.className = "flex items-center";
        editContainer.innerHTML = `
          <input type="text" class="input-dark py-1 px-2 rounded text-sm flex-grow" value="${currentTitle}">
          <button class="save-edit-btn ml-2 p-1 text-green-500 hover:text-green-400 rounded hover:bg-gray-700">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
            </svg>
          </button>
          <button class="cancel-edit-btn ml-1 p-1 text-red-500 hover:text-red-400 rounded hover:bg-gray-700">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
            </svg>
          </button>
        `;

        titleElement.replaceWith(editContainer);
        const inputField = editContainer.querySelector("input");
        inputField.focus();
        inputField.select();

        // Save button handler
        const saveEditBtn = editContainer.querySelector(".save-edit-btn");
        saveEditBtn.addEventListener("click", () => {
          const newTitle = inputField.value.trim() || currentTitle;
          chrome.storage.local.get({ urlMeta: {} }, (data) => {
            const urlMeta = data.urlMeta || {};
            urlMeta[url].title = newTitle;
            chrome.storage.local.set({ urlMeta: urlMeta }, () => {
              displaySavedURLs();
              showMessage("Title updated!", "success");
            });
          });
        });

        // Cancel button handler
        const cancelEditBtn = editContainer.querySelector(".cancel-edit-btn");
        cancelEditBtn.addEventListener("click", () => {
          displaySavedURLs();
        });
      });

      const copyBtn = li.querySelector(".copy-btn");
      copyBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(url).then(() => {
          showMessage("URL copied to clipboard!", "success");
        });
      });

      const deleteBtn = li.querySelector(".delete-btn");
      deleteBtn.addEventListener("click", (e) => {
        e.stopPropagation();

        // Add a simple fade out animation
        li.style.transition = "all 0.3s ease";
        li.style.opacity = "0";
        li.style.transform = "translateX(10px)";

        setTimeout(() => {
          chrome.storage.local.get({ savedURLs: [], urlMeta: {} }, (data) => {
            const updatedURLs = data.savedURLs.filter((item) => item !== url);
            const updatedMeta = data.urlMeta || {};

            // Remove the metadata for this URL
            delete updatedMeta[url];

            chrome.storage.local.set(
              {
                savedURLs: updatedURLs,
                urlMeta: updatedMeta,
              },
              () => {
                displaySavedURLs();
                showMessage("URL deleted!", "info");
              }
            );
          });
        }, 300);
      });

      // Add to the list
      list.appendChild(li);
    });
  });
}
