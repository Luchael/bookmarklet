(() => {
  'use strict';
  const KEY = '__bookmarklets_tool_launcher__';
  if (window[KEY]) { window[KEY].close(); return; }
  if (!document.body) { alert('페이지가 열린 뒤 다시 실행해주세요.'); return; }
  for (const key of ['__image_explorer_mobile_v2__', '__bookmarklets_video_picker_v1__']) {
    try { window[key]?.close?.(); } catch (_) {}
  }
  const scriptUrl = document.currentScript && document.currentScript.src;
  const base = scriptUrl ? scriptUrl.slice(0, scriptUrl.lastIndexOf('/') + 1) : '';
  if (!base) { alert('실행 파일 경로를 확인할 수 없습니다.'); return; }
  window.__bookmarklets_open_menu__ = () => {
    const s=document.createElement('script');s.src=base+'launcher.js';
    s.onerror=()=>alert('선택 메뉴를 불러오지 못했습니다.');
    (document.head||document.documentElement).append(s);
  };
  const host = document.createElement('div');
  host.id = KEY;
  host.style.cssText = 'position:fixed!important;inset:0!important;z-index:2147483647!important;';
  const shadow = host.attachShadow({mode:'open'});
  const style = document.createElement('style');
  style.textContent = `
    *{box-sizing:border-box} :host{color-scheme:dark}
    .screen{position:fixed;inset:0;display:grid;place-items:center;background:#080d1dcc;padding:16px;font:14px/1.5 system-ui,-apple-system,sans-serif;color:#f3f7ff}
    .panel{width:min(100%,420px);background:#1c2334;border:1px solid #52617c;border-radius:19px;box-shadow:0 12px 40px #0008;padding:19px}
    .top{display:flex;justify-content:space-between;align-items:center;gap:8px}
    h1{font-size:20px;margin:0}p{font-size:12px;color:#b2bdd1;margin:4px 0 16px}
    button{cursor:pointer;border:1px solid #617394;color:white;border-radius:12px;background:#2a3752;font:inherit}
    .close{font-size:18px;background:transparent;border:0;padding:2px 8px}
    .tiles{display:grid;grid-template-columns:1fr 1fr;gap:10px}
    .tile{min-width:0;text-align:center;padding:18px 8px;display:flex;align-items:center;flex-direction:column;gap:7px}
    .tile:active,.tile:focus-visible{background:#395782;outline:2px solid #94bbff}
    .emoji{font-size:29px}.name{font-weight:750;font-size:15px}.desc{font-size:11px;color:#c3cce0}
    .status{margin-top:13px;font-size:12px;min-height:18px;color:#c7d6ef}
  `;
  const screen = document.createElement('div'); screen.className='screen';
  const panel=document.createElement('div');panel.className='panel';
  const top=document.createElement('div');top.className='top';
  const h=document.createElement('h1');h.textContent='북마클릿 도구 상자';
  const close=document.createElement('button');close.className='close';close.textContent='✕';close.setAttribute('aria-label','닫기');close.addEventListener('click',dispose);
  top.append(h,close);
  const intro=document.createElement('p');intro.textContent='현재 웹페이지에서 실행할 도구를 선택하세요.';
  const tiles=document.createElement('div');tiles.className='tiles';
  const status=document.createElement('div');status.className='status';status.setAttribute('role','status');
  function tile(icon,name,detail,file) {
    const btn=document.createElement('button');btn.className='tile';
    for(const [cls,txt] of [['emoji',icon],['name',name],['desc',detail]]) {
      const s=document.createElement('span');s.className=cls;s.textContent=txt;btn.append(s);
    }
    btn.addEventListener('click',()=>load(file));tiles.append(btn);
  }
  tile('🖼️','이미지 추출기','갤러리 · 직접 선택 · ZIP','image-picker.js');
  tile('🎬','동영상 추출기','미리보기 · 주소 · 파일 저장','video-picker.js');
  panel.append(top,intro,tiles,status);screen.append(panel);shadow.append(style,screen);document.body.append(host);
  window[KEY]={close:dispose};
  screen.addEventListener('click', e=>{if(e.target===screen)dispose()});
  function dispose() { if(window[KEY])delete window[KEY];host.remove(); }
  function load(file) {
    const buttons=[...tiles.querySelectorAll('button')];buttons.forEach(b=>b.disabled=true);
    status.textContent='도구를 불러오는 중…';
    const s=document.createElement('script');s.src=base+file;
    s.onload=()=>{dispose();s.remove()};
    s.onerror=()=>{status.textContent='불러오기 실패: 저장소 주소, 파일명 또는 사이트의 CSP 보안 설정을 확인하세요.';buttons.forEach(b=>b.disabled=false);s.remove()};
    (document.head||document.documentElement).append(s);
  }
})();
