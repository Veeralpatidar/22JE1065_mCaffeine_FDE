export const home = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>PEP Order Desk</title><style>
*{box-sizing:border-box}body{margin:0;background:#f4f6f5;color:#183330;font:16px/1.5 system-ui}header{background:#133d39;color:white;display:flex;justify-content:space-between;align-items:center;padding:14px max(5vw,20px);gap:15px}header strong{font-size:21px}main{max-width:1080px;padding:32px 18px 64px;margin:auto}section,article{background:white;border:1px solid #d4dfdb;border-radius:8px;padding:22px;margin:16px 0}h1,h2,h3{line-height:1.2;margin:0 0 16px}h1{font-size:34px}h2{font-size:22px}h3{font-size:17px}button,.button{background:#166557;color:white;padding:9px 15px;border:0;border-radius:5px;font:inherit;cursor:pointer}button.alt{background:#e4eeeb;color:#174a40}button:disabled{opacity:.55}input,textarea{width:100%;padding:8px;border:1px solid #869c95;border-radius:4px;font:inherit}label{display:block;font-weight:600;margin:9px 0}label input,label textarea{display:block;font-weight:400;margin-top:4px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px}.actions{display:flex;flex-wrap:wrap;align-items:center;gap:12px;margin:14px 0}.line{border-top:1px solid #d4dfdb;padding:10px 0}.login{max-width:420px;margin:7vh auto}.note{color:#526661}.error{color:#932b28;background:#fff1ed;padding:10px}.order{width:100%;display:flex;justify-content:space-between;gap:12px;margin:7px 0;text-align:left;background:#eff5f2;color:#16443b}.pill{font:600 13px system-ui;background:#dcece5;padding:5px 8px;border-radius:4px}.scroll{overflow-x:auto}table{border-collapse:collapse;width:100%}th,td{text-align:left;padding:8px;border-bottom:1px solid #dae2df}a{color:#075b49}button:focus-visible,a:focus-visible{outline:3px solid #c78924}#msg:empty{display:none}#msg{position:sticky;top:0;z-index:1}
</style><header><strong>PEP Order Desk</strong><span id="account"></span></header><main><p id="msg" role="alert"></p><div id="view">Loading orders…</div></main><script type="module" src="/app.js"></script></html>`;

export function browser(){
  const el=id=>document.getElementById(id),view=el('view'),account=el('account');
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const currency=n=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR'}).format(n/100);
  const date=s=>s.split('-').reverse().join('-');
  const alert=(text='')=>{el('msg').className=text?'error':'';el('msg').textContent=text;};
  function handle(fn){return async e=>{e?.preventDefault();alert();try{await fn(e);}catch(err){alert(err.message);}};}
  async function api(path,method='GET',data){
    const opts={method,headers:{}};
    if(data instanceof FormData)opts.body=data;
    else if(data!==undefined){opts.body=JSON.stringify(data);opts.headers['Content-Type']='application/json';}
    const response=await fetch('/api/'+path,opts);
    const result=await response.json();
    if(!response.ok){if(response.status===401)login();throw Error(result.message||'Request failed.');}
    return result;
  }
  function login(){
    account.textContent='';view.innerHTML='<section class="login"><h1>Sign in</h1><form id="login"><label>Username<input name="username" autocomplete="username" required></label><label>Password<input type="password" name="password" autocomplete="current-password" required></label><button>Sign in</button></form></section>';
    el('login').onsubmit=handle(async e=>{await api('login','POST',Object.fromEntries(new FormData(e.target)));await dashboard();});
  }
  function rows(list){return list.map(p=>`<button class="order" data-open="${esc(p.id)}"><span><b>${esc(p.number)}</b> · ${esc(p.vendor)}<br>${esc(p.owner)} · ${currency(p.total)}</span><span class="pill">${esc(p.status)}</span></button>`).join('')||'<p class="note">No orders here yet.</p>';}
  async function dashboard(){
    const {user,owned,queue}=await api('orders');
    account.innerHTML=esc(user.username)+' &nbsp; <button id="out" class="alt">Sign out</button>';
    el('out').onclick=handle(async()=>{await api('logout','POST',{});login();});
    view.innerHTML='<h1>Purchase orders</h1>'+(user.creator?'<section><h2>My orders</h2><button id="new">Create draft</button>'+rows(owned)+'</section>':'')+(user.approver?'<section><h2>Finance queue</h2>'+rows(queue)+'</section>':'');
    if(el('new'))el('new').onclick=()=>form();
    view.querySelectorAll('[data-open]').forEach(b=>b.onclick=handle(()=>open(b.dataset.open)));
  }
  function input(label,name,value='',type='text',attrs=''){return `<label>${label}<input name="${name}" type="${type}" value="${esc(value)}" ${attrs} required></label>`;}
  function line(v={}){
    const div=document.createElement('div');div.className='line';
    div.innerHTML='<div class="grid">'+input('SKU','sku',v.sku)+input('Description','description',v.description)+input('Quantity','qty',v.qty??1,'number','min="1" step="1"')+input('Unit price (₹)','price',v.price==null?'':(v.price/100).toFixed(2),'number','min=".01" step=".01"')+input('Line amount (₹)','amount',v.amount==null?'':(v.amount/100).toFixed(2),'number','min="0" step=".01"')+'</div><button type="button" class="alt">Remove line</button>';
    div.querySelector('button').onclick=()=>div.remove();el('lines').append(div);
  }
  function paise(s){const [whole,fraction='']=s.split('.');if(!/^\d+$/.test(whole)||!/^\d{0,2}$/.test(fraction))throw Error('Enter money with up to two decimal places.');return Number(whole)*100+Number(fraction.padEnd(2,'0'));}
  function form(p){
    view.innerHTML='<button id="back" class="alt">Back</button><section><h1>'+(p?'Edit order':'Create draft')+'</h1><form id="editor"><div class="grid">'+input('PO number','number',p?.number)+input('PO date','date',p?.date,'date')+input('Vendor','vendor',p?.vendor)+input('Printed total (₹)','total',p?(p.total/100).toFixed(2):'','number','min="0" step=".01"')+'</div><h2>Line items</h2><div id="lines"></div><button type="button" class="alt" id="add">Add line item</button>'+(p?'':'<label>Original PDF (up to 5 MB)<input type="file" name="pdf" accept="application/pdf" required></label>')+'<div class="actions"><button>Save '+(p?'changes':'draft')+'</button></div></form></section>';
    el('back').onclick=handle(()=>p?open(p.id):dashboard()); el('add').onclick=()=>line();
    (p?p.items:[{}]).forEach(line);
    el('editor').onsubmit=handle(async e=>{
      const f=e.target, values=new FormData(f),items=[...f.querySelectorAll('.line')].map(row=>{
        const field=n=>row.querySelector('[name='+n+']').value;
        return {sku:field('sku'),description:field('description'),qty:Number(field('qty')),price:paise(field('price')),amount:paise(field('amount'))};
      });
      const data={number:values.get('number'),date:values.get('date'),vendor:values.get('vendor'),total:paise(values.get('total')),items,revision:p?.revision};
      const upload=new FormData();upload.set('order',JSON.stringify(data));if(!p)upload.set('pdf',values.get('pdf'));
      const result=await api(p?'orders/'+p.id:'orders',p?'PUT':'POST',p?data:upload);await open(result.id);
    });
  }
  async function open(id){
    const p=await api('orders/'+id);
    const table=p.items.length?'<div class="scroll"><table><tr><th>SKU</th><th>Description</th><th>Qty</th><th>Unit price</th><th>Line amount</th></tr>'+p.items.map(i=>`<tr><td>${esc(i.sku)}</td><td>${esc(i.description)}</td><td>${i.qty}</td><td>${currency(i.price)}</td><td>${currency(i.amount)}</td></tr>`).join('')+'</table></div>':'<p>Line items not checked</p>';
    view.innerHTML=`<button id="back" class="alt">All orders</button><section><span class="pill">${p.status}</span><h1>${esc(p.number)}</h1><p>${esc(p.vendor)} · ${date(p.date)} · Created by ${esc(p.owner)}</p>${table}<p>Printed total <b>${currency(p.total)}</b></p><a target="_blank" rel="noopener" href="/api/orders/${id}/pdf">Open original PDF</a><div class="actions" id="buttons"></div></section><section><h2>Action history</h2>${p.history.map(h=>`<p><strong>${esc(h.action)}</strong> · ${esc(h.actor)} · ${esc(h.time)} UTC<br>${esc(h.remark)}</p>`).join('')||'<p>No decisions recorded.</p>'}</section>`;
    el('back').onclick=handle(dashboard);
    if(p.canEdit){el('buttons').innerHTML='<button id="edit" class="alt">Edit order</button><button id="submit">'+(p.status==='REJECTED'?'Resubmit':'Submit to Finance')+'</button>';
      el('edit').onclick=()=>form(p);el('submit').onclick=handle(async()=>{await api('orders/'+id+'/submit','POST',{revision:p.revision});await open(id);});}
    if(p.canDecide){el('buttons').innerHTML='<button id="approve">Approve</button><label>Rejection reason<textarea id="reason"></textarea></label><button id="reject" class="alt">Reject</button>';
      for(const verb of ['approve','reject'])el(verb).onclick=handle(async()=>{await api('orders/'+id+'/'+verb,'POST',{revision:p.revision,remark:el('reason').value});await dashboard();});}
  }
  dashboard().catch(e=>{if(!el('login'))alert(e.message);});
}
