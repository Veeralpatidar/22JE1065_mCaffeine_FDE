import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import app from '../worker/index.js';

test('health responds to an actual SQLite query and a closed connection', async () => {
  const db = new DatabaseSync(':memory:');
  const env = {DB:{prepare(sql){return {first:()=>db.prepare(sql).get()};}}};
  const request = new Request('https://example.test/health');
  const good = await app.fetch(request,env);
  assert.equal(good.status,200);
  assert.deepEqual(await good.json(),{status:'ok',database:'reachable'});
  db.close();
  const bad = await app.fetch(request,env);
  assert.equal(bad.status,503);
  assert.deepEqual(await bad.json(),{status:'unavailable',message:'Database temporarily unavailable.'});
});
test('home opens and unknown pages return a friendly error',async()=>{
  const home = await app.fetch(new Request('https://example.test/'),{});
  assert.equal(home.status,200);
  assert.match(await home.text(),/PEP Order Desk/);
  assert.equal((await app.fetch(new Request('https://example.test/missing'),{})).status,404);
});
