
'use strict';
const el=id=>document.getElementById(id), log=el('log'), table=el('table'), channels=['stdin','stdout','stderr','lifecycle'];
let all=[],filter='all',paused=false,follow=true,inFlight=false,lastUpdate=null,controller=null;
const opened=new Set(),nodes=new Map();
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
 const pending=new Map(), occurrences=new Map();
 return records.map(r=>{
  const p=parse(r.message),j=p&&typeof p==='object'&&!Array.isArray(p)?p:null,g=group(r);let title=r.event.toUpperCase(),excerpt=r.message,paired=false,error=false;
  if(j&&j.jsonrpc){
   const hasId=Object.prototype.hasOwnProperty.call(j,'id'),key=hasId?JSON.stringify([r.run_id,j.id]):null;
   if(typeof j.method==='string'){
    title=typeof j.params?.name==='string'?j.params.name:j.method;const args=j.params?.arguments;
    excerpt=args&&typeof args==='object'?(typeof args.command==='string'?args.command:compact(args)):compact(j.params||{});
    if(g==='stdin'&&key!==null)pending.set(key,pending.has(key)?{ambiguous:true}:{title});
   }else if(hasId&&('result' in j||'error' in j)){
    const q=pending.get(key);if(q&&!q.ambiguous&&g==='stdout'){title=q.title;paired=true}else title='RPC response';
    if(g==='stdout')pending.delete(key);error=!!j.error||j.result?.isError===true;
    const first=Array.isArray(j.result?.content)?j.result.content.find(c=>c&&typeof c.text==='string')?.text:undefined;
    excerpt=first||compact(j.error||j.result);if(typeof first==='string'){const nested=parse(first);if(nested&&typeof nested==='object')excerpt=typeof nested.stdout_stderr==='string'?nested.stdout_stderr:compact(nested)}
   }else{title='JSON-RPC';excerpt=compact(j)}
  }else if(g==='stderr')title='Diagnostic';else if(g==='stdout')title='Program output';else if(g==='stdin')title='Program input';
  const base=recordKey(r), ordinal=(occurrences.get(base)||0)+1;occurrences.set(base,ordinal);
  return {...r,j,g,title,excerpt:compact(excerpt).slice(0,600),paired,error,key:base+'|'+ordinal}
 })
}
function addField(parent,name,val){
 const row=make('div','field'),body=make('div','field-value');let value=val;
 if(typeof val==='string'){const nested=parse(val);if(nested&&typeof nested==='object')value=nested}
 if(value&&typeof value==='object'&&!Array.isArray(value)&&typeof value.stdout_stderr==='string'){body.append(make('pre','',value.stdout_stderr));const meta=make('details','aux');const rest={...value};delete rest.stdout_stderr;meta.append(make('summary','','Execution metadata'),make('pre','',JSON.stringify(rest,null,2)));body.append(meta)}else body.append(make('pre','',typeof value==='string'?value:JSON.stringify(value,null,2)??String(value)));row.append(make('div','field-name',name),body);parent.append(row)
}
function fillDetails(d,r){
 d.append(make('div','detail-heading',r.utc+' · '+r.event.toUpperCase()+(r.paired?' · matched request label':r.j?.id!==undefined?' · RPC ID '+compact(r.j.id):'')));
 const j=r.j;if(!j){d.append(make('pre','',r.message));return}
 if(j.method){addField(d,'Method',j.method);if(j.params?.name!==undefined)addField(d,'Tool',j.params.name);
 if(j.params?.arguments&&typeof j.params.arguments==='object')for(const [k,v] of Object.entries(j.params.arguments))addField(d,k,v);else if(j.params!==undefined)addField(d,'Parameters',j.params)}
 else if(j.error!==undefined)addField(d,'Error',j.error);
 else if(j.result!==undefined){const content=j.result?.content;if(Array.isArray(content)&&content.length){for(const [i,c] of content.entries())addField(d,'Result '+(i+1),c?.text??c)}else addField(d,'Result',j.result)}
 else addField(d,'Message',j);
 const raw=make('details','aux');raw.append(make('summary','','Redacted JSON envelope'),make('pre','',r.message));d.append(raw)
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
 if(!visible.length){if(!log.querySelector('.empty'))log.append(make('div','empty','No matching retained records.'))}else{
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
function status(s,cls){el('state').textContent=s;el('connection').className='connection '+cls;el('updated').textContent=lastUpdate?'Released '+shortTime(lastUpdate):'Awaiting snapshot'}
async function tick(){
 if(inFlight||paused||document.hidden)return;inFlight=true;controller=new AbortController();const deadline=setTimeout(()=>controller.abort(),10000);
 try{
  const response=await fetch('./feed.json',{cache:'no-cache',signal:controller.signal});
  if(!response.ok)throw Error('feed');
  const feed=await response.json();
  if(feed.schema!=='GCL_PUBLIC_CONSOLE_FEED/1'||feed.coverage!=='explicit_public_producer_only'||!['grandchallenge/gcl-public-web-preview','grandchallenge/grandchallenge.github.io'].includes(feed.source_repository)||!/^[0-9a-f]{40}$/.test(feed.source_revision)||!Array.isArray(feed.events)||feed.events.length>250||!Number.isFinite(Date.parse(feed.published_at)))throw Error('schema');
  const permitted=new Set(['stdin','stdout','stderr','start','finish','notice']);
  if(!feed.events.every(r=>permitted.has(r.event)&&typeof r.message==='string'&&r.message.length<=40000&&typeof r.run_id==='string'&&Number.isFinite(Date.parse(r.utc))))throw Error('event');
  const source=el('source');source.textContent='';const link=make('a','',feed.source_repository+' @ '+feed.source_revision.slice(0,12));link.href='https://github.com/'+feed.source_repository+'/commit/'+feed.source_revision;source.append(link,make('span','','Producer: '+feed.producer+' · exit '+feed.exit_code+' · stderr '+feed.stream_bytes.stderr+' bytes · released '+feed.published_at));

  if(paused)return;
  const records=[...feed.events].sort((a,b)=>a.utc.localeCompare(b.utc));
  all=prepare(records);const keys=new Set(all.map(r=>r.key));for(const k of opened)if(!keys.has(k))opened.delete(k);
  lastUpdate=feed.published_at;status('Published','published');metrics();render()
 }catch(e){if(!paused&&!document.hidden)status('Feed unavailable · retained display','stale')}finally{clearTimeout(deadline);controller=null;inFlight=false;if(!paused&&!document.hidden&&el('state').textContent==='Paused')tick()}
}
document.querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>{filter=b.dataset.filter;document.querySelectorAll('[data-filter]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));render()});
el('search').addEventListener('input',()=>{if(follow)setFollow(false);render()});el('follow').onclick=()=>setFollow(!follow);
el('pause').onclick=()=>{paused=!paused;el('pause').setAttribute('aria-pressed',String(paused));el('pause').textContent=paused?'Resume feed':'Pause feed';if(paused){controller?.abort();status('Paused','')}else tick()};
let userScroll=false;for(const name of ['wheel','touchmove','pointerdown','keydown'])table.addEventListener(name,()=>{userScroll=true},{passive:true});table.addEventListener('scroll',()=>{if(userScroll&&follow&&table.scrollHeight-table.clientHeight-table.scrollTop>45)setFollow(false);userScroll=false},{passive:true});
document.addEventListener('visibilitychange',()=>{if(document.hidden)controller?.abort();else tick()});tick();setInterval(tick,60000);
