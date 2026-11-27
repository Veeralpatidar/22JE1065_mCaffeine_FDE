import {home,browser} from './ui.js';
import {identity,login,logout} from './auth.js';
import {Problem,requireThat,json} from './common.js';
import * as orders from './orders.js';
import {preview} from './pdf-extraction.js';

async function health(env){
    const headers = {'Cache-Control':'no-store'};
    try {
      const result = await env.DB.prepare('SELECT 1 AS reachable').first();
      if (result?.reachable !== 1) throw new Error('Unexpected query result');
      return Response.json({status:'ok', database:'reachable'}, {headers});
    } catch (error) {
      console.error(JSON.stringify({time:new Date().toISOString(),event:'health.database_failed',type:error.name,message:'Database probe failed'}));
      return Response.json({status:'unavailable',message:'Database temporarily unavailable.'}, {status:503, headers});
    }
}
async function route(request,env){
  const {pathname:path,origin}=new URL(request.url),method=request.method;
  if(path==='/health'&&method==='GET') return health(env);
  if(path==='/'&&method==='GET')return new Response(home,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Content-Security-Policy':"default-src 'self'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"}});
  if(path==='/app.js'&&method==='GET')return new Response('('+browser.toString()+')();',{headers:{'Content-Type':'text/javascript','Cache-Control':'no-store'}});
  requireThat(path.startsWith('/api/'),404,'Page not found.');
  if(method!=='GET')requireThat(!request.headers.has('Origin')||request.headers.get('Origin')===origin,403,'Different origin refused.');
  if(path==='/api/login'&&method==='POST')return login(request,env.DB);
  const user=await identity(request,env.DB);
  if(path==='/api/logout'&&method==='POST')return logout(request,env.DB);
  if(path==='/api/orders/extract'&&method==='POST')return preview(request,user);
  if(path==='/api/orders'){
    if(method==='GET')return orders.list(env.DB,user);
    if(method==='POST')return orders.create(request,env,user);
  }
  const match=path.match(/^\/api\/orders\/([a-f0-9-]+)(?:\/(pdf|submit|approve|reject))?$/);
  requireThat(match,404,'Page not found.');
  const [,id,action]=match;
  const po=await env.DB.prepare('SELECT * FROM pos WHERE id=?').bind(id).first();
  requireThat(po,404,'Order unavailable.');
  if(method==='GET'&&!action)return orders.detail(env,po,user);
  if(method==='GET'&&action==='pdf')return orders.pdf(env,po,user);
  if(method==='PUT'&&!action)return orders.edit(request,env.DB,po,user);
  if(method==='POST'&&['submit','approve','reject'].includes(action))return orders.transition(request,env.DB,po,user,action);
  throw new Problem(405,'Method unavailable.');
}
export default {async fetch(request,env){
  try{return await route(request,env);}
  catch(e){
    if(e instanceof Problem)return json({message:e.message},e.status);
    console.error(JSON.stringify({time:new Date().toISOString(),event:'request.failed',type:e.name,message:'Request could not be completed'}));
    return json({message:'Could not complete this request. Please try again.'},500);
  }
}};
