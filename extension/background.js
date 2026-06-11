const SUPABASE_URL = 'https://kakarweekupnwikvtjwq.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtha2Fyd2Vla3Vwbndpa3Z0andxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgxNzgxMjAsImV4cCI6MjA5Mzc1NDEyMH0.MFUbzmXfWYUoVNGw67nuywA0Zk4aFaxYezdcWpPXTxY';
const SUPABASE_TABLE = 'tph';
const OWNER_BYPASS_VALUES = [];

const CONFIG_PLACEHOLDER_RE = /YOUR_PROJECT|YOUR_SUPABASE_ANON_KEY/i;
let lastSubmission = null;

function hasSupabaseConfig() {
  return SUPABASE_URL && SUPABASE_ANON_KEY && !CONFIG_PLACEHOLDER_RE.test(`${SUPABASE_URL} ${SUPABASE_ANON_KEY}`);
}

function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getSingaporeDate(date = new Date()) {
  const utcTime = date.getTime() + date.getTimezoneOffset() * 60000;
  return new Date(utcTime + 8 * 60 * 60000);
}

function getShiftDate(date = new Date()) {
  const singaporeTime = getSingaporeDate(date);

  if (singaporeTime.getHours() < 18) {
    singaporeTime.setDate(singaporeTime.getDate() - 1);
  }

  return formatDate(singaporeTime);
}

function normalizeStatus(status) {
  const normalized = String(status || '').trim().replace(/\s+/g, ' ').toUpperCase();
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

function normalizeText(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function isBypassOwnerValue(ownerValue) {
  const normalizedOwnerValue = normalizeText(ownerValue);

  if (!normalizedOwnerValue) return false;

  return OWNER_BYPASS_VALUES.some(value => normalizeText(value) === normalizedOwnerValue);
}

function isOwnTicket(savedName, ownerName, ownerValue) {
  if (isBypassOwnerValue(ownerValue)) return true;

  const normalizedSavedName = normalizeText(savedName);
  const normalizedOwnerName = normalizeText(ownerName);

  return Boolean(normalizedSavedName && normalizedOwnerName && normalizedSavedName === normalizedOwnerName);
}

function buildSupabaseHeaders(extraHeaders = {}) {
  return {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json',
    ...extraHeaders
  };
}

function supabaseEndpoint(query = '') {
  const baseUrl = String(SUPABASE_URL).replace(/\/+$/, '');
  const table = encodeURIComponent(SUPABASE_TABLE);
  return `${baseUrl}/rest/v1/${table}${query}`;
}

async function upsertTphRecord(record) {
  const response = await fetch(supabaseEndpoint('?on_conflict=ticket_num,agent,shift_date'), {
    method: 'POST',
    headers: buildSupabaseHeaders({ Prefer: 'resolution=merge-duplicates,return=minimal' }),
    body: JSON.stringify(record)
  });

  if (response.ok) return;

  const errorText = await response.text();
  const error = new Error(errorText || `Supabase upsert failed with status ${response.status}`);
  error.status = response.status;
  throw error;
}

function getUserFacingError(error) {
  const message = String(error?.message || error || '');

  if (/row-level security|violates row-level security|permission denied|not authorized|jwt|policy/i.test(message)) {
    return 'Email is not recognized or allowed by the database. Check the saved email in the extension profile.';
  }

  if (/duplicate key|conflict/i.test(message)) {
    return 'Database conflict while saving TPH status. Please try again.';
  }

  if (/Failed to fetch|NetworkError|Load failed/i.test(message)) {
    return 'Network error while saving TPH status. Check your connection and try again.';
  }

  return `TPH logging failed: ${message || 'Unknown error'}`;
}

async function saveZendeskSubmission(payload) {
  if (!hasSupabaseConfig()) {
    throw new Error('Supabase URL and anon key are not configured in background.js');
  }

  const ticketNumber = Number(payload.ticketNumber);
  const status = normalizeStatus(payload.status);
  const shiftDate = getShiftDate(new Date());

  if (!Number.isFinite(ticketNumber) || ticketNumber <= 0) {
    throw new Error('No valid Zendesk ticket number detected');
  }

  if (!status) {
    throw new Error('No valid Zendesk submit status detected');
  }

  const credentials = await chrome.storage.sync.get(['agentName', 'agentEmail']);
  const name = String(credentials.agentName || '').trim();
  const email = String(credentials.agentEmail || '').trim();

  if (!name || !email) {
    await setMissingCredentialsBadge();
    return {
      saved: false,
      skipped: true,
      reason: 'missing_credentials',
      message: 'Extension profile is incomplete. Add both name and email first.'
    };
  }

  if (!isOwnTicket(name, payload.ownerName, payload.ownerValue)) {
    return {
      saved: false,
      skipped: true,
      reason: 'owner_mismatch',
      message: `Name does not match this ticket owner. Profile: ${name}. Ticket owner: ${payload.ownerName || payload.ownerValue || 'not detected'}.`,
      ownerValue: payload.ownerValue || null,
      ownerName: payload.ownerName || null
    };
  }

  const dedupeKey = `${ticketNumber}:${email}:${shiftDate}:${status}`;
  const now = Date.now();

  if (lastSubmission && lastSubmission.key === dedupeKey && now - lastSubmission.timestamp < 1500) {
    return {
      saved: false,
      skipped: true,
      reason: 'duplicate_click',
      message: 'Duplicate submit ignored.'
    };
  }

  lastSubmission = { key: dedupeKey, timestamp: now };

  await upsertTphRecord({
    ticket_num: ticketNumber,
    agent: email,
    status,
    shift_date: shiftDate
  });

  return {
    saved: true,
    message: 'TPH logged successfully.'
  };
}

function getMissingCredentialFields(credentials = {}) {
  const missingFields = [];

  if (!String(credentials.agentName || '').trim()) missingFields.push('name');
  if (!String(credentials.agentEmail || '').trim()) missingFields.push('email');

  return missingFields;
}

async function setMissingCredentialsBadge(missingFields = ['name', 'email']) {
  const missingText = missingFields.join(' and ');

  await chrome.action.setBadgeText({ text: '!' });
  await chrome.action.setBadgeBackgroundColor({ color: '#D93025' });
  await chrome.action.setTitle({
    title: `Zendesk Ticket Helper - missing ${missingText}`
  });
}

async function clearBadge() {
  await chrome.action.setBadgeText({ text: '' });
  await chrome.action.setTitle({ title: 'Zendesk Ticket Helper' });
}

async function refreshBadge() {
  const result = await chrome.storage.sync.get(['agentName', 'agentEmail']);
  const missingFields = getMissingCredentialFields(result);

  if (missingFields.length === 0) {
    await clearBadge();
  } else {
    await setMissingCredentialsBadge(missingFields);
  }
}

chrome.runtime.onInstalled.addListener(refreshBadge);
chrome.runtime.onStartup.addListener(refreshBadge);
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'sync' && (changes.agentName || changes.agentEmail)) {
    refreshBadge();
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'openPopup') {
    chrome.action.openPopup();
    return false;
  }

  if (request.action === 'credentialsUpdated') {
    refreshBadge().then(() => sendResponse({ success: true }));
    return true;
  }

  if (request.action === 'zendeskSubmitDetected') {
    saveZendeskSubmission(request.payload || {})
      .then(result => sendResponse({ success: Boolean(result.saved), ...result }))
      .catch(error => sendResponse({
        success: false,
        saved: false,
        error: error.message,
        message: getUserFacingError(error)
      }));
    return true;
  }

  return false;
});

refreshBadge();
