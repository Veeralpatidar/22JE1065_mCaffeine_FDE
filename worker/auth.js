import bcrypt from 'bcryptjs';
import hashes from '../db/demo-hashes.js';
import {json,requireThat,readJSON} from './common.js';
const cookie='__Host-pepdesk';
const flags='; Path=/; Secure; HttpOnly; SameSite=Strict';
async function digest(token){
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token));
  return Array.from(new Uint8Array(bytes),n=>n.toString(16).padStart(2,'0')).join('');
}
function tokenOf(req){
  return (req.headers.get('Cookie')||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(cookie+'='))?.slice(cookie.length+1);
}
export async function login(req,db){
  const {username,password}=await readJSON(req);
  requireThat(typeof username==='string' && Object.hasOwn(hashes,username) && typeof password==='string' && password.length<=72,401,'Invalid login.');
  const user=await db.prepare('SELECT * FROM users WHERE username=?').bind(username).first();
  requireThat(await bcrypt.compare(password,user?.hash??hashes[username]),401,'Invalid login.');
  const token=crypto.randomUUID()+crypto.randomUUID();
  const now=Date.now();
  await db.batch([
    db.prepare('INSERT OR IGNORE INTO users (username,hash,creator,approver) VALUES (?,?,?,?)').bind(username,hashes[username],Number(username.startsWith('creator')||username==='lead1'),Number(username==='approver1'||username==='lead1')),
    db.prepare('DELETE FROM sessions WHERE expires<=?').bind(now),
    db.prepare('INSERT INTO sessions (digest,username,expires) VALUES (?,?,?)').bind(await digest(token),username,now+8*3600*1000)
  ]);
  return json({username},200,{'Set-Cookie':cookie+'='+token+flags+'; Max-Age=28800'});
}
export async function identity(req,db){
  const token=tokenOf(req);
  requireThat(token,401,'Please sign in.');
  const user=await db.prepare('SELECT u.username,u.creator,u.approver FROM sessions s JOIN users u ON u.username=s.username WHERE s.digest=? AND s.expires>?').bind(await digest(token),Date.now()).first();
  requireThat(user,401,'Please sign in again.');
  return user;
}
export async function logout(req,db){
  const token=tokenOf(req);
  if(token) await db.prepare('DELETE FROM sessions WHERE digest=?').bind(await digest(token)).run();
  return json({ok:true},200,{'Set-Cookie':cookie+'='+flags+'; Max-Age=0'});
}
