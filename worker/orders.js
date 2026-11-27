import {Problem,requireThat,json,readJSON} from './common.js';
import {inspectPdf} from './pdf-extraction.js';
import {checks} from './po-text.js';
const editable=p=>p.status==='DRAFT'||p.status==='REJECTED';
const money=n=>Number.isSafeInteger(n)&&n>=0&&n<=1e12;
function fields(data){
  const clean=(value,max)=>typeof value==='string' && value.trim().length<=max?value.trim():'';
  const number=clean(data.number,90).toUpperCase(), vendor=clean(data.vendor,200), date=clean(data.date,10);
  requireThat(number&&vendor&&/^\d{4}-\d{2}-\d{2}$/.test(date)&&!isNaN(Date.parse(date))&&new Date(date).toISOString().slice(0,10)===date,400,'Enter an order number, valid date and vendor.');
  requireThat(money(data.total),400,'Enter a valid printed total.');
  requireThat(Array.isArray(data.items)&&data.items.length<=200,400,'Enter up to 200 line items.');
  const items=data.items.map((v,i)=>{
    const sku=clean(v?.sku,100),description=clean(v?.description,400);
    requireThat(sku&&description&&Number.isSafeInteger(v.qty)&&v.qty>0&&v.qty<=1e8&&money(v.price)&&v.price>0&&money(v.amount),400,'Check SKU, description, quantity and amounts on line '+(i+1)+'.');
    return {sku,description,qty:v.qty,price:v.price,amount:v.amount};
  });
  return {number,vendor,date,total:data.total,items};
}
function validateSubmit(p){
  const data=fields({...p,items:JSON.parse(p.items)});
  const result=checks(data);
  requireThat(!result.issues.length,400,result.issues.map(i=>i.message).join(' '));
}
function ownCreator(p,u){return u.creator && p.owner===u.username;}
function visible(p,u){return ownCreator(p,u)||(u.approver&&p.status==='SUBMITTED');}
function duplicate(e){return /UNIQUE constraint failed: pos.number/i.test(String(e)+' '+String(e.cause));}
export async function list(db,u){
  const select='SELECT id,number,vendor,date,total,status,owner FROM pos WHERE ';
  const owned=u.creator?(await db.prepare(select+'owner=? ORDER BY rowid DESC').bind(u.username).all()).results:[];
  const queue=u.approver?(await db.prepare(select+"status='SUBMITTED' ORDER BY rowid").all()).results:[];
  return json({user:u,owned,queue});
}
export async function create(req,env,u){
  requireThat(u.creator,403,'Creator role required.');
  let form,data;
  try {form=await req.formData(); data=JSON.parse(form.get('order'));} catch {throw new Problem(400,'Enter the order and attach a PDF.');}
  const v=fields(data);
  const file=form.get('pdf');
  const {bytes,...extraction}=await inspectPdf(file);
  const id=crypto.randomUUID(), key='originals/'+id+'.pdf';
  await env.BUCKET.put(key,bytes,{httpMetadata:{contentType:'application/pdf'}});
  try {
    await env.DB.prepare('INSERT INTO pos (id,owner,number,date,vendor,items,total,pdf,extraction) VALUES (?,?,?,?,?,?,?,?,?)').bind(id,u.username,v.number,v.date,v.vendor,JSON.stringify(v.items),v.total,key,JSON.stringify(extraction)).run();
  } catch(e) {
    try{await env.BUCKET.delete(key);}catch{console.error(JSON.stringify({time:new Date().toISOString(),event:'pdf.cleanup_failed'}));}
    if(!duplicate(e)) throw e;
    throw new Problem(409,'That PO number already exists.');
  }
  return json({id},201);
}
export async function detail(env,p,u){
  requireThat(visible(p,u),404,'Order unavailable.');
  const history=(await env.DB.prepare('SELECT action,actor,remark,time FROM history WHERE po=? ORDER BY sequence').bind(p.id).all()).results;
  const {pdf,operation,...view}=p;
  const items=JSON.parse(p.items);
  return json({...view,extraction:p.extraction?JSON.parse(p.extraction):null,validation:checks({...p,items}),items,history,canEdit:!!(ownCreator(p,u)&&editable(p)),canDecide:!!(u.approver&&p.owner!==u.username&&p.status==='SUBMITTED')});
}
export async function pdf(env,p,u){
  requireThat(visible(p,u),404,'Order unavailable.');
  const file=await env.BUCKET.get(p.pdf);
  requireThat(file,404,'Original PDF unavailable.');
  return new Response(file.body,{headers:{'Content-Type':'application/pdf','Content-Disposition':'inline; filename="original.pdf"','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"sandbox"}});
}
export async function edit(req,db,p,u){
  requireThat(ownCreator(p,u),u.approver?403:404,'Only the owner can edit this order.');
  requireThat(editable(p),409,'Order is locked.');
  const data=await readJSON(req),v=fields(data);
  try {
    const r=await db.prepare("UPDATE pos SET number=?,date=?,vendor=?,items=?,total=?,revision=revision+1 WHERE id=? AND owner=? AND revision=? AND status IN ('DRAFT','REJECTED')").bind(v.number,v.date,v.vendor,JSON.stringify(v.items),v.total,p.id,u.username,data.revision??-1).run();
    requireThat(r.meta.changes===1,409,'Order changed. Reopen it and try again.');
  } catch(e){if(duplicate(e))throw new Problem(409,'That PO number already exists.'); throw e;}
  return json({id:p.id});
}
export async function transition(req,db,p,u,verb){
  const submit=verb==='submit';
  if(submit){
    requireThat(ownCreator(p,u),u.approver?403:404,'Only the owner can submit.');
    requireThat(editable(p),409,'Order cannot be submitted in this state.');
    validateSubmit(p);
  } else {
    requireThat(u.approver,403,'Approver role required.');
    requireThat(p.owner!==u.username,403,'You cannot decide your own order.');
    requireThat(p.status==='SUBMITTED',409,'Only a submitted order can be decided.');
  }
  const data=await readJSON(req);
  requireThat(data.revision===p.revision,409,'Order changed. Reopen it and try again.');
  const remark=verb==='reject'&&typeof data.remark==='string'?data.remark.trim():'';
  requireThat(verb!=='reject'||(remark.length>0&&remark.length<=2000),400,'Enter a rejection reason (up to 2000 characters).');
  const action=submit?(p.status==='REJECTED'?'RESUBMIT':'SUBMIT'):verb.toUpperCase();
  const status={submit:'SUBMITTED',approve:'APPROVED',reject:'REJECTED'}[verb];
  const op=crypto.randomUUID();
  // The operation ID ties the append to this exact successful conditional update.
  const [updated]=await db.batch([
    db.prepare('UPDATE pos SET status=?,operation=?,revision=revision+1 WHERE id=? AND status=? AND revision=?').bind(status,op,p.id,p.status,p.revision),
    db.prepare('INSERT INTO history (po,actor,action,remark) SELECT id,?,?,? FROM pos WHERE id=? AND operation=?').bind(u.username,action,remark,p.id,op)
  ]);
  requireThat(updated.meta.changes===1,409,'Order already changed.');
  return json({id:p.id,status});
}
