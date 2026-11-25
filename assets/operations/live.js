
'use strict';
const el=id=>document.getElementById(id), log=el('log'), table=el('table'), channels=['request','result','failure'];
let all=[],filter='all',paused=false,follow=true,inFlight=false,lastUpdate=null,controller=null;
const opened=new Set(),nodes=new Map();
let lastWindow=null,lastRaw=null,retryAt=0,failures=0,lastEpoch=0,lastEpochStart=null;
function make(tag,cls,text){const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=String(text);return n}
for(const c of channels){const m=make('div','metric');m.dataset.stream=c;const label=make('div','metric-label',({request:'ACCEPTED',result:'COMPLETED',failure:'FAILED'}[c])), count=make('strong','','—'),series=make('div','series');count.id='count-'+c;series.id='series-'+c;series.setAttribute('aria-hidden','true');label.append(count);m.append(label,series);el('metrics').append(m)}
function parse(s){try{return JSON.parse(s)}catch{return null}}
function compact(v){if(typeof v==='string')return v.replace(/\s+/g,' ').trim();try{return JSON.stringify(v)??''}catch{return String(v)}}
function group(r){return channels.includes(r.event)?r.event:'lifecycle'}
function stamp(s){const d=new Date(s);return Number.isFinite(+d)?d.toISOString().slice(11,23):'—'}
function shortTime(s){const d=new Date(s);return Number.isFinite(+d)?d.toISOString().slice(0,16).replace('T',' ')+'Z':'—'}
function digest(s){let h=2166136261;for(let i=0;i<s.length;i++)h=Math.imul(h^s.charCodeAt(i),16777619);return (h>>>0).toString(36)}
function recordKey(r){return [r.utc,r.event,r.run_id,digest(r.message),r.message.length].join('|')}
function prepare(records){
 return records.map(r=>({...r,j:parse(r.message),g:r.event,title:r.operation,excerpt:r.excerpt,paired:false,error:r.event==='failure',key:r.run_id+'|'+r.event}))
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
 const summary=make('summary','event-summary'),time=make('span','time',stamp(r.utc)),stream=make('span','stream',({request:'ACCEPTED',result:'COMPLETED',failure:'FAILED'}[r.event])),text=make('span','summarytext'),size=make('span','size','');
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
function status(s,cls){
 el('state').textContent=s;el('connection').className='connection '+cls;
 const age=lastUpdate?Math.max(0,Math.floor((Date.now()-Date.parse(lastUpdate))/1000)):null;
 el('updated').textContent=lastUpdate?'Published '+lastUpdate.slice(11,19)+' UTC · '+(age<60?age+'s':Math.floor(age/60)+'m')+' ago':'Awaiting snapshot'
}
function freshness(){
 if(paused)return;
 if(!lastUpdate){status('Awaiting publication','');return}
 const stale=Date.now()-Date.parse(lastUpdate)>600000;
 status(stale?'Stale publication · health unknown':'Recent publication',stale?'stale':'published')
}
async function tick(force=false){
 if(inFlight||paused||document.hidden)return;
 if(!failures)freshness();
 const windowId=Math.floor(Date.now()/10000);
 if(!force&&(windowId===lastWindow||performance.now()<retryAt))return;
 inFlight=true;controller=new AbortController();const deadline=setTimeout(()=>controller.abort(),10000);
 try{
  const response=await fetch('https://raw.githubusercontent.com/grandchallenge/grandchallenge.github.io/control-public-feed/activity.json?window='+windowId,{cache:'no-cache',signal:controller.signal,credentials:'omit',referrerPolicy:'no-referrer'});
  if(!response.ok)throw Error('feed');
  const raw=await response.text();if(raw.length>100000)throw Error('size');
  const feed=JSON.parse(raw);
  const keys=(v,k)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join('|')===k.slice().sort().join('|');
  const date=v=>typeof v==='string'&&v.length<=40&&Number.isFinite(Date.parse(v));
  const ops=new Set(['run_bash','system_status','project_queue_audit','project_queue_reconcile','project_queue_views_readback','governed_repository_head','governed_repository_file','governed_repository_pr','governed_repository_document_proposal','external_github_merge_inspect','outbound_audit_health']);
  const targets=new Set(['CHAD Bash','CONTROL service','GCL Worker Queue #2','GCL saved views','unapproved-repository','grandchallenge-repository','grandchallenge/MATHSOLVE','grandchallenge/MATH-PROGRAMME','grandchallenge/ADAPTIVE-INTELLIGENCE-ATLAS','grandchallenge/COMPUTATIONAL-DIFFICULTY-ATLAS','grandchallenge/CONTROL']);
  if(!keys(feed,['schema','policy','coverage','epoch','epoch_started_at','epoch_reason','published_at','records','withheld_candidates','retention_limit'])||feed.schema!=='GCL_CONTROL_ACTIVITY_FEED/2'||feed.policy!=='GCL_CONTROL_PUBLIC_LIFECYCLE/2'||feed.coverage!=='authorized_control_lifecycle_only'||!Number.isInteger(feed.epoch)||feed.epoch<1||!date(feed.epoch_started_at)||!['activation','source_gap','index_reset'].includes(feed.epoch_reason)||!date(feed.published_at)||Date.parse(feed.published_at)<Date.parse(feed.epoch_started_at)||!Array.isArray(feed.records)||feed.records.length>48||feed.retention_limit!==48||!Number.isInteger(feed.withheld_candidates)||feed.withheld_candidates<0||feed.withheld_candidates>48)throw Error('schema');
  if(feed.epoch<lastEpoch||(feed.epoch===lastEpoch&&lastEpochStart!==null&&feed.epoch_started_at!==lastEpochStart))throw Error('older epoch');
  const records=[],seen=new Set();
  let latest=null;
  for(const r of feed.records){
   if(!keys(r,['id','operation','target','accepted_at','finished_at','outcome','exit_code'])||typeof r.id!=='string'||!/^[0-9a-f]{20}$/.test(r.id)||seen.has(r.id)||!ops.has(r.operation)||!targets.has(r.target)||(r.operation==='run_bash')!==(r.target==='CHAD Bash')||!date(r.accepted_at)||Date.parse(r.accepted_at)>Date.parse(feed.published_at))throw Error('record');
   seen.add(r.id);
   if(r.outcome==='accepted'){
    if(r.finished_at!==null||r.exit_code!==null)throw Error('pending');
   }else if(!['completed','failed'].includes(r.outcome)||!date(r.finished_at)||Date.parse(r.finished_at)<Date.parse(r.accepted_at)||Date.parse(r.finished_at)>Date.parse(feed.published_at)||!Number.isInteger(r.exit_code)||r.exit_code< -255||r.exit_code>255||(r.outcome==='completed')!==(r.exit_code===0))throw Error('outcome');
   const message=JSON.stringify({operation:r.operation,target:r.target,phase:'accepted',payload:'Private command/arguments not authorized for disclosure'},null,2);
   records.push({utc:r.accepted_at,event:'request',run_id:r.id,operation:r.operation,message,excerpt:r.target+' · accepted'});
   if(r.finished_at!==null){
    const duration=Math.round((Date.parse(r.finished_at)-Date.parse(r.accepted_at))/100)/10;
    const out={operation:r.operation,target:r.target,outcome:r.outcome,exit_code:r.exit_code,duration_seconds:duration,payload:'Private result/diagnostic text not authorized for disclosure'};
    records.push({utc:r.finished_at,event:r.outcome==='completed'?'result':'failure',run_id:r.id,operation:r.operation,message:JSON.stringify(out,null,2),excerpt:r.target+' · exit '+r.exit_code+' · '+duration+'s'});
   }
   const last=r.finished_at||r.accepted_at;if(latest===null||Date.parse(last)>Date.parse(latest))latest=last;
  }
  if(paused||document.hidden)return;
  if(lastUpdate&&Date.parse(feed.published_at)<Date.parse(lastUpdate))throw Error('older cached publication');
  lastWindow=windowId;retryAt=0;failures=0;lastEpoch=feed.epoch;lastEpochStart=feed.epoch_started_at;
  lastUpdate=feed.published_at;freshness();
  if(raw===lastRaw)return;
  lastRaw=raw;
  const source=el('source');source.textContent='';
  source.append(make('span','',feed.records.length+' operations · '+feed.withheld_candidates+' incomplete/invalid candidates withheld · last activity '+(latest||'none in this epoch')));
  source.append(make('span','','Epoch '+feed.epoch+' · '+feed.epoch_started_at+' · '+(feed.epoch_reason==='activation'?'new coverage; earlier history not included':'source discontinuity; resumed from new boundary, missing history not reconstructed')));
  records.sort((a,b)=>a.utc.localeCompare(b.utc));
  all=prepare(records);const retained=new Set(all.map(r=>r.key));for(const k of opened)if(!retained.has(k))opened.delete(k);
  metrics();render()
 }catch(e){if(!paused&&!document.hidden){failures++;retryAt=performance.now()+Math.min(60000,5000*2**Math.min(failures-1,4));status('Feed unavailable · retained display','stale')}}finally{clearTimeout(deadline);controller=null;inFlight=false;if(!paused&&!document.hidden&&el('state').textContent==='Paused')tick(true)}
}
document.querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>{filter=b.dataset.filter;document.querySelectorAll('[data-filter]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));render()});
el('search').addEventListener('input',()=>{if(follow)setFollow(false);render()});el('follow').onclick=()=>setFollow(!follow);
el('pause').onclick=()=>{paused=!paused;el('pause').setAttribute('aria-pressed',String(paused));el('pause').textContent=paused?'Resume feed':'Pause feed';if(paused){controller?.abort();status('Paused','')}else tick(true)};
let userScroll=false;for(const name of ['wheel','touchmove','pointerdown','keydown'])table.addEventListener(name,()=>{userScroll=true},{passive:true});table.addEventListener('scroll',()=>{if(userScroll&&follow&&table.scrollHeight-table.clientHeight-table.scrollTop>45)setFollow(false);userScroll=false},{passive:true});
document.addEventListener('visibilitychange',()=>{if(document.hidden)controller?.abort();else tick(true)});tick();setInterval(tick,5000);
