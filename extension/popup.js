document.addEventListener('DOMContentLoaded', function() {
  const emailInput = document.getElementById('email');
  const statusSelect = document.getElementById('status');
  const submitBtn = document.getElementById('submitBtn');
  const ticketNumberEl = document.getElementById('ticketNumber');
  const noTicketMsg = document.getElementById('noTicketMsg');
  const successMsg = document.getElementById('successMsg');
  const errorMsg = document.getElementById('errorMsg');

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

  // Get ticket number from content script
  chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
    if (tabs[0] && tabs[0].url && tabs[0].url.includes('zendesk.com')) {
      chrome.tabs.sendMessage(tabs[0].id, { action: 'getTicketNumber' }, function(response) {
        if (response && response.ticketNumber) {
          ticketNumberEl.textContent = response.ticketNumber;
        } else {
          ticketNumberEl.style.display = 'none';
          noTicketMsg.style.display = 'block';
        }
      });
    } else {
      ticketNumberEl.style.display = 'none';
      noTicketMsg.style.display = 'block';
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
      submitBtn.textContent = 'Submit to Database';
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