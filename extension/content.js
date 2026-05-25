(function() {
  const SCRIPT_VERSION = '2026-05-23-ticket-reader-v3';
  if (window.__zendeskTicketHelperVersion === SCRIPT_VERSION) return;
  window.__zendeskTicketHelperVersion = SCRIPT_VERSION;

  function normalizeStatus(statusText) {
    const normalized = (statusText || '').trim().replace(/\s+/g, ' ').toUpperCase();
    const statusMap = {
      OPEN: 'Open',
      PENDING: 'Pending',
      SOLVED: 'Solved',
      'ON HOLD': 'On-Hold',
      'ON-HOLD': 'On-Hold'
    };

    return statusMap[normalized] || null;
  }

  function statusFromText(text) {
    const exactStatus = normalizeStatus(text);
    if (exactStatus) return exactStatus;

    const statusMatch = (text || '').match(/\b(OPEN|PENDING|SOLVED|ON[-\s]?HOLD)\b/i);
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

  // Create floating glass button on Zendesk page
  function createFloatingButton() {
    if (document.getElementById('glass-ticket-helper')) return;

    const btn = document.createElement('button');
    btn.id = 'glass-ticket-helper';
    btn.innerHTML = '✨ Ticket Helper';
    btn.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      z-index: 10000;
      background: rgba(11, 19, 38, 0.4);
      backdrop-filter: blur(12px);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 9999px;
      padding: 8px 16px;
      color: #afc6ff;
      font-size: 12px;
      font-family: Inter, sans-serif;
      cursor: pointer;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
      transition: all 0.3s ease;
    `;

    btn.addEventListener('mouseenter', () => {
      btn.style.transform = 'scale(1.05)';
      btn.style.boxShadow = '0 8px 32px rgba(0, 0, 0, 0.4), 0 0 20px rgba(175, 198, 255, 0.3)';
    });

    btn.addEventListener('mouseleave', () => {
      btn.style.transform = 'scale(1)';
      btn.style.boxShadow = '0 8px 32px rgba(0, 0, 0, 0.3)';
    });

    btn.addEventListener('click', () => {
      chrome.runtime.sendMessage({ action: 'openPopup' });
    });

    document.body.appendChild(btn);
  }

  chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    if (request.action === 'getTicketNumber' || request.action === 'getTicketDataV3') {
      waitForTicketData().then(sendResponse);
      return true;
    }
  });

  // Initialize floating button on Zendesk pages
  if (window.location.hostname.includes('zendesk.com')) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', createFloatingButton);
    } else {
      createFloatingButton();
    }
  }
})();
