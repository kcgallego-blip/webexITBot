document.addEventListener('DOMContentLoaded', function() {
  const emailInput = document.getElementById('email');
  const statusSelect = document.getElementById('status');
  const submitBtn = document.getElementById('submitBtn');
  const ticketNumberEl = document.getElementById('ticketNumber');
  const noTicketMsg = document.getElementById('noTicketMsg');
  const successMsg = document.getElementById('successMsg');
  const errorMsg = document.getElementById('errorMsg');
  const themeToggle = document.getElementById('themeToggle');

  // Theme handling
  let currentTheme = localStorage.getItem('theme') || 'dark';
  document.body.setAttribute('data-theme', currentTheme);

  themeToggle.addEventListener('click', () => {
    currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.body.setAttribute('data-theme', currentTheme);
    localStorage.setItem('theme', currentTheme);
  });

  // Load saved email
  chrome.storage.sync.get(['agentEmail'], function(result) {
    if (result.agentEmail) {
      emailInput.value = result.agentEmail;
    }
    updateButtonState();
  });

  // Save email when changed
  emailInput.addEventListener('change', function() {
    const email = this.value.trim();
    if (email) {
      chrome.storage.sync.set({ agentEmail: email }, function() {
        updateButtonState();
      });
    }
  });

  // Update button state based on inputs
  function updateButtonState() {
    const hasEmail = emailInput.value.trim() !== '';
    const hasStatus = statusSelect.value !== '';

    statusSelect.disabled = !hasEmail;
    submitBtn.disabled = !hasEmail || !hasStatus;
  }

  // Handle status change
  statusSelect.addEventListener('change', updateButtonState);

  function setDetectedStatus(status) {
    if (!status) return;

    const matchingOption = Array.from(statusSelect.options).find(option => option.value === status);
    if (matchingOption) {
      statusSelect.value = matchingOption.value;
    }
  }

  function showNoTicket() {
    ticketNumberEl.style.display = 'none';
    noTicketMsg.style.display = 'block';
    updateButtonState();
  }

  function showTicketNumber(ticketNumber) {
    if (!ticketNumber) return;

    ticketNumberEl.style.display = 'block';
    noTicketMsg.style.display = 'none';
    ticketNumberEl.textContent = ticketNumber;
    updateButtonState();
  }

  function getTicketNumberFromUrl(url) {
    const match = (url || '').match(/\/tickets?\/(\d{6,})(?:[/?#]|$)/i);
    return match ? match[1] : null;
  }

  function getTicketNumberFromText(text) {
    const labeledMatch = (text || '').match(/Ticket\s*#\s*(\d{6,})/i);
    if (labeledMatch) return labeledMatch[1];

    const numberMatch = (text || '').match(/\b(\d{6,})\b/);
    return numberMatch ? numberMatch[1] : null;
  }

  function applyDetectedTicket(ticketData, fallbackTicketNumber) {
    const ticketNumber = ticketData && ticketData.ticketNumber
      ? ticketData.ticketNumber
      : fallbackTicketNumber;

    if (ticketNumber) {
      ticketNumberEl.style.display = 'block';
      noTicketMsg.style.display = 'none';
      ticketNumberEl.textContent = ticketNumber;
      setDetectedStatus(ticketData && ticketData.status);
      updateButtonState();
    } else {
      showNoTicket();
    }
  }

  function requestTicketData(tabId, callback) {
    let finished = false;
    const timeoutId = setTimeout(() => {
      if (finished) return;
      finished = true;
      callback(null);
    }, 4500);

    chrome.tabs.sendMessage(tabId, { action: 'getTicketDataV3' }, function(response) {
      if (finished) return;
      finished = true;
      clearTimeout(timeoutId);

      if (chrome.runtime.lastError) {
        callback(null);
        return;
      }

      callback(response);
    });
  }

  function injectContentScript(tabId, callback) {
    if (!chrome.scripting || !chrome.scripting.executeScript) {
      callback(false);
      return;
    }

    chrome.scripting.executeScript({
      target: { tabId: tabId },
      files: ['content.js']
    }, function() {
      callback(!chrome.runtime.lastError);
    });
  }

  function scrapeTicketDataFromFrame(targetTicketNumber) {
    function normalizeStatus(statusText) {
      const normalized = (statusText || '').trim().replace(/\s+/g, ' ').toUpperCase();
      const statusMap = {
        OPEN: 'Open',
        PENDING: 'Pending',
        SOLVED: 'Solved',
        CLOSED: 'Solved',
        'ON HOLD': 'On-Hold',
        'ON-HOLD': 'On-Hold'
      };

      return statusMap[normalized] || null;
    }

    function statusFromText(text) {
      const exactStatus = normalizeStatus(text);
      if (exactStatus) return exactStatus;

      const statusMatch = (text || '').match(/\b(OPEN|PENDING|SOLVED|CLOSED|ON[-\s]?HOLD)\b/i);
      return statusMatch ? normalizeStatus(statusMatch[1]) : null;
    }

    function statusFromElement(element) {
      if (!element) return null;

      const textStatus = statusFromText(element.textContent);
      if (textStatus) return textStatus;

      const classStatus = normalizeStatus(
        Array.from(element.classList || []).find(className => /^(open|pending|solved|closed|on-?hold)$/i.test(className))
      );

      return classStatus;
    }

    function findTicketTab() {
      const directMatch = document.querySelector('[data-test-id="tabs-section-nav-item-ticket"]');
      if (directMatch && (!targetTicketNumber || directMatch.textContent.includes(targetTicketNumber))) {
        return directMatch;
      }

      if (targetTicketNumber) {
        const targetCandidates = document.querySelectorAll('[aria-current="page"], [role="link"], .btn.active, span, div, a, button');
        for (const candidate of targetCandidates) {
          if ((candidate.textContent || '').includes(targetTicketNumber)) {
            return candidate;
          }
        }
      }

      const candidates = document.querySelectorAll('[aria-current="page"], [role="link"], .btn.active, span, div, a, button');
      for (const candidate of candidates) {
        if (/Ticket\s*#\s*\d{6,}/i.test(candidate.textContent || '')) {
          return candidate;
        }
      }

      return null;
    }

    function findTicketNumber(ticketTab) {
      const tabMatch = ticketTab && ticketTab.textContent.match(/Ticket\s*#\s*(\d{6,})/i);
      if (tabMatch) return tabMatch[1];

      const urlMatch = window.location.href.match(/\/tickets?\/(\d{6,})(?:[/?#]|$)/i);
      if (urlMatch) return urlMatch[1];

      const bodyMatch = document.body && document.body.textContent.match(/Ticket\s*#\s*(\d{6,})/i);
      return bodyMatch ? bodyMatch[1] : null;
    }

    function findStatus(ticketTab) {
      const selectors = [
        '.ticket_status_label',
        '[class*="ticket_status_label"]',
        '[class*="status_label"]',
        '[class*="status"]',
        '[data-test-id*="status"]',
        '[aria-label*="status" i]',
        '.open',
        '.pending',
        '.solved'
      ];

      for (const selector of selectors) {
        const statusElement = ticketTab
          ? ticketTab.querySelector(selector)
          : document.querySelector(selector);
        const status = statusFromElement(statusElement);
        if (status) return status;
      }

      let current = ticketTab;
      let depth = 0;
      while (current && depth < 4) {
        const status = statusFromElement(current);
        if (status) return status;

        current = current.parentElement;
        depth += 1;
      }

      return null;
    }

    const ticketTab = findTicketTab();
    return {
      ticketNumber: findTicketNumber(ticketTab),
      status: findStatus(ticketTab),
      href: window.location.href
    };
  }

  function findBestTicketData(frameResults, fallbackTicketNumber) {
    const values = (frameResults || [])
      .map(result => result && result.result)
      .filter(Boolean);

    const matchingValues = fallbackTicketNumber
      ? values.filter(value => value.ticketNumber === fallbackTicketNumber)
      : values;
    const preferredValues = matchingValues.length ? matchingValues : values;
    const statusResult = preferredValues.find(value => value.status);
    const ticketResult = preferredValues.find(value => value.ticketNumber);

    return {
      ticketNumber: (ticketResult && ticketResult.ticketNumber) || fallbackTicketNumber || null,
      status: statusResult ? statusResult.status : null
    };
  }

  function readTicketDataFromAllFrames(tabId, fallbackTicketNumber, callback) {
    if (!chrome.scripting || !chrome.scripting.executeScript) {
      callback(null);
      return;
    }

    let finished = false;
    let attempts = 0;
    const maxAttempts = 10;
    const timeoutId = setTimeout(() => {
      if (finished) return;
      finished = true;
      callback(fallbackTicketNumber ? { ticketNumber: fallbackTicketNumber, status: null } : null);
    }, 2500);

    const finish = ticketData => {
      if (finished) return;
      finished = true;
      clearTimeout(timeoutId);
      callback(ticketData);
    };

    const read = () => {
      chrome.scripting.executeScript({
        target: { tabId: tabId, allFrames: true },
        func: scrapeTicketDataFromFrame,
        args: [fallbackTicketNumber]
      }, function(results) {
        if (finished) return;

        if (chrome.runtime.lastError) {
          finish(fallbackTicketNumber ? { ticketNumber: fallbackTicketNumber, status: null } : null);
          return;
        }

        const ticketData = findBestTicketData(results, fallbackTicketNumber);
        if ((ticketData.ticketNumber && ticketData.status) || attempts >= maxAttempts) {
          finish(ticketData);
          return;
        }

        attempts += 1;
        setTimeout(read, 150);
      });
    };

    read();
  }

  // Get fresh ticket data from the current tab each time the popup opens.
  chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
    if (tabs[0] && tabs[0].url && tabs[0].url.includes('zendesk.com')) {
      const fallbackTicketNumber = getTicketNumberFromUrl(tabs[0].url) || getTicketNumberFromText(tabs[0].title);
      let bestTicketNumber = fallbackTicketNumber;
      let completed = false;

      const finish = ticketData => {
        if (completed) return;
        completed = true;
        clearTimeout(globalTimeoutId);
        applyDetectedTicket(ticketData, bestTicketNumber);
      };

      const paintPartial = ticketData => {
        if (completed) return;

        if (ticketData && ticketData.ticketNumber) {
          bestTicketNumber = ticketData.ticketNumber;
        }

        if (ticketData && ticketData.status) {
          finish(ticketData);
          return;
        }

        if (bestTicketNumber) {
          showTicketNumber(bestTicketNumber);
        }
      };

      const globalTimeoutId = setTimeout(() => {
        if (completed) return;

        if (bestTicketNumber) {
          showTicketNumber(bestTicketNumber);
        } else {
          showNoTicket();
        }
      }, 3000);

      if (bestTicketNumber) {
        showTicketNumber(bestTicketNumber);
      }

      readTicketDataFromAllFrames(tabs[0].id, fallbackTicketNumber, function(frameTicketData) {
        paintPartial(frameTicketData);

        requestTicketData(tabs[0].id, function(ticketData) {
          paintPartial(ticketData);

          injectContentScript(tabs[0].id, function(injected) {
            if (!injected) {
              clearTimeout(globalTimeoutId);
              if (!completed && !bestTicketNumber) showNoTicket();
              return;
            }

            requestTicketData(tabs[0].id, function(retryTicketData) {
              clearTimeout(globalTimeoutId);
              if (retryTicketData && retryTicketData.status) {
                finish(retryTicketData);
                return;
              }

              paintPartial(retryTicketData);
              if (!completed && !bestTicketNumber) showNoTicket();
            });
          });
        });
      });
    } else {
      showNoTicket();
    }
  });

  // Handle submit
  submitBtn.addEventListener('click', function() {
    const ticketNum = ticketNumberEl.textContent;
    const email = emailInput.value.trim();
    const status = statusSelect.value;

    if (!ticketNum || ticketNum === 'Loading...') {
      showError('No ticket number detected');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Saving...';

    const API_BASE_URL = 'https://webexitbot.onrender.com';
    fetch(`${API_BASE_URL}/api/get-ticket`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        ticket_num: parseInt(ticketNum),
        agent: email,
        status: status
      })
    })
    .then(res => res.json())
    .then(data => {
      if (data.success) {
        showSuccess();
      } else {
        showError(data.error || 'Failed to save');
      }
    })
    .catch(err => {
      showError('Network error: ' + err.message);
    })
    .finally(() => {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Submit';
    });
  });

  function showSuccess() {
    successMsg.style.display = 'block';
    errorMsg.style.display = 'none';
    setTimeout(() => {
      successMsg.style.display = 'none';
    }, 3000);
  }

  function showError(message) {
    errorMsg.textContent = message;
    errorMsg.style.display = 'block';
    successMsg.style.display = 'none';
  }
});
