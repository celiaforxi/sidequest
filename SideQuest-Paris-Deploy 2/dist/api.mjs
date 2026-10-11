export async function requestReplan(plan,input){
  if(location.protocol==='file:')throw Error('单文件版仅支持关键词规则；AI 请通过 Node.js 服务打开。');
  const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),25000);
  try{
    const snapshot={...plan,previous:null,analysis:undefined,changes:[],lastEvent:null};
    const response=await fetch('/api/replan',{method:'POST',headers:{'Content-Type':'application/json'},signal:controller.signal,body:JSON.stringify({mode:input.mode||'ai',plan:snapshot,text:input.text,now:input.now,targetId:input.targetId||null})});
    let body;try{body=await response.json();}catch{throw Error('后端没有返回有效结果，请启动 Node.js 服务或使用关键词规则。');}
    if(!response.ok)throw Error(body.error?.message||'AI 请求失败，行程未改变。');
    return body;
  }catch(err){if(controller.signal.aborted)throw Error('AI 请求超时，行程未改变。可重试或手动切换关键词规则。');if(err instanceof TypeError)throw Error('无法连接后端，行程未改变。可手动切换关键词规则。');throw err;}
  finally{clearTimeout(timeout);}
}
