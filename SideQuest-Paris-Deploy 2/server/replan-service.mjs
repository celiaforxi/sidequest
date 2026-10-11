import { validateRequest, assertInvariants } from './validate-request.mjs';
import { validateIntent } from './intent-schema.mjs';
import { extractIntent } from './ai-client.mjs';
import { replanWithIntent, summary } from '../dist/planner.mjs';
import { AppError } from './errors.mjs';
import { mockIntent } from './mock-client.mjs';
import { logRequest } from './telemetry.mjs';
export async function processReplan(body,{ai=extractIntent,record=logRequest}={}){
  const started=performance.now();let source='unknown',status='failed',errorType=null;
  try{
    const request=validateRequest(body);
    const {plan,text,now}=request;
    source=request.mode;
    const extracted=await (source==='mock'?mockIntent:ai)(request);
    let intent;
    try{intent=validateIntent(extracted,plan);}catch{throw new AppError('INVALID_INTENT','AI 识别结果未通过校验，行程未改变。请重试或切换关键词规则。',422);}
    if(intent.needsClarification){status='needs_clarification';return {status:200,body:{status:'needs_clarification',message:intent.clarificationQuestion,intent,source}};}
    const next=replanWithIntent(plan,intent,{text,now});
    assertInvariants(plan,next);
    next.analysis={source,intent};status='applied';
    return {status:200,body:{status:'applied',source,plan:next,intent,summary:summary(next)}};
  }catch(err){
    const safe=err instanceof AppError?err:new AppError('INTERNAL_ERROR','处理失败，行程未改变。请重试或使用关键词规则。',500);
    errorType=safe.code;
    return {status:safe.status,body:{status:'error',error:{code:safe.code,message:safe.message}}};
  }finally{try{await record({source,status,responseMs:Math.round(performance.now()-started),errorType});}catch{/* Logging must not break planning. */}}
}
