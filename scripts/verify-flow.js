import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

export async function verifyFlow(send,base,passwords,pdf){
  const request=(path,options={})=>send(new Request(base+path,options));
  async function signIn(username){
    const response=await request('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username,password:passwords[username]})});
    assert.equal(response.status,200,'login '+username);
    const cookie=response.headers.get('set-cookie').split(';')[0];
    return async (path,method='GET',data)=>{
      const headers={Cookie:cookie};let body;
      if(data instanceof FormData)body=data;
      else if(data){headers['Content-Type']='application/json';body=JSON.stringify(data);}
      return request('/api/'+path,{method,headers,body});
    };
  }
  const creator=await signIn('creator1'),other=await signIn('creator2'),finance=await signIn('approver1'),lead=await signIn('lead1');
  const number='M2-'+crypto.randomUUID().slice(0,8).toUpperCase();
  const draft={number,date:'2026-11-27',vendor:'Demo packaging vendor',total:12000,items:[{sku:'PK-01',description:'Cartons',qty:2,price:6000,amount:12000}]};
  async function create(as,n){
    const f=new FormData();f.set('order',JSON.stringify({...draft,number:n}));f.set('pdf',new Blob([pdf],{type:'application/pdf'}),'original.pdf');
    return as('orders','POST',f);
  }
  const created=await create(creator,number);
  assert.equal(created.status,201,'create');const {id}=await created.json();const path='orders/'+id;
  const load=async(as=creator)=>{const r=await as(path);assert.equal(r.status,200);return r.json();};
  let p=await load(); assert.equal(p.status,'DRAFT');
  assert.equal((await request('/api/'+path)).status,401);
  assert.equal((await other(path)).status,404);assert.equal((await other(path+'/pdf')).status,404);
  assert.equal((await create(other,number)).status,409);
  const act=(as,verb,remark='')=>as(path+'/'+verb,'POST',{revision:p.revision,remark});
  assert.equal((await act(creator,'submit')).status,200);p=await load();
  assert.equal((await creator(path,'PUT',{...draft,revision:p.revision})).status,409);
  assert.equal((await act(creator,'approve')).status,403);
  assert.equal((await act(finance,'reject','   ')).status,400);
  assert.equal((await load()).history.length,1);
  assert.ok((await (await finance('orders')).json()).queue.some(x=>x.id===id));
  assert.equal((await act(finance,'reject','Correct the vendor name')).status,200);
  p=await load();assert.equal(p.status,'REJECTED');
  assert.equal((await creator(path,'PUT',{...draft,vendor:'Demo cartons supplier',revision:p.revision})).status,200);
  p=await load();assert.equal(p.vendor,'Demo cartons supplier');
  assert.equal((await act(creator,'submit')).status,200);p=await load();
  assert.equal((await act(finance,'approve')).status,200);p=await load();
  assert.equal((await act(finance,'approve')).status,409);assert.equal((await creator(path,'PUT',{...draft,revision:p.revision})).status,409);
  const final=await load();assert.equal(final.id,id);assert.equal(final.status,'APPROVED');
  assert.deepEqual(final.history.map(h=>h.action),['SUBMIT','REJECT','RESUBMIT','APPROVE']);
  assert.deepEqual(final.history.map(h=>h.actor),['creator1','approver1','creator1','approver1']);
  assert.equal(final.history[1].remark,'Correct the vendor name');assert.ok(final.history.every(h=>h.time));
  const original=await creator(path+'/pdf');assert.equal(original.status,200);
  const hash=b=>createHash('sha256').update(b).digest('hex');
  assert.equal(hash(Buffer.from(await original.arrayBuffer())),hash(pdf));
  const second=await create(lead,number+'-LEAD');assert.equal(second.status,201);const leadPath='orders/'+(await second.json()).id;
  assert.equal((await lead(leadPath+'/submit','POST',{revision:1})).status,200);
  for(const verb of ['approve','reject'])assert.equal((await lead(leadPath+'/'+verb,'POST',{revision:2,remark:'self'})).status,403);
  const untouched=await (await lead(leadPath)).json();assert.equal(untouched.status,'SUBMITTED');assert.equal(untouched.history.length,1);
  for(const as of [creator,other,finance,lead]){assert.equal((await as('logout','POST',{})).status,200);assert.equal((await as('orders')).status,401);}
  return {number,id,status:final.status,history:final.history.map(h=>h.action),pdfVerified:true,leadOrder:untouched.number};
}
