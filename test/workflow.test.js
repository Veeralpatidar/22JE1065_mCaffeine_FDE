import {verifyPermissions} from '../scripts/verify-permissions.js';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import bcrypt from 'bcryptjs';
import app from '../worker/index.js';
import {verifyFlow} from '../scripts/verify-flow.js';

async function withFixture(check){
  const sql=new DatabaseSync(':memory:');
  for(const f of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())sql.exec(readFileSync('drizzle/'+f,'utf8'));
  const passwords={};for(const [name,c,a] of [['creator1',1,0],['creator2',1,0],['approver1',0,1],['lead1',1,1]]){
    passwords[name]=crypto.randomUUID();
    sql.prepare('INSERT INTO users VALUES (?,?,?,?)').run(name,bcrypt.hashSync(passwords[name],4),c,a);
  }
  function prepare(query,args=[]){
    const statement=sql.prepare(query);
    return {bind:(...args)=>prepare(query,args),first:()=>statement.get(...args),all:()=>({results:statement.all(...args)}),run:()=>({meta:{changes:statement.run(...args).changes}})};
  }
  const DB={prepare,batch:statements=>{
    sql.exec('BEGIN');try{const result=statements.map(s=>s.run());sql.exec('COMMIT');return result;}catch(e){sql.exec('ROLLBACK');throw e;}
  }};
  const files=new Map();
  const BUCKET={put:(k,b)=>files.set(k,b),get:k=>files.has(k)?{body:files.get(k)}:null,delete:k=>files.delete(k)};
  try{await check(req=>app.fetch(req,{DB,BUCKET}),'https://test.invalid',passwords,readFileSync('test/fixtures/original-po.pdf'));}finally{sql.close();}
}

test('manual approval workflow',()=>withFixture(verifyFlow));
test('section 3 permission matrix',()=>withFixture(verifyPermissions));


test('PDF review API and database acceptance', {skip:!process.env.SAMPLE_PDF_DIR},()=>withFixture(async(send,base,passwords)=>{
  const {permissionClient}=await import('../scripts/permission-client.js');
  const assert=(await import('node:assert/strict')).default;
  const {signIn}=permissionClient(send,base,passwords);
  const a=await signIn('creator1'), b=await signIn('creator2'), finance=await signIn('approver1');
  const file=name=>new File([readFileSync(process.env.SAMPLE_PDF_DIR+'/'+name)],name,{type:'application/pdf'});
  async function preview(client,pdf){const f=new FormData();f.set('pdf',pdf);return client('orders/extract','POST',f);}
  async function create(client,pdf,order){const f=new FormData();f.set('pdf',pdf);f.set('order',JSON.stringify(order));return client('orders','POST',f);}
  const first=file('sample_1_digital.pdf');
  assert.equal((await preview(finance,first)).status,403);
  const one=await preview(a,first);assert.equal(one.status,200);const good=await one.json();
  assert.equal(good.order.items.length,5);assert.equal(good.order.total,25420000);
  const made=await create(a,first,good.order);assert.equal(made.status,201);const {id}=await made.json();
  const detail=await (await a('orders/'+id)).json();assert.equal(detail.extraction.method,'text_layer');
  assert.equal((await a('orders/'+id+'/submit','POST',{revision:detail.revision})).status,200);
  const bad=file('sample_2_mismatch.pdf'),badOrder=(await (await preview(a,bad)).json()).order;
  const mismatch=await create(a,bad,badOrder);assert.equal(mismatch.status,201);const mid=(await mismatch.json()).id;
  const md=await (await a('orders/'+mid)).json();
  const refused=await a('orders/'+mid+'/submit','POST',{revision:md.revision});assert.equal(refused.status,400);assert.match((await refused.json()).message,/18000/);
  const dup=file('sample_3_resent.pdf'),dupOrder=(await (await preview(b,dup)).json()).order;
  assert.equal((await create(b,dup,dupOrder)).status,409);
  const garbled=file('sample_4_garbled.pdf'),fallback=await (await preview(a,garbled)).json();assert.equal(fallback.method,'manual');
  const manual=await create(a,garbled,{number:'MANUAL-4',date:'2026-11-27',vendor:'Manual vendor',total:10000,items:[]});assert.equal(manual.status,201);
  const manualId=(await manual.json()).id, saved=await (await a('orders/'+manualId)).json();assert.equal(saved.extraction.method,'manual');
  assert.equal(saved.validation.calculatedTotal,null);assert.equal((await a('orders/'+manualId+'/pdf')).status,200);
}));
