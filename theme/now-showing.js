/*
 * Retro 90s for Jellyfin 12, v1.2.0. "Now Showing" banner on the home tab.
 * Loaded by a <script> tag added to index.html (see install/). It does NOTHING unless the active Custom CSS
 * includes retro-banner.css (which sets --retro-banner: 1 on <html>), so other themes are not affected.
 *
 * Written as ES5 + fetch/Promise so it runs on webOS 5 (Chromium 68). Talks only to this Jellyfin server,
 * with the signed-in user's own session (window.ApiClient). All item text is set with textContent.
 */
(function () {
  'use strict';
  var BANNER_CLASS = 'retroNow';
  var ROTATE_MS = 9000;
  var CACHE_MS = 10 * 60 * 1000;
  var MAX_SLIDES = 7;
  var cache = { at: 0, user: null, items: null, pending: null };
  var state = { el: null, items: [], index: 0, timer: null, layer: 0 };

  function enabled() {
    try {
      return getComputedStyle(document.documentElement).getPropertyValue('--retro-banner').replace(/\s/g, '') === '1';
    } catch (e) { return false; }
  }
  function api() { return window.ApiClient || null; }
  function reducedMotion() {
    try { return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; }
  }
  function getJSON(path, params) {
    var c = api();
    var url = c.getUrl(path, params);
    return fetch(url, { headers: { 'Authorization': authHeader(c) }, credentials: 'same-origin' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.status === 204 ? null : r.json();
    });
  }
  function authHeader(c) {
    return 'MediaBrowser Client="' + (c.appName ? c.appName() : 'Jellyfin Web') + '", Device="' + (c.deviceName ? c.deviceName() : 'Browser') +
      '", DeviceId="' + c.deviceId() + '", Version="' + (c.appVersion ? c.appVersion() : '12') + '", Token="' + c.accessToken() + '"';
  }

  var FIELDS = 'Overview,Genres,ProductionYear,OfficialRating,CommunityRating,RunTimeTicks,Taglines';
  function hasBackdrop(it) {
    return (it.BackdropImageTags && it.BackdropImageTags.length) || (it.ParentBackdropImageTags && it.ParentBackdropImageTags.length);
  }
  function loadItems() {
    var c = api(); if (!c) return Promise.resolve([]);
    var uid = c.getCurrentUserId();
    if (cache.items && cache.user === uid && Date.now() - cache.at < CACHE_MS) return Promise.resolve(cache.items);
    if (cache.pending) return cache.pending;
    var common = { Recursive: true, Fields: FIELDS, EnableImageTypes: 'Backdrop,Primary,Logo', ImageTypeLimit: 1 };
    var resume = getJSON('Users/' + uid + '/Items/Resume', merge(common, { Limit: 2, MediaTypes: 'Video' }));
    var recent = getJSON('Users/' + uid + '/Items', merge(common, { Limit: 16, SortBy: 'DateCreated', SortOrder: 'Descending',
      IncludeItemTypes: 'Movie,Series', HasBackdrop: true }));
    cache.pending = Promise.all([resume.catch(none), recent.catch(none)]).then(function (res) {
      var out = [], seen = {};
      (res[0] && res[0].Items || []).forEach(function (it) {
        if (hasBackdrop(it)) { it._resume = true; out.push(it); seen[it.Id] = 1; if (it.SeriesId) seen[it.SeriesId] = 1; }
      });
      var rest = (res[1] && res[1].Items || []).filter(function (it) { return !seen[it.Id] && hasBackdrop(it); });
      shuffle(rest);
      out = out.concat(rest).slice(0, MAX_SLIDES);
      cache.items = out; cache.user = uid; cache.at = Date.now(); cache.pending = null;
      return out;
    }, function () { cache.pending = null; return []; });
    return cache.pending;
  }
  function none() { return null; }
  function merge(a, b) { var o = {}, k; for (k in a) o[k] = a[k]; for (k in b) o[k] = b[k]; return o; }
  function shuffle(a) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } }

  function backdropUrl(it) {
    var c = api();
    var w = Math.min(1920, Math.ceil((window.innerWidth || 1920) * Math.min(window.devicePixelRatio || 1, 2)));
    var id = it.Id, tag = it.BackdropImageTags && it.BackdropImageTags[0];
    if (!tag && it.ParentBackdropItemId) { id = it.ParentBackdropItemId; tag = it.ParentBackdropImageTags[0]; }
    return c.getUrl('Items/' + id + '/Images/Backdrop/0', { maxWidth: w, quality: 80, tag: tag });
  }
  function runtime(ticks) {
    if (!ticks) return '';
    var m = Math.round(ticks / 600000000), h = Math.floor(m / 60);
    return h ? h + 'h ' + (m % 60 ? (m % 60) + 'm' : '') : m + 'm';
  }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function build(items) {
    var root = el('section', BANNER_CLASS);
    root.setAttribute('aria-label', 'Now showing');
    root.setAttribute('aria-roledescription', 'carousel');
    var a = el('div', BANNER_CLASS + '-bg is-on'), b = el('div', BANNER_CLASS + '-bg');
    root.appendChild(a); root.appendChild(b);
    root.appendChild(el('div', BANNER_CLASS + '-shade'));
    var body = el('div', BANNER_CLASS + '-body');
    body.appendChild(el('div', BANNER_CLASS + '-kicker'));
    var logo = el('img', BANNER_CLASS + '-logo'); logo.alt = ''; body.appendChild(logo);
    // Tiny logo assets (some are 150 px portrait marks) read worse than the title: fall back to text for those.
    logo.addEventListener('load', function () { if (logo.naturalWidth < 320 || logo.naturalHeight > logo.naturalWidth) state.el.className = BANNER_CLASS; });
    logo.addEventListener('error', function () { state.el.className = BANNER_CLASS; });
    body.appendChild(el('h2', BANNER_CLASS + '-title'));
    body.appendChild(el('div', BANNER_CLASS + '-meta'));
    body.appendChild(el('p', BANNER_CLASS + '-overview'));
    var progress = el('div', BANNER_CLASS + '-progress'); progress.appendChild(el('span'));
    body.appendChild(progress);
    var actions = el('div', BANNER_CLASS + '-actions');
    var play = el('button', BANNER_CLASS + '-btn ' + BANNER_CLASS + '-play');
    play.type = 'button';
    var info = el('button', BANNER_CLASS + '-btn ' + BANNER_CLASS + '-info', 'More info');
    info.type = 'button';
    actions.appendChild(play); actions.appendChild(info);
    body.appendChild(actions);
    var dots = el('div', BANNER_CLASS + '-dots');
    items.forEach(function (it, i) {
      var d = el('button', BANNER_CLASS + '-dot');
      d.type = 'button';
      d.setAttribute('aria-label', 'Show ' + (it.SeriesName || it.Name));
      d.addEventListener('click', function () { show(i, true); });
      dots.appendChild(d);
    });
    body.appendChild(dots);
    root.appendChild(body);
    play.addEventListener('click', function () { playItem(state.items[state.index]); });
    info.addEventListener('click', function () { openItem(state.items[state.index]); });
    return root;
  }

  function show(i, user) {
    var root = state.el, it = state.items[i]; if (!root || !it) return;
    state.index = i;
    var layers = root.querySelectorAll('.' + BANNER_CLASS + '-bg');
    var next = layers[state.layer ^ 1], cur = layers[state.layer];
    next.style.backgroundImage = 'url("' + backdropUrl(it).replace(/"/g, '%22') + '")';
    next.className = BANNER_CLASS + '-bg is-on'; cur.className = BANNER_CLASS + '-bg';
    state.layer ^= 1;
    var isEp = it.Type === 'Episode';
    q(root, 'kicker').textContent = it._resume ? 'Continue watching' : (it.Type === 'Series' ? 'New on TV' : 'Now showing');
    q(root, 'title').textContent = isEp ? (it.SeriesName || it.Name) : it.Name;
    var logoTag = it.ImageTags && it.ImageTags.Logo, logoId = it.Id;
    if (!logoTag && it.ParentLogoImageTag) { logoTag = it.ParentLogoImageTag; logoId = it.ParentLogoItemId; }
    var logo = q(root, 'logo');
    if (logoTag) {
      logo.src = api().getUrl('Items/' + logoId + '/Images/Logo', { maxHeight: 240, maxWidth: 900, quality: 90, tag: logoTag });
      root.className = BANNER_CLASS + ' has-logo';
    } else { logo.removeAttribute('src'); root.className = BANNER_CLASS; }
    var meta = q(root, 'meta'); meta.textContent = '';
    var bits = [];
    if (isEp) bits.push(['ep', 'S' + (it.ParentIndexNumber || 0) + ' · E' + (it.IndexNumber || 0) + '  ' + it.Name]);
    if (it.ProductionYear) bits.push(['year', String(it.ProductionYear)]);
    if (it.OfficialRating) bits.push(['rating', it.OfficialRating]);
    if (it.RunTimeTicks && it.Type !== 'Series') bits.push(['time', runtime(it.RunTimeTicks)]);
    if (it.CommunityRating) bits.push(['stars', '★ ' + (Math.round(it.CommunityRating * 10) / 10)]);
    if (it.Genres && it.Genres.length) bits.push(['genre', it.Genres.slice(0, 2).join(' / ')]);
    bits.forEach(function (bit) { meta.appendChild(el('span', BANNER_CLASS + '-chip ' + BANNER_CLASS + '-chip-' + bit[0], bit[1])); });
    q(root, 'overview').textContent = it.Overview || '';
    var pct = it.UserData && it.UserData.PlayedPercentage;
    var prog = q(root, 'progress');
    prog.style.display = it._resume && pct ? '' : 'none';
    prog.firstChild.style.width = (pct || 0) + '%';
    q(root, 'play').textContent = it._resume ? '▶  Resume' : (it.Type === 'Series' ? '▶  Episodes' : '▶  Play');
    var ds = root.querySelectorAll('.' + BANNER_CLASS + '-dot');
    for (var k = 0; k < ds.length; k++) ds[k].className = BANNER_CLASS + '-dot' + (k === i ? ' is-on' : '');
    if (user) restart();
  }
  function q(root, part) { return root.querySelector('.' + BANNER_CLASS + '-' + part); }

  function openItem(it) {
    if (!it) return;
    var c = api();
    location.hash = '#/details?id=' + encodeURIComponent(it.Id) + '&serverId=' + encodeURIComponent(c.serverId());
  }
  function playItem(it) {
    if (!it) return;
    openItem(it);
    if (it.Type === 'Series') return;   // a show: let the person pick the episode
    // Press the item page's own Play button once it is on screen (it resumes when there is a saved position),
    // so playback goes through Jellyfin's normal path on every client. Gives up after 8 s.
    var tries = 0;
    var t = setInterval(function () {
      tries++;
      var btn = document.querySelector('.itemDetailPage:not(.hide) .mainDetailButtons .btnPlay:not(.hide)');
      var here = location.hash.indexOf('id=' + encodeURIComponent(it.Id)) >= 0;
      if (btn && here && btn.offsetParent !== null) { clearInterval(t); btn.click(); }
      else if (tries > 40 || !here) clearInterval(t);
    }, 200);
  }

  function restart() {
    if (state.timer) clearInterval(state.timer);
    state.timer = reducedMotion() ? null : setInterval(tick, ROTATE_MS);
  }
  function tick() {
    var root = state.el;
    if (!root || !root.isConnected || document.hidden) return;
    if (document.documentElement.classList.contains('transparentDocument')) return;  // video playing
    if (root.contains(document.activeElement) || root.matches(':hover')) return;       // user is looking at it
    if (state.items.length > 1) show((state.index + 1) % state.items.length, false);
  }

  // While the hero is on screen, retro-crt.css lightens the scanlines (textured artwork beats against full-strength
  // lines). One class toggle on <html>, not per-frame work.
  var heroObserver = null;
  function setHero(on) { document.documentElement.classList[on ? 'add' : 'remove']('retro-hero-in-view'); }
  function watchHero(node) {
    if (heroObserver) heroObserver.disconnect();
    if (!window.IntersectionObserver) return;
    heroObserver = new IntersectionObserver(function (entries) {
      setHero(entries[entries.length - 1].intersectionRatio >= 0.3 && node.isConnected);
    }, { threshold: [0, 0.3, 0.6] });
    heroObserver.observe(node);
  }

  function sync() {
    var home = document.querySelector('#indexPage:not(.hide) #homeTab.is-active');
    var existing = document.querySelector('.' + BANNER_CLASS);
    if (!enabled() || !api() || !home) {
      if (existing && !enabled()) { existing.parentNode.removeChild(existing); state.el = null; }
      setHero(false);
      return;
    }
    if (existing && home.contains(existing)) return;
    if (existing) existing.parentNode.removeChild(existing);
    loadItems().then(function (items) {
      if (!items.length || document.querySelector('#homeTab.is-active .' + BANNER_CLASS)) return;
      var target = document.querySelector('#indexPage:not(.hide) #homeTab.is-active'); if (!target) return;
      state.items = items; state.el = build(items);
      var sections = target.querySelector('.sections');
      target.insertBefore(state.el, sections || target.firstChild);
      show(Math.min(state.index, items.length - 1), false);
      restart();
      watchHero(state.el);
    });
  }

  document.addEventListener('viewshow', function () { setTimeout(sync, 0); });
  window.addEventListener('hashchange', function () { setTimeout(sync, 50); });
  setInterval(sync, 1500);
})();
