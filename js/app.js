/* app.js — wires all the screens together. */

(() => {
  const FIELD_DEFS = [
    ['companyName', 'Company name', 'text'],
    ['personName', 'Name', 'text'],
    ['designation', 'Designation', 'text'],
    ['mobile', 'Mobile', 'tel'],
    ['whatsapp', 'WhatsApp number', 'tel'],
    ['telephone', 'Telephone / landline', 'tel'],
    ['email', 'Email', 'email'],
    ['website', 'Website', 'text'],
    ['address', 'Address', 'text'],
    ['city', 'City', 'text'],
    ['state', 'State', 'text'],
    ['country', 'Country', 'text'],
    ['pinCode', 'PIN / ZIP code', 'text'],
    ['taxNumber', 'GST / VAT / Tax number', 'text'],
    ['social', 'Social media', 'text']
  ];

  const state = {
    screenStack: ['home'],
    bulkMode: false,
    bulkCaptures: [], // {dataUrl}
    pendingImage: null, // dataUrl currently being reviewed
    editingContactId: null,
    contacts: [],
    exportSelected: new Set(),
    listFilter: '',
    listSort: 'date_desc'
  };

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  function showScreen(name) {
    $$('.screen').forEach(s => s.classList.remove('active'));
    const el = $('#screen-' + name);
    if (el) el.classList.add('active');
  }

  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast._h);
    toast._h = setTimeout(() => t.classList.remove('show'), 2200);
  }

  // ---------------- navigation ----------------
  document.addEventListener('click', (e) => {
    const navBtn = e.target.closest('[data-nav]');
    if (!navBtn) return;
    const dest = navBtn.dataset.nav;
    if (dest === 'scan') {
      state.bulkMode = navBtn.dataset.bulk === '1';
      state.bulkCaptures = [];
      openScan();
    } else if (dest === 'cards') {
      openCardsList();
    } else if (dest === 'export') {
      openExport();
    } else if (dest === 'home') {
      CardCamera.stop();
      renderHome();
      showScreen('home');
    } else {
      showScreen(dest);
    }
  });

  // ================= HOME =================
  async function renderHome() {
    const contacts = await CardStore.getAll();
    state.contacts = contacts;
    $('#stat-total').textContent = contacts.length;
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const today = contacts.filter(c => c.createdAt >= todayStart.getTime()).length;
    $('#stat-today').textContent = today;
    $('#cards-subtext').textContent = contacts.length ? `${contacts.length} saved` : 'Nothing saved yet';

    const recentSection = $('#recent-section');
    const recentList = $('#recent-list');
    recentList.innerHTML = '';
    if (contacts.length) {
      recentSection.hidden = false;
      contacts.slice(0, 3).forEach(c => recentList.appendChild(buildCardRow(c)));
    } else {
      recentSection.hidden = true;
    }
  }

  function buildCardRow(contact) {
    const tpl = $('#tpl-card-row').content.cloneNode(true);
    const row = tpl.querySelector('.card-row');
    if (contact.imageData) row.querySelector('.card-row__thumb').style.backgroundImage = `url(${contact.imageData})`;
    row.querySelector('.card-row__name').textContent = contact.personName || contact.companyName || 'Unknown';
    row.querySelector('.card-row__company').textContent = contact.companyName || '';
    row.querySelector('.card-row__meta').textContent = contact.mobile || contact.email || '';
    if (contact.favorite) row.querySelector('.card-row__fav').hidden = false;
    row.addEventListener('click', () => openDetail(contact.id));
    return row;
  }

  // ================= SCAN / CAMERA =================
  async function openScan() {
    showScreen('scan');
    $('#scan-title').textContent = state.bulkMode ? 'Bulk scan' : 'Scan visiting card';
    $('#bulk-counter').hidden = !state.bulkMode;
    $('#bulk-actions').hidden = !state.bulkMode;
    updateBulkCount();
    CardCamera.init($('#camera-video'), $('#camera-canvas'));
    const ok = await CardCamera.start();
    if (!ok) {
      $('#camera-hint').textContent = 'Camera unavailable — use the gallery button to pick a photo instead.';
    }
    $('#btn-flash').style.visibility = CardCamera.hasFlash() ? 'visible' : 'hidden';
  }

  function updateBulkCount() {
    $('#bulk-count').textContent = state.bulkCaptures.length + 1;
    $('#bulk-review-count').textContent = state.bulkCaptures.length;
  }

  let flashOn = false;
  $('#btn-flash').addEventListener('click', async () => {
    flashOn = !flashOn;
    await CardCamera.toggleFlash(flashOn);
  });

  $('#btn-switch-cam').addEventListener('click', () => CardCamera.switchCamera());

  $('#btn-pick-file').addEventListener('click', () => $('#file-input').click());
  $('#file-input').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const dataUrl = await CardCamera.captureFromFile(file);
    handleCapture(dataUrl);
    e.target.value = '';
  });

  $('#btn-capture').addEventListener('click', () => {
    const dataUrl = CardCamera.captureFromVideo($('.card-guide'));
    handleCapture(dataUrl);
  });

  function handleCapture(dataUrl) {
    if (state.bulkMode) {
      state.bulkCaptures.push({ dataUrl });
      updateBulkCount();
      toast(`Captured card ${state.bulkCaptures.length}`);
    } else {
      CardCamera.stop();
      state.pendingImage = dataUrl;
      runOCR(dataUrl);
    }
  }

  $('#btn-bulk-review').addEventListener('click', async () => {
    if (!state.bulkCaptures.length) { toast('Capture at least one card first'); return; }
    CardCamera.stop();
    // Process bulk captures one by one through OCR+review, saving as we go.
    for (const capture of state.bulkCaptures) {
      await runOCR(capture.dataUrl, true);
      await waitForReviewToClose();
    }
    state.bulkCaptures = [];
    renderHome();
    showScreen('home');
  });

  let reviewCloseResolve = null;
  function waitForReviewToClose() {
    return new Promise(resolve => { reviewCloseResolve = resolve; });
  }

  // ================= OCR + REVIEW =================
  async function runOCR(dataUrl, isBulkItem = false) {
    showScreen('processing');
    $('#processing-text').textContent = 'Reading the card…';
    try {
      const text = await CardOCR.recognize(dataUrl, (m) => {
        if (m.status === 'recognizing text') {
          $('#processing-text').textContent = `Reading the card… ${Math.round((m.progress || 0) * 100)}%`;
        } else if (m.status) {
          $('#processing-text').textContent = m.status.replace(/-/g, ' ');
        }
      });
      const { fields, flags } = CardParser.parse(text);
      openReview(fields, flags, dataUrl, isBulkItem);
    } catch (err) {
      console.error(err);
      toast('Could not read the card — try retaking the photo');
      showScreen('scan');
    }
  }

  let currentReviewFlags = {};
  let currentReviewImage = null;
  let currentReviewIsBulk = false;

  function openReview(fields, flags, imageData, isBulkItem = false) {
    currentReviewFlags = flags || {};
    currentReviewImage = imageData;
    currentReviewIsBulk = isBulkItem;
    state.editingContactId = fields.id || null;

    const wrap = $('#review-fields');
    wrap.innerHTML = '';
    FIELD_DEFS.forEach(([key, label, type]) => {
      const row = document.createElement('div');
      const unsure = !!currentReviewFlags[key];
      row.className = 'form-row' + (unsure ? ' form-row--unsure' : '');
      row.innerHTML = `
        <label for="f-${key}">${label}</label>
        <input id="f-${key}" name="${key}" type="${type === 'tel' ? 'tel' : type === 'email' ? 'email' : 'text'}"
               value="${(fields[key] || '').replace(/"/g, '&quot;')}"
               placeholder="${unsure ? 'Could not identify this information' : ''}" />
        ${unsure ? '<span class="hint">Not detected — please fill in or correct</span>' : ''}
      `;
      wrap.appendChild(row);
    });

    $('#f-notes').value = fields.notes || '';
    $('#f-favorite').checked = !!fields.favorite;
    showScreen('review');
  }

  $('#btn-view-original').addEventListener('click', () => {
    if (!currentReviewImage) return;
    window.open(currentReviewImage, '_blank');
  });

  $('#btn-discard').addEventListener('click', () => {
    state.editingContactId = null;
    if (currentReviewIsBulk && reviewCloseResolve) { reviewCloseResolve(); reviewCloseResolve = null; return; }
    showScreen('home');
    renderHome();
  });

  $('#btn-save-card').addEventListener('click', async () => {
    const contact = { id: state.editingContactId || undefined };
    FIELD_DEFS.forEach(([key]) => { contact[key] = $('#f-' + key).value.trim(); });
    contact.notes = $('#f-notes').value.trim();
    contact.favorite = $('#f-favorite').checked;
    contact.imageData = currentReviewImage;

    const dup = await CardStore.findPossibleDuplicate(contact);
    if (dup && !contact.id) {
      const proceed = confirm(`This looks like it might match an existing contact: ${dup.personName || dup.companyName}. Save as a new contact anyway?`);
      if (!proceed) return;
    }

    await CardStore.saveContact(contact);
    toast('Contact saved');
    state.editingContactId = null;

    if (currentReviewIsBulk && reviewCloseResolve) {
      reviewCloseResolve();
      reviewCloseResolve = null;
      return;
    }
    await renderHome();
    showScreen('home');
  });

  // ================= MY CARDS =================
  async function openCardsList() {
    showScreen('cards');
    state.contacts = await CardStore.getAll();
    renderCardsList();
  }

  function renderCardsList() {
    const list = $('#cards-list');
    const empty = $('#cards-empty');
    let items = [...state.contacts];

    const q = state.listFilter.trim().toLowerCase();
    if (q) {
      items = items.filter(c =>
        [c.personName, c.companyName, c.mobile, c.email].some(v => (v || '').toLowerCase().includes(q))
      );
    }
    switch (state.listSort) {
      case 'date_asc': items.sort((a, b) => a.createdAt - b.createdAt); break;
      case 'name': items.sort((a, b) => (a.personName || '').localeCompare(b.personName || '')); break;
      case 'company': items.sort((a, b) => (a.companyName || '').localeCompare(b.companyName || '')); break;
      default: items.sort((a, b) => b.createdAt - a.createdAt);
    }

    list.innerHTML = '';
    empty.hidden = items.length > 0;
    items.forEach(c => list.appendChild(buildCardRow(c)));
  }

  $('#search-input').addEventListener('input', (e) => { state.listFilter = e.target.value; renderCardsList(); });
  $('#sort-select').addEventListener('change', (e) => { state.listSort = e.target.value; renderCardsList(); });

  // ================= DETAIL =================
  async function openDetail(id) {
    const c = await CardStore.getById(id);
    if (!c) return;
    state.editingContactId = id;
    const body = $('#detail-body');
    const rows = FIELD_DEFS.filter(([key]) => c[key]).map(([key, label]) =>
      `<div class="detail-row"><span class="detail-row__label">${label}</span><span class="detail-row__value">${escapeHtml(c[key])}</span></div>`
    ).join('');

    body.innerHTML = `
      ${c.imageData ? `<img class="detail-photo" src="${c.imageData}" alt="Scanned card" />` : ''}
      <h2 class="detail-name">${escapeHtml(c.personName || c.companyName || 'Unknown')} ${c.favorite ? '★' : ''}</h2>
      <p class="detail-sub">${escapeHtml(c.designation || '')}${c.designation && c.companyName ? ' · ' : ''}${escapeHtml(c.companyName || '')}</p>
      ${rows}
      ${c.notes ? `<div class="detail-row"><span class="detail-row__label">Notes</span><span class="detail-row__value">${escapeHtml(c.notes)}</span></div>` : ''}
      <div class="detail-actions">
        ${c.mobile ? `<a class="btn btn--secondary" href="tel:${encodeURIComponent(c.mobile)}">Call</a>` : ''}
        ${c.email ? `<a class="btn btn--secondary" href="mailto:${encodeURIComponent(c.email)}">Email</a>` : ''}
        ${c.website ? `<a class="btn btn--secondary" href="${/^https?:\/\//.test(c.website) ? c.website : 'https://' + c.website}" target="_blank" rel="noopener">Website</a>` : ''}
        <button class="btn btn--secondary" id="btn-share-contact">Share</button>
        <button class="btn btn--danger" id="btn-delete-contact">Delete</button>
      </div>
    `;

    $('#btn-share-contact').addEventListener('click', async () => {
      const text = [c.personName, c.companyName, c.designation, c.mobile, c.email].filter(Boolean).join('\n');
      if (navigator.share) {
        try { await navigator.share({ title: c.personName || 'Contact', text }); } catch (e) {}
      } else {
        await navigator.clipboard.writeText(text);
        toast('Contact details copied');
      }
    });
    $('#btn-delete-contact').addEventListener('click', async () => {
      if (!confirm('Delete this contact? This cannot be undone.')) return;
      await CardStore.deleteContact(id);
      toast('Contact deleted');
      showScreen('cards');
      openCardsList();
    });

    showScreen('detail');
  }

  $('#btn-edit-contact').addEventListener('click', async () => {
    const c = await CardStore.getById(state.editingContactId);
    if (!c) return;
    openReview(c, {}, c.imageData, false);
  });

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  }

  // ================= EXPORT =================
  async function openExport() {
    showScreen('export');
    state.contacts = await CardStore.getAll();
    state.exportSelected = new Set(state.contacts.map(c => c.id));
    renderExportList();
  }

  function renderExportList() {
    const list = $('#export-list');
    list.innerHTML = '';
    state.contacts.forEach(c => {
      const row = buildCardRow(c);
      row.classList.toggle('selected', state.exportSelected.has(c.id));
      row.addEventListener('click', (e) => {
        e.stopPropagation();
        if (state.exportSelected.has(c.id)) state.exportSelected.delete(c.id);
        else state.exportSelected.add(c.id);
        renderExportList();
      }, { once: true });
      list.appendChild(row);
    });
    $('#export-selected-count').textContent = state.exportSelected.size;
    $('#export-total-count').textContent = state.contacts.length;
  }

  $('#btn-select-all').addEventListener('click', () => {
    state.exportSelected = new Set(state.contacts.map(c => c.id));
    renderExportList();
  });
  $('#btn-select-none').addEventListener('click', () => {
    state.exportSelected.clear();
    renderExportList();
  });

  $$('.format-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const selected = state.contacts.filter(c => state.exportSelected.has(c.id));
      if (!selected.length) { toast('Select at least one card'); return; }
      const ok = CardExport.exportContacts(btn.dataset.format, selected);
      if (ok) toast('Export started');
    });
  });

  // ================= SETTINGS =================
  document.addEventListener('click', async (e) => {
    if (e.target.id === 'btn-clear-all') {
      if (!confirm('Delete every saved card and contact? This cannot be undone.')) return;
      await CardStore.clearAll();
      toast('All data deleted');
      renderHome();
    }
  });

  async function updateStorageEstimate() {
    const est = await CardStore.estimateUsage();
    const el = $('#storage-used');
    if (!est || !est.usage) { el.textContent = 'Not available on this browser.'; return; }
    const mb = (est.usage / (1024 * 1024)).toFixed(1);
    el.textContent = `About ${mb} MB used on this device.`;
  }
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-nav="settings"]')) updateStorageEstimate();
  });

  // ================= INIT =================
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    });
  }

  renderHome();
})();
