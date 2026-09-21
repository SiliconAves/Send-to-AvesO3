// ── Constants ──
const DEVICE_URL = 'http://crosspoint.local/';

// ── Sent tracking (persists until page reload) ──
const sentThisSession = new Set();

// ── Shared upload logic ──
async function sendToDevice(epubHref, filenameHint, linkElement, destinationPath) {
  linkElement.textContent = '🐦 Sending…';

  try {
    const path = destinationPath ?? '/';

    // Delegate EVERYTHING to the background script
    const upload = await browser.runtime.sendMessage({
      type: 'SEND_TO_DEVICE',
      deviceUrl: DEVICE_URL, 
      epubHref: epubHref,
      filename: filenameHint,
      path: path
    });

    if (!upload.ok) throw new Error(upload.error || 'Background upload failed');

    if (path !== '/') {
      await addToRecent(path);
    }

    sentThisSession.add(epubHref);
    linkElement.textContent = '🐦 Sent ✓';
    linkElement.style.cssText = 'color: #16531a; opacity: 0.6; cursor: default;';

  } catch (err) {
    console.error('[AvesO3]', err);
    linkElement.textContent = '🐦 Failed — is receive mode on?';
    setTimeout(() => {
      getDestinationData().then(data => {
        linkElement.textContent = data.folderMode
          ? '🐦 Send to AvesO3 ▾'
          : '🐦 Send to AvesO3';
        linkElement.style.cssText = '';
      });
    }, 4000);
  }
}

// ── Storage helpers ──
async function getDestinationData() {
  return browser.storage.local.get([
    'folderMode', 'savedFolders', 'recentFolders', 'folderTree'
  ]);
}

async function addToRecent(path) {
  const data = await browser.storage.local.get(['recentFolders', 'savedFolders']);
  
  // Don't add to recent if it's already a pinned folder
  const saved = data.savedFolders ?? [];
  if (saved.includes(path)) return;

  let recent = data.recentFolders ?? [];
  recent = recent.filter(p => p !== path);
  recent.unshift(path);
  if (recent.length > 3) recent.pop();
  await browser.storage.local.set({ recentFolders: recent });
}

// ── Dropdown ──
let activeDropdown = null;
let activeBrowser  = null;

function closeDropdown() {
  if (activeDropdown) {
    activeDropdown.remove();
    activeDropdown = null;
  }
}

function closeBrowser() {
  if (activeBrowser) {
    activeBrowser.remove();
    activeBrowser = null;
  }
}

function closeAll() {
  closeDropdown();
  closeBrowser();
}

async function showDropdown(anchorElement, epubHref, filenameHint, buttonElement) {
  closeAll();

  const data          = await getDestinationData();
  const savedFolders  = data.savedFolders  ?? [];
  const recentFolders = data.recentFolders ?? [];

  const dropdown = document.createElement('div');
  dropdown.id = 'aveso3-dropdown';
  dropdown.style.cssText = `
    position: absolute;
    z-index: 99999;
    background: #eaeaea;
    border: 1px solid #cbcbcb;
    border-radius: 3px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    min-width: 240px;
    font-family: Arial, Helvetica, sans-serif;
    font-size: 13px;
    color: #2a2a2a;
    overflow: hidden;
  `;

  const rect = anchorElement.getBoundingClientRect();
  dropdown.style.top  = (rect.bottom + window.scrollY + 4) + 'px';
  dropdown.style.left = rect.left + 'px';

  function makeRow(icon, text, onClick) {
    const row = document.createElement('div');
    row.style.cssText = `
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 9px 14px;
      cursor: pointer;
      white-space: nowrap;
      overflow: hidden;
    `;
    row.addEventListener('mouseenter', () => row.style.background = '#dddddd');
    row.addEventListener('mouseleave', () => row.style.background = '');

    const iconSpan = document.createElement('span');
    iconSpan.textContent = icon;
    iconSpan.style.flexShrink = '0';

    const label = document.createElement('span');
    label.textContent = text;
    label.style.cssText = 'overflow: hidden; text-overflow: ellipsis; flex: 1;';

    row.appendChild(iconSpan);
    row.appendChild(label);
    row.addEventListener('click', (e) => {
      e.stopPropagation();
      closeDropdown();
      onClick();
    });
    return row;
  }

  function makeSeparator() {
    const sep = document.createElement('div');
    sep.style.cssText = 'height: 0.4px; background: #cbcbcb; margin: 0;';
    return sep;
  }

  let hasContent = false;

  if (savedFolders.length > 0) {
    for (const path of savedFolders) {
      dropdown.appendChild(makeRow('📌', path, () => {
        sendToDevice(epubHref, filenameHint, buttonElement, path);
      }));
    }
    hasContent = true;
  }

  if (recentFolders.length > 0) {
    if (hasContent) dropdown.appendChild(makeSeparator());
    for (const path of recentFolders) {
      dropdown.appendChild(makeRow('↻', path, () => {
        sendToDevice(epubHref, filenameHint, buttonElement, path);
      }));
    }
    hasContent = true;
  }

  if (!hasContent) {
    const hint = document.createElement('div');
    hint.style.cssText = 'padding: 10px 14px; color: #999; font-style: italic;';
    hint.textContent = 'No folders saved yet. Use Select Folder below.';
    dropdown.appendChild(hint);
  }

  const selectFolderSep = makeSeparator();
  selectFolderSep.style.height = '1.3px';
  selectFolderSep.style.background = '#A6A6A6';
  dropdown.appendChild(selectFolderSep);
  dropdown.appendChild(makeRow('📂', 'Select Folder', () => {
    openFolderBrowser(epubHref, filenameHint, buttonElement, anchorElement);
  }));

  document.body.appendChild(dropdown);
  activeDropdown = dropdown;

  // Clamp horizontal position if near right edge
  const dropRect = dropdown.getBoundingClientRect();
  if (dropRect.right > window.innerWidth) {
    dropdown.style.left = Math.max(0, window.innerWidth - dropRect.width - 8) + 'px';
  }

  // ── Outside click — correctly references dropdown, not panel ──
  let dropTouchMoved = false;
  dropdown.addEventListener('touchmove', () => { dropTouchMoved = true; }, { passive: true });
  dropdown.addEventListener('touchstart', () => { dropTouchMoved = false; }, { passive: true });

  function dropdownOutsideHandler(e) {
    if (!dropdown.contains(e.target) && !dropTouchMoved) {
      closeDropdown();
      document.removeEventListener('pointerdown', dropdownOutsideHandler);
    }
  }
  setTimeout(() => {
    document.addEventListener('pointerdown', dropdownOutsideHandler);
  }, 0);
}

// ── Inline folder browser ──
async function openFolderBrowser(epubHref, filenameHint, buttonElement, anchorElement) {
  closeBrowser();

  const data = await getDestinationData();
  const tree = data.folderTree ?? {};

  let browserPath = [];

  const panel = document.createElement('div');
  panel.id = 'aveso3-browser';
  panel.style.cssText = `
    position: absolute;
    z-index: 99999;
    background: #eaeaea;
    border: 1px solid #cbcbcb;
    border-radius: 3px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    width: 300px;
    font-family: Arial, Helvetica, sans-serif;
    font-size: 13px;
    color: #2a2a2a;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  `;

  // Position below anchor
  const rect = anchorElement.getBoundingClientRect();
  panel.style.top  = (rect.bottom + window.scrollY + 4) + 'px';
  panel.style.left = rect.left + 'px';

  // ── Breadcrumb bar ──
  const breadcrumbBar = document.createElement('div');
  breadcrumbBar.style.cssText = `
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 16px;
    background: #dddddd;
    border-bottom: 0.4px solid #D2D2D2;
    min-height: 48px;
    box-sizing: border-box;
  `;

  const backBtn = document.createElement('button');
  backBtn.style.cssText = `
    background: none;
    border: none;
    cursor: pointer;
    padding: 4px;
    color: #2a2a2a;
    display: flex;
    align-items: center;
    flex-shrink: 0;
    border-radius: 4px;
  `;
  backBtn.innerHTML = `
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" stroke-width="2.5"
         stroke-linecap="round" stroke-linejoin="round">
      <polyline points="15 18 9 12 15 6"/>
    </svg>
  `;

  const breadcrumbText = document.createElement('span');
  breadcrumbText.style.cssText = `
    font-size: 13px;
    font-weight: bold;
    color: #2a2a2a;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
  `;

  breadcrumbBar.appendChild(backBtn);
  breadcrumbBar.appendChild(breadcrumbText);

  // ── Folder list ──
  const folderList = document.createElement('div');
  folderList.style.cssText = `
    overflow-y: auto;
    max-height: 240px;
    flex: 1;
    -webkit-overflow-scrolling: touch;
    overscroll-behavior: contain;
  `;

  // ── Send here button ──
  const sendHereBtn = document.createElement('button');
  sendHereBtn.style.cssText = `
    width: 100%;
    padding: 18px;
    background: #900;
    color: white;
    border: none;
    font-size: 14px;
    font-weight: bold;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    box-sizing: border-box;
    margin: 0;
    line-height: 1;
    flex-shrink: 0;
    letter-spacing: 0.3px;
  `;
  sendHereBtn.textContent = '⬆ Send here';
  sendHereBtn.addEventListener('mouseenter', () => sendHereBtn.style.background = '#700');
  sendHereBtn.addEventListener('mouseleave', () => sendHereBtn.style.background = '#900');

  panel.appendChild(breadcrumbBar);
  panel.appendChild(folderList);
  panel.appendChild(sendHereBtn);

  // ── Render current level ──
  function getCurrentNode() {
    let node = tree;
    for (const segment of browserPath) {
      node = node[segment] ?? {};
    }
    return node;
  }

  function renderBrowser() {
    breadcrumbText.textContent = browserPath.length === 0
      ? 'root'
      : 'root > ' + browserPath.join(' > ');

    backBtn.disabled   = browserPath.length === 0;
    backBtn.style.color  = browserPath.length === 0 ? '#bbb' : '#2a2a2a';
    backBtn.style.cursor = browserPath.length === 0 ? 'default' : 'pointer';

    // Dynamic send label
    const currentFolder = browserPath.length === 0
      ? 'root'
      : browserPath[browserPath.length - 1];
    sendHereBtn.textContent = `⬆ Send to ${currentFolder}`;

    folderList.innerHTML = '';
    const node  = getCurrentNode();
    const names = Object.keys(node).sort();

    if (names.length === 0) {
      const empty = document.createElement('div');
      empty.style.cssText = 'padding: 14px; color: #999; font-style: italic; font-size: 13px;';
      empty.textContent = 'No subfolders here.';
      folderList.appendChild(empty);
      return;
    }

    for (const name of names) {
      const fullPath = '/' + [...browserPath, name].join('/');
      const isPinned = (data.savedFolders ?? []).includes(fullPath);

      const row = document.createElement('div');
      row.style.cssText = `
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 10px 14px;
        border-bottom: 1px solid #D2D2D2;
        cursor: pointer;
      `;
      row.addEventListener('mouseenter', () => row.style.background = '#dddddd');
      row.addEventListener('mouseleave', () => row.style.background = '');

      const folderIcon = document.createElement('span');
      folderIcon.textContent = '📁';
      folderIcon.style.flexShrink = '0';

      const folderName = document.createElement('span');
      folderName.textContent = name;
      folderName.style.cssText = 'flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;';

      const pinBtn = document.createElement('button');
      pinBtn.textContent = isPinned ? '📌' : '📍';
      pinBtn.title       = isPinned ? 'Unpin' : 'Pin this folder';
      pinBtn.style.cssText = `
        background: none;
        border: none;
        cursor: pointer;
        font-size: 15px;
        padding: 2px 4px;
        flex-shrink: 0;
      `;

      // Navigate into folder
      row.addEventListener('click', (e) => {
        if (e.target === pinBtn) return;
        browserPath.push(name);
        renderBrowser();
      });

      // Pin / unpin
      pinBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const stored = await browser.storage.local.get('savedFolders');
        let saved = stored.savedFolders ?? [];

        if (isPinned) {
          saved = saved.filter(p => p !== fullPath);
        } else {
          if (!saved.includes(fullPath)) {
            saved.unshift(fullPath);
            if (saved.length > 10) saved.pop();
          }
        }

        await browser.storage.local.set({ savedFolders: saved });
        data.savedFolders = saved;
        renderBrowser();
      });

      row.appendChild(folderIcon);
      row.appendChild(folderName);
      row.appendChild(pinBtn);
      folderList.appendChild(row);
    }
  }

  backBtn.addEventListener('click', () => {
    if (browserPath.length > 0) {
      browserPath.pop();
      renderBrowser();
    }
  });

  sendHereBtn.addEventListener('click', () => {
    const destination = browserPath.length === 0
      ? '/'
      : '/' + browserPath.join('/');
    closeBrowser();
    sendToDevice(epubHref, filenameHint, buttonElement, destination);
  });

  renderBrowser();

  // ── Append once here, nowhere else ──
  document.body.appendChild(panel);
  activeBrowser = panel;

  // Clamp vertical position
  const panelRect = panel.getBoundingClientRect();
  if (panelRect.bottom > window.innerHeight) {
    const overflow = panelRect.bottom - window.innerHeight;
    const currentTop = parseInt(panel.style.top);
    panel.style.top = Math.max(currentTop - overflow - 8, window.scrollY + 4) + 'px';
  }

  // ── Outside click — correctly references panel ──
  let panelTouchMoved = false;
  panel.addEventListener('touchmove', () => { panelTouchMoved = true; }, { passive: true });
  panel.addEventListener('touchstart', () => { panelTouchMoved = false; }, { passive: true });

  function browserOutsideHandler(e) {
    if (!panel.contains(e.target) && !panelTouchMoved) {
      closeBrowser();
      document.removeEventListener('pointerdown', browserOutsideHandler);
    }
  }
  setTimeout(() => {
    document.addEventListener('pointerdown', browserOutsideHandler);
  }, 0);
}

// ── Fic page button ──
function injectButton() {
  const nav = document.querySelector('ul.work.navigation.actions');
  if (!nav) return;

  const epubLink = nav.querySelector('li.download ul a[href*=".epub"]');
  if (!epubLink) return;

  const epubHref = epubLink.href;
  const filename = epubHref.split('/').pop().split('?')[0];
  const title    = document.querySelector('h2.title.heading')?.textContent?.trim() ?? 'this fic';

  const li = document.createElement('li');
  const a  = document.createElement('a');
  a.href  = '#';
  a.title = `Send "${title}" to your AvesO3 device`;

  a.addEventListener('click', async (e) => {
    e.preventDefault();
    if (sentThisSession.has(epubHref)) return;

    const data = await getDestinationData();
    if (data.folderMode) {
      showDropdown(a, epubHref, filename, a);
    } else {
      sendToDevice(epubHref, filename, a, '/');
    }
  });

  getDestinationData().then(data => {
    a.textContent = data.folderMode ? '🐦 Send to AvesO3 ▾' : '🐦 Send to AvesO3';
  });

  li.appendChild(a);
  nav.prepend(li);
}

// ── Listing page buttons ──
function injectListingButton(card) {
  if (card.querySelector('.aveso3-btn')) return;

  const idAttr = card.id;
  if (!idAttr || !idAttr.startsWith('work_')) return;
  const workId = idAttr.replace('work_', '');

  const titleEl   = card.querySelector('h4.heading a, h4 a');
  const title     = titleEl?.textContent?.trim() ?? workId;
  const host      = window.location.origin;
  const safeTitle = title.replace(/[^a-zA-Z0-9 _-]/g, '').replace(/ /g, '_').trim() || 'work';
  const epubHref  = `${host}/downloads/${workId}/${safeTitle}.epub`;
  const filename  = safeTitle + '.epub';

  const ul = document.createElement('ul');
  ul.className     = 'work navigation actions';
  ul.style.cssText = 'float: right; margin: 0.25em 0;';

  const li = document.createElement('li');
  const a  = document.createElement('a');
  a.className = 'aveso3-btn';
  a.href  = '#';
  a.title = `Send "${title}" to your AvesO3 device`;

  a.addEventListener('click', async (e) => {
    e.preventDefault();
    if (sentThisSession.has(epubHref)) return;

    const data = await getDestinationData();
    if (data.folderMode) {
      showDropdown(a, epubHref, filename, a);
    } else {
      sendToDevice(epubHref, filename, a, '/');
    }
  });

  getDestinationData().then(data => {
    a.textContent = data.folderMode ? '🐦 Send to AvesO3 ▾' : '🐦 Send to AvesO3';
  });

  li.appendChild(a);
  ul.appendChild(li);

  const clearfix = document.createElement('div');
  clearfix.style.cssText = 'clear: both;';

  const stats = card.querySelector('dl.stats');
  if (stats) {
    stats.insertAdjacentElement('beforebegin', clearfix);
    clearfix.insertAdjacentElement('beforebegin', ul);
  }
}

function injectListingButtons() {
  document.querySelectorAll('li.work.blurb').forEach(injectListingButton);
}

// ── Run ──
injectButton();
injectListingButtons();