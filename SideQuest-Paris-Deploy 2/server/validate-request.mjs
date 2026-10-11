import { generatePlan, validatePreferences } from '../dist/planner.mjs';
import { AppError } from './errors.mjs';
const fail=()=>{throw new AppError('INVALID_REQUEST','输入或行程数据不合法，请重新生成计划后再试。');};
const obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const str=(x,max)=>typeof x==='string'&&x.length<=max&&!/[\u0000-\u001f]/.test(x);
const num=(x,min,max)=>Number.isFinite(x)&&x>=min&&x<=max;
const int=(x,min,max)=>Number.isInteger(x)&&num(x,min,max);
export function validatePlan(plan){
  if(!obj(plan)||!obj(plan.prefs)||!obj(plan.conditions))fail();
  const p=plan.prefs;
  for(const [k,max] of [['city',40],['hotel',60],['must',180],['date',10],['wake',5],['mood',20]])if(!str(p[k],max))fail();
  if(!Array.isArray(p.interests)||p.interests.length>6||p.interests.some(x=>!str(x,20)))fail();
  if(!num(p.budget,50,50000)||!int(p.energy,1,5))fail();
  try{validatePreferences(p);}catch{fail();}
  if(new Date(p.date).toISOString().slice(0,10)!==p.date)fail();
  if(!str(plan.id,100)||!str(plan.createdAt,40)||!str(plan.updatedAt,40)||!int(plan.version,1,100000)||!int(plan.start,0,2160)||!num(plan.allowance,0,60)||typeof plan.knownCity!=='boolean')fail();
  if(typeof plan.conditions.rain!=='boolean'||!int(plan.conditions.energy,1,5))fail();
  for(const key of ['items','deferred'])if(!Array.isArray(plan[key])||plan[key].length>60)fail();
  if(!Array.isArray(plan.generationNotes)||plan.generationNotes.length>100||plan.generationNotes.some(x=>!str(x,1000)))fail();
  const ids=new Set();let pendingSeen=false,previousEnd=0;
  for(const item of [...plan.items,...plan.deferred]){
    if(!obj(item))fail();
    for(const [k,max] of [['id',240],['title',240],['area',100],['category',30],['description',1000]])if(!str(item[k],max)||!item[k].trim())fail();
    if(ids.has(item.id))fail();ids.add(item.id);
    if(typeof item.must!=='boolean'||![true,false,null].includes(item.indoor)||!int(item.duration,1,1000)||!num(item.cost,0,50000)||!int(item.zone,0,20))fail();
    if(item.unknown!==undefined&&typeof item.unknown!=='boolean')fail();
    if(item.aliases!==undefined&&(!Array.isArray(item.aliases)||item.aliases.length>10||item.aliases.some(x=>!str(x,240))))fail();
    if(item.reason!==undefined&&!str(item.reason,1000))fail();
  }
  for(const item of plan.items){
    if(typeof item.completed!=='boolean'||!int(item.start,0,1260)||!int(item.end,0,1260)||item.end-item.start!==item.duration||!int(item.transfer,0,120)||item.start<previousEnd)fail();
    if(item.completed&&pendingSeen)fail();if(!item.completed)pendingSeen=true;previousEnd=item.end;
  }
  const required=generatePlan(p);
  for(const item of [...required.items,...required.deferred].filter(x=>x.must))if(![...plan.items,...plan.deferred].some(x=>x.id===item.id&&x.must&&x.title===item.title))fail();
  // Whitelist what the engine needs. Never accept client-provided previous chains,
  // AI analysis, explanations, or extra fields as authority for a new execution.
  const cleanItem=x=>Object.fromEntries(['id','title','area','category','description','must','indoor','duration','cost','zone','unknown','aliases','reason','start','end','transfer','completed'].filter(k=>x[k]!==undefined).map(k=>[k,structuredClone(x[k])]));
  return {id:plan.id,prefs:{city:p.city,date:p.date,hotel:p.hotel,budget:p.budget,must:p.must,interests:[...p.interests],wake:p.wake,energy:p.energy,mood:p.mood},version:plan.version,createdAt:plan.createdAt,updatedAt:plan.updatedAt,knownCity:plan.knownCity,items:plan.items.map(cleanItem),deferred:plan.deferred.map(cleanItem),allowance:plan.allowance,start:plan.start,conditions:{rain:plan.conditions.rain,energy:plan.conditions.energy},generationNotes:[...plan.generationNotes],changes:[],lastEvent:null,previous:null};
}
export function validateRequest(body){
  if(!obj(body)||Object.keys(body).some(k=>!['plan','text','now','targetId','mode'].includes(k)))fail();
  if(body.mode!==undefined&&!['ai','mock'].includes(body.mode))fail();
  if(!str(body.text,300)||!body.text.trim())fail();
  if(typeof body.now!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(body.now))fail();
  if(body.targetId!==undefined&&body.targetId!==null&&!str(body.targetId,240))fail();
  const plan=validatePlan(body.plan);
  if(body.targetId&&!plan.items.some(x=>x.id===body.targetId&&!x.completed))fail();
  return {mode:body.mode||'ai',plan,text:body.text.trim(),now:body.now,targetId:body.targetId||null};
}
export function assertInvariants(before,after){
  for(const item of before.items.filter(x=>x.completed))if(JSON.stringify(after.items.find(x=>x.id===item.id))!==JSON.stringify(item))throw new AppError('CONSTRAINT_FAILED','已完成活动保护检查未通过，未应用调整。',422);
  for(const item of [...before.items,...before.deferred].filter(x=>x.must))if(![...after.items,...after.deferred].some(x=>x.id===item.id&&x.must))throw new AppError('CONSTRAINT_FAILED','必去地点保护检查未通过，未应用调整。',422);
  const {energy:a,...originalPrefs}=before.prefs,{energy:b,...newPrefs}=after.prefs;
  if(JSON.stringify(originalPrefs)!==JSON.stringify(newPrefs))throw new AppError('CONSTRAINT_FAILED','旅行偏好被意外改动，未应用调整。',422);
  validatePlan(after);
}
