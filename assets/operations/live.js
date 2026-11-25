
'use strict';
const el=id=>document.getElementById(id), log=el('log'), table=el('table'), channels=['request','result','failure'];
let all=[],filter='all',paused=false,follow=true,inFlight=false,lastUpdate=null,controller=null;
const opened=new Set(),nodes=new Map();
let lastWindow=null,lastRaw=null,retryAt=0,failures=0;
function make(tag,cls,text){const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=String(text);return n}
for(const c of channels){const m=make('div','metric');m.dataset.stream=c;const label=make('div','metric-label',c.toUpperCase()), count=make('strong','','—'),series=make('div','series');count.id='count-'+c;series.id='series-'+c;series.setAttribute('aria-hidden','true');label.append(count);m.append(label,series);el('metrics').append(m)}
function parse(s){try{return JSON.parse(s)}catch{return null}}
function compact(v){if(typeof v==='string')return v.replace(/\s+/g,' ').trim();try{return JSON.stringify(v)??''}catch{return String(v)}}
function group(r){return channels.includes(r.event)?r.event:'lifecycle'}
function stamp(s){const d=new Date(s);return Number.isFinite(+d)?d.toISOString().slice(11,23):'—'}
function shortTime(s){const d=new Date(s);return Number.isFinite(+d)?d.toISOString().slice(0,16).replace('T',' ')+'Z':'—'}
function digest(s){let h=2166136261;for(let i=0;i<s.length;i++)h=Math.imul(h^s.charCodeAt(i),16777619);return (h>>>0).toString(36)}
function recordKey(r){return [r.utc,r.event,r.run_id,digest(r.message),r.message.length].join('|')}
function prepare(records){
 return records.map(r=>({...r,j:parse(r.message),g:r.event,title:'governed_repository_head',excerpt:r.excerpt,paired:false,error:r.event==='failure',key:r.run_id+'|'+r.event}))
}
function addField(parent,name,val){
 const row=make('div','field'),body=make('div','field-value');let value=val;
 if(typeof val==='string'){const nested=parse(val);if(nested&&typeof nested==='object')value=nested}
 if(value&&typeof value==='object'&&!Array.isArray(value)&&typeof value.stdout_stderr==='string'){body.append(make('pre','',value.stdout_stderr));const meta=make('details','aux');const rest={...value};delete rest.stdout_stderr;meta.append(make('summary','','Execution metadata'),make('pre','',JSON.stringify(rest,null,2)));body.append(meta)}else body.append(make('pre','',typeof value==='string'?value:JSON.stringify(value,null,2)??String(value)));row.append(make('div','field-name',name),body);parent.append(row)
}
function fillDetails(d,r){
 d.append(make('div','detail-heading',r.utc+' · '+r.event.toUpperCase()+' · authorized projection'));
 for(const [k,v] of Object.entries(r.j))addField(d,k,v);
}
function makeRow(r){
 const n=make('details','event '+r.g+(r.error?' rpc-error':''));n.dataset.key=r.key;n.dataset.title=r.title;
 const summary=make('summary','event-summary'),time=make('span','time',stamp(r.utc)),stream=make('span','stream',r.event.toUpperCase()),text=make('span','summarytext'),size=make('span','size',r.message.length>=1000?(r.message.length/1000).toFixed(1)+'k':r.message.length);
 time.title=r.utc;text.append(make('b','',r.title),make('span','',r.excerpt));summary.append(time,stream,text,size);n.append(summary);
 const detail=make('div','detail');n.append(detail);const expand=()=>{if(n.open){opened.add(r.key);if(!detail.childNodes.length)fillDetails(detail,r)}else opened.delete(r.key)};
 summary.addEventListener('click',()=>{if(!n.open&&follow)setFollow(false)});n.addEventListener('toggle',expand);if(opened.has(r.key)){n.open=true;expand()}return n
}
function setFollow(v){follow=v;el('follow').setAttribute('aria-pressed',String(v));el('follow').textContent=v?'Following latest':'Follow latest';if(v)table.scrollTop=table.scrollHeight}
function render(){
 const q=el('search').value.trim().toLowerCase(),visible=all.filter(r=>(filter==='all'||r.g===filter)&&(!q||(r.message+' '+r.title+' '+r.event).toLowerCase().includes(q)));
 const oldTop=table.scrollTop,before=[...log.children].find(n=>n.offsetTop+n.offsetHeight>=oldTop),anchor=before?.dataset.key,offset=before?before.offsetTop-oldTop:0;
 const wanted=new Set(visible.map(r=>r.key));for(const [k,n] of nodes)if(!wanted.has(k)){n.remove();nodes.delete(k)}
 if(!visible.length){if(!log.querySelector('.empty'))log.append(make('div','empty','No matching authorized records.'))}else{
  log.querySelector('.empty')?.remove();
  let cursor=log.firstChild;
  for(const r of visible){
   let n=nodes.get(r.key);
   if(n&&n.dataset.title!==r.title){const was=n.open;if(n===cursor)cursor=n.nextSibling;n.remove();nodes.delete(r.key);if(was)opened.add(r.key);n=null}
   if(!n){n=makeRow(r);nodes.set(r.key,n)}
   if(n===cursor)cursor=cursor.nextSibling;else log.insertBefore(n,cursor)
  }
 }
 el('shown').textContent=visible.length+' of '+all.length+' retained records';
 if(follow)table.scrollTop=table.scrollHeight;else if(anchor&&nodes.has(anchor))table.scrollTop=nodes.get(anchor).offsetTop-offset;else table.scrollTop=oldTop
}
function metrics(){
 const valid=all.map(r=>+new Date(r.utc)).filter(Number.isFinite),lo=valid.length?Math.min(...valid):0,hi=valid.length?Math.max(...valid):0;
 const bins=24,counts=Object.fromEntries(channels.map(c=>[c,Array(bins).fill(0)]));let max=1;
 for(const r of all){const t=+new Date(r.utc);if(!Number.isFinite(t))continue;const i=Math.min(bins-1,Math.max(0,Math.floor((t-lo)/Math.max(1,hi-lo)*bins)));max=Math.max(max,++counts[r.g][i])}
 for(const c of channels){el('count-'+c).textContent=all.filter(r=>r.g===c).length;el('series-'+c).replaceChildren(...counts[c].map(n=>{const b=make('i');b.style.height=n/max*100+'%';b.title=n+' records in time bin';return b}))}
 el('range-start').textContent=valid.length?shortTime(lo):'—';el('range-end').textContent=valid.length?shortTime(hi):'—'
}
function status(s,cls){el('state').textContent=s;el('connection').className='connection '+cls;el('updated').textContent=lastUpdate?'Last publication '+shortTime(lastUpdate):'Awaiting snapshot'}
async function tick(force=false){
 if(inFlight||paused||document.hidden)return;
 const windowId=Math.floor(Date.now()/10000);
 if(!force&&(windowId===lastWindow||performance.now()<retryAt))return;
 inFlight=true;controller=new AbortController();const deadline=setTimeout(()=>controller.abort(),10000);
 try{
  const response=await fetch('https://raw.githubusercontent.com/grandchallenge/grandchallenge.github.io/control-public-feed/feed.json?window='+windowId,{cache:'no-cache',signal:controller.signal,credentials:'omit',referrerPolicy:'no-referrer'});
  if(!response.ok)throw Error('feed');
  const raw=await response.text();if(raw.length>100000)throw Error('size');
  const feed=JSON.parse(raw);
  const keys=(v,k)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join('|')===k.slice().sort().join('|');
  const date=v=>typeof v==='string'&&v.length<=40&&Number.isFinite(Date.parse(v));
  const repo='grandchallenge/MATH-PROGRAMME',op='governed_repository_head';
  if(!keys(feed,['schema','policy','coverage','activated_at','published_at','records','withheld_candidates','retention_limit'])||feed.schema!=='GCL_CONTROL_DISCLOSURE_FEED/1'||feed.policy!=='GCL_CONTROL_PUBLIC_HEAD/1'||feed.coverage!=='authorized_control_head_projections_only'||!date(feed.activated_at)||!date(feed.published_at)||!Array.isArray(feed.records)||feed.records.length>48||feed.retention_limit!==48||!Number.isInteger(feed.withheld_candidates)||feed.withheld_candidates<0||feed.withheld_candidates>48)throw Error('schema');
  const records=[],seen=new Set();
  for(const r of feed.records){
   if(!keys(r,['id','accepted_at','finished_at','request','outcome'])||typeof r.id!=='string'||!/^[0-9a-f]{20}$/.test(r.id)||seen.has(r.id)||!date(r.accepted_at)||!date(r.finished_at)||Date.parse(r.accepted_at)<Date.parse(feed.activated_at)-1000||Date.parse(r.finished_at)<Date.parse(r.accepted_at)||!keys(r.request,['operation','arguments'])||r.request.operation!==op||!keys(r.request.arguments,['repo'])||r.request.arguments.repo!==repo)throw Error('record');
   seen.add(r.id);const o=r.outcome;
   if(o?.operation!==op)throw Error('outcome');
   let event,excerpt;
   if(o.outcome==='completed'&&keys(o,['operation','outcome','result'])&&keys(o.result,['repository','branch','head_sha','mutation'])&&o.result.repository===repo&&o.result.branch==='main'&&o.result.mutation===false&&typeof o.result.head_sha==='string'&&/^[0-9a-f]{40}$/.test(o.result.head_sha)){
    event='result';excerpt='Public main revision '+o.result.head_sha;
   }else if(o.outcome==='failed'&&keys(o,['operation','outcome','detail'])&&o.detail==='Underlying diagnostic not disclosure-authorized'){event='failure';excerpt='Observed failure · diagnostic private'}else throw Error('outcome');
   records.push({utc:r.accepted_at,event:'request',run_id:r.id,message:JSON.stringify(r.request,null,2),excerpt:repo},{utc:r.finished_at,event,run_id:r.id,message:JSON.stringify(o,null,2),excerpt});
  }
  if(paused||document.hidden)return;
  if(lastUpdate&&Date.parse(feed.published_at)<Date.parse(lastUpdate))throw Error('older cached publication');
  lastWindow=windowId;retryAt=0;failures=0;
  if(raw===lastRaw){status('Feed reachable','published');return}
  lastRaw=raw;
  const source=el('source');source.textContent='';const link=make('a','',repo);link.href='https://github.com/'+repo;
  source.append(link,make('span','',feed.records.length+' paired operations · '+feed.withheld_candidates+' withheld candidates in retained window · activated '+feed.activated_at+' · bounded history'));
  records.sort((a,b)=>a.utc.localeCompare(b.utc));
  all=prepare(records);const retained=new Set(all.map(r=>r.key));for(const k of opened)if(!retained.has(k))opened.delete(k);
  lastUpdate=feed.published_at;status('Feed reachable','published');metrics();render()
 }catch(e){if(!paused&&!document.hidden){failures++;retryAt=performance.now()+Math.min(60000,5000*2**Math.min(failures-1,4));status('Feed unavailable · retained display','stale')}}finally{clearTimeout(deadline);controller=null;inFlight=false;if(!paused&&!document.hidden&&el('state').textContent==='Paused')tick(true)}
}
document.querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>{filter=b.dataset.filter;document.querySelectorAll('[data-filter]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));render()});
el('search').addEventListener('input',()=>{if(follow)setFollow(false);render()});el('follow').onclick=()=>setFollow(!follow);
el('pause').onclick=()=>{paused=!paused;el('pause').setAttribute('aria-pressed',String(paused));el('pause').textContent=paused?'Resume feed':'Pause feed';if(paused){controller?.abort();status('Paused','')}else tick(true)};
let userScroll=false;for(const name of ['wheel','touchmove','pointerdown','keydown'])table.addEventListener(name,()=>{userScroll=true},{passive:true});table.addEventListener('scroll',()=>{if(userScroll&&follow&&table.scrollHeight-table.clientHeight-table.scrollTop>45)setFollow(false);userScroll=false},{passive:true});
document.addEventListener('visibilitychange',()=>{if(document.hidden)controller?.abort();else tick(true)});tick();setInterval(tick,5000);
