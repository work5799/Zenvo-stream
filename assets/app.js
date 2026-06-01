/* ============================================================
   StreamX IPTV — Public App Logic (Pro Edition)
   ============================================================ */

(function () {
  'use strict';

  const state = {
    channels: [],
    filtered: [],
    category: 'All',
    search: '',
    featured: null,
    featuredId: '',
    hls: null,
  };

  const CATEGORIES = ['All', 'Bangladesh', 'India', 'Sports', 'News', 'Movies', 'Kids', 'Music'];

  // ---------------- DOM ----------------
  const $ = (sel) => document.querySelector(sel);
  const grid = $('#channelGrid');
  const emptyState = $('#emptyState');
  const channelCount = $('#channelCount');
  const navCategories = $('#navCategories');
  const searchInput = $('#searchInput');
  const searchInputMobile = $('#searchInputMobile');
  const heroTitle = $('#heroTitle');
  const heroSubtitle = $('#heroSubtitle');
  const logoText = $('#logoText');
  const siteLogo = $('#siteLogo');
  const footerName = $('#footerName');
  const maintenance = $('#maintenance');
  const header = $('#header');
  const scrollProgress = $('#scrollProgress');
  const sectionTitle = $('#sectionTitle');

  const statChannels = $('#statChannels');
  const statCats = $('#statCats');

  // featured
  const featuredScreen = $('#featuredScreen');
  const featuredLogo = $('#featuredLogo');
  const featuredPoster = $('#featuredPoster');
  const featuredName = $('#featuredName');
  const featuredCat = $('#featuredCat');
  const featuredFlag = $('#featuredFlag');
  const featuredViewers = $('#featuredViewers');
  const featuredPlay = $('#featuredPlay');

  const playerModal = $('#playerModal');
  const playerVideo = $('#player');
  const playerLogo = $('#playerLogo');
  const playerName = $('#playerName');
  const playerLoading = $('#playerLoading');
  const playerError = $('#playerError');
  const playerErrorMsg = $('#playerErrorMsg');

  // Quality selector
  const qualityBtn = $('#qualityBtn');
  const qualityLabel = $('#qualityLabel');
  const qualityMenu = $('#qualityMenu');
  const qualityOptions = $('#qualityOptions');

  // ---------------- API ----------------
  async function api(path, opts = {}) {
    const res = await fetch(path, opts);
    if (!res.ok) throw new Error(`Request failed: ${res.status}`);
    return res.json();
  }

  // ---------------- Init ----------------
  async function init() {
    renderCategories();
    bindEvents();
    bindScroll();

    try {
      const settings = await api('/api/settings');
      applySettings(settings);
      if (settings.maintenanceMode === true) {
        maintenance.classList.remove('hidden');
        return;
      }
    } catch (err) {
      console.warn('Could not load settings', err);
      // Don't block — continue loading channels even if settings fail
    }

    try {
      state.channels = await api('/api/channels');
      pickFeatured();
      updateHeroStats();
      applyFilters();
    } catch (err) {
      console.error('Could not load channels', err);
      grid.innerHTML = '<p style="color:var(--text-secondary);text-align:center;grid-column:1/-1;padding:40px">Could not load channels.</p>';
    }
  }

  function applySettings(s) {
    if (s.siteName) {
      const firstWord = s.siteName.split(' ')[0] || 'StreamX';
      logoText.textContent = firstWord;
      footerName.textContent = s.siteName;
      document.title = `${s.siteName} — Live TV`;
    }
    if (s.siteLogo) {
      // Replace mark + text with the uploaded logo image
      siteLogo.innerHTML = `<img src="${s.siteLogo}" alt="${escapeAttr(s.siteName || 'Logo')}" class="logo-img" />`;
      const footerBrand = document.getElementById('footerBrand');
      if (footerBrand) footerBrand.innerHTML = `<img src="${s.siteLogo}" alt="" class="logo-img" />`;
    }
    if (s.heroTitle) renderHeroTitle(s.heroTitle);
    if (s.heroSubtitle) heroSubtitle.textContent = s.heroSubtitle;
    state.featuredId = s.featuredId || '';
  }

  // Highlight the last word (or last two if short) with the accent gradient
  function renderHeroTitle(title) {
    const words = title.trim().split(/\s+/);
    if (words.length <= 1) { heroTitle.textContent = title; return; }
    const highlightCount = words.length >= 4 ? 2 : 1;
    const head = words.slice(0, words.length - highlightCount).join(' ');
    const tail = words.slice(words.length - highlightCount).join(' ');
    heroTitle.innerHTML = `${escapeHtml(head)} <em>${escapeHtml(tail)}</em>`;
  }

  function updateHeroStats() {
    statChannels.textContent = state.channels.length;
    statCats.textContent = new Set(state.channels.map((c) => c.category)).size;
  }

  // ---------------- Featured ----------------
  function pickFeatured() {
    // Admin-chosen featured channel takes priority
    if (state.featuredId) {
      const chosen = state.channels.find((c) => c.id === state.featuredId);
      if (chosen) { state.featured = chosen; renderFeatured(); return; }
    }
    // Otherwise prefer a channel that has both a logo and a URL
    const withBoth = state.channels.filter((c) => c.logo && c.url);
    state.featured = withBoth[0] || state.channels.find((c) => c.url) || state.channels[0] || null;
    renderFeatured();
  }

  function renderFeatured() {
    const f = state.featured;
    if (!f) return;
    if (f.logo) {
      featuredLogo.src = f.logo;
      featuredLogo.style.display = 'block';
      featuredLogo.onerror = () => { featuredLogo.style.display = 'none'; };
      // Use the logo as a soft, blurred poster backdrop for a premium feel
      if (featuredPoster) {
        featuredPoster.style.backgroundImage =
          `linear-gradient(160deg, rgba(124,92,255,0.35), rgba(56,90,220,0.3)), url("${cssUrl(f.logo)}")`;
        featuredPoster.style.filter = 'blur(18px) saturate(130%)';
      }
    } else {
      featuredLogo.style.display = 'none';
      if (featuredPoster) {
        featuredPoster.style.backgroundImage = '';
        featuredPoster.style.filter = '';
      }
    }
    featuredName.textContent = f.name;
    featuredCat.textContent = `${f.category || 'Live'} • Now broadcasting`;
    featuredFlag.textContent = f.country || '🌐';
    if (featuredViewers) {
      // Deterministic pseudo-random viewer count based on channel name
      const seed = (f.name || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0);
      const k = (1 + (seed % 90) / 10).toFixed(1);
      featuredViewers.textContent = `${k}k watching`;
    }
  }

  // ---------------- Categories ----------------
  function renderCategories() {
    navCategories.innerHTML = CATEGORIES.map((cat) => `
      <button class="cat-btn ${cat === state.category ? 'active' : ''}" data-cat="${cat}">${cat}</button>
    `).join('');
  }

  // ---------------- Filtering ----------------
  function applyFilters() {
    const q = state.search.toLowerCase().trim();
    state.filtered = state.channels.filter((c) => {
      const matchesCat = state.category === 'All' || c.category === state.category;
      const matchesSearch = !q || c.name.toLowerCase().includes(q);
      return matchesCat && matchesSearch;
    });
    sectionTitle.textContent = state.category === 'All' ? 'All Channels' : state.category;
    renderChannels();
  }

  // ---------------- Channel grid ----------------
  function renderChannels() {
    channelCount.textContent = `${state.filtered.length} channel${state.filtered.length === 1 ? '' : 's'}`;

    if (state.filtered.length === 0) {
      grid.innerHTML = '';
      emptyState.classList.remove('hidden');
      return;
    }
    emptyState.classList.add('hidden');

    grid.innerHTML = state.filtered.map((c, i) => {
      const initials = c.name.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase();
      const logoHtml = c.logo
        ? `<img src="${escapeAttr(c.logo)}" alt="${escapeAttr(c.name)}" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'placeholder',textContent:'${initials}'}))" />`
        : `<span class="placeholder">${initials}</span>`;

      return `
        <article class="channel-card" data-id="${c.id}" style="animation-delay:${Math.min(i * 0.04, 0.6)}s">
          <div class="channel-thumb">
            ${logoHtml}
            <div class="live-badge"><span class="live-dot"></span>LIVE</div>
            <div class="play-hint">▶</div>
          </div>
          <div class="channel-info">
            <span class="channel-name">${escapeHtml(c.name)}</span>
            <div class="channel-meta">
              <span class="channel-flag">${c.country || '🌐'}</span>
              <span class="channel-cat">${escapeHtml(c.category || 'Other')}</span>
            </div>
          </div>
        </article>
      `;
    }).join('');
  }

  // ---------------- Player ----------------
  function openPlayer(channel) {
    if (!channel) return;
    playerLogo.src = channel.logo || '';
    playerLogo.style.display = channel.logo ? 'block' : 'none';
    playerName.textContent = channel.name;
    playerError.classList.add('hidden');
    playerLoading.classList.remove('hidden');
    playerModal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    resetQualityMenu();

    cleanupPlayer();
    if (!channel.url) {
      showPlayerError('No stream URL configured for this channel.');
      return;
    }

    if (window.Hls && window.Hls.isSupported()) {
      const hls = new Hls({ enableWorker: true });
      state.hls = hls;
      hls.loadSource(channel.url);
      hls.attachMedia(playerVideo);

      hls.on(Hls.Events.MANIFEST_PARSED, (_, data) => {
        playerLoading.classList.add('hidden');
        playerVideo.play().catch(() => {});
        buildQualityMenu(hls, data.levels);
      });

      hls.on(Hls.Events.LEVEL_SWITCHED, (_, data) => {
        updateQualityLabel(hls, data.level);
      });

      hls.on(Hls.Events.ERROR, (_, data) => {
        if (data.fatal) {
          showPlayerError('This stream could not be loaded. It may be offline or geo-restricted.');
        }
      });
    } else if (playerVideo.canPlayType('application/vnd.apple.mpegurl')) {
      playerVideo.src = channel.url;
      playerVideo.addEventListener('loadedmetadata', () => {
        playerLoading.classList.add('hidden');
        playerVideo.play().catch(() => {});
      }, { once: true });
      playerVideo.addEventListener('error', () => {
        showPlayerError('Stream playback failed.');
      }, { once: true });
    } else {
      showPlayerError('Your browser does not support HLS streams.');
    }
  }

  // ---------------- Quality switching ----------------
  function resetQualityMenu() {
    if (qualityOptions) qualityOptions.innerHTML = '';
    if (qualityLabel) qualityLabel.textContent = 'Auto';
    if (qualityMenu) qualityMenu.classList.add('hidden');
    state.currentLevel = -1; // -1 = auto
  }

  function buildQualityMenu(hls, levels) {
    if (!qualityOptions || !levels || levels.length <= 1) return;

    // Sort levels by height descending
    const sorted = levels
      .map((l, i) => ({ index: i, height: l.height, width: l.width, bitrate: l.bitrate }))
      .sort((a, b) => b.height - a.height);

    let html = `<div class="quality-option active" data-level="-1">
      <span class="q-label">Auto</span>
      <span class="q-badge">Recommended</span>
    </div>`;

    sorted.forEach((l) => {
      const label = l.height ? `${l.height}p` : `Level ${l.index}`;
      const badge = l.height >= 1080 ? 'HD' : l.height >= 720 ? 'HD' : '';
      const bitrate = l.bitrate ? `${(l.bitrate / 1000).toFixed(0)} kbps` : '';
      html += `<div class="quality-option" data-level="${l.index}">
        <span class="q-label">${label}${badge ? ` <span class="q-badge">${badge}</span>` : ''}</span>
        <span class="q-bitrate">${bitrate}</span>
      </div>`;
    });

    qualityOptions.innerHTML = html;

    // Click handlers
    qualityOptions.querySelectorAll('.quality-option').forEach((opt) => {
      opt.addEventListener('click', () => {
        const level = parseInt(opt.dataset.level, 10);
        hls.currentLevel = level; // -1 = auto
        state.currentLevel = level;

        qualityOptions.querySelectorAll('.quality-option').forEach((o) => o.classList.remove('active'));
        opt.classList.add('active');

        if (level === -1) {
          qualityLabel.textContent = 'Auto';
        } else {
          const lv = levels[level];
          qualityLabel.textContent = lv && lv.height ? `${lv.height}p` : `Level ${level}`;
        }
        qualityMenu.classList.add('hidden');
      });
    });
  }

  function updateQualityLabel(hls, levelIndex) {
    if (!qualityLabel) return;
    // Only update label if in auto mode
    if (state.currentLevel === -1 && hls.levels && hls.levels[levelIndex]) {
      const h = hls.levels[levelIndex].height;
      qualityLabel.textContent = h ? `Auto (${h}p)` : 'Auto';
    }
  }

  // Toggle quality menu
  if (qualityBtn) {
    qualityBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      qualityMenu.classList.toggle('hidden');
    });
  }
  // Close quality menu on outside click
  document.addEventListener('click', (e) => {
    if (qualityMenu && !qualityMenu.classList.contains('hidden') && !e.target.closest('.quality-selector')) {
      qualityMenu.classList.add('hidden');
    }
  });

  function showPlayerError(msg) {
    playerLoading.classList.add('hidden');
    playerErrorMsg.textContent = msg;
    playerError.classList.remove('hidden');
  }

  function cleanupPlayer() {
    if (state.hls) {
      try { state.hls.destroy(); } catch {}
      state.hls = null;
    }
    playerVideo.pause();
    playerVideo.removeAttribute('src');
    playerVideo.load();
  }

  function closePlayer() {
    playerModal.classList.add('hidden');
    document.body.style.overflow = '';
    cleanupPlayer();
  }

  // ---------------- Events ----------------
  function bindEvents() {
    navCategories.addEventListener('click', (e) => {
      const btn = e.target.closest('.cat-btn');
      if (!btn) return;
      state.category = btn.dataset.cat;
      renderCategories();
      applyFilters();
    });

    const onSearch = (val) => {
      state.search = val;
      if (searchInput && searchInput.value !== val) searchInput.value = val;
      if (searchInputMobile && searchInputMobile.value !== val) searchInputMobile.value = val;
      applyFilters();
    };
    searchInput.addEventListener('input', (e) => onSearch(e.target.value));
    if (searchInputMobile) searchInputMobile.addEventListener('input', (e) => onSearch(e.target.value));

    grid.addEventListener('click', (e) => {
      const card = e.target.closest('.channel-card');
      if (!card) return;
      const channel = state.channels.find((c) => c.id === card.dataset.id);
      openPlayer(channel);
    });

    playerModal.addEventListener('click', (e) => {
      // Only close via the X button (data-close), not backdrop click
      const closeEl = e.target.closest('[data-close]');
      if (closeEl) closePlayer();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !playerModal.classList.contains('hidden')) closePlayer();
      // "/" focuses search (unless already typing in a field)
      const typing = /^(input|textarea|select)$/i.test(document.activeElement?.tagName || '');
      if (e.key === '/' && !typing && playerModal.classList.contains('hidden')) {
        e.preventDefault();
        searchInput.focus();
      }
    });

    document.getElementById('watchNowBtn').addEventListener('click', () => {
      openPlayer(state.featured || state.channels[0]);
    });
    document.getElementById('heroCtaBtn').addEventListener('click', () => {
      openPlayer(state.featured || state.filtered[0] || state.channels[0]);
    });
    document.getElementById('heroBrowseBtn').addEventListener('click', browseScroll);

    featuredScreen.addEventListener('click', () => openPlayer(state.featured));
  }

  function bindScroll() {
    const onScroll = () => {
      const scrolled = window.scrollY;
      header.classList.toggle('scrolled', scrolled > 20);
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      const pct = docHeight > 0 ? (scrolled / docHeight) * 100 : 0;
      scrollProgress.style.width = `${pct}%`;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  function browseScroll() {
    document.getElementById('channels').scrollIntoView({ behavior: 'smooth', block: 'start' });
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
  function escapeAttr(str = '') {
    return escapeHtml(str);
  }

  // Safely embed a URL inside a CSS url() value
  function cssUrl(str = '') {
    return String(str).replace(/["'\\)]/g, '');
  }

  document.addEventListener('DOMContentLoaded', init);
})();
