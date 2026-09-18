// ── Browser API compatibility ──
const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

// ── Storage keys ──
const KEY_FOLDER_MODE = 'folderMode';
const KEY_SAVED       = 'savedFolders';
const KEY_RECENT      = 'recentFolders';
const KEY_TREE        = 'folderTree';

const DEVICE_URL  = 'http://crosspoint.local';
const MAX_RECENT  = 3;
const MAX_SAVED   = 10;

// ── State ──
let currentPath   = [];
let folderTree    = {};
let savedFolders  = [];
let recentFolders = [];

// ── DOM refs ──
const folderModeToggle = document.getElementById('folderModeToggle');
const toggleStateLabel = document.getElementById('toggleStateLabel');
const modeMessage      = document.getElementById('modeMessage');
const folderPanel      = document.getElementById('folderPanel');
const fetchBtn         = document.getElementById('fetchBtn');
const folderBrowser    = document.getElementById('folderBrowser');
const breadcrumbPath   = document.getElementById('breadcrumbPath');
const backBtn          = document.getElementById('backBtn');
const folderList       = document.getElementById('folderList');
const savedList        = document.getElementById('savedList');
const recentList       = document.getElementById('recentList');
const connectionStatus = document.getElementById('connectionStatus');
const connectionLabel  = document.getElementById('connectionLabel');

// ── Init ──
async function init() {
  const data = await browserAPI.storage.local.get([
    KEY_FOLDER_MODE, KEY_SAVED, KEY_RECENT, KEY_TREE
  ]);

  savedFolders  = data[KEY_SAVED]  ?? [];
  recentFolders = data[KEY_RECENT] ?? [];
  folderTree    = data[KEY_TREE]   ?? {};

  const folderMode = data[KEY_FOLDER_MODE] ?? false;
  folderModeToggle.checked = folderMode;
  applyMode(folderMode);

  renderSaved();
  renderRecent();

  if (Object.keys(folderTree).length > 0) {
    folderBrowser.classList.remove('hidden');
    renderFolderList();
  }

  checkConnection();
}

// ── Connection check ──
async function checkConnection() {
  setConnectionState('checking');
  try {
    const res = await fetch(`${DEVICE_URL}/api/status`,
      { signal: AbortSignal.timeout(3000) });
    setConnectionState(res.ok ? 'connected' : 'offline');
  } catch {
    setConnectionState('offline');
  }
}

function setConnectionState(state) {
  connectionStatus.className = 'connection-status status-' + state;
  const labels = { connected: 'Connected', offline: 'Offline', checking: 'Checking…' };
  connectionLabel.textContent = labels[state];
}

// ── Mock fetch — remove when using real device ──
async function fetchDirectory(path) {
  await new Promise(r => setTimeout(r, 300));
  const mock = {
    '/':           [{ name: 'Fanfiction', isDirectory: true }, { name: 'Books', isDirectory: true }, { name: 'Documents', isDirectory: true }],
    '/Fanfiction': [{ name: 'Completed', isDirectory: true }, { name: 'To Read', isDirectory: true }],
    '/Books':      [{ name: 'Fantasy', isDirectory: true }]
  };
  const node = {};
  for (const e of (mock[path] ?? [])) {
    if (e.isDirectory) node[e.name] = {};
  }
  return node;
}

// ── Toggle ──
folderModeToggle.addEventListener('change', () => {
  const on = folderModeToggle.checked;
  applyMode(on);
  browserAPI.storage.local.set({ [KEY_FOLDER_MODE]: on }); // fire and forget
});

function applyMode(on) {
  toggleStateLabel.textContent = on ? 'ON' : 'OFF';
  toggleStateLabel.className   = 'toggle-state-label' + (on ? ' on' : '');
  modeMessage.textContent = on
    ? 'Fics will be sent to your chosen folder.'
    : 'Fics will be sent to the root folder of your device.';
  folderPanel.classList.toggle('hidden', !on);
}

// ── Fetch button ──
fetchBtn.addEventListener('click', async () => {
  fetchBtn.disabled    = true;
  fetchBtn.textContent = 'Fetching…';
  try {
    folderTree = await fetchDirectory('/');
    browserAPI.storage.local.set({ [KEY_TREE]: folderTree }); // fire and forget
    currentPath = [];
    folderBrowser.classList.remove('hidden');
    renderFolderList();
    fetchBtn.textContent = '↓ Refresh folder structure';
  } catch (err) {
    fetchBtn.textContent = 'Could not reach device — retry?';
    console.error('[AvesO3]', err);
  } finally {
    fetchBtn.disabled = false;
  }
});

// ── Breadcrumb ──
function renderBreadcrumb() {
  breadcrumbPath.textContent = currentPath.length === 0
    ? 'root'
    : 'root > ' + currentPath.join(' > ');
  backBtn.disabled = currentPath.length === 0;
}

backBtn.addEventListener('click', () => {
  if (currentPath.length > 0) {
    currentPath.pop();
    renderBreadcrumb();
    renderFolderList();
  }
});

// ── Folder list ──
// NOTE: This function is async only for the lazy-load on folder click.
// Pin/unpin handlers are fully synchronous — no await anywhere inside them.
function renderFolderList() {
  renderBreadcrumb();
  folderList.innerHTML = '';

  let node = folderTree;
  for (const segment of currentPath) {
    node = node[segment] ?? {};
  }

  const names = Object.keys(node).sort();

  if (names.length === 0) {
    const empty = document.createElement('li');
    empty.style.cssText = 'padding: 12px 16px; color: #999; font-style: italic; font-size: 13px;';
    empty.textContent = 'No subfolders here.';
    folderList.appendChild(empty);
    return;
  }

  for (const name of names) {
    const fullPath = '/' + [...currentPath, name].join('/');

    const li = document.createElement('li');
    li.className = 'folder-item';

    const icon = document.createElement('span');
    icon.className   = 'folder-icon';
    icon.textContent = '📁';

    const label = document.createElement('span');
    label.className   = 'folder-name';
    label.textContent = name;

    const pinBtn = document.createElement('button');
    pinBtn.className      = 'pin-btn';
    pinBtn.dataset.path   = fullPath;
    pinBtn.title          = savedFolders.includes(fullPath) ? 'Unpin' : 'Pin this folder';
    pinBtn.textContent    = savedFolders.includes(fullPath) ? '📌' : '📍';

    // Replace the li click handler in renderFolderList()
    li.addEventListener('click', (e) => {
  if (e.target === pinBtn) return;
  
  currentPath.push(name);

  // Defer rendering so the click event can complete before DOM destruction
  setTimeout(() => {
    renderFolderList();

    // Check if this folder's children need loading
    let currentNode = folderTree;
    for (const seg of currentPath) currentNode = currentNode[seg] ?? {};

    if (Object.keys(currentNode).length === 0) {
      fetchDirectory('/' + currentPath.join('/'))
        .then(sub => {
          let treeNode = folderTree;
          for (let i = 0; i < currentPath.length - 1; i++) {
            treeNode = treeNode[currentPath[i]];
          }
          treeNode[currentPath[currentPath.length - 1]] = sub;
          browserAPI.storage.local.set({ [KEY_TREE]: folderTree });
          renderFolderList(); 
        })
        .catch(() => {});
    }
  }, 0);
});

    // ── Pin/unpin — FULLY SYNCHRONOUS, no await ──
    pinBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();

      const alreadyPinned = savedFolders.includes(fullPath);
      if (alreadyPinned) {
        savedFolders = savedFolders.filter(p => p !== fullPath);
      } else {
        savedFolders.unshift(fullPath);
        if (savedFolders.length > MAX_SAVED) savedFolders.pop();
      }

      // Update this button in place — no list rebuild, no DOM destruction
      const nowPinned = savedFolders.includes(fullPath);
      pinBtn.textContent = nowPinned ? '📌' : '📍';
      pinBtn.title       = nowPinned ? 'Unpin' : 'Pin this folder';

      // Rebuild saved section only — folder list stays intact
      renderSaved();

      // Write to storage in background — no await
      browserAPI.storage.local.set({ [KEY_SAVED]: savedFolders });
    });

    li.appendChild(icon);
    li.appendChild(label);
    li.appendChild(pinBtn);
    folderList.appendChild(li);
  }
}

// ── Saved folders ──
function renderSaved() {
  savedList.innerHTML = '';

  if (savedFolders.length === 0) {
    savedList.innerHTML = '<p class="empty-hint">No saved folders yet. Pin a folder below.</p>';
    return;
  }

  for (const path of savedFolders) {
    const row = document.createElement('div');
    row.className = 'folder-entry';

    const icon = document.createElement('span');
    icon.className   = 'entry-icon';
    icon.textContent = '📌';

    const label = document.createElement('span');
    label.className   = 'entry-path';
    label.textContent = path;

    const removeBtn = document.createElement('button');
    removeBtn.className   = 'entry-remove';
    removeBtn.textContent = '✕';
    removeBtn.title       = 'Remove from saved';

    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();

      savedFolders = savedFolders.filter(p => p !== path);
      browserAPI.storage.local.set({ [KEY_SAVED]: savedFolders });

      // Remove just this row in place — no innerHTML rebuild
      row.remove();

      // Show empty hint if nothing left
      if (savedFolders.length === 0) {
        savedList.innerHTML = '<p class="empty-hint">No saved folders yet. Pin a folder below.</p>';
      }

      // Flip any matching pin button in the folder list
      document.querySelectorAll('.pin-btn').forEach(btn => {
        if (btn.dataset.path === path) {
          btn.textContent = '📍';
          btn.title = 'Pin this folder';
        }
      });
    });

    row.appendChild(icon);
    row.appendChild(label);
    row.appendChild(removeBtn);
    savedList.appendChild(row);
  }
}

// ── Recent folders ──
function renderRecent() {
  recentList.innerHTML = '';

  if (recentFolders.length === 0) {
    recentList.innerHTML = '<p class="empty-hint">No recent folders yet.</p>';
    return;
  }

  for (const path of recentFolders) {
    const row = document.createElement('div');
    row.className = 'folder-entry';

    const icon = document.createElement('span');
    icon.className   = 'entry-icon';
    icon.textContent = '↺';

    const label = document.createElement('span');
    label.className   = 'entry-path';
    label.textContent = path;

    row.appendChild(icon);
    row.appendChild(label);
    recentList.appendChild(row);
  }
}

// ── Message listener for content script ──
browserAPI.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'ADD_RECENT') {
    const path = msg.path;
    recentFolders = recentFolders.filter(p => p !== path);
    recentFolders.unshift(path);
    if (recentFolders.length > MAX_RECENT) recentFolders.pop();
    browserAPI.storage.local.set({ [KEY_RECENT]: recentFolders });
    sendResponse({ ok: true });
  }

  if (msg.type === 'GET_DESTINATION') {
    browserAPI.storage.local.get([KEY_FOLDER_MODE, KEY_SAVED, KEY_RECENT])
      .then(data => sendResponse({
        folderMode:    data[KEY_FOLDER_MODE] ?? false,
        savedFolders:  data[KEY_SAVED]       ?? [],
        recentFolders: data[KEY_RECENT]      ?? []
      }));
    return true; // keep channel open for async response
  }
});

// ── Start ──
init();