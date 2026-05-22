(function() {
  function extractTicketNumber() {
    const urlMatch = window.location.pathname.match(/\/tickets?\/(\d+)/);
    if (urlMatch) return urlMatch[1];

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
    if (request.action === 'getTicketNumber') {
      sendResponse({
        ticketNumber: extractTicketNumber()
      });
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