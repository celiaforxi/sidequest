import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { processReplan } from './server/replan-service.mjs';
import { aiConfig } from './server/ai-client.mjs';
const root=dirname(fileURLToPath(import.meta.url));
const assets=new Map([
  ['/','index.html'],['/index.html','index.html'],['/styles.css','styles.css'],['/app.mjs','app.mjs'],['/api.mjs','api.mjs'],['/planner.mjs','planner.mjs'],['/intent.mjs','intent.mjs'],['/data.mjs','data.mjs'],['/assets/tokyo.avif','assets/tokyo.avif'],['/assets/paris.svg','assets/paris.svg']
]);
const mime={svg:'image/svg+xml',html:'text/html; charset=utf-8',css:'text/css; charset=utf-8',mjs:'text/javascript; charset=utf-8',avif:'image/avif'};
function json(res,status,body){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(body));}
function readJson(req){
  return new Promise((resolve,reject)=>{
    let size=0,failed=false;const chunks=[];
    req.on('data',chunk=>{
      if(failed)return;
      size+=chunk.length;
      if(size>128*1024){failed=true;chunks.length=0;reject(Object.assign(Error(),{status:413}));return;}
      chunks.push(chunk);
    });
    req.on('end',()=>{if(failed)return;try{resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));}catch{reject(Error());}});
    req.on('error',reject);
  });
}

export function createApp({ai,apiConfigured=Boolean(['openai','deepseek'].includes(aiConfig().provider)&&aiConfig().apiKey&&aiConfig().model),rateLimit=30,publicOrigin=process.env.PUBLIC_ORIGIN||process.env.RENDER_EXTERNAL_URL||'',dailyLimit=Number(process.env.AI_DAILY_LIMIT||100)}={}){
  const publicURL=publicOrigin?new URL(publicOrigin):null;
  if(publicURL&&(publicURL.protocol!=='https:'||publicURL.origin!==publicOrigin))throw Error('PUBLIC_ORIGIN 必须是无路径的 HTTPS 地址');
  if(!Number.isInteger(dailyLimit)||dailyLimit<0)throw Error('AI_DAILY_LIMIT 必须是非负整数');
  let day=new Date().toISOString().slice(0,10),aiRequests=0;
  let active=0,requests=0,windowStart=Date.now();
  const server=createServer(async(req,res)=>{
    res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    const host=req.headers.host;
    if(!host||!(publicURL?host===publicURL.host:/^(127\.0\.0\.1|localhost):\d{1,5}$/.test(host))){json(res,403,{error:{code:'HOST_REJECTED',message:'请求域名不允许。'}});return;}
    if(req.headers.origin&&req.headers.origin!==(publicURL?publicURL.origin:`http://${host}`)){json(res,403,{error:{code:'ORIGIN_REJECTED',message:'请求来源不允许。'}});return;}
    if(req.headers['sec-fetch-site']==='cross-site'){json(res,403,{error:{code:'ORIGIN_REJECTED',message:'请求来源不允许。'}});return;}
    const url=new URL(req.url,`http://${host}`);
    if(req.method==='GET'&&url.pathname==='/api/health'){json(res,200,{aiConfigured:apiConfigured,provider:aiConfig().provider,travelData:'simulated'});return;}
    if(req.method==='POST'&&url.pathname==='/api/replan'){
      if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||'')){json(res,415,{error:{code:'CONTENT_TYPE',message:'请使用 JSON 请求。'}});return;}
      if(Date.now()-windowStart>60000){requests=0;windowStart=Date.now();}
      if(++requests>rateLimit||active>=2){json(res,429,{error:{code:'LOCAL_RATE_LIMIT',message:'请求较多，请稍后重试。'}});return;}
      active++;
      try{
        let body;
        try{body=await readJson(req);}catch(err){
          json(res,err.status||400,{error:{code:err.status===413?'BODY_TOO_LARGE':'INVALID_JSON',message:'请求内容过大或 JSON 格式无效。'}});return;
        }
        const today=new Date().toISOString().slice(0,10);
        if(day!==today){day=today;aiRequests=0;}
        if(body?.mode!=='mock'){
          if(aiRequests>=dailyLimit){json(res,429,{error:{code:'DEMO_DAILY_LIMIT',message:'今天的 AI 演示次数已用完，请使用 Mock 或关键词规则。'}});return;}
          aiRequests++;
        }
        const result=await processReplan(body,{ai});json(res,result.status,result.body);
      }catch{if(!res.headersSent)json(res,500,{error:{code:'INTERNAL_ERROR',message:'服务暂时不可用，行程未改变。'}});}
      finally{active--;}
      return;
    }
    if(req.method==='GET'&&assets.has(url.pathname)){
      const file=assets.get(url.pathname);
      try{const content=await readFile(join(root,'dist',file));res.writeHead(200,{'Content-Type':mime[file.split('.').at(-1)]});res.end(content);}catch{json(res,500,{error:{code:'ASSET_ERROR',message:'页面资源不可用。'}});}return;
    }
    json(res,404,{error:{code:'NOT_FOUND',message:'资源不存在。'}});
  });
  server.requestTimeout=30000;server.headersTimeout=10000;
  return server;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{process.loadEnvFile(join(root,'.env'));}catch(err){if(err.code!=='ENOENT')throw err;}
  const port=Number(process.env.PORT||4174);
  if(!Number.isInteger(port)||port<1024||port>65535)throw Error('PORT 必须是 1024–65535 之间的整数。');
  const server=createApp();
  server.on('error',err=>{console.error(err.code==='EADDRINUSE'?'端口已被占用，请修改 PORT。':'服务启动失败。');process.exitCode=1;});
  server.listen(port,process.env.HOST||'127.0.0.1',()=>console.log(`SideQuest: http://127.0.0.1:${port} | AI ${aiConfig().apiKey&&aiConfig().model?'已配置（尚未验证）':'未配置'} | 关键词规则可用`));
}
