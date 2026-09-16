// Shared upload logic — single place to change hostname, folder, etc.
async function sendToDevice(epubHref, filenameHint, linkElement) {
  linkElement.textContent = '🐦 Sending…';

  try {
    const response = await fetch(epubHref);
    if (!response.ok) throw new Error(`AO3 returned ${response.status}`);
    const blob = await response.blob();

    // Use Content-Disposition filename if available, fall back to hint
    const disposition = response.headers.get('content-disposition');
    let filename = filenameHint;
    if (disposition) {
      const match = disposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
      if (match) filename = match[1].replace(/['"]/g, '');
    }

    const form = new FormData();
    form.append('file', blob, filename);

    const upload = await fetch(
      'http://crosspoint.local/upload?path=/&overwrite=true',
      { method: 'POST', body: form }
    );

    if (!upload.ok) throw new Error(`Device returned ${upload.status}`);

    linkElement.textContent = '🐦 Sent!';
    setTimeout(() => { linkElement.textContent = '🐦 Send to AvesO3'; }, 3000);

  } catch (err) {
    console.error('[AvesO3]', err);
    linkElement.textContent = '🐦 Failed — is receive mode on?';
    setTimeout(() => { linkElement.textContent = '🐦 Send to AvesO3'; }, 4000);
  }
}

function injectButton() {
  const nav = document.querySelector('ul.work.navigation.actions');
  if (!nav) return;

  const epubLink = nav.querySelector('li.download ul a[href*=".epub"]');
  if (!epubLink) return;

  const epubHref = epubLink.href;
  const filename = epubHref.split('/').pop().split('?')[0];
  const title = document.querySelector('h2.title.heading')?.textContent?.trim() ?? 'this fic';

  const li = document.createElement('li');
  const a = document.createElement('a');
  a.textContent = '🐦 Send to AvesO3';
  a.href = '#';
  a.title = `Send "${title}" to your AvesO3 device`;
  a.addEventListener('click', (e) => {
    e.preventDefault();
    sendToDevice(epubHref, filename, a);
  });

  li.appendChild(a);
  nav.prepend(li);
}

function injectListingButton(card) {
  if (card.querySelector('.aveso3-btn')) return;

  const idAttr = card.id;
  if (!idAttr || !idAttr.startsWith('work_')) return;
  const workId = idAttr.replace('work_', '');

  const titleEl = card.querySelector('h4.heading a, h4 a');
  const title = titleEl?.textContent?.trim() ?? workId;

  const host = window.location.origin;
  const safeTitle = title.replace(/[^a-zA-Z0-9 _-]/g, '').replace(/ /g, '_').trim() || 'work';
  const epubHref = `${host}/downloads/${workId}/${safeTitle}.epub`;
  const filename = safeTitle + '.epub';

  const ul = document.createElement('ul');
  ul.className = 'work navigation actions';
  ul.style.cssText = 'float: right; margin: 0.25em 0;';

  const li = document.createElement('li');
  const a = document.createElement('a');
  a.className = 'aveso3-btn';
  a.textContent = '🐦 Send to AvesO3';
  a.href = '#';
  a.title = `Send "${title}" to your AvesO3 device`;
  a.addEventListener('click', (e) => {
    e.preventDefault();
    sendToDevice(epubHref, filename, a);
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

// Run both
injectButton();
injectListingButtons();