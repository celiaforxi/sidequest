import { requestReplan } from './api.mjs';
import { intentLabels, validateIntent } from './intent.mjs';
import { INTERESTS, MOODS, ENERGY } from './data.mjs';
import { generatePlan, replan, summary, clock, validatePreferences } from './planner.mjs';
const $ = selector => document.querySelector(selector);
const esc = value => String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const STORAGE='sidequest.plans.v1';
const today=new Date();
const localDate=`${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
let interests=['美食','城市漫步','咖啡'],mood=MOODS[0],busy=false,isSample=true,toastTimer;
let history=[],storageAvailable=true,storageMessage='';
let aiConfigured=false;let providerName='已配置的模型服务';
const sourceLabels={mock:'Mock 模拟响应 · 非真实 AI',ai:'AI 识别 · 规则执行',rules:'关键词规则',local:'本地关键词规则'};
try{const saved=JSON.parse(localStorage.getItem(STORAGE)||'[]');if(!Array.isArray(saved))throw Error('invalid');history=saved.filter(validStoredPlan).slice(0,6);if(history.length!==saved.length)storageMessage='部分旧计划格式不兼容，已跳过。';}catch{storageMessage='历史记录无法读取，当前会话仍可使用。';history=[];}
let plan=generatePlan({city:'巴黎',date:localDate,hotel:'圣日耳曼 / 左岸',wake:'09:00',budget:600,must:'卢浮宫，塞纳河畔散步',interests,mood,energy:4});
function validStoredPlan(value){try{validatePreferences(value.prefs);return typeof value.id==='string'&&typeof value.updatedAt==='string'&&Number.isFinite(value.version)&&Number.isFinite(value.start)&&Number.isFinite(value.allowance)&&typeof value.conditions?.rain==='boolean'&&Array.isArray(value.items)&&Array.isArray(value.deferred)&&Array.isArray(value.changes)&&Array.isArray(value.generationNotes)&&[...value.items,...value.deferred].every(x=>typeof x.id==='string'&&typeof x.title==='string'&&typeof x.category==='string'&&Number.isFinite(x.duration)&&Number.isFinite(x.cost))&&value.items.every(x=>Number.isFinite(x.start)&&Number.isFinite(x.end));}catch{return false;}}
function toast(text){clearTimeout(toastTimer);$('#toast').textContent=text;$('#toast').hidden=false;toastTimer=setTimeout(()=>$('#toast').hidden=true,4200);}
function persist(){if(isSample)return;const snapshot=JSON.parse(JSON.stringify({...plan,previous:null}));history=[snapshot,...history.filter(x=>x.id!==plan.id)].slice(0,6);try{localStorage.setItem(STORAGE,JSON.stringify(history));storageAvailable=true;}catch{storageAvailable=false;toast('浏览器未能保存记录。当前计划可继续使用，刷新后可能丢失。');}$('#history-count').textContent=history.length;}
function renderChips(){$('#interest-chips').innerHTML=INTERESTS.map(x=>`<button type="button" class="chip" data-interest="${x}" aria-pressed="${interests.includes(x)}">${x}</button>`).join('');$('#mood-chips').innerHTML=MOODS.map(x=>`<button type="button" class="chip" data-mood="${x}" aria-pressed="${mood===x}">${x}</button>`).join('');}
function syncForm(){const p=plan.prefs;for(const key of ['city','date','hotel','wake','budget','must','energy'])$(`[name=${key}]`).value=p[key];interests=[...p.interests];mood=p.mood;renderChips();$('#form-energy-value').textContent=`${p.energy} / 5`;}
function render(){
 const p=plan.prefs,s=summary(plan),completed=plan.items.filter(x=>x.completed),firstPending=plan.items.find(x=>!x.completed);
 $('#plan-title').textContent=`${p.city}的一天`;$('#version-tag').textContent=isSample?'示例预览':`PLAN V${plan.version}`;$('#plan-eyebrow').textContent=isSample?'A DAY IN PARIS':'YOUR DAY, YOUR WAY';
 $('#plan-meta').innerHTML=`<span>${esc(p.date)}</span><span>住宿 · ${esc(p.hotel)}</span><span>${esc(p.wake)} 起床</span>`;
 const warnings=[];if(isSample)warnings.push('这是巴黎示例。调整旅行偏好，生成属于你的一天。');else warnings.push(`${sourceLabels[plan.analysis?.source]||'规则规划'} · 旅行数据为模拟 · ${storageAvailable?'已自动保存到本机':'仅当前会话保存'}${plan.conditions.rain?' · 雨天模式':''}${p.energy<=2?' · 低体力模式':''}`);
 if(!plan.knownCity)warnings.push('这座城市暂无地点库，显示通用占位行程，需自行核实。');
 if(s.overBudget)warnings.push(`预计超预算 ¥${s.cost-p.budget}：必要餐饮、已到访或必去项目仍有费用，请提高预算或减少必去地点。`);
 if(s.unknownCost)warnings.push('含待核实地点：部分费用是占位估算，未核价项目可能未计入，合计不是完整报价。');
 if(p.energy<=2&&plan.items.filter(x=>!x.completed&&x.must).length>3)warnings.push('必去地点较多，低体力下仍可能吃力，可减少必去数量。');
 $('#plan-notice').textContent=warnings.join(' ');
 $('#plan-stats').innerHTML=`<div class="stat"><strong>${s.count}</strong><small>站</small><p>${completed.length?`已到访 ${completed.length} 站`:'今天的小发现'}</p></div><div class="stat"><strong>${s.hours}</strong><small>小时</small><p>含交通休息 · 估算</p></div><div class="stat"><strong>¥${s.cost}</strong><p>费用估算 / 预算 ¥${p.budget}</p></div>`;
 $('#timeline').innerHTML=plan.items.length?plan.items.map((item,index)=>{
 const change=plan.changes.find(x=>x.id===item.id),badge=change&&change.type!=='保留'?`<span class="badge ${change.type==='新增'?'added':'moved'}">${change.type}</span>`:'';
 const canComplete=item.id===firstPending?.id,canUndo=item.id===completed.at(-1)?.id;
 const action=item.completed?(canUndo?`<button class="done-button" data-done="${esc(item.id)}">✓ 已到访 · 撤销</button>`:'<span class="muted">✓ 已到访</span>'):(canComplete?`<button class="done-button" data-done="${esc(item.id)}">标记已到访</button>`:'<span class="muted">待到访</span>');
 return `<article class="stop"><div class="time-stamp">${clock(item.start)}</div><div class="stop-card ${item.completed?'completed':''}"><div class="stop-top"><span class="stop-kind">${esc(item.category)} / ${item.indoor===null?'环境待核实':item.indoor?'室内':'户外'}</span><span class="stop-badges">${badge}${item.must?'<span class="badge must">必去</span>':''}</span></div><h3>${esc(item.title)}</h3><div class="stop-detail"><span>${clock(item.start)}–${clock(item.end)}</span><span>${item.unknown?(item.cost>0?`约 ¥${item.cost} · 待核实`:'费用待核实'):`¥${item.cost} / 人`}</span></div><p class="stop-desc">${esc(item.description)}</p><div class="stop-bottom"><span class="stop-area">${esc(item.area)} · ${item.unknown?'自选占位':'模拟信息'}</span>${action}</div></div>${index<plan.items.length-1?`<div class="transfer">↓　${p.energy<=2?'优先乘车':'交通'}缓冲 ${plan.items[index+1].transfer} 分钟 · 模拟</div>`:''}</article>`;
 }).join(''):'<div class="no-plan">今天剩余时间已不足以安排完整活动。<br>必去地点会留在下方，不会自动预约或跨日排入。你可以调整起床时间，重新生成计划。</div>';
 $('#deferred').innerHTML=plan.deferred.length?`<section class="deferred"><h3>留给另一天 · ${plan.deferred.length} 个地点</h3>${plan.deferred.map(x=>`<p><strong>${esc(x.title)}</strong><br>${esc(x.reason)}</p>`).join('')}<p class="muted" style="margin-top:8px">仅加入待安排清单，尚未排入任何日期。</p></section>`:'';
 $('#plan-tail').textContent=plan.items.length?`${s.end} 结束 · 另预留模拟交通费 ¥${plan.allowance}（已计入合计），不含住宿、购物；起床后预留 30 分钟准备。`:'可以把剩下的时间留给休息。';
 $('#energy-steps').innerHTML=ENERGY.map((x,i)=>`<button type="button" data-energy="${i+1}" aria-pressed="${p.energy===i+1}" aria-label="体力 ${i+1}：${x}" title="${x}">${i+1}</button>`).join('');$('#energy-description').textContent=ENERGY[p.energy-1];renderReasons();$('#history-count').textContent=history.length;
}
function renderReasons(){
 if(!plan.lastEvent){$('#reason-panel').innerHTML=`<p class="eyebrow">THE THOUGHT BEHIND YOUR DAY</p><h2 style="margin-top:9px">这样安排，是因为…</h2><ul class="reason-list">${plan.generationNotes.map((x,i)=>`<li>${i===0?'从住宿出发':'留出弹性'}<p>${esc(x)}</p></li>`).join('')}</ul>`;return;}
 let recognition='';
 try{if(plan.analysis){validateIntent(plan.analysis.intent,{items:plan.analysis.intent.targetPlaceId?[{id:plan.analysis.intent.targetPlaceId,completed:false}]:[]});recognition=`<div class="recognition-preview"><strong>${esc(sourceLabels[plan.analysis.source]||'识别结果')}</strong><p>${esc(intentLabels(plan.analysis.intent,plan).join(' · '))}</p><small>下方原因来自规则实际执行结果</small></div>`;}}catch{}
 const counts=['保留','删除','移动','新增'].map(x=>`${x} ${plan.changes.filter(c=>c.type===x).length}`).join(' · ');
 $('#reason-panel').innerHTML=`<p class="eyebrow">A NEW WAY TO GO</p><h2 style="margin-top:9px">已为你调整好</h2><p class="reason-summary">“${esc(plan.lastEvent.text)}”</p>${recognition}<div class="change-counts">${counts}</div>${plan.lastEvent.defaults?.length?`<p>${esc(plan.lastEvent.defaults.join(' '))}</p>`:''}<ul class="reason-list">${plan.changes.filter(c=>c.type!=='保留').map(changeMarkup).join('')}</ul><details><summary>查看保留的 ${plan.changes.filter(c=>c.type==='保留').length} 项及原因</summary><ul class="reason-list">${plan.changes.filter(c=>c.type==='保留').map(changeMarkup).join('')}</ul></details>${plan.previous?'<button class="undo-button" id="undo-replan">撤销这次调整</button>':''}`;
}
function changeMarkup(c){return `<li><span class="badge ${c.type==='新增'?'added':'moved'}">${esc(c.type)}</span><strong>${esc(c.title)}</strong>${c.before||c.after?`<p>${esc(c.before||'新安排')} ${c.after?'→ '+esc(c.after):'→ 移出当天'}</p>`:''}<p>${esc(c.reason)}</p></li>`;}
function baselineTime(){const done=plan.items.filter(x=>x.completed);return clock(Math.min(23*60+59,Math.max(plan.start,done.at(-1)?.end||0)));}
function openChange(){
 $('#change-input').value='';$('#change-error').hidden=true;$('#local-fallback').hidden=true;$('#recognition-preview').hidden=true;$('#change-time').value=baselineTime();const pending=plan.items.filter(x=>!x.completed);
 $('#change-target').innerHTML=pending.length?pending.map(x=>`<option value="${esc(x.id)}">${esc(x.title)}</option>`).join(''):'<option value="">无待到访地点</option>';
 const target=pending.find(x=>x.category!=='咖啡'&&x.category!=='美食');if(target)$('#change-target').value=target.id;
 $('#change-dialog').showModal();$('#change-input').focus();
}
function finishMutation(message){isSample=false;persist();render();toast(storageAvailable?message:'当前计划已更新，但浏览器拒绝保存；刷新后可能丢失。');}
async function withLoading(action){if(busy)return;busy=true;const buttons=[$('#generate-button'),$('#replan-button'),$('#local-fallback'),$('#planning-mode')];buttons.forEach(x=>x.disabled=true);$('#timeline').classList.add('loading');$('#timeline').setAttribute('aria-busy','true');try{return await action();}finally{busy=false;buttons.forEach(x=>x.disabled=false);$('#timeline').classList.remove('loading');$('#timeline').setAttribute('aria-busy','false');}}
async function applyReplan(input,{local=false}={}){
 return withLoading(async()=>{
  const mode=$('#planning-mode').value;
  const oldPlan=plan;
  if(input.energy!==undefined||local||mode==='rules'){
   const next=replan(oldPlan,input);
   delete next.analysis;
   plan=next;
  }else{
   const result=await requestReplan(oldPlan,{...input,mode});
   if(result.status==='needs_clarification'){
    $('#recognition-preview').hidden=false;
    $('#recognition-preview').textContent=`${sourceLabels[mode]}：${intentLabels(result.intent,oldPlan).join(' · ')}。${result.message}`;
    return {clarification:true};
   }
   if(result.status!=='applied'||!result.plan)throw Error('返回结果不完整，行程未改变。');
   result.plan.previous={...oldPlan,previous:null};
   plan=result.plan;
  }
  finishMutation('路线已更新，每一项调整都有原因。');
  return {version:plan.version,changes:plan.changes,summary:summary(plan)};
 });
}
$('#plan-form').addEventListener('submit',async e=>{e.preventDefault();await withLoading(()=>{try{const data=Object.fromEntries(new FormData(e.target));plan=generatePlan({...data,interests,mood});finishMutation('今天的计划已生成并保存在本机。');if(matchMedia('(max-width:760px)').matches)$('#plan-title').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth',block:'start'});}catch(err){toast(err.message);}});});
$('#interest-chips').addEventListener('click',e=>{const b=e.target.closest('[data-interest]');if(!b)return;const x=b.dataset.interest;interests=interests.includes(x)?interests.filter(i=>i!==x):[...interests,x];renderChips();});
$('#mood-chips').addEventListener('click',e=>{const b=e.target.closest('[data-mood]');if(!b)return;mood=b.dataset.mood;renderChips();});
$('#form-energy').addEventListener('input',e=>$('#form-energy-value').textContent=`${e.target.value} / 5`);
$('#energy-steps').addEventListener('click',async e=>{const b=e.target.closest('[data-energy]');if(!b||busy)return;const energy=Number(b.dataset.energy);if(energy===plan.prefs.energy)return;await applyReplan({energy,now:baselineTime()});$('#form-energy').value=energy;$('#form-energy-value').textContent=`${energy} / 5`;});
$('#timeline').addEventListener('click',e=>{if(busy)return;const b=e.target.closest('[data-done]');if(!b)return;const item=plan.items.find(x=>x.id===b.dataset.done);if(!item)return;item.completed=!item.completed;plan.previous=null;plan.updatedAt=new Date().toISOString();finishMutation(item.completed?'已记录到访，之后重排会保留这一站。':'已撤销到访记录。');});
$('#reason-panel').addEventListener('click',e=>{if(e.target.closest('#undo-replan')&&plan.previous&&!busy){plan=plan.previous;finishMutation('已恢复调整前的行程。');$('#form-energy').value=plan.prefs.energy;$('#form-energy-value').textContent=`${plan.prefs.energy} / 5`;}});
for(const button of document.querySelectorAll('#open-change,#open-change-side'))button.addEventListener('click',openChange);
$('#event-chips').innerHTML=['睡过头两小时','突然下雨了','排队90分钟','我现在很累','想吃烤肉','想去逛街'].map(x=>`<button type="button" class="chip" data-event="${x}">${x}</button>`).join('');
$('#event-chips').addEventListener('click',e=>{const b=e.target.closest('[data-event]');if(b){$('#change-input').value=b.dataset.event;$('#change-input').focus();$('#change-error').hidden=true;}});
async function submitChange(local=false){
 if(busy)return;
 $('#change-error').hidden=true;$('#recognition-preview').hidden=true;$('#local-fallback').hidden=true;
 try{
  const result=await applyReplan({text:$('#change-input').value,now:$('#change-time').value,targetId:$('#change-target').value},{local});
  if(result?.clarification)return;
  $('#change-dialog').close();$('#form-energy').value=plan.prefs.energy;$('#form-energy-value').textContent=`${plan.prefs.energy} / 5`;
 }catch(err){
  $('#change-error').textContent=err.message;$('#change-error').hidden=false;$('#local-fallback').hidden=local;
 }
}
$('#change-form').addEventListener('submit',e=>{e.preventDefault();submitChange();});
$('#local-fallback').addEventListener('click',()=>{$('#planning-mode').value='rules';updateModeStatus();submitChange(true);});
function updateModeStatus(){
 const mode=$('#planning-mode').value;
 $('#mode-status').textContent=mode==='mock'?'模拟测试：固定返回“下雨、体力 2”，忽略输入内容，不调用模型服务。':mode==='ai'?(aiConfigured?`由后端调用 ${providerName} 理解需求，规则引擎计算行程；旅行数据仍为模拟。`:'AI 尚未配置密钥/模型，或后端未连接。可手动切换关键词规则。'):'使用原有关键词规则，在浏览器内完成，不调用 AI。';
}
$('#planning-mode').addEventListener('change',updateModeStatus);
if(location.protocol!=='file:')fetch('/api/health',{signal:AbortSignal.timeout(3000)}).then(r=>r.ok?r.json():Promise.reject()).then(data=>{aiConfigured=Boolean(data.aiConfigured);providerName=data.provider==='deepseek'?'DeepSeek':'OpenAI';$('#planning-mode option[value=ai]').textContent=`AI · ${providerName}`;updateModeStatus();}).catch(updateModeStatus);
else{$('#planning-mode').value='rules';updateModeStatus();}

function showHistory(){$('#history-list').innerHTML=history.length?history.map(x=>`<article class="history-item"><div><h3>${esc(x.prefs.city)}的一天</h3><p>${esc(x.prefs.date)} · ${x.items.length} 站 · V${x.version}</p><p>${esc(x.prefs.hotel)} · 体力 ${x.prefs.energy} / 5</p></div><button class="button" data-restore="${esc(x.id)}">打开计划 ↗</button></article>`).join(''):'<p class="empty-state">还没有保存的计划。<br>生成你的一天后，会自动保存在这里。</p>';$('#history-dialog').showModal();}
$('#history-button').addEventListener('click',showHistory);
$('#history-list').addEventListener('click',e=>{if(busy)return;const b=e.target.closest('[data-restore]');if(!b)return;const restored=history.find(x=>x.id===b.dataset.restore);if(!restored)return;plan=JSON.parse(JSON.stringify(restored));isSample=false;syncForm();render();$('#history-dialog').close();toast('已打开保存的计划。');});
$('#today-nav').addEventListener('click',()=>$('.workspace').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth'}));
for(const b of document.querySelectorAll('[data-close]'))b.addEventListener('click',()=>document.getElementById(b.dataset.close).close());
for(const d of document.querySelectorAll('dialog'))d.addEventListener('click',e=>{if(e.target===d){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close();}});
syncForm();render();if(storageMessage)toast(storageMessage);
// Optional progressive enhancement. Unsupported browsers remain fully functional.
if(document.modelContext?.registerTool){
 const lifecycle=new AbortController();const register=tool=>{try{Promise.resolve(document.modelContext.registerTool(tool,{signal:lifecycle.signal})).catch(()=>{});}catch{}};
 register({name:'read_travel_plan',title:'查看当前旅行计划',description:'Read current local demo plan, simulated estimates and latest changes.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:true},execute:()=>({plan,simulated:true,sample:isSample})});
 register({name:'replan_travel_day',title:'调整当天行程',description:'Apply a supported reported event to the current demo plan and save locally. Durations, costs and places are simulated.',inputSchema:{type:'object',properties:{text:{type:'string',minLength:1,maxLength:300}},required:['text'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:true},execute:async input=>{if(busy)throw Error('正在调整，请稍后再试。');if(!input||typeof input.text!=='string'||!input.text.trim()||input.text.length>300||Object.keys(input).some(x=>x!=='text'))throw Error('请提供 1–300 字的变化描述。');return applyReplan({text:input.text,now:baselineTime()});}});
 window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});
}
