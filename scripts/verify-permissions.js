import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {permissionClient} from './permission-client.js';

export async function verifyPermissions(send,base,passwords,pdf){
  const {request,signIn}=permissionClient(send,base,passwords);
  const names=['creator1','creator2','approver1','lead1'];
  const users={};
  const run='M3-'+crypto.randomUUID().slice(0,8).toUpperCase();
  const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
  const printed=new Set();
  function status(label,response,expected){
    assert.equal(response.status,expected,label);
    if(!printed.has(label)){console.log(label,response.status);printed.add(label);}
    return response;
  }
  async function create(owner,suffix){
    const data={number:run+'-'+suffix,vendor:'Permission test supplier',date:new Date().toISOString().slice(0,10),total:7000,items:[{sku:'M3',description:'Demo carton',qty:2,price:3500,amount:7000}]};
    const form=new FormData();
    form.set('order',JSON.stringify(data));
    form.set('pdf',new Blob([pdf],{type:'application/pdf'}),'demo.pdf');
    const res=status('create draft',await users[owner]('orders','POST',form),201);
    const {id}=await res.json();
    return {owner,id,path:'orders/'+id};
  }
  async function snapshot(order){
    const owner=users[order.owner];
    const [record,original]=await Promise.all([owner(order.path),owner(order.path+'/pdf')]);
    assert.equal(record.status,200);
    assert.equal(original.status,200);
    return {po:await record.json(),pdf:hash(Buffer.from(await original.arrayBuffer()))};
  }
  async function mutate(order,actor,verb,po,remark=''){
    const call=users[actor];
    if(verb==='edit')return call(order.path,'PUT',{...po,vendor:'Updated by '+actor});
    return call(order.path+'/'+verb,'POST',{revision:po.revision,remark});
  }
  async function denied(order,actor,verb,expected,label,remark=''){
    const before=await snapshot(order);
    status(label,await mutate(order,actor,verb,before.po,remark),expected);
    assert.deepEqual(await snapshot(order),before,label+' changed stored order, PDF or history');
  }
  function transition(before,after,action,actor,state,remark=''){
    assert.equal(after.po.status,state);
    assert.equal(after.po.revision,before.po.revision+1);
    assert.equal(after.po.history.length,before.po.history.length+1);
    assert.deepEqual(after.po.history.slice(0,-1),before.po.history);
    const entry=after.po.history.at(-1);
    assert.equal(entry.actor,actor);assert.equal(entry.action,action);assert.equal(entry.remark,remark);
    assert.match(entry.time,/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    assert.ok(Math.abs(Date.now()-Date.parse(entry.time.replace(' ','T')+'Z'))<300000,'expected a recent server timestamp');
    for(const key of ['id','number','owner','vendor','date','items','total'])assert.deepEqual(after.po[key],before.po[key]);
    assert.equal(after.pdf,before.pdf);
  }
  async function allowed(order,actor,verb,action,state,remark=''){
    const before=await snapshot(order);
    status(actor+' '+action,await mutate(order,actor,verb,before.po,remark),200);
    transition(before,await snapshot(order),action,actor,state,remark);
  }
  try{
    for(const name of names)users[name]=await signIn(name);
    const a=await create('creator1','OWNER'),b=await create('lead1','DUAL');
    status('no session',await request('/api/'+a.path),401);
    const list=await status('other creator list',await users.creator2('orders'),200).json();
    assert.ok(![...list.owned,...list.queue].some(p=>p.id===a.id));
    for(const path of [a.path,a.path+'/pdf'])status('other creator '+(path===a.path?'detail':'PDF'),await users.creator2(path),404);
    await denied(a,'creator2','edit',404,'cross-owner draft edit');
    await denied(a,'creator2','submit',404,'cross-owner draft submit');
    await denied(a,'approver1','approve',409,'draft approval');
    await allowed(a,'creator1','submit','SUBMIT','SUBMITTED');
    await allowed(b,'lead1','submit','SUBMIT','SUBMITTED');
    const {queue}=await status('finance queue',await users.approver1('orders'),200).json();
    for(const order of [a,b]){
      assert.ok(queue.some(p=>p.id===order.id&&p.owner===order.owner));
      const original=status('finance PDF',await users.approver1(order.path+'/pdf'),200);
      assert.equal(hash(Buffer.from(await original.arrayBuffer())),hash(pdf));
    }
    await denied(a,'approver1','edit',403,'Finance edit');
    await denied(a,'creator1','edit',409,'submitted owner edit');
    for(const verb of ['approve','reject']){
      await denied(a,'creator2',verb,403,'creator-only '+verb,'Example reason');
      await denied(b,'lead1',verb,403,'lead self-'+verb,'Example reason');
    }
    await denied(a,'approver1','reject',400,'empty rejection reason','');
    await denied(a,'approver1','reject',400,'whitespace rejection reason','   ');
    await allowed(a,'approver1','reject','REJECT','REJECTED','Correct supplier name');
    await denied(a,'creator2','edit',404,'cross-owner rejected edit');
    await denied(a,'creator2','submit',404,'cross-owner resubmit');
    await denied(a,'approver1','edit',403,'Finance rejected edit');
    await denied(a,'approver1','submit',403,'Finance resubmit');
    const beforeEdit=await snapshot(a);
    status('owner correction',await mutate(a,'creator1','edit',beforeEdit.po),200);
    const edited=await snapshot(a);
    assert.equal(edited.po.vendor,'Updated by creator1');
    assert.equal(edited.po.id,beforeEdit.po.id);assert.equal(edited.po.status,'REJECTED');
    assert.deepEqual(edited.po.history,beforeEdit.po.history);
    await allowed(a,'creator1','submit','RESUBMIT','SUBMITTED');
    await allowed(a,'lead1','approve','APPROVE','APPROVED');
    await denied(a,'creator1','edit',409,'approved owner edit');
    await denied(a,'approver1','approve',409,'repeat approval');
    const beforeRace=await snapshot(b);
    const responses=await Promise.all([1,2].map(()=>mutate(b,'approver1','approve',beforeRace.po)));
    const codes=responses.map(r=>r.status).sort();
    assert.deepEqual(codes,[200,409]);
    transition(beforeRace,await snapshot(b),'APPROVE','approver1','APPROVED');
    console.log('concurrent approvals',codes.join('/'),'one revision and one audit entry');
    for(const name of names){
      const as=users[name];
      status('logout',await as('logout','POST',{}),200);
      status('revoked session',await as('orders'),401);
      delete users[name];
    }
    console.log('Verified',run+'-OWNER',run+'-DUAL');
  }finally{
    await Promise.allSettled(Object.values(users).map(as=>as('logout','POST',{})));
  }
}
