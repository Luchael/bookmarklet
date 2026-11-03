(() => {
  'use strict';
  const G = '__image_explorer_mobile_v2__';
  if (window[G]) { window[G].close(); return; }
  const doc = document;
  if (!doc.body) { alert('페이지가 완전히 열린 다음 실행해주세요.'); return; }
  const S = {
    items: new Map(), selected: new Set(), keys: new WeakMap(), next: 0,
    scannedDocs: new Set(), blocked: 0, blockedUrls: new Set(), nodes: 0, truncated: false,
    pick: false, listeners: [], deep: false, big: false, selectedOnly: false,
    shown: 0, query: '', busy: false, toastTimer: null
  };
  const host = doc.createElement('div');
  host.id = G;
  host.style.cssText = 'position:fixed!important;inset:0!important;z-index:2147483647!important;pointer-events:auto!important;';
  const shadow = host.attachShadow({ mode: 'open' });
  const style = doc.createElement('style');
  style.textContent = `
    :host{color-scheme:dark} *{box-sizing:border-box} button,input{font:inherit}
    #panel{position:absolute;inset:0;background:#12141beF;color:#f7f8fc;font:14px/1.5 system-ui,-apple-system,sans-serif;overflow:auto;overscroll-behavior:contain}
    #top{position:sticky;top:0;z-index:9;background:#181c27;padding:12px 14px 10px;box-shadow:0 2px 12px #0008}
    .flex{display:flex;align-items:center;gap:7px;flex-wrap:wrap}.grow{flex:1}.title{font-weight:750;font-size:16px}
    .muted{color:#a9b2c4;font-size:12px}.tiny{font-size:11px}button{border:1px solid #566078;border-radius:9px;background:#303b54;color:white;padding:7px 10px;cursor:pointer}
    button:disabled{opacity:.5;cursor:default}.primary{background:#3866d8;border-color:#3866d8}.danger{background:#653942}.outline{background:#222938}
    #q{width:100%;border:1px solid #58627a;background:#242c3f;color:white;border-radius:9px;padding:10px;margin-top:9px}
    #grid{padding:11px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}
    @media(min-width:700px){#grid{grid-template-columns:repeat(4,minmax(0,1fr))}}
    .cell{min-width:0;background:#222737;border:2px solid transparent;border-radius:11px;overflow:hidden;position:relative}
    .cell.sel{border-color:#79b8ff;background:#293954}.preview{background:repeating-conic-gradient(#353b4a 0 25%,#282e3e 0 50%) 50%/18px 18px;min-height:120px;display:flex;align-items:center;justify-content:center;position:relative}
    .preview img{height:150px;max-height:23vh;width:100%;object-fit:contain;display:block}
    .placeholder{padding:14px;color:#d9dee8;word-break:break-word;text-align:center}
    .tick{position:absolute;top:6px;left:6px;background:#101722d9;border-radius:8px;padding:2px 7px;font-size:14px}
    .body{padding:7px}.name{overflow:hidden;white-space:nowrap;text-overflow:ellipsis;font-size:12px}.sub{font-size:11px;color:#abb8cf}
    .btnrow{display:flex;gap:5px;flex-wrap:wrap;margin-top:6px}.btnrow button{padding:5px 6px;font-size:11px;flex:1}
    #footer{text-align:center;padding:9px 15px 25px;color:#c0c8da}#more{display:block;width:92%;margin:8px auto}
    #toast{position:fixed;bottom:68px;left:50%;transform:translateX(-50%);max-width:90vw;background:#edf1ff;color:#11172a;border-radius:11px;padding:9px 14px;box-shadow:0 6px 25px #0009;z-index:60;display:none;white-space:pre-wrap}
    #pickbar{display:none;position:fixed;left:10px;right:10px;bottom:12px;z-index:2147483647;background:#151b2c;color:white;border:1px solid #596987;border-radius:13px;padding:10px;box-shadow:0 6px 22px #0009;font:14px system-ui}
    #pickbar button{padding:8px 11px}label{display:inline-flex;align-items:center;gap:3px;font-size:12px}
    #empty{padding:26px;text-align:center;color:#c0c8da}#status{font-size:12px;color:#adb8ce;margin-top:7px}
  `;
  shadow.append(style);
  const panel = make('div', { id: 'panel' });
  const top = make('div', { id: 'top' });
  panel.append(top);
  const grid = make('div', { id: 'grid' });
  const more = make('button', { id: 'more', text: '더 보기' });
  const footer = make('div', { id: 'footer', text: '현재 페이지에 로딩된 이미지 중 접근 가능한 것만 탐색합니다.' });
  const toast = make('div', { id: 'toast' });
  const pickbar = make('div', { id: 'pickbar' });
  shadow.append(panel, toast, pickbar);
  panel.append(grid, more, footer);
  doc.body.append(host);
  window[G] = { close };

  function make(tag, o = {}) {
    const e = doc.createElement(tag);
    if (o.id) e.id = o.id;
    if (o.text !== undefined) e.textContent = o.text;
    if (o.className) e.className = o.className;
    return e;
  }
  function btn(label, action, css) {
    const b = make('button', { text: label, className: css || '' });
    b.addEventListener('click', action);
    return b;
  }
  function row(parent) { const e = make('div', { className: 'flex' }); parent.append(e); return e; }
  function notify(str) {
    toast.textContent = str; toast.style.display = 'block'; toast.style.pointerEvents = 'none';
    clearTimeout(S.toastTimer);
    S.toastTimer = setTimeout(() => toast.style.display = 'none', 2800);
  }
  function normalize(u, d = doc) {
    if (typeof u !== 'string') return '';
    u = u.trim().replace(/^['"]|['"]$/g, '').replace(/&amp;/gi, '&');
    if (!u || u.startsWith('#') || u.startsWith('javascript:')) return '';
    try {
      const result = new URL(u, d.baseURI || location.href).href;
      return /^(https?:|blob:|data:image\/)/i.test(result) ? result : '';
    } catch (_) { return ''; }
  }
  function add(raw, kind = '이미지', d = doc, node = null, filename = '') {
    const url = normalize(raw, d);
    if (!url) return null;
    if (S.items.has(url)) return S.items.get(url);
    const item = { key: url, url, kind, node, filename, type: 'url', w: 0, h: 0 };
    S.items.set(url, item);
    return item;
  }
  function addSpecial(node, kind, d) {
    if (S.keys.has(node)) return S.items.get(S.keys.get(node));
    const key = 'special:' + (++S.next);
    const item = { key, url: '', kind, node, type: kind === 'Canvas' ? 'canvas' : 'svg', w: node.width?.baseVal?.value || node.width || 0, h: node.height?.baseVal?.value || node.height || 0 };
    S.keys.set(node, key); S.items.set(key, item);
    return item;
  }
  function urlsInCss(css) {
    if (!css || css === 'none') return [];
    return [...css.matchAll(/url\(\s*(?:["']([^"']+)["']|([^)]*))\s*\)/gi)]
      .map(m => (m[1] || m[2] || '').trim());
  }
  function srcset(str) {
    if (!str) return [];
    return str.split(/,(?![^()]*\))/).map(x => x.trim().split(/\s+/)[0]).filter(Boolean);
  }
  function attrImgs(el, d, deep) {
    for (const a of el.attributes || []) {
      if (!/^(?:data-|srcset$)/i.test(a.name)) continue;
      if (!/(?:src|image|img|poster|picture|origin|full|large|zoom|hires|url)/i.test(a.name)) continue;
      const v = a.value.trim();
      if (!v || v.length > 4096) continue;
      if (/srcset/i.test(a.name)) srcset(v).forEach(u => add(u, '지연 로딩', d, el));
      else if (/^(?:https?:|\/|\.\/|\.\.\/|data:image\/|blob:)/i.test(v) || (deep && /\.(?:png|jpe?g|webp|avif|gif|svg)(?:[?#]|$)/i.test(v))) add(v, '지연 로딩', d, el);
    }
  }
  function cssImgs(el, d, deep = false) {
    const st = el.getBoundingClientRect?.();
    if (!deep && st && (st.width < 65 || st.height < 65)) return;
    try {
      let css = getComputedStyle(el);
      for (const prop of ['backgroundImage', 'maskImage', 'borderImageSource', 'listStyleImage']) {
        for (const u of urlsInCss(css[prop])) add(u, 'CSS ' + prop, d, el);
      }
      if (deep) for (const pseudo of ['::before', '::after']) {
        css = getComputedStyle(el, pseudo);
        for (const u of urlsInCss(css.backgroundImage)) add(u, 'CSS ' + pseudo, d, el);
        for (const u of urlsInCss(css.content)) add(u, 'CSS ' + pseudo, d, el);
      }
    } catch (_) { /* browser restriction */ }
  }
  function blockedFrame(e, d) {
    S.blocked++;
    const u = normalize(e.getAttribute('src') || e.src, d);
    if (u) S.blockedUrls.add(u);
  }
  function scanDocument(d) {
    if (S.scannedDocs.has(d)) return;
    S.scannedDocs.add(d);
    scanRoot(d, d);
  }
  function scanRoot(root, d) {
    const nodes = root.querySelectorAll?.('*');
    if (!nodes) return;
    const max = S.deep ? 18000 : 8500;
    for (let i = 0; i < nodes.length; i++) {
      if (++S.nodes > max) { S.truncated = true; return; }
      const e = nodes[i];
      if (e === host || e.id === G || host.contains(e)) continue;
      const tag = e.tagName?.toLowerCase();
      if (tag === 'img') {
        const it = add(e.currentSrc || e.getAttribute('src') || e.src, 'IMG', d, e);
        if (it) { it.w = Math.max(it.w, e.naturalWidth || e.width || 0); it.h = Math.max(it.h, e.naturalHeight || e.height || 0); }
        add(e.getAttribute('src'), 'IMG 대체', d, e);
        srcset(e.getAttribute('srcset')).forEach(u => add(u, '고화질 후보', d, e));
      } else if (tag === 'source') {
        srcset(e.getAttribute('srcset')).forEach(u => add(u, 'Picture 후보', d, e));
      } else if (tag === 'video') {
        add(e.poster || e.getAttribute('poster'), '동영상 썸네일', d, e);
      } else if (tag === 'image' || tag === 'feimage') {
        add(e.getAttribute('href') || e.getAttribute('xlink:href'), 'SVG 이미지', d, e);
      } else if (tag === 'canvas' && e.width > 30 && e.height > 30) {
        addSpecial(e, 'Canvas', d);
      } else if (tag === 'svg' && (e.clientWidth > 30 || e.clientHeight > 30)) {
        addSpecial(e, 'SVG', d);
      } else if (tag === 'a') {
        const href = e.getAttribute('href');
        if (href && /\.(?:jpe?g|png|webp|gif|avif|svg|bmp)(?:[?#]|$)/i.test(href)) add(href, '원본 이미지 링크', d, e);
      } else if (tag === 'meta') {
        const prop = e.getAttribute('property') || e.getAttribute('name') || '';
        if (/^(?:og:image(?::url)?|twitter:image(?::src)?)$/i.test(prop)) add(e.getAttribute('content'), 'SNS 메타 이미지', d, e);
      } else if (tag === 'link') {
        if (e.getAttribute('as') === 'image' || /image_src/i.test(e.getAttribute('rel') || ''))
          add(e.getAttribute('href'), '미리 로드된 이미지', d, e);
      }
      if (S.deep || ['IMG','DIV','SPAN','A','SECTION','ARTICLE','FIGURE','PICTURE','LI','BUTTON','MAIN'].includes(e.tagName)) {
        attrImgs(e, d, S.deep);
      }
      // CSS lookup is relatively expensive on large mobile web pages.
      if (S.deep || (S.nodes <= 4000 && ['DIV','SPAN','A','SECTION','ARTICLE','FIGURE','BUTTON','LI'].includes(e.tagName))) cssImgs(e, d, S.deep);
      if (e.shadowRoot) scanRoot(e.shadowRoot, d);
      if (tag === 'iframe' || tag === 'frame') {
        try { if (e.contentDocument?.documentElement) scanDocument(e.contentDocument); else blockedFrame(e, d); }
        catch (_) { blockedFrame(e, d); }
      }
    }
    if (S.deep) {
      for (const script of root.querySelectorAll?.('script:not([src])') || []) {
        const raw = (script.textContent || '').slice(0, 900000).replace(/\\\//g, '/');
        for (const match of raw.matchAll(/https?:\/\/[^\s"'<>\\]{3,900}?\.(?:jpe?g|png|webp|gif|avif|svg)(?:\?[^\s"'<>\\]{0,180})?/gi)) add(match[0], '스크립트 이미지 URL', d);
      }
    }
  }
  function scan(deep = false) {
    S.deep = deep; S.scannedDocs.clear(); S.blocked = 0; S.blockedUrls.clear(); S.nodes = 0; S.truncated = false;
    try { scanDocument(doc); } catch (e) { notify('탐색 오류: ' + e.message); }
    // DOM에 주소가 없더라도 브라우저가 이미 로딩한 이미지 요청은 후보에 포함합니다.
    try {
      for (const r of performance.getEntriesByType('resource')) {
        if (r.initiatorType === 'img' || (r.initiatorType !== 'script' && /\.(?:png|jpe?g|gif|webp|avif|bmp|svg)(?:[?#]|$)/i.test(r.name)))
          add(r.name, '브라우저 이미지 로딩 기록');
      }
    } catch (_) { /* unavailable */ }
    S.shown = 0;
    render();
  }
  function select(item) {
    if (!item) return;
    if (S.selected.has(item.key)) S.selected.delete(item.key);
    else S.selected.add(item.key);
    updateBar();
  }
  function getPreview(item) {
    if (item.type === 'url') return item.url;
    if (item.type === 'canvas') {
      try { return item.node.toDataURL('image/png'); } catch (_) { return ''; }
    }
    if (item.type === 'svg') {
      try {
        let s = new XMLSerializer().serializeToString(item.node);
        if (!s.includes('xmlns=')) s = s.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
        return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s);
      } catch (_) { return ''; }
    }
    return '';
  }
  function displayName(it) {
    if (it.type !== 'url') return it.kind;
    try { return decodeURIComponent(new URL(it.url).pathname.split('/').pop()).slice(0, 70) || it.kind; }
    catch (_) { return it.kind; }
  }
  function copy(t) {
    if (!t) { notify('이 항목에는 이미지 URL이 없습니다. 다운로드를 사용하세요.'); return; }
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(t)
      .then(() => notify('주소 복사 완료')).catch(() => prompt('주소 복사:', t));
    else prompt('주소 복사:', t);
  }
  function openOriginal(it) {
    if (it.type !== 'url') { notify('이 항목은 캔버스/인라인 SVG입니다. 다운로드를 이용하세요.'); return; }
    const a = make('a'); a.href = it.url; a.target = '_blank'; a.rel = 'noopener noreferrer';
    host.append(a); a.click(); a.remove();
  }
  function makeFilename(it, number, mime) {
    let name = displayName(it);
    name = name.replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').slice(0, 90);
    if (!name || name === it.kind || !/\.[a-z0-9]{2,5}$/i.test(name)) {
      name = 'image_' + String(number).padStart(3, '0');
      const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/avif': 'avif', 'image/svg+xml': 'svg', 'image/gif': 'gif', 'image/bmp': 'bmp' };
      name += '.' + (ext[mime] || (it.type === 'svg' ? 'svg' : 'png'));
    }
    return name;
  }
  async function getBlob(it) {
    if (it.type === 'canvas') {
      return new Promise((ok, no) => {
        try { it.node.toBlob(blob => blob ? ok(blob) : no(Error('캔버스가 비어 있습니다.')), 'image/png'); }
        catch (e) { no(e); }
      });
    }
    if (it.type === 'svg') {
      let s = new XMLSerializer().serializeToString(it.node);
      if (!s.includes('xmlns=')) s = s.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
      return new Blob([s], { type: 'image/svg+xml' });
    }
    let response;
    try { response = await fetch(it.url, { mode: 'cors', credentials: 'include' }); }
    catch (_) { response = await fetch(it.url, { mode: 'cors', credentials: 'omit' }); }
    if (!response.ok) throw Error('HTTP ' + response.status);
    if ((response.headers.get('content-type') || '').includes('text/html')) throw Error('이미지 대신 HTML을 응답했습니다.');
    if (+(response.headers.get('content-length') || 0) > 70000000) throw Error('70MB 이상의 파일입니다.');
    const blob = await response.blob();
    if (blob.size > 70000000) throw Error('70MB 이상의 파일입니다.');
    return blob;
  }
  function saveBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = make('a'); a.href = url; a.download = filename;
    a.style.display = 'none'; shadow.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 45000);
  }
  function busy(flag, message = '') {
    S.busy = flag;
    updateBar();
    if (message) status.textContent = message;
  }
  async function downloadOne(it, number = 1) {
    if (S.busy) return;
    busy(true, '다운로드 준비 중…');
    try {
      const blob = await getBlob(it);
      saveBlob(blob, makeFilename(it, number, blob.type));
      notify('다운로드 요청 완료 (' + Math.round(blob.size / 1024) + 'KB)');
      status.textContent = '저장이 시작되지 않으면 Chrome 다운로드 권한을 확인하세요.';
    } catch (e) {
      notify('직접 저장 불가: ' + e.message + '\n「열기」를 눌러 길게 눌러 저장하세요.');
      status.textContent = '해당 서버의 CORS/접근 제한 또는 Canvas 보안 제한으로 직접 저장하지 못했습니다.';
    } finally { busy(false); }
  }
  // Self-contained, uncompressed ZIP: no library or external server required.
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    for (let j = 0; j < 8; j++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
    return n >>> 0;
  });
  function crc(bytes) {
    let c = 0xffffffff;
    for (const b of bytes) c = crcTable[(c ^ b) & 255] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }
  function zipFile(entries) {
    const chunks = [], dirs = [];
    let offset = 0;
    const te = new TextEncoder();
    const dt = new Date();
    const time = (dt.getHours() << 11) | (dt.getMinutes() << 5) | (dt.getSeconds() >> 1);
    const date = ((dt.getFullYear() - 1980) << 9) | ((dt.getMonth() + 1) << 5) | dt.getDate();
    for (const entry of entries) {
      const name = te.encode(entry.name);
      const b = entry.bytes, checksum = crc(b);
      const head = new Uint8Array(30 + name.length), hv = new DataView(head.buffer);
      hv.setUint32(0, 0x04034b50, true); hv.setUint16(4, 20, true); hv.setUint16(6, 0x0800, true);
      hv.setUint16(10, time, true); hv.setUint16(12, date, true); hv.setUint32(14, checksum, true);
      hv.setUint32(18, b.byteLength, true); hv.setUint32(22, b.byteLength, true); hv.setUint16(26, name.length, true);
      head.set(name, 30);
      chunks.push(head, b);
      const cent = new Uint8Array(46 + name.length), cv = new DataView(cent.buffer);
      cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true);
      cv.setUint16(8, 0x0800, true); cv.setUint16(12, time, true); cv.setUint16(14, date, true);
      cv.setUint32(16, checksum, true); cv.setUint32(20, b.byteLength, true);
      cv.setUint32(24, b.byteLength, true); cv.setUint16(28, name.length, true);
      cv.setUint32(42, offset, true); cent.set(name, 46); dirs.push(cent);
      offset += head.length + b.byteLength;
    }
    const centralLength = dirs.reduce((a, x) => a + x.length, 0);
    const end = new Uint8Array(22), ev = new DataView(end.buffer);
    ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, entries.length, true);
    ev.setUint16(10, entries.length, true); ev.setUint32(12, centralLength, true); ev.setUint32(16, offset, true);
    return new Blob([...chunks, ...dirs, end], { type: 'application/zip' });
  }
  async function downloadSelected() {
    if (S.busy) return;
    const items = [...S.selected].map(k => S.items.get(k)).filter(Boolean);
    if (!items.length) { notify('먼저 이미지를 선택하세요.'); return; }
    if (items.length === 1) { await downloadOne(items[0]); return; }
    if (items.length > 40) { notify('모바일 메모리 보호를 위해 한 번에 최대 40개만 다운로드합니다.'); return; }
    busy(true, '여러 이미지 다운로드 준비 중…');
    const entries = [], failed = [], names = new Set();
    let size = 0;
    try {
      for (const [i, it] of items.entries()) {
        status.textContent = '이미지 다운로드 준비: ' + (i + 1) + ' / ' + items.length;
        try {
          const blob = await getBlob(it);
          size += blob.size;
          if (size > 85000000) { failed.push('용량 초과'); break; }
          let filename = makeFilename(it, i + 1, blob.type);
          if (names.has(filename)) filename = String(i + 1).padStart(3, '0') + '_' + filename;
          names.add(filename);
          entries.push({ name: filename, bytes: new Uint8Array(await blob.arrayBuffer()) });
        } catch (_) { failed.push(displayName(it)); }
      }
      if (entries.length) {
        saveBlob(zipFile(entries), 'selected_images_' + Date.now() + '.zip');
        notify(entries.length + '개 ZIP 저장 요청 완료' + (failed.length ? '\n' + failed.length + '개 실패/제외' : ''));
      } else notify('파일을 저장하지 못했습니다. 이미지의 「열기」 버튼을 이용하세요.');
      status.textContent = failed.length ? failed.length + '개 이미지 저장 실패. CORS 제한 또는 파일 크기 때문일 수 있습니다.' : 'ZIP 파일을 다운로드 폴더에서 확인하세요.';
    } finally { busy(false); }
  }
  function updateBar() {
    const count = S.selected.size;
    selectCount.textContent = '선택 ' + count + '개';
    dlSelected.disabled = S.busy || !count;
    cpSelected.disabled = !count;
    pickCount.textContent = '선택 ' + count + '개';
  }
  function itemMatch(it) {
    if (S.selectedOnly && !S.selected.has(it.key)) return false;
    if (S.big && it.type === 'url' && it.w && it.h && it.w < 300 && it.h < 300) return false;
    return !S.query || (it.url + ' ' + it.kind + ' ' + displayName(it)).toLowerCase().includes(S.query);
  }
  function drawCards() {
    grid.replaceChildren();
    const items = [...S.items.values()].filter(itemMatch);
    const visible = items.slice(0, S.shown || 60);
    for (const [i, it] of visible.entries()) {
      const cell = make('div', { className: 'cell' + (S.selected.has(it.key) ? ' sel' : '') });
      const picture = make('div', { className: 'preview' });
      const src = getPreview(it);
      if (src && src.length < 2500000) {
        const image = make('img'); image.src = src; image.loading = 'lazy'; image.alt = '미리보기 ' + (i + 1);
        image.addEventListener('error', () => { image.replaceWith(make('div', { text: '미리보기를 표시할 수 없음', className: 'placeholder' })); });
        picture.append(image);
      } else picture.append(make('div', { text: it.type === 'canvas' ? 'Canvas (추출 제한 가능)' : '미리보기 없음', className: 'placeholder' }));
      const tick = make('div', { className: 'tick', text: S.selected.has(it.key) ? '☑' : '□' }); picture.append(tick);
      picture.addEventListener('click', () => { select(it); cell.classList.toggle('sel', S.selected.has(it.key)); tick.textContent = S.selected.has(it.key) ? '☑' : '□'; });
      const body = make('div', { className: 'body' });
      body.append(make('div', { className: 'name', text: displayName(it) }));
      body.append(make('div', { className: 'sub', text: it.kind + (it.w ? ' · ' + it.w + 'px' : '') }));
      const r = make('div', { className: 'btnrow' });
      r.append(
        btn('저장', () => downloadOne(it, i + 1), 'primary'),
        btn('URL', () => copy(it.url), 'outline'),
        btn('열기', () => openOriginal(it), 'outline')
      );
      body.append(r); cell.append(picture, body); grid.append(cell);
    }
    more.style.display = items.length > visible.length ? 'block' : 'none';
    result.textContent = '발견 ' + S.items.size + '개 / 표시 ' + visible.length + '개' + (S.blocked ? ' · 외부 iframe ' + S.blocked + '개 접근 불가' : '') + (S.truncated ? ' · 탐색량 제한' : '');
    if (!items.length) grid.append(make('div', { id: 'empty', text: '표시할 이미지가 없습니다. 스크롤 후 「다시 검색」 또는 「심층 검색」을 눌러보세요.' }));
  }
  function render() {
    drawCards(); updateBar();
    frameLinks.replaceChildren();
    if (S.blockedUrls.size) {
      const toggle = btn('↗ 외부 iframe ' + S.blockedUrls.size + '개: 새 탭에서 열기', () => {
        const expanded = frameLinks.querySelector('.frameURLs');
        if (expanded) { expanded.remove(); return; }
        const area = make('div', { className: 'frameURLs' });
        area.style.cssText = 'display:flex;flex-direction:column;gap:5px;margin-top:6px';
        for (const url of [...S.blockedUrls].slice(0, 12)) {
          const a = make('a', { text: url.length > 90 ? url.slice(0, 90) + '…' : url });
          a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer';
          a.style.cssText = 'color:#9fc1ff;word-break:break-all';
          area.append(a);
        }
        frameLinks.append(area);
      }, 'outline');
      frameLinks.append(toggle);
    }
  }
  function stopPick() {
    S.pick = false;
    host.style.pointerEvents = 'auto';
    for (const [d, callback] of S.listeners) try { d.removeEventListener('click', callback, true); } catch (_) {}
    S.listeners = [];
    panel.style.display = ''; pickbar.style.display = 'none';
    render();
  }
  function itemAt(event, d) {
    for (const el of event.composedPath?.() || [event.target]) {
      if (!el?.tagName) continue;
      const tag = el.tagName.toLowerCase();
      if (tag === 'img') return add(el.currentSrc || el.getAttribute('src') || el.src, '직접 선택', d, el);
      if (tag === 'canvas') return addSpecial(el, 'Canvas', d);
      if (tag === 'svg') return addSpecial(el, 'SVG', d);
      if (tag === 'video') { const it = add(el.poster, '비디오 포스터', d, el); if (it) return it; }
      const bg = urlsInCss(getComputedStyle(el).backgroundImage);
      if (bg.length) return add(bg[0], 'CSS 직접 선택', d, el);
      if (el.getAttribute) {
        for (const key of ['data-src', 'data-original', 'data-image', 'data-full']) {
          const it = add(el.getAttribute(key), '직접 선택', d, el);
          if (it) return it;
        }
      }
    }
    return null;
  }
  function beginPick() {
    S.pick = true; host.style.pointerEvents = 'none'; panel.style.display = 'none'; pickbar.style.display = 'flex';
    pickbar.style.pointerEvents = 'auto';
    pickbar.style.alignItems = 'center'; pickbar.style.justifyContent = 'space-between';
    const listener = d => ev => {
      if (!S.pick || host.contains(ev.target)) return;
      ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation();
      const it = itemAt(ev, d);
      if (it) { select(it); notify('사진 ' + (S.selected.has(it.key) ? '선택됨' : '선택 해제됨')); }
      else notify('선택한 요소에 추출 가능한 이미지가 없습니다.');
    };
    for (const d of S.scannedDocs) {
      const fn = listener(d);
      try { d.addEventListener('click', fn, true); S.listeners.push([d, fn]); } catch (_) {}
    }
  }
  function close() {
    stopPick(); clearTimeout(S.toastTimer); host.remove(); delete window[G];
  }
  // Main toolbar
  const heading = row(top);
  heading.append(make('div', { text: '🖼 이미지 탐색 · 선택 · 저장', className: 'title grow' }));
  heading.append(btn('✕ 닫기', close, 'danger'));
  const actions = row(top); actions.style.marginTop = '8px';
  actions.append(btn('👆 화면에서 선택', beginPick, 'primary'));
  actions.append(btn('↻ 다시 검색', () => scan(false)));
  actions.append(btn('🔍 심층 검색', () => scan(true)));
  const tools = row(top); tools.style.marginTop = '8px';
  const selectCount = make('b', { text: '선택 0개' }); tools.append(selectCount);
  const dlSelected = btn('⬇ 선택 다운로드 (여러 장은 ZIP)', downloadSelected, 'primary');
  const cpSelected = btn('🔗 선택 URL 복사', () => {
    const urls = [...S.selected].map(k => S.items.get(k)?.url).filter(Boolean);
    copy(urls.join('\n'));
    if (!urls.length) notify('주소가 없는 Canvas/SVG는 URL 복사 대신 다운로드하세요.');
  });
  tools.append(dlSelected, cpSelected, btn('선택 해제', () => { S.selected.clear(); render(); }));
  const filterRow = row(top); filterRow.style.marginTop = '7px';
  const selectedLabel = make('label'); const selectedCheck = make('input'); selectedCheck.type = 'checkbox';
  selectedCheck.addEventListener('change', () => { S.selectedOnly = selectedCheck.checked; S.shown = 0; render(); });
  selectedLabel.append(selectedCheck, doc.createTextNode('선택한 사진만'));
  const bigLabel = make('label'); const bigCheck = make('input'); bigCheck.type = 'checkbox';
  bigCheck.addEventListener('change', () => { S.big = bigCheck.checked; S.shown = 0; render(); });
  bigLabel.append(bigCheck, doc.createTextNode('작은 이미지 숨기기'));
  filterRow.append(selectedLabel, bigLabel);
  const q = make('input', { id: 'q' }); q.placeholder = '파일명 또는 이미지 URL 검색'; q.type = 'search';
  q.addEventListener('input', () => { S.query = q.value.toLowerCase(); S.shown = 0; render(); }); top.append(q);
  const frameLinks = make('div'); frameLinks.style.marginTop = '5px'; top.append(frameLinks);
  const result = make('div', { id: 'status' }); top.append(result);
  const status = make('div', { id: 'status' }); top.append(status);
  const pickCount = make('strong', { text: '선택 0개' });
  pickbar.append(make('span', { text: '사진을 터치해서 선택' }), pickCount, btn('☑ 목록으로', stopPick, 'primary'));
  more.addEventListener('click', () => { S.shown = (S.shown || 60) + 60; drawCards(); });
  scan(false);
})();
