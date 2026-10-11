import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { generatePlan, replanWithIntent } from '../dist/planner.mjs';
import { emptyIntent, validateIntent } from '../dist/intent.mjs';
import { validateRequest, assertInvariants } from '../server/validate-request.mjs';
import { processReplan } from '../server/replan-service.mjs';
import { extractIntent } from '../server/ai-client.mjs';
import { createApp } from '../server.mjs';
import { logRequest } from '../server/telemetry.mjs';
const prefs={city:'东京',date:'2026-10-11',hotel:'涩谷',budget:600,must:'明治神宫，涩谷十字路口',interests:['美食','咖啡'],wake:'09:00',energy:4,mood:'随心逛逛'};
const make=()=>generatePlan(prefs);
const body=(extra={})=>({plan:make(),text:'突然下雨了',mode:'mock',now:'09:30',targetId:'meiji',...extra});
const rain=()=>({...emptyIntent(),weatherChange:'rain'});
const response=output=>new Response(JSON.stringify({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(output)}]}]}));

test('structured intent rejects extra, missing, wrongly typed and out-of-range fields',()=>{
 for(const value of [{...rain(),budget:100},{...rain(),energy:6},{...rain(),delayMinutes:'90'},{...rain(),delayMinutes:Infinity},{...rain(),foodRequest:'x'.repeat(61)}, {weatherChange:'rain'}, {...rain(),needsClarification:true}])assert.throws(()=>validateIntent(value,make()));
});
test('unknown and completed model targets are rejected',()=>{const p=make();assert.throws(()=>validateIntent({...rain(),targetPlaceId:'fake'},p));p.items[0].completed=true;assert.throws(()=>validateIntent({...rain(),targetPlaceId:p.items[0].id},p));});
test('queue requires a known target and no-op output cannot execute',()=>{assert.throws(()=>validateIntent({...emptyIntent(),queueMinutes:90},make()));assert.throws(()=>validateIntent(emptyIntent(),make()));});
test('AI structured values directly drive engine even with no matching keywords',()=>{const p=make();const q=replanWithIntent(p,{...emptyIntent(),delayMinutes:90,energy:2},{text:'换一种节奏'});assert.equal(q.start,p.start+90);assert.equal(q.prefs.energy,2);assert.ok(q.items.some(x=>x.category==='休息'));assertInvariants(p,q);});
test('structured food name is used without keyword reconstruction',()=>{const q=replanWithIntent(make(),{...emptyIntent(),foodRequest:'乌冬面'},{text:'anything'});assert.ok(q.items.some(x=>x.title==='乌冬面时间（待选店）'));});
test('mock fixture completes the full pipeline and is explicitly labeled',async()=>{
 const req=body();const before=JSON.stringify(req.plan);const records=[];
 const r=await processReplan(req,{record:async x=>records.push(x)});
 assert.equal(r.status,200);assert.equal(r.body.source,'mock');assert.equal(r.body.plan.prefs.energy,2);assert.equal(r.body.plan.conditions.rain,true);assert.equal(JSON.stringify(req.plan),before);assert.equal(records[0].status,'applied');assert.ok(records[0].responseMs>=0);
});
test('clarification returns no changed plan',async()=>{const r=await processReplan(body({mode:'ai'}),{ai:async()=>({...emptyIntent(),needsClarification:true,clarificationQuestion:'请说明迟到多久？'})});assert.equal(r.body.status,'needs_clarification');assert.equal(r.body.plan,undefined);});
test('AI invalid output does not execute or change the baseline',async()=>{const req=body({mode:'ai'});const before=JSON.stringify(req.plan);const r=await processReplan(req,{ai:async()=>({...rain(),energy:9})});assert.equal(r.status,422);assert.equal(r.body.error.code,'INVALID_INTENT');assert.equal(r.body.plan,undefined);assert.equal(JSON.stringify(req.plan),before);});
test('completed activities, required stops and budget survive structured replanning',async()=>{const req=body({mode:'ai'});req.plan.items[0].completed=true;const done=structuredClone(req.plan.items[0]);const r=await processReplan(req,{ai:async()=>({...rain(),delayMinutes:240,energy:1})});assert.equal(r.status,200);assert.deepEqual(r.body.plan.items[0],done);assert.equal(r.body.plan.prefs.budget,600);for(const id of ['meiji','shibuya'])assert.ok([...r.body.plan.items,...r.body.plan.deferred].some(x=>x.id===id&&x.must));});
test('request validator rejects tampered must flag, duplicate IDs, overlaps, invalid costs and completion order',()=>{
 const mutations=[r=>r.plan.items.find(x=>x.id==='meiji').must=false,r=>r.plan.items[1].id=r.plan.items[0].id,r=>r.plan.items[1].start=1,r=>r.plan.items[0].cost=-10,r=>r.plan.items[1].completed=true,r=>r.plan.prefs.budget=Infinity,r=>r.text='a'.repeat(301),r=>r.plan.items=Array(100).fill(r.plan.items[0]),r=>r.plan.prefs.date='2026-02-31',r=>r.targetId='missing'];
 for(const mutate of mutations){const r=body();mutate(r);assert.throws(()=>validateRequest(r));}
});
test('request validator strips client-controlled previous and AI analysis',()=>{const r=body();r.plan.previous={secret:'test'};r.plan.analysis={source:'ai'};const clean=validateRequest(r).plan;assert.equal(clean.previous,null);assert.equal(clean.analysis,undefined);});
test('postcondition catches removal of must stops and edits to completed history',()=>{const p=make();p.items[0].completed=true;let q=structuredClone(p);q.items[0].title='changed';assert.throws(()=>assertInvariants(p,q));q=structuredClone(p);q.items=q.items.filter(x=>!x.must);assert.throws(()=>assertInvariants(p,q));});
test('Responses request uses strict schema, store=false and minimal context',async()=>{
 let sent;const result=await extractIntent(body(),{provider:'openai',apiKey:'secret-test-key',model:'test-model',fetchImpl:async(url,opts)=>{sent={url,...opts};return response(rain());}});
 assert.equal(result.weatherChange,'rain');const data=JSON.parse(sent.body);assert.equal(data.text.format.strict,true);assert.equal(data.text.format.type,'json_schema');assert.equal(data.store,false);assert.equal(sent.headers.Authorization,'Bearer secret-test-key');assert.ok(!data.input.includes('hotel'));assert.ok(!data.input.includes('budget'));assert.ok(!data.input.includes('secret-test-key'));
});
test('missing configuration never automatically uses mock',async()=>{await assert.rejects(extractIntent(body(),{provider:'openai',apiKey:'',model:'test'}),e=>e.code==='AI_NOT_CONFIGURED');});
test('provider 401/429/500 errors are safe and distinguishable',async()=>{for(const [status,code] of [[401,'AI_AUTH'],[429,'AI_RATE_LIMIT'],[500,'AI_SERVICE']])await assert.rejects(extractIntent(body(),{provider:'openai',apiKey:'secret',model:'test',fetchImpl:async()=>new Response('secret leak',{status})}),e=>e.code===code&&!e.message.includes('secret'));});
test('timeout and network errors are handled without leaking raw exception',async()=>{
 await assert.rejects(extractIntent(body(),{provider:'openai',apiKey:'secret',model:'test',timeoutMs:5,fetchImpl:async(u,{signal})=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(Error('secret'))))}),e=>e.code==='AI_TIMEOUT');
 await assert.rejects(extractIntent(body(),{provider:'openai',apiKey:'secret',model:'test',fetchImpl:async()=>{throw Error('secret');}}),e=>e.code==='AI_NETWORK'&&!e.message.includes('secret'));
});
test('refusal, incomplete and malformed JSON are rejected',async()=>{
 for(const [data,code] of [[{status:'incomplete'},'AI_INCOMPLETE'],[{status:'completed',output:[{type:'message',content:[{type:'refusal'}]}]},'AI_REFUSAL'],[{status:'completed',output:[{type:'message',content:[{type:'output_text',text:'not json'}]}]},'AI_INVALID_OUTPUT']])await assert.rejects(extractIntent(body(),{provider:'openai',apiKey:'secret',model:'test',fetchImpl:async()=>new Response(JSON.stringify(data))}),e=>e.code===code);
});
test('logger allowlist excludes user text, API key and itinerary',()=>{const saved=console.log;let output;try{console.log=x=>output=x;logRequest({source:'ai',status:'failed',responseMs:12,errorType:'AI_AUTH',text:'private',apiKey:'secret',plan:{hotel:'private'}});}finally{console.log=saved;}assert.deepEqual(Object.keys(JSON.parse(output)),['timestamp','source','status','responseMs','errorType']);assert.ok(!output.includes('private'));assert.ok(!output.includes('secret'));});
test('logging failure does not prevent planning',async()=>{const r=await processReplan(body(),{record:async()=>{throw Error('disk');}});assert.equal(r.body.status,'applied');});
test('AI success and failure are logged without sensitive inputs',async()=>{const records=[];const record=async x=>records.push(x);const ok=await processReplan(body({mode:'ai'}),{ai:async()=>rain(),record});assert.equal(ok.body.source,'ai');assert.equal(ok.body.plan.analysis.source,'ai');await processReplan(body({mode:'ai'}),{ai:async()=>{throw Error('secret');},record});assert.equal(records[0].status,'applied');assert.equal(records[1].errorType,'INTERNAL_ERROR');assert.ok(!JSON.stringify(records).includes('secret'));});
test('HTTP end-to-end mock flow, static allowlist, origin and body validation',async()=>{
 const server=createApp({publicOrigin:'',dailyLimit:100,apiConfigured:false,rateLimit:100});server.listen(0,'127.0.0.1');await once(server,'listening');const base=`http://127.0.0.1:${server.address().port}`;
 try{
  assert.equal((await fetch(base)).status,200);
  assert.equal((await fetch(base+'/api.mjs')).status,200);
  for(const path of ['/.env','/server/ai-client.mjs','/logs/requests.jsonl','/package.json'])assert.equal((await fetch(base+path)).status,404);
  assert.equal((await (await fetch(base+'/api/health')).json()).aiConfigured,false);
  const send=(data,headers={})=>fetch(base+'/api/replan',{method:'POST',headers:{'Content-Type':'application/json',...headers},body:data});
  let r=await send(JSON.stringify(body()));assert.equal(r.status,200);assert.equal((await r.json()).source,'mock');
  assert.equal((await send(JSON.stringify(body()),{Origin:'https://example.com'})).status,403);
  assert.equal((await send('broken')).status,400);
  assert.equal((await send('x'.repeat(130*1024))).status,413);
  assert.equal((await send('{}',{'Content-Type':'text/plain'})).status,415);
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
test('HTTP rate limiter bounds model spending',async()=>{const server=createApp({publicOrigin:'',dailyLimit:100,rateLimit:1});server.listen(0,'127.0.0.1');await once(server,'listening');try{const url=`http://127.0.0.1:${server.address().port}/api/replan`;const opts={method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body())};assert.equal((await fetch(url,opts)).status,200);assert.equal((await fetch(url,opts)).status,429);}finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}});

test('DeepSeek uses fixed endpoint, JSON mode and server-only credentials',async()=>{
 let sent;const intent=await extractIntent(body(),{provider:'deepseek',apiKey:'test-private',model:'deepseek-flash',fetchImpl:async(url,opts)=>{sent={url,...opts};return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify(rain())}}]}));}});
 assert.equal(intent.weatherChange,'rain');assert.equal(sent.url,'https://api.deepseek.com/chat/completions');const payload=JSON.parse(sent.body);assert.equal(payload.response_format.type,'json_object');assert.equal(payload.thinking.type,'disabled');assert.ok(payload.messages[0].content.includes('Example JSON'));assert.ok(!sent.body.includes('test-private'));
});
test('DeepSeek handles empty, truncated, malformed and insufficient balance responses',async()=>{
 for(const [data,code] of [[{choices:[{finish_reason:'stop',message:{content:''}}]},'AI_INVALID_OUTPUT'],[{choices:[{finish_reason:'length',message:{content:'{}'}}]},'AI_INCOMPLETE'],[{choices:[{finish_reason:'stop',message:{content:'broken'}}]},'AI_INVALID_OUTPUT']]){
 await assert.rejects(extractIntent(body(),{provider:'deepseek',apiKey:'test',model:'deepseek-flash',fetchImpl:async()=>new Response(JSON.stringify(data))}),e=>e.code===code);
 }
 await assert.rejects(extractIntent(body(),{provider:'deepseek',apiKey:'test',model:'deepseek-flash',fetchImpl:async()=>new Response('private',{status:402})}),e=>e.code==='AI_BALANCE'&&!e.message.includes('private'));
});

test('Paris sample replans rain while preserving Louvre and deferring Seine',()=>{
 const p=generatePlan({...prefs,city:'巴黎',hotel:'圣日耳曼 / 左岸',must:'卢浮宫，塞纳河畔散步'});
 const next=replanWithIntent(p,rain(),{text:'下雨了',now:'09:30'});assertInvariants(p,next);
 assert.ok(next.items.some(x=>x.id==='louvre'&&x.must));assert.ok(next.deferred.some(x=>x.id==='seine'&&x.must));
});
test('public origin allows exact HTTPS site, rejects foreign origin and limits AI attempts',async()=>{
 const http=await import('node:http');let calls=0;
 const server=createApp({publicOrigin:'https://sidequest.example',dailyLimit:1,ai:async()=>{calls++;return rain();}});server.listen(0,'127.0.0.1');await once(server,'listening');
 const send=(origin,mode='ai',host='sidequest.example')=>new Promise((resolve,reject)=>{const req=http.request({hostname:'127.0.0.1',port:server.address().port,path:'/api/replan',method:'POST',headers:{Host:host,Origin:origin,'Content-Type':'application/json'}},res=>{res.resume();res.on('end',()=>resolve(res.statusCode));});req.on('error',reject);req.end(JSON.stringify(body({mode})));});
 try{assert.equal(await send('https://evil.example'),403);assert.equal(await send('https://sidequest.example','ai','evil.example'),403);assert.equal(await send('https://sidequest.example'),200);assert.equal(await send('https://sidequest.example'),429);assert.equal(await send('https://sidequest.example','mock'),200);assert.equal(calls,1);}finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
