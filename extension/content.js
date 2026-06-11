(function() {
  const SCRIPT_VERSION = '2026-06-01-zendesk-submit-listener-v4';
  if (window.__zendeskTicketHelperVersion === SCRIPT_VERSION) return;
  window.__zendeskTicketHelperVersion = SCRIPT_VERSION;

  let lastClick = null;

  function normalizeStatus(statusText) {
    const normalized = String(statusText || '').trim().replace(/\s+/g, ' ').toUpperCase();
    const statusMap = {
      NEW: 'Open',
      OPEN: 'Open',
      PENDING: 'Pending',
      SOLVED: 'Solved',
      CLOSED: 'Solved',
      HOLD: 'On-Hold',
      'ON HOLD': 'On-Hold',
      'ON-HOLD': 'On-Hold'
    };

    return statusMap[normalized] || null;
  }

  function statusFromText(text) {
    const submitMatch = String(text || '').match(/Submit\s+as\s+(.+)/i);
    if (submitMatch) {
      const status = normalizeStatus(submitMatch[1].replace(/\s+/g, ' '));
      if (status) return status;
    }

    // Find all status keywords in the text and return the last one found
    // This handles cases where multiple statuses appear in the text (e.g., dropdown menus)
    const text_upper = String(text || '').toUpperCase();
    const statusKeywords = ['SOLVED', 'CLOSED', 'PENDING', 'ON-HOLD', 'ON HOLD', 'HOLD', 'OPEN'];
    let lastStatusIndex = -1;
    let lastStatusKeyword = null;
    
    for (const keyword of statusKeywords) {
      const index = text_upper.lastIndexOf(keyword);
      if (index > lastStatusIndex) {
        lastStatusIndex = index;
        lastStatusKeyword = keyword;
      }
    }
    
    return lastStatusKeyword ? normalizeStatus(lastStatusKeyword) : null;
  }

  function extractTicketTab() {
    const directMatch = document.querySelector('[data-test-id="tabs-section-nav-item-ticket"]');
    if (directMatch) return directMatch;

    const candidates = document.querySelectorAll('[aria-current="page"], [role="link"], .btn.active, span');
    for (const candidate of candidates) {
      if (/Ticket\s*#\s*\d{6,}/i.test(candidate.textContent || '')) {
        return candidate;
      }
    }

    return null;
  }

  function extractTicketNumber() {
    const urlMatch = window.location.href.match(/\/tickets?\/(\d{6,})(?:[/?#]|$)/i);
    if (urlMatch) return urlMatch[1];

    const ticketTab = extractTicketTab();
    if (ticketTab) {
      const tabMatch = ticketTab.textContent.match(/Ticket\s*#\s*(\d{6,})/i);
      if (tabMatch) return tabMatch[1];
    }

    const titleElement = document.querySelector('[data-test-id="ticket-title"], .ticket-title, h1');
    if (titleElement) {
      const titleMatch = String(titleElement.textContent || '').match(/#?(\d{6,})/);
      if (titleMatch) return titleMatch[1];
    }

    const bodyMatch = document.body && document.body.textContent.match(/Ticket\s*#\s*(\d{6,})/i);
    return bodyMatch ? bodyMatch[1] : null;
  }

  function extractStatusFromSubmitElement(element) {
    if (!element) return null;

    // Priority 1: Check data-cy-test-element attribute (most reliable for status buttons)
    const dataCyTestElement = element.getAttribute('data-cy-test-element');
    if (dataCyTestElement) {
      const normalized = normalizeStatus(dataCyTestElement);
      if (normalized) return normalized;
    }

    // Priority 2: Check strong tag (used in some Zendesk layouts)
    const strongStatus = element.querySelector('strong');
    const strongText = strongStatus && strongStatus.textContent;
    const normalizedStrong = normalizeStatus(strongText);
    if (normalizedStrong) return normalizedStrong;

    // Priority 3: Check other data attributes
    const dataStatus =
      element.getAttribute('data-action-id') ||
      element.getAttribute('data-test-id') ||
      element.getAttribute('data-tracking-id');
    const normalizedDataStatus = statusFromText(String(dataStatus || '').replace(/submit_button-menu-|submit_button-button|submitReply/gi, ' '));
    if (normalizedDataStatus) return normalizedDataStatus;

    // Priority 4: Parse element's text content (fallback)
    return statusFromText(element.textContent || '');
  }

  function normalizeText(value) {
    return String(value || '').trim().replace(/\s+/g, ' ');
  }

  function extractOwnerName(ownerValue) {
    const normalizedValue = normalizeText(ownerValue);
    const slashIndex = normalizedValue.lastIndexOf('/');

    if (slashIndex === -1) return null;

    const ownerName = normalizeText(normalizedValue.slice(slashIndex + 1));
    return ownerName || null;
  }

  function extractOwnerData() {
    const ownerInputs = Array.from(document.querySelectorAll([
      'input[role="combobox"][data-garden-id="dropdowns.combobox.input"]',
      'input[role="combobox"][data-garden-container-id="containers.field.input"]',
      'input[role="combobox"][aria-autocomplete="list"]'
    ].join(',')))
      .map(input => normalizeText(input.value))
      .filter(Boolean);

    const ownerValue = ownerInputs.find(value => value.includes('/')) || ownerInputs[0] || null;

    return {
      ownerValue,
      ownerName: extractOwnerName(ownerValue)
    };
  }

  function findCurrentSubmitButton() {
    return document.querySelector('[data-test-id="submit_button-button"], [data-tracking-id="submit_button-button"]');
  }

  function findSubmitTarget(startElement) {
    if (!startElement || !startElement.closest) return null;

    return startElement.closest([
      '[data-test-id="submit_button-button"]',
      '[data-tracking-id="submit_button-button"]',
      '[data-support-suite-trial-onboarding-id="submitReply"]',
      '[data-test-id^="submit_button-menu-"]',
      '[data-action-id^="submit_button-menu-"]',
      '[data-tracking-id^="submit_button-menu-"]',
      '[data-cy-test-id="submit_button-menu"]',
      '[data-cy-test-element="open"]',
      '[data-cy-test-element="pending"]',
      '[data-cy-test-element="hold"]',
      '[data-cy-test-element="solved"]',
      '[role="menuitem"][data-cy-test-element]'
    ].join(','));
  }

  function getSubmitPayload(target) {
    const ticketNumber = extractTicketNumber();
    const status = extractStatusFromSubmitElement(target) || extractStatusFromSubmitElement(findCurrentSubmitButton());
    const ownerData = extractOwnerData();

    return {
      ticketNumber,
      status,
      ownerValue: ownerData.ownerValue,
      ownerName: ownerData.ownerName,
      href: window.location.href,
      detectedAt: new Date().toISOString()
    };
  }

  function getShortcutStatus(event) {
    if (!event.ctrlKey || !event.altKey) return null;

    const shortcutStatusMap = {
      S: 'Solved',
      D: 'On-Hold',
      O: 'Open',
      P: 'Pending'
    };

    return shortcutStatusMap[String(event.key || '').toUpperCase()] || null;
  }

  function getShortcutPayload(status) {
    const ownerData = extractOwnerData();

    return {
      ticketNumber: extractTicketNumber(),
      status,
      ownerValue: ownerData.ownerValue,
      ownerName: ownerData.ownerName,
      href: window.location.href,
      detectedAt: new Date().toISOString()
    };
  }

  function sendSubmission(payload) {
    if (!payload.ticketNumber || !payload.status) return;

    const now = Date.now();
    const clickKey = `${payload.ticketNumber}:${payload.status}`;

    if (lastClick && lastClick.key === clickKey && now - lastClick.timestamp < 1500) return;

    lastClick = { key: clickKey, timestamp: now };

    chrome.runtime.sendMessage({
      action: 'zendeskSubmitDetected',
      payload
    });
  }

  function handleSubmitEvent(event) {
    const submitTarget = findSubmitTarget(event.target);
    if (!submitTarget) return;

    sendSubmission(getSubmitPayload(submitTarget));
  }

  function handleSubmitKeydown(event) {
    const shortcutStatus = getShortcutStatus(event);
    if (shortcutStatus) {
      setTimeout(() => sendSubmission(getShortcutPayload(shortcutStatus)), 250);
      return;
    }

    if (event.key !== 'Enter' && event.key !== ' ') return;

    handleSubmitEvent(event);
  }

  function isConfirmAndMergeButton(element) {
    if (!element) return false;
    return element.id === 'btn-ticket-confirm-and-merge' || 
           element.closest('#btn-ticket-confirm-and-merge') !== null;
  }

  function getConfirmAndMergePayload() {
    const ownerData = extractOwnerData();

    return {
      ticketNumber: extractTicketNumber(),
      status: 'Solved',
      ownerValue: ownerData.ownerValue,
      ownerName: ownerData.ownerName,
      href: window.location.href,
      detectedAt: new Date().toISOString()
    };
  }

  function handleConfirmAndMerge(event) {
    if (!isConfirmAndMergeButton(event.target)) return;

    sendSubmission(getConfirmAndMergePayload());
  }

  chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    if (request.action === 'getTicketNumber' || request.action === 'getTicketDataV3') {
      sendResponse({
        ticketNumber: extractTicketNumber(),
        status: extractStatusFromSubmitElement(findCurrentSubmitButton()),
        ...extractOwnerData()
      });
      return false;
    }

    return false;
  });

  document.addEventListener('pointerdown', handleSubmitEvent, true);
  document.addEventListener('mousedown', handleSubmitEvent, true);
  document.addEventListener('click', handleSubmitEvent, true);
  document.addEventListener('click', handleConfirmAndMerge, true);
  document.addEventListener('keydown', handleSubmitKeydown, true);
})();
