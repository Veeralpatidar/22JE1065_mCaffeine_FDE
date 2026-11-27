const home = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>PEP Order Desk</title>
<style>*{box-sizing:border-box}body{margin:0;background:#f5f7fa;color:#142638;font:18px/1.55 system-ui}header{background:#15374a;color:white;padding:18px 6vw;font-weight:650}main{margin:12vh auto;max-width:740px;padding:32px}h1{font-size:clamp(36px,6vw,62px);line-height:1.08;letter-spacing:-.045em;margin:0}p{max-width:48ch;color:#405466}a{display:inline-block;padding:.65rem 1.1rem;background:#155861;color:white;border-radius:5px;text-decoration:none}a:focus-visible{outline:3px solid #aa6600;outline-offset:3px}</style><header>PEP Brands · Enterprise Engineering</header><main><h1>PEP Order Desk</h1><p>Purchase order review and approval. This first release lets you check whether the app can reach its database.</p><a href="/health">Check database connection</a></main></html>`;

export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    if (request.method !== 'GET') return new Response('Method unavailable.', {status:405, headers:{Allow:'GET'}});
    if (path === '/') return new Response(home,{headers:{'Content-Type':'text/html; charset=utf-8'}});
    if (path !== '/health') return new Response('Page not found.',{status:404});
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
};
