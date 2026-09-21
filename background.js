browser.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'SEND_TO_DEVICE') {
    handleDeviceUpload(msg).then(sendResponse);
    return true; 
  }
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

    const uploadRes = await fetch(`${msg.deviceUrl}/upload?path=${encodeURIComponent(msg.path)}&overwrite=true`, {
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