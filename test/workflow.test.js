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
  try{await check(req=>app.fetch(req,{DB,BUCKET}),'https://test.invalid',passwords,Buffer.from('%PDF-1.7\nlocal fixture\n%%EOF'));}finally{sql.close();}
}

test('manual approval workflow',()=>withFixture(verifyFlow));
test('section 3 permission matrix',()=>withFixture(verifyPermissions));
