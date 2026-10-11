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
const STR=['date','client','clientName','clientPhone','from','fromAddr','fromName','fromPhone','to','toAddr','toName','toPhone','payType','memo','kind','cat','src'];
function normalize(r){
  const t={id:String(r.id),createdAt:Number(r.createdAt)||Number(r.updatedAt)||Date.now(),updatedAt:Number(r.updatedAt)||0,deleted:!!r.deleted,
    amount:Math.max(0,Math.round(Number(r.amount)||0)),fee:Math.max(0,Math.round(Number(r.fee)||0)),paid:r.paid?String(r.paid):null};
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
let ledFilter='all', calFilter='all', ledKind='trip'; // ledKind: 장부에서 운행/지출 중 무엇을 볼지
let editingId=null, backView='ledger';
let ledRange=null; // 장부: 하루·기간을 고르면 {start,end}, 아니면 ledY/ledM 한 달
const pass=(t,f)=>f==='paid'?!!t.paid:f==='due'?!t.paid:true;
const EMPTY={all:'기록이 없어요.',paid:'받은 돈 기록이 없어요.',due:'못 받은 돈이 없어요.'};
function segHtml(which,list,cur){
  const n={all:list.length,paid:list.filter(t=>t.paid).length,due:list.filter(t=>!t.paid).length};
  return [['all','전체'],['paid','받은 돈'],['due','못 받은 돈']].map(([k,l])=>
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
const routeHtml=t=>`${esc(t.from)} → ${esc(t.to)}`;
const telHref=p=>'tel:'+p.replace(/\D/g,'');
// 선 아이콘 (그림 문자 대신)
const ic=d=>`<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg>`;
const P={arrow:'M5 12h14M13 6l6 6-6 6',chev:'M6 9l6 6 6-6',check:'M5 12l5 5L20 7',edit:'M4 20h4L19 9l-4-4L4 16z',trash:'M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13',
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
function addrBlk(label,mk,city,addr,phone,name){
  return `<div class="blk"><span class="bl"><i class="mk ${mk}"></i>${label}</span><div class="addr"><b>${esc(city)}</b>${addr?esc(addr):'<span class="na">상세주소 없음</span>'}</div>${ctHtml(phone,name)}</div>`;
}
// 장부를 여러 달에 걸친 기간으로 보면 날짜 옆에 월도 표시
const ledMulti=()=>!!ledRange&&ledRange.start.slice(0,7)!==ledRange.end.slice(0,7);
// 어떤 콜로 받은 운행인지 (등록 화면에서 앱 아이콘처럼 고름) · 화주 옆에 작은 표시
const SRC=[{k:'원콜',ico:'1',cls:'s1'},{k:'전국24시콜',ico:'24',cls:'s2'},{k:'기타',ico:'…',cls:'s3'}];
const srcBadge=t=>t.src?`<span class="srcb ${(SRC.find(s=>s.k===t.src)||SRC[2]).cls}">${esc(t.src)}</span>`:'';
// 화주 옆에 늘: 담당자 · 연락처 (번호를 누르면 전화)
const cInfo=t=>t.clientName||t.clientPhone?`<span class="cinfo">${t.clientName?`<span class="cn">${esc(t.clientName)}</span>`:''}${t.clientPhone?`<a class="cp num" href="${telHref(t.clientPhone)}">${ic(P.phone)}${esc(t.clientPhone)}</a>`:''}</span>`:'';
// mode: unpaid(받을 돈) · ledger(달력의 하루 목록) · month(장부: 날짜를 왼쪽에 둔 한 줄)
function rowHtml(t,mode){
  const open=openId===t.id;
  const client=`<span class="client${t.client?'':' none'}">${t.client?esc(t.client):'화주 미입력'}</span>`;
  const amt=`<b class="amt num ${t.paid?'c-paid':'c-due'}">${comma(t.amount)}</b>`;
  const attrs=`data-do="open" data-id="${t.id}" role="button" tabindex="0" aria-expanded="${open}"`;
  const head=mode==='month'
    ?`<div class="head mini" ${attrs}><span class="dt">${ledMulti()?`<small class="mon num">${Number(t.date.slice(5,7))}월</small>`:''}<b class="num">${Number(t.date.slice(8,10))}</b><small>${wdOf(t.date)}</small></span><span class="cwrap">${client}${srcBadge(t)}${cInfo(t)}</span>${amt}
      <span class="rt2">${routeHtml(t)}${t.memo?` · <span class="memo">${esc(t.memo)}</span>`:''}</span><span class="st ${t.paid?'c-paid':'c-due'}">${t.paid?'받음':'미수'}</span></div>`
    :`<div class="head" ${attrs}><span class="cwrap">${client}${srcBadge(t)}${cInfo(t)}</span>${amt}
      <div class="route"><span class="rt">${esc(t.from)}${ic(P.arrow)}${esc(t.to)}</span>${t.memo&&!open?`<span class="memo">${esc(t.memo)}</span>`:''}</div>
      <div class="meta"><span class="num">${md(t.date)}</span><span class="chip pt">${esc(t.payType||'인수증')}</span>${ageChip(t)}<span class="end"><span class="more">${open?'접기':'상세'}${ic(P.chev)}</span></span></div></div>`;
  let detail='';
  if(open){
    detail=`<div class="detail"><div class="blk"><span class="bl">화주</span><div class="addr">${t.client?`<b>${esc(t.client)}</b>`:'<span class="na">화주 미입력</span>'}</div>${ctHtml(t.clientPhone,t.clientName)}</div>`
      +addrBlk('상차','from',t.from,t.fromAddr,t.fromPhone,t.fromName)+addrBlk('하차','to',t.to,t.toAddr,t.toPhone,t.toName)
      +`<div class="blk money"><span class="bl">운임 · ${esc(t.payType||'인수증')}</span><span class="bl">수수료</span><b class="num">${won(t.amount)}</b><span class="num">${t.fee?won(t.fee):'없음'}</span></div>`
      +(mode==='month'?`<div class="blk"><span class="bl">상태</span><div>${dayK(t.date)} 상차 · ${ageChip(t)}</div></div>`:'')
      +(t.memo?`<div class="blk"><span class="bl">메모</span><div>${esc(t.memo)}</div></div>`:'')+`</div>`;
  }
  const B=(cls,act,label,icon)=>`<button type="button" class="btn ${cls}" data-do="${act}" data-id="${t.id}">${icon?ic(icon):''}${label}</button>`;
  let act='';
  if(payingId===t.id){
    act=`<div class="act"><div class="paybox"><label for="pd-${t.id}">언제 받으셨어요?</label><input type="date" id="pd-${t.id}" value="${todayIso}">`
      +`<div class="r1">${B('','paycfm','입금 확인',P.check)}<button type="button" class="btn ghost" data-do="paycancel">취소</button></div></div></div>`;
  } else {
    const main=t.paid?`<div class="r1 one">${B('ghost','unpay','미수로 되돌리기')}</div>`
      :`<div class="r1">${B('','pay','입금 완료',P.check)}${B('ghost','sms','정산 문자')}</div>`;
    const sub=deletingId===t.id?`<div class="r2">${B('danger','delcfm','정말 삭제')}<button type="button" class="btn ghost" data-do="delcancel">취소</button></div>`
      :`<div class="r2">${B('ghost','edit','수정',P.edit)}${B('ghost warn','del','삭제',P.trash)}</div>`;
    if(mode==='unpaid')act=`<div class="act">${main}${open?sub:''}</div>`;
    else if(open)act=`<div class="act">${main}${sub}</div>`;
  }
  return `<div class="row${open?' open':''}${sel.has(t.id)?' checked':''}" data-id="${t.id}"><span class="ck" aria-hidden="true"></span>${head}${detail}${act}</div>`;
}

// ---------- 받을 돈 ----------
const hay=t=>[t.src,t.from,t.fromAddr,t.to,t.toAddr,t.client,t.payType,t.memo,t.clientPhone,t.fromPhone,t.toPhone,t.clientName,t.fromName,t.toName].join(' ').toLowerCase();

// ---------- 찾기: 어디서 찾을지 (자동 · 전체 · 화주 · 지역 · 주소 · 메모) ----------
const SF={client:['client','clientName','clientPhone'],region:['from','to'],addr:['fromAddr','toAddr','fromName','toName'],memo:['memo'],
  phone:['clientPhone','fromPhone','toPhone']};
const SL={auto:'자동',all:'전체',client:'화주',region:'지역',addr:'주소',memo:'메모',phone:'전화번호'};
const SPH={auto:'화주, 지역, 주소, 메모로 찾기',all:'화주, 지역, 주소, 메모로 찾기',client:'화주 이름·담당자·번호로 찾기',
  region:'상차지·하차지 (예: 평택)',addr:'상세주소·현장 담당자로 찾기',memo:'메모 내용으로 찾기'};
const sNorm=s=>String(s||'').toLowerCase().replace(/\s+/g,''); // 띄어쓰기 무시 ("대한 물류" = "대한물류")
const sDigits=s=>String(s||'').replace(/\D/g,'');
// 자동: 적은 말을 실제 기록과 맞춰 보고 무엇을 찾는지 판단
// 숫자만이면 전화번호 · 그 밖엔 이름이 딱 맞음(100점) > 앞부분이 맞음(10점) > 중간에 들어 있음(1점)을 모두 더해 가장 높은 쪽
function guessScope(list,raw){
  const d=sDigits(raw);
  if(d.length>=3&&d.length===raw.replace(/[\s-]/g,'').length)return 'phone';
  const q=sNorm(raw); let best=null;
  ['client','region','addr','memo'].forEach(g=>{
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
let uRange=null, uDraft={start:null,end:null}, uPanel=false, rpY=TODAY.getFullYear(), rpM=TODAY.getMonth();
const rangeTxt=r=>r.start===r.end?md(r.start):`${md(r.start)} ~ ${md(r.end)}`;
function renderRangePanel(){
  $('rp-title').textContent=`${rpY}년 ${rpM+1}월`;
  const first=new Date(rpY,rpM,1).getDay(), days=new Date(rpY,rpM+1,0).getDate();
  const dueDays=new Set(trips.filter(t=>!t.paid).map(t=>t.date));
  const {start,end}=uDraft;
  let h='';
  for(let i=0;i<first;i++) h+='<div class="rday blank"></div>';
  for(let d=1;d<=days;d++){
    const ds=`${rpY}-${pad(rpM+1)}-${pad(d)}`, wd=(first+d-1)%7;
    const c=['rday',wd===0?'sun':wd===6?'sat':'',ds===todayIso?'today':''];
    let tag='';
    if(start&&ds===start){c.push('start');if(end&&end!==start)c.push('hasend');tag='<small>시작</small>'}
    if(end&&ds===end){c.push('end');tag=start===end?'<small>하루</small>':'<small>종료</small>'}
    if(start&&end&&ds>start&&ds<end)c.push('in');
    h+=`<button type="button" class="${c.join(' ')}" data-do="rpick" data-d="${ds}">${d}${tag||(dueDays.has(ds)?'<i class="udot"></i>':'')}</button>`;
  }
  $('rp-grid').innerHTML=h;
  $('rp-hint').textContent=!start?'시작일을 눌러 주세요':!end?`${md(start)}부터 · 종료일을 눌러 주세요`:
    `${rangeTxt(uDraft)} (${Math.round((parseD(end)-parseD(start))/86400000)+1}일)`;
}
function renderUnpaid(){
  const q=$('u-search').value.trim();
  const allDue=trips.filter(t=>!t.paid);
  const base=runSearch(allDue.filter(t=>!uRange||(t.date>=uRange.start&&t.date<=uRange.end)),q,scopeOf('u-scope'),$('u-shint'));
  const cnt={};base.forEach(t=>{const a=ageLevel(t);cnt[a]=(cnt[a]||0)+1});
  if(uAge&&!cnt[uAge])uAge=null;
  $('u-age').classList.toggle('picking',!!uAge);
  $('u-age').innerHTML=`<button type="button" class="chip all" data-age="" aria-pressed="${!uAge}">전체 ${base.length}</button>`+
    AGES.map(([k,l])=>`<button type="button" class="chip ${k}" data-age="${k}" aria-pressed="${uAge===k}" ${cnt[k]?'':'disabled'}>${l} ${cnt[k]||0}</button>`).join('');
  const list=base.filter(t=>!uAge||ageLevel(t)===uAge).sort(byOld);
  const total=list.reduce((s,t)=>s+t.amount,0), filtered=!!(q||uRange||uAge);
  $('u-total').textContent=won(total);
  const ageTxt=uAge?` · ${AGES.find(a=>a[0]===uAge)[1]}`:'';
  $('u-label').textContent=`아직 못 받은 돈 (${uRange?rangeTxt(uRange):'전체 기간'}${ageTxt}${q?` · "${$('u-search').value.trim()}"`:''})`;
  const late=list.filter(t=>daysSince(t.date)>=30).length;
  $('u-sub').textContent=`${list.length}건`+(late?` · 30일 넘은 건 ${late}건`:'')+(filtered?` · 전체 미수 ${won(allDue.reduce((s,t)=>s+t.amount,0))}`:'');
  $('u-rangetxt').textContent=uRange?rangeTxt(uRange):'기간: 전체';
  $('u-rangebtn').classList.toggle('on',!!uRange);
  $('u-rangebtn').setAttribute('aria-expanded',uPanel);
  $('u-panel').hidden=!uPanel;
  if(uPanel)renderRangePanel();
  $('u-list').innerHTML=list.length?list.map(t=>rowHtml(t,'unpaid')).join(''):`<div class="empty">${filtered?'조건에 맞는 못 받은 돈이 없어요.':'못 받은 돈이 없어요.'}</div>`;
}
// ---------- 달력 ----------
function monthTrips(y,m){const p=`${y}-${pad(m+1)}`;return trips.filter(t=>t.date.startsWith(p))}
function renderBackupBanner(){
  const last=ls.get('lastBackup');
  const need=!Cloud.user&&trips.length>0&&(!last||daysSince(last)>=14);
  $('c-backup').hidden=!need;
  if(need)$('c-backup-txt').textContent=last?`마지막 백업이 ${daysSince(last)}일 전이에요.`:'아직 백업한 적이 없어요.';
}
function renderCal(){
  renderBackupBanner();
  $('c-first').hidden=trips.length>0;
  $('c-titletxt').textContent=`${calY}년 ${calM+1}월`;
  const mt=monthTrips(calY,calM);
  $('c-mpaid').textContent=won(mt.filter(t=>t.paid).reduce((s,t)=>s+t.amount,0));
  $('c-mdue').textContent=won(mt.filter(t=>!t.paid).reduce((s,t)=>s+t.amount,0));
  const first=new Date(calY,calM,1).getDay(), days=new Date(calY,calM+1,0).getDate();
  let h='';
  for(let i=0;i<first;i++) h+='<div class="day blank"></div>';
  for(let d=1;d<=days;d++){
    const ds=`${calY}-${pad(calM+1)}-${pad(d)}`;
    const ts=trips.filter(t=>t.date===ds);
    const paidSum=ts.filter(t=>t.paid).reduce((s,t)=>s+t.amount,0);
    const dueSum=ts.filter(t=>!t.paid).reduce((s,t)=>s+t.amount,0);
    const cls=['day',ds===todayIso?'today':'',ds===calSel?'sel':''].join(' ');
    const wd=(first+d-1)%7, wcls=wd===0?' sun':wd===6?' sat':'';
    h+=`<button type="button" class="${cls}" data-do="day" data-d="${ds}" aria-label="${calM+1}월 ${d}일 ${ts.length}건, 받은 돈 ${comma(paidSum)}원, 못 받은 돈 ${comma(dueSum)}원"><span class="d num${wcls}">${d}</span>${paidSum?`<span class="s num c-paid">${short(paidSum)}</span>`:''}${dueSum?`<span class="s num c-due">${short(dueSum)}</span>`:''}</button>`;
  }
  $('c-grid').innerHTML=h;
  const ts=trips.filter(t=>t.date===calSel).sort(byOld);
  const sum=ts.reduce((s,t)=>s+t.amount,0);
  const dcost=costs.filter(c=>c.date===calSel).reduce((s,c)=>s+c.amount,0);
  $('c-daytitle').textContent=dayK(calSel);
  $('c-daysum').textContent=`운행 ${ts.length}건`+(ts.length?` · ${short(sum)}원`:'')+(dcost?` · 지출 ${short(dcost)}원`:'');
  $('c-seg').hidden=!ts.length;
  $('c-seg').innerHTML=segHtml('cal',ts,calFilter);
  const shown=ts.filter(t=>pass(t,calFilter));
  $('c-list').innerHTML=!ts.length?'<div class="empty">이 날은 운행 기록이 없어요.</div>'
    :shown.length?shown.map(t=>rowHtml(t,'ledger')).join(''):`<div class="empty">이 날은 ${EMPTY[calFilter]}</div>`;
}

// ---------- 장부 ----------
const inRange=(x,r)=>x.date>=r.start&&x.date<=r.end;
const ledTrips=()=>ledRange?trips.filter(t=>inRange(t,ledRange)):monthTrips(ledY,ledM);
const ledCosts=()=>ledRange?costs.filter(c=>inRange(c,ledRange)):monthCosts(ledY,ledM);
const ledLabel=()=>!ledRange?`${ledY}년 ${ledM+1}월`:ledRange.start===ledRange.end?dayK(ledRange.start):`${mdK(ledRange.start)} ~ ${mdK(ledRange.end)}`;
let ledSearch=false;
function renderLedger(){
  $('l-tripgrp').hidden=ledKind!=='trip'; $('l-costgrp').hidden=ledKind!=='cost';
  document.querySelectorAll('#l-kind [data-lkind]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.lkind===ledKind));
  const span=!ledRange?'이 달':ledRange.start===ledRange.end?'이 날':'이 기간';
  $('l-titletxt').textContent=ledLabel();
  $('l-title').classList.toggle('long',!!ledRange&&ledRange.start!==ledRange.end); // 기간은 글자가 길어 조금 작게
  $('l-kicker').textContent=ledRange&&ledRange.start.slice(0,4)!==String(TODAY.getFullYear())?`장부 · ${ledRange.start.slice(0,4)}년`:'장부';
  const all=ledTrips();
  const sum=all.reduce((s,t)=>s+t.amount,0), paid=all.filter(t=>t.paid).reduce((s,t)=>s+t.amount,0);
  $('l-sum').textContent=short(sum); $('l-paid').textContent=short(paid); $('l-due').textContent=short(sum-paid);
  const showSearch=ledSearch||!!$('l-search').value;
  $('l-searchbox').hidden=!showSearch; $('l-searchbtn').setAttribute('aria-pressed',showSearch);
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
// 장부: 한 달 · 하루 · 기간 직접
let lpMode='month', lpY=ledY, lpCY=ledY, lpCM=ledM, lpDraft={start:null,end:null};
function openLedPick(){
  lpMode=!ledRange?'month':ledRange.start===ledRange.end?'day':'range';
  lpY=ledY; const d=ledRange?parseD(ledRange.start):new Date(ledY,ledM,1); lpCY=d.getFullYear(); lpCM=d.getMonth();
  lpDraft=ledRange?{...ledRange}:{start:null,end:null};
  renderLedPick(); $('ledsheet').hidden=false; pushOverlay({lpick:true});
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
    trips.forEach(t=>{if(t.date.startsWith(lpY+'-')){const i=Number(t.date.slice(5,7))-1;s[i]+=t.amount;n[i]++}});
    $('lp-months').innerHTML=s.map((v,i)=>{const on=!ledRange&&lpY===ledY&&i===ledM, off=lpY*12+i>curYM()&&!n[i];
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
    if(k==='lastm'){const d=new Date(y,mo-1,1);ledY=d.getFullYear();ledM=d.getMonth();setLedRange(null);return}
    const s=k==='week'?new Date(y,mo,TODAY.getDate()-(TODAY.getDay()+6)%7):k==='3m'?new Date(y,mo-2,1):new Date(y,0,1);
    setLedRange({start:iso(s),end:todayIso});return}
  const mon=e.target.closest('[data-lpmon]');
  if(mon){ledY=lpY;ledM=Number(mon.dataset.lpmon);setLedRange(null);return}
  const d=e.target.closest('[data-lpd]');
  if(d){const v=d.dataset.lpd,r=lpDraft;
    if(lpMode==='day'){r.start=r.end=v}
    else if(!r.start||r.end){r.start=v;r.end=null} else if(v<r.start){r.start=v} else {r.end=v}
    renderLedPick();return}
  if(e.target.closest('#lp-yprev')){lpY--;renderLedPick();return}
  if(e.target.closest('#lp-ynext')){lpY++;renderLedPick();return}
  if(e.target.closest('#lp-cprev')){lpCM--;if(lpCM<0){lpCM=11;lpCY--}renderLedPick();return}
  if(e.target.closest('#lp-cnext')){lpCM++;if(lpCM>11){lpCM=0;lpCY++}renderLedPick();return}
  if(e.target.closest('#lp-apply')){const r=lpDraft;if(!r.start)return;setLedRange({start:r.start,end:lpMode==='day'?r.start:(r.end||r.start)})}
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
function renderRecent(){
  // 최근에 많이 쓴 순: 오래된 기록일수록 점수가 줄어듦 (약 2주마다 절반)
  const top=(key)=>{const c={};trips.forEach(t=>{if(!t[key])return;const age=Math.max(0,daysSince(t.date));c[t[key]]=(c[t[key]]||0)+Math.pow(0.5,age/14)});
    return Object.keys(c).sort((a,b)=>c[b]-c[a]).slice(0,6)};
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
    ?`운행 기록 <b class="num">${comma(trips.length)}건</b> (${md(dates[0])}/${dates[0].slice(2,4)} ~ ${md(dates[dates.length-1])}/${dates[dates.length-1].slice(2,4)})<br>못 받은 돈 <b class="num c-due">${comma(due.length)}건 · ${won(due.reduce((s,t)=>s+t.amount,0))}</b>`
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
  const blob=new Blob([text],{type});
  if(share&&navigator.canShare){
    for(const t of [type,'text/plain']){
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
function csvText(list,costList){
  const head=['상차일','콜','화주','화주 담당자','화주 연락처','상차지','상차 상세주소','상차 담당자','상차 연락처','하차지','하차 상세주소','하차 담당자','하차 연락처','운임 방식','운임','수수료','입금 상태','입금일','미수 일수','메모'];
  const q=v=>{v=v==null?'':String(v);return /[",\r\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v};
  const rows=list.sort(byOld).map(t=>[t.date,t.src,t.client,t.clientName,t.clientPhone,t.from,t.fromAddr,t.fromName,t.fromPhone,t.to,t.toAddr,t.toName,t.toPhone,t.payType,t.amount,t.fee||0,t.paid?'받음':'못 받음',t.paid||'',t.paid?'':Math.max(0,daysSince(t.date)),t.memo]);
  const out=[head,...rows];
  // 아래에 지출 표와 합계(순수익)를 이어 붙임
  if(costList){
    const cl=[...costList].sort(byOld), sum=list.reduce((s,t)=>s+t.amount,0), fees=list.reduce((s,t)=>s+(t.fee||0),0), cs=cl.reduce((s,c)=>s+c.amount,0);
    if(cl.length)out.push([],['지출일','항목','금액','메모'],...cl.map(c=>[c.date,c.cat,c.amount,c.memo]));
    out.push([],['합계'],['총 운임',sum],['수수료',fees],['지출',cs],['순수익',sum-fees-cs]);
  }
  return '﻿'+out.map(r=>r.map(q).join(',')).join('\r\n');
}
async function doCsv(list,name,costList){
  if(!list.length&&!(costList&&costList.length)){toast('내보낼 기록이 없어요.');return}
  const r=await giveFile(csvText([...list],costList),name,'text/csv',true);
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
    if(o.city)parts.push(`${t.from} → ${t.to}`);
    let head=parts.join(' · ');
    if(o.date)head=`[${md(t.date)}]`+(head?' '+head:'');
    if(head)L.push(head);
    // 상세주소·담당자·연락처는 비어 있어도 줄을 넣고 "미입력"으로 표시 (복사 전에 고칠 수 있게)
    const NA='미입력';
    const who=(n,p)=>`${n||'이름 '+NA} ${p||'연락처 '+NA}`;
    if(kind==='all'&&o.client)L.push(`화주 담당: ${who(t.clientName,t.clientPhone)}`);
    if(kind!=='to'){
      L.push(`상차지: ${[o.city?t.from:'',t.fromAddr||'상세주소 '+NA].filter(Boolean).join(' ')}`);
      L.push(`상차 담당: ${who(t.fromName,t.fromPhone)}`);
    }
    if(kind!=='from'){
      L.push(`하차지: ${[o.city?t.to:'',t.toAddr||'상세주소 '+NA].filter(Boolean).join(' ')}`);
      L.push(`하차 담당: ${who(t.toName,t.toPhone)}`);
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
// ---------- 정산 문자 ----------
// 운행 한 건마다 화주에게: "운임 금액 {금액}원 입금확인바랍니다." · 계산서 발행이면 운임에 10%(부가세)를 더해서
// 화주마다 마지막에 고른 발행/미발행을 기억해 다음에도 그대로 고름
let smTrip=null, smTax=false, smOrig='';
const vat=a=>Math.round(a*1.1);
function smsText(t,tax){
  const p=getProfile(), amt=tax?vat(t.amount):t.amount, acct=acctText(p);
  const who=[p.carNo,p.name||p.holder].filter(Boolean).join(' '); // 이름이 비어 있으면 예금주 이름
  const L=[who?`안녕하세요, ${who}입니다.`:'안녕하세요.',
    `${md(t.date)} ${t.from}→${t.to}${tax?' 전자 계산서 발행했습니다.':''} 운임 금액 ${comma(amt)}원${tax?'(부가세 포함)':''} 입금확인바랍니다.`];
  if(acct)L.push(acct);
  return L.join('\n');
}
function setSmTax(tax){
  smTax=tax;
  document.querySelectorAll('#sm-tax [data-tax]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.tax===(tax?'1':'0')));
  const a=smTrip.amount;
  $('sm-amt').innerHTML=tax?`운임 ${comma(a)} + 부가세 ${comma(vat(a)-a)} = <b>${comma(vat(a))}원</b>`:`운임 <b>${comma(a)}원</b>`;
  smOrig=smsText(smTrip,tax); $('sm-text').value=smOrig; $('sm-undo').hidden=true;
}
function openSms(t){
  if(!t)return;
  smTrip=t; const p=getProfile();
  $('sm-title').textContent=`정산 문자 · ${t.client||'화주 미입력'}`;
  $('sm-to').textContent=t.clientPhone?`받는 사람: ${t.clientName?t.clientName+' ':''}${t.clientPhone}`
    :'화주 연락처가 없어요. [문자 보내기]를 누른 뒤 번호를 넣거나, [복사]해서 카톡으로 보내세요.';
  setSmTax(ls.get('tax:'+(t.client||''))==='1');
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
$('sm-send').onclick=()=>{location.href=`sms:${(smTrip.clientPhone||'').replace(/\D/g,'')}?body=${encodeURIComponent($('sm-text').value)}`};
$('sm-copy').onclick=async()=>{
  const ta=$('sm-text'); let ok=false;
  try{await navigator.clipboard.writeText(ta.value);ok=true}catch(_){}
  if(!ok){try{ta.focus();ta.select();ok=document.execCommand('copy');ta.blur();ta.setSelectionRange(0,0)}catch(_){}}
  $('sm-hint').textContent=ok?'복사했어요. 카톡에 붙여넣기 하세요.':'자동 복사가 안 됐어요. 글을 길게 눌러 "모두 선택" → "복사" 해 주세요.';
  $('sm-hint').classList.toggle('errline',!ok);$('sm-hint').classList.toggle('okline2',ok);
  if(ok)toast('복사했어요');
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
  closeOverlays(); if(v==='add'){resetForm();loadDraftNew()}
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
  const lk=e.target.closest('[data-lkind]');
  if(lk){ledKind=lk.dataset.lkind;openId=payingId=deletingId=costOpen=costDel=null;renderLedger();saveSpot();return}
  const tx=e.target.closest('[data-tsize]');
  if(tx){setTextSize(tx.dataset.tsize);return}
  const ed=e.target.closest('[data-do="edit"]');
  if(ed){startEdit(store.get(ed.dataset.id));return}
  const fill=e.target.closest('[data-fill]');
  if(fill){$(fill.dataset.fill).value=fill.dataset.v;
    if(fill.dataset.fill==='f-client'&&!$('f-clientphone').value&&!$('f-clientname').value){const p=[...trips].sort(byNew).find(t=>t.client===fill.dataset.v&&(t.clientPhone||t.clientName));if(p){$('f-clientphone').value=p.clientPhone||'';$('f-clientname').value=p.clientName||'';syncMore()}}
    return}
  const ag=e.target.closest('[data-age]');
  if(ag){const v=ag.dataset.age||null;uAge=(v&&uAge===v)?null:v;openId=payingId=null;renderUnpaid();return}
  const sr=e.target.closest('[data-src]');
  if(sr){setSrc(sr.dataset.src===formSrc?'':sr.dataset.src);return} // 한 번 더 누르면 해제
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
    case 'paycfm': { const v=$('pd-'+id).value||todayIso; t.paid=v; payingId=null; saveTrip(t);
      toast(`${t.from}→${t.to} ${comma(t.amount)}원 입금 처리`,()=>{t.paid=null;saveTrip(t)}); break; }
    case 'unpay': { const old=t.paid; t.paid=null; saveTrip(t); toast('미수로 되돌렸어요',()=>{t.paid=old;saveTrip(t)}); break; }
    case 'open': openId=openId===id?null:id; deletingId=null; payingId=null; break;
    case 'del': deletingId=id; break;
    case 'delcancel': deletingId=null; break;
    case 'delcfm': removeTrip(t); deletingId=openId=null; toast('삭제했어요',()=>restoreTrip(t)); break;
    case 'day': if(calSel!==el.dataset.d)calFilter='all'; calSel=el.dataset.d; openId=payingId=null; break;
    case 'rpick': { const d=el.dataset.d; const r=uDraft;
      if(!r.start||r.end){r.start=d;r.end=null} else if(d<r.start){r.start=d} else {r.end=d}
      break; }
    case 'copen': costOpen=costOpen===id?null:id; costDel=null; break;
    case 'cdel': costDel=id; break;
    case 'cdelcancel': costDel=null; break;
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
$('l-title').onclick=openLedPick;
$('c-title').onclick=openJump;
$('c-today').onclick=()=>{calGo(todayIso);render()};
$('l-searchbtn').onclick=()=>{ledSearch=!(ledSearch||$('l-search').value);if(!ledSearch)$('l-search').value='';renderLedger();if(ledSearch)$('l-search').focus()};
$('l-search').oninput=renderLedger;
initScope('l-scope','l-search','scope:l',renderLedger);
initScope('u-scope','u-search','scope:u',()=>{openId=payingId=null;renderUnpaid()});
$('l-csv').onclick=()=>doCsv(ledTrips(),ledRange?`아빠장부_${ledRange.start}_${ledRange.end}.csv`:`아빠장부_${ledY}-${pad(ledM+1)}.csv`,ledCosts());
$('l-addcost').onclick=()=>{navTab('add');setKind('cost');$('cf-amt').focus()};
$('u-search').oninput=()=>{openId=payingId=null;renderUnpaid()};
$('u-rangebtn').onclick=()=>{uPanel=!uPanel;if(uPanel){uDraft=uRange?{...uRange}:{start:null,end:null};const d=uRange?parseD(uRange.start):TODAY;rpY=d.getFullYear();rpM=d.getMonth();pushOverlay({panel:'range'})}else popOverlay('panel');renderUnpaid()};
$('rp-prev').onclick=()=>{rpM--;if(rpM<0){rpM=11;rpY--}renderRangePanel()};
$('rp-next').onclick=()=>{rpM++;if(rpM>11){rpM=0;rpY++}renderRangePanel()};
$('rp-reset').onclick=()=>{uRange=null;uDraft={start:null,end:null};uPanel=false;popOverlay('panel');openId=payingId=null;renderUnpaid()};
$('rp-apply').onclick=()=>{
  if(!uDraft.start){$('rp-hint').textContent='시작일을 먼저 눌러 주세요';return}
  uRange={start:uDraft.start,end:uDraft.end||uDraft.start};uPanel=false;popOverlay('panel');openId=payingId=null;renderUnpaid()};
document.querySelectorAll('[data-preset]').forEach(b=>b.onclick=()=>{
  const y=TODAY.getFullYear(),m=TODAY.getMonth(),p=b.dataset.preset;
  if(p==='all')uRange=null;
  else if(p==='thism')uRange={start:iso(new Date(y,m,1)),end:iso(new Date(y,m+1,0))};
  else if(p==='lastm')uRange={start:iso(new Date(y,m-1,1)),end:iso(new Date(y,m,0))};
  else uRange={start:iso(new Date(y,m-2,1)),end:todayIso};
  uPanel=false;popOverlay('panel');openId=payingId=null;renderUnpaid()});
$('s-share').onclick=()=>doBackup(true);
$('s-download').onclick=()=>doBackup(false);
$('s-csv').onclick=()=>doCsv(trips,`아빠장부_전체_${todayIso}.csv`,costs);
$('s-import').onchange=e=>{const f=e.target.files&&e.target.files[0];if(f)readImport(f)};
document.addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&e.target.matches('.head,.chead')){e.preventDefault();e.target.click()}});

// ---------- 입력 양식 ----------
function fmtPhone(v){const d=v.replace(/\D/g,'').slice(0,11);
  if(d.startsWith('02')) return d.length<3?d:d.length<6?d.slice(0,2)+'-'+d.slice(2):d.length<10?d.slice(0,2)+'-'+d.slice(2,5)+'-'+d.slice(5):d.slice(0,2)+'-'+d.slice(2,6)+'-'+d.slice(6,10);
  if(d.length===8&&/^1[5-9]/.test(d)) return d.slice(0,4)+'-'+d.slice(4);
  return d.length<4?d:d.length<7?d.slice(0,3)+'-'+d.slice(3):d.length<11?d.slice(0,3)+'-'+d.slice(3,6)+'-'+d.slice(6):d.slice(0,3)+'-'+d.slice(3,7)+'-'+d.slice(7)}
document.querySelectorAll('.phone').forEach(i=>i.addEventListener('input',e=>{e.target.value=fmtPhone(e.target.value)}));
let formPt='인수증', formSrc='';
function setSrc(v){formSrc=v;document.querySelectorAll('#f-src [data-src]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.src===v))}
const readForm=()=>({src:formSrc,date:$('f-date').value,from:$('f-from').value.trim(),to:$('f-to').value.trim(),
  fromAddr:$('f-fromaddr').value.trim(),toAddr:$('f-toaddr').value.trim(),payType:formPt,client:$('f-client').value.trim(),
  clientPhone:$('f-clientphone').value.trim(),fromPhone:$('f-fromphone').value.trim(),toPhone:$('f-tophone').value.trim(),
  clientName:$('f-clientname').value.trim(),fromName:$('f-fromname').value.trim(),toName:$('f-toname').value.trim(),
  amount:Number($('f-amt').value.replace(/\D/g,'')),fee:Number($('f-fee').value.replace(/\D/g,''))||0,memo:$('f-memo').value.trim()});
function formMissing(f){return [!f.date&&'상차일',!f.from&&'상차지',!f.to&&'하차지',!f.amount&&'운임',!f.memo&&'메모'].filter(Boolean)}
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

// ---------- 글씨 크기 ----------
function setTextSize(z){
  ls.set('textSize',z);
  if(z)document.documentElement.setAttribute('data-text',z);else document.documentElement.removeAttribute('data-text');
  document.querySelectorAll('#s-text [data-tsize]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.tsize===z));
}
setTextSize(ls.get('textSize')||'');
function resetForm(keepDraft){if(editingId!==null&&!keepDraft)ls.set('draftEdit','');editingId=null;$('f').reset();$('f-date').value=todayIso;$('f-err').textContent='';setPt('인수증');setSrc('');['f-more','f-cmore'].forEach(i=>$(i).open=false);setMode(false);showDraftNote('')}
// 담당자·연락처가 적혀 있으면 그 칸을 펼쳐서 보여줌
function syncMore(){[['f-cmore','f-clientname','f-clientphone']].forEach(([d,a,b])=>{if($(a).value.trim()||$(b).value.trim())$(d).open=true});if($('f-fee').value.trim())$('f-more').open=true}

// ---------- 적는 중 임시 저장 ----------
// 저장 버튼을 누르기 전 내용도 이 휴대폰에 바로 보관 → 새로고침하거나 앱이 닫혀도 이어서 쓸 수 있음
// draftNew: 새로 적던 것 (저장하거나 [새로 쓰기]를 누를 때까지) · draftEdit: 고치던 것 (수정 저장·취소하면 지움)
const F_IDS=['f-date','f-client','f-clientname','f-clientphone','f-from','f-fromaddr','f-fromname','f-fromphone','f-to','f-toaddr','f-toname','f-tophone','f-amt','f-fee','f-memo'];
const readDraft=k=>{try{return JSON.parse(ls.get(k)||'null')}catch(_){return null}};
function formSnap(){const v={};F_IDS.forEach(id=>v[id]=$(id).value);return {v,src:formSrc,pt:formPt,paid:$('f-paidnow').checked,more:$('f-more').open}}
function saveDraft(){
  if(view!=='add'||formKind==='cost')return;
  if(editingId!==null){ls.set('draftEdit',JSON.stringify({id:editingId,back:backView,orig:editOrig,...formSnap()}));return}
  const s=formSnap(), blank=F_IDS.every(id=>id==='f-date'||!s.v[id].trim())&&s.pt==='인수증'&&!s.paid&&!s.src;
  ls.set('draftNew',blank?'':JSON.stringify(s));
}
function fillSnap(s){F_IDS.forEach(id=>{if(typeof s.v[id]==='string')$(id).value=s.v[id]});setPt(s.pt||'인수증');setSrc(s.src||'');$('f-paidnow').checked=!!s.paid;$('f-more').open=!!s.more;syncMore()}
function showDraftNote(msg,canDiscard){$('f-draftmsg').textContent=msg;$('f-discard').hidden=!canDiscard;$('f-draft').hidden=!msg||formKind==='cost'}
function loadDraftNew(){const s=readDraft('draftNew');if(s&&s.v){fillSnap(s);showDraftNote('적던 내용을 불러왔어요.',true)}}
// 고친 게 있는지 비교할 때 쓰는 값 (더보기 펼침 여부는 빼고)
const snapKey=s=>JSON.stringify([s.v,s.pt,s.paid,s.src||'']);
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
  $('f-paidnow').checked=!!t.paid;
  syncMore();
  editOrig=snapKey(formSnap()); hideAsk();
  view='add'; payingId=deletingId=null; pushOverlay({edit:true,v:'add'}); render(); window.scrollTo(0,0);
}
function fillTrip(t){
  setSrc(t.src||'');
  $('f-date').value=t.date; $('f-client').value=t.client||'';
  $('f-from').value=t.from; $('f-fromaddr').value=t.fromAddr||'';
  $('f-to').value=t.to; $('f-toaddr').value=t.toAddr||'';
  $('f-amt').value=comma(t.amount); setPt(t.payType||'인수증');
  $('f-fee').value=t.fee?comma(t.fee):''; $('f-memo').value=t.memo||'';
  $('f-clientphone').value=t.clientPhone||''; $('f-fromphone').value=t.fromPhone||''; $('f-tophone').value=t.toPhone||'';
  $('f-clientname').value=t.clientName||''; $('f-fromname').value=t.fromName||''; $('f-toname').value=t.toName||'';
}
$('f-cancel').onclick=()=>{
  if(costEditId!==null){const id=costEditId;resetCost();view=backView;costOpen=id;popOverlay('cedit');render();window.scrollTo(0,0);return}
  const id=editingId;resetForm();view=backView;openId=id;popOverlay('edit');render();window.scrollTo(0,0)};
$('f').addEventListener('submit',e=>{
  e.preventDefault();
  const f=readForm(), miss=formMissing(f), date=f.date;
  if(miss.length){$('f-err').textContent=`${miss.join(', ')}을(를) 입력해 주세요.`;return}
  if(editingId!==null){
    const t=store.get(editingId);
    if(!t){resetForm();popOverlay('edit');go(backView);return}
    const before={...t};
    Object.assign(t,f,{paid:$('f-paidnow').checked?(t.paid||todayIso):null});
    saveTrip(t);
    const id=t.id; resetForm();
    if(backView==='cal'){const d=parseD(date);calY=d.getFullYear();calM=d.getMonth();calSel=date}
    if(backView==='ledger'&&!(ledRange&&inRange({date},ledRange))){const d=parseD(date);ledY=d.getFullYear();ledM=d.getMonth();ledRange=null}
    view=backView; openId=id; popOverlay('edit'); render(); window.scrollTo(0,0);
    toast('수정했어요',()=>{Object.assign(t,before);saveTrip(t)});
    return;
  }
  const t={id:newId(),createdAt:Date.now(),updatedAt:0,deleted:false,...f,paid:$('f-paidnow').checked?date:null};
  saveTrip(t);
  calY=parseD(date).getFullYear();calM=parseD(date).getMonth();calSel=date;calFilter='all';
  resetForm(); ls.set('draftNew',''); goCal();
  toast(`${f.from}→${f.to} 저장했어요`,()=>removeTrip(t));
});

// ---------- 시작 ----------
document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState==='visible'&&iso(new Date())!==todayIso){setToday();if(view!=='add')render()}
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
