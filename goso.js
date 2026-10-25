// ---------- 고소장 만들기 (설정 → 서류) ----------
// 경찰서 고소장 양식(goso-template.xlsx)의 빈칸에 적은 내용을 넣어 엑셀 파일로 줌
// 양식 모양(칸 · 테두리 · 글씨)은 그대로 두고 빈칸만 채움 · 적은 내용은 이 휴대폰에만 저장 (클라우드에 안 올라감)
const Goso=(()=>{
const te=new TextEncoder(), td=new TextDecoder();
const xe=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g,'');
const has=v=>v!=null&&String(v).trim()!=='';
const bx=v=>v?'■':'□';

// ---- 기본 문장 (육하원칙 틀) · 【 】는 채워야 할 곳 ----
const ph=(v,h)=>has(v)?String(v).trim():`【${h}】`;
function purposeText(d){return `고소인은 피고소인을 ${ph(d.crime,'죄명, 예: 형법 제347조 제1항 사기죄')} 혐의로 고소하오니, 철저히 수사하여 엄중히 처벌하여 주시기 바랍니다.`}
function factsText(d){
  const w=d.w||{}, blank=!['who','when','where','how','truth','why','what'].some(k=>has(w[k]));
  return `피고소인은 ${ph(w.who,'누가: 피고소인의 직업 · 고소인과의 관계')}인 사람입니다.\n\n`
    +`피고소인은 ${ph(w.when,'언제: 20○○. ○. ○. ○○:○○경')} ${ph(w.where,'어디서: 범행 장소의 주소 또는 전화 · 문자 · 메신저')}에서, 고소인에게 ${ph(w.how,'어떻게: 피고소인이 한 말과 행동을 구체적으로')}.\n\n`
    +(blank||has(w.truth)?`그러나 사실은 ${ph(w.truth,'피고소인의 말이나 행동이 거짓이거나 위법한 이유')}였습니다.\n\n`:'')
    +`피고소인은 이처럼 ${ph(w.why,'왜: 범행 목적, 예: 금전을 편취할 목적')}으로, 고소인에게 ${ph(w.what,'무엇을: 언제, 어떤 방법으로, 얼마의 금전 또는 어떤 피해를 입게 했는지')}의 피해를 입게 하였습니다.\n\n`
    +`이로써 피고소인은 ${ph(d.crime,'죄명')}의 죄를 범하였습니다.`;
}
const REASON='1. 범행 경위 — 고소인과 피고소인은 【알게 된 시기와 경위】로 알게 되었고, 【사건 전까지의 관계】. 피고소인은 이 관계를 이용하여 【범행에 이르게 된 정황】.\n'
  +'2. 범행 후 정황 — 고소인은 【언제】 피해 사실을 알고 피고소인에게 【반환 요구 · 항의 등 조치】하였으나, 피고소인은 【연락 두절 · 변명 · 책임 회피 등 태도】를 보이고 있습니다.\n'
  +'3. 범죄 성립 — 위 행위는 【죄명】의 구성요건인 【예: 기망행위, 착오, 처분행위, 재산상 이익】을 모두 충족합니다.\n'
  +'4. 처벌의 필요성 — 고소인은 이 사건으로 【금전적 · 정신적 피해】를 입었고 피해는 아직 회복되지 않았습니다. 피고소인이 반성하지 않고 있어 추가 피해를 막기 위해 엄정한 처벌을 바라며 이 고소에 이르게 되었습니다.';

// ---- zip 풀기 (DeflateStream) · 묶기 (압축 없이) ----
async function unzip(buf){
  const u=new Uint8Array(buf), dv=new DataView(u.buffer,u.byteOffset,u.byteLength), out={};
  let e=u.length-22; while(e>=0&&dv.getUint32(e,true)!==0x06054b50)e--;
  if(e<0)throw new Error('양식 파일이 망가졌어요');
  let p=dv.getUint32(e+16,true);
  for(let i=dv.getUint16(e+10,true);i>0;i--){
    const method=dv.getUint16(p+10,true), size=dv.getUint32(p+20,true), nl=dv.getUint16(p+28,true), off=dv.getUint32(p+42,true);
    const name=td.decode(u.subarray(p+46,p+46+nl)); p+=46+nl+dv.getUint16(p+30,true)+dv.getUint16(p+32,true);
    const at=off+30+dv.getUint16(off+26,true)+dv.getUint16(off+28,true), data=u.subarray(at,at+size);
    out[name]=method===0?data.slice():new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
  }
  return out;
}
let crcT=null;
function crc(b){if(!crcT){crcT=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;crcT[n]=c>>>0}}
  let c=0xFFFFFFFF;for(let i=0;i<b.length;i++)c=crcT[(c^b[i])&255]^(c>>>8);return (c^0xFFFFFFFF)>>>0}
function zip(files){
  const parts=[], cen=[]; let off=0;
  const u16=n=>[n&255,(n>>>8)&255], u32=n=>[n&255,(n>>>8)&255,(n>>>16)&255,(n>>>24)&255];
  for(const [name,body] of Object.entries(files)){
    const nb=te.encode(name), data=typeof body==='string'?te.encode(body):body, c=crc(data);
    const head=[...u32(0x04034b50),...u16(20),...u16(0x0800),...u16(0),...u16(0),...u16(0x21),...u32(c),...u32(data.length),...u32(data.length),...u16(nb.length),...u16(0)];
    parts.push(new Uint8Array(head),nb,data);
    cen.push(new Uint8Array([...u32(0x02014b50),...u16(20),...u16(20),...u16(0x0800),...u16(0),...u16(0),...u16(0x21),...u32(c),...u32(data.length),...u32(data.length),...u16(nb.length),...u16(0),...u16(0),...u16(0),...u16(0),...u32(0),...u32(off)]),nb);
    off+=head.length+nb.length+data.length;
  }
  const cenSize=cen.reduce((s,a)=>s+a.length,0), n=Object.keys(files).length;
  parts.push(...cen,new Uint8Array([...u32(0x06054b50),...u16(0),...u16(0),...u16(n),...u16(n),...u32(cenSize),...u32(off),...u16(0)]));
  return new Blob(parts,{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
}

// ---- 양식 채우기: 시트 한 장(sheet1)의 칸에 글자 넣기 ----
function fill(files,d){
  d=d||{}; const c=d.c||{}, a=d.a||{}, x=d.wit||{};
  let sh=td.decode(files['xl/worksheets/sheet1.xml']), st=td.decode(files['xl/styles.xml']);
  // 꾸밈: 원래 칸의 테두리는 살리고, 글씨는 보통 · 긴 글은 줄 바꿈(wrap) · 짧은 칸은 넘치면 글씨 줄임(fit)
  const xfs=st.match(/<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/)[1].match(/<xf [^>]*?(?:\/>|>[\s\S]*?<\/xf>)/g), more=[], memo={};
  function sty(base,mode){
    const k=base+mode; if(memo[k]!=null)return memo[k];
    const at=(xfs[base]||xfs[0]).match(/^<xf ([^>]*?)\/?>/)[1].replace(/\s*(fontId|applyFont|applyAlignment)="[^"]*"/g,'');
    more.push(`<xf ${at} fontId="0" applyAlignment="1">`+(mode==='wrap'?'<alignment vertical="top" wrapText="1"/>':'<alignment vertical="center" shrinkToFit="1"/>')+'</xf>');
    return memo[k]=xfs.length+more.length-1;
  }
  const rows=new Map(), merges=[];
  const body=sh.slice(sh.indexOf('<sheetData>')+11,sh.indexOf('</sheetData>'));
  body.replace(/<row ([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g,(_,at,inner)=>{
    const cells=new Map(); (inner||'').replace(/<c r="([A-Z]+)\d+"[^>]*?(?:\/>|>[\s\S]*?<\/c>)/g,(cx,col)=>cells.set(col,cx));
    rows.set(+at.match(/\br="(\d+)"/)[1],{at,cells});
  });
  const row=r=>rows.get(r)||(rows.set(r,{at:`r="${r}"`,cells:new Map()}),rows.get(r));
  const ci=col=>[...col].reduce((n,ch)=>n*26+ch.charCodeAt(0)-64,0);
  const sOf=ref=>{const [,col,r]=ref.match(/([A-Z]+)(\d+)/), m=(rows.get(+r)&&rows.get(+r).cells.get(col)||'').match(/ s="(\d+)"/);return m?+m[1]:0};
  function set(ref,v,s){const [,col,r]=ref.match(/([A-Z]+)(\d+)/);
    row(+r).cells.set(col,`<c r="${ref}" s="${s}" t="inlineStr"><is><t xml:space="preserve">${xe(v)}</t></is></c>`)}
  // 빈칸에 값 넣기 · to: 오른쪽 빈칸까지 합칠 때 끝 열 (좁은 칸에서 글씨가 너무 작아지지 않게)
  const put=(ref,v,to)=>{if(!has(v))return;set(ref,String(v).trim(),sty(sOf(ref),'fit'));if(to)merges.push(`${ref}:${to}${ref.match(/\d+/)[0]}`)};
  const relabel=(ref,v)=>set(ref,v,sOf(ref));                                      // 양식 글자 바꾸기 (□ → ■ 등)
  function height(r,ht){const o=row(r);o.at=o.at.replace(/\s*(ht|customHeight)="[^"]*"/g,'')+` ht="${ht}" customHeight="1"`}
  // 긴 글: 여러 줄을 한 칸으로 합치고 줄 바꿈 · 글 길이에 맞춰 줄 높이를 늘림 (한글 2칸 · 영문/숫자 1칸으로 어림)
  function block(r1,r2,c1,c2,v,cap){
    if(!has(v))return; v=String(v).trim();
    set(c1+r1,v,sty(sOf(c1+r1),'wrap'));
    if(r2>r1||c1!==c2)merges.push(`${c1}${r1}:${c2}${r2}`);
    const lines=v.split('\n').reduce((n,p)=>n+Math.max(1,Math.ceil([...p].reduce((w,ch)=>w+(ch.charCodeAt(0)>0x2e80?2:1),0)/cap)),0);
    const per=Math.max(17.4,Math.ceil((lines*16.8+6)/(r2-r1+1)*10)/10);
    for(let r=r1;r<=r2;r++)height(r,per);
  }

  // 1. 고소인
  // E열 "주민등록번호" 글자가 D · F칸까지 걸쳐 보이므로 D · F는 비워 둠
  put('B6',c.name,'C'); put('G6',c.rrn,'H'); put('B7',c.rep,'C'); put('G7',c.corp,'H'); put('B8',c.addr);
  put('B10',c.job); put('D10',c.office,'H'); put('C11',c.mobile); put('E11',c.home); put('G11',c.work,'H'); put('B12',c.email,'H');
  if(c.agent==='legal'){relabel('B13',`■ 법정대리인 (성명 : ${c.agentName||''}`);put('G13',c.agentPhone)}
  if(c.agent==='lawyer'){relabel('B14',`■ 고소대리인 (성명 : 변호사 ${c.agentName||''}`);put('G14',c.agentPhone)}
  // 2. 피고소인
  put('B24',a.name,'C'); put('G24',a.rrn,'H'); put('B25',a.addr); put('B26',a.job,'C'); put('F26',a.office,'H');
  put('C27',a.mobile); put('E27',a.home); put('G27',a.work,'H'); put('B28',a.email,'H'); block(29,29,'B','H',a.etc,60);
  // 3~5. 고소취지 · 범죄사실 · 고소이유
  block(38,43,'A','H',has(d.purpose)?d.purpose:purposeText(d),70);
  block(45,52,'A','H',has(d.facts)?d.facts:factsText(d),70);
  block(58,68,'A','H',has(d.reason)?d.reason:REASON,70);
  // 6. 증거자료
  if(d.evid){relabel('A75',`${bx(d.evid==='none')} 고소인은 고소인의 진술 외에 제출할 증거가 없습니다.`);relabel('A76',`${bx(d.evid==='yes')} 고소인은 고소인의 진술 외에 제출할 증거가 있습니다.`)}
  // 7. 관련사건
  if(d.dup)relabel('C83',`제출하였던 사실이 있습니다 ${bx(d.dup==='y')} / 없습니다 ${bx(d.dup==='n')}`);
  if(d.crim)relabel('C85',`이나 경찰서에서 수사 중에 있습니다 ${bx(d.crim==='y')} / 수사 중에 있지 않습니다 ${bx(d.crim==='n')}`);
  if(d.civil)relabel('C87',`중에 있습니다 ${bx(d.civil==='y')} / 민사소송 중에 있지 않습니다 ${bx(d.civil==='n')}`);
  block(90,91,'A','H',d.related,70);
  // 8. 기타 · 날짜 · 서명
  block(97,101,'A','H',d.etc,70);
  if(/^\d{4}-\d\d-\d\d$/.test(d.date||'')){const [y,m,dd]=d.date.split('-');relabel('C107',`${y}년`);relabel('D107',`${+m}월`);relabel('E107',`${+dd}일`)}
  put('D108',c.name,'E'); put('D109',d.submitter,'E');
  // 별지: 인적증거 · 증거서류 · 증거물 · 기타 증거
  put('B126',x.name); put('D126',x.rrn); if(has(x.home))relabel('B127',`자택 : ${x.home.trim()}`); if(has(x.work))relabel('B128',`직장 : ${x.work.trim()}`);
  put('F127',x.job,'H'); put('C129',x.mobile); put('E129',x.homeTel); put('G129',x.workTel,'H'); block(130,131,'B','H',x.proof,60);
  const when=w=>`${bx(w==='now')} 접수시 제출 ${bx(w==='later')} 수사 중 제출`;
  // docs · items: 화면에서 적으면 {0:{…},1:{…}} 꼴 (배열이어도 됨)
  [['docs',138],['items',150]].forEach(([k,r0])=>{const L=d[k]||{};for(let i=0;i<5;i++){const e=L[i];if(!e)continue;
    put('B'+(r0+i),e.name);put('D'+(r0+i),e.who);if(e.when)relabel('E'+(r0+i),when(e.when))}});
  block(160,163,'A','H',d.other,70);

  // 다시 묶기: 줄 · 칸 순서대로
  const order=[...rows.keys()].sort((p,q)=>p-q);
  const data=order.map(r=>{const o=rows.get(r), cs=[...o.cells.entries()].sort((p,q)=>ci(p[0])-ci(q[0])).map(e=>e[1]).join('');return cs?`<row ${o.at}>${cs}</row>`:`<row ${o.at}/>`}).join('');
  sh=sh.slice(0,sh.indexOf('<sheetData>')+11)+data+sh.slice(sh.indexOf('</sheetData>'));
  if(merges.length)sh=sh.replace(/<mergeCells count="(\d+)">([\s\S]*?)<\/mergeCells>/,(_,n,m)=>`<mergeCells count="${+n+merges.length}">${m}${merges.map(r=>`<mergeCell ref="${r}"/>`).join('')}</mergeCells>`);
  sh=sh.replace(/<dimension ref="[^"]*"\/>/,`<dimension ref="A1:H${order[order.length-1]}"/>`)
    .replace(/ topLeftCell="[^"]*"/,'').replace(/<selection [^>]*\/>/,'<selection activeCell="A1" sqref="A1"/>'); // 열면 맨 위부터
  if(more.length)st=st.replace(/<cellXfs count="\d+"([^>]*)>([\s\S]*?)<\/cellXfs>/,(_,r,m)=>`<cellXfs count="${xfs.length+more.length}"${r}>${m}${more.join('')}</cellXfs>`);
  return Object.assign({},files,{'xl/worksheets/sheet1.xml':sh,'xl/styles.xml':st});
}
let tpl=null;
async function build(d){
  if(!tpl){const r=await fetch('goso-template.xlsx');if(!r.ok)throw new Error('양식 파일을 못 불러왔어요');tpl=await unzip(await r.arrayBuffer())}
  return zip(fill(tpl,d));
}
return {unzip,zip,fill,build,purposeText,factsText,REASON};
})();
if(typeof module!=='undefined')module.exports=Goso;

// ---------- 고소장 입력 화면 ----------
if(typeof document!=='undefined')(()=>{
// 칸 목록: [이름, 제목, 종류, 안내] · 이름의 점(.)은 묶음 (c.name = 고소인 성명)
const T='text', TEL='tel', AREA='area';
const SEC=[
  ['1. 고소인',[['c.name','성명 (회사면 상호 · 대표자)'],['c.rrn','주민등록번호 (회사면 법인등록번호)'],['c.addr','주소 (현 거주지)'],['c.job','직업'],['c.office','사무실 주소'],
    ['c.mobile','휴대폰',TEL],['c.home','자택 전화',TEL],['c.work','사무실 전화',TEL],['c.email','이메일','email'],
    ['c.agent','대리인이 대신 고소하나요?',[['','아니요'],['legal','법정대리인'],['lawyer','변호사']]],['c.agentName','대리인 성명'],['c.agentPhone','대리인 연락처',TEL]]],
  ['2. 피고소인',[['a.name','성명'],['a.rrn','주민등록번호'],['a.addr','주소'],['a.job','직업'],['a.office','사무실 주소'],['a.mobile','휴대폰',TEL],['a.home','자택 전화',TEL],['a.work','사무실 전화',TEL],['a.email','이메일','email'],
    ['a.etc','기타사항',AREA,'이름을 모르면 성별 · 나이대 · 외모 · 인상착의, 나와의 관계'],]],
  ['3. 고소취지',[['crime','죄명','text','예: 사기 · 횡령 · 폭행 · 모욕'],['purpose','고소취지',AREA,'비워 두면 죄명으로 자동으로 써요']]],
  ['4. 범죄사실 (육하원칙)',[['w.who','누가 — 피고소인은 어떤 사람인가요?','text','예: ○○물류 배차 담당자로 고소인과 3년간 거래한'],['w.when','언제','text','예: 2026. 9. 3. 14:00경'],['w.where','어디서','text','예: 평택시 ○○동 ○○물류 사무실 / 전화로'],
    ['w.how','어떻게 — 상대방이 한 말과 행동',AREA,'예: "운임은 다음 달 10일에 꼭 주겠다"고 말하며 운송을 맡겼다'],['w.truth','실제로는 — 무엇이 거짓이었나요? (없으면 비워 두기)',AREA],
    ['w.why','왜 — 목적','text','예: 운임을 주지 않을 목적'],['w.what','무엇을 — 피해 내용','text','예: 2026. 9. 3.부터 9. 20.까지 운송 5회, 운임 합계 1,850,000원'],
    ['#make','육하원칙으로 범죄사실 문장 만들기'],['facts','범죄사실 (직접 고쳐도 돼요)',AREA,'위 칸을 채우고 [문장 만들기]를 누르거나, 비워 두면 위 칸으로 자동으로 써요']]],
  ['5. 고소이유',[['reason','고소이유',AREA,'범행 경위 · 범행 후 정황 · 고소하게 된 이유']]],
  ['6. 증거자료',[['evid','내 진술 말고 낼 증거가 있나요?',[['none','없어요'],['yes','있어요']]],['#docs'],['#items'],
    ['wit.name','참고인 · 목격자 성명'],['wit.rrn','참고인 주민등록번호'],['wit.home','참고인 자택 주소'],['wit.work','참고인 직장'],['wit.job','참고인 직업'],['wit.mobile','참고인 휴대폰',TEL],['wit.proof','참고인으로 입증하려는 내용',AREA],
    ['other','기타 증거',AREA]]],
  ['7. 관련사건',[['dup','같은 내용으로 다른 경찰서 · 검찰청에 고소한 적이 있나요?',[['y','있어요'],['n','없어요']]],['crim','관련 사건이 수사 중인가요?',[['y','수사 중'],['n','아니요']]],
    ['civil','관련 민사소송이 진행 중인가요?',[['y','진행 중'],['n','아니요']]],['related','기타사항',AREA,'수사 · 재판 중이면 어느 경찰서 · 법원인지']]],
  ['8. 기타 · 제출',[['etc','기타',AREA],['date','제출일','date'],['submitter','제출인 (대리인이 낼 때만)']]],
];
const EV=[['docs','증거서류 (진술서 · 차용증 · 이체내역 · 문자 캡처 · 진단서 등)','작성자'],['items','증거물 (물건 · 녹음 파일 · 사진 등)','소유자']];
const KEY='goso';
const has=v=>v!=null&&String(v).trim()!=='';
let d={};
const fresh=()=>({reason:Goso.REASON}); // 고소이유는 틀을 미리 넣어 둠
const load=()=>{try{d=JSON.parse(ls.get(KEY)||'')||fresh()}catch(_){d=fresh()}};
const save=()=>ls.set(KEY,JSON.stringify(d));
const getP=p=>p.split('.').reduce((o,k)=>o&&o[k],d);
const setP=(p,v)=>{const ks=p.split('.'),last=ks.pop();ks.reduce((o,k)=>o[k]||(o[k]={}),d)[last]=v};
const segH=(name,opts,cur)=>`<div class="seg${opts.length===2?' kind':''}" data-seg="${name}">`+opts.map(([v,l])=>`<button type="button" data-val="${v}" aria-pressed="${(cur||'')===v}">${l}</button>`).join('')+'</div>';
function fieldH([name,label,kind,hint]){
  if(name==='#make')return `<button type="button" class="btn ghost" id="gs-make">${label}</button>`;
  if(name==='#docs'||name==='#items'){const [k,title,who]=EV.find(e=>'#'+e[0]===name), list=d[k]||[];
    return `<div class="field"><span class="lab">${title}</span>`+[0,1,2,3,4].map(i=>{const e=list[i]||{};
      return `<div class="gsev"><div class="gsrow"><input type="text" name="${k}.${i}.name" value="${esc(e.name||'')}" placeholder="${i+1}. 증거 이름" aria-label="${i+1}번 증거"><input type="text" name="${k}.${i}.who" value="${esc(e.who||'')}" placeholder="${who}" aria-label="${i+1}번 ${who}"></div>`
        +segH(`${k}.${i}.when`,[['now','접수할 때 냄'],['later','수사 중에 냄']],e.when)+'</div>'}).join('')+'</div>'}
  const v=getP(name);
  if(Array.isArray(kind))return `<div class="field"><span class="lab">${label}</span>${segH(name,kind,v)}</div>`;
  const id='gs-'+name.replace(/\./g,'-');
  const ctl=kind===AREA?`<textarea id="${id}" name="${name}" rows="5"${hint?` placeholder="${esc(hint)}"`:''}>${esc(v||'')}</textarea>`
    :`<input id="${id}" name="${name}" value="${esc(v||'')}" ${kind===TEL?'type="tel" class="phone" inputmode="tel"':kind==='date'?'type="date"':kind==='email'?'type="text" inputmode="email" autocomplete="off"':'type="text" autocomplete="off"'}${hint&&kind!==AREA?` placeholder="${esc(hint)}"`:''}>`;
  const note=(name==='purpose'||name==='facts')?`<small class="hint small">${esc(hint)}</small>`:''; // 자동으로 써 주는 칸은 글로도 알려 줌
  return `<div class="field"><label for="${id}">${label}</label>${ctl}${note}</div>`;
}
function render(){
  $('gs-form').innerHTML=SEC.map(([title,fs],i)=>`<details class="gosec"${i===0?' open':''}><summary>${title}</summary>${fs.map(fieldH).join('')}</details>`).join('');
}
const box=document.createElement('div');
box.className='sheet'; box.id='gosheet'; box.hidden=true; box.setAttribute('role','dialog'); box.setAttribute('aria-modal','true'); box.setAttribute('aria-labelledby','gs-h');
box.innerHTML='<div class="sheet-in gosoin"><div class="sheethead"><h2 id="gs-h">고소장 만들기</h2><button type="button" class="ib" id="gs-close" aria-label="닫기"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>'
  +'<p class="hint">적은 내용이 경찰서 고소장 엑셀 양식에 그대로 들어가요. 모르는 칸은 비워 두세요. 적은 내용은 이 휴대폰에만 저장돼요.</p>'
  +'<form id="gs-form" novalidate></form>'
  +'<div class="gsbar"><button type="button" class="btn" id="gs-xlsx">엑셀로 저장</button><button type="button" class="btn ghost" id="gs-reset">처음부터</button></div></div>';
document.body.appendChild(box);

// 운행 상세의 [고소장]: 그 운행의 화주 · 날짜 · 운임으로 피고소인 · 범죄사실 칸을 채움 (내 정보는 고소인 칸에, 비어 있을 때만)
function fromTrip(t){
  const old=JSON.stringify(d), p=getProfile(), dt=t.date.split('-').map(Number), due=left(t);
  d.c=d.c||{}; d.a={}; d.w=d.w||{};
  if(!has(d.c.name))d.c.name=p.name||''; if(!has(d.c.mobile))d.c.mobile=p.phone||''; if(!has(d.c.job))d.c.job='화물운송업';
  d.a.name=t.clientName||t.client||''; d.a.mobile=t.clientPhone||'';
  if(t.client)d.a.etc=`화주 회사: ${t.client}${t.clientName?` (담당자 ${t.clientName})`:''}`;
  Object.assign(d.w,{who:`${t.client?`화주 ${t.client}${t.clientName?'의 담당자':''}`:'화주'}로, 고소인에게 화물 운송을 맡긴`,
    when:`${dt[0]}. ${dt[1]}. ${dt[2]}.경`, where:'',
    how:`${cities(t,'from')}에서 ${cities(t,'to')}까지 화물 운송을 맡기면서 운송이 끝나면 운임 ${won(t.amount)}을 지급하겠다고 하였다`,
    what:due&&due!==t.amount?`받지 못한 운임 ${won(due)} (운임 ${won(t.amount)} 중)`:`받지 못한 운임 ${won(due||t.amount)}`});
  d.facts=''; // 비워 두면 위 칸으로 자동으로 씀
  save(); return old;
}
function open(t){load();const old=t?fromTrip(t):null;render();box.hidden=false;pushOverlay({goso:true});
  if(old)toast(`${t.client||'이 운행'} 내용으로 피고소인 · 범죄사실 칸을 채웠어요`,()=>{d=JSON.parse(old);save();render()})}
Goso.open=open;
function close(){box.hidden=true;popOverlay('goso')}
window.addEventListener('popstate',()=>{if(!box.hidden&&!(history.state&&history.state.goso))box.hidden=true});
const sBtn=$('s-goso'); if(sBtn)sBtn.onclick=()=>open();
box.addEventListener('input',e=>{const n=e.target.name;if(!n)return;setP(n,e.target.value);save()});
box.addEventListener('click',async e=>{
  if(e.target===box||e.target.closest('#gs-close')){close();return}
  const sb=e.target.closest('[data-seg] button');
  if(sb){const g=sb.parentNode, v=getP(g.dataset.seg)===sb.dataset.val&&sb.dataset.val?'':sb.dataset.val; // 다시 누르면 선택 풀기
    setP(g.dataset.seg,v); save(); g.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',b.dataset.val===v)); return}
  if(e.target.closest('#gs-make')){const t=$('gs-facts'), go=()=>{d.facts=Goso.factsText(d);t.value=d.facts;save();toast('범죄사실 문장을 만들었어요. 【 】 부분을 채워 주세요')};
    if(has(t.value)){const old=t.value;go();toast('범죄사실 문장을 새로 만들었어요',()=>{d.facts=old;t.value=old;save()})}else go(); return}
  if(e.target.closest('#gs-reset')){const old=JSON.stringify(d);d=fresh();save();render();toast('처음부터 다시 적어요',()=>{d=JSON.parse(old);save();render()});return}
  if(e.target.closest('#gs-xlsx')){const b=e.target.closest('#gs-xlsx');b.disabled=true;
    try{const r=await giveFile(await Goso.build(d),`고소장_${todayIso}.xlsx`,'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',true);
      if(r!=='cancel')toast(r==='shared'?'고소장 엑셀을 보냈어요':'고소장 엑셀을 "다운로드" 폴더에 저장했어요')}
    catch(err){toast('엑셀을 만들지 못했어요. 인터넷을 켜고 다시 해 주세요')}
    finally{b.disabled=false}}
});
})();
