import {Problem,requireThat,json} from './common.js';
import {parseRows,rowsFromSpans} from './po-text.js';
export async function inspectPdf(file){
  requireThat(file&&typeof file.arrayBuffer==='function'&&file.size>0&&file.size<=5000000,400,'Attach one PDF up to 5 MB.');
  requireThat((await file.slice(0,5).text())==='%PDF-',400,'Original file must be a PDF.');
  const bytes=new Uint8Array(await file.arrayBuffer());
  const {getDocumentProxy}=await import('unpdf');
  let doc;
  try{
    doc=await getDocumentProxy(bytes.slice(),{isEvalSupported:false,useSystemFonts:false,maxImageSize:16777216});
  }catch(e){
    if(e?.name==='PasswordException')return {bytes,method:'manual',order:parseRows([]).order,warnings:['Password-protected PDF: enter the fields manually.']};
    throw new Problem(400,'Invalid PDF. Attach a readable PDF file.');
  }
  try{
    if(doc.numPages>30)return {bytes,...parseRows([]),warnings:['PDF has more than 30 pages. Enter fields manually.']};
    const lines=[];
    for(let i=1;i<=doc.numPages;i++){
      const page=await doc.getPage(i),{items}=await page.getTextContent();
      if(items.length>20000)return {bytes,...parseRows([]),warnings:['PDF text is too complex. Enter fields manually.']};
      lines.push(...rowsFromSpans(items.filter(s=>s.transform).map(s=>({str:s.str,x:s.transform[4],y:s.transform[5]}))));
    }
    return {bytes,...parseRows(lines)};
  }catch(e){return {bytes,...parseRows([])};}finally{await doc.destroy();}
}
export async function preview(req,u){
  requireThat(u.creator,403,'Creator role required.');
  let form;try{form=await req.formData();}catch{throw new Problem(400,'Attach one PDF.');}
  const {bytes,...result}=await inspectPdf(form.get('pdf'));
  return json(result);
}
