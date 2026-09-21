browser.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'SEND_TO_DEVICE') {
    handleDeviceUpload(msg).then(sendResponse);
    return true; 
  }
});

// ── Badge helper (Text & Symbol based) ──
function setBadge(state, tabId) {
  const badgeConfig = {
    checking:  { text: '...', color: '#fb8c00' }, // Yellow
    connected: { text: '✓',  color: '#4caf50' }, // Green
    offline:   { text: '✕', color: '#e53935' }  // Red
  };

  const config = badgeConfig[state];

  if (state === 'none' || !config) {
    browser.browserAction.setBadgeText({ text: '', tabId });
    return;
  }

  // Set text first, then background color
  browser.browserAction.setBadgeText({ text: config.text, tabId });
  browser.browserAction.setBadgeBackgroundColor({ color: config.color, tabId });
}

// ── Check connection and update badge for a specific tab ──
async function checkAndBadge(tabId) {
  setBadge('checking', tabId);

  try {
    let host = typeof discoverDevice === 'function' ? await discoverDevice() : 'crosspoint.local';
    if (!host) host = 'crosspoint.local';

    const cleanHost = host.replace(/^https?:\/\//, '').replace(/\/$/, '');
    const res = await fetch(`http://${cleanHost}/api/status`, {
      signal: AbortSignal.timeout(3000)
    });

    if (res.ok) {
      setBadge('connected', tabId);
    } else {
      setBadge('offline', tabId);
    }
  } catch (err) {
    console.error('[AvesO3] Connection check failed:', err);
    setBadge('offline', tabId);
  }
}

// ── Watch for AO3 tabs ──
function isAo3Url(url) {
  return url && (
    url.includes('archiveofourown.org') ||
    url.includes('archiveofourown.gay')
  );
}

// Tab becomes active
browser.tabs.onActivated.addListener(async ({ tabId }) => {
  try {
    const tab = await browser.tabs.get(tabId);
    if (isAo3Url(tab.url)) {
      checkAndBadge(tabId);
    } else {
      setBadge('none', tabId);
    }
  } catch (err) {}
});

// Tab URL changes (navigation within same tab)
browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete') return;
  if (tab.active) {
    if (isAo3Url(tab.url)) {
      checkAndBadge(tabId);
    } else {
      setBadge('none', tabId);
    }
  }
});

// Window focus changes
browser.windows.onFocusChanged.addListener(async (windowId) => {
  if (windowId === browser.windows.WINDOW_ID_NONE) return;
  try {
    const tabs = await browser.tabs.query({ active: true, windowId });
    if (tabs.length > 0) {
      const activeTab = tabs[0];
      if (isAo3Url(activeTab.url)) {
        checkAndBadge(activeTab.id);
      } else {
        setBadge('none', activeTab.id);
      }
    }
  } catch (err) {}
});

async function handleDeviceUpload(msg) {
  let blob, filename = msg.filename;

  // --- PHASE 1: DOWNLOAD FROM AO3 ---
  try {
    const ao3Res = await fetch(msg.epubHref);
    if (!ao3Res.ok) throw new Error(`HTTP ${ao3Res.status}`);
    
    const disposition = ao3Res.headers.get('content-disposition');
    if (disposition) {
      const match = disposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
      if (match) filename = match[1].replace(/['"]/g, '');
    }
    blob = await ao3Res.blob();
  } catch (err) {
    return { ok: false, error: 'AO3 Download Failed: ' + err.message };
  }

  // --- PHASE 2: UPLOAD TO DEVICE ---
  try {
    const formData = new FormData();
    formData.append('file', blob, filename);

    const uploadRes = await fetch(`${msg.deviceUrl}upload?path=${encodeURIComponent(msg.path)}&overwrite=true`, {
      method: 'POST',
      body: formData,
      signal: AbortSignal.timeout(15000)
    });

    if (!uploadRes.ok) throw new Error(`HTTP ${uploadRes.status}`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: 'Device Upload Failed: ' + err.message };
  }
}