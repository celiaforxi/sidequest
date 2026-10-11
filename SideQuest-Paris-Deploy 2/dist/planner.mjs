import { validateIntent } from './intent.mjs';
import { catalogFor, cityKey, INTERESTS, MOODS } from './data.mjs';
export const toMinutes = value => { const [h,m]=value.split(':').map(Number); return h*60+m; };
export const clock = value => `${String(Math.floor(value/60)).padStart(2,'0')}:${String(value%60).padStart(2,'0')}`;
const clone = value => JSON.parse(JSON.stringify(value));
const normalize = text => text.toLowerCase().replace(/[\s·（）()]/g,'');
export function validatePreferences(input) {
  if(!input || typeof input!=='object') throw new Error('请先填写旅行偏好。');
  const p={...input,city:cityKey(String(input.city||'').slice(0,40)),hotel:String(input.hotel||'').trim().slice(0,60),budget:Number(input.budget),energy:Number(input.energy),must:String(input.must||'').slice(0,180)};
  if(!p.city || !p.hotel) throw new Error('请填写目的地和住宿区域。');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(p.date)||Number.isNaN(Date.parse(p.date))) throw new Error('请选择有效的旅行日期。');
  if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(p.wake)) throw new Error('请选择有效的起床时间。');
  if(!Number.isFinite(p.budget)||p.budget<50||p.budget>50000) throw new Error('预算请填写 50–50,000 元。');
  if(!Number.isInteger(p.energy)||p.energy<1||p.energy>5) throw new Error('体力需为 1–5。');
  p.interests=Array.isArray(p.interests)?p.interests.filter(x=>INTERESTS.includes(x)):[];
  p.mood=MOODS.includes(p.mood)?p.mood:MOODS[0];
  return p;
}
const baseTransfer=(a,b,energy)=>!a?15:(a.zone===b.zone?(energy<=2?15:10):(energy<=2?30:25));
function schedule(items,start,energy,completed=[]) {
  let time=start;let previous=completed.at(-1);
  return items.map(item=>{const transfer=baseTransfer(previous,item,energy);const s={...item,transfer,start:time+transfer,end:time+transfer+item.duration,completed:false};time=s.end;previous=item;return s;});
}
function totalCost(items){return items.reduce((s,p)=>s+p.cost,0);}
const effectiveEnergy=p=>p.mood==='慢慢放空'?Math.min(2,p.energy):p.energy;
const countFor=(p,e)=>Math.min(8,Math.max(3,2+e+(p.mood==='多点探索'?1:0)));
function fitPlan(items, start, prefs, completed=[]) {
  const maxCount=countFor(prefs,effectiveEnergy(prefs));
  let keep=[...items], deferred=[], removed=[];
  // There are no asserted business opening hours. 21:00 is our demo day-end policy.
  const trim=(p,reason)=>{keep=keep.filter(x=>x.id!==p.id);(p.must?deferred:removed).push({...p,reason});};
  while(keep.length>maxCount){const candidate=[...keep].reverse().find(x=>!x.must&&x.category!=='美食'&&x.category!=='休息')||[...keep].reverse().find(x=>x.category!=='美食'&&x.category!=='休息');if(!candidate)break;trim(candidate,'当前体力下减少停靠点，留出休息空间。');}
  let timed=schedule(keep,start,prefs.energy,completed);
  while(timed.length&&timed.at(-1).end>21*60){const candidate=[...keep].reverse().find(x=>!x.must&&x.category!=='美食')||keep.at(-1);trim(candidate,'今天 21:00 前放不下完整停留时间，避免压缩体验。');timed=schedule(keep,start,prefs.energy,completed);}
  // A reserved transit allowance is a demo assumption; shopping is always excluded.
  const allowance=keep.length?Math.min(60,Math.round(prefs.budget*.12)):0;
  while(totalCost([...completed,...keep])+allowance>prefs.budget){const candidate=[...keep].reverse().find(x=>!x.must&&x.cost>0&&x.category!=='美食'&&x.category!=='休息');if(!candidate)break;trim(candidate,'为必要餐饮和交通留出预算，移除可选付费活动。');}
  return {items:schedule(keep,start,prefs.energy,completed),deferred,removed,allowance};
}
function unknownPlace(name,index,prefs){return {id:`user-${index}-${name}`,title:name,area:'位置待核实',category:'自选地点',indoor:null,duration:60,cost:0,zone:0,must:true,unknown:true,description:'你添加的必去地点。位置、费用和开放时间待核实；暂预留 60 分钟。'};}
export function generatePlan(input) {
  const prefs=validatePreferences(input),catalog=catalogFor(prefs.city,prefs.hotel);
  let required=[...new Set(prefs.must.split(/[,，、;；\n]/).map(x=>x.trim()).filter(Boolean))];
  const must=required.map((name,index)=>{const p=catalog.places.find(p=>[p.title,...p.aliases].some(a=>normalize(a)===normalize(name)));return p?{...p,must:true}:unknownPlace(name,index,prefs);});
  const used=new Set(must.map(p=>p.id));
  let optional=catalog.places.filter(p=>!used.has(p.id)&&!p.id.endsWith('dinner'));
  const score=p=>(prefs.interests.includes(p.category)?3:0)+(prefs.mood==='慢慢放空'&&p.indoor?2:0)+(p.area===prefs.hotel?2:0);
  optional.sort((a,b)=>score(b)-score(a));
  const food=catalog.places.find(p=>p.id.endsWith('lunch'));
  const coffee=catalog.places[0];
  let selected=[...must];
  for(const p of [coffee,food,...optional])if(p&&!selected.some(x=>x.id===p.id)&&selected.length<countFor(prefs,effectiveEnergy(prefs)))selected.push({...p,must:false});
  // Rank nearby sample zones; no coordinates or routing APIs are implied.
  const homeZone=catalog.areas.indexOf(prefs.hotel);
  selected.sort((a,b)=>Math.abs(a.zone-Math.max(0,homeZone))-Math.abs(b.zone-Math.max(0,homeZone)));
  selected=selected.filter(p=>p.id!==coffee.id);selected.unshift({...coffee,must:must.some(x=>x.id===coffee.id)});
  // Put lunch around the middle, after the first activity.
  const lunch=selected.find(x=>x.id===food?.id);if(lunch){selected=selected.filter(x=>x.id!==lunch.id);selected.splice(Math.min(2,selected.length),0,lunch);}
  const start=toMinutes(prefs.wake)+30;
  const fit=fitPlan(selected,start,prefs);
  return {
    id:globalThis.crypto?.randomUUID?.()||`plan-${Date.now()}`,prefs,version:1,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),knownCity:catalog.known,
    items:fit.items,deferred:fit.deferred,allowance:fit.allowance,start,conditions:{rain:false,energy:prefs.energy},changes:[],lastEvent:null,previous:null,
    generationNotes:[`从 ${prefs.hotel} 出发，按示例区域组织路线；交通时间仅为估算。`,`优先安排 ${must.length} 个必去地点，按「${prefs.mood}」和兴趣选择其他活动。`,...fit.removed.map(p=>`${p.title}：${p.reason}`)],
  };
}
export function parseEvent(raw) {
  if(typeof raw!=='string'||!raw.trim()) throw new Error('写一句现在的情况吧。');
  const text=raw.trim().slice(0,300);
  const rainOff=/(不下雨|没有下雨|雨停|放晴|不再下雨|stopped raining)/i.test(text);
  const rain=!rainOff&&/(下雨|暴雨|雨天|raining|rainy)/i.test(text);
  const late=/(睡过头|晚起|迟到|起晚|晚了|overslept|late)/i.test(text);
  const tired=!/(不累|不疲|精力充沛)/.test(text)&&/(很累|累了|累死|累|疲|走不动|腿|tired|exhaust)/i.test(text);
  const energetic=/(恢复体力|精力充沛|精神了|不累了|recharged)/i.test(text);
  const queue=/(排队|queue|waiting)/i.test(text);
  const food=/(想吃|吃点|吃个|吃烤肉|吃寿司|饿了|hungry|want.*eat)/i.test(text);
  const shop=/(想逛|逛街|购物|想去|shopping|want.*visit)/i.test(text);
  const number=text.match(/(\d+(?:\.\d+)?|半|一|两|二|三|四|五)\s*(小时|分钟|hours?|minutes?|h\b|min\b)/i);
  const n=number?({'半':.5,'一':1,'两':2,'二':2,'三':3,'四':4,'五':5}[number[1]]??Number(number[1])):null;
  const duration=number?Math.round(n*(/小时|hour|^h$/i.test(number[2])?60:1)):null;
  // Bind numbers to their intent in compound requests, not to the first number globally.
  const segmentDuration=(pattern,fallback)=>{const match=text.match(pattern);if(!match)return fallback;const raw=match[1],num=({'半':.5,'一':1,'两':2,'二':2,'三':3,'四':4,'五':5}[raw]??Number(raw));return Math.round(num*(/小时|hour|^h$/i.test(match[2])?60:1));};
  if(![rain,rainOff,late,tired,energetic,queue,food,shop].some(Boolean))throw new Error('这句话暂时没有匹配到规则。试试“下雨了”“睡过头两小时”或“想吃烤肉”。');
  if(late&&queue&&(!/睡过头|晚起|迟到|起晚|晚了/i.test(text)))throw new Error('请分别说明迟到和排队的时长。');
  return {text,rain,rainOff,late,tired,energetic,queue,food,shop,
    delay:late?Math.min(720,segmentDuration(/(?:睡过头|晚起|迟到|起晚|晚了|overslept|late)[^\d半一两二三四五]{0,8}(\d+(?:\.\d+)?|半|一|两|二|三|四|五)\s*(小时|分钟|hours?|minutes?|h\b|min\b)/i,late&&!queue?(duration??120):120)):0,
    queueMinutes:queue?Math.min(720,segmentDuration(/(?:排队|queue|waiting)[^\d半一两二三四五]{0,8}(\d+(?:\.\d+)?|半|一|两|二|三|四|五)\s*(小时|分钟|hours?|minutes?|h\b|min\b)/i,queue&&!late?(duration??90):90)):0,
    defaults:[late&&duration===null?'迟到未写时长，按 2 小时演示。':null,queue&&duration===null?'排队未写时长，按 90 分钟演示。':null].filter(Boolean)
  };
}
function insertion(plan,kind,text,preferredName){
  const food=kind==='food';
  const name=preferredName||(food?(text.match(/(?:想吃|吃点|吃个)\s*([^，。！!？?\n]{1,18})/)?.[1]||'当地美食'):(text.match(/(?:想去|想逛)\s*([^，。！!？?\n]{1,18})/)?.[1]||'室内商店'));
  const last=plan.items.find(x=>!x.completed);
  return {id:`${kind}-${plan.version+1}`,title:food?`${name}时间（待选店）`:`${name}（待核实）`,category:food?'美食':'购物',area:last?.area||plan.prefs.hotel,indoor:food?true:null,unknown:true,zone:last?.zone||0,duration:food?60:60,cost:food?Math.min(100,Math.round(plan.prefs.budget*.2)):0,must:false,description:'根据你的临时想法预留时间；地点、营业和交通待核实。'};
}
export function replan(original,{text='',energy,now,targetId}={}) {
  if(!original?.items)throw new Error('请先生成一个计划。');
  if(now!==undefined&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(now))throw new Error('请选择有效的调整时间。');
  if(energy!==undefined&&(!Number.isInteger(energy)||energy<1||energy>5))throw new Error('体力需为 1–5。');
  const event=energy!==undefined?{text:`体力切换为 ${energy} / 5`,defaults:[]}:parseEvent(text);
  return replanCore(original,{event,energy,now,targetId});
}
export function replanWithIntent(original,intent,{text='',now}={}) {
  const i=validateIntent(intent,original);
  if(i.needsClarification)throw Error(i.clarificationQuestion);
  if(now!==undefined&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(now))throw Error('请选择有效的调整时间。');
  const event={text,defaults:[],delay:i.delayMinutes,late:i.delayMinutes>0,rain:i.weatherChange==='rain',rainOff:i.weatherChange==='clear',queue:i.queueMinutes!==null,queueMinutes:i.queueMinutes||0,food:i.foodRequest!==null,shop:i.visitRequest!==null,foodName:i.foodRequest,visitName:i.visitRequest};
  return replanCore(original,{event,energy:i.energy??undefined,now,targetId:i.targetPlaceId??undefined});
}
function replanCore(original,{event,energy,now,targetId}) {
  const plan=clone(original);delete plan.previous;
  plan.previous=clone({...original,previous:null});
  plan.version++;plan.updatedAt=new Date().toISOString();
  plan.prefs.energy=energy??(event.tired?2:event.energetic?4:plan.prefs.energy);
  plan.conditions={...plan.conditions,energy:plan.prefs.energy,rain:event.rainOff?false:event.rain?true:plan.conditions.rain};
  const completed=plan.items.filter(p=>p.completed), pending=plan.items.filter(p=>!p.completed);
  const latestComplete=completed.reduce((s,p)=>Math.max(s,p.end),0);
  // now is the baseline before the newly reported delay; no past visits are silently marked done.
  let start=Math.max(now?toMinutes(now):plan.start,latestComplete,plan.start)+(event.delay||0);
  let working=pending.map(p=>({...p})),removed=new Map(),deferred=[...plan.deferred],reasons=new Map();
  const remove=(p,reason,forceDefer=false)=>{working=working.filter(x=>x.id!==p.id);removed.set(p.id,{type:p.must||forceDefer?'移动':'删除',reason});if(p.must||forceDefer){deferred=deferred.filter(x=>x.id!==p.id);deferred.push({...p,reason});}};
  if(plan.conditions.rain)for(const p of [...working])if(p.indoor===false)remove(p,'持续下雨，户外活动暂时移出当天；未自动预订其他日期。');
  const target=targetId?working.find(x=>x.id===targetId):(working.find(x=>x.category!=='咖啡'&&x.category!=='美食')||working[0]);
  if(event.queue&&target){if(event.queueMinutes>=45)remove(target,`你报告排队 ${event.queueMinutes} 分钟；优先把时间留给其他体验。`);else{target.duration+=event.queueMinutes;reasons.set(target.id,`计入你报告的 ${event.queueMinutes} 分钟排队时间。`);}}
  if(plan.prefs.energy<=2){
    const candidate=working.find(x=>!x.must&&x.indoor===false);if(candidate)remove(candidate,'低体力模式减少户外步行和停靠点。');
    const hasRest=working.some(x=>x.category==='休息');
    if(!hasRest)working.splice(Math.min(1,working.length),0,{id:`rest-${plan.version}`,title:plan.prefs.energy===1?'回住宿休息':'坐下来，歇一会儿',area:plan.prefs.hotel,zone:0,category:'休息',indoor:true,duration:45,cost:0,must:false,description:'预留 45 分钟休息，具体休息地点待选择。'});
  }
  const catalog=catalogFor(plan.prefs.city,plan.prefs.hotel);
  if(plan.conditions.rain&&removed.size){
    const alternative=catalog.places.find(p=>p.indoor&&p.category!=='美食'&&p.category!=='咖啡'&&!completed.some(x=>x.id===p.id)&&!working.some(x=>x.id===p.id)&&!deferred.some(x=>x.id===p.id)&&!removed.has(p.id));
    if(alternative&&plan.prefs.energy>1)working.splice(Math.min(2,working.length),0,{...alternative,must:false});
  }
  if(event.food){const p=insertion(plan,'food',event.text,event.foodName);const meal=working.find(x=>x.category==='美食'&&!x.must);if(meal)remove(meal,'用你现在想吃的食物替换原来的用餐占位。');working.splice(Math.min(1,working.length),0,p);}
  if(event.shop){const p=insertion(plan,'shop',event.text,event.visitName);working.splice(Math.min(2,working.length),0,p);}
  // Rain stopping or energy recovery can reconsider prior deferred must-see places.
  if(event.rainOff||(energy!==undefined&&energy>original.prefs.energy)||event.energetic){for(const p of [...deferred])if((!plan.conditions.rain||p.indoor!==false)&&!completed.some(x=>x.id===p.id)&&!working.some(x=>x.id===p.id)){working.push({...p});deferred=deferred.filter(x=>x.id!==p.id);reasons.set(p.id,'条件改善，重新尝试安排此前待另日的必去地点。');}}
  const fit=fitPlan(working,start,plan.prefs,completed);
  for(const p of [...fit.removed,...fit.deferred])removed.set(p.id,{type:p.must?'移动':'删除',reason:p.reason});
  for(const p of fit.deferred){deferred=deferred.filter(x=>x.id!==p.id);deferred.push(p);}
  plan.items=[...completed,...fit.items];plan.deferred=deferred;plan.start=start;plan.allowance=fit.allowance;
  const changes=[];
  for(const old of original.items){
    const next=plan.items.find(x=>x.id===old.id);
    if(!next){changes.push({id:old.id,title:old.title,...(removed.get(old.id)||{type:'删除',reason:'为当前安排腾出时间。'}),before:clock(old.start),after:plan.deferred.some(x=>x.id===old.id)?'待另日安排':null});continue;}
    const moved=next.start!==old.start;
    changes.push({id:old.id,title:old.title,type:moved?'移动':'保留',before:clock(old.start),after:clock(next.start),reason:old.completed?'已到访，保持原记录。':reasons.get(old.id)||(moved?'根据新的出发时间、活动和交通缓冲顺延。':old.must?'符合当前条件，优先保留必去地点。':'符合当前体力、天气和时间安排。')});
  }
  for(const p of plan.items)if(!original.items.some(x=>x.id===p.id))changes.push({id:p.id,title:p.title,type:'新增',before:null,after:clock(p.start),reason:reasons.get(p.id)||(p.category==='休息'?'低体力模式增加休息，减少连续活动。':p.id.startsWith('food-')||p.id.startsWith('shop-')?'为你的临时想法预留一段时间；具体地点待核实。':'用室内活动替代雨天户外体验。')});
  plan.changes=changes;plan.lastEvent=event;return plan;
}
export function summary(plan){const items=plan.items;const estimated=totalCost(items)+plan.allowance;return {count:items.length,cost:estimated,overBudget:estimated>plan.prefs.budget,unknownCost:items.some(x=>x.unknown),hours:items.length?((items.at(-1).end-Math.min(plan.start,items[0].start-(items[0].transfer||0)))/60).toFixed(1):'0',end:items.length?clock(items.at(-1).end):'—'};}
