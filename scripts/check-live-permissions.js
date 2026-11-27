import {readFileSync} from 'node:fs';
import {verifyPermissions} from './verify-permissions.js';

const [loginFile,pdfFile]=process.argv.slice(2);
if(!loginFile||!pdfFile)throw Error('Usage: node scripts/check-live-permissions.js <demo-login-file> <sample-pdf>');
const passwords=Object.fromEntries(readFileSync(loginFile,'utf8').trim().split(/\r?\n/).map(line=>line.trim().split(/\s+/)));
await verifyPermissions(request=>fetch(request),'https://pep-po-desk-vp26.dependablemango64.chatgpt.site',passwords,readFileSync(pdfFile));
