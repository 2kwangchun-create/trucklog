'use strict';
/* 아빠장부(구 운행장부) — 화물 운행·미수금 장부 (휴대폰 저장 + 선택형 구글 클라우드 동기화) */

// ---------- 기본 도구 ----------
const $=id=>document.getElementById(id);
const pad=n=>String(n).padStart(2,'0');
const iso=d=>d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
let TODAY, todayIso;
function setToday(){TODAY=new Date();TODAY.setHours(0,0,0,0);todayIso=iso(TODAY)}
setToday();
const won=n=>n.toLocaleString('ko-KR')+'원';
const comma=n=>n.toLocaleString('ko-KR');
const short=n=>n>=10000?(Math.round(n/1000)/10).toString().replace(/\.0$/,'')+'만':comma(n);
const parseD=s=>{const [y,m,d]=s.split('-').map(Number);return new Date(y,m-1,d)};
const daysSince=s=>Math.round((TODAY-parseD(s))/86400000);
const md=s=>Number(s.slice(5,7))+'/'+Number(s.slice(8,10));
const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const newId=()=>(window.crypto&&crypto.randomUUID)?crypto.randomUUID():Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,10);
const byOld=(a,b)=>a.date.localeCompare(b.date)||(a.createdAt||0)-(b.createdAt||0);
const byNew=(a,b)=>b.date.localeCompare(a.date)||(b.createdAt||0)-(a.createdAt||0);
const ls={get(k){try{return localStorage.getItem(k)}catch(_){return null}},set(k,v){try{localStorage.setItem(k,v)}catch(_){}}};

// ---------- 시작 화면 ----------
// 앱을 열 때 3초쯤 보여주고 사라짐 (누르면 바로 닫힘). 새로고침 때는 index.html에서 미리 지움
const SPLASH_MS=3000;
const Splash={
  open:false,held:false,el:null,timer:null,
  init(){
    const el=$('splash'); if(!el)return;
    this.el=el; this.open=true;
    try{sessionStorage.setItem('splashed','1')}catch(_){}
    $('splash-date').textContent=TODAY.toLocaleDateString('ko-KR',{month:'long',day:'numeric',weekday:'long'});
    el.addEventListener('click',()=>{if(!this.held)this.close()});
    this.timer=setTimeout(()=>this.close(),Math.max(0,SPLASH_MS-performance.now()));
  },
  close(){if(!this.open)return;this.open=false;clearTimeout(this.timer);this.el.classList.add('out');setTimeout(()=>this.el.remove(),500)},
  // 새 버전을 받는 동안 시작 화면을 조금 더 붙잡아 둠 (최대 8초, 넘으면 그냥 닫고 위에 안내)
  hold(msg){
    if(!this.open)return;
    this.held=true; clearTimeout(this.timer);
    $('splash-upd').textContent=msg; $('splash-upd').hidden=false;
    this.timer=setTimeout(()=>{this.held=false;this.close()},8000);
  },
};
Splash.init();

// ---------- 앱 설치 안내 ----------
// 링크를 브라우저로 열면 먼저 설치 화면 → [앱 설치하기] 한 번이면 크롬 설치 창이 뜸 (브라우저 규칙상 한 번은 눌러야 함)
// 카톡 등 앱 안 브라우저에선 설치가 안 되니 바깥 브라우저(크롬)로 바로 넘김. 설치한 앱으로 열면 아무것도 안 함
const Install={
  deferred:null,
  init(){
    const el=$('inst'); if(!el)return;
    if(matchMedia('(display-mode: standalone)').matches||navigator.standalone===true)return;
    const ua=navigator.userAgent, ios=/iPhone|iPad|iPod/i.test(ua), android=/Android/i.test(ua);
    addEventListener('beforeinstallprompt',e=>{e.preventDefault();this.deferred=e;this.how('')});
    addEventListener('appinstalled',()=>this.installed());
    $('inst-go').onclick=()=>this.go();
    $('inst-skip').onclick=()=>{try{sessionStorage.setItem('instSkip','1')}catch(_){}el.hidden=true};
    const inApp=/KAKAOTALK|NAVER\(|Line\/|Instagram|FBAN|FBAV|DaumApps|; wv\)/i.test(ua);
    if(inApp||ios)$('inst-note').hidden=true; // 플레이 프로텍트 안내는 안드로이드 크롬 설치 때만
    if(inApp){
      this.out=()=>{location.href=/KAKAOTALK/i.test(ua)?'kakaotalk://web/openExternal?url='+encodeURIComponent(location.href)
        :android?`intent://${location.host}${location.pathname}${location.search}#Intent;scheme=https;package=com.android.chrome;end`:location.href};
      el.hidden=false; $('inst-h').textContent='크롬에서 열어 주세요';
      $('inst-lead').textContent='카톡 같은 앱 안에서는 설치가 안 돼요. 자동으로 크롬으로 넘어가요. 안 넘어가면 아래 버튼을 눌러 주세요.';
      $('inst-go').textContent='크롬에서 열기'; $('inst-go').onclick=()=>this.out();
      if(ios)this.how('오른쪽 아래 <b>⋯</b> 또는 <b>공유</b> 버튼 → <b>Safari로 열기</b>를 눌러 주세요.');
      setTimeout(()=>this.out(),300);
      return;
    }
    try{if(sessionStorage.getItem('instSkip'))return}catch(_){}
    el.hidden=false;
    // 이미 설치돼 있으면 그렇게 알려줌 (크롬이 알려줄 때만)
    if(navigator.getInstalledRelatedApps)navigator.getInstalledRelatedApps().then(l=>{if(l&&l.length)this.already()}).catch(()=>{});
    // 설치 창을 쓸 수 없는 브라우저(아이폰 등)면 직접 하는 방법을 바로 보여줌
    this.manual=ios?'<b>Safari</b>에서 아래쪽 <b>공유</b> 버튼(□↑)을 누르고<ol><li><b>홈 화면에 추가</b></li><li>오른쪽 위 <b>추가</b></li></ol>'
      :'크롬 오른쪽 위 <b>⋮</b> 메뉴를 누르고<ol><li><b>앱 설치</b> 또는 <b>홈 화면에 추가</b></li><li><b>설치</b></li></ol>';
    if(ios){$('inst-go').hidden=true;this.how(this.manual)}
  },
  how(h){$('inst-how').innerHTML=h;$('inst-how').hidden=!h},
  async go(){
    if(!this.deferred){this.how(this.manual);return}
    const d=this.deferred; this.deferred=null; d.prompt();
    try{const c=await d.userChoice;if(c&&c.outcome==='accepted')this.installed();else this.how('')}catch(_){}
  },
  installed(){
    $('inst-h').textContent='설치됐어요!'; $('inst-lead').textContent='이제 홈 화면의 아빠장부 아이콘을 눌러 여세요.';
    $('inst-go').hidden=true; $('inst-note').hidden=true; this.how(''); $('inst-skip').textContent='이 화면 닫기';
  },
  already(){
    $('inst-h').textContent='이미 설치돼 있어요'; $('inst-lead').textContent='홈 화면의 아빠장부 아이콘을 눌러 여세요.';
    $('inst-go').hidden=true; $('inst-note').hidden=true; this.how(''); $('inst-skip').textContent='여기서 그냥 쓰기';
  },
};
Install.init();

// ---------- 새 버전 받기 ----------
// 새 버전을 올리면 서비스 워커가 받아 둠 → 앱을 막 연 참이면(시작 화면 중·아직 아무것도 안 누름) 바로 새로 열고,
// 쓰는 중이면 위에 [지금 업데이트] 안내 (적던 내용은 임시 저장돼 있어 안전)
const Updater={
  reg:null,lastCheck:0,touched:false,shown:false,reloading:false,
  init(){
    if(!('serviceWorker' in navigator))return;
    const had=!!navigator.serviceWorker.controller; // 처음 설치될 때는 새 버전이 아님
    ['pointerdown','keydown'].forEach(ev=>addEventListener(ev,()=>{this.touched=true},{capture:true,once:true}));
    navigator.serviceWorker.addEventListener('controllerchange',()=>{if(had)this.ready()});
    navigator.serviceWorker.register('./sw.js').then(reg=>{
      this.reg=reg;
      reg.addEventListener('updatefound',()=>{if(had)Splash.hold('새 버전으로 바꾸는 중…')});
      this.check();
    }).catch(()=>{});
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')this.check()});
  },
  // 앱을 열 때와, 다시 화면에 띄울 때 확인 (10분에 한 번까지)
  check(){if(!this.reg||!navigator.onLine||Date.now()-this.lastCheck<600000)return;this.lastCheck=Date.now();this.reg.update().catch(()=>{})},
  ready(){
    if(this.reloading)return;
    if(Splash.open||(!this.touched&&performance.now()<10000)){this.reloading=true;location.reload();return}
    if(!this.shown){this.shown=true;$('updbar').hidden=false}
  },
};
$('upd-go').onclick=()=>{Updater.reloading=true;location.reload()};

// ---------- 휴대폰 저장소 (IndexedDB) ----------
const DB={
  db:null,
  open(){return new Promise((res,rej)=>{
    const r=indexedDB.open('trucklog',1);
    r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains('trips'))r.result.createObjectStore('trips',{keyPath:'id'})};
    r.onsuccess=()=>{this.db=r.result;res()};
    r.onerror=()=>rej(r.error);
  })},
  all(){return new Promise((res,rej)=>{const q=this.db.transaction('trips').objectStore('trips').getAll();q.onsuccess=()=>res(q.result);q.onerror=()=>rej(q.error)})},
  clear(){return new Promise((res,rej)=>{if(!this.db)return res();const tx=this.db.transaction('trips','readwrite');tx.objectStore('trips').clear();tx.oncomplete=()=>res();tx.onerror=()=>rej(tx.error)})},
  putMany(list){return new Promise((res,rej)=>{
    if(!this.db||!list.length)return res();
    const tx=this.db.transaction('trips','readwrite'),st=tx.objectStore('trips');
    list.forEach(t=>st.put(t));tx.oncomplete=()=>res();tx.onerror=()=>rej(tx.error);
  })},
};

// 모든 기록(삭제 표시 포함)은 store, 화면에 쓰는 살아있는 운행은 trips, 지출(kind:'cost')은 costs
// 지출도 같은 저장소·클라우드(trips 컬렉션)에 함께 넣어 동기화·백업을 그대로 씀
const store=new Map();
let trips=[], costs=[];
function rebuild(){const live=[...store.values()].filter(t=>!t.deleted);trips=live.filter(t=>!t.kind||t.kind==='trip');costs=live.filter(t=>t.kind==='cost')}
const STR=['date','client','clientName','clientPhone','from','fromAddr','fromName','fromPhone','to','toAddr','toName','toPhone','payType','memo','kind','cat','src','smsAt','tax','toDate','loadedAt','unloadedAt','gotLog','stops'];
function normalize(r){
  const t={id:String(r.id),createdAt:Number(r.createdAt)||Number(r.updatedAt)||Date.now(),updatedAt:Number(r.updatedAt)||0,deleted:!!r.deleted,
    amount:Math.max(0,Math.round(Number(r.amount)||0)),fee:Math.max(0,Math.round(Number(r.fee)||0)),got:Math.max(0,Math.round(Number(r.got)||0)),paid:r.paid?String(r.paid):null};
  STR.forEach(k=>t[k]=r[k]==null?'':String(r[k]));
  if(!t.payType&&!t.kind)t.payType='인수증';
  if(t.kind==='profile'){const p=r.prof||{};t.prof={};PROF.forEach(k=>t.prof[k]=p[k]==null?'':String(p[k]))}
  return t;
}
// 내 정보(차량 번호·전화·계좌): id 'profile' 기록 하나로 클라우드에 함께 저장해 다른 휴대폰·새 휴대폰에서도 그대로 씀.
// deleted:true로 두는 건 예전 버전 앱이 운행 기록으로 착각해 목록에 띄우지 않게 하려는 것 (지우면 안 됨)
const PROF=['carNo','name','phone','bank','account','holder'];
const getProfile=()=>{const p=store.get('profile');return (p&&p.prof)||{}};
function validRecord(r){return r&&r.id&&typeof r.date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(r.date)}
// 들어온 기록이 더 최근에 고친 것이면 받아들임
function mergeIncoming(r){
  if(!validRecord(r))return null;
  const cur=store.get(String(r.id));
  if(cur&&(cur.updatedAt||0)>=(Number(r.updatedAt)||0))return null;
  const t=normalize(r);store.set(t.id,t);return t;
}
async function saveTrips(list){
  const now=Date.now();
  list.forEach(t=>{t.updatedAt=now;store.set(t.id,t)});
  rebuild();
  ls.set('lastChange',String(now));
  try{await DB.putMany(list);ls.set('lastLocalSave',String(Date.now()));ls.set('localSaveErr','')}
  catch(e){ls.set('localSaveErr',String(Date.now()));toast('휴대폰에 저장하지 못했어요. 저장 공간을 확인해 주세요.')}
  Cloud.pushMany(list);
  renderSettings();
}
const saveTrip=t=>saveTrips([t]);
const removeTrip=t=>{t.deleted=true;return saveTrip(t)};
const restoreTrip=t=>{t.deleted=false;return saveTrip(t)};

// ---------- 화면 상태 ----------
let view='cal', payingId=null, openId=null, deletingId=null;
let calY=TODAY.getFullYear(), calM=TODAY.getMonth(), calSel=todayIso;
let ledY=calY, ledM=calM;
let calLU=ls.get('calLU')||'all'; // 달력: all(전체) · load(상차) · unload(하차)
let ledFilter='all', calFilter='all', ledKind='trip'; // ledKind: 장부에서 운행/지출 중 무엇을 볼지
let editingId=null, backView='ledger';
let ledRange=null; // 장부: 하루·기간을 고르면 {start,end}, 아니면 ledY/ledM 한 달
// 일부만 받기: got=지금까지 받은 금액 합, gotLog='2026-10-12:200000,2026-10-15:100000' (받은 날:금액)
const recv=t=>t.paid?t.amount:Math.min(t.amount,t.got||0);   // 받은 돈
const left=t=>t.paid?0:Math.max(0,t.amount-(t.got||0));       // 남은 받을 돈
// 예정: 아직 운행 전(상차일이 오늘 뒤이고 상차 완료도 안 누름) → 미수와 따로, 회색으로
const isPlan=t=>!t.paid&&t.date>todayIso&&!t.loadedAt;
const pass=(t,f)=>f==='paid'?!!t.paid:f==='due'?!t.paid:f==='notax'?!t.tax:true;
const EMPTY={all:'기록이 없어요.',paid:'받은 돈 기록이 없어요.',due:'못 받은 돈이 없어요.',notax:'계산서 안 낸 건이 없어요.'};
function segHtml(which,list,cur){
  const n={all:list.length,paid:list.filter(t=>t.paid).length,due:list.filter(t=>!t.paid).length,notax:list.filter(t=>!t.tax).length};
  // 장부에는 '계산서 미발행'도 (세금 정리할 때 안 낸 건만 모아 보기)
  return [['all','전체'],['paid','받은 돈'],['due','못 받은 돈'],...(which==='led'?[['notax','미발행']]:[])].map(([k,l])=>
    `<button type="button" data-do="filter" data-which="${which}" data-f="${k}" aria-pressed="${cur===k}">${l} <span class="num">${n[k]}건</span></button>`).join('');
}

function ageLevel(t){const d=daysSince(t.date);return d>=90?'a5':d>=60?'a4':d>=30?'a3':d>=14?'a2':'a1'}
const AGES=[['a1','2주 미만'],['a2','2주~1달'],['a3','1~2달'],['a4','2~3달'],['a5','3달 이상']];
let uAge=null;
function ageChip(t){
  if(t.paid) return `<span class="chip paid">입금 ${md(t.paid)}</span>`;
  const d=daysSince(t.date);
  return `<span class="chip ${ageLevel(t)}">${d<0?'예정':'미수 '+d+'일째'}</span>`;
}
// 상차지 · 하차지 여러 곳: 첫 곳은 from · to 칸 그대로, 더 있는 곳은 stops(글자로 바꾼 목록) [{k:'from'|'to',c:시·군,a:상세주소,n:담당자,p:연락처}]
const stopsOf=t=>{try{const v=JSON.parse(t.stops||'[]');return Array.isArray(v)?v.filter(x=>x&&x.c&&(x.k==='from'||x.k==='to')):[]}catch(_){return []}};
const xStops=(t,k)=>stopsOf(t).filter(x=>x.k===k);
const cities=(t,k)=>[t[k],...xStops(t,k).map(x=>x.c)].filter(Boolean).join('·');
// 목록에서 추가한 곳이 눈에 띄게: 서울 [+안산] → 부산 [+청주]
const placeHtml=(t,k)=>esc(t[k])+xStops(t,k).map(x=>`<i class="xs">+${esc(x.c)}</i>`).join('');
const routeHtml=t=>`${placeHtml(t,'from')} → ${placeHtml(t,'to')}`;
const telHref=p=>'tel:'+p.replace(/\D/g,'');
// 선 아이콘 (그림 문자 대신)
const ic=d=>`<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg>`;
const P={arrow:'M5 12h14M13 6l6 6-6 6',chev:'M6 9l6 6 6-6',check:'M5 12l5 5L20 7',edit:'M4 20h4L19 9l-4-4L4 16z',trash:'M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13',
  nav:'M3 11l18-8-8 18-2-8z',plus:'M12 5v14M5 12h14',doc:'M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h5',
  phone:'M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2'};
const WD='일월화수목금토', wdOf=s=>WD[parseD(s).getDay()];
const mdK=s=>`${Number(s.slice(5,7))}월 ${Number(s.slice(8,10))}일`;
const dayK=s=>`${mdK(s)} (${wdOf(s)})`;
// 상세: 담당자·번호 + [전화][번호 복사]
function ctHtml(p,name){
  const who=name?`<span class="who">${esc(name)}</span>`:'';
  if(!p)return `<div class="ct">${who}<span class="na">연락처 없음</span></div>`;
  return `<div class="ct">${who}<span class="num">${esc(p)}</span></div>`
    +`<div class="ct"><a class="callbtn" href="${telHref(p)}">${ic(P.phone)}전화</a><button type="button" class="cpy" data-copy="${esc(p)}">번호 복사</button></div>`;
}
// 길 안내: 주소를 누르면 휴대폰의 지도·내비 앱으로 (안드로이드는 geo: 주소 → 깔린 앱 중에서 고름, "항상"을 고르면 다음부턴 바로)
const IOS=/iPhone|iPad|iPod/i.test(navigator.userAgent);
const mapHref=q=>IOS?'https://maps.apple.com/?q='+encodeURIComponent(q):'geo:0,0?q='+encodeURIComponent(q);
function addrBlk(label,mk,city,addr,phone,name){
  const q=[city,addr].filter(Boolean).join(' ');
  return `<div class="blk"><span class="bl"><i class="mk ${mk}"></i>${label}</span><a class="addr maplink" href="${mapHref(q)}"><b>${esc(city)}</b>${addr?esc(addr):'<span class="na">상세주소 없음</span>'}</a>`
    +`<div class="ct"><a class="callbtn navbtn" href="${mapHref(q)}">${ic(P.nav)}길 안내</a></div>${ctHtml(phone,name)}</div>`;
}
// 장부를 여러 달에 걸친 기간으로 보면 날짜 옆에 월도 표시
const ledMulti=()=>!!ledRange&&ledRange.start.slice(0,7)!==ledRange.end.slice(0,7);
// 어떤 콜로 받은 운행인지 (등록 화면에서 앱 아이콘처럼 고름) · 화주 옆에 작은 표시
const SRC=[{k:'원콜',ico:'1',cls:'s1',img:'icons/call-one.webp'},{k:'전국24시콜',ico:'24',cls:'s2',img:'icons/call-24.png'},{k:'기타',ico:'…',cls:'s3'}];
// 원콜·전국24시콜은 실제 앱 마크를 작게 붙임
// 설정 '화주 옆 콜 표시': mark(마크만, 기본) · both(마크 + 이름). 기타(마크 없음)는 직접 쓴 이름을 늘 보여줌
let srcMark=ls.get('srcMark')==='both'?'both':'mark';
const srcBadge=t=>{if(!t.src)return '';const s=SRC.find(x=>x.k===t.src)||SRC[2];
  if(s.img&&srcMark==='mark')return `<span class="srcb ${s.cls} only" title="${esc(t.src)}" aria-label="${esc(t.src)}"><i class="bl"><img src="${s.img}" alt=""></i></span>`;
  return `<span class="srcb ${s.cls}">${s.img?`<i class="bl"><img src="${s.img}" alt=""></i>`:''}${esc(t.src)}</span>`};
function setSrcMark(v){srcMark=v==='both'?'both':'mark';ls.set('srcMark',srcMark);document.querySelectorAll('#s-smark [data-smark]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.smark===srcMark))}
// 화주 옆에 늘: 담당자 · 연락처 (번호를 누르면 전화)
const cInfo=t=>t.clientName||t.clientPhone?`<span class="cinfo">${t.clientName?`<span class="cn">${esc(t.clientName)}</span>`:''}${t.clientPhone?`<a class="cp num" href="${telHref(t.clientPhone)}">${ic(P.phone)}${esc(t.clientPhone)}</a>`:''}</span>`:'';
// 계산서 발행 · 정산 문자 보낸 날 (며칠 전에 독촉했는지)
// 진행 상황: 상차 완료 · 하차 완료를 누른 날짜·시간 (예: '2026-10-12 14:30')
const progChip=t=>t.unloadedAt?'<span class="chip done">하차 완료</span>':t.loadedAt?'<span class="chip go">운송 중</span>':'';
const stampTxt=s=>`${md(s)} ${s.slice(11,16)}`;
// 문자 보낸 지 며칠 됐는지 색으로: 오늘 · 1~3일 · 4~7일 · 8일 넘음 (오래될수록 다시 연락할 때)
const smsChip=s=>{const d=daysSince(s),c=d<=0?'s0':d<=3?'s1':d<=7?'s2':'s3';return `<span class="chip sms ${c}">문자 ${d<=0?'오늘':d+'일 전'}</span>`};
const docChips=(t,prog=true)=>(prog?progChip(t):'')+(!t.paid&&t.got>0?`<span class="chip part">${short(t.got)}원 받음</span>`:'')+(t.tax?'<span class="chip tax">계산서</span>':'')+(t.smsAt&&!t.paid?smsChip(t.smsAt):'');
// mode: unpaid(받을 돈) · ledger(달력의 하루 목록) · month(장부: 날짜를 왼쪽에 둔 한 줄)
function rowHtml(t,mode,role){ // role: 달력에서 그날 상차(load) · 하차(unload) · 같은 날 둘 다(both)
  const open=openId===t.id;
  const client=t.client?`<span class="client tap" data-do="client" data-c="${esc(t.client)}" role="button" title="${esc(t.client)} 한눈에 보기">${esc(t.client)}</span>`:'<span class="client none">화주 미입력</span>';
  const part=!t.paid&&t.got>0;
  const amt=part?`<b class="amt num c-due">${comma(left(t))}<small class="of">남은 돈 · 전체 ${short(t.amount)}원</small></b>`:`<b class="amt num ${t.paid?'c-paid':'c-due'}">${comma(t.amount)}</b>`;
  const attrs=`data-do="open" data-id="${t.id}" role="button" tabindex="0" aria-expanded="${open}"`;
  const head=mode==='month'
    ?`<div class="head mini" ${attrs}><span class="dt">${ledMulti()?`<small class="mon num">${Number(t.date.slice(5,7))}월</small>`:''}<b class="num">${Number(t.date.slice(8,10))}</b><small>${wdOf(t.date)}</small></span><span class="cwrap">${srcBadge(t)}${client}</span>${amt}${cInfo(t)}
      <span class="rt2">${routeHtml(t)}${t.memo?` · <span class="memo">${esc(t.memo)}</span>`:''}</span><span class="st ${t.paid?'c-paid':'c-due'}">${t.paid?'받음':'미수'}${t.tax?'<small class="taxm">계산서</small>':''}</span></div>`
    :`<div class="head" ${attrs}><span class="cwrap">${srcBadge(t)}${client}</span>${amt}${cInfo(t)}
      <div class="route"><span class="rt">${placeHtml(t,'from')}${ic(P.arrow)}${placeHtml(t,'to')}</span>${t.memo&&!open?`<span class="memo">${esc(t.memo)}</span>`:''}</div>
      <div class="meta"><span class="num">${md(t.date)}${t.toDate&&t.toDate!==t.date?'→'+md(t.toDate):''}</span><span class="ptx">${esc(t.payType||'인수증')}</span>${ageChip(t)}<span class="end"><span class="more">${open?'접기':'상세'}${ic(P.chev)}</span></span>${(d=>d?`<span class="docs">${d}</span>`:'')(docChips(t,!(role||open)))}</div></div>`;
  let detail='';
  if(open){
    detail=`<div class="detail"><div class="blk"><span class="bl">화주</span><div class="addr">${t.client?`<b>${esc(t.client)}</b>`:'<span class="na">화주 미입력</span>'}</div>${ctHtml(t.clientPhone,t.clientName)}</div>`
      +addrBlk('상차'+(xStops(t,'from').length?' 1':'')+' · '+dayK(t.date),'from',t.from,t.fromAddr,t.fromPhone,t.fromName)
      +xStops(t,'from').map((x,i)=>addrBlk(`상차 ${i+2}`,'from',x.c,x.a,x.p,x.n)).join('')
      +addrBlk('하차'+(xStops(t,'to').length?' 1':'')+' · '+dayK(t.toDate||t.date),'to',t.to,t.toAddr,t.toPhone,t.toName)
      +xStops(t,'to').map((x,i)=>addrBlk(`하차 ${i+2}`,'to',x.c,x.a,x.p,x.n)).join('')
      +(t.gotLog?`<div class="blk"><span class="bl">받은 기록</span><div class="num">${t.gotLog.split(',').filter(Boolean).map(x=>{const[d,a]=x.split(':');return md(d)+' '+won(Number(a))}).join(' · ')}${t.paid?'':`<br><b class="c-due">남은 돈 ${won(left(t))}</b>`}</div></div>`:'')
      +`<div class="blk money"><span class="bl">운임 · ${esc(t.payType||'인수증')}</span><span class="bl">수수료</span><b class="num">${won(t.amount)}</b><span class="num">${t.fee?won(t.fee):'없음'}</span></div>`
      +(mode==='month'?`<div class="blk"><span class="bl">상태</span><div>${dayK(t.date)} 상차 · ${ageChip(t)}</div></div>`:'')
      +(t.tax||t.smsAt?`<div class="blk"><span class="bl">정산</span><div>${t.tax?`계산서 발행 ${md(t.tax)}`:'계산서 미발행'}${t.smsAt?` · 문자 보낸 날 ${md(t.smsAt)}`:''}</div></div>`:'')
      +(t.memo?`<div class="blk"><span class="bl">메모</span><div>${esc(t.memo)}</div></div>`:'')+`</div>`;
  }
  const B=(cls,act,label,icon)=>`<button type="button" class="btn ${cls}" data-do="${act}" data-id="${t.id}">${icon?ic(icon):''}${label}</button>`;
  let act='';
  if(payingId===t.id){
    act=`<div class="act"><div class="paybox"><label for="pd-${t.id}">언제 받으셨어요?</label><input type="date" id="pd-${t.id}" value="${todayIso}">`
      +`<label for="pa-${t.id}">얼마 받으셨어요?<small> 남은 돈 ${won(left(t))}</small></label><div class="amtbox"><input type="text" id="pa-${t.id}" class="num payamt" inputmode="numeric" value="${comma(left(t))}"><span>원</span></div>`
      +`<p class="hint small">덜 받았으면 받은 만큼만 적으세요. 남은 돈은 계속 받을 돈으로 남아요.</p>`
      +`<div class="r1">${B('','paycfm','입금 확인',P.check)}<button type="button" class="btn ghost" data-do="paycancel">취소</button></div></div></div>`;
  } else {
    const main=t.paid?`<div class="r1 one">${B('ghost','unpay','미수로 되돌리기')}</div>`:t.got>0?`<div class="r1">${B('','pay','남은 돈 받기',P.check)}${B('ghost','sms','정산 문자')}</div><div class="undo1">${B('linkish','unpay','↺ 마지막에 받은 돈 취소')}</div>`
      :`<div class="r1">${B('','pay','입금 완료',P.check)}${B('ghost','sms','정산 문자')}</div>`;
    const sub=deletingId===t.id?`<div class="r2">${B('danger','delcfm','정말 삭제')}<button type="button" class="btn ghost" data-do="delcancel">취소</button></div>`
      :`<div class="r2 three">${B('ghost','goso','고소장',P.doc)}${B('ghost','edit','수정',P.edit)}${B('ghost warn','del','삭제',P.trash)}</div>`;
    if(mode==='unpaid')act=`<div class="act">${main}${open?sub:''}</div>`;
    else if(open)act=`<div class="act">${main}${sub}</div>`;
  }
  // 상차 완료 · 하차 완료: 달력에선 늘, 다른 곳에선 펼쳤을 때
  // 하차 완료는 상차 완료를 누른 뒤에만 누를 수 있음
  const PB=(k,n,l,v,wait)=>`<button type="button" class="pbtn${v?' done':''}${wait?' wait':''}" data-do="lu" data-k="${k}" data-id="${t.id}"${wait?' aria-disabled="true"':''} aria-label="${l} ${v?'완료 취소':'완료'}"><span class="no">${v?ic(P.check):n}</span><b>${l}</b>${v?`<small class="num">${stampTxt(v)}</small>`:`<small>${wait?'상차 끝나고':'눌러서 완료'}</small>`}</button>`;
  const prog=role||open?`<div class="prog">${PB('load',1,`${esc(cities(t,'from'))} 상차`,t.loadedAt)}<i class="pline${t.loadedAt?' on':''}"></i>${PB('unload',2,`${esc(cities(t,'to'))} 하차`,t.unloadedAt,!t.loadedAt)}</div>`:'';
  return `<div class="row${isPlan(t)?' plan':''}${open?' open':''}${sel.has(t.id)?' checked':''}" data-id="${t.id}"><span class="ck" aria-hidden="true"></span>${head}${detail}${prog}${act}</div>`;
}

// ---------- 받을 돈 ----------
const hay=t=>[t.src,t.from,t.fromAddr,t.to,t.toAddr,...stopsOf(t).flatMap(x=>[x.c,x.a,x.n,x.p]),t.client,t.payType,t.memo,t.clientPhone,t.fromPhone,t.toPhone,t.clientName,t.fromName,t.toName].join(' ').toLowerCase();

// ---------- 찾기: 어디서 찾을지 (자동 · 전체 · 화주 · 지역 · 주소 · 메모) ----------
const SF={client:['client','clientName','clientPhone'],src:['src'],region:['from','to'],addr:['fromAddr','toAddr','fromName','toName'],memo:['memo'],
  phone:['clientPhone','fromPhone','toPhone']};
const SL={auto:'자동',all:'전체',client:'화주',src:'콜',region:'지역',addr:'주소',memo:'메모',phone:'전화번호'};
const SPH={auto:'화주, 지역, 주소, 메모로 찾기',all:'화주, 지역, 주소, 메모로 찾기',client:'화주 이름·담당자·번호로 찾기',src:'콜 이름으로 찾기 (예: 원콜)',
  region:'상차지·하차지 (예: 평택)',addr:'상세주소·현장 담당자로 찾기',memo:'메모 내용으로 찾기'};
const sNorm=s=>String(s||'').toLowerCase().replace(/\s+/g,''); // 띄어쓰기 무시 ("대한 물류" = "대한물류")
const sDigits=s=>String(s||'').replace(/\D/g,'');
// 자동: 적은 말을 실제 기록과 맞춰 보고 무엇을 찾는지 판단
// 숫자만이면 전화번호 · 그 밖엔 이름이 딱 맞음(100점) > 앞부분이 맞음(10점) > 중간에 들어 있음(1점)을 모두 더해 가장 높은 쪽
function guessScope(list,raw){
  const d=sDigits(raw);
  if(d.length>=3&&d.length===raw.replace(/[\s-]/g,'').length)return 'phone';
  const q=sNorm(raw); let best=null;
  ['client','src','region','addr','memo'].forEach(g=>{
    let score=0;
    list.forEach(t=>SF[g].forEach(k=>{const v=sNorm(t[k]);if(!v)return;score+=v===q?100:v.startsWith(q)?10:v.includes(q)?1:0}));
    if(score&&(!best||score>best.score))best={g,score};
  });
  return best?best.g:'all';
}
function searchHit(t,used,raw){
  const q=sNorm(raw), d=sDigits(raw);
  const phoneHit=()=>d.length>=3&&SF.phone.some(k=>sDigits(t[k]).includes(d));
  if(used==='phone')return phoneHit();
  if(used==='all')return sNorm(hay(t)).includes(q)||phoneHit();
  return SF[used].some(k=>sNorm(t[k]).includes(q));
}
// 결과 + 아래 안내 한 줄 ("자동으로 화주에서 찾았어요 · 3건")
function runSearch(list,raw,scope,hintEl){
  raw=raw.trim();
  if(!raw){hintEl.hidden=true;return list}
  const used=scope==='auto'?guessScope(list,raw):scope, out=list.filter(t=>searchHit(t,used,raw));
  hintEl.hidden=false;
  hintEl.textContent=(scope==='auto'?(used==='all'?'자동: 딱 맞는 곳이 없어 전체에서 찾았어요':`자동: ${SL[used]}에서 찾았어요`):`${SL[used]}에서 찾았어요`)+` · ${out.length}건`;
  return out;
}
const scopeOf=id=>$(id).value||'auto';
function initScope(id,inputId,key,onChange){
  const sel=$(id); sel.value=ls.get(key)||'auto'; if(!sel.value)sel.value='auto';
  const ph=()=>{$(inputId).placeholder=SPH[sel.value]||SPH.auto};ph();
  sel.addEventListener('change',()=>{ls.set(key,sel.value);ph();onChange()});
}
let uRange=null, uPanel=false; // 받을 돈 기간 (null=전체) · uPanel은 예전 기간 패널용(지금은 늘 false)
const rangeTxt=r=>r.start===r.end?md(r.start):`${md(r.start)} ~ ${md(r.end)}`;
function renderUnpaid(){
  document.querySelectorAll('#u-view [data-uview]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.uview===uView));
  const calMode=uView==='cal';
  // 달력으로 볼 땐 달력이 고르는 도구라 찾기 · 기간 · 미수 기간 · 순서는 숨김
  ['u-searchbox','u-age','u-sortrow','u-rangebtn'].forEach(id=>$(id).hidden=calMode); $('u-calbox').hidden=!calMode;
  if(calMode){$('u-shint').hidden=true;renderUnpaidCal();return}
  const q=$('u-search').value.trim();
  const allDue=trips.filter(t=>!t.paid&&!isPlan(t));
  const found=runSearch(trips.filter(t=>!t.paid).filter(t=>!uRange||(t.date>=uRange.start&&t.date<=uRange.end)),q,scopeOf('u-scope'),$('u-shint'));
  const base=found.filter(t=>!isPlan(t)), plans=found.filter(isPlan).sort(byOld); // 예정은 아래에 따로
  const cnt={};base.forEach(t=>{const a=ageLevel(t);cnt[a]=(cnt[a]||0)+1});
  if(uAge&&!cnt[uAge])uAge=null;
  if(uLate)uAge=null;
  const nLate=uLate?base.filter(t=>daysSince(t.date)>=uLate).length:0;
  $('u-age').classList.toggle('picking',!!(uAge||uLate));
  $('u-age').innerHTML=(uLate?`<button type="button" class="chip a4" data-ulate aria-pressed="true">${uLate}일 넘음 ${nLate} ✕</button>`:'')
    +`<button type="button" class="chip all" data-age="" aria-pressed="${!uAge&&!uLate}">전체 ${base.length}</button>`+
    AGES.map(([k,l])=>`<button type="button" class="chip ${k}" data-age="${k}" aria-pressed="${uAge===k}" ${cnt[k]?'':'disabled'}>${l} ${cnt[k]||0}</button>`).join('');
  const list=base.filter(t=>(!uAge||ageLevel(t)===uAge)&&(!uLate||daysSince(t.date)>=uLate)).sort(uSort==='new'?byNew:byOld);
  document.querySelectorAll('#u-sort [data-usort]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.usort===uSort));
  const total=list.reduce((s,t)=>s+left(t),0), filtered=!!(q||uRange||uAge||uLate);
  $('u-total').textContent=won(total);
  const ageTxt=uLate?` · ${uLate}일 넘은 것`:uAge?` · ${AGES.find(a=>a[0]===uAge)[1]}`:'';
  $('u-label').textContent=`아직 못 받은 돈 (${uRange?rLabel(uRange):'전체 기간'}${ageTxt}${q?` · "${$('u-search').value.trim()}"`:''})`;
  const late=list.filter(t=>daysSince(t.date)>=30).length;
  const planSum=plans.reduce((s,t)=>s+left(t),0);
  $('u-sub').textContent=`${list.length}건`+(late?` · 30일 넘은 건 ${late}건`:'')+(filtered?` · 전체 미수 ${won(allDue.reduce((s,t)=>s+left(t),0))}`:'')+(plans.length&&!uAge&&!uLate?` · 예정 ${plans.length}건 ${short(planSum)}원`:'');
  $('u-rangetxt').textContent=uRange?rLabel(uRange):'전체 기간';
  $('u-rangebtn').classList.toggle('on',!!uRange);
  const planHtml=plans.length&&!uAge&&!uLate?`<div class="lsec plan"><i class="mk from"></i><b>예정</b><span class="num">${plans.length}건 · ${short(planSum)}원</span><small>아직 운행 전</small></div>`+plans.map(t=>rowHtml(t,'unpaid')).join(''):'';
  $('u-list').innerHTML=(list.length?list.map(t=>rowHtml(t,'unpaid')).join(''):`<div class="empty">${filtered?'조건에 맞는 못 받은 돈이 없어요.':'못 받은 돈이 없어요.'}</div>`)+planHtml;
}
// 받을 돈: 순서(오래된 것 위로 · 최근 것 위로)
let uSort=ls.get('uSort')==='new'?'new':'old';
// 받을 돈 [목록 | 달력]: 달력은 안 받은 날만 금액이 뜨고 누를 수 있음 · 화살표는 미수 있는 달로만
let uView=ls.get('uView')==='cal'?'cal':'list', ucY=null, ucM=null, uDay=null;
function renderUnpaidCal(){
  const due=trips.filter(t=>left(t)>0), real=due.filter(t=>!isPlan(t));
  const months=[...new Set(due.map(t=>t.date.slice(0,7)))].sort();
  if(ucY===null||!months.includes(`${ucY}-${pad(ucM+1)}`)){ // 처음엔 이번 달, 이번 달에 없으면 가장 최근 미수 달
    const cur=todayIso.slice(0,7), pick=months.includes(cur)?cur:months[months.length-1]||cur;
    ucY=+pick.slice(0,4); ucM=+pick.slice(5,7)-1;
  }
  const pfx=`${ucY}-${pad(ucM+1)}`, mine=due.filter(t=>t.date.startsWith(pfx)), i=months.indexOf(pfx);
  if(uDay&&!uDay.startsWith(pfx))uDay=null;
  $('uc-prev').disabled=i<=0; $('uc-next').disabled=i<0||i>=months.length-1;
  $('uc-title').textContent=`${ucY}년 ${ucM+1}월`;
  const first=new Date(ucY,ucM,1).getDay(), days=new Date(ucY,ucM+1,0).getDate();
  let h=''; for(let k=0;k<first;k++)h+='<div class="day blank"></div>';
  for(let d=1;d<=days;d++){
    const ds=`${pfx}-${pad(d)}`, ts=mine.filter(t=>t.date===ds), wd=(first+d-1)%7, dc=`d num${wd===0?' sun':wd===6?' sat':''}`;
    if(!ts.length){h+=`<div class="day uoff${ds===todayIso?' today':''}"><span class="${dc}">${d}</span></div>`;continue}
    const s=ts.reduce((a,t)=>a+left(t),0), plan=ts.every(isPlan);
    h+=`<button type="button" class="day ${plan?'uplan':'uhas '+ageLevel(ts[0])}${ds===uDay?' upick':''}" data-ucd="${ds}" aria-label="${ucM+1}월 ${d}일 ${ts.length}건 받을 돈 ${comma(s)}원"><span class="${dc}">${d}</span><span class="s num">${short(s)}</span></button>`;
  }
  $('uc-grid').innerHTML=h;
  // 아래 목록: 고른 날이 있으면 그날, 없으면 이 달 전체
  const list=(uDay?mine.filter(t=>t.date===uDay):mine).sort(byOld), total=list.filter(t=>!isPlan(t)).reduce((s,t)=>s+left(t),0);
  $('uc-hint').textContent=uDay?`${dayK(uDay)} · ${list.length}건 · 다시 누르면 이 달 전체`:mine.length?'빨간 날을 누르면 그날 받을 돈만 보여요':'이 달은 받을 돈이 없어요';
  $('u-label').textContent=`아직 못 받은 돈 (${uDay?dayK(uDay):`${ucY}년 ${ucM+1}월`})`;
  $('u-total').textContent=won(total);
  const pl=list.filter(isPlan);
  $('u-sub').textContent=`${list.length-pl.length}건 · 전체 미수 ${won(real.reduce((s,t)=>s+left(t),0))}`+(pl.length?` · 예정 ${pl.length}건 ${short(pl.reduce((s,t)=>s+left(t),0))}원`:'');
  $('u-list').innerHTML=list.length?list.map(t=>rowHtml(t,'unpaid')).join(''):'<div class="empty">받을 돈이 없어요.</div>';
}
$('uc-prev').onclick=()=>ucJump(-1);
$('uc-next').onclick=()=>ucJump(1);
function ucJump(n){const months=[...new Set(trips.filter(t=>left(t)>0).map(t=>t.date.slice(0,7)))].sort(),i=months.indexOf(`${ucY}-${pad(ucM+1)}`),m=months[i+n];if(!m)return;ucY=+m.slice(0,4);ucM=+m.slice(5,7)-1;uDay=null;openId=payingId=null;renderUnpaid()}
// ---------- 달력 ----------
function monthTrips(y,m){const p=`${y}-${pad(m+1)}`;return trips.filter(t=>t.date.startsWith(p))}
function renderBackupBanner(){
  const last=ls.get('lastBackup');
  const need=!Cloud.user&&trips.length>0&&(!last||daysSince(last)>=14);
  $('c-backup').hidden=!need;
  if(need)$('c-backup-txt').textContent=last?`마지막 백업이 ${daysSince(last)}일 전이에요.`:'아직 백업한 적이 없어요.';
}
// 오래 못 받은 돈 알림: 설정에서 끄기 · 14 · 30(기본) · 60 · 90일 넘으면 달력 맨 위에
// ✕를 누르면 그날 하루는 안 띄움 · [보기]는 받을 돈 목록에서 그 건들만
let lateDays=(v=>v==='off'?0:[14,30,60,90].includes(+v)?+v:30)(ls.get('lateAlert'));
let uLate=null; // 받을 돈: 알림에서 들어오면 'N일 넘은 것'만
const lateList=()=>lateDays?trips.filter(t=>left(t)>0&&!isPlan(t)&&daysSince(t.date)>=lateDays):[];
function renderLateBanner(){
  const L=lateList(), show=L.length>0&&ls.get('lateHide')!==todayIso;
  $('c-late').hidden=!show; if(!show)return;
  const sum=L.reduce((s,t)=>s+left(t),0), old=Math.max(...L.map(t=>daysSince(t.date)));
  $('c-late-txt').innerHTML=`<span><b>${lateDays}일 넘게 못 받은 돈</b></span><b class="num">${L.length}건 · ${won(sum)}</b><small>가장 오래된 것 ${old}일째</small>`;
}
function setLate(v){lateDays=v;ls.set('lateAlert',v?String(v):'off');document.querySelectorAll('#s-late [data-late-set]').forEach(b=>b.setAttribute('aria-pressed',String(+b.dataset.lateSet===v)))}
$('c-late-go').onclick=()=>{uView='list';uRange=null;uAge=null;$('u-search').value='';navTab('unpaid');uLate=lateDays;renderUnpaid();window.scrollTo(0,0)};
$('c-late-x').onclick=()=>{ls.set('lateHide',todayIso);renderLateBanner();toast('오늘은 알림을 안 띄울게요. 설정에서 끌 수도 있어요.')};
function renderCal(){
  renderBackupBanner(); renderLateBanner();
  $('c-first').hidden=trips.length>0;
  $('c-titletxt').textContent=`${calY}년 ${calM+1}월`;
  const mt=monthTrips(calY,calM);
  const first=new Date(calY,calM,1).getDay(), days=new Date(calY,calM+1,0).getDate();
  let h='';
  for(let i=0;i<first;i++) h+='<div class="day blank"></div>';
  // [전체 | 상차 | 하차]: 상차는 상차일, 하차는 하차일(없으면 상차일) 기준으로 칸·목록을 보여줌
  const unl=t=>t.toDate||t.date;
  document.querySelectorAll('#c-lu [data-lu]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.lu===calLU));
  for(let d=1;d<=days;d++){
    const ds=`${calY}-${pad(calM+1)}-${pad(d)}`;
    const ts=trips.filter(t=>t.date===ds);
    const nLoad=ts.length, nDrop=trips.filter(t=>unl(t)===ds).length;
    // 다른 날 상차해서 이 날 하차하는 건 (전체 보기에서 작게)
    const later=trips.filter(t=>t.toDate&&t.toDate!==t.date&&t.toDate===ds).length;
    const paidSum=ts.reduce((s,t)=>s+recv(t),0);
    const dueSum=ts.filter(t=>!isPlan(t)).reduce((s,t)=>s+left(t),0), planSum=ts.filter(isPlan).reduce((s,t)=>s+left(t),0);
    const cls=['day',ds===todayIso?'today':'',ds===calSel?'sel':''].join(' ');
    const wd=(first+d-1)%7, wcls=wd===0?' sun':wd===6?' sat':'';
    // 전체: 금액(상차일 기준) · 상차 일정: 상차 건수 · 하차 일정: 하차 건수
    const body=calLU==='load'?(nLoad?`<span class="s cnt num"><i class="mk from"></i>${nLoad}</span>`:'')
      :calLU==='unload'?(nDrop?`<span class="s cnt num"><i class="mk to"></i>${nDrop}</span>`:'')
      :`${paidSum?`<span class="s num c-paid">${short(paidSum)}</span>`:''}${dueSum?`<span class="s num c-due">${short(dueSum)}</span>`:''}${planSum?`<span class="s num c-plan">${short(planSum)}</span>`:''}${later?`<span class="s ul num"><i class="mk to"></i>하차${later}</span>`:''}`;
    h+=`<button type="button" class="${cls}" data-do="day" data-d="${ds}" aria-label="${calM+1}월 ${d}일 상차 ${nLoad}건, 하차 ${nDrop}건, 받은 돈 ${comma(paidSum)}원, 못 받은 돈 ${comma(dueSum)}원"><span class="d num${wcls}">${d}</span>${body}</button>`;
  }
  $('c-grid').innerHTML=h;
  // 고른 날 목록: [상차] 묶음(이 날 상차하는 건) + [하차] 묶음(이 날 하차하는 건). 같은 날 상·하차는 상차 묶음에만
  const loads=calLU==='unload'?[]:trips.filter(t=>t.date===calSel).sort(byOld);
  const drops=calLU==='load'?[]:trips.filter(t=>unl(t)===calSel&&(calLU==='unload'||t.date!==calSel)).sort(byOld);
  const sum=loads.reduce((s,t)=>s+t.amount,0);
  const dcost=costs.filter(c=>c.date===calSel).reduce((s,c)=>s+c.amount,0);
  $('c-daytitle').textContent=dayK(calSel);
  $('c-daysum').textContent=calLU==='all'?([loads.length&&`이 날 상차분 운임 ${short(sum)}원`,dcost&&`지출 ${short(dcost)}원`].filter(Boolean).join(' · ')||'')
    :calLU==='load'?`상차 ${loads.length}건`:`하차 ${drops.length}건`;
  // 받은 돈·못 받은 돈 고르기는 '전체' 보기에서만 (일정 보기에선 헷갈려서 숨김)
  const ts=[...loads,...drops], money=calLU==='all';
  if(!money)calFilter='all';
  $('c-seg').hidden=!money||!ts.length;
  $('c-seg').innerHTML=segHtml('cal',ts,calFilter);
  const sec=(mk,l,list,note)=>{const sh=list.filter(t=>pass(t,calFilter));if(!list.length)return '';
    return `<div class="lsec"><i class="mk ${mk}"></i><b>${l}</b><span class="num">${sh.length}건</span>${note?`<small>${note}</small>`:''}</div>`
      +(sh.length?sh.map(t=>rowHtml(t,'ledger',mk==='from'?'load':'unload')).join(''):`<div class="empty">${EMPTY[calFilter]}</div>`)};
  const none=calLU==='load'?'상차할':calLU==='unload'?'하차할':'상차·하차';
  $('c-list').innerHTML=!ts.length?`<div class="empty">이 날은 ${none} 기록이 없어요.</div>`
    :sec('from','상차',loads,calLU==='all'&&drops.length?'':'')+sec('to','하차',drops,calLU==='all'?'다른 날 상차한 건':'');
}

// ---------- 장부 ----------
const inRange=(x,r)=>x.date>=r.start&&x.date<=r.end;
const ledTrips=()=>ledRange?trips.filter(t=>inRange(t,ledRange)):monthTrips(ledY,ledM);
const ledCosts=()=>ledRange?costs.filter(c=>inRange(c,ledRange)):monthCosts(ledY,ledM);
const ledLabel=()=>!ledRange?`${ledY}년 ${ledM+1}월`:ledRange.start===ledRange.end?dayK(ledRange.start):`${mdK(ledRange.start)} ~ ${mdK(ledRange.end)}`;
let netMode=ls.get('netMode')==='cash'?'cash':'all'; // 장부 순수익을 무엇 기준으로 볼지 (이 휴대폰에 기억)
function renderLedger(){
  $('l-tripgrp').hidden=ledKind!=='trip'; $('l-costgrp').hidden=ledKind!=='cost';
  document.querySelectorAll('#l-kind [data-lkind]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.lkind===ledKind));
  const span=!ledRange?'이 달':ledRange.start===ledRange.end?'이 날':'이 기간';
  $('l-titletxt').textContent=ledLabel();
  $('l-title').classList.toggle('long',!!ledRange&&ledRange.start!==ledRange.end); // 기간은 글자가 길어 조금 작게
  $('l-kicker').textContent=ledRange&&ledRange.start.slice(0,4)!==String(TODAY.getFullYear())?`장부 · ${ledRange.start.slice(0,4)}년`:'장부';
  const all=ledTrips();
  const sum=all.reduce((s,t)=>s+t.amount,0), paid=all.reduce((s,t)=>s+recv(t),0); // 일부 받은 것도 받은 돈에
  $('l-sum').textContent=short(sum); $('l-paid').textContent=short(paid); $('l-due').textContent=short(sum-paid);
  const q=$('l-search').value.trim();
  const found=runSearch(all,q,scopeOf('l-scope'),$('l-shint'));
  $('l-seg').innerHTML=segHtml('led',found,ledFilter);
  const list=found.filter(t=>pass(t,ledFilter)).sort(byNew);
  $('l-list').innerHTML=list.length?list.map(t=>rowHtml(t,'month')).join(''):`<div class="empty">${q?'찾는 기록이 없어요.':span+'은 '+EMPTY[ledFilter]}</div>`;
  // 지출 · 순수익 (순수익 = 총 운임 − 수수료 − 지출)
  const mc=ledCosts(), fees=all.reduce((s,t)=>s+(t.fee||0),0), csum=mc.reduce((s,c)=>s+c.amount,0), net=sum-fees-csum;
  $('l-ntrip').textContent=all.length+'건'; $('l-ncost').textContent=mc.length+'건';
  $('l-netlabel').textContent=span+' 순수익';
  $('l-costlabel').textContent=fees?'수수료·지출':'지출';
  $('l-cost').textContent=short(fees+csum);
  $('l-net').textContent=(net<0?'-':'')+won(Math.abs(net)); $('l-net').className='num '+(net<0?'c-due':'c-paid');
  // 실제로 들어온 돈 기준: 받은 돈 − 받은 건의 수수료 − 지출 (못 받은 돈이 많으면 마이너스일 수 있음)
  const cash=paid-all.filter(t=>t.paid).reduce((s,t)=>s+(t.fee||0),0)-csum;
  $('l-cash').textContent=(cash<0?'-':'')+won(Math.abs(cash)); $('l-cash').className='num '+(cash<0?'c-due':'c-paid');
  // 스위치: 전체(못 받은 돈 포함) ↔ 지금까지 들어온 돈 기준
  const byCash=netMode==='cash';
  $('l-net').hidden=byCash; $('l-cash').hidden=!byCash;
  $('l-netcap').textContent=byCash?'받은 돈 − 받은 건 수수료 − 지출 · 지금까지 실제로 들어온 돈':'운임 − 수수료 − 지출 · 못 받은 돈까지 포함';
  document.querySelectorAll('#l-netsw [data-netmode]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.netmode===netMode));
  $('l-costh').textContent=span+' 지출';
  $('l-costsum').textContent=won(csum);
  $('l-csvtxt').textContent=span+' 장부 엑셀로 보내기';
  const byCat={};mc.forEach(c=>byCat[c.cat||'기타']=(byCat[c.cat||'기타']||0)+c.amount);
  $('l-catsum').innerHTML=Object.entries(byCat).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`<span>${esc(k)} <b class="num">${short(v)}</b></span>`).join('');
  const cshown=[...mc].sort(byNew);
  $('l-costs').innerHTML=cshown.length?cshown.map(costRowHtml).join(''):`<div class="empty">${span}은 적은 지출이 없어요.</div>`;
}
function monthCosts(y,m){const p=`${y}-${pad(m+1)}`;return costs.filter(c=>c.date.startsWith(p))}

// ---------- 날짜 골라서 보기 (달력 · 장부 위쪽 제목을 누르면) ----------
const curYM=()=>TODAY.getFullYear()*12+TODAY.getMonth();
// 달력: 오늘·어제 같은 바로 가기, 달 고르기, 날짜 직접 고르기
let jpY=calY;
function renderJump(){
  $('jp-year').textContent=`${jpY}년`;
  const n=Array(12).fill(0); trips.forEach(t=>{if(t.date.startsWith(jpY+'-'))n[Number(t.date.slice(5,7))-1]++});
  $('jp-months').innerHTML=n.map((c,i)=>{const on=jpY===calY&&i===calM, off=jpY*12+i>curYM()&&!c;
    return `<button type="button" class="mo${on?' on':''}" data-jm="${i}" aria-pressed="${on}"${off?' disabled':''}><b>${i+1}월</b><small>${c?c+'건':'-'}</small></button>`}).join('');
}
function openJump(){jpY=calY;$('jp-date').value=calSel;renderJump();$('calsheet').hidden=false;pushOverlay({jump:true})}
function closeJump(){$('calsheet').hidden=true;popOverlay('jump')}
function calGo(ds){const d=parseD(ds);calY=d.getFullYear();calM=d.getMonth();calSel=ds;calFilter='all';openId=payingId=null}
$('calsheet').addEventListener('click',e=>{
  if(e.target===$('calsheet')||e.target.closest('#jp-close')){closeJump();return}
  if(e.target.closest('#jp-yprev')){jpY--;renderJump();return}
  if(e.target.closest('#jp-ynext')){jpY++;renderJump();return}
  const q=e.target.closest('[data-jq]');
  if(q){const d=new Date(TODAY),k=q.dataset.jq;if(k==='m')d.setMonth(d.getMonth()-1);else d.setDate(d.getDate()-Number(k));calGo(iso(d));closeJump();render();return}
  const m=e.target.closest('[data-jm]');
  if(m){const i=Number(m.dataset.jm);calGo(jpY===TODAY.getFullYear()&&i===TODAY.getMonth()?todayIso:`${jpY}-${pad(i+1)}-01`);closeJump();render();return}
  if(e.target.closest('#jp-go')){const v=$('jp-date').value;if(!v)return;calGo(v);closeJump();render()}
});
// 기간 고르는 창 하나를 장부 · 받을 돈이 같이 씀 (한 달 · 하루 · 기간 직접 + 바로가기)
// pickFor: 'led'(장부: ledY/ledM 또는 ledRange) · 'u'(받을 돈: uRange, null이면 전체 기간)
let pickFor='led', lpMode='month', lpY=ledY, lpCY=ledY, lpCM=ledM, lpDraft={start:null,end:null};
const monthRange=(y,m)=>({start:`${y}-${pad(m+1)}-01`,end:iso(new Date(y,m+1,0))});
const isMonthRange=r=>!!r&&r.start.endsWith('-01')&&r.end===iso(new Date(+r.start.slice(0,4),+r.start.slice(5,7),0));
// 기간 글씨: 한 달이면 '2026년 10월', 하루면 '10월 12일 (월)', 기간이면 '9월 1일 ~ 10월 31일'
const rLabel=r=>isMonthRange(r)?`${+r.start.slice(0,4)}년 ${+r.start.slice(5,7)}월`:r.start===r.end?dayK(r.start):`${mdK(r.start)} ~ ${mdK(r.end)}`;
function openLedPick(target){
  pickFor=target==='u'?'u':'led';
  const cur=pickFor==='u'?uRange:ledRange;
  lpMode=pickFor==='u'?(!cur||isMonthRange(cur)?'month':cur.start===cur.end?'day':'range'):(!cur?'month':cur.start===cur.end?'day':'range');
  const d=cur?parseD(cur.start):pickFor==='u'?new Date(TODAY):new Date(ledY,ledM,1);
  lpY=d.getFullYear(); lpCY=d.getFullYear(); lpCM=d.getMonth();
  lpDraft=cur&&!(pickFor==='u'&&isMonthRange(cur))?{...cur}:{start:null,end:null};
  $('lp-h').textContent=pickFor==='u'?'언제 받을 돈을 볼까요?':'언제 장부를 볼까요?';
  $('lp-all').hidden=pickFor!=='u';
  renderLedPick(); $('ledsheet').hidden=false; pushOverlay({lpick:true});
}
// 고른 기간 적용: 장부는 한 달이면 ledY/ledM, 받을 돈은 늘 uRange
function pickApply(r,ym){
  if(pickFor==='u'){uRange=r||(ym?monthRange(ym[0],ym[1]):null);openId=payingId=null;closeLedPick();renderUnpaid();window.scrollTo(0,0);return}
  if(ym){ledY=ym[0];ledM=ym[1];setLedRange(null)}else setLedRange(r);
}
function closeLedPick(){$('ledsheet').hidden=true;popOverlay('lpick')}
function setLedRange(r){ledRange=r;openId=payingId=deletingId=costOpen=costDel=null;closeLedPick();render();window.scrollTo(0,0)}
function renderLedPick(){
  document.querySelectorAll('#lp-mode [data-lpm]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.lpm===lpMode));
  const month=lpMode==='month';
  $('lp-mbox').hidden=!month; $('lp-cbox').hidden=month;
  if(month){
    $('lp-year').textContent=`${lpY}년`;
    const s=Array(12).fill(0), n=Array(12).fill(0);
    trips.forEach(t=>{if(t.date.startsWith(lpY+'-')&&(pickFor==='led'||left(t)>0)){const i=Number(t.date.slice(5,7))-1;s[i]+=pickFor==='u'?left(t):t.amount;n[i]++}});
    $('lp-months').innerHTML=s.map((v,i)=>{const on=pickFor==='u'?!!uRange&&isMonthRange(uRange)&&uRange.start===monthRange(lpY,i).start:!ledRange&&lpY===ledY&&i===ledM, off=lpY*12+i>curYM()&&!n[i];
      return `<button type="button" class="mo${on?' on':''}" data-lpmon="${i}" aria-pressed="${on}"${off?' disabled':''}><b>${i+1}월</b><small>${n[i]?short(v):'-'}</small></button>`}).join('');
    return;
  }
  const {start,end}=lpDraft, day=lpMode==='day';
  $('lp-range').hidden=day;
  $('lp-s').textContent=start?mdK(start):'날짜를 눌러요'; $('lp-e').textContent=end&&!day?mdK(end):'-';
  $('lp-s').classList.toggle('on',!start); $('lp-e').classList.toggle('on',!!start&&!end);
  $('lp-ctitle').textContent=`${lpCY}년 ${lpCM+1}월`;
  const first=new Date(lpCY,lpCM,1).getDay(), days=new Date(lpCY,lpCM+1,0).getDate();
  let h='';
  for(let i=0;i<first;i++)h+='<div class="rday blank"></div>';
  for(let d=1;d<=days;d++){
    const ds=`${lpCY}-${pad(lpCM+1)}-${pad(d)}`, wd=(first+d-1)%7;
    const c=['rday',wd===0?'sun':wd===6?'sat':'',ds===todayIso?'today':''];
    if(start&&ds===start){c.push('start');if(end&&end!==start)c.push('hasend')}
    if(end&&ds===end)c.push('end');
    if(start&&end&&ds>start&&ds<end)c.push('in');
    h+=`<button type="button" class="${c.join(' ')}" data-lpd="${ds}">${d}</button>`;
  }
  $('lp-grid').innerHTML=h;
  const ok=day?!!start:!!(start&&end);
  $('lp-apply').disabled=!ok;
  $('lp-apply').textContent=day?(start?`${dayK(start)} 보기`:'날짜를 눌러 주세요')
    :!start?'시작일을 눌러 주세요':!end?'끝날을 눌러 주세요':`${mdK(start)} ~ ${mdK(end)} (${Math.round((parseD(end)-parseD(start))/86400000)+1}일) 보기`;
}
$('ledsheet').addEventListener('click',e=>{
  if(e.target===$('ledsheet')||e.target.closest('#lp-close')){closeLedPick();return}
  const m=e.target.closest('[data-lpm]');
  if(m){lpMode=m.dataset.lpm;if(lpMode==='day'&&lpDraft.start)lpDraft.end=lpDraft.start;renderLedPick();return}
  const q=e.target.closest('[data-lpq]');
  if(q){const y=TODAY.getFullYear(),mo=TODAY.getMonth(),k=q.dataset.lpq;
    if(k==='all'){pickApply(null);return}
    if(k==='lastm'){const d=new Date(y,mo-1,1);pickApply(null,[d.getFullYear(),d.getMonth()]);return}
    const s=k==='week'?new Date(y,mo,TODAY.getDate()-(TODAY.getDay()+6)%7):k==='3m'?new Date(y,mo-2,1):new Date(y,0,1);
    pickApply({start:iso(s),end:todayIso});return}
  const mon=e.target.closest('[data-lpmon]');
  if(mon){pickApply(null,[lpY,Number(mon.dataset.lpmon)]);return}
  const d=e.target.closest('[data-lpd]');
  if(d){const v=d.dataset.lpd,r=lpDraft;
    if(lpMode==='day'){r.start=r.end=v}
    else if(!r.start||r.end){r.start=v;r.end=null} else if(v<r.start){r.start=v} else {r.end=v}
    renderLedPick();return}
  if(e.target.closest('#lp-yprev')){lpY--;renderLedPick();return}
  if(e.target.closest('#lp-ynext')){lpY++;renderLedPick();return}
  if(e.target.closest('#lp-cprev')){lpCM--;if(lpCM<0){lpCM=11;lpCY--}renderLedPick();return}
  if(e.target.closest('#lp-cnext')){lpCM++;if(lpCM>11){lpCM=0;lpCY++}renderLedPick();return}
  if(e.target.closest('#lp-apply')){const r=lpDraft;if(!r.start)return;pickApply({start:r.start,end:lpMode==='day'?r.start:(r.end||r.start)})}
});
let costOpen=null, costDel=null;
function costRowHtml(c){
  const open=costOpen===c.id;
  const act=!open?'':`<div class="act"><button type="button" class="btn ghost small" data-do="cedit" data-id="${c.id}">수정</button>`
    +(costDel===c.id?`<button type="button" class="btn danger small" data-do="cdelcfm" data-id="${c.id}">정말 삭제</button><button type="button" class="btn ghost small" data-do="cdelcancel">취소</button>`
      :`<button type="button" class="btn ghost small" data-do="cdel" data-id="${c.id}">삭제</button>`)+`</div>`;
  return `<div class="row crow${open?' open':''}"><div class="chead" data-do="copen" data-id="${c.id}" role="button" tabindex="0" aria-expanded="${open}">`
    +`<span class="cat">${esc(c.cat||'기타')}</span><span class="cmemo">${esc(c.memo)}</span><b class="num camt">${comma(c.amount)}</b><span class="cdate num">${md(c.date)}</span></div>${act}</div>`;
}

// ---------- 등록 ----------
// 최근에 많이 쓴 순: 오래된 기록일수록 점수가 줄어듦 (약 2주마다 절반) · 상차지 · 하차지는 추가한 곳도 함께
function topVals(key){const c={};trips.forEach(t=>{const age=Math.max(0,daysSince(t.date)),w=Math.pow(0.5,age/14);
    [t[key],...(key==='from'||key==='to'?xStops(t,key).map(x=>x.c):[])].forEach(v=>{if(v)c[v]=(c[v]||0)+w})});
  return Object.keys(c).sort((a,b)=>c[b]-c[a]).slice(0,6)}
function renderRecent(){
  const top=topVals;
  [['from','r-from','f-from'],['to','r-to','f-to'],['client','r-client','f-client']].forEach(([k,box,inp])=>{
    $(box).innerHTML=top(k).map(v=>`<button type="button" data-fill="${inp}" data-v="${esc(v)}">${esc(v)}</button>`).join('');
  });
}

// ---------- 설정·백업 ----------
const fmtDT=ms=>{const d=new Date(ms);return `${d.getMonth()+1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`};
// 내 정보: 고치는 중이 아니면 저장된 값으로 채움 (다른 휴대폰에서 바꾼 것도 반영)
let profDirty=false;
const acctText=p=>[p.bank,p.account,p.holder].filter(Boolean).join(' ');
// 적어 둔 게 있으면 한 줄 요약 + [고치기], 없거나 고치는 중이면 입력 칸
let profEdit=false;
function renderProfile(){
  const p=getProfile(), has=!!(p.name||p.carNo||p.account||p.holder||p.phone);
  if(!profDirty)PROF.forEach(k=>$('p-'+k).value=p[k]||'');
  const edit=profEdit||!has;
  $('p-sum').hidden=edit; $('p-card').hidden=!edit; $('p-cancel').hidden=!has;
  $('p-av').textContent=(p.name||p.holder||'나').trim().slice(0,1);
  $('p-n').textContent=p.name||p.holder||'이름 없음'; $('p-car').textContent=p.carNo||'';
  $('p-acct').textContent=acctText(p)||'입금 계좌를 적어 두세요';
  $('p-copy').hidden=!p.account;
}
$('p-edit').onclick=()=>{profEdit=true;$('p-msg').textContent='';renderProfile();$('p-carNo').focus()};
$('p-cancel').onclick=()=>{profEdit=false;profDirty=false;renderProfile()};
['input','change'].forEach(ev=>$('p-form').addEventListener(ev,()=>{profDirty=true;$('p-msg').textContent=''}));
$('p-account').addEventListener('input',e=>{e.target.value=e.target.value.replace(/[^\d-]/g,'')});
$('p-form').addEventListener('submit',e=>{
  e.preventDefault();
  document.activeElement&&document.activeElement.blur(); // 키보드 닫기 (먼저 해야 아래 안내가 지워지지 않음)
  const prof={};PROF.forEach(k=>prof[k]=$('p-'+k).value.trim());
  const cur=store.get('profile');
  const rec=cur||normalize({id:'profile',createdAt:Date.now(),date:'2000-01-01',kind:'profile'});
  rec.deleted=true; rec.prof=prof; // deleted:true 이유는 PROF 위 설명 참고
  saveTrip(rec); profDirty=false; profEdit=false; renderProfile();
  toast('내 정보를 저장했어요.');
});
$('p-copy').onclick=()=>{const v=acctText(getProfile());
  try{navigator.clipboard.writeText(v).then(()=>toast(`${v} 복사했어요`),()=>toast('복사가 안 됐어요. 계좌번호를 길게 눌러 복사해 주세요'))}
  catch(_){toast('복사가 안 됐어요. 계좌번호를 길게 눌러 복사해 주세요')}};
function renderSettings(){
  if(!$('s-cloud'))return;
  renderProfile();
  let h='';
  if(!Cloud.configured){
    h=`<p class="hint">클라우드 저장이 아직 연결되지 않았어요. 지금은 이 휴대폰에만 저장됩니다.<br>연결 방법은 설치 안내서의 "클라우드 저장 켜기"를 보세요.</p>`;
  } else if(Cloud.loadErr){
    h=`<p class="hint">클라우드에 연결하지 못했어요. 인터넷 연결을 확인한 뒤 앱을 다시 열어 주세요. 기록은 이 휴대폰에 안전하게 저장되고 있어요.</p>`;
  } else if(!Cloud.ready){
    h=`<p class="hint">클라우드 연결을 준비하고 있어요…</p>`;
  } else if(!Cloud.user){
    h=`<p class="hint">구글 계정으로 로그인하면 기록이 클라우드에도 함께 저장돼요. 휴대폰을 바꾸거나 잃어버려도 기록이 남고, 같은 계정으로 다른 휴대폰에서도 볼 수 있어요.</p>
       <button type="button" class="btn" id="s-login">구글로 로그인해서 클라우드에도 저장</button>`;
  } else {
    const st=!navigator.onLine?'인터넷 연결을 기다리는 중 (연결되면 자동으로 올라가요)':Cloud.fullBusy?'클라우드 전체 기록과 맞추는 중…':Cloud.pending?'클라우드에 올리는 중…':Cloud.lastSync?`클라우드와 맞춤 · ${fmtDT(Cloud.lastSync)}`:'클라우드와 맞추는 중…';
    h=`<p class="okline"><span class="dot-ok"></span><b>${esc(Cloud.user.email||Cloud.user.displayName||'구글 계정')}</b></p>
       <p class="hint">${esc(st)}</p>
       <div class="btnrow"><button type="button" class="btn ghost" id="s-resync"${Cloud.fullBusy?' disabled':''}>전체 다시 맞추기</button><button type="button" class="btn ghost" id="s-logout">로그아웃</button></div>
       <p class="hint small">평소에는 바뀐 기록만 주고받아요. 다른 휴대폰에서 고친 게 안 보이면 [전체 다시 맞추기]를 눌러 주세요.</p>
       <p class="hint small">로그아웃해도 이 휴대폰의 기록은 지워지지 않아요.</p>`;
  }
  if(Cloud.lastErr)h+=`<p class="errline">${esc(Cloud.lastErr)}</p>`;
  $('s-cloud').innerHTML=h;
  const lb=ls.get('lastBackup');
  $('s-lastbk').textContent=lb?`마지막 백업: ${md(lb)} (${daysSince(lb)}일 전)`:'아직 백업 파일을 만든 적이 없어요.';
  const due=trips.filter(t=>!t.paid);
  const dates=trips.map(t=>t.date).sort();
  $('s-stats').innerHTML=trips.length
    ?`운행 기록 <b class="num">${comma(trips.length)}건</b> (${md(dates[0])}/${dates[0].slice(2,4)} ~ ${md(dates[dates.length-1])}/${dates[dates.length-1].slice(2,4)})<br>못 받은 돈 <b class="num c-due">${comma(due.length)}건 · ${won(due.reduce((s,t)=>s+left(t),0))}</b>`
    :'아직 운행 기록이 없어요.';
  if(costs.length)$('s-stats').innerHTML+=`<br>지출 기록 <b class="num">${comma(costs.length)}건</b>`;
  // 자동 저장 현황: 기록을 저장·수정·삭제할 때마다 휴대폰과 클라우드에 바로 저장됨
  const n=k=>Number(ls.get(k))||0, lLocal=n('lastLocalSave'), lErr=n('localSaveErr'), lCloud=n('lastCloudSave')||Cloud.lastSync||0;
  const ok=(t,s)=>`<span class="c-paid">✓</span> <b>${t}</b> ${s}`, bad=(t,s)=>`<span class="c-due">!</span> <b>${t}</b> ${s}`;
  const phone=lErr>lLocal?bad('휴대폰','저장에 실패했어요. 저장 공간을 확인해 주세요.')
    :ok('휴대폰','저장됨'+(lLocal?` · ${fmtDT(lLocal)}`:''));
  const cloud=!Cloud.configured||!Cloud.user?`<b>클라우드</b> 꺼짐 (로그인하면 함께 저장돼요)`
    :!navigator.onLine?bad('클라우드',`인터넷 연결을 기다리는 중${Cloud.inflight?` · ${Cloud.inflight}건 대기`:''} (연결되면 자동으로 올라가요)`)
    :Cloud.inflight||Cloud.pending?`<b>클라우드</b> 올리는 중…${Cloud.inflight?` (${Cloud.inflight}건)`:''}`
    :Cloud.lastSync?ok('클라우드','모두 올라감'+(lCloud?` · ${fmtDT(lCloud)}`:'')):`<b>클라우드</b> 맞추는 중…`;
  $('s-stats').innerHTML+=`<span class="autosave">자동 저장<br>${phone}<br>${cloud}</span>`;
}

// 파일 내보내기: 가능하면 공유(카톡·드라이브), 아니면 다운로드
async function giveFile(text,name,type,share){
  const blob=text instanceof Blob?text:new Blob([text],{type});
  if(share&&navigator.canShare){
    for(const t of [type,type.startsWith('text/')?'text/plain':'application/octet-stream']){
      try{const f=new File([blob],name,{type:t});
        if(navigator.canShare({files:[f]})){await navigator.share({files:[f],title:name});return 'shared'}}
      catch(e){if(e&&e.name==='AbortError')return 'cancel'}
    }
  }
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;
  document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},2000);
  return 'downloaded';
}
function backupText(){
  return JSON.stringify({app:'운행장부',format:1,exportedAt:new Date().toISOString(),trips:[...store.values()]},null,1);
}
async function doBackup(share){
  if(!store.size){toast('아직 백업할 기록이 없어요.');return}
  const r=await giveFile(backupText(),`아빠장부_백업_${todayIso}.json`,'application/json',share);
  if(r==='cancel')return;
  ls.set('lastBackup',todayIso);
  toast(r==='shared'?'백업 파일을 보냈어요':'백업 파일을 휴대폰 "다운로드" 폴더에 저장했어요');
  render();
}
// ---------- 엑셀 파일(.xlsx) 만들기 ----------
// 다른 프로그램 없이 앱 안에서 진짜 엑셀 파일을 만듦 (인터넷 없어도 됨)
// 시트: 요약 · 운행 · 지출 / 칸 너비 · 제목 줄 고정과 색 · 금액 쉼표 · 입금 상태 색 · 합계 줄
const XL={
  // 꾸밈 번호: 0 기본 · 1 제목 줄 · 2 금액 · 3 빨강(못 받음) · 4 초록(받음) · 5 합계 글씨 · 6 합계 금액 · 7 가운데(날짜) · 8 큰 제목 · 9 주황(일부 받음)
  styles:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
    +'<numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0"/></numFmts>'
    +'<fonts count="6"><font><sz val="11"/><name val="맑은 고딕"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="맑은 고딕"/></font>'
    +'<font><b/><sz val="11"/><color rgb="FFB3261E"/><name val="맑은 고딕"/></font><font><b/><sz val="11"/><color rgb="FF2F7A3C"/><name val="맑은 고딕"/></font>'
    +'<font><b/><sz val="11"/><name val="맑은 고딕"/></font><font><b/><sz val="15"/><color rgb="FF1F5E4A"/><name val="맑은 고딕"/></font></fonts>'
    +'<fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>'
    +'<fill><patternFill patternType="solid"><fgColor rgb="FF1F5E4A"/><bgColor indexed="64"/></patternFill></fill>'
    +'<fill><patternFill patternType="solid"><fgColor rgb="FFE1ECE6"/><bgColor indexed="64"/></patternFill></fill></fills>'
    +'<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border>'
    +'<border><left style="thin"><color rgb="FFD5DAD3"/></left><right style="thin"><color rgb="FFD5DAD3"/></right><top style="thin"><color rgb="FFD5DAD3"/></top><bottom style="thin"><color rgb="FFD5DAD3"/></bottom><diagonal/></border></borders>'
    +'<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="10">'
    +'<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>'
    +'<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>'
    +'<xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>'
    +'<xf numFmtId="0" fontId="2" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>'
    +'<xf numFmtId="0" fontId="3" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>'
    +'<xf numFmtId="0" fontId="4" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>'
    +'<xf numFmtId="164" fontId="4" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>'
    +'<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>'
    +'<xf numFmtId="0" fontId="5" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="center"/></xf>'
    +'<xf numFmtId="0" fontId="4" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>'
    +'</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>',
  esc:s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g,''),
  col:n=>{let s='';n++;while(n){const m=(n-1)%26;s=String.fromCharCode(65+m)+s;n=Math.floor((n-1)/26)}return s},
  // rows: 칸 = 값 또는 {v:값, s:꾸밈 번호}. 숫자는 숫자 칸, 나머지는 글자 칸
  sheet(rows,o){
    const W=o.widths||[], hdr=o.header!==false;
    const cols=W.length?'<cols>'+W.map((w,i)=>`<col min="${i+1}" max="${i+1}" width="${w}" customWidth="1"/>`).join('')+'</cols>':'';
    const view=hdr?'<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>':'<sheetViews><sheetView workbookViewId="0" showGridLines="0"/></sheetViews>';
    const body=rows.map((r,ri)=>`<row r="${ri+1}"${hdr&&ri===0?' ht="30" customHeight="1"':''}>`+r.map((c,ci)=>{
      const cell=c&&typeof c==='object'?c:{v:c}, v=cell.v, s=cell.s!=null?cell.s:(hdr&&ri===0?1:typeof v==='number'?2:0), ref=XL.col(ci)+(ri+1);
      if(v===''||v==null)return `<c r="${ref}" s="${s}"/>`;
      return typeof v==='number'?`<c r="${ref}" s="${s}"><v>${v}</v></c>`:`<c r="${ref}" s="${s}" t="inlineStr"><is><t xml:space="preserve">${XL.esc(v)}</t></is></c>`;
    }).join('')+'</row>').join('');
    const filt=hdr&&o.filterRows?`<autoFilter ref="A1:${XL.col(rows[0].length-1)}${o.filterRows}"/>`:'';
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
      +view+'<sheetFormatPr defaultRowHeight="20"/>'+cols+'<sheetData>'+body+'</sheetData>'+filt+'</worksheet>';
  },
  book(sheets){ // sheets: [{name, xml}] → xlsx 파일 조각들
    const N='http://schemas.openxmlformats.org', H='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
    const f={
      '[Content_Types].xml':H+`<Types xmlns="${N}/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>`
        +sheets.map((s,i)=>`<Override PartName="/xl/worksheets/sheet${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')+'</Types>',
      '_rels/.rels':H+`<Relationships xmlns="${N}/package/2006/relationships"><Relationship Id="rId1" Type="${N}/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
      'xl/workbook.xml':H+`<workbook xmlns="${N}/spreadsheetml/2006/main" xmlns:r="${N}/officeDocument/2006/relationships"><sheets>`+sheets.map((s,i)=>`<sheet name="${XL.esc(s.name)}" sheetId="${i+1}" r:id="rId${i+1}"/>`).join('')+'</sheets></workbook>',
      'xl/_rels/workbook.xml.rels':H+`<Relationships xmlns="${N}/package/2006/relationships">`+sheets.map((s,i)=>`<Relationship Id="rId${i+1}" Type="${N}/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i+1}.xml"/>`).join('')
        +`<Relationship Id="rId${sheets.length+1}" Type="${N}/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
      'xl/styles.xml':XL.styles,
    };
    sheets.forEach((s,i)=>f[`xl/worksheets/sheet${i+1}.xml`]=s.xml);
    return XL.zip(f);
  },
  // 압축 없이 묶는 zip (엑셀이 그대로 열 수 있음)
  crcT:null,
  crc(b){if(!XL.crcT){XL.crcT=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;XL.crcT[n]=c>>>0}}
    let c=0xFFFFFFFF;for(let i=0;i<b.length;i++)c=XL.crcT[(c^b[i])&255]^(c>>>8);return (c^0xFFFFFFFF)>>>0},
  zip(files){
    const te=new TextEncoder(), parts=[], cen=[]; let off=0;
    const u16=n=>[n&255,(n>>>8)&255], u32=n=>[n&255,(n>>>8)&255,(n>>>16)&255,(n>>>24)&255];
    for(const [name,text] of Object.entries(files)){
      const nb=te.encode(name), data=te.encode(text), crc=XL.crc(data);
      const head=[...u32(0x04034b50),...u16(20),...u16(0x0800),...u16(0),...u16(0),...u16(0x21),...u32(crc),...u32(data.length),...u32(data.length),...u16(nb.length),...u16(0)];
      parts.push(new Uint8Array(head),nb,data);
      cen.push(new Uint8Array([...u32(0x02014b50),...u16(20),...u16(20),...u16(0x0800),...u16(0),...u16(0),...u16(0x21),...u32(crc),...u32(data.length),...u32(data.length),...u16(nb.length),...u16(0),...u16(0),...u16(0),...u16(0),...u32(0),...u32(off)]),nb);
      off+=head.length+nb.length+data.length;
    }
    const cenSize=cen.reduce((s,a)=>s+a.length,0), n=Object.keys(files).length;
    const end=new Uint8Array([...u32(0x06054b50),...u16(0),...u16(0),...u16(n),...u16(n),...u32(cenSize),...u32(off),...u16(0)]);
    return new Blob([...parts,...cen,end],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
  },
};
// 장부 → 엑셀: 요약 · 운행 · 지출 시트
function ledgerXlsx(list,costList,label){
  const L=[...list].sort(byOld), C=[...(costList||[])].sort(byOld);
  const S=(v,s)=>({v,s}), money=v=>S(v,2), day=v=>S(v||'',7);
  const st=t=>t.paid?S('받음',4):t.got?S('일부 받음',9):isPlan(t)?S('예정',7):S('못 받음',3);
  // 운행: 자주 보는 칸을 앞에, 담당자·완료 시각 같은 건 뒤에
  const tripHead=['상차일','하차일','콜','화주','화주 담당자','화주 연락처','상차지','상차 상세주소','하차지','하차 상세주소','운임','수수료','입금 상태','입금일','받은 금액','남은 금액','미수 일수','계산서 발행일','문자 보낸 날','메모','운임 방식','상차 담당자','상차 연락처','하차 담당자','하차 연락처','상차 완료','하차 완료'];
  const tripRows=L.map(t=>[day(t.date),day(t.toDate||t.date),t.src,t.client,t.clientName,t.clientPhone,cities(t,'from'),[t.fromAddr,...xStops(t,'from').map(x=>x.c+' '+(x.a||''))].filter(x=>x&&x.trim()).join(' / '),cities(t,'to'),[t.toAddr,...xStops(t,'to').map(x=>x.c+' '+(x.a||''))].filter(x=>x&&x.trim()).join(' / '),money(t.amount),money(t.fee||0),st(t),day(t.paid),money(recv(t)),money(left(t)),
    t.paid||isPlan(t)?S('',7):S(Math.max(0,daysSince(t.date)),7),day(t.tax),day(t.smsAt),t.memo,t.payType,t.fromName,t.fromPhone,t.toName,t.toPhone,day(t.loadedAt),day(t.unloadedAt)]);
  const sum=L.reduce((s,t)=>s+t.amount,0), fees=L.reduce((s,t)=>s+(t.fee||0),0), got=L.reduce((s,t)=>s+recv(t),0), due=L.reduce((s,t)=>s+left(t),0), cs=C.reduce((s,c)=>s+c.amount,0);
  const tripTotal=[S('합계',5),S('',5),S('',5),S(L.length+'건',5),S('',5),S('',5),S('',5),S('',5),S('',5),S('',5),S(sum,6),S(fees,6),S('',5),S('',5),S(got,6),S(due,6)];
  const trip=XL.sheet([tripHead,...tripRows,...(L.length?[tripTotal]:[])],{widths:[12,12,10,14,15,15,11,26,11,26,12,11,13,12,13,13,12,16,15,28,12,15,15,15,15,17,17],filterRows:L.length+1});
  const cost=XL.sheet([['날짜','항목','금액','메모'],...C.map(c=>[day(c.date),c.cat,money(c.amount),c.memo]),...(C.length?[[S('합계',5),S(C.length+'건',5),S(cs,6),S('',5)]]:[])],{widths:[12,12,13,34],filterRows:C.length+1});
  // 요약: 큰 숫자 · 화주별 · 지출 항목별
  const taxSum=L.filter(t=>t.tax).reduce((s,t)=>s+t.amount,0);
  const paidFee=L.filter(t=>t.paid).reduce((s,t)=>s+(t.fee||0),0);
  const byC={};L.forEach(t=>{const k=t.client||'화주 미입력',o=byC[k]||(byC[k]={n:0,a:0,g:0,d:0});o.n++;o.a+=t.amount;o.g+=recv(t);o.d+=left(t)});
  const byK={};C.forEach(c=>byK[c.cat||'기타']=(byK[c.cat||'기타']||0)+c.amount);
  const sumRows=[[S('아빠장부 정산 요약',8)],[S('기간',5),label],[S('만든 날',5),todayIso],[],
    [S('항목',1),S('금액',1)],['운행 건수',S(L.length,0)],['총 운임',money(sum)],['받은 돈',money(got)],['못 받은 돈',money(due)],['수수료',money(fees)],['지출',money(cs)],['계산서 발행 운임 (공급가액)',money(taxSum)],['부가세 (10%)',money(Math.round(taxSum*0.1))],['계산서 미발행 운임',money(sum-taxSum)],
    [S('순수익 (운임 − 수수료 − 지출)',5),S(sum-fees-cs,6)],[S('들어온 돈 기준 (받은 돈 − 받은 건 수수료 − 지출)',5),S(got-paidFee-cs,6)],[],
    [S('화주',1),S('건수',1),S('운임',1),S('받은 돈',1),S('남은 돈',1)],
    ...Object.entries(byC).sort((a,b)=>b[1].a-a[1].a).map(([k,o])=>[k,S(o.n,0),money(o.a),money(o.g),money(o.d)])];
  if(C.length)sumRows.push([],[S('지출 항목',1),S('금액',1)],...Object.entries(byK).sort((a,b)=>b[1]-a[1]).map(([k,v])=>[k,money(v)]));
  const summary=XL.sheet(sumRows,{header:false,widths:[46,14,14,14,14]});
  return XL.book([{name:'요약',xml:summary},{name:'운행',xml:trip},{name:'지출',xml:cost}]);
}
async function doCsv(list,name,costList,label){
  if(!list.length&&!(costList&&costList.length)){toast('내보낼 기록이 없어요.');return}
  const r=await giveFile(ledgerXlsx(list,costList,label||''),name,'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',true);
  if(r!=='cancel')toast(r==='shared'?'엑셀 파일을 보냈어요':'엑셀 파일을 "다운로드" 폴더에 저장했어요');
}
let pendingImport=null;
function readImport(file){
  const rd=new FileReader();
  rd.onload=()=>{
    let data;try{data=JSON.parse(String(rd.result).replace(/^﻿/,''))}catch(_){showImport('이 파일은 아빠장부 백업 파일이 아니에요. ".json" 백업 파일을 골라 주세요.');return}
    const list=(Array.isArray(data)?data:data&&data.trips||[]).filter(validRecord);
    if(!list.length){showImport('백업 파일 안에 운행 기록이 없어요.');return}
    const newer=list.filter(r=>{const c=store.get(String(r.id));return !c||(c.updatedAt||0)<(Number(r.updatedAt)||0)});
    if(!newer.length){showImport(`파일의 ${list.length}건은 모두 이미 들어 있어요. 바꿀 것이 없어요.`);return}
    pendingImport=newer;
    showImport(`파일에서 <b>${newer.length}건</b>을 불러올 수 있어요. 같은 기록이 있으면 더 최근에 고친 쪽으로 합칩니다. 지금 기록은 지워지지 않아요.`,true);
  };
  rd.onerror=()=>showImport('파일을 읽지 못했어요. 다시 골라 주세요.');
  rd.readAsText(file);
}
function showImport(msg,ask){
  const b=$('s-importbox');b.hidden=false;
  b.innerHTML=`<p>${msg}</p>`+(ask?`<div class="btnrow"><button type="button" class="btn" id="s-import-go">불러오기</button><button type="button" class="btn ghost" id="s-import-no">취소</button></div>`:'');
}
async function applyImport(){
  const list=pendingImport||[];pendingImport=null;
  const changed=list.map(mergeIncoming).filter(Boolean);
  rebuild();
  try{await DB.putMany(changed)}catch(_){toast('휴대폰에 저장하지 못했어요.');return}
  Cloud.pushMany(changed);
  $('s-importbox').hidden=true;$('s-import').value='';
  toast(`${changed.length}건을 불러왔어요`);render();
}

// ---------- 구글 클라우드 동기화 (Firebase) ----------
const FB_VER='10.12.2';
const FULL_EVERY=7*86400000; // 전체 맞춤 주기 (예전 버전 휴대폰이 올린 기록도 놓치지 않게)
const Cloud={
  configured:false,ready:false,loadErr:false,user:null,col:null,unsub:null,lastSync:null,pending:false,lastErr:'',inflight:0,
  async init(){
    const cfg=window.FIREBASE_CONFIG;
    this.configured=!!(cfg&&cfg.apiKey&&cfg.projectId);
    if(!this.configured){Gate.hide();renderSettings();return}
    Gate.show('checking');
    const slow=setTimeout(()=>{if(!this.authKnown)Gate.show(this.ready?'out':'offline')},9000);
    try{
      for(const m of ['app','auth','firestore'])await loadScript(`https://www.gstatic.com/firebasejs/${FB_VER}/firebase-${m}-compat.js`);
      firebase.initializeApp(cfg);
      this.auth=firebase.auth();this.fs=firebase.firestore();
      try{await this.fs.enablePersistence({synchronizeTabs:true})}catch(_){}
      this.ready=true;
      this.auth.getRedirectResult().catch(e=>this.fail(e));
      this.auth.onAuthStateChanged(u=>{this.authKnown=true;clearTimeout(slow);this.onUser(u)});
    }catch(e){this.loadErr=true;clearTimeout(slow);Gate.show('offline')}
    renderSettings();
  },
  async onUser(u){
    if(this.unsub){this.unsub();this.unsub=null}
    if(u){
      // 다른 계정으로 바뀌면 이 휴대폰에 남은 이전 계정 기록은 비움 (이전 기록은 그 계정 클라우드에 있음)
      const owner=ls.get('ownerUid');
      if(owner&&owner!==u.uid){store.clear();try{await DB.clear()}catch(_){}rebuild();render();ls.set('sync:'+u.uid,'')}
      ls.set('ownerUid',u.uid);
      Gate.hide();
    } else if(!Gate.skipped){Gate.show('out')}
    this.user=u;this.lastSync=null;this.lastErr='';
    this.col=u?this.fs.collection('users').doc(u.uid).collection('trips'):null;
    const run=this.run=(this.run||0)+1; // 로그인이 바뀌면 이전 작업은 버림
    this.reconciled=false;
    renderSettings();if(view==='cal')renderBackupBanner();
    if(!u)return;
    // 바뀐 기록만 받기: 기록마다 클라우드 시각(srvAt)을 붙여 두고, 앱을 열면 지난번 이후 것만 읽음
    // 전체 맞춤은 이 휴대폰에서 처음 로그인할 때 · 7일에 한 번 · [설정]에서 누를 때만
    let s=this.syncInfo(), fullDone=false, got=0, upN=0;
    if(!s.full||Date.now()-s.full>FULL_EVERY||this.forceFull||!store.size){
      this.forceFull=false; this.fullBusy=true; renderSettings();
      try{
        const t0=Date.now(), snap=await this.col.get({source:'server'});
        if(run!==this.run)return;
        const r=this.takeIncoming(snap.docs); got=r.changed.length;
        const remote=new Map(snap.docs.map(d=>[d.id,Number(d.data().updatedAt)||0]));
        const up=[...store.values()].filter(t=>!remote.has(t.id)||(t.updatedAt||0)>remote.get(t.id));
        this.pushMany(up); upN=up.length;
        this.setSync({cursor:Math.max(s.cursor||0,r.max),full:Date.now(),upTo:t0}); this.reconciled=true;
        s=this.syncInfo(); fullDone=true; this.lastSync=Date.now();
      }catch(e){if(run!==this.run)return;if(this.manualFull){this.manualFull=false;toast('인터넷에 연결한 뒤 다시 눌러 주세요.')}} // 인터넷이 없으면 다음에 열 때 다시
      this.fullBusy=false;
    }
    let first=true;
    const q=this.col.where('srvAt','>',firebase.firestore.Timestamp.fromMillis(s.cursor||0));
    this.unsub=q.onSnapshot({includeMetadataChanges:true},snap=>{
      const r=this.takeIncoming(snap.docChanges().filter(ch=>ch.type!=='removed').map(ch=>ch.doc));
      if(r.max>(this.syncInfo().cursor||0))this.setSync({cursor:r.max});
      if(first&&!snap.metadata.fromCache){
        first=false; got+=r.changed.length;
        if(!fullDone){
          // 로그인 안 한 채 적은 기록 등, 지난번 맞춘 뒤 이 휴대폰에서 바뀐 것 올리기
          const t0=Date.now(), up=[...store.values()].filter(t=>(t.updatedAt||0)>(s.upTo||0));
          this.pushMany(up); upN=up.length; this.setSync({upTo:t0}); this.reconciled=true;
        }
        if(upN||got)toast(`클라우드와 맞췄어요 (올림 ${upN}건 · 받음 ${got}건)`);
        else if(this.manualFull)toast('클라우드와 이미 똑같아요.');
        this.manualFull=false;
      }
      this.pending=snap.metadata.hasPendingWrites;
      if(!snap.metadata.fromCache)this.lastSync=Date.now();
      renderSettings();renderBackupBanner();
    },e=>this.fail(e));
  },
  // 계정별 맞춤 기록: cursor=받은 마지막 변경의 클라우드 시각 · full=마지막 전체 맞춤 · upTo=이 휴대폰 기록을 올려 맞춘 시각
  syncInfo(){let o=null;try{o=JSON.parse(ls.get('sync:'+this.user.uid))}catch(_){}return o||{}},
  setSync(o){ls.set('sync:'+this.user.uid,JSON.stringify(Object.assign(this.syncInfo(),o)))},
  takeIncoming(docs){
    const changed=[]; let max=0;
    docs.forEach(d=>{
      const x=d.data(), ts=x.srvAt&&x.srvAt.toMillis?x.srvAt.toMillis():0;
      if(ts>max&&!d.metadata.hasPendingWrites)max=ts;
      const t=mergeIncoming(x); if(t)changed.push(t);
    });
    if(changed.length){DB.putMany(changed).then(()=>ls.set('lastLocalSave',String(Date.now())),()=>{});rebuild();render()}
    return {changed,max};
  },
  fullResync(){if(!this.user||this.fullBusy)return;this.forceFull=true;this.manualFull=true;this.onUser(this.user)},
  pushMany(list){
    if(!this.col||!list.length)return;
    for(let i=0;i<list.length;i+=400){
      const b=this.fs.batch();
      const part=list.slice(i,i+400);
      const now=firebase.firestore.FieldValue.serverTimestamp();
      part.forEach(t=>b.set(this.col.doc(t.id),Object.assign(JSON.parse(JSON.stringify(t)),{srvAt:now})));
      // 인터넷이 없으면 commit은 연결될 때까지 기다림 → inflight가 "아직 안 올라간 건수"
      this.inflight+=part.length;
      const uid=this.user&&this.user.uid, top=Math.max(...part.map(t=>t.updatedAt||0));
      b.commit().then(()=>{ls.set('lastCloudSave',String(Date.now()));
        // 맞춘 뒤에 올린 것은 다음에 다시 올리지 않게 표시
        if(this.reconciled&&this.user&&this.user.uid===uid&&top>(this.syncInfo().upTo||0))this.setSync({upTo:top})},e=>this.fail(e))
        .finally(()=>{this.inflight-=part.length;renderSettings()});
    }
  },
  async signIn(){
    this.lastErr='';
    const p=new firebase.auth.GoogleAuthProvider();p.setCustomParameters({prompt:'select_account'});
    try{await this.auth.signInWithPopup(p)}
    catch(e){
      if(['auth/popup-blocked','auth/operation-not-supported-in-this-environment','auth/web-storage-unsupported'].includes(e.code)){
        try{await this.auth.signInWithRedirect(p)}catch(e2){this.fail(e2)}
      } else if(e.code!=='auth/popup-closed-by-user'&&e.code!=='auth/cancelled-popup-request')this.fail(e);
    }
  },
  signOut(){Gate.skipped=false;this.auth.signOut();toast('로그아웃했어요.')},
  fail(e){
    console.error(e);
    const c=e&&e.code||'';
    this.lastErr=c==='permission-denied'?'클라우드 저장 권한이 없어요. 설치 안내서의 "보안 규칙" 단계를 확인해 주세요.'
      :c==='auth/unauthorized-domain'?'이 주소가 Firebase에 등록되지 않았어요. 설치 안내서의 "승인된 도메인" 단계를 확인해 주세요.'
      :c==='auth/network-request-failed'?'인터넷 연결이 불안정해요. 잠시 뒤 다시 해 주세요.'
      :'클라우드 연결 중 문제가 생겼어요 ('+(c||'알 수 없음')+'). 기록은 휴대폰에 저장되고 있어요.';
    renderSettings();
    if(!$('gate').hidden)$('g-msg').textContent=this.lastErr;
  },
};

// ---------- 시작 로그인 화면 ----------
const Gate={
  skipped:false,
  show(state){
    if(this.skipped&&state!=='checking')return;
    const g=$('gate');g.hidden=false;document.body.classList.add('gated');
    $('g-checking').hidden=state!=='checking';
    $('g-login').hidden=state==='checking';
    $('g-login-txt').textContent=state==='offline'?'다시 시도':'구글 계정으로 시작하기';
    $('g-msg').textContent=state==='offline'?'인터넷에 연결되지 않아 로그인할 수 없어요. 처음 한 번은 인터넷이 필요해요.':'';
    $('g-skip').hidden=state==='checking';
  },
  hide(){$('gate').hidden=true;document.body.classList.remove('gated')},
};
$('g-login').onclick=()=>{$('g-msg').textContent='';if(Cloud.ready)Cloud.signIn();else location.reload()};
$('g-skip').onclick=()=>{Gate.skipped=true;Gate.hide();render();toast('로그인 없이 이 휴대폰에만 저장해요. 나중에 [설정]에서 로그인하면 함께 올라가요.')};
function loadScript(src){return new Promise((res,rej)=>{const s=document.createElement('script');s.src=src;s.onload=res;s.onerror=()=>rej(new Error('load '+src));document.head.appendChild(s)})}

// ---------- 공통 그리기 ----------
const VIEWS=['unpaid','cal','ledger','add','set'];

// ---------- 여러 건 선택 + 복사 ----------
let selMode=false, suppressClick=false;
const sel=new Set();
function refreshSel(){
  document.querySelectorAll('.list .row[data-id]').forEach(r=>r.classList.toggle('checked',sel.has(r.dataset.id)));
  const n=[...sel].filter(id=>{const t=store.get(id);return t&&!t.deleted}).length;
  $('sel-count').textContent=`${n}건 선택`;
  document.querySelectorAll('#selbar [data-kind]').forEach(b=>b.disabled=!n);
}
function enterSelect(){
  selMode=true;sel.clear();payingId=deletingId=null;
  document.body.classList.add('selecting');$('selbar').hidden=false;
  pushOverlay({select:true});refreshSel();
}
function exitSelect(fromBack){
  selMode=false;sel.clear();
  document.body.classList.remove('selecting');$('selbar').hidden=true;
  refreshSel();
  if(!fromBack)popOverlay('select');
}
const whoLine=(name,phone)=>[name,phone].filter(Boolean).join(' ');
// 복사 글에 넣을 항목 (날짜·화주·시군) — 고른 값은 이 휴대폰에 기억
let cpOpts={date:true,client:true,city:true};
try{Object.assign(cpOpts,JSON.parse(ls.get('copyOpts')||'{}'))}catch(_){}
let cpKind='all', cpOrig='';
// 글을 고치면 [되돌리기]가 나타나고, 누르면 처음 만들어진 내용으로 돌아감
$('cp-text').addEventListener('input',()=>{$('cp-undo').hidden=$('cp-text').value===cpOrig});
$('cp-undo').onclick=()=>{$('cp-text').value=cpOrig;$('cp-undo').hidden=true;toast('처음 내용으로 되돌렸어요')};
function copyText(list,kind,o){
  const many=list.length>1;
  return list.sort(byOld).map((t,i)=>{
    const L=[];
    const parts=[];
    if(o.client)parts.push(t.client||'화주 미입력');
    if(o.city)parts.push(`${cities(t,'from')} → ${cities(t,'to')}`);
    let head=parts.join(' · ');
    if(o.date)head=`[${md(t.date)}]`+(head?' '+head:'');
    if(head)L.push(head);
    // 상세주소·담당자·연락처는 비어 있어도 줄을 넣고 "미입력"으로 표시 (복사 전에 고칠 수 있게)
    const NA='미입력';
    const who=(n,p)=>`${n||'이름 '+NA} ${p||'연락처 '+NA}`;
    if(kind==='all'&&o.client)L.push(`화주 담당: ${who(t.clientName,t.clientPhone)}`);
    if(kind!=='to'){
      const xf=xStops(t,'from'), nf=xf.length?' 1':'';
      L.push(`상차지${nf}: ${[o.city?t.from:'',t.fromAddr||'상세주소 '+NA].filter(Boolean).join(' ')}`);
      L.push(`상차 담당${nf}: ${who(t.fromName,t.fromPhone)}`);
      xf.forEach((x,j)=>{L.push(`상차지 ${j+2}: ${[o.city?x.c:'',x.a||'상세주소 '+NA].filter(Boolean).join(' ')}`);L.push(`상차 담당 ${j+2}: ${who(x.n,x.p)}`)});
    }
    if(kind!=='from'){
      const xt=xStops(t,'to'), nt=xt.length?' 1':'';
      L.push(`하차지${nt}: ${[o.city?t.to:'',t.toAddr||'상세주소 '+NA].filter(Boolean).join(' ')}`);
      L.push(`하차 담당${nt}: ${who(t.toName,t.toPhone)}`);
      xt.forEach((x,j)=>{L.push(`하차지 ${j+2}: ${[o.city?x.c:'',x.a||'상세주소 '+NA].filter(Boolean).join(' ')}`);L.push(`하차 담당 ${j+2}: ${who(x.n,x.p)}`)});
    }
    if(t.memo)L.push(`메모: ${t.memo}`);
    // 번호는 첫 줄 앞에 바로 붙임 (넣을 항목이 없으면 내용 첫 줄 옆에)
    if(many&&L.length)L[0]=`${i+1}) `+L[0];
    return L.join('\n');
  }).join('\n');
}
const KIND={all:'전체',from:'상차',to:'하차'};
function selList(){return [...sel].map(id=>store.get(id)).filter(t=>t&&!t.deleted)}
function fillCopy(){
  const list=selList();
  cpOrig=copyText(list,cpKind,cpOpts);
  $('cp-text').value=cpOrig;$('cp-undo').hidden=true;
  $('cp-title').textContent=`${KIND[cpKind]} 복사 · ${list.length}건`;
  const none=!cpOpts.date&&!cpOpts.client&&!cpOpts.city;
  document.querySelectorAll('#cp-opts [data-opt]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.opt==='none'?none:!!cpOpts[b.dataset.opt]));
  $('cp-hint').textContent='글을 눌러 직접 고칠 수 있어요. 다 고쳤으면 [복사하기]를 누르세요.';
  $('cp-hint').classList.remove('errline','okline2');
}
function openCopy(kind){
  if(!selList().length){toast('먼저 건을 선택해 주세요');return}
  cpKind=kind;fillCopy();
  $('cpsheet').hidden=false;
  if(!(history.state&&history.state.sheet))pushOverlay({sheet:true,select:true});
}
async function doCopy(){
  const text=$('cp-text').value;
  let ok=false;
  try{await navigator.clipboard.writeText(text);ok=true}catch(_){}
  if(!ok){try{const ta=$('cp-text');ta.focus();ta.select();ok=document.execCommand('copy');ta.blur();ta.setSelectionRange(0,0);window.getSelection&&window.getSelection().removeAllRanges()}catch(_){}}
  $('cp-hint').textContent=ok?'복사했어요. 카톡이나 문자에 붙여넣기 하세요.'
    :'자동 복사가 안 됐어요. 글을 길게 눌러 "모두 선택" → "복사" 해 주세요.';
  $('cp-hint').classList.toggle('errline',!ok);$('cp-hint').classList.toggle('okline2',ok);
  if(ok)toast('복사했어요');
}
// ---------- 화주 한눈에 보기 ----------
// 목록에서 화주 이름을 누르면: 운행 수 · 총 운임 · 받은 돈 · 못 받은 돈 · 평균 입금까지 걸린 날 · 연락처 · 최근 운행
let clName='';
function openClient(name){
  clName=name; const ts=trips.filter(t=>(t.client||'')===name).sort(byNew);
  const sum=ts.reduce((s,t)=>s+t.amount,0), got=ts.reduce((s,t)=>s+recv(t),0);
  const due=ts.filter(t=>!t.paid&&!isPlan(t)), dueSum=due.reduce((s,t)=>s+left(t),0), plan=ts.filter(isPlan);
  const paidT=ts.filter(t=>t.paid), avg=paidT.length?Math.round(paidT.reduce((s,t)=>s+Math.max(0,(parseD(t.paid)-parseD(t.date))/86400000),0)/paidT.length):null;
  const oldest=due.length?due.reduce((a,t)=>t.date<a.date?t:a):null, ct=ts.find(t=>t.clientPhone||t.clientName);
  $('cl-h').textContent=name;
  // 순서: 연락처(바로 전화) → 못 받은 돈 보기(가장 많이 누를 것) → 숫자 요약 → 최근 운행
  $('cl-body').innerHTML=(ct?`<div class="clct">${ct.clientName?`<b>${esc(ct.clientName)}</b>`:''}${ct.clientPhone?`<a class="callbtn" href="${telHref(ct.clientPhone)}">${ic(P.phone)}${esc(ct.clientPhone)}</a>`:''}</div>`:'')
    +(due.length?`<button type="button" class="btn cldue" id="cl-due"><span>이 화주 못 받은 돈 보기</span><b class="num">${won(dueSum)}</b><small class="num">${due.length}건${oldest?` · 가장 오래된 것 ${md(oldest.date)} (${daysSince(oldest.date)}일째)`:''}</small></button>`:'<p class="clok">이 화주는 못 받은 돈이 없어요.</p>')
    +`<div class="clstats">`
    +`<div><span>운행</span><b class="num">${ts.length}건</b></div><div><span>총 운임</span><b class="num">${short(sum)}원</b></div><div><span>받은 돈</span><b class="num c-paid">${short(got)}원</b></div>`
    +`<div><span>입금까지 평균</span><b class="num">${avg===null?'-':avg+'일'}</b></div><div><span>마지막 운행</span><b class="num">${ts.length?md(ts[0].date):'-'}</b></div><div><span>예정</span><b class="num">${plan.length}건</b></div></div>`
    +`<div class="section-title">최근 운행</div><div class="clrecent">`+ts.slice(0,6).map(t=>`<div><small class="num">${md(t.date)}</small><span>${esc(t.from)} → ${esc(t.to)}</span><b class="num ${t.paid?'c-paid':isPlan(t)?'':'c-due'}">${short(t.paid?t.amount:left(t))}<small> ${t.paid?'받음':isPlan(t)?'예정':t.got>0?`남음 (${short(t.amount)} 중)`:'미수'}</small></b></div>`).join('')+'</div>';
  $('clsheet').hidden=false; pushOverlay({csheet:true});
}
function closeClient(){$('clsheet').hidden=true;popOverlay('csheet')}
$('clsheet').addEventListener('click',e=>{
  if(e.target===$('clsheet')||e.target.closest('#cl-close')){closeClient();return}
  if(e.target.closest('#cl-due')){ // 받을 돈 목록에서 이 화주만
    closeClient(); setTimeout(()=>{uView='list';uRange=null;uAge=null;$('u-scope').value='client';$('u-search').value=clName;$('u-search').placeholder=SPH.client;navTab('unpaid');window.scrollTo(0,0)},60);
  }
});

// ---------- 세금 신고용 정리 (설정) ----------
// 부가세: 1~6월 · 7~12월 (반기) · 종합소득세: 1년 — 운임은 부가세 뺀 금액(공급가액)으로 적는다고 봄 (정산 문자도 계산서면 +10%)
let txY=TODAY.getFullYear(), txP=TODAY.getMonth()<6?'h1':'h2';
const TXP={h1:['01-01','06-30','1~6월','부가세 상반기'],h2:['07-01','12-31','7~12월','부가세 하반기'],y:['01-01','12-31','1년','종합소득세']};
const txRange=()=>({start:`${txY}-${TXP[txP][0]}`,end:`${txY}-${TXP[txP][1]}`});
const txLabel=()=>`${txY}년 ${TXP[txP][2]} (${TXP[txP][3]})`;
function renderTax(){
  $('tx-y').textContent=txY+'년';
  document.querySelectorAll('#tx-per [data-txp]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.txp===txP));
  const r=txRange(), L=trips.filter(t=>inRange(t,r)), C=costs.filter(c=>inRange(c,r));
  const sum=L.reduce((s,t)=>s+t.amount,0), T=L.filter(t=>t.tax), tSum=T.reduce((s,t)=>s+t.amount,0), N=L.filter(t=>!t.tax), nSum=sum-tSum;
  const fees=L.reduce((s,t)=>s+(t.fee||0),0), cs=C.reduce((s,c)=>s+c.amount,0);
  const byK={};C.forEach(c=>byK[c.cat||'기타']=(byK[c.cat||'기타']||0)+c.amount);
  const due=txP==='h1'?`${txY}년 7월 25일까지`:txP==='h2'?`${txY+1}년 1월 25일까지`:`${txY+1}년 5월 31일까지`;
  const row=(l,v,cls='')=>`<div class="txrow ${cls}"><span>${l}</span><b class="num">${v}</b></div>`;
  $('tx-body').innerHTML=`<p class="txdue"><b>${TXP[txP][3]} 신고</b> · ${due}<small>개인 일반과세자 기준이에요. 정확한 신고는 세무사와 확인하세요.</small></p>`
    +`<div class="txcard"><h3>매출 (운임)</h3>`+row(`운행 <small>${L.length}건</small>`,won(sum),'sum')
    +row(`계산서 발행 <small>${T.length}건</small>`,won(tSum))+row('부가세 (10%)',won(Math.round(tSum*0.1)),'sub')+row('발행 합계 (부가세 포함)',won(tSum+Math.round(tSum*0.1)),'sub')
    +row(`계산서 미발행 <small>${N.length}건</small>`,won(nSum))+`</div>`
    +`<div class="txcard"><h3>경비</h3>`+row('수수료',won(fees))+Object.entries(byK).sort((a,b)=>b[1]-a[1]).map(([k,v])=>row(esc(k),won(v),'sub')).join('')
    +row(`지출 합계 <small>${C.length}건</small>`,won(cs))+row('경비 합계 (수수료 + 지출)',won(fees+cs),'sum')+`</div>`
    +`<div class="txnet"><span>남는 돈 (운임 − 경비)</span><b class="num">${won(sum-fees-cs)}</b></div>`
    +`<div class="txbtns"><button type="button" class="btn" id="tx-xlsx">세무사에게 보낼 엑셀</button>`
    +(N.length?`<button type="button" class="btn ghost" id="tx-notax">계산서 안 낸 ${N.length}건 보기</button>`:'')+`</div>`
    +`<p class="hint small">상차일 기준으로 모았어요. 지출은 영수증 · 카드 내역과 맞춰 보세요.</p>`;
  $('tx-prev').disabled=false; $('tx-next').disabled=txY>=TODAY.getFullYear();
}
function openTax(){renderTax();$('taxsheet').hidden=false;pushOverlay({tsheet:true})}
function closeTax(){$('taxsheet').hidden=true;popOverlay('tsheet')}
$('s-tax').onclick=openTax;
$('taxsheet').addEventListener('click',e=>{
  if(e.target===$('taxsheet')||e.target.closest('#tx-close')){closeTax();return}
  if(e.target.closest('#tx-prev')){txY--;renderTax();return}
  if(e.target.closest('#tx-next')){if(txY<TODAY.getFullYear())txY++;renderTax();return}
  const p=e.target.closest('[data-txp]'); if(p){txP=p.dataset.txp;renderTax();return}
  if(e.target.closest('#tx-xlsx')){const r=txRange();doCsv(trips.filter(t=>inRange(t,r)),`아빠장부_세금_${txY}_${TXP[txP][2].replace('~','-')}.xlsx`,costs.filter(c=>inRange(c,r)),txLabel());return}
  if(e.target.closest('#tx-notax')){ // 장부에서 그 기간 · 미발행만
    const r=txRange(); closeTax();
    setTimeout(()=>{ledKind='trip';ledFilter='notax';ledRange=r;$('l-search').value='';navTab('ledger');window.scrollTo(0,0)},60);
  }
});

// ---------- 정산 문자 ----------
// 운행 한 건마다 화주에게: "운임 금액 {금액}원 입금확인바랍니다." · 계산서 발행이면 운임에 10%(부가세)를 더해서
// 화주마다 마지막에 고른 발행/미발행을 기억해 다음에도 그대로 고름
let smTrip=null, smTax=false, smOrig='';
const vat=a=>Math.round(a*1.1);
function smsText(t,tax){
  const p=getProfile(), amt=smsDue(t,tax), acct=acctText(p);
  const who=[p.carNo,p.name||p.holder].filter(Boolean).join(' '); // 이름이 비어 있으면 예금주 이름
  const L=[who?`안녕하세요, ${who}입니다.`:'안녕하세요.',
    `${md(t.date)} ${t.from}→${t.to}${tax?' 전자 계산서 발행했습니다.':''} 운임 금액 ${comma(amt)}원${tax?'(부가세 포함)':''} 입금확인바랍니다.`];
  if(acct)L.push(acct);
  return L.join('\n');
}
// 문자로 받을 금액: 계산서면 (운임+부가세), 아니면 운임 — 일부 받은 게 있으면 그만큼 뺀 남은 돈
const smsDue=(t,tax)=>Math.max(0,(tax?vat(t.amount):t.amount)-(t.got||0));
function setSmTax(tax){
  smTax=tax;
  document.querySelectorAll('#sm-tax [data-tax]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.tax===(tax?'1':'0')));
  const a=smTrip.amount;
  const g=smTrip.got||0, base=tax?`운임 ${comma(a)} + 부가세 ${comma(vat(a)-a)}`:`운임 ${comma(a)}`;
  $('sm-amt').innerHTML=g?`${base} − 받은 돈 ${comma(g)} = <b>${comma(smsDue(smTrip,tax))}원</b>`:tax?`${base} = <b>${comma(vat(a))}원</b>`:`운임 <b>${comma(a)}원</b>`;
  smOrig=smsText(smTrip,tax); $('sm-text').value=smOrig; $('sm-undo').hidden=true;
}
function openSms(t){
  if(!t)return;
  smTrip=t; const p=getProfile();
  $('sm-title').textContent=`정산 문자 · ${t.client||'화주 미입력'}`;
  $('sm-to').textContent=t.clientPhone?`받는 사람: ${t.clientName?t.clientName+' ':''}${t.clientPhone}`
    :'화주 연락처가 없어요. [문자 보내기]를 누른 뒤 번호를 넣거나, [복사]해서 카톡으로 보내세요.';
  setSmTax(!!t.tax||ls.get('tax:'+(t.client||''))==='1');
  $('sm-hint').textContent=p.carNo&&(p.name||p.holder)&&p.account?'글을 눌러 직접 고칠 수 있어요.':'설정 → 내 정보에 차량 번호·이름·계좌를 적어 두면 자동으로 들어가요.';
  $('sm-hint').classList.remove('errline','okline2');
  $('smsheet').hidden=false; pushOverlay({sms:true});
}
$('sm-tax').addEventListener('click',e=>{
  const b=e.target.closest('[data-tax]'); if(!b)return;
  const tax=b.dataset.tax==='1'; if(tax===smTax)return;
  if($('sm-text').value!==smOrig&&!confirm('고친 내용이 처음 문구로 바뀌어요. 바꿀까요?'))return;
  setSmTax(tax); ls.set('tax:'+(smTrip.client||''),tax?'1':'0');
});
$('sm-text').addEventListener('input',()=>{$('sm-undo').hidden=$('sm-text').value===smOrig});
$('sm-undo').onclick=()=>{$('sm-text').value=smOrig;$('sm-undo').hidden=true;toast('처음 내용으로 되돌렸어요')};
// 휴대폰 문자 앱을 화주 번호와 내용이 채워진 채로 열기
// 보내기·복사를 누르면 그 건에 '문자 보낸 날'을, 계산서 발행 문구로 보냈으면 '계산서 발행'도 남김
function markSent(){
  const t=store.get(smTrip.id); if(!t)return;
  t.smsAt=todayIso; if(smTax&&!t.tax)t.tax=todayIso;
  saveTrip(t); render();
}
$('sm-send').onclick=()=>{markSent();location.href=`sms:${(smTrip.clientPhone||'').replace(/\D/g,'')}?body=${encodeURIComponent($('sm-text').value)}`};
$('sm-copy').onclick=async()=>{
  const ta=$('sm-text'); let ok=false;
  try{await navigator.clipboard.writeText(ta.value);ok=true}catch(_){}
  if(!ok){try{ta.focus();ta.select();ok=document.execCommand('copy');ta.blur();ta.setSelectionRange(0,0)}catch(_){}}
  $('sm-hint').textContent=ok?'복사했어요. 카톡에 붙여넣기 하세요.':'자동 복사가 안 됐어요. 글을 길게 눌러 "모두 선택" → "복사" 해 주세요.';
  $('sm-hint').classList.toggle('errline',!ok);$('sm-hint').classList.toggle('okline2',ok);
  markSent(); // 복사가 안 돼 손으로 복사해도 보내는 건 같으니 기록
  if(ok)toast('복사했어요 · 보낸 날을 기록했어요')
};
$('sm-close').onclick=()=>{$('smsheet').hidden=true;popOverlay('sms')};

$('cp-opts').addEventListener('click',e=>{
  const b=e.target.closest('[data-opt]');if(!b)return;
  if(b.dataset.opt==='none')cpOpts={date:false,client:false,city:false};
  else cpOpts[b.dataset.opt]=!cpOpts[b.dataset.opt];
  ls.set('copyOpts',JSON.stringify(cpOpts));fillCopy();
});
$('selbar').addEventListener('click',e=>{
  const k=e.target.closest('[data-kind]');if(k){openCopy(k.dataset.kind);return}
  if(e.target.closest('#sel-cancel')){exitSelect();return}
  if(e.target.closest('#sel-all')){document.querySelectorAll(`#v-${view} .list .row[data-id]`).forEach(r=>sel.add(r.dataset.id));refreshSel()}
});
$('cp-close').onclick=()=>{$('cpsheet').hidden=true;popOverlay('sheet')};
$('cp-copy').onclick=doCopy;

// 꾹 누르기(0.45초) → 선택 시작, 누른 채로 끌면 지나가는 건도 선택
const LP={timer:null,x:0,y:0,drag:false};
const rowAt=(x,y)=>{const el=document.elementFromPoint(x,y);return el&&el.closest('.list .row[data-id]')};
function lpStart(row,x,y){
  suppressClick=false;LP.x=x;LP.y=y;clearTimeout(LP.timer);
  LP.timer=setTimeout(()=>{
    LP.timer=null;LP.drag=true;suppressClick=true;
    if(!selMode)enterSelect();
    sel.add(row.dataset.id);refreshSel();
    try{navigator.vibrate&&navigator.vibrate(25)}catch(_){}
  },450);
}
function dragPick(){const r=rowAt(LP.lx,LP.ly);if(r&&!sel.has(r.dataset.id)){sel.add(r.dataset.id);refreshSel()}}
function lpMove(x,y,ev){
  if(LP.drag){
    if(ev&&ev.cancelable)ev.preventDefault();
    LP.lx=x;LP.ly=y;dragPick();
    // 손가락이 화면 위·아래 끝에 있으면 계속 스크롤하면서 고르기
    if(!LP.auto)LP.auto=setInterval(()=>{
      if(!LP.drag){clearInterval(LP.auto);LP.auto=null;return}
      const h=window.innerHeight;
      if(LP.ly<90){window.scrollBy(0,-16);dragPick()}
      else if(LP.ly>h-170){window.scrollBy(0,16);dragPick()}
    },40);
    return;
  }
  if(LP.timer&&(Math.abs(x-LP.x)>10||Math.abs(y-LP.y)>10)){clearTimeout(LP.timer);LP.timer=null}
}
function lpEnd(){clearTimeout(LP.timer);LP.timer=null;LP.drag=false;clearInterval(LP.auto);LP.auto=null}
const lpTarget=e=>!e.target.closest('button,a,input,textarea')&&e.target.closest('.list .row[data-id]');
document.addEventListener('touchstart',e=>{
  if(e.touches.length>1){lpEnd();return}
  const row=lpTarget(e);if(row)lpStart(row,e.touches[0].clientX,e.touches[0].clientY);
},{passive:true});
document.addEventListener('touchmove',e=>lpMove(e.touches[0].clientX,e.touches[0].clientY,e),{passive:false});
document.addEventListener('touchend',lpEnd,{passive:true});
document.addEventListener('touchcancel',lpEnd,{passive:true});
let mouseDown=false;
document.addEventListener('mousedown',e=>{if(e.button!==0)return;const row=lpTarget(e);if(row){mouseDown=true;lpStart(row,e.clientX,e.clientY)}});
document.addEventListener('mousemove',e=>{if(mouseDown)lpMove(e.clientX,e.clientY,null)});
document.addEventListener('mouseup',()=>{mouseDown=false;lpEnd()});
document.addEventListener('contextmenu',e=>{if(e.target.closest('.list .row[data-id]'))e.preventDefault()});

// 새로고침해도 보던 화면(탭·달·스크롤)으로 돌아오게 — 앱을 완전히 닫았다 열면 달력부터
const ss={get(k){try{return sessionStorage.getItem(k)}catch(_){return null}},set(k,v){try{sessionStorage.setItem(k,v)}catch(_){}}};
function saveSpot(){ss.set('spot',JSON.stringify({v:editingId!==null?backView:view,calY,calM,calSel,ledY,ledM,lr:ledRange,lk:ledKind,y:window.scrollY}))}
function loadSpot(){
  let s=null;try{s=JSON.parse(ss.get('spot'))}catch(_){}
  if(!s||!VIEWS.includes(s.v))return 0;
  view=s.v;
  if(Number.isInteger(s.calY)&&Number.isInteger(s.calM)){calY=s.calY;calM=s.calM}
  if(typeof s.calSel==='string')calSel=s.calSel;
  if(Number.isInteger(s.ledY)&&Number.isInteger(s.ledM)){ledY=s.ledY;ledM=s.ledM}
  if(s.lk==='cost')ledKind='cost';
  if(s.lr&&typeof s.lr.start==='string'&&typeof s.lr.end==='string')ledRange={start:s.lr.start,end:s.lr.end};
  return s.y||0;
}
window.addEventListener('pagehide',saveSpot);
function render(){
  saveSpot();
  VIEWS.forEach(v=>$('v-'+v).hidden=v!==view);
  document.querySelectorAll('nav.tabs button').forEach(b=>b.setAttribute('aria-selected',b.dataset.v===view));
  if(view==='unpaid')renderUnpaid(); else if(view==='cal')renderCal(); else if(view==='ledger')renderLedger();
  else if(view==='add'){renderRecent();if(formKind==='cost')renderCostRecent()} else renderSettings();
}
let undoFn=null,toastTimer=null;
function toast(msg,undo){
  $('toast-msg').textContent=msg; undoFn=undo||null; $('toast-undo').hidden=!undo; $('toast').hidden=false;
  clearTimeout(toastTimer); toastTimer=setTimeout(()=>$('toast').hidden=true,undo?6000:4000);
}
$('toast-undo').onclick=()=>{const f=undoFn;undoFn=null;$('toast').hidden=true;if(f)f();render()};
function go(v){view=v;payingId=openId=deletingId=costOpen=costDel=null;render();window.scrollTo(0,0)}

// ---------- 뒤로가기 (휴대폰 뒤로 버튼) ----------
// 기록 단계: 0 맨 아래(종료 경계) · 1 달력 · 2 다른 탭 · 3 그 위에 열린 화면(수정, 기간 선택)
let pendingTab=null, exitTimer=null;
const curLvl=()=>(history.state&&history.state.lvl)||0;
function closeOverlays(){if(editingId!==null)leaveEdit();if(costEditId!==null)resetCost();uPanel=false}
function navTab(v){
  if(selMode)exitSelect();
  const lvl=curLvl();
  closeOverlays(); if(v==='add'){resetForm();loadDraftNew()} if(v==='unpaid')uLate=null;
  if(v==='cal'){ if(lvl>1){pendingTab='cal';history.go(-(lvl-1))} go('cal'); return }
  if(lvl<=1){ if(lvl===0)history.pushState({lvl:1,v:'cal'},''); history.pushState({lvl:2,v},''); go(v); return }
  if(lvl===2){ history.replaceState({lvl:2,v},''); go(v); return }
  pendingTab=v; history.go(-(lvl-2)); go(v);
}
function pushOverlay(extra){history.pushState(Object.assign({lvl:curLvl()+1,v:view},extra),'')}
function popOverlay(key){if(history.state&&history.state[key])history.back()}
function goCal(){const lvl=curLvl(); if(lvl>1){pendingTab='cal';history.go(-(lvl-1))} go('cal')}
window.addEventListener('popstate',e=>{
  let s=e.state||{lvl:0};
  if(!s.lvl){
    // 맨 아래까지 왔으면: 한 번 더 누르면 닫힘
    toast('뒤로 버튼을 한 번 더 누르면 앱이 닫혀요');
    clearTimeout(exitTimer);
    exitTimer=setTimeout(()=>{if(!curLvl())history.pushState({lvl:1,v:view},'')},2500);
    return;
  }
  clearTimeout(exitTimer);
  if(pendingTab){
    const v=pendingTab;pendingTab=null;
    if(v!=='cal'&&s.lvl===2){s={lvl:2,v};history.replaceState(s,'')}
  }
  if(uPanel&&!s.panel)uPanel=false;
  if(!$('cpsheet').hidden&&!s.sheet)$('cpsheet').hidden=true;
  if(!$('smsheet').hidden&&!s.sms)$('smsheet').hidden=true;
  if(!$('clsheet').hidden&&!s.csheet)$('clsheet').hidden=true;
  if(!$('taxsheet').hidden&&!s.tsheet)$('taxsheet').hidden=true;
  if(!$('calsheet').hidden&&!s.jump)$('calsheet').hidden=true;
  if(!$('ledsheet').hidden&&!s.lpick)$('ledsheet').hidden=true;
  if(selMode&&!s.select&&!s.sheet)exitSelect(true);
  if(editingId!==null&&!s.edit)leaveEdit();
  if(costEditId!==null&&!s.cedit)resetCost();
  if(s.v&&s.v!==view){view=s.v;openId=null;window.scrollTo(0,0)}
  payingId=deletingId=null;
  render();
});

// ---------- 누르기 처리 ----------
document.addEventListener('click',e=>{
  if(suppressClick){suppressClick=false;if(e.target.closest('.list .row[data-id]')){e.preventDefault();return}}
  if(selMode){const row=e.target.closest('.list .row[data-id]');
    if(row){e.preventDefault();const id=row.dataset.id;sel.has(id)?sel.delete(id):sel.add(id);refreshSel();return}}
  if(e.target.closest('a[href^="tel:"]'))return; // 전화 앱 키패드로 번호만 넘김
  const cp=e.target.closest('[data-copy]');
  if(cp){const v=cp.dataset.copy;
    try{navigator.clipboard.writeText(v).then(()=>toast(`${v} 복사했어요`),()=>toast('복사가 안 되면 번호를 길게 눌러 복사해 주세요'))}
    catch(_){toast('복사가 안 되면 번호를 길게 눌러 복사해 주세요')}
    return}
  const tab=e.target.closest('nav.tabs button');
  if(tab){navTab(tab.dataset.v);return}
  if(e.target.closest('[data-goto]')){navTab(e.target.closest('[data-goto]').dataset.goto);return}
  const smb=e.target.closest('[data-do="sms"]');
  if(smb){openSms(store.get(smb.dataset.id));return}
  const ced=e.target.closest('[data-do="cedit"]');
  if(ced){startCostEdit(store.get(ced.dataset.id));return}
  const kd=e.target.closest('[data-fkind]');
  if(kd){setKind(kd.dataset.fkind);return}
  const ct=e.target.closest('[data-cat]');
  if(ct){setCat(ct.dataset.cat);return}
  const ca=e.target.closest('[data-cadd]');
  if(ca){const a=Number(ca.dataset.cadd),cur=Number(($('cf-amt').value||'0').replace(/\D/g,''));$('cf-amt').value=a?comma(cur+a):'';return}
  const uv=e.target.closest('[data-uview]');
  if(uv){uView=uv.dataset.uview;ls.set('uView',uView);uDay=null;openId=payingId=null;renderUnpaid();window.scrollTo(0,0);return}
  const ucd=e.target.closest('[data-ucd]');
  if(ucd){uDay=uDay===ucd.dataset.ucd?null:ucd.dataset.ucd;openId=payingId=null;renderUnpaid();return}
  const us=e.target.closest('[data-usort]');
  if(us){uSort=us.dataset.usort;ls.set('uSort',uSort);renderUnpaid();return}
  const lub=e.target.closest('[data-lu]');
  if(lub){calLU=lub.dataset.lu;ls.set('calLU',calLU);calFilter='all';openId=payingId=deletingId=null;renderCal();return}
  const lk=e.target.closest('[data-lkind]');
  if(lk){ledKind=lk.dataset.lkind;openId=payingId=deletingId=costOpen=costDel=null;renderLedger();saveSpot();return}
  const smk=e.target.closest('[data-smark]');
  if(smk){setSrcMark(smk.dataset.smark);render();return}
  const tx=e.target.closest('[data-tsize]');
  if(tx){setTextSize(tx.dataset.tsize);return}
  const ed=e.target.closest('[data-do="edit"]');
  if(ed){startEdit(store.get(ed.dataset.id));return}
  const ast=e.target.closest('[data-addstop]');
  if(ast){const k=ast.dataset.addstop,l=readStops(true);l.push({k});renderStops(l);const b=$('f-x'+k).lastElementChild;b&&b.querySelector('.xc').focus();saveDraft();return}
  const xf=e.target.closest('[data-xfill]');
  if(xf){const el=xf.closest('.xstop');el.querySelector('.xc').value=xf.dataset.xfill;renderXPlaces(el);saveDraft();return}
  const xp=e.target.closest('[data-xplace]');
  if(xp){const el=xp.closest('.xstop'),o=(el._pl||[])[+xp.dataset.xplace];if(o){el.querySelector('.xa').value=o.addr||'';el.querySelector('.xn').value=o.name||'';el.querySelector('.xp').value=o.phone||'';renderXPlaces(el);saveDraft()}return}
  const dst=e.target.closest('[data-delstop]');
  if(dst){const el=dst.closest('.xstop'),all=[...document.querySelectorAll('#f .xstop')],i=all.indexOf(el),l=readStops(true);l.splice(i,1);renderStops(l);saveDraft();return}
  const gso=e.target.closest('[data-do="goso"]'); // 이 운행(화주 · 날짜 · 못 받은 운임)으로 고소장 칸을 채워서 열기 (goso.js)
  if(gso){Goso.open(store.get(gso.dataset.id));return}
  const fill=e.target.closest('[data-fill]');
  if(fill){$(fill.dataset.fill).value=fill.dataset.v; if(fill.dataset.fill==='f-from')renderPlaces('from'); if(fill.dataset.fill==='f-to')renderPlaces('to');
    if(fill.dataset.fill==='f-client')renderCPast();
    if(fill.dataset.fill==='f-client'&&!$('f-clientphone').value&&!$('f-clientname').value){const p=[...trips].sort(byNew).find(t=>t.client===fill.dataset.v&&(t.clientPhone||t.clientName));if(p){$('f-clientphone').value=p.clientPhone||'';$('f-clientname').value=p.clientName||'';syncMore()}}
    return}
  const ul=e.target.closest('[data-ulate]');
  if(ul){uLate=null;openId=payingId=null;renderUnpaid();return}
  const lset=e.target.closest('[data-late-set]');
  if(lset){const v=+lset.dataset.lateSet;setLate(v);toast(v?`${v}일 넘게 못 받은 돈을 달력 위에 알려 줄게요`:'오래 못 받은 돈 알림을 껐어요');return}
  const ag=e.target.closest('[data-age]');
  if(ag){uLate=null;const v=ag.dataset.age||null;uAge=(v&&uAge===v)?null:v;openId=payingId=null;renderUnpaid();return}
  const sr=e.target.closest('[data-src]');
  if(sr){const k=sr.dataset.src; // 한 번 더 누르면 해제
    if(k===formSrc)setSrc('');else if(k==='기타'){formSrc='기타';paintSrc();$('f-srctext').focus()}else setSrc(k);return}
  const tod=e.target.closest('[data-tod]');
  if(tod){const n=Number(tod.dataset.tod),d=$('f-date').value;$('f-todate').value=!n||!d?'':iso(new Date(parseD(d).getTime()+n*86400000));paintTod();return}
  const pl=e.target.closest('[data-place]');
  if(pl){const s=pl.dataset.place,o=placeOpts[s][+pl.dataset.i];if(o){$('f-'+s+'addr').value=o.addr||'';$('f-'+s+'name').value=o.name||'';$('f-'+s+'phone').value=o.phone||'';renderPlaces(s)}return}
  const sv=e.target.closest('[data-srcv]');
  if(sv){$('f-srctext').value=sv.dataset.srcv;return}
  const pt=e.target.closest('[data-pt]');
  if(pt){setPt(pt.dataset.pt);return}
  const q=e.target.closest('[data-add]');
  if(q){const a=Number(q.dataset.add),cur=Number(($('f-amt').value||'0').replace(/\D/g,''));$('f-amt').value=a?comma(cur+a):'';return}
  // 설정 화면 버튼
  const sid=e.target.closest('button')&&e.target.closest('button').id;
  if(sid==='s-login'){Cloud.signIn();return}
  if(sid==='s-logout'){Cloud.signOut();return}
  if(sid==='s-resync'){Cloud.fullResync();return}
  if(sid==='s-import-go'){applyImport();return}
  if(sid==='s-import-no'){pendingImport=null;$('s-importbox').hidden=true;$('s-import').value='';return}
  const el=e.target.closest('[data-do]'); if(!el)return;
  const id=el.dataset.id, t=id?store.get(id):null;
  switch(el.dataset.do){
    case 'pay': payingId=id; break;
    case 'paycancel': payingId=null; break;
    case 'paycfm': { // 받은 만큼 기록 → 다 받았으면 입금 완료, 덜 받았으면 남은 돈으로 계속
      const v=$('pd-'+id).value||todayIso, rest=left(t), a=Math.min(rest,Number(($('pa-'+id).value||'').replace(/\D/g,''))||rest);
      const before={paid:t.paid,got:t.got,gotLog:t.gotLog};
      t.got=(t.got||0)+a; t.gotLog=(t.gotLog?t.gotLog+',':'')+v+':'+a;
      if(t.got>=t.amount)t.paid=v;
      payingId=null; saveTrip(t);
      toast(t.paid?`${t.from}→${t.to} ${comma(t.amount)}원 다 받았어요`:`${comma(a)}원 받았어요 · 남은 돈 ${won(left(t))}`,()=>{Object.assign(t,before);saveTrip(t);render()}); break; }
    case 'unpay': { // 마지막에 받은 것 하나를 취소 (일부 받은 기록이 있으면 그만큼만 되돌림)
      const before={paid:t.paid,got:t.got,gotLog:t.gotLog}, log=(t.gotLog||'').split(',').filter(Boolean), last=log.pop();
      t.paid=null; if(last){t.got=Math.max(0,(t.got||0)-Number(last.split(':')[1]||0));t.gotLog=log.join(',')}
      saveTrip(t); toast(last&&t.got>0?`마지막 입금 ${won(Number(last.split(':')[1]))}을 취소했어요`:'미수로 되돌렸어요',()=>{Object.assign(t,before);saveTrip(t);render()}); break; }
    case 'open': openId=openId===id?null:id; deletingId=null; payingId=null; break;
    case 'del': deletingId=id; break;
    case 'delcancel': deletingId=null; break;
    case 'delcfm': removeTrip(t); deletingId=openId=null; toast('삭제했어요',()=>restoreTrip(t)); break;
    case 'day': if(calSel!==el.dataset.d)calFilter='all'; calSel=el.dataset.d; openId=payingId=null; break;
    case 'client': openClient(el.dataset.c); break;
    case 'copen': costOpen=costOpen===id?null:id; costDel=null; break;
    case 'cdel': costDel=id; break;
    case 'cdelcancel': costDel=null; break;
    case 'lu': { // 상차 완료 · 하차 완료 (다시 누르면 취소)
      const load=el.dataset.k==='load', k=load?'loadedAt':'unloadedAt', l=load?'상차':'하차', before={loadedAt:t.loadedAt,unloadedAt:t.unloadedAt};
      const d=new Date(), now=`${iso(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
      if(!load&&!t.loadedAt){toast('상차 완료를 먼저 눌러 주세요');break}
      if(t[k]){t[k]='';if(load)t.unloadedAt=''} // 상차를 취소하면 하차도 같이 취소
      else t[k]=now;
      saveTrip(t); toast(before[k]?(load&&before.unloadedAt?'상차 · 하차 완료를 취소했어요':`${l} 완료를 취소했어요`):`${l} 완료로 표시했어요`,()=>{Object.assign(t,before);saveTrip(t);render()}); break; }
    case 'cdelcfm': removeTrip(t); costDel=costOpen=null; toast('지출을 삭제했어요',()=>restoreTrip(t)); break;
    case 'filter': if(el.dataset.which==='led')ledFilter=el.dataset.f; else calFilter=el.dataset.f; openId=payingId=deletingId=null; break;
  }
  render();
});
$('c-prev').onclick=()=>{calM--;if(calM<0){calM=11;calY--}calSel=`${calY}-${pad(calM+1)}-01`;calFilter='all';render()};
$('c-next').onclick=()=>{calM++;if(calM>11){calM=0;calY++}calSel=`${calY}-${pad(calM+1)}-01`;calFilter='all';render()};
// 하루·기간을 보고 있었으면 그 시작 달에서부터 한 달씩
function ledStep(n){if(ledRange){const d=parseD(ledRange.start);ledY=d.getFullYear();ledM=d.getMonth();ledRange=null}
  ledM+=n;if(ledM<0){ledM=11;ledY--}if(ledM>11){ledM=0;ledY++}openId=payingId=deletingId=costOpen=costDel=null;render()}
$('l-prev').onclick=()=>ledStep(-1);
$('l-next').onclick=()=>ledStep(1);
$('l-title').onclick=()=>openLedPick('led');
$('l-netsw').onclick=e=>{const b=e.target.closest('[data-netmode]');if(!b)return;netMode=b.dataset.netmode;ls.set('netMode',netMode);renderLedger()};
$('c-title').onclick=openJump;
$('c-today').onclick=()=>{calGo(todayIso);render()};
$('l-search').oninput=renderLedger;
initScope('l-scope','l-search','scope:l',renderLedger);
initScope('u-scope','u-search','scope:u',()=>{openId=payingId=null;renderUnpaid()});
$('l-csv').onclick=()=>doCsv(ledTrips(),ledRange?`아빠장부_${ledRange.start}_${ledRange.end}.xlsx`:`아빠장부_${ledY}-${pad(ledM+1)}.xlsx`,ledCosts(),ledLabel());
$('l-addcost').onclick=()=>{navTab('add');setKind('cost');$('cf-amt').focus()};
$('u-search').oninput=()=>{openId=payingId=null;renderUnpaid()};
$('u-rangebtn').onclick=()=>openLedPick('u');
$('s-share').onclick=()=>doBackup(true);
$('s-download').onclick=()=>doBackup(false);
$('s-csv').onclick=()=>doCsv(trips,`아빠장부_전체_${todayIso}.xlsx`,costs,'전체 기간');
$('s-import').onchange=e=>{const f=e.target.files&&e.target.files[0];if(f)readImport(f)};
document.addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&e.target.matches('.head,.chead')){e.preventDefault();e.target.click()}});

// ---------- 입력 양식 ----------
function fmtPhone(v){const d=v.replace(/\D/g,'').slice(0,11);
  if(d.startsWith('02')) return d.length<3?d:d.length<6?d.slice(0,2)+'-'+d.slice(2):d.length<10?d.slice(0,2)+'-'+d.slice(2,5)+'-'+d.slice(5):d.slice(0,2)+'-'+d.slice(2,6)+'-'+d.slice(6,10);
  if(d.length===8&&/^1[5-9]/.test(d)) return d.slice(0,4)+'-'+d.slice(4);
  return d.length<4?d:d.length<7?d.slice(0,3)+'-'+d.slice(3):d.length<11?d.slice(0,3)+'-'+d.slice(3,6)+'-'+d.slice(6):d.slice(0,3)+'-'+d.slice(3,7)+'-'+d.slice(7)}
// 입금 금액 칸: 쓰는 대로 쉼표
document.addEventListener('input',e=>{if(e.target.matches&&e.target.matches('.payamt')){const n=e.target.value.replace(/\D/g,'').slice(0,12);e.target.value=n?comma(Number(n)):''}});
document.querySelectorAll('.phone').forEach(i=>i.addEventListener('input',e=>{e.target.value=fmtPhone(e.target.value)}));
// 어떤 콜: formSrc는 고른 아이콘(원콜 · 전국24시콜 · 기타). 기타면 직접 쓴 이름이 저장됨 (안 쓰면 '기타')
// 자주 가는 상하차지: 같은 시·군으로 전에 적은 상세주소 · 담당자 · 연락처를 눌러서 한 번에 채움 (상차·하차 기록 모두에서)
let placeOpts={from:[],to:[]};
function placesFor(city){
  const c=sNorm(city); if(!c)return [];
  const m=new Map();
  trips.forEach(t=>[['from','fromAddr','fromName','fromPhone'],['to','toAddr','toName','toPhone']].forEach(([a,b,n,p])=>{
    if(sNorm(t[a])!==c||!(t[b]||t[n]||t[p]))return;
    const key=[t[b],t[n],t[p]].join('|'), o=m.get(key)||{addr:t[b],name:t[n],phone:t[p],cnt:0,last:''};
    o.cnt++; if(t.date>o.last)o.last=t.date; m.set(key,o);
  }));
  trips.forEach(t=>stopsOf(t).forEach(x=>{
    if(sNorm(x.c)!==c||!(x.a||x.n||x.p))return;
    const key=[x.a||'',x.n||'',x.p||''].join('|'), o=m.get(key)||{addr:x.a||'',name:x.n||'',phone:x.p||'',cnt:0,last:''};
    o.cnt++; if(t.date>o.last)o.last=t.date; m.set(key,o);
  }));
  return [...m.values()].sort((x,y)=>y.last.localeCompare(x.last)||y.cnt-x.cnt).slice(0,4);
}
function renderPlaces(side){
  const box=$('pl-'+side); if(!box)return;
  const l=placesFor($('f-'+side).value), cur=[$('f-'+side+'addr').value,$('f-'+side+'name').value,$('f-'+side+'phone').value].join('|');
  placeOpts[side]=l;
  box.innerHTML=l.map((o,i)=>`<button type="button" data-place="${side}" data-i="${i}" aria-pressed="${[o.addr,o.name,o.phone].join('|')===cur}">${esc([o.addr,o.name,o.phone].filter(Boolean).join(' · '))}</button>`).join('');
}
['from','to'].forEach(s=>['input','change'].forEach(ev=>$('f-'+s).addEventListener(ev,()=>renderPlaces(s))));
let formPt='인수증', formSrc='';
const SRC_MAIN=['원콜','전국24시콜'];
const srcValue=()=>formSrc==='기타'?($('f-srctext').value.trim()||'기타'):formSrc;
function paintSrc(){
  document.querySelectorAll('#f-src [data-src]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.src===formSrc));
  $('f-srcetc').hidden=formSrc!=='기타';
  if(formSrc==='기타'){ // 전에 직접 쓴 콜 이름을 눌러서 바로 넣기
    const c={};trips.forEach(t=>{if(t.src&&!SRC_MAIN.includes(t.src)&&t.src!=='기타')c[t.src]=(c[t.src]||0)+1});
    $('r-src').innerHTML=Object.keys(c).sort((a,b)=>c[b]-c[a]).slice(0,5).map(v=>`<button type="button" data-srcv="${esc(v)}">${esc(v)}</button>`).join('');
  }
}
// 저장된 값으로 화면 맞추기 (원콜 · 전국24시콜 · 기타 · 직접 쓴 이름)
function setSrc(v){formSrc=!v?'':SRC_MAIN.includes(v)?v:'기타';$('f-srctext').value=formSrc==='기타'&&v!=='기타'?v:'';paintSrc()}
// 등록 양식의 추가 상차지 · 하차지 (+ 상차지 추가 · + 하차지 추가)
function stopBlk(k,x,i){return `<div class="xstop" data-k="${k}"><div class="xh"><b><i class="mk ${k}"></i>${k==='from'?'상차지':'하차지'} ${i+2}</b><button type="button" class="xdel" data-delstop>빼기</button></div>`
  +`<input type="text" class="xc" placeholder="시·군 (예: ${k==='from'?'안산':'청주'})" value="${esc(x.c||'')}" aria-label="${k==='from'?'상차지':'하차지'} ${i+2} 시·군">`
  +`<div class="recent">${topVals(k).map(v=>`<button type="button" data-xfill="${esc(v)}">${esc(v)}</button>`).join('')}</div><div class="places xpl"></div>`
  +`<input type="text" class="xa addrin" placeholder="상세주소" value="${esc(x.a||'')}" aria-label="${k==='from'?'상차지':'하차지'} ${i+2} 상세주소">`
  +`<div class="contact"><input type="text" class="xn" placeholder="담당자" value="${esc(x.n||'')}" aria-label="담당자 이름"><input type="tel" class="xp phone" inputmode="tel" placeholder="연락처" value="${esc(x.p||'')}" aria-label="연락처"></div></div>`}
function readStops(all){return [...document.querySelectorAll('#f .xstop')].map(el=>({k:el.dataset.k,c:el.querySelector('.xc').value.trim(),a:el.querySelector('.xa').value.trim(),n:el.querySelector('.xn').value.trim(),p:el.querySelector('.xp').value.trim()})).filter(x=>all||x.c||x.a||x.n||x.p)}
function renderStops(list){['from','to'].forEach(k=>{$('f-x'+k).innerHTML=(list||[]).filter(x=>x.k===k).map((x,i)=>stopBlk(k,x,i)).join('')});document.querySelectorAll('#f .xstop').forEach(renderXPlaces)}
// 추가한 곳의 시·군을 적거나 고르면: 그 시·군으로 전에 적은 주소 · 담당자 · 연락처
function renderXPlaces(el){const q=sel=>el.querySelector(sel), l=placesFor(q('.xc').value), cur=[q('.xa').value,q('.xn').value,q('.xp').value].join('|');el._pl=l;
  q('.xpl').innerHTML=l.map((o,i)=>`<button type="button" data-xplace="${i}" aria-pressed="${[o.addr,o.name,o.phone].join('|')===cur}">${esc([o.addr,o.name,o.phone].filter(Boolean).join(' · '))}</button>`).join('');
  el.querySelectorAll('[data-xfill]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.xfill===q('.xc').value.trim()))}
$('f').addEventListener('input',e=>{if(e.target.classList.contains('xc'))renderXPlaces(e.target.closest('.xstop'))});
$('f').addEventListener('input',e=>{if(e.target.classList.contains('xp'))e.target.value=fmtPhone(e.target.value)});
const readForm=()=>({src:srcValue(),date:$('f-date').value,toDate:$('f-todate').value,from:$('f-from').value.trim(),to:$('f-to').value.trim(),
  fromAddr:$('f-fromaddr').value.trim(),toAddr:$('f-toaddr').value.trim(),payType:formPt,client:$('f-client').value.trim(),
  clientPhone:$('f-clientphone').value.trim(),fromPhone:$('f-fromphone').value.trim(),toPhone:$('f-tophone').value.trim(),
  clientName:$('f-clientname').value.trim(),fromName:$('f-fromname').value.trim(),toName:$('f-toname').value.trim(),
  amount:Number($('f-amt').value.replace(/\D/g,'')),fee:Number($('f-fee').value.replace(/\D/g,''))||0,memo:$('f-memo').value.trim(),stops:(l=>l.length?JSON.stringify(l):'')(readStops().filter(x=>x.c))});
function formMissing(f){if(readStops().some(x=>!x.c))return ['추가한 곳의 시·군'];return [!f.date&&'상차일',!f.from&&'상차지',!f.to&&'하차지',!f.amount&&'운임',!f.memo&&'메모'].filter(Boolean)}
['f-amt','f-fee'].forEach(id=>$(id).addEventListener('input',e=>{const n=e.target.value.replace(/\D/g,'').slice(0,12);e.target.value=n?comma(Number(n)):''}));
function setPt(v){formPt=v;document.querySelectorAll('#f-pt [data-pt]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.pt===v))}
// 등록 화면 위쪽: [운행 기록 | 지출 기록] 고르기, 제목·취소 버튼은 지금 하는 일에 맞춤
let formKind='trip', costEditId=null, costCat='';
function setMode(){
  const cost=formKind==='cost', ed=cost?costEditId!==null:editingId!==null;
  $('f-title').textContent=(cost?'지출 ':'운행 ')+(ed?'수정':'등록');
  $('f-submit').textContent=editingId!==null?'수정 저장':'저장';
  $('cf-submit').textContent=costEditId!==null?'수정 저장':'지출 저장';
  $('f-cancel').hidden=!ed;
  $('f-kind').hidden=editingId!==null||costEditId!==null;
  $('f').hidden=cost; $('cf').hidden=!cost;
  if(cost)$('f-draft').hidden=true;
  document.querySelectorAll('#f-kind [data-fkind]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.fkind===formKind));
}
function setKind(k){formKind=k;setMode();if(k==='cost')renderCostRecent();else loadDraftNew()}

// ---------- 지출 기록 ----------
function setCat(c){costCat=c;document.querySelectorAll('#cf-cat [data-cat]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.cat===c))}
function resetCost(){costEditId=null;$('cf').reset();$('cf-date').value=todayIso;$('cf-err').textContent='';setCat('');setMode()}
// 방금 적은 지출 확인용: 최근 5건
function renderCostRecent(){
  const l=[...costs].sort((a,b)=>(b.createdAt||0)-(a.createdAt||0)).slice(0,5);
  $('cf-recent').innerHTML=costEditId!==null||!l.length?'':'<span>최근 적은 지출</span>'+l.map(c=>`<span>${md(c.date)} <b>${esc(c.cat)}</b> ${comma(c.amount)}원${c.memo?' · '+esc(c.memo):''}</span>`).join('');
}
function startCostEdit(c){
  if(!c)return;
  backView=view==='add'?'ledger':view;
  resetCost(); costEditId=c.id; formKind='cost';
  $('cf-date').value=c.date; setCat(c.cat||'기타'); $('cf-amt').value=comma(c.amount); $('cf-memo').value=c.memo||'';
  setMode(); renderCostRecent();
  view='add'; costOpen=costDel=null; pushOverlay({cedit:true,v:'add'}); render(); window.scrollTo(0,0);
}
$('cf-amt').addEventListener('input',e=>{const n=e.target.value.replace(/\D/g,'').slice(0,12);e.target.value=n?comma(Number(n)):''});
$('cf').addEventListener('submit',e=>{
  e.preventDefault();
  const date=$('cf-date').value, amount=Number($('cf-amt').value.replace(/\D/g,'')), memo=$('cf-memo').value.trim();
  const miss=[!date&&'날짜',!costCat&&'항목',!amount&&'금액'].filter(Boolean);
  if(miss.length){$('cf-err').textContent=`${miss.join(', ')}을(를) 입력해 주세요.`;return}
  const d=parseD(date); ledY=d.getFullYear(); ledM=d.getMonth(); ledKind='cost'; if(ledRange&&!inRange({date},ledRange))ledRange=null;
  if(costEditId!==null){
    const c=store.get(costEditId);
    if(!c){resetCost();popOverlay('cedit');go(backView);return}
    const before={...c}; Object.assign(c,{date,cat:costCat,amount,memo}); saveTrip(c);
    const id=c.id; resetCost(); view=backView; costOpen=id; popOverlay('cedit'); render(); window.scrollTo(0,0);
    toast('지출을 고쳤어요',()=>{Object.assign(c,before);saveTrip(c)});
    return;
  }
  const c=normalize({id:newId(),createdAt:Date.now(),updatedAt:0,kind:'cost',date,cat:costCat,amount,memo});
  saveTrip(c);
  // 주유·통행료처럼 이어서 적는 경우가 많아 화면은 그대로 두고 날짜만 유지
  resetCost(); $('cf-date').value=date; renderCostRecent();
  toast(`${c.cat} ${comma(amount)}원 저장했어요`,()=>{removeTrip(c);renderCostRecent()});
});

// ---------- 업데이트 내용 (설정 맨 아래) ----------
// 새 버전을 올릴 때 맨 위에 한 줄씩 추가 (v는 sw.js VERSION과 같게)
const CHANGES=[
  {v:'1.14.0',d:'10/26',items:['설정 › 서류 › 고소장 만들기: 칸을 채우면 경찰서 고소장 엑셀 양식에 그대로 넣어서 저장 (육하원칙으로 범죄사실 문장 만들기)','운행 상세의 [또 등록] 자리에 [고소장]: 그 운행의 화주 · 날짜 · 못 받은 운임으로 고소장 칸을 채워서 열기','등록: 상차지 · 하차지 여러 곳 (+ 상차지 추가 · + 하차지 추가)','등록: 하차일은 [하차일 더보기]를 눌러야 펼쳐짐','화주 한눈에 보기: 연락처 → 못 받은 돈 → 숫자 요약 순서로','전에 갔던 곳 버튼을 크고 누르기 쉽게']},
  {v:'1.13.0',d:'10/20',items:['등록할 때 전에 적은 화주면 화주 칸 아래에 한 줄로: 받음 · 못 받음(남은 돈)','운행 상세에 [또 등록]: 같은 운행을 날짜만 오늘로 바꿔 바로 등록','오래 못 받은 돈 알림: 달력 맨 위에 며칠 넘은 미수 건수 · 금액 (설정에서 끄기 · 14~90일)','설정 › 세금 신고용 정리: 부가세(반기) · 종합소득세(1년) 매출 · 계산서 · 경비 합계와 세무사용 엑셀','엑셀로 보내기를 진짜 엑셀 파일로: 요약 · 운행 · 지출 시트, 칸 너비 · 제목 줄 · 금액 쉼표 · 입금 상태 색 · 합계']},
  {v:'1.12.1',d:'10/20',items:['화주 한눈에 보기: [못 받은 돈 보기] 버튼에 남은 돈 합계 · 건수 · 가장 오래된 날 표시','화주 한눈에 보기의 최근 운행도 일부 받은 건은 남은 돈으로 표시']},
  {v:'1.12.0',d:'10/17',items:['고침: 상차 완료 · 하차 완료 버튼과 지출 목록 누르기가 안 되던 문제','자주 가는 상하차지: 시·군을 고르면 전에 적은 상세주소 · 담당자 · 연락처를 눌러서 한 번에','앞으로 할 운행은 받을 돈에서 회색 「예정」으로 따로 (미수 합계에서 빠짐)','화주 이름을 누르면 한눈에 보기 (운행 수 · 못 받은 돈 · 평균 입금 일수 · 최근 운행)']},
  {v:'1.11.0',d:'10/17',items:['받을 돈 [목록 | 달력]: 달력에선 안 받은 날만 금액 · 누르면 그날 건, 오래될수록 진한 빨강','화면 역할 정리: 달력=일정과 금액 · 받을 돈=수금 · 장부=정산','받을 돈 · 장부의 기간 고르기 창과 찾기 칸을 같은 모양으로','받을 돈 순서: 오래된 것 위로 · 최근 것 위로','문자 보낸 날 색 구분 (오늘 · 1~3일 · 4~7일 · 8일 넘음)','돈을 일부만 받으면 받은 금액을 적고 남은 돈 표시']},
  {v:'1.10.0',d:'10/12',items:['하차일 따로 적기','달력 [운임 보기 · 상차 일정 · 하차 일정] · 날짜 목록을 상차 / 하차로 나눠 보기','건마다 ① 상차 → ② 하차 순서로 완료 표시 (운송 중 · 하차 완료)']},
  {v:'1.9.0',d:'10/12',items:['정산 문자를 보내면 그 건에 "문자 ○일 전" 표시','계산서 발행 표시 · 장부에서 계산서 미발행 건만 모아 보기','장부 순수익을 [전체 / 들어온 돈] 기준으로 바꿔 보기','장부 · 설정 화면 깔끔하게 정리','상차지 · 하차지 주소를 누르면 지도 · 내비 앱으로 길 안내','앱을 켜 둔 채 날짜가 바뀌면 등록 날짜도 오늘로','설정에서 업데이트 내용 보기']},
  {v:'1.8.0',d:'10/11',items:['등록할 때 어떤 콜(원콜 · 전국24시콜 · 기타)인지 고르기','목록에 콜 마크와 화주 담당자 · 연락처 항상 표시','검색에서 찾을 곳 고르기 (자동 · 화주 · 콜 · 지역 · 주소 · 메모)','링크로 열면 바로 앱 설치 화면']},
  {v:'1.7.0',d:'10/11',items:['새 디자인 (가운데 큰 등록 버튼)','날짜를 눌러 원하는 날 · 달 · 기간으로 이동','장부 위에 순수익 표시']},
  {v:'1.6.0',d:'10/10',items:['설정에 내 정보 (차량 번호 · 이름 · 계좌)','건마다 정산 문자 (계산서 발행 시 +10%)']},
  {v:'1.5.0',d:'10/10',items:['지출 기록과 순수익','장부에서 운행 / 지출 나눠 보기','글씨 크기 설정']},
  {v:'1.4.2',d:'10/10',items:['새 버전이 나오면 앱을 열 때 자동으로 바뀜','클라우드는 바뀐 기록만 주고받음']},
  {v:'1.4.1',d:'10/10',items:['이름을 아빠장부로 · 새 트럭 아이콘 · 시작 화면']},
  {v:'1.3.7',d:'10/10',items:['적는 중인 내용 임시 저장 · 고치다 나가면 돌아갈지 물어봄']},
];
// 최신 것만 펼쳐 두고, 예전 것은 3개까지만 보이다가 [이전 업데이트 더 보기]로 전부
let chgAll=false;
function renderChanges(){
  const el=$('s-changes'); if(!el)return;
  const SHOW=3, list=chgAll?CHANGES:CHANGES.slice(0,SHOW);
  el.innerHTML=list.map((c,i)=>`<details class="chg"${i===0?' open':''}><summary><b class="num">${c.v}</b>${i===0?'<span class="newb">최신</span>':''}<span class="num cd">${c.d}</span>${ic(P.chev)}</summary><ul>${c.items.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></details>`).join('')
    +(CHANGES.length>SHOW?`<button type="button" class="chgmore" id="s-chgmore">${chgAll?'접기':`이전 업데이트 ${CHANGES.length-SHOW}개 더 보기`}${ic(chgAll?'M6 15l6-6 6 6':P.chev)}</button>`:'');
  const b=$('s-chgmore'); if(b)b.onclick=()=>{chgAll=!chgAll;renderChanges()};
}
renderChanges();
// ---------- 글씨 크기 ----------
function setTextSize(z){
  ls.set('textSize',z);
  if(z)document.documentElement.setAttribute('data-text',z);else document.documentElement.removeAttribute('data-text');
  document.querySelectorAll('#s-text [data-tsize]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.tsize===z));
}
setTextSize(ls.get('textSize')||'');
setSrcMark(srcMark);
setLate(lateDays);
function resetForm(keepDraft){if(editingId!==null&&!keepDraft)ls.set('draftEdit','');editingId=null;$('f').reset();$('f-date').value=todayIso;$('f-err').textContent='';setPt('인수증');setSrc('');$('f-more').open=false;$('f-todmore').open=false;setMode(false);showDraftNote('');renderStops([]);paintTod();renderPlaces('from');renderPlaces('to');renderCPast()}
// 하차일 [같은 날 · 다음 날 · 모레] 중 지금 값에 맞는 버튼 표시 (비어 있으면 같은 날)
// 하차일은 [+ 하차일]을 눌러야 펼쳐짐 · 날짜가 있으면(수정 · 또 등록 · 적던 것) 펼쳐서 보여줌
function paintTod(){const d=$('f-date').value,v=$('f-todate').value,n=v&&d?Math.round((parseD(v)-parseD(d))/86400000):0;
  $('f-todlbl').textContent=v?'하차일':'하차일 더보기'; $('f-todsum').textContent=v?`${md(v)}${n===1?' (다음 날)':n===2?' (모레)':n===0?' (같은 날)':''}`:''; if(v)$('f-todmore').open=true;
  document.querySelectorAll('#f [data-tod]').forEach(b=>b.setAttribute('aria-pressed',Number(b.dataset.tod)===n&&(!v||n>0||!!d)))}
['input','change'].forEach(ev=>{$('f-date').addEventListener(ev,paintTod);$('f-todate').addEventListener(ev,paintTod)});
// 담당자·연락처가 적혀 있으면 그 칸을 펼쳐서 보여줌
function syncMore(){if($('f-fee').value.trim())$('f-more').open=true}

// ---------- 적는 중 임시 저장 ----------
// 저장 버튼을 누르기 전 내용도 이 휴대폰에 바로 보관 → 새로고침하거나 앱이 닫혀도 이어서 쓸 수 있음
// draftNew: 새로 적던 것 (저장하거나 [새로 쓰기]를 누를 때까지) · draftEdit: 고치던 것 (수정 저장·취소하면 지움)
const F_IDS=['f-date','f-todate','f-client','f-clientname','f-clientphone','f-from','f-fromaddr','f-fromname','f-fromphone','f-to','f-toaddr','f-toname','f-tophone','f-amt','f-fee','f-memo'];
const readDraft=k=>{try{return JSON.parse(ls.get(k)||'null')}catch(_){return null}};
function formSnap(){const v={};F_IDS.forEach(id=>v[id]=$(id).value);return {v,stops:readStops(true),src:srcValue(),pt:formPt,paid:$('f-paidnow').checked,tax:$('f-taxnow').checked,more:$('f-more').open}}
function saveDraft(){
  if(view!=='add'||formKind==='cost')return;
  if(editingId!==null){ls.set('draftEdit',JSON.stringify({id:editingId,back:backView,orig:editOrig,...formSnap()}));return}
  const s=formSnap(), blank=F_IDS.every(id=>id==='f-date'||!s.v[id].trim())&&!readStops().length&&s.pt==='인수증'&&!s.paid&&!s.tax&&!s.src;
  ls.set('draftNew',blank?'':JSON.stringify(s));
}
function fillSnap(s){F_IDS.forEach(id=>{if(typeof s.v[id]==='string')$(id).value=s.v[id]});renderStops(s.stops||[]);setPt(s.pt||'인수증');setSrc(s.src||'');$('f-paidnow').checked=!!s.paid;$('f-taxnow').checked=!!s.tax;$('f-more').open=!!s.more;syncMore();paintTod();renderPlaces('from');renderPlaces('to');renderCPast()}
function showDraftNote(msg,canDiscard){$('f-draftmsg').textContent=msg;$('f-discard').hidden=!canDiscard;$('f-draft').hidden=!msg||formKind==='cost'}
function loadDraftNew(){const s=readDraft('draftNew');if(s&&s.v){fillSnap(s);showDraftNote('적던 내용을 불러왔어요.',true)}}
// 고친 게 있는지 비교할 때 쓰는 값 (더보기 펼침 여부는 빼고)
const snapKey=s=>JSON.stringify([s.v,s.pt,s.paid,!!s.tax,s.src||'',(s.stops||[]).filter(x=>x.c||x.a||x.n||x.p)]);
let editOrig='';
// 수정하다가 [수정 저장]·[수정 취소] 없이 나가면(탭 이동·뒤로 버튼) 고친 내용을 보관하고 돌아갈지 물어봄
function leaveEdit(){
  const changed=snapKey(formSnap())!==editOrig;
  if(changed)ls.set('draftEdit',JSON.stringify({id:editingId,back:backView,orig:editOrig,left:true,...formSnap()}));
  resetForm(changed);
  if(changed)showAsk();
}
function showAsk(){$('askbar').hidden=false;document.body.classList.add('asking')}
function hideAsk(){$('askbar').hidden=true;document.body.classList.remove('asking')}
$('ask-back').onclick=()=>{
  hideAsk();
  const s=readDraft('draftEdit'), t=s&&store.get(String(s.id));
  if(!t||t.deleted){ls.set('draftEdit','');toast('그 기록이 지워져서 돌아갈 수 없어요.');return}
  if(selMode)exitSelect();
  uPanel=false;
  startEdit(t); fillSnap(s);
  if(s.orig)editOrig=s.orig;
  if(s.back&&s.back!=='add')backView=s.back;
  showDraftNote('고치던 내용을 불러왔어요.',false); saveDraft();
};
$('ask-drop').onclick=()=>{hideAsk();ls.set('draftEdit','');toast('고치던 내용을 버렸어요.')};
// 고치던 기록이 있으면 그 수정 화면으로 다시 열기 (실수로 나갔던 거면 돌아갈지 물어봄)
function loadDraftEdit(){
  const s=readDraft('draftEdit'), t=s&&store.get(String(s.id));
  if(!t||t.deleted){ls.set('draftEdit','');return false}
  if(s.left){showAsk();return false}
  view=s.back&&s.back!=='add'?s.back:'ledger';
  if(view!=='cal')history.pushState({lvl:2,v:view},'');
  startEdit(t); fillSnap(s); if(s.orig)editOrig=s.orig; showDraftNote('고치던 내용을 불러왔어요.',false);
  return true;
}
$('f').addEventListener('input',saveDraft);
$('f').addEventListener('change',saveDraft);
$('f').addEventListener('click',()=>setTimeout(saveDraft,0)); // 최근 지역·금액 버튼 등 글자 입력 없이 바뀌는 것
$('f-more').addEventListener('toggle',saveDraft);
$('f-discard').onclick=()=>{resetForm();ls.set('draftNew','');$('f-date').focus()};
function startEdit(t){
  if(!t)return;
  backView=view==='add'?'ledger':view;
  formKind='trip'; resetForm(); editingId=t.id; setMode();
  fillTrip(t);
  $('f-paidnow').checked=!!t.paid; $('f-taxnow').checked=!!t.tax;
  syncMore();
  editOrig=snapKey(formSnap()); hideAsk();
  view='add'; payingId=deletingId=null; pushOverlay({edit:true,v:'add'}); render(); window.scrollTo(0,0);
}
function fillTrip(t){
  setSrc(t.src||''); $('f-todate').value=t.toDate||''; paintTod();
  $('f-date').value=t.date; $('f-client').value=t.client||'';
  $('f-from').value=t.from; $('f-fromaddr').value=t.fromAddr||'';
  $('f-to').value=t.to; $('f-toaddr').value=t.toAddr||'';
  $('f-amt').value=comma(t.amount); setPt(t.payType||'인수증');
  $('f-fee').value=t.fee?comma(t.fee):''; $('f-memo').value=t.memo||'';
  $('f-clientphone').value=t.clientPhone||''; $('f-fromphone').value=t.fromPhone||''; $('f-tophone').value=t.toPhone||'';
  $('f-clientname').value=t.clientName||''; $('f-fromname').value=t.fromName||''; $('f-toname').value=t.toName||'';
  renderStops(stopsOf(t)); paintTod(); renderPlaces('from'); renderPlaces('to'); renderCPast();
}
// 등록할 때 전에 적었던 화주면 한 줄로: 받음 몇 건 · 못 받음 몇 건(남은 돈) · [자세히]
function renderCPast(){
  const name=$('f-client').value.trim(), box=$('f-cpast');
  const ts=name?trips.filter(t=>t.id!==editingId&&(t.client||'').trim().toLowerCase()===name.toLowerCase()):[];
  box.hidden=!ts.length; if(!ts.length){box.innerHTML='';return}
  const paid=ts.filter(t=>t.paid).length, due=ts.filter(t=>!t.paid&&!isPlan(t)), dueSum=due.reduce((s,t)=>s+left(t),0);
  box.innerHTML=`<span class="cpo">받음 ${paid}</span>`
    +(due.length?`<span class="cpn">못 받음 ${due.length} · ${short(dueSum)}원</span>`:'<span class="cpo">밀린 돈 없음</span>')
    +`<button type="button" class="linkbtn" data-do="client" data-c="${esc(ts[0].client)}">자세히</button>`;
}
$('f-client').addEventListener('input',renderCPast);
// 또 등록: 이 운행 그대로(화주·담당자·상차지·하차지·운임·메모) 새 등록 화면에 채움
// 상차일은 오늘, 하차일은 원래처럼 며칠 뒤 · 입금 · 계산서 · 상차/하차 완료는 비워 둠
function againTrip(t){
  if(!t)return;
  // 묻지 않고 바로 등록 화면으로 (적던 내용이 있었으면 알림의 [되돌리기]로 다시 불러옴)
  const prev=readDraft('draftNew');
  navTab('add');
  formKind='trip'; resetForm(); fillTrip(t);
  const n=t.toDate?Math.round((parseD(t.toDate)-parseD(t.date))/86400000):0;
  $('f-date').value=todayIso; $('f-todate').value=n>0?iso(new Date(TODAY.getTime()+n*86400000)):''; paintTod();
  syncMore(); saveDraft();
  showDraftNote(`${md(t.date)} ${t.from} → ${t.to} 운행을 그대로 채웠어요. 날짜 · 운임만 확인하고 저장하세요.`,true);
  window.scrollTo(0,0);
  if(prev&&prev.v)toast('적던 내용 대신 이 운행으로 채웠어요',()=>{if(view!=='add')navTab('add');resetForm();fillSnap(prev);saveDraft();showDraftNote('적던 내용을 다시 불러왔어요.',true)});
}
$('f-cancel').onclick=()=>{
  if(costEditId!==null){const id=costEditId;resetCost();view=backView;costOpen=id;popOverlay('cedit');render();window.scrollTo(0,0);return}
  const id=editingId;resetForm();view=backView;openId=id;popOverlay('edit');render();window.scrollTo(0,0)};
$('f').addEventListener('submit',e=>{
  e.preventDefault();
  const f=readForm(), miss=formMissing(f), date=f.date;
  if(miss.length){$('f-err').textContent=`${miss.join(', ')}을(를) 입력해 주세요.`;return}
  if(f.toDate&&f.toDate<f.date){$('f-err').textContent='하차일이 상차일보다 빨라요. 날짜를 확인해 주세요.';return}
  if(f.toDate===f.date)f.toDate=''; // 같은 날이면 비워 둠 (상차일과 같은 날로 봄)
  if(editingId!==null){
    const t=store.get(editingId);
    if(!t){resetForm();popOverlay('edit');go(backView);return}
    const before={...t};
    Object.assign(t,f,{paid:$('f-paidnow').checked?(t.paid||todayIso):null,tax:$('f-taxnow').checked?(t.tax||todayIso):''});
    saveTrip(t);
    const id=t.id; resetForm();
    if(backView==='cal'){const d=parseD(date);calY=d.getFullYear();calM=d.getMonth();calSel=date}
    if(backView==='ledger'&&!(ledRange&&inRange({date},ledRange))){const d=parseD(date);ledY=d.getFullYear();ledM=d.getMonth();ledRange=null}
    view=backView; openId=id; popOverlay('edit'); render(); window.scrollTo(0,0);
    toast('수정했어요',()=>{Object.assign(t,before);saveTrip(t)});
    return;
  }
  const t={id:newId(),createdAt:Date.now(),updatedAt:0,deleted:false,...f,paid:$('f-paidnow').checked?date:null,tax:$('f-taxnow').checked?todayIso:''};
  saveTrip(t);
  calY=parseD(date).getFullYear();calM=parseD(date).getMonth();calSel=date;calFilter='all';
  resetForm(); ls.set('draftNew',''); goCal();
  toast(`${cities(f,'from')}→${cities(f,'to')} 저장했어요`,()=>removeTrip(t));
});

// ---------- 시작 ----------
document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState==='visible'&&iso(new Date())!==todayIso){
    // 밤새 켜 둔 앱: 등록 칸이 어제 날짜 그대로면 오늘로 (고치는 중이거나 일부러 바꾼 날짜는 그대로)
    const old=todayIso; setToday();
    if(editingId===null&&$('f-date').value===old){$('f-date').value=todayIso;saveDraft()}
    if(costEditId===null&&$('cf-date').value===old)$('cf-date').value=todayIso;
    if(view!=='add')render()
  }
});
window.addEventListener('online',renderSettings);window.addEventListener('offline',renderSettings);
(async function boot(){
  Updater.init();
  resetForm(); resetCost();
  try{
    await DB.open();
    (await DB.all()).forEach(r=>{if(validRecord(r))store.set(String(r.id),normalize(r))});
  }catch(e){
    console.error(e);
    toast('휴대폰 저장소를 열지 못했어요. 크롬 앱에서 열었는지 확인해 주세요.');
  }
  const y=loadSpot();
  history.replaceState({lvl:0},''); history.pushState({lvl:1,v:'cal'},'');
  rebuild();
  if(loadDraftEdit()){/* 수정 화면으로 복원 */}
  else{
    if(view!=='cal')history.pushState({lvl:2,v:view},'');
    loadDraftNew(); render();
    if(y)requestAnimationFrame(()=>window.scrollTo(0,y));
  }
  try{navigator.storage&&navigator.storage.persist&&navigator.storage.persist()}catch(_){}
  Cloud.init();
})();
