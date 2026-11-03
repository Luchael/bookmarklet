(() => {
  'use strict';
  const KEY = '__bookmarklets_video_picker_v1__';
  if (window[KEY]) { window[KEY].close(); return; }
  if (!document.body) { alert('문서를 연 뒤 다시 실행해주세요.'); return; }
  const doc = document;
  const state = {
    items: new Map(), selected: new Set(), docs: new Set(), blocked: new Set(),
    deep: false, nodes: 0, truncated: false, pick: false, listeners: [],
    query: '', type: 'all', busy: false, rendered: 0, toastTimer: 0,
    foundByNode: new WeakMap()
  };
  const host=doc.createElement('div');host.id=KEY;
  host.style.cssText='position:fixed!important;inset:0!important;z-index:2147483647!important;pointer-events:auto!important';
  const shadow=host.attachShadow({mode:'open'});
  const css=doc.createElement('style');css.textContent=`
    :host{color-scheme:dark}*{box-sizing:border-box}button,input,select{font:inherit}
    #panel{position:absolute;inset:0;overflow:auto;overscroll-behavior:contain;background:#121721f7;color:#f5f7fc;font:14px/1.5 system-ui,-apple-system,sans-serif}
    #top{position:sticky;top:0;background:#1c2535;z-index:10;box-shadow:0 3px 10px #0008;padding:12px}
    .flex{display:flex;align-items:center;gap:7px;flex-wrap:wrap}.grow{flex:1}.title{font-weight:800;font-size:17px}
    .note{font-size:11px;color:#b3c0d4}button{background:#334462;border:1px solid #5e7399;color:white;border-radius:9px;padding:8px 10px;cursor:pointer}
    button:disabled{opacity:.5;cursor:default}.primary{background:#386bd8;border-color:#386bd8}.danger{background:#643e46}.flat{background:#242f42}
    input,select{background:#29374f;border:1px solid #697b98;border-radius:9px;color:#fff;padding:9px;min-width:0}
    input{flex:1;min-width:150px}.filter{margin-top:9px}.notice{margin-top:8px;font-size:12px;color:#c0cde0}
    #grid{display:grid;grid-template-columns:repeat(1,minmax(0,1fr));gap:10px;padding:12px}
    @media(min-width:650px){#grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
    .card{background:#222e40;border:2px solid transparent;border-radius:13px;overflow:hidden;min-width:0}.card.sel{border-color:#8dc9ff}
    .poster{height:152px;background:#111827;display:flex;justify-content:center;align-items:center;color:#b9c7de;font-size:32px;position:relative}
    .poster img{max-width:100%;height:100%;object-fit:contain}.tag{position:absolute;top:6px;left:6px;background:#0e152bd9;color:#fff;border-radius:6px;padding:2px 7px;font-size:11px}
    .content{padding:9px}.line{white-space:nowrap;text-overflow:ellipsis;overflow:hidden;word-break:break-all;font-size:12px}.source{font-size:11px;color:#b7c5db}
    .btns{display:flex;flex-wrap:wrap;gap:5px;margin-top:9px}.btns button{flex:1;font-size:12px;padding:6px 4px;min-width:60px}
    .select{display:flex;align-items:center;gap:8px;width:100%;text-align:left;margin-bottom:7px;background:#273950}.select .check{font-size:17px}
    #footer{padding:16px;color:#b5c0d2;font-size:12px;text-align:center}#more{margin:9px 12px;display:none}
    #toast{position:fixed;bottom:14px;left:50%;transform:translateX(-50%);z-index:30;max-width:90vw;background:#e6f1ff;color:#101b30;border-radius:10px;padding:9px 14px;display:none;font:13px system-ui;box-shadow:0 5px 30px #0009}
    #pickbar{display:none;position:fixed;bottom:8px;left:8px;right:8px;z-index:25;border-radius:12px;padding:10px;background:#1c2c49;color:white;border:1px solid #6f84a7;font:13px system-ui}
    #frames{margin:5px 12px;padding:8px;border:1px solid #56617a;border-radius:10px;display:none;word-break:break-all}
    #frames a{color:#a7cfff;display:block;padding:5px}#status{color:#b8c9df;font-size:12px;margin-top:6px}
  `;
  shadow.append(css);
  const panel=doc.createElement('div');panel.id='panel';
  const top=doc.createElement('div');top.id='top';panel.append(top);
  const grid=doc.createElement('div');grid.id='grid';panel.append(grid);
  const more=doc.createElement('button');more.id='more';more.textContent='더 보기';panel.append(more);
  const frames=doc.createElement('div');frames.id='frames';panel.append(frames);
  const footer=doc.createElement('div');footer.id='footer';footer.textContent='실제로 현재 페이지에 노출된 영상 주소만 탐색합니다. DRM이나 CORS 제한을 우회하지 않습니다.';panel.append(footer);
  const toast=doc.createElement('div');toast.id='toast';
  const pickbar=doc.createElement('div');pickbar.id='pickbar';
  shadow.append(panel,toast,pickbar);doc.body.append(host);window[KEY]={close};

  function el(tag,text,cls){const n=doc.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n}
  function button(text,fn,cls){const b=el('button',text,cls);b.addEventListener('click',fn);return b}
  function line(parent,cls){const e=el('div',undefined,cls||'flex');parent.append(e);return e}
  function notify(message){toast.textContent=message;toast.style.display='block';clearTimeout(state.toastTimer);state.toastTimer=setTimeout(()=>toast.style.display='none',3600)}
  function normalize(input,d=doc){
    if(typeof input!=='string')return '';
    const raw=input.trim().replace(/^['"]|['"]$/g,'').replace(/&amp;/g,'&').replace(/\\\//g,'/');
    if(!raw||raw.startsWith('#')||raw.startsWith('javascript:'))return '';
    try{const u=new URL(raw,d.baseURI||location.href);return /^(https?:|blob:)/i.test(u.protocol)?u.href:''}catch{return ''}
  }
  const suffix=/\.(?:mp4|m4v|webm|mov|ogv|ogg|m3u8|mpd)(?:[?#]|$)/i;
  function infer(u,embed=false){
    if(/^blob:/i.test(u))return 'blob';
    if(/\.m3u8(?:[?#]|$)/i.test(u))return 'hls';
    if(/\.mpd(?:[?#]|$)/i.test(u))return 'dash';
    if(embed)return 'embed';
    if(suffix.test(u))return 'file';
    return 'unknown';
  }
  function add(raw,from,d=doc,node=null,poster='',explicitType=''){
    const url=normalize(raw,d);if(!url)return null;
    const kind=explicitType||infer(url);
    if(state.items.has(url)){
      const old=state.items.get(url);
      if(!old.poster&&poster)old.poster=normalize(poster,d);
      if(old.kind==='unknown'&&kind!=='unknown')old.kind=kind;
      if(node)state.foundByNode.set(node,url);
      return old;
    }
    const item={url,kind,from,poster:normalize(poster,d),node};state.items.set(url,item);
    if(node)state.foundByNode.set(node,url);
    return item;
  }
  function addTyped(raw,from,d,node,poster,explicitType){
    if(typeof raw!=='string'||raw.length>6000)return;
    const u=normalize(raw,d);if(!u)return;
    if(suffix.test(u)||/^blob:/i.test(u)||explicitType)add(u,from,d,node,poster,explicitType);
  }
  function findVideo(n){
    try{return n.closest?.('video')||(n.querySelector?.('video'))||null}catch{return null}
  }
  function attrSearch(n,d){
    for(const a of n.attributes||[]){
      if(!/^(?:data-|src$|href$)/i.test(a.name))continue;
      if(!/(?:video|stream|movie|file|media|mp4|webm|m3u8|playback|src|href|url)/i.test(a.name))continue;
      const val=(a.value||'').trim();if(val.length>6000)continue;
      addTyped(val,'지연 로딩 / 데이터 속성',d,n,n.getAttribute?.('poster'));
    }
  }
  function scanRoot(root,d){
    if(!root.querySelectorAll)return;
    const limit=state.deep?16000:8000;
    for(const n of root.querySelectorAll('*')){
      if(++state.nodes>limit){state.truncated=true;return}
      if(n===host||host.contains(n))continue;
      const tag=n.localName?.toLowerCase();
      if(tag==='video'){
        const poster=n.poster||n.getAttribute('poster')||'';
        const urls=[n.currentSrc,n.getAttribute('src'),n.src];
        for(const u of urls)add(u,'비디오 플레이어',d,n,poster);
        for(const source of n.querySelectorAll('source'))add(source.getAttribute('src')||source.src,'비디오 소스',d,n,poster);
        if(n.srcObject){ /* MediaStream: 주소가 없으며 직접 파일로 추출할 수 없음 */ }
      }else if(tag==='source'&&n.parentElement?.localName?.toLowerCase()==='video'){
        const video=n.parentElement;add(n.getAttribute('src')||n.src,'비디오 소스',d,video,video.poster);
      }else if(tag==='a'){
        addTyped(n.getAttribute('href'),'비디오 다운로드 링크',d,n,'');
      }else if(tag==='meta'){
        const name=(n.getAttribute('property')||n.getAttribute('name')||'').toLowerCase();
        if(/^(og:video(?::(?:url|secure_url))?|twitter:player:stream|video|twitter:player)$/.test(name)){
          const raw=n.getAttribute('content');add(raw,'영상 메타데이터',d,n,'',name==='twitter:player'?'embed':'');
        }
      }else if(tag==='link'){
        if(n.getAttribute('as')==='video')add(n.getAttribute('href'),'미리 불러오기',d,n);
      }else if(tag==='iframe'||tag==='frame'){
        try{if(n.contentDocument?.documentElement)scanDocument(n.contentDocument);
             else state.blocked.add(normalize(n.getAttribute('src')||n.src,d)||'(주소 없음)');}
        catch{state.blocked.add(normalize(n.getAttribute('src')||n.src,d)||'(주소 없음)');}
      }
      if(state.deep||['VIDEO','DIV','A','SOURCE','IFRAME','SECTION','ARTICLE'].includes(n.tagName))attrSearch(n,d);
      if(n.shadowRoot)scanRoot(n.shadowRoot,d);
    }
    for(const n of root.querySelectorAll('script[type="application/ld+json"]')){
      try{const obj=JSON.parse(n.textContent.slice(0,500000));let visited=0;
        function walk(v,depth){if(depth>14||++visited>1000||!v)return;
          if(Array.isArray(v)){for(const x of v)walk(x,depth+1);return}
          if(typeof v==='object'){
            const videoSchema=/VideoObject/i.test(String(v['@type']||''));
            if(videoSchema){
              for(const k of ['contentUrl','url']){let xs=v[k];if(!Array.isArray(xs))xs=[xs];for(const x of xs)addTyped(x,'JSON-LD 동영상 정보',d,n,v.thumbnailUrl||'', '');}
              for(const x of [v.embedUrl].flat())if(typeof x==='string')add(x,'JSON-LD 영상 플레이어',d,n,'','embed');
            }
            for(const [k,val] of Object.entries(v))if(typeof val==='object')walk(val,depth+1);
          }
        }walk(obj,0);
      }catch{}
    }
    if(state.deep){
      let count=0;
      for(const script of root.querySelectorAll('script:not([src])')){
        if(++count>80)break;
        const raw=(script.textContent||'').slice(0,300000).replace(/\\\//g,'/');
        const re=/https?:\/\/[^\s"'<>\\]{3,1500}?\.(?:mp4|m4v|mov|webm|ogv|m3u8|mpd)(?:\?[^\s"'<>\\]{0,350})?/ig;
        for(const match of raw.matchAll(re))add(match[0],'스크립트에 노출된 주소',d);
      }
    }
  }
  function scanDocument(d){if(state.docs.has(d))return;state.docs.add(d);scanRoot(d,d)}
  function scan(deep=false){
    state.deep=deep;state.docs.clear();state.blocked.clear();state.nodes=0;state.truncated=false;
    try{scanDocument(doc)}catch(e){notify('탐색 오류: '+e.message)}
    try{for(const r of performance.getEntriesByType('resource')){
      if(/^(?:video|media)$/.test(r.initiatorType)||suffix.test(r.name))addTyped(r.name,'브라우저 리소스 기록');
    }}catch{}
    render();
  }
  const heading=line(top);heading.append(el('span','🎬 동영상 추출기','title'));
  const spacer=el('span','', 'grow');heading.append(spacer);
  if(typeof window.__bookmarklets_open_menu__==='function')
    heading.append(button('☰ 도구 선택',()=>{close();window.__bookmarklets_open_menu__()},'flat'));
  heading.append(button('닫기 ✕',close,'danger'));
  const action=line(top);action.style.marginTop='9px';
  const btnScan=button('다시 검색',()=>scan(false));const btnDeep=button('심층 검색',()=>scan(true));
  const btnPick=button('화면에서 선택',startPick,'primary');const btnFrame=button('iframe 목록',showFrames);
  action.append(btnScan,btnDeep,btnPick,btnFrame);
  const bulk=line(top);bulk.style.marginTop='8px';
  const btnCopy=button('선택 주소 복사',copySelected);
  const btnZip=button('선택 ZIP 저장',zipSelected);
  const btnAll=button('전체 선택',()=>{for(const x of filteredItems())state.selected.add(x.url);render()});
  const btnNone=button('선택 해제',()=>{state.selected.clear();render()});
  bulk.append(btnCopy,btnZip,btnAll,btnNone);
  const filterLine=line(top,'flex filter');
  const q=el('input');q.placeholder='URL·출처 검색';q.addEventListener('input',()=>{state.query=q.value.trim().toLowerCase();render()});
  const type=el('select');
  for(const [value,text] of [['all','전체'],['file','동영상 파일'],['hls','HLS (.m3u8)'],['dash','DASH (.mpd)'],['blob','blob 주소'],['embed','플레이어 링크'],['unknown','기타 주소']]){const o=el('option',text);o.value=value;type.append(o)}
  type.addEventListener('change',()=>{state.type=type.value;render()});filterLine.append(q,type);
  const summary=el('div',undefined,'notice');top.append(summary);
  const status=el('div',undefined,'note');status.id='status';top.append(status);

  function filteredItems(){
    return [...state.items.values()].filter(item=>(state.type==='all'||item.kind===state.type)&&(!state.query||(item.url+' '+item.from).toLowerCase().includes(state.query)));
  }
  function updateBar(){
    summary.textContent=`발견 ${state.items.size}개 · 현재 목록 ${filteredItems().length}개 · 선택 ${state.selected.size}개 · 접근 불가 iframe ${state.blocked.size}개`;
    status.textContent=state.truncated?'페이지가 커서 일부만 검색했습니다. 필요한 구간까지 스크롤해 다시 검색하세요.':'일반 파일은 저장 가능성이 높습니다. HLS·DASH·blob 주소는 그대로 영상 파일이 아닐 수 있습니다.';
    btnCopy.disabled=!state.selected.size;btnZip.disabled=!state.selected.size;
  }
  function typeName(t){return ({file:'영상 파일',hls:'HLS 재생목록',dash:'DASH 재생목록',blob:'blob / MediaSource',embed:'외부 플레이어',unknown:'기타 재생 주소'})[t]||t}
  function render(){
    updateBar();grid.replaceChildren();
    const visible=filteredItems();state.rendered=Math.min(visible.length,40);
    for(const item of visible.slice(0,state.rendered))card(item);
    more.style.display=visible.length>state.rendered?'block':'none';
    if(!visible.length)grid.append(el('p','영상 주소를 발견하지 못했습니다. 해당 영상이 보이는 곳까지 스크롤하고 심층 검색을 사용해 보세요.'));
  }
  function card(item){
    const wrap=el('article',undefined,'card'+(state.selected.has(item.url)?' sel':''));
    const poster=el('div',undefined,'poster');
    if(item.poster){const img=el('img');img.loading='lazy';img.referrerPolicy='no-referrer-when-downgrade';img.src=item.poster;poster.append(img)}
    else poster.append(el('span',item.kind==='file'?'▶':'🎞'));
    poster.append(el('span',typeName(item.kind),'tag'));wrap.append(poster);
    const content=el('div',undefined,'content');
    const select=button('',()=>{state.selected.has(item.url)?state.selected.delete(item.url):state.selected.add(item.url);render()},'select');
    select.append(el('span',state.selected.has(item.url)?'☑':'☐','check'),el('span',item.from));content.append(select);
    const url=el('div',item.url,'line');url.title=item.url;content.append(url);
    let hostname='';try{hostname=new URL(item.url).hostname}catch{};
    content.append(el('div',hostname+' · '+typeName(item.kind),'source'));
    const buttons=line(content,'btns');
    buttons.append(button('주소 복사',()=>copy(item.url)),button('원본 열기',()=>openUrl(item.url)));
    if(item.kind==='file'||item.kind==='unknown')buttons.append(button('파일 저장',()=>saveOne(item)));
    else buttons.append(button('주소 안내',()=>notify('이 주소는 직접 MP4 등의 파일 주소가 아닐 수 있습니다. 원본 열기로 확인하세요.')));
    if(['file','unknown','hls'].includes(item.kind))buttons.append(button('미리보기',()=>preview(item)));
    wrap.append(content);grid.append(wrap);
  }
  more.addEventListener('click',()=>{
    const visible=filteredItems(),stop=Math.min(visible.length,state.rendered+40);
    for(const item of visible.slice(state.rendered,stop))card(item);
    state.rendered=stop;more.style.display=stop<visible.length?'block':'none';
  });
  async function copy(text){
    try{if(!navigator.clipboard?.writeText)throw new Error('clipboard unavailable');await navigator.clipboard.writeText(text);notify('주소를 복사했습니다.')}
    catch{prompt('주소를 길게 눌러 복사하세요',text)}
  }
  function copySelected(){const list=[...state.items.values()].filter(x=>state.selected.has(x.url));if(!list.length)return;copy(list.map(x=>x.url).join('\n'))}
  function openUrl(url){if(/^blob:/.test(url)){notify('blob: 주소는 다른 탭에서 작동하지 않을 수 있습니다.');return}window.open(url,'_blank','noopener,noreferrer')}
  function filename(item,index=0){
    let ext='mp4';try{const path=new URL(item.url).pathname;ext=(path.match(/\.(mp4|m4v|webm|mov|ogv|ogg)$/i)||[])[1]?.toLowerCase()||'mp4'}catch{}
    return 'video-'+String(index||[...state.items.keys()].indexOf(item.url)+1).padStart(3,'0')+'.'+ext;
  }
  function triggerDownload(href,name){
    const a=doc.createElement('a');a.href=href;a.download=name;a.style.display='none';doc.body.append(a);a.click();a.remove();
  }
  function preview(item){
    if(item.kind==='blob')return notify('MediaSource blob 영상은 미리보기 주소를 복사할 수 없습니다.');
    const u=item.url;
    const win=window.open('','_blank');
    if(!win){openUrl(u);return}
    try{
      win.document.title='영상 미리보기';
      const h=win.document.createElement('p');h.textContent='플레이어에 영상이 나타나지 않으면 원본 URL을 열어보세요.';
      const v=win.document.createElement('video');v.controls=true;v.playsInline=true;v.preload='metadata';v.src=u;v.style.cssText='width:100%;max-height:80vh;background:#000';
      win.document.body.append(h,v);
    }catch{try{win.location.href=u}catch{}}
  }
  async function fetchChunks(url,maxBytes){
    const res=await fetch(url,{mode:'cors',credentials:'same-origin',redirect:'follow'});
    if(!res.ok||res.type==='opaque')throw Error('서버가 파일 다운로드 요청을 허용하지 않았습니다.');
    const mime=(res.headers.get('content-type')||'').toLowerCase();
    if(/text\/html|application\/(?:json|xml)/.test(mime))throw Error('서버가 영상 파일 대신 웹페이지를 반환했습니다.');
    const length=Number(res.headers.get('content-length'));
    if(length>maxBytes)throw Error('파일 크기가 설정된 상한을 넘었습니다.');
    let size=0;const chunks=[];const reader=res.body?.getReader();
    if(!reader){const bytes=new Uint8Array(await res.arrayBuffer());if(bytes.length>maxBytes)throw Error('파일 크기 제한 초과');return {chunks:[bytes],size:bytes.length}}
    try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>maxBytes){await reader.cancel();throw Error('다운로드 용량 제한 초과')}chunks.push(value)}}finally{reader.releaseLock()}
    return {chunks,size};
  }
  async function saveOne(item){
    if(state.busy){notify('다른 저장 작업이 진행 중입니다.');return}
    if(!['file','unknown'].includes(item.kind)){notify('이 주소는 일반 파일이 아닙니다.');return}
    const url=item.url;
    if(!url.startsWith('http')){notify('이 주소에서는 바로 파일을 저장할 수 없습니다.');return}
    if(new URL(url).origin===location.origin){triggerDownload(url,filename(item));notify('브라우저에 다운로드를 요청했습니다.');return}
    state.busy=true;notify('파일 접근 확인 중… (최대 120MB)');
    try{
      const result=await fetchChunks(url,120*1024*1024);
      const blob=new Blob(result.chunks,{type:'application/octet-stream'});
      const objectUrl=URL.createObjectURL(blob);triggerDownload(objectUrl,filename(item));
      setTimeout(()=>URL.revokeObjectURL(objectUrl),30000);notify('다운로드를 요청했습니다.');
    }catch(e){
      notify('직접 저장 실패: 서버의 CORS/인증 또는 용량 제한입니다. 원본 열기를 사용하세요.');
    }finally{state.busy=false}
  }
  function crcTable(){const a=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=(c&1)?0xEDB88320^(c>>>1):c>>>1;a[n]=c>>>0}return a}
  const TABLE=crcTable();
  function crcOf(chunks){let c=0xffffffff;for(const chunk of chunks){for(let j=0;j<chunk.length;j++)c=TABLE[(c^chunk[j])&255]^(c>>>8)}return(c^0xffffffff)>>>0}
  function le16(view,offset,v){view.setUint16(offset,v,true)}function le32(view,offset,v){view.setUint32(offset,v>>>0,true)}
  function makeZip(files){
    const parts=[],central=[];let offset=0;const encoder=new TextEncoder();
    for(const f of files){
      const name=encoder.encode(f.name),size=f.size,crc=crcOf(f.chunks);
      const local=new Uint8Array(30+name.length),v=new DataView(local.buffer);
      le32(v,0,0x04034b50);le16(v,4,20);le16(v,6,0x0800);le16(v,8,0);le16(v,10,0);le16(v,12,0);
      le32(v,14,crc);le32(v,18,size);le32(v,22,size);le16(v,26,name.length);le16(v,28,0);local.set(name,30);
      parts.push(local,...f.chunks);
      const c=new Uint8Array(46+name.length),cv=new DataView(c.buffer);
      le32(cv,0,0x02014b50);le16(cv,4,20);le16(cv,6,20);le16(cv,8,0x0800);le16(cv,10,0);
      le32(cv,16,crc);le32(cv,20,size);le32(cv,24,size);le16(cv,28,name.length);le32(cv,42,offset);c.set(name,46);
      central.push(c);offset+=local.length+size;
    }
    const centralStart=offset;for(const c of central){parts.push(c);offset+=c.length}
    const end=new Uint8Array(22),dv=new DataView(end.buffer);
    le32(dv,0,0x06054b50);le16(dv,8,files.length);le16(dv,10,files.length);le32(dv,12,offset-centralStart);le32(dv,16,centralStart);
    parts.push(end);return new Blob(parts,{type:'application/zip'});
  }
  async function zipSelected(){
    if(state.busy)return notify('다른 저장 작업이 진행 중입니다.');
    const chosen=[...state.items.values()].filter(x=>state.selected.has(x.url));
    const eligible=chosen.filter(x=>x.kind==='file'&&x.url.startsWith('http'));
    if(!eligible.length)return notify('MP4/WebM 등 일반 동영상 파일을 먼저 선택하세요.');
    if(eligible.length>6)return notify('메모리 보호를 위해 한 번에 6개까지만 ZIP으로 저장할 수 있습니다.');
    state.busy=true;const files=[];let remaining=80*1024*1024;
    try{
      for(let i=0;i<eligible.length;i++){
        const item=eligible[i];notify(`영상 ${i+1}/${eligible.length} 다운로드 중…`);
        const result=await fetchChunks(item.url,remaining);
        files.push({...result,name:filename(item,i+1)});remaining-=result.size;
      }
      const zip=makeZip(files);const u=URL.createObjectURL(zip);
      triggerDownload(u,'selected-videos.zip');setTimeout(()=>URL.revokeObjectURL(u),30000);
      notify(`ZIP 다운로드 요청 완료 (${files.length}개)`);
    }catch(e){notify('ZIP 생성 실패: '+e.message+' 사이트의 CORS 제한이나 파일 용량을 확인하세요.')}
    finally{state.busy=false}
  }
  function showFrames(){
    if(frames.style.display==='block'){frames.style.display='none';return}
    frames.replaceChildren();
    frames.append(el('div',`직접 접근할 수 없는 iframe ${state.blocked.size}개. 플레이어가 있는 프레임을 새 탭으로 열어 북마클릿을 다시 실행할 수 있습니다.`));
    for(const url of [...state.blocked].slice(0,30)){
      if(!/^https?:/i.test(url))continue;
      const a=el('a',url);a.href=url;a.target='_blank';a.rel='noopener noreferrer';frames.append(a);
    }
    frames.style.display='block';
  }
  function exitPick(){
    state.pick=false;panel.style.display='';host.style.pointerEvents='auto';pickbar.style.display='none';
    for(const [d,fn] of state.listeners){d.removeEventListener('click',fn,true)}state.listeners=[];render();
  }
  function selectByElement(target,d){
    let n=target;
    for(let i=0;i<10&&n;i++,n=n.parentElement){
      if(state.foundByNode.has(n)){const u=state.foundByNode.get(n);if(state.items.has(u))return state.items.get(u)}
      if(n.localName?.toLowerCase()==='video'){
        const raw=n.currentSrc||n.getAttribute('src')||n.querySelector('source')?.getAttribute('src');
        return add(raw,'화면 직접 선택',d,n,n.poster);
      }
      if(n.localName?.toLowerCase()==='a'&&suffix.test(n.getAttribute('href')||''))return add(n.getAttribute('href'),'화면 직접 선택',d,n);
    }
    return null;
  }
  function startPick(){
    if(state.pick)return;
    state.pick=true;panel.style.display='none';host.style.pointerEvents='none';
    pickbar.replaceChildren();pickbar.style.display='block';pickbar.style.pointerEvents='auto';
    const row=line(pickbar);row.append(el('span','영상 위를 터치하세요. 일부 커스텀 플레이어/타사 iframe은 갤러리에서 선택해야 합니다.'));
    row.append(button('갤러리 돌아가기',exitPick,'primary'));
    const targetDocs=[...state.docs];if(!targetDocs.includes(doc))targetDocs.push(doc);
    for(const d of targetDocs){
      const handler=e=>{
        if(!state.pick||e.composedPath().includes(host))return;
        const item=selectByElement(e.target,d);
        if(!item){notify('해당 위치에서 영상 주소를 찾지 못했습니다. 다른 곳을 터치하거나 갤러리를 이용하세요.');return}
        e.preventDefault();e.stopImmediatePropagation();
        state.selected.add(item.url);exitPick();notify('영상 하나를 선택했습니다.');
      };
      d.addEventListener('click',handler,true);state.listeners.push([d,handler]);
    }
  }
  function close(){
    if(state.pick)exitPick();clearTimeout(state.toastTimer);
    delete window[KEY];host.remove();
  }
  scan(false);
})();
