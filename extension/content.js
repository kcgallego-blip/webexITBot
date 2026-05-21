// Content script to detect Zendesk ticket number
(function() {
  function extractTicketNumber() {
    // Try multiple selectors that Zendesk uses for ticket numbers
    
    // Method 1: Look for ticket number in URL
    const urlMatch = window.location.pathname.match(/\/tickets?\/(\d+)/);
    if (urlMatch) return urlMatch[1];
    
    // Method 2: Look for ticket title element
    const titleElement = document.querySelector('[data-test-id="ticket-title"], .ticket-title, h1');
    if (titleElement) {
      const text = titleElement.textContent || '';
      const match = text.match(/#?(\d{6,})/);
      if (match) return match[1];
    }
    
    // Method 3: Look for ticket number in various Zendesk elements
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
    
    // Method 4: Check page structure for ticket ID
    const breadcrumbs = document.querySelectorAll('.breadcrumb, nav a');
    for (const crumb of breadcrumbs) {
      const text = crumb.textContent.trim();
      if (text.match(/^\d+$/) && text.length >= 6) return text;
    }
    
    return null;
  }

  // Listen for messages from popup
  chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    if (request.action === 'getTicketNumber') {
      sendResponse({
        ticketNumber: extractTicketNumber()
      });
    }
  });

  // Also try to extract on page load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      // Ticket number will be fetched on demand
    });
  }
})();