document.addEventListener('DOMContentLoaded', function() {
  const nameInput = document.getElementById('name');
  const emailInput = document.getElementById('email');
  const saveBtn = document.getElementById('saveBtn');
  const successMsg = document.getElementById('successMsg');
  const errorMsg = document.getElementById('errorMsg');
  const themeToggle = document.getElementById('themeToggle');
  const setupNotice = document.getElementById('setupNotice');

  let currentTheme = localStorage.getItem('theme') || 'dark';
  document.body.setAttribute('data-theme', currentTheme);

  themeToggle.addEventListener('click', () => {
    currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.body.setAttribute('data-theme', currentTheme);
    localStorage.setItem('theme', currentTheme);
  });

  function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  function updateButtonState() {
    const name = nameInput.value.trim();
    const email = emailInput.value.trim();
    saveBtn.disabled = !name || !isValidEmail(email);
    refreshSetupNotice(name, email);
  }

  function showSuccess(message) {
    successMsg.textContent = message;
    successMsg.style.display = 'block';
    errorMsg.style.display = 'none';
    setupNotice.style.display = 'none';
  }

  function showError(message) {
    errorMsg.textContent = message;
    errorMsg.style.display = 'block';
    successMsg.style.display = 'none';
  }

  function refreshSetupNotice(name, email) {
    setupNotice.style.display = name && email ? 'none' : 'block';
  }

  chrome.storage.sync.get(['agentName', 'agentEmail'], function(result) {
    const name = String(result.agentName || '').trim();
    const email = String(result.agentEmail || '').trim();

    nameInput.value = name;
    emailInput.value = email;
    refreshSetupNotice(name, email);
    updateButtonState();
  });

  nameInput.addEventListener('input', updateButtonState);
  emailInput.addEventListener('input', updateButtonState);

  saveBtn.addEventListener('click', function() {
    const name = nameInput.value.trim();
    const email = emailInput.value.trim();

    if (!name) {
      showError('Name is required');
      return;
    }

    if (!isValidEmail(email)) {
      showError('Enter a valid email address');
      return;
    }

    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';

    chrome.storage.sync.set({ agentName: name, agentEmail: email }, function() {
      if (chrome.runtime.lastError) {
        showError(chrome.runtime.lastError.message || 'Failed to save credentials');
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save';
        return;
      }

      chrome.runtime.sendMessage({ action: 'credentialsUpdated' }, function() {
        showSuccess('Saved. Zendesk submits will now be logged automatically.');
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save';
      });
    });
  });
});
