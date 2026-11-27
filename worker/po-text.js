// All money is represented by integer paise. Do not use floating point for comparisons.
const months='jan feb mar apr may jun jul aug sep oct nov dec'.split(' ');
const cash=String.raw`(?:₹\s*|INR\s*|Rs\.?\s*)?\d[\d,]*(?:\.\d{1,2})?`;
export function parseMoney(s){
  if(typeof s!=='string')return null;
  const v=s.trim().replace(/^(?:₹|INR|Rs\.?)\s*/i,'');
  if(!/^(?:\d+|\d{1,3}(?:,\d{3})+|\d{1,2}(?:,\d{2})*,\d{3})(?:\.\d{1,2})?$/.test(v))return null;
  const [w,f='']=v.replaceAll(',','').split('.');
  const n=BigInt(w)*100n+BigInt(f.padEnd(2,'0'));
  return n<=1000000000000n?Number(n):null;
}
export function parseDate(s){
  if(typeof s!=='string')return '';
  let y,m,d; const iso=s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const numeric=s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  const named=s.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
  if(iso)[,y,m,d]=iso;
  else if(numeric)[,d,m,y]=numeric;
  else if(named){[,d,,y]=named;m=months.indexOf(named[2].toLowerCase().slice(0,3))+1;}
  else return '';
  const out=`${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
  const t=Date.parse(out);return Number.isFinite(t)&&new Date(t).toISOString().slice(0,10)===out?out:'';
}
// Input: each page is a list of positioned text spans, in PDF coordinates.
export function rowsFromSpans(spans){
  const rows=[];
  for(const s of [...spans].filter(s=>s.str?.trim()).sort((a,b)=>b.y-a.y||a.x-b.x)){
    let row=rows.find(r=>Math.abs(r.y-s.y)<=2.5);
    if(!row){row={y:s.y,cells:[]};rows.push(row);} row.cells.push(s);
  }
  return rows.sort((a,b)=>b.y-a.y).map(r=>r.cells.sort((a,b)=>a.x-b.x).map(s=>s.str.trim()).join(' '));
}
const totalLabel=String.raw`(?:\bPO\s+TOTAL\b|\bGRAND\s+TOTAL\b|\bORDER\s+TOTAL\b|^\s*TOTAL\b)`;
const totalRe=new RegExp(totalLabel+'\\s*:?\\s*('+cash+')','i');
const numberRe=/(?:\b(?:purchase\s+order|p\s*\.?\s*o\.?)\s*(?:number|no\.?|#))\s*[:#]?\s*([A-Z0-9][A-Z0-9._/-]*)/i;
const dateRe=/(?:\b(?:purchase\s+order|p\s*\.?\s*o\.?|order)\s+date|^date)\s*:?\s*(\d{4}-\d{2}-\d{2}|\d{1,2}[-/.]\d{1,2}[-/.]\d{4}|\d{1,2}\s+[A-Za-z]+\s+\d{4})/i;
const vendorRe=/\b(?:vendor(?:\s+name)?|supplier(?:\s+name)?)\s*[:]?\s*(.+?)(?=\s+(?:delivery|payment|ship\s+to|bill\s+to|(?:PO|order)\s+date)\s*:|$)/i;
const heading=/\b(?:sku|item\s+code|product\s+code)\b.*\b(?:description|product\s+name|item\s+name)\b.*\b(?:qty|quantity)\b.*\b(?:unit\s+price|rate|price)\b.*\b(?:amount|line\s+total|total)\b/i;
const itemRe=new RegExp('^(?:\\d+\\s+)?([A-Za-z0-9][A-Za-z0-9._/-]*)\\s+(.+?)\\s+(\\d[\\d,]*)\\s+('+cash+')\\s+('+cash+')$','i');
export function parseRows(lines){
  const out={number:'',date:'',vendor:'',total:null,items:[]};
  let table=false, seenHeader=false, incomplete=false, pending='';
  for(const raw of lines){
    const line=raw.replace(/\s+/g,' ').trim(); if(!line)continue;
    const n=line.match(numberRe),d=line.match(dateRe),v=line.match(vendorRe),t=line.match(totalRe);
    if(n&&!out.number)out.number=n[1].toUpperCase();
    if(d&&!out.date)out.date=parseDate(d[1]);
    if(v&&!out.vendor)out.vendor=v[1].trim();
    if(t){out.total=parseMoney(t[1]);table=false;if(pending)incomplete=true;pending='';continue;}
    if(heading.test(line)){table=true;seenHeader=true;continue;}
    if(!table)continue;
    if(/^(?:terms|authori[sz]ed|signature|page\s+\d|subtotal|tax|gst\b)/i.test(line)){table=false;if(pending)incomplete=true;pending='';continue;}
    const m=(pending?pending+' '+line:line).match(itemRe);
    if(m){
      const qty=Number(m[3].replaceAll(',','')),price=parseMoney(m[4]),amount=parseMoney(m[5]);
      if(!Number.isSafeInteger(qty)||qty<=0||qty>1e8||price===null||amount===null){incomplete=true;pending='';continue;}
      out.items.push({sku:m[1],description:m[2],qty,price,amount});pending='';continue;
    }
    // A line without trailing amounts may be a wrapped description. A code-like first token
    // starts a pending row, otherwise append only to an already recognised row.
    if(pending){incomplete=true;pending='';}
    if(/^[A-Z0-9]+[-_/][A-Z0-9._/-]+\s/i.test(line)){pending=line;continue;}
    if(out.items.length&&!/\d[\d,]*\.\d{2}\s*$/.test(line))out.items.at(-1).description+=' '+line;
    else incomplete=true;
  }
  if(pending)incomplete=true;
  // If no trustworthy header fields exist, never prefill garbage.
  if(!out.number&&!out.date&&!out.vendor&&out.total===null)return {method:'manual',order:{number:'',date:'',vendor:'',total:null,items:[]},warnings:["This PDF can't be read automatically. Enter the fields by hand."]};
  const warnings=[];
  if(!out.number||!out.date||!out.vendor||out.total===null)warnings.push('Some header fields could not be read. Review and fill missing fields.');
  if(incomplete){out.items=[];warnings.push('The line table could not be read reliably; enter line items manually.');}
  if(!seenHeader||!out.items.length)warnings.push('Line items not checked.');
  return {method:'text_layer',order:out,warnings};
}
export function checks(order){
  const issues=[];const items=order.items||[];let sum=0n;
  for(const [i,r] of items.entries()){
    const expected=BigInt(r.qty)*BigInt(r.price), actual=BigInt(r.amount), delta=expected-actual;
    if(delta>100n||delta< -100n)issues.push({field:'items.'+i+'.amount',message:`Line ${i+1} amount differs from quantity × price by more than ₹1.`});
    sum+=actual;
  }
  if(items.length){const d=sum-BigInt(order.total);if(d>100n||d< -100n){const abs=d<0n?-d:d;issues.push({field:'total',message:`Line amounts differ from the printed total by ₹${abs/100n}.${String(abs%100n).padStart(2,'0')} (allowed ₹1.00).`});}}
  return {issues,calculatedTotal:items.length?Number(sum):null};
}
