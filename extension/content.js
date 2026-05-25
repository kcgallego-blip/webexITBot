(function() {
  const SCRIPT_VERSION = '2026-05-26-ticket-reader-v5';
  if (window.__zendeskTicketHelperVersion === SCRIPT_VERSION) return;
  window.__zendeskTicketHelperVersion = SCRIPT_VERSION;

  const floatingButton = document.getElementById('glass-ticket-helper');
  if (floatingButton) floatingButton.remove();

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
    const ticketTab = extractTicketTab();
    if (ticketTab) {
      const tabMatch = ticketTab.textContent.match(/Ticket\s*#\s*(\d{6,})/i);
      if (tabMatch) return tabMatch[1];
    }

    const urlMatch = window.location.href.match(/\/tickets?\/(\d{6,})(?:[/?#]|$)/i);
    if (urlMatch) return urlMatch[1];

    const bodyMatch = document.body.textContent.match(/Ticket\s*#\s*(\d{6,})/i);
    if (bodyMatch) return bodyMatch[1];

    const titleElement = document.querySelector('[data-test-id="ticket-title"], .ticket-title, h1');
    if (titleElement) {
      const text = titleElement.textContent || '';
      const match = text.match(/#?(\d{6,})/);
      if (match) return match[1];
    }

    const selectors = [
      '[data-ticket-id]',
      '.ticket-header [class*="ticket"]',
      '.request-info [class*="id"]',
      '[class*="ticket-number"]',
      '.ticket-view-header'
    ];

    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (el) {
        const text = el.textContent || el.getAttribute('data-ticket-id') || el.getAttribute('data-test-id') || '';
        const match = text.match(/(\d{6,})/);
        if (match) return match[1];
      }
    }

    const breadcrumbs = document.querySelectorAll('.breadcrumb, nav a');
    for (const crumb of breadcrumbs) {
      const text = crumb.textContent.trim();
      if (text.match(/^\d+$/) && text.length >= 6) return text;
    }

    return null;
  }

  function extractTicketStatus() {
    const ticketTab = extractTicketTab();
    const statusSelectors = [
      '.ticket_status_label',
      '[class*="ticket_status_label"]'
    ];

    for (const selector of statusSelectors) {
      const statusElement = ticketTab
        ? ticketTab.querySelector(selector)
        : document.querySelector(selector);

      if (statusElement) {
        const status = statusFromText(statusElement.textContent);
        if (status) return status;
      }
    }

    if (ticketTab) {
      const status = statusFromText(ticketTab.textContent);
      if (status) return status;
    }

    return null;
  }

  function getTicketData() {
    return {
      ticketNumber: extractTicketNumber(),
      status: extractTicketStatus()
    };
  }

  function waitForTicketData() {
    return new Promise(resolve => {
      let attempts = 0;
      const maxAttempts = 20;

      const read = () => {
        const ticketData = getTicketData();

        if ((ticketData.ticketNumber && ticketData.status) || attempts >= maxAttempts) {
          resolve(ticketData);
          return;
        }

        attempts += 1;
        setTimeout(read, 150);
      };

      read();
    });
  }

  chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    if (request.action === 'getTicketNumber' || request.action === 'getTicketDataV3') {
      waitForTicketData().then(sendResponse);
      return true;
    }
  });

})();
