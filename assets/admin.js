/* ============================================================
   StreamX Admin Portal — Logic (Pro Edition)
   ============================================================ */

(function () {
  'use strict';

  const TOKEN_KEY = 'iptv_admin_token';
  const state = {
    token: localStorage.getItem(TOKEN_KEY) || null,
    channels: [],
    filtered: [],
    search: '',
    healthFilter: 'all', // all | online | offline
    siteLogo: '',
    featuredId: '',
    preview: { hls: null, channel: null, result: null },
    page: 1,
    perPage: 20,
  };

  // SVG icon helper
  const icon = (id, cls = 'ic') => `<svg class="${cls}"><use href="#${id}"/></svg>`;

  // ---------------- DOM ----------------
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => document.querySelectorAll(s);
  const loginScreen = $('#loginScreen');
  const dashboard = $('#dashboard');
  const loginForm = $('#loginForm');
  const loginError = $('#loginError');
  const logoutBtn = $('#logoutBtn');
  const channelTableBody = $('#channelTableBody');
  const channelSearch = $('#channelSearch');
  const perPageSelect = $('#perPageSelect');
  const pagInfo = $('#pagInfo');
  const pagPages = $('#pagPages');
  const pagFirst = $('#pagFirst');
  const pagPrev = $('#pagPrev');
  const pagNext = $('#pagNext');
  const pagLast = $('#pagLast');
  const tableCount = $('#tableCount');
  const addChannelForm = $('#addChannelForm');
  const addChannelMsg = $('#addChannelMsg');
  const importForm = $('#importForm');
  const importMsg = $('#importMsg');
  const exportBtn = $('#exportBtn');
  const deleteInactiveBtn = $('#deleteInactiveBtn');
  const deleteOfflineBtn = $('#deleteOfflineBtn');
  const settingsForm = $('#settingsForm');
  const settingsMsg = $('#settingsMsg');
  const passwordForm = $('#passwordForm');
  const passwordMsg = $('#passwordMsg');
  const featuredSelect = $('#featuredSelect');
  const confirmModal = $('#confirmModal');
  const confirmTitle = $('#confirmTitle');
  const confirmText = $('#confirmText');
  const confirmOk = $('#confirmOk');
  const confirmCancel = $('#confirmCancel');
  const toast = $('#toast');
  const checkAllBtn = $('#checkAllBtn');

  // Preview / test modal
  const previewModal = $('#previewModal');
  const previewVideo = $('#previewVideo');
  const previewLogo = $('#previewLogo');
  const previewName = $('#previewName');
  const previewSub = $('#previewSub');
  const previewLoading = $('#previewLoading');
  const previewFail = $('#previewFail');
  const previewVerdict = $('#previewVerdict');
  const previewMarkBtn = $('#previewMarkBtn');

  // Channel logo upload
  const channelLogoUrl = $('#channelLogoUrl');
  const channelLogoFile = $('#channelLogoFile');
  const channelLogoPreview = $('#channelLogoPreview');
  const channelLogoStatus = $('#channelLogoStatus');

  // Site logo
  const siteLogoUrl = $('#siteLogoUrl');
  const siteLogoFile = $('#siteLogoFile');
  const siteLogoPreview = $('#siteLogoPreview');
  const siteLogoStatus = $('#siteLogoStatus');
  const siteLogoClear = $('#siteLogoClear');

  // ---------------- API ----------------
  async function api(path, opts = {}) {
    const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
    if (state.token) headers.Authorization = `Bearer ${state.token}`;
    const res = await fetch(path, { ...opts, headers });
    if (res.status === 401) {
      logout();
      throw new Error('Session expired. Please log in again.');
    }
    const isJson = res.headers.get('content-type')?.includes('application/json');
    const data = isJson ? await res.json() : await res.text();
    if (!res.ok) {
      const msg = (data && data.error) || 'Request failed';
      throw new Error(msg);
    }
    return data;
  }

  async function uploadImage(file) {
    const fd = new FormData();
    fd.append('image', file);
    const res = await fetch('/api/upload', {
      method: 'POST',
      headers: { Authorization: `Bearer ${state.token}` },
      body: fd,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Upload failed');
    return data.url;
  }

  // ---------------- Init ----------------
  function init() {
    bindEvents();
    if (state.token) showDashboard();
    else showLogin();
  }

  function showLogin() {
    loginScreen.classList.remove('hidden');
    dashboard.classList.add('hidden');
  }

  async function showDashboard() {
    loginScreen.classList.add('hidden');
    dashboard.classList.remove('hidden');
    await loadChannels();
    await loadSettings();
  }

  function logout() {
    state.token = null;
    localStorage.removeItem(TOKEN_KEY);
    showLogin();
  }

  // ---------------- Auth ----------------
  loginForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    loginError.classList.add('hidden');
    const fd = new FormData(loginForm);
    try {
      const data = await api('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          username: fd.get('username'),
          password: fd.get('password'),
        }),
      });
      state.token = data.token;
      localStorage.setItem(TOKEN_KEY, data.token);
      loginForm.reset();
      showDashboard();
    } catch (err) {
      loginError.textContent = err.message;
      loginError.classList.remove('hidden');
    }
  });

  logoutBtn?.addEventListener('click', logout);

  // ---------------- Channels ----------------
  async function loadChannels() {
    try {
      state.channels = await api('/api/channels/all');
      applyChannelFilters();
      renderStats();
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  function applyChannelFilters(resetPage = true) {
    const q = state.search.toLowerCase().trim();
    state.filtered = state.channels.filter((c) => {
      const matchesSearch = !q ||
        c.name.toLowerCase().includes(q) ||
        (c.category || '').toLowerCase().includes(q);
      const matchesHealth =
        state.healthFilter === 'all' ||
        (state.healthFilter === 'online' && c.status === 'online') ||
        (state.healthFilter === 'offline' && c.status === 'offline');
      return matchesSearch && matchesHealth;
    });
    if (resetPage) state.page = 1;
    renderChannelTable();
    renderPagination();
  }

  function renderStats() {
    const total = state.channels.length;
    const online = state.channels.filter((c) => c.status === 'online').length;
    const offline = state.channels.filter((c) => c.status === 'offline').length;
    const categories = new Set(state.channels.map((c) => c.category)).size;

    $('#statTotal').textContent = total;
    $('#statActive').textContent = online;
    $('#statOffline').textContent = offline;
    $('#statCategories').textContent = categories;

    // Update Progress Bars
    if (total > 0) {
      $('#progressTotal').style.width = '100%';
      $('#progressActive').style.width = `${(online / total) * 100}%`;
      $('#progressOffline').style.width = `${(offline / total) * 100}%`;
      $('#progressCategories').style.width = '100%';
    }

    // Update Radial Chart & Overview
    const healthPercent = total > 0 ? Math.round((online / total) * 100) : 0;
    const radial = $('#healthRadial');
    if (radial) radial.style.setProperty('--percent', healthPercent);
    $('#healthPercentText').textContent = `${healthPercent}%`;
    $('#healthyChannelsText').textContent = `${online} Channels`;
    $('#offlineChannelsText').textContent = `${offline} Channels`;

    const badge = $('#platformStatusBadge');
    if (badge) {
      if (healthPercent > 90) { badge.textContent = 'Stable'; badge.style.color = 'var(--ok)'; }
      else if (healthPercent > 70) { badge.textContent = 'Degraded'; badge.style.color = 'var(--warn)'; }
      else { badge.textContent = 'Critical'; badge.style.color = 'var(--danger)'; }
    }
  }

  function healthBadge(status) {
    switch (status) {
      case 'online': return `<span class="health-badge health-online"><span class="dot"></span>Online</span>`;
      case 'offline': return `<span class="health-badge health-offline"><span class="dot"></span>Offline</span>`;
      case 'checking': return `<span class="health-badge health-checking"><span class="dot"></span>Checking…</span>`;
      default: return `<span class="health-badge health-unknown"><span class="dot"></span>Not checked</span>`;
    }
  }

  function renderChannelTable() {
    if (tableCount) tableCount.textContent = `${state.filtered.length} result${state.filtered.length === 1 ? '' : 's'}`;

    if (state.filtered.length === 0) {
      channelTableBody.innerHTML = `
        <tr><td colspan="7" style="text-align:center;color:var(--ink-3);padding:40px">
          No channels found.
        </td></tr>`;
      updateSelectionUI();
      return;
    }

    // Paginate
    const start = (state.page - 1) * state.perPage;
    const end = start + state.perPage;
    const pageItems = state.filtered.slice(start, end);

    channelTableBody.innerHTML = pageItems.map((c) => {
      const initials = c.name.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase();
      const logoHtml = c.logo
        ? `<img src="${escapeAttr(c.logo)}" alt="" onerror="this.outerHTML='<span class=\\'placeholder\\'>${initials}</span>'" />`
        : `<span class="placeholder">${initials}</span>`;
      const isFeatured = c.id === state.featuredId;
      const urlText = c.url
        ? `<span class="ch-cell-url">${escapeHtml(c.url)}</span>`
        : `<span class="ch-cell-url none">No stream URL</span>`;
      return `
        <tr data-id="${c.id}" class="${c.status === 'offline' ? 'row-offline' : ''}">
          <td class="td-check"><input type="checkbox" class="row-check" data-check="${c.id}" /></td>
          <td>
            <div class="ch-cell">
              <div class="row-logo">${logoHtml}</div>
              <div class="ch-cell-text">
                <div class="ch-cell-name">${escapeHtml(c.name)}${isFeatured ? `<span class="feat-badge">${icon('i-star')} Featured</span>` : ''}</div>
                ${urlText}
              </div>
            </div>
          </td>
          <td><span class="cat-pill">${escapeHtml(c.category || 'Other')}</span></td>
          <td>${c.country || '🌐'}</td>
          <td class="health-cell">${healthBadge(c.status)}</td>
          <td>
            <span class="health-badge ${c.active ? 'health-online' : 'health-unknown'}">
              ${c.active ? 'Visible' : 'Hidden'}
            </span>
          </td>
          <td class="actions-col">
            <div class="row-actions">
              <button class="icon-btn" data-action="preview" title="Preview / test stream">${icon('i-play')}</button>
              <button class="icon-btn ${isFeatured ? 'is-active' : ''}" data-action="feature" title="${isFeatured ? 'Featured channel' : 'Set as featured'}">${icon('i-star')}</button>
              <div class="toggle ${c.active ? 'on' : ''}" data-action="toggle" title="Toggle visibility"></div>
              <button class="icon-btn" data-action="edit" title="Edit">${icon('i-edit')}</button>
              <button class="icon-btn danger" data-action="delete" title="Delete">${icon('i-trash')}</button>
            </div>
          </td>
        </tr>`;
    }).join('');
    updateSelectionUI();
  }

  channelTableBody?.addEventListener('click', async (e) => {
    const row = e.target.closest('tr');
    if (!row) return;
    const id = row.dataset.id;
    const channel = state.channels.find((c) => c.id === id);
    if (!channel) return;

    const action = e.target.closest('[data-action]')?.dataset.action;
    if (!action) return;

    if (action === 'toggle') {
      try {
        await api(`/api/channels/${id}/toggle`, { method: 'PATCH' });
        await loadChannels();
      } catch (err) { showToast(err.message, 'error'); }
    } else if (action === 'preview') {
      openPreview(channel);
    } else if (action === 'feature') {
      await setFeatured(channel);
    } else if (action === 'delete') {
      confirm({
        title: 'Delete this channel?',
        text: `"${channel.name}" will be permanently removed.`,
        onOk: async () => {
          try {
            await api(`/api/channels/${id}`, { method: 'DELETE' });
            showToast('Channel deleted');
            await loadChannels();
          } catch (err) { showToast(err.message, 'error'); }
        },
      });
    } else if (action === 'edit') {
      startInlineEdit(row, channel);
    }
  });

  // ---------------- Featured ----------------
  async function setFeatured(channel) {
    const next = state.featuredId === channel.id ? '' : channel.id;
    try {
      const updated = await api('/api/settings', {
        method: 'PUT',
        body: JSON.stringify({ featuredId: next }),
      });
      state.featuredId = updated.featuredId || '';
      if (featuredSelect) featuredSelect.value = state.featuredId;
      applyChannelFilters();
      showToast(next ? `"${channel.name}" is now the hero channel` : 'Hero channel cleared');
    } catch (err) { showToast(err.message, 'error'); }
  }

  async function checkSingle(id, row) {
    const cell = row.querySelector('.health-cell');
    if (cell) cell.innerHTML = healthBadge('checking');
    try {
      const result = await api(`/api/channels/${id}/check`, { method: 'POST' });
      const ch = state.channels.find((c) => c.id === id);
      if (ch) { ch.status = result.status; ch.lastChecked = result.lastChecked; }
      applyChannelFilters();
      renderStats();
      showToast(result.status === 'online' ? 'Stream is online ✓' : 'Stream is offline ✕',
        result.status === 'online' ? 'success' : 'error');
    } catch (err) {
      showToast(err.message, 'error');
      await loadChannels();
    }
  }

  function startInlineEdit(row, channel) {
    openEditModal(channel);
  }

  // ---------------- Edit Modal ----------------
  const editModal = $('#editModal');
  const editForm = $('#editForm');
  const editId = $('#editId');
  const editName = $('#editName');
  const editUrl = $('#editUrl');
  const editCategory = $('#editCategory');
  const editCountry = $('#editCountry');
  const editLogo = $('#editLogo');
  const editLogoPreview = $('#editLogoPreview');
  const editLogoFile = $('#editLogoFile');
  const editLogoStatus = $('#editLogoStatus');
  const editActive = $('#editActive');
  const editSaveBtn = $('#editSaveBtn');
  const editSubtitle = $('#editSubtitle');

  function openEditModal(channel) {
    if (!channel) return;
    editId.value = channel.id;
    editName.value = channel.name || '';
    editUrl.value = channel.url || '';

    // Set category — ensure value matches an option in the dynamic dropdown
    const catOpt = editCategory.querySelector(`option[value="${escapeAttr(channel.category)}"]`);
    editCategory.value = catOpt ? channel.category : (editCategory.options[0]?.value || '');

    // Set country — channel.country stores the code (e.g. "🇧🇩")
    const countryOpt = editCountry.querySelector(`option[value="${escapeAttr(channel.country)}"]`);
    editCountry.value = countryOpt ? channel.country : (editCountry.options[0]?.value || '');

    editLogo.value = channel.logo || '';
    editActive.checked = channel.active !== false;
    editSubtitle.textContent = channel.name;
    updateEditLogoPreview(channel.logo);
    requestAnimationFrame(() => {
      editModal.classList.remove('hidden');
    });
  }

  function closeEditModal() {
    editModal.classList.add('hidden');
  }

  function updateEditLogoPreview(url) {
    if (url) {
      editLogoPreview.innerHTML = `<img src="${escapeAttr(url)}" alt="" onerror="this.parentElement.innerHTML='<span class=\\'logo-ph\\'>Bad URL</span>'" />`;
    } else {
      editLogoPreview.innerHTML = `<span class="logo-ph">No logo</span>`;
    }
  }

  editLogo?.addEventListener('input', () => updateEditLogoPreview(editLogo.value.trim()));

  editLogoFile?.addEventListener('change', async () => {
    const file = editLogoFile.files[0];
    if (!file) return;
    editLogoStatus.textContent = 'Uploading…';
    try {
      const url = await uploadImage(file);
      editLogo.value = url;
      updateEditLogoPreview(url);
      editLogoStatus.textContent = '✓ Uploaded';
      editLogoStatus.style.color = 'var(--ok-soft)';
    } catch (err) {
      editLogoStatus.textContent = err.message;
      editLogoStatus.style.color = 'var(--danger-soft)';
    }
  });

  editSaveBtn?.addEventListener('click', async () => {
    const id = editId.value;
    if (!id) return;
    const name = editName.value.trim();
    if (!name) { showToast('Channel name is required', 'error'); return; }

    const payload = {
      name,
      url: editUrl.value.trim(),
      category: editCategory.value,
      country: editCountry.value,
      logo: editLogo.value.trim(),
      active: editActive.checked,
    };

    try {
      await api(`/api/channels/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
      showToast('Channel updated');
      closeEditModal();
      await loadChannels();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  // Close edit modal — only via X button or Cancel, NOT backdrop click
  editModal?.addEventListener('click', (e) => {
    const closeEl = e.target.closest('[data-edit-close]');
    if (closeEl) closeEditModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && editModal && !editModal.classList.contains('hidden')) closeEditModal();
  });

  channelSearch?.addEventListener('input', (e) => {
    state.search = e.target.value;
    applyChannelFilters();
  });

  // Filter pills
  $$('.filter-pills .pill').forEach((pill) => {
    pill.addEventListener('click', () => {
      $$('.filter-pills .pill').forEach((p) => p.classList.remove('active'));
      pill.classList.add('active');
      state.healthFilter = pill.dataset.filter;
      applyChannelFilters();
    });
  });

  // ---------------- Pagination ----------------
  perPageSelect?.addEventListener('change', () => {
    state.perPage = parseInt(perPageSelect.value, 10) || 20;
    state.page = 1;
    renderChannelTable();
    renderPagination();
  });
  pagFirst?.addEventListener('click', () => goToPage(1));
  pagPrev?.addEventListener('click', () => goToPage(state.page - 1));
  pagNext?.addEventListener('click', () => goToPage(state.page + 1));
  pagLast?.addEventListener('click', () => goToPage(totalPages()));

  function totalPages() { return Math.max(1, Math.ceil(state.filtered.length / state.perPage)); }
  function goToPage(p) {
    const max = totalPages();
    state.page = Math.max(1, Math.min(p, max));
    renderChannelTable();
    renderPagination();
  }

  function renderPagination() {
    const total = state.filtered.length;
    const pages = totalPages();
    const start = (state.page - 1) * state.perPage + 1;
    const end = Math.min(state.page * state.perPage, total);

    if (pagInfo) pagInfo.textContent = total > 0 ? `${start}–${end} of ${total}` : '0 results';
    if (pagFirst) pagFirst.disabled = state.page <= 1;
    if (pagPrev) pagPrev.disabled = state.page <= 1;
    if (pagNext) pagNext.disabled = state.page >= pages;
    if (pagLast) pagLast.disabled = state.page >= pages;

    if (!pagPages) return;
    // Build page buttons (max 7 visible)
    const btns = [];
    const maxVisible = 7;
    let rangeStart = Math.max(1, state.page - 3);
    let rangeEnd = Math.min(pages, rangeStart + maxVisible - 1);
    if (rangeEnd - rangeStart < maxVisible - 1) rangeStart = Math.max(1, rangeEnd - maxVisible + 1);

    if (rangeStart > 1) { btns.push(pageBtn(1)); if (rangeStart > 2) btns.push('<span class="pag-page ellipsis">…</span>'); }
    for (let i = rangeStart; i <= rangeEnd; i++) btns.push(pageBtn(i));
    if (rangeEnd < pages) { if (rangeEnd < pages - 1) btns.push('<span class="pag-page ellipsis">…</span>'); btns.push(pageBtn(pages)); }

    pagPages.innerHTML = btns.join('');
    pagPages.querySelectorAll('.pag-page[data-p]').forEach((btn) => {
      btn.addEventListener('click', () => goToPage(parseInt(btn.dataset.p, 10)));
    });
  }

  function pageBtn(n) {
    return `<button class="pag-page ${n === state.page ? 'active' : ''}" data-p="${n}">${n}</button>`;
  }

  // ---------------- Multi-select / Bulk delete ----------------
  const selectionBar = $('#selectionBar');
  const selCount = $('#selCount');
  const selCheckAll = $('#selCheckAll');
  const selDeleteBtn = $('#selDeleteBtn');
  const headerCheckAll = $('#headerCheckAll');

  state.selected = new Set();

  function getSelectedIds() { return [...state.selected]; }

  function updateSelectionUI() {
    const count = state.selected.size;
    if (selectionBar) selectionBar.classList.toggle('hidden', count === 0);
    if (selCount) selCount.textContent = `${count} selected`;
    // Sync header checkbox
    const checks = channelTableBody.querySelectorAll('.row-check');
    const allChecked = checks.length > 0 && [...checks].every((c) => c.checked);
    const someChecked = [...checks].some((c) => c.checked);
    if (headerCheckAll) {
      headerCheckAll.checked = allChecked;
      headerCheckAll.indeterminate = someChecked && !allChecked;
    }
    if (selCheckAll) {
      selCheckAll.checked = allChecked;
      selCheckAll.indeterminate = someChecked && !allChecked;
    }
  }

  // Row checkbox change
  channelTableBody?.addEventListener('change', (e) => {
    const check = e.target.closest('.row-check');
    if (!check) return;
    const id = check.dataset.check;
    if (!id) return;
    if (check.checked) state.selected.add(id);
    else state.selected.delete(id);
    updateSelectionUI();
  });

  // Header check-all
  headerCheckAll?.addEventListener('change', () => {
    const checks = channelTableBody.querySelectorAll('.row-check');
    checks.forEach((c) => {
      c.checked = headerCheckAll.checked;
      const id = c.dataset.check;
      if (id) { if (headerCheckAll.checked) state.selected.add(id); else state.selected.delete(id); }
    });
    updateSelectionUI();
  });

  // Selection bar check-all
  selCheckAll?.addEventListener('change', () => {
    const checks = channelTableBody.querySelectorAll('.row-check');
    checks.forEach((c) => {
      c.checked = selCheckAll.checked;
      const id = c.dataset.check;
      if (id) { if (selCheckAll.checked) state.selected.add(id); else state.selected.delete(id); }
    });
    updateSelectionUI();
  });

  // Delete selected
  selDeleteBtn?.addEventListener('click', () => {
    const ids = getSelectedIds();
    if (ids.length === 0) return;
    confirm({
      title: `Delete ${ids.length} channel${ids.length === 1 ? '' : 's'}?`,
      text: 'This will permanently remove the selected channels. Cannot be undone.',
      onOk: async () => {
        try {
          await Promise.all(ids.map((id) => api(`/api/channels/${id}`, { method: 'DELETE' })));
          state.selected.clear();
          showToast(`Deleted ${ids.length} channels`);
          await loadChannels();
        } catch (err) { showToast(err.message, 'error'); }
      },
    });
  });

  // Check all streams
  checkAllBtn?.addEventListener('click', async () => {
    const spinner = checkAllBtn.querySelector('.btn-spinner');
    const btnIco = checkAllBtn.querySelector('.btn-ico');
    const label = checkAllBtn.querySelector('.btn-label');
    spinner.classList.remove('hidden');
    if (btnIco) btnIco.classList.add('hidden');
    label.textContent = 'Checking…';
    checkAllBtn.disabled = true;
    try {
      const result = await api('/api/channels/check-all', { method: 'POST' });
      state.channels = result.channels;
      applyChannelFilters();
      renderStats();
      showToast(`Checked ${result.checked} streams — ${result.online} online, ${result.offline} offline`,
        result.offline > 0 ? 'error' : 'success');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      spinner.classList.add('hidden');
      if (btnIco) btnIco.classList.remove('hidden');
      label.textContent = 'Check All Streams';
      checkAllBtn.disabled = false;
    }
  });

  // ---------------- Channel logo upload ----------------
  function setChannelLogoPreview(url) {
    if (url) {
      channelLogoPreview.innerHTML = `<img src="${escapeAttr(url)}" alt="" onerror="this.parentElement.innerHTML='<span class=\\'logo-ph\\'>Bad URL</span>'" />`;
    } else {
      channelLogoPreview.innerHTML = `<span class="logo-ph">No logo</span>`;
    }
  }
  channelLogoUrl?.addEventListener('input', () => setChannelLogoPreview(channelLogoUrl.value.trim()));
  channelLogoFile?.addEventListener('change', async () => {
    const file = channelLogoFile.files[0];
    if (!file) return;
    channelLogoStatus.textContent = 'Uploading…';
    try {
      const url = await uploadImage(file);
      channelLogoUrl.value = url;
      setChannelLogoPreview(url);
      channelLogoStatus.textContent = '✓ Uploaded';
      channelLogoStatus.style.color = 'var(--admin-accent-hover)';
    } catch (err) {
      channelLogoStatus.textContent = err.message;
      channelLogoStatus.style.color = 'var(--admin-danger-hover)';
    }
  });

  // ---------------- Site logo upload ----------------
  function setSiteLogoPreview(url) {
    if (url) {
      siteLogoPreview.innerHTML = `<img src="${escapeAttr(url)}" alt="" onerror="this.parentElement.innerHTML='<span class=\\'logo-ph\\'>Bad URL</span>'" />`;
    } else {
      siteLogoPreview.innerHTML = `<span class="logo-ph">No logo</span>`;
    }
  }
  siteLogoUrl?.addEventListener('input', () => {
    state.siteLogo = siteLogoUrl.value.trim();
    setSiteLogoPreview(state.siteLogo);
  });
  siteLogoFile?.addEventListener('change', async () => {
    const file = siteLogoFile.files[0];
    if (!file) return;
    siteLogoStatus.textContent = 'Uploading…';
    try {
      const url = await uploadImage(file);
      state.siteLogo = url;
      siteLogoUrl.value = url;
      setSiteLogoPreview(url);
      siteLogoStatus.textContent = '✓ Uploaded';
      siteLogoStatus.style.color = 'var(--admin-accent-hover)';
    } catch (err) {
      siteLogoStatus.textContent = err.message;
      siteLogoStatus.style.color = 'var(--admin-danger-hover)';
    }
  });
  siteLogoClear?.addEventListener('click', () => {
    state.siteLogo = '';
    siteLogoUrl.value = '';
    setSiteLogoPreview('');
    siteLogoStatus.textContent = '';
  });

  // ---------------- Add channel ----------------
  addChannelForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(addChannelForm);
    const payload = {
      name: fd.get('name'),
      url: fd.get('url'),
      category: fd.get('category'),
      country: fd.get('country'),
      logo: fd.get('logo'),
      active: fd.get('active') === 'on',
    };
    try {
      await api('/api/channels', { method: 'POST', body: JSON.stringify(payload) });
      addChannelMsg.textContent = '✓ Added';
      addChannelMsg.className = 'form-msg success';
      addChannelForm.reset();
      addChannelForm.querySelector('[name="active"]').checked = true;
      setChannelLogoPreview('');
      channelLogoStatus.textContent = '';
      await loadChannels();
      setTimeout(() => { addChannelMsg.textContent = ''; }, 2500);
    } catch (err) {
      addChannelMsg.textContent = err.message;
      addChannelMsg.className = 'form-msg error';
    }
  });

  // ---------------- Duplicate Checker ----------------
  $('#findDuplicatesBtn')?.addEventListener('click', async (e) => {
      if (e) { e.preventDefault(); e.stopPropagation(); }
      const container = $('#duplicateGroupsContainer');
      const area = $('#duplicateResults');
      const loader = $('#duplicateLoading');

      area.classList.remove('hidden');
      container.classList.add('hidden');
      loader.classList.remove('hidden');

      try {
          const groups = await api('/api/channels/duplicates/analyze');
          loader.classList.add('hidden');
          container.classList.remove('hidden');

          if (!groups || groups.length === 0) {
              container.innerHTML = '<div class="card" style="padding:40px; text-align:center;"><p class="muted">No duplicate channels found in your system. Everything is optimized!</p></div>';
              return;
          }

          container.innerHTML = groups.map(group => `
              <div class="dup-group card">
                  <div class="dup-group-header">
                      <h4>Duplicate: "${escapeHtml(group.key)}"</h4>
                      <span class="badge">${group.items.length} copies found</span>
                  </div>
                  <div class="dup-items-list">
                      ${group.items.map(ch => {
                          const isBest = ch.id === group.bestId;
                          return `
                              <div class="dup-item ${isBest ? 'best' : ''}">
                                  <div class="dup-meta">
                                      <span class="dup-name">${escapeHtml(ch.name)}</span>
                                      <span class="ch-cell-url">${escapeHtml(ch.url)}</span>
                                  </div>
                                  <div class="dup-perf">
                                      <span class="dup-latency">${ch.latency === 99999 ? 'Timeout' : ch.latency + 'ms'}</span>
                                      <span class="dup-status ${ch.online ? 'ok' : 'danger-text'}">
                                          ${ch.online ? 'Online' : 'Offline'}
                                      </span>
                                  </div>
                                  <div class="dup-action">
                                      ${isBest ? `<span class="feat-badge">${icon('i-check')} Recommended Best</span>` : `
                                          <button type="button" class="btn btn-danger-ghost btn-sm" onclick="triggerDeleteDuplicate('${ch.id}')">
                                              ${icon('i-trash')} Delete Copy
                                          </button>
                                      `}
                                  </div>
                              </div>
                          `;
                      }).join('')}
                  </div>
              </div>
          `).join('');
      } catch (e) {
          showToast(e.message, 'error');
          loader.classList.add('hidden');
      }
  });

  window.triggerDeleteDuplicate = (id) => {
      confirm({
          title: 'Delete Duplicate Copy?',
          text: 'This will permanently remove this duplicate stream link. The best-performing channel will remain.',
          onOk: async () => {
              try {
                  await api(`/api/channels/${id}`, { method: 'DELETE' });
                  showToast('Duplicate channel copy removed');
                  // Refresh duplicates list
                  const scanBtn = document.getElementById('findDuplicatesBtn');
                  if (scanBtn) scanBtn.click();
                  loadChannels();
              } catch(e) {
                  showToast(e.message, 'error');
              }
          }
      });
  };

  // Import tabs
  $$('.import-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      $$('.import-tab').forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      const panel = tab.dataset.importTab;
      $$('.import-panel').forEach((p) => p.classList.toggle('active', p.dataset.importPanel === panel));
    });
  });

  // Import from URL
  importForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(importForm);
    importMsg.textContent = 'Importing…';
    importMsg.className = 'form-msg';
    try {
      const data = await api('/api/import-m3u', {
        method: 'POST',
        body: JSON.stringify({ url: fd.get('url') }),
      });
      importMsg.textContent = `✓ Imported ${data.imported} channels`;
      importMsg.className = 'form-msg success';
      importForm.reset();
      await loadChannels();
    } catch (err) {
      importMsg.textContent = err.message;
      importMsg.className = 'form-msg error';
    }
  });

  // Import from file upload
  const fileDropZone = $('#fileDropZone');
  const importFileInput = $('#importFileInput');
  const importFileMsg = $('#importFileMsg');

  fileDropZone?.addEventListener('click', () => importFileInput.click());
  fileDropZone?.addEventListener('dragover', (e) => { e.preventDefault(); fileDropZone.classList.add('dragover'); });
  fileDropZone?.addEventListener('dragleave', () => fileDropZone.classList.remove('dragover'));
  fileDropZone?.addEventListener('drop', (e) => {
    e.preventDefault();
    fileDropZone.classList.remove('dragover');
    const file = e.dataTransfer?.files?.[0];
    if (file) handleM3UFile(file);
  });
  importFileInput?.addEventListener('change', () => {
    const file = importFileInput.files?.[0];
    if (file) handleM3UFile(file);
    importFileInput.value = '';
  });

  async function handleM3UFile(file) {
    if (!file) return;
    importFileMsg.textContent = `Uploading "${file.name}"…`;
    importFileMsg.className = 'form-msg';

    const fd = new FormData();
    fd.append('file', file);

    try {
      const res = await fetch('/api/import-m3u-file', {
        method: 'POST',
        headers: { Authorization: `Bearer ${state.token}` },
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      importFileMsg.textContent = `✓ Imported ${data.imported} channels from "${file.name}"`;
      importFileMsg.className = 'form-msg success';
      await loadChannels();
    } catch (err) {
      importFileMsg.textContent = err.message;
      importFileMsg.className = 'form-msg error';
    }
  }

  exportBtn?.addEventListener('click', async () => {
    try {
      const res = await fetch('/api/export-m3u', {
        headers: { Authorization: `Bearer ${state.token}` },
      });
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'channels.m3u';
      a.click();
      URL.revokeObjectURL(url);
      showToast('Export downloaded');
    } catch (err) { showToast(err.message, 'error'); }
  });

  deleteInactiveBtn?.addEventListener('click', () => {
    confirm({
      title: 'Delete all inactive channels?',
      text: 'This will permanently remove every channel currently marked inactive.',
      onOk: async () => {
        try {
          const data = await api('/api/channels/inactive/all', { method: 'DELETE' });
          showToast(`Removed ${data.removed} inactive channels`);
          await loadChannels();
        } catch (err) { showToast(err.message, 'error'); }
      },
    });
  });

  deleteOfflineBtn?.addEventListener('click', () => {
    const count = state.channels.filter((c) => c.status === 'offline').length;
    if (count === 0) {
      showToast('No offline streams. Run "Check All Streams" first.', 'error');
      return;
    }
    confirm({
      title: `Delete ${count} offline stream${count === 1 ? '' : 's'}?`,
      text: 'This permanently removes every channel whose last health check failed. Run a fresh check first to be sure.',
      onOk: async () => {
        try {
          const data = await api('/api/channels/offline/all', { method: 'DELETE' });
          showToast(`Removed ${data.removed} offline channels`);
          await loadChannels();
          await loadSettings();
        } catch (err) { showToast(err.message, 'error'); }
      },
    });
  });

  // ---------------- Settings ----------------
  async function loadSettings() {
    try {
      const s = await api('/api/settings');
      settingsForm.querySelector('[name="siteName"]').value = s.siteName || '';
      settingsForm.querySelector('[name="heroTitle"]').value = s.heroTitle || '';
      settingsForm.querySelector('[name="heroSubtitle"]').value = s.heroSubtitle || '';
      settingsForm.querySelector('[name="maintenanceMode"]').checked = !!s.maintenanceMode;
      state.siteLogo = s.siteLogo || '';
      state.featuredId = s.featuredId || '';
      if (siteLogoUrl) siteLogoUrl.value = s.siteLogo || '';
      setSiteLogoPreview(s.siteLogo || '');
      populateFeaturedSelect();
      applyBranding(s);

      // Category & Country Management
      state.categories = s.categories || [];
      state.countries = s.countries || [];
      renderManagementTags();
      updateDropdowns(state.categories, state.countries);
    } catch (err) { /* silent */ }
  }

  function renderManagementTags() {
    const catContainer = document.getElementById('catTags');
    const countryContainer = document.getElementById('countryTags');
    if (!catContainer || !countryContainer) return;

    catContainer.innerHTML = state.categories.map((cat, i) => `
        <div class="mgmt-tag">
            <span>${escapeHtml(cat)}</span>
            <button type="button" class="tag-remove cat-remove-btn" data-idx="${i}">${icon('i-x')}</button>
        </div>
    `).join('');

    countryContainer.innerHTML = state.countries.map((c, i) => `
        <div class="mgmt-tag">
            <span>${escapeHtml(c.code + ' ' + c.name)}</span>
            <button type="button" class="tag-remove country-remove-btn" data-idx="${i}">${icon('i-x')}</button>
        </div>
    `).join('');

    // Attach click events individually to avoid delegation double-firing
    catContainer.querySelectorAll('.cat-remove-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const idx = parseInt(btn.dataset.idx, 10);
        const catName = state.categories[idx];
        confirm({
          title: 'Delete Category?',
          text: `Are you sure you want to remove "${catName}"?`,
          onOk: async () => {
            state.categories.splice(idx, 1);
            await saveMgmt();
          }
        });
      });
    });

    countryContainer.querySelectorAll('.country-remove-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const idx = parseInt(btn.dataset.idx, 10);
        const country = state.countries[idx];
        confirm({
          title: 'Delete Country?',
          text: `Are you sure you want to remove "${country.code} ${country.name}"?`,
          onOk: async () => {
            state.countries.splice(idx, 1);
            await saveMgmt();
          }
        });
      });
    });
  }

  // Remove the old delegation code completely
  async function saveMgmt() {
    try {
        await api('/api/settings', { method: 'PUT', body: JSON.stringify({
            categories: state.categories,
            countries: state.countries
        }) });
        renderManagementTags();
        updateDropdowns(state.categories, state.countries);
        showToast('Updated successfully');
    } catch(e) { showToast(e.message, 'error'); }
  }

  // --- Add Category ---
  async function addCategory() {
    const input = document.getElementById('newCatInput');
    const val = input.value.trim();
    if (!val || state.categories.includes(val)) return;
    state.categories.push(val);
    input.value = '';
    await saveMgmt();
  }
  document.getElementById('addCatBtn')?.addEventListener('click', addCategory);
  document.getElementById('newCatInput')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); addCategory(); }
  });

  // --- Add Country ---
  async function addCountry() {
    const codeInput = document.getElementById('newCountryCode');
    const nameInput = document.getElementById('newCountryName');
    const code = codeInput.value.trim();
    const name = nameInput.value.trim();
    if (!code || !name || state.countries.find(c => c.code === code)) return;
    state.countries.push({ code, name });
    codeInput.value = '';
    nameInput.value = '';
    await saveMgmt();
  }
  document.getElementById('addCountryBtn')?.addEventListener('click', addCountry);
  document.getElementById('newCountryName')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); addCountry(); }
  });

  function updateDropdowns(categories, countries) {
    const catSelects = [document.querySelector('[name="category"]'), document.getElementById('editCategory')];
    const countrySelects = [document.querySelector('[name="country"]'), document.getElementById('editCountry')];

    catSelects.forEach(select => {
        if (!select) return;
        const val = select.value;
        select.innerHTML = categories.map(c => `<option value="${escapeAttr(c)}">${escapeHtml(c)}</option>`).join('');
        select.value = val;
    });

    countrySelects.forEach(select => {
        if (!select) return;
        const val = select.value;
        select.innerHTML = countries.map(c => `<option value="${escapeAttr(c.code)}">${escapeHtml(c.code + ' ' + c.name)}</option>`).join('');
        select.value = val;
    });
  }


  function populateFeaturedSelect() {
    if (!featuredSelect) return;
    const opts = ['<option value="">Auto — pick the first available channel</option>']
      .concat(
        state.channels
          .slice()
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((c) => `<option value="${escapeAttr(c.id)}">${escapeHtml(c.name)}${c.url ? '' : ' (no URL)'}</option>`)
      );
    featuredSelect.innerHTML = opts.join('');
    featuredSelect.value = state.featuredId || '';
  }

  function applyBranding(s) {
    const sidebarName = $('#sidebarName');
    const sidebarBrand = $('#sidebarBrand');
    if (s.siteLogo) {
      sidebarBrand.innerHTML = `<img src="${escapeAttr(s.siteLogo)}" alt="logo" class="logo-img" />`;
    } else if (sidebarName) {
      sidebarName.textContent = (s.siteName || 'StreamX').split(' ')[0];
    }
  }

  settingsForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(settingsForm);
    try {
      const updated = await api('/api/settings', {
        method: 'PUT',
        body: JSON.stringify({
          siteName: fd.get('siteName'),
          siteLogo: state.siteLogo || '',
          heroTitle: fd.get('heroTitle'),
          heroSubtitle: fd.get('heroSubtitle'),
          featuredId: fd.get('featuredId') || '',
          maintenanceMode: fd.get('maintenanceMode') === 'on',
        }),
      });
      state.featuredId = updated.featuredId || '';
      settingsMsg.textContent = '✓ Saved';
      settingsMsg.className = 'form-msg success';
      applyBranding(updated);
      applyChannelFilters();
      setTimeout(() => { settingsMsg.textContent = ''; }, 2500);
    } catch (err) {
      settingsMsg.textContent = err.message;
      settingsMsg.className = 'form-msg error';
    }
  });

  passwordForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(passwordForm);
    try {
      await api('/api/settings', {
        method: 'PUT',
        body: JSON.stringify({ newPassword: fd.get('newPassword') }),
      });
      passwordMsg.textContent = '✓ Password updated';
      passwordMsg.className = 'form-msg success';
      passwordForm.reset();
      setTimeout(() => { passwordMsg.textContent = ''; }, 2500);
    } catch (err) {
      passwordMsg.textContent = err.message;
      passwordMsg.className = 'form-msg error';
    }
  });

  // ---------------- Sidebar nav ----------------
  const VIEW_STORAGE_KEY = 'iptv_admin_last_view';

  function activateView(viewName, animate = true) {
    const btn = document.querySelector(`.nav-item[data-view="${viewName}"]`);
    if (!btn) return;

    // Reset all nav items and views
    $$('.nav-item').forEach((b) => b.classList.remove('active'));
    $$('.view').forEach((v) => v.classList.remove('active'));

    btn.classList.add('active');
    const targetView = document.querySelector(`.view[data-view="${viewName}"]`);
    if (targetView) {
        targetView.classList.add('active');
        // Only apply animation when clicking, not on initial load
        if (animate) {
          targetView.style.animation = null;
        } else {
          targetView.style.animation = 'none';
        }
    }

    // Save to localStorage
    localStorage.setItem(VIEW_STORAGE_KEY, viewName);
  }

  function bindEvents() {
    // Restore last view from storage without animation
    const lastView = localStorage.getItem(VIEW_STORAGE_KEY) || 'dashboard';
    activateView(lastView, false);

    $$('.nav-item').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const view = btn.dataset.view;
        activateView(view, true);
      });
    });

    // Dashboard Quick Action Tiles
    $('#tileCheckAll')?.addEventListener('click', (e) => {
        e.preventDefault();
        activateView('channels', true);
        setTimeout(() => $('#checkAllBtn')?.click(), 100);
    });
    $('#tileDeleteOffline')?.addEventListener('click', (e) => {
        e.preventDefault();
        activateView('bulk', true);
    });
    $('#tileExportM3u')?.addEventListener('click', (e) => {
        e.preventDefault();
        $('#exportBtn')?.click();
    });
  }

  // ---------------- Confirm modal ----------------
  let confirmCallback = null;
  function confirm({ title, text, onOk }) {
    confirmTitle.textContent = title;
    confirmText.textContent = text;
    confirmCallback = onOk;
    confirmModal.classList.remove('hidden');
  }
  confirmCancel?.addEventListener('click', () => confirmModal.classList.add('hidden'));
  confirmOk?.addEventListener('click', () => {
    confirmModal.classList.add('hidden');
    if (confirmCallback) confirmCallback();
    confirmCallback = null;
  });
  confirmModal?.addEventListener('click', (e) => {
    if (e.target === confirmModal) confirmModal.classList.add('hidden');
  });

  // ---------------- Preview / Test player ----------------
  function openPreview(channel) {
    state.preview.channel = channel;
    state.preview.result = null;

    // Logo
    if (channel.logo) {
      previewLogo.innerHTML = `<img src="${escapeAttr(channel.logo)}" alt="" onerror="this.parentElement.innerHTML='<span class=\\'ph\\'>${channel.name[0] || '?'}</span>'" />`;
    } else {
      previewLogo.innerHTML = `<span class="ph">${escapeHtml((channel.name[0] || '?').toUpperCase())}</span>`;
    }
    previewName.textContent = channel.name;
    previewSub.textContent = `${channel.category || 'Live'} • ${channel.country || '🌐'}`;
    previewVerdict.textContent = '';
    previewVerdict.className = 'preview-verdict';
    previewMarkBtn.disabled = true;

    previewFail.classList.add('hidden');
    previewLoading.classList.remove('hidden');
    previewModal.classList.remove('hidden');

    cleanupPreview();

    if (!channel.url) {
      failPreview('This channel has no stream URL.');
      return;
    }

    if (window.Hls && window.Hls.isSupported()) {
      const hls = new Hls({ enableWorker: true });
      state.preview.hls = hls;
      hls.loadSource(channel.url);
      hls.attachMedia(previewVideo);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        previewLoading.classList.add('hidden');
        previewVideo.play().catch(() => {});
        markPreview('online');
      });
      hls.on(Hls.Events.ERROR, (_, data) => {
        if (data.fatal) failPreview('Stream failed to load. It may be offline or geo-restricted.');
      });
    } else if (previewVideo.canPlayType('application/vnd.apple.mpegurl')) {
      previewVideo.src = channel.url;
      previewVideo.addEventListener('loadedmetadata', () => {
        previewLoading.classList.add('hidden');
        previewVideo.play().catch(() => {});
        markPreview('online');
      }, { once: true });
      previewVideo.addEventListener('error', () => failPreview('Stream playback failed.'), { once: true });
    } else {
      failPreview('This browser cannot play HLS streams.');
    }
  }

  function markPreview(result) {
    state.preview.result = result;
    if (result === 'online') {
      previewVerdict.innerHTML = `${icon('i-check')} Stream is playing — looks healthy`;
      previewVerdict.className = 'preview-verdict online';
    } else {
      previewVerdict.innerHTML = `${icon('i-alert')} Stream did not play`;
      previewVerdict.className = 'preview-verdict offline';
    }
    previewMarkBtn.disabled = false;
  }

  function failPreview(msg) {
    previewLoading.classList.add('hidden');
    previewFail.classList.remove('hidden');
    previewFail.querySelector('span').textContent = msg;
    markPreview('offline');
  }

  function cleanupPreview() {
    if (state.preview.hls) { try { state.preview.hls.destroy(); } catch {} state.preview.hls = null; }
    previewVideo.pause();
    previewVideo.removeAttribute('src');
    previewVideo.load();
  }

  function closePreview() {
    previewModal.classList.add('hidden');
    cleanupPreview();
  }

  // Save the verdict from the preview as the channel's health status
  previewMarkBtn?.addEventListener('click', async () => {
    const ch = state.preview.channel;
    const result = state.preview.result;
    if (!ch || !result) return;
    try {
      await api(`/api/channels/${ch.id}`, {
        method: 'PUT',
        body: JSON.stringify({ status: result, lastChecked: new Date().toISOString() }),
      });
      const local = state.channels.find((c) => c.id === ch.id);
      if (local) { local.status = result; }
      applyChannelFilters();
      renderStats();
      showToast(`Saved: "${ch.name}" marked ${result}`);
      closePreview();
    } catch (err) { showToast(err.message, 'error'); }
  });

  previewModal?.addEventListener('click', (e) => {
    // Only close via [data-close] buttons, not backdrop
    const closeEl = e.target.closest('[data-close]');
    if (closeEl) closePreview();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !previewModal.classList.contains('hidden')) closePreview();
  });

  // ---------------- Toast ----------------
  let toastTimer;
  function showToast(message, type = 'success') {
    toast.textContent = message;
    toast.className = `toast ${type === 'error' ? 'error' : ''}`;
    toast.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.add('hidden'), 3200);
  }

  // ---------------- Helpers ----------------
  function escapeHtml(str = '') {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
  function escapeAttr(str = '') { return escapeHtml(str); }

  document.addEventListener('DOMContentLoaded', init);
})();
