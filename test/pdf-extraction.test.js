import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {parseMoney,parseDate,parseRows,checks} from '../worker/po-text.js';
import {inspectPdf} from '../worker/pdf-extraction.js';
const path=process.env.SAMPLE_PDF_DIR;
async function read(p){return inspectPdf(new File([readFileSync(p)],'po.pdf',{type:'application/pdf'}));}
test('currency and calendar normalization',()=>{
 for(const v of ['₹1,24,500.00','Rs. 124500','INR 1,24,500','124,500'])assert.equal(parseMoney(v),12450000);
 for(const v of ['15-11-2026','15/11/2026','15.11.2026','15 Nov 2026'])assert.equal(parseDate(v),'2026-11-15');
 assert.equal(parseDate('31/02/2026'),'');assert.equal(parseMoney('12,34'),null);
});
test('exact inclusive rupee tolerance',()=>{
 const row={qty:2,price:1000,amount:2100};assert.equal(checks({total:2200,items:[row]}).issues.length,0);
 assert.equal(checks({total:2201,items:[row]}).issues.length,1);
 assert.equal(checks({total:2101,items:[{...row,amount:2101}]}).issues.length,1);
 assert.equal(checks({total:0,items:[]}).calculatedTotal,null);
});
test('unreadable text never populates fake values',()=>assert.equal(parseRows(['×¸÷ ¿«°×¦¶']).method,'manual'));
test('new independent PDF',async()=>{
 const r=await read('test/fixtures/original-po.pdf');assert.equal(r.method,'text_layer');assert.equal(r.order.number,'CUSTOM-2026-778');assert.equal(r.order.items.length,2);assert.equal(r.order.total,130400);assert.equal(checks(r.order).issues.length,0);
});
test('four supplied PDFs (set SAMPLE_PDF_DIR)',{skip:!path},async()=>{
 const files=['sample_1_digital.pdf','sample_2_mismatch.pdf','sample_3_resent.pdf','sample_4_garbled.pdf'];for(const f of files)assert.ok(existsSync(path+'/'+f),'Missing '+f);
 const [a,b,c,d]=await Promise.all(files.map(f=>read(path+'/'+f)));
 assert.equal(a.order.number,'PO-2026-001');assert.equal(a.order.total,25420000);assert.equal(a.order.items.length,5);assert.match(a.order.items[3].description,/Walnut Shell/);assert.equal(checks(a.order).issues.length,0);
 assert.equal(b.order.total,14250000);assert.equal(checks(b.order).calculatedTotal,12450000);assert.match(checks(b.order).issues[0].message,/18000\.00/);
 assert.equal(c.order.number,a.order.number);assert.equal(c.order.date,'2026-11-15');
 assert.equal(d.method,'manual');assert.equal(d.order.items.length,0);assert.equal(d.order.number,'');
});
test('invalid PDF signature and size rejected',async()=>{
 await assert.rejects(()=>inspectPdf(new File(['not PDF'],'bad.pdf')),/must be a PDF/);
 await assert.rejects(()=>inspectPdf(new File([new Uint8Array(5000001)],'big.pdf')),/up to 5 MB/);
});
test('structurally invalid PDF rejected',async()=>{
 await assert.rejects(()=>inspectPdf(new File(['%PDF-1.7\nnot a document\n%%EOF'],'bad.pdf')),/Invalid PDF/);
});
