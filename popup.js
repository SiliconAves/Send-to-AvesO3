// ── Storage keys ──
const KEY_FOLDER_MODE = 'folderMode';
const KEY_SAVED       = 'savedFolders';   // array of path strings
const KEY_RECENT      = 'recentFolders';  // array of path strings
const KEY_TREE        = 'folderTree';     // cached tree from device

const DEVICE_URL   = 'http://crosspoint.local';
const MAX_RECENT   = 5;
const MAX_SAVED    = 10;

// ── State ──
let currentPath  = [];   // array of folder names, empty = root
let folderTree   = {};   // nested object representing fetched structure
let savedFolders = [];
let recentFolders = [];

// ── DOM refs ──
const folderModeToggle  = document.getElementById('folderModeToggle');
const toggleStateLabel  = document.getElementById('toggleStateLabel');
const modeMessage       = document.getElementById('modeMessage');
const folderPanel       = document.getElementById('folderPanel');
const fetchBtn          = document.getElementById('fetchBtn');
const folderBrowser     = document.getElementById('folderBrowser');
const breadcrumbPath    = document.getElementById('breadcrumbPath');
const backBtn           = document.getElementById('backBtn');
const folderList        = document.getElementById('folderList');
const savedList         = document.getElementById('savedList');
const recentList        = document.getElementById('recentList');
const connectionStatus  = document.getElementById('connectionStatus');
const connectionLabel   = document.getElementById('connectionLabel');
const connectionDot     = document.getElementById('connectionDot');

// ── Init ──
async function init() {
  const data = await browser.storage.local.get([
    KEY_FOLDER_MODE,
    KEY_SAVED,
    KEY_RECENT,
    KEY_TREE
  ]);

  savedFolders  = data[KEY_SAVED]  ?? [];
  recentFolders = data[KEY_RECENT] ?? [];
  folderTree    = data[KEY_TREE]   ?? {};

  const folderMode = data[KEY_FOLDER_MODE] ?? false;
  folderModeToggle.checked = folderMode;
  applyMode(folderMode);

  renderSaved();
  renderRecent();

  // Show browser if we already have a cached tree
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
    const res = await fetch(`${DEVICE_URL}/api/status`, { signal: AbortSignal.timeout(3000) });
    if (res.ok) {
      setConnectionState('connected');
    } else {
      setConnectionState('offline');
    }
  } catch {
    setConnectionState('offline');
  }
}

function setConnectionState(state) {
  connectionStatus.className = 'connection-status status-' + state;
  const labels = {
    connected: 'Connected',
    offline:   'Offline',
    checking:  'Checking…'
  };
  connectionLabel.textContent = labels[state];
}

// ── Toggle ──
folderModeToggle.addEventListener('change', async () => {
  const on = folderModeToggle.checked;
  applyMode(on);
  await browser.storage.local.set({ [KEY_FOLDER_MODE]: on });
});

function applyMode(on) {
  // Label
  toggleStateLabel.textContent = on ? 'ON' : 'OFF';
  toggleStateLabel.className   = 'toggle-state-label' + (on ? ' on' : '');

  // Message
  modeMessage.textContent = on
    ? 'Fics will be sent to your chosen folder.'
    : 'Fics will be sent to the root folder of your device.';

  // Panel
  folderPanel.classList.toggle('hidden', !on);
}

// ── Fetch folder structure ──
fetchBtn.addEventListener('click', async () => {
  fetchBtn.disabled     = true;
  fetchBtn.textContent  = 'Fetching…';

  try {
    folderTree = await fetchDirectory('/');
    await browser.storage.local.set({ [KEY_TREE]: folderTree });
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

async function fetchDirectory(path) {
  const res = await fetch(
    `${DEVICE_URL}/api/files?path=${encodeURIComponent(path)}`,
    { signal: AbortSignal.timeout(5000) }
  );
  if (!res.ok) throw new Error(`Server returned ${res.status}`);
  const entries = await res.json();

  const node = {};
  for (const entry of entries) {
    if (entry.isDirectory) {
      node[entry.name] = {};  // lazy: subfolders fetched on navigate
    }
  }
  return node;
}

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
async function renderFolderList() {
  renderBreadcrumb();
  folderList.innerHTML = '';

  // Navigate the tree to current path
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
    const isPinned = savedFolders.includes(fullPath);

    const li = document.createElement('li');
    li.className = 'folder-item';

    const icon = document.createElement('span');
    icon.className = 'folder-icon';
    icon.textContent = '📁';

    const label = document.createElement('span');
    label.className = 'folder-name';
    label.textContent = name;

    const pinBtn = document.createElement('button');
    pinBtn.className = 'pin-btn';
    pinBtn.title     = isPinned ? 'Unpin' : 'Pin this folder';
    pinBtn.textContent = isPinned ? '📌' : '📍';

    // Navigate into folder on row click
    li.addEventListener('click', async (e) => {
      if (e.target === pinBtn) return; // handled separately
      currentPath.push(name);

      // Lazy-load subfolders if not yet fetched
      let currentNode = folderTree;
      for (const seg of currentPath) currentNode = currentNode[seg] ?? {};
      if (Object.keys(currentNode).length === 0) {
        try {
          const sub = await fetchDirectory('/' + currentPath.join('/'));
          // Write into tree
          let treeNode = folderTree;
          for (let i = 0; i < currentPath.length - 1; i++) {
            treeNode = treeNode[currentPath[i]];
          }
          treeNode[currentPath[currentPath.length - 1]] = sub;
          await browser.storage.local.set({ [KEY_TREE]: folderTree });
        } catch {
          // navigate anyway, list will show empty
        }
      }

      renderFolderList();
    });

    // Pin / unpin
    pinBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (isPinned) {
        savedFolders = savedFolders.filter(p => p !== fullPath);
      } else {
        if (!savedFolders.includes(fullPath)) {
          savedFolders.unshift(fullPath);
          if (savedFolders.length > MAX_SAVED) savedFolders.pop();
        }
      }
      await browser.storage.local.set({ [KEY_SAVED]: savedFolders });
      renderSaved();
      renderFolderList(); // re-render to flip pin icon
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
    removeBtn.addEventListener('click', async () => {
      savedFolders = savedFolders.filter(p => p !== path);
      await browser.storage.local.set({ [KEY_SAVED]: savedFolders });
      renderSaved();
      renderFolderList(); // update pin icons
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

// ── Export for content script use ──
// Content script calls these via browser.runtime.sendMessage
browser.runtime.onMessage.addListener(async (msg) => {
  if (msg.type === 'ADD_RECENT') {
    const path = msg.path;
    recentFolders = recentFolders.filter(p => p !== path);
    recentFolders.unshift(path);
    if (recentFolders.length > MAX_RECENT) recentFolders.pop();
    await browser.storage.local.set({ [KEY_RECENT]: recentFolders });
  }

  if (msg.type === 'GET_DESTINATION') {
    const data = await browser.storage.local.get([KEY_FOLDER_MODE, KEY_SAVED, KEY_RECENT]);
    return {
      folderMode:    data[KEY_FOLDER_MODE] ?? false,
      savedFolders:  data[KEY_SAVED]       ?? [],
      recentFolders: data[KEY_RECENT]      ?? []
    };
  }
});

// ── Start ──
init();