// Shared contract: public schema, no credentials. Supported JSON Schema subset is
// deliberately small so the same schema drives both Responses and local validation.
const nullableText = maxLength => ({type:['string','null'], minLength:1, maxLength});
export const INTENT_SCHEMA = {
  type:'object', additionalProperties:false,
  properties:{
    delayMinutes:{type:'integer',minimum:0,maximum:720},
    energy:{type:['integer','null'],minimum:1,maximum:5},
    weatherChange:{type:'string',enum:['unchanged','rain','clear']},
    queueMinutes:{type:['integer','null'],minimum:0,maximum:720},
    foodRequest:nullableText(60), visitRequest:nullableText(60),
    targetPlaceId:nullableText(240),
    needsClarification:{type:'boolean'}, clarificationQuestion:nullableText(180)
  },
  required:['delayMinutes','energy','weatherChange','queueMinutes','foodRequest','visitRequest','targetPlaceId','needsClarification','clarificationQuestion']
};
export function emptyIntent(){return {delayMinutes:0,energy:null,weatherChange:'unchanged',queueMinutes:null,foodRequest:null,visitRequest:null,targetPlaceId:null,needsClarification:false,clarificationQuestion:null};}
function check(value,schema){
  const type=value===null?'null':Number.isInteger(value)?'integer':typeof value;
  if(!(Array.isArray(schema.type)?schema.type:[schema.type]).includes(type))return false;
  if(value===null)return true;
  if(schema.enum&&!schema.enum.includes(value))return false;
  if(type==='integer'&&(value<schema.minimum||value>schema.maximum))return false;
  if(type==='string'&&(!value.trim()||value.length<(schema.minLength||0)||value.length>(schema.maxLength||Infinity)||/[\u0000-\u001f]/.test(value)))return false;
  if(type==='object'){
    if(Array.isArray(value))return false;
    if(Object.keys(value).some(k=>!Object.hasOwn(schema.properties,k)))return false;
    if(schema.required.some(k=>!Object.hasOwn(value,k)))return false;
    return Object.entries(value).every(([k,v])=>check(v,schema.properties[k]));
  }
  return true;
}
export function validateIntent(input,plan){
  if(!check(input,INTENT_SCHEMA))throw Error('意图数据格式或数值不合法，未应用调整。');
  if(input.needsClarification!==Boolean(input.clarificationQuestion))throw Error('澄清状态不一致，未应用调整。');
  if(input.targetPlaceId!==null&&!plan.items.some(p=>p.id===input.targetPlaceId&&!p.completed))throw Error('目标地点不在待到访行程中，未应用调整。');
  if(input.queueMinutes!==null&&!input.targetPlaceId&&!input.needsClarification)throw Error('排队需求缺少目标地点，请补充。');
  const actionable=input.delayMinutes>0||input.energy!==null||input.weatherChange!=='unchanged'||input.queueMinutes!==null||input.foodRequest!==null||input.visitRequest!==null;
  if(!actionable&&!input.needsClarification)throw Error('没有识别到可执行的需求，未应用调整。');
  return {...input};
}
export function intentLabels(intent,plan){
  const labels=[];
  if(intent.delayMinutes)labels.push(`迟到 ${intent.delayMinutes} 分钟`);
  if(intent.energy!==null)labels.push(`体力 ${intent.energy}/5`);
  if(intent.weatherChange!=='unchanged')labels.push(intent.weatherChange==='rain'?'下雨':'雨停');
  if(intent.queueMinutes!==null)labels.push(`排队 ${intent.queueMinutes} 分钟${intent.targetPlaceId?' · '+([...plan.items,...(plan.deferred||[])].find(p=>p.id===intent.targetPlaceId)?.title||'指定地点'):''}`);
  if(intent.foodRequest)labels.push(`想吃：${intent.foodRequest}`);
  if(intent.visitRequest)labels.push(`想逛：${intent.visitRequest}`);
  if(intent.needsClarification)labels.push('需要补充信息');
  return labels;
}
