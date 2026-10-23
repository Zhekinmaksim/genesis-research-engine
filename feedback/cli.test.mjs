// Explicit test preload serves public saved IMD bytes. Production has no mock mode.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const base=new URL('./',import.meta.url);
async function child(args,preload){return new Promise((resolve,reject)=>{const p=spawn(process.execPath,['--import',preload,new URL('verify.mjs',base).pathname,...args],{env:{PATH:process.env.PATH},stdio:['ignore','pipe','pipe']});let stdout='',stderr='';p.stdout.on('data',b=>stdout+=b);p.stderr.on('data',b=>stderr+=b);p.on('error',reject);p.on('close',code=>resolve({code,stdout,stderr}));});}
test('CLI preserves offline success while distinguishing online availability from evidence mismatch',async()=>{
 const snapshots=JSON.parse(await readFile(new URL('snapshots.json',base),'utf8'));
 const temporary=await mkdtemp(join(tmpdir(),'genesis-verifier-test-'));
 const preload=join(temporary,'public-api-preload.mjs');
 await writeFile(preload,`const publicApi=${JSON.stringify(snapshots.api)};const original=globalThis.fetch;globalThis.fetch=async(input,init)=>Object.hasOwn(publicApi,String(input))?new Response(Buffer.from(publicApi[String(input)],'base64'),{status:200}):original(input,init);`);
 let mode='unavailable';const methods=new Set();
 const server=createServer(async(req,res)=>{let text='';for await(const b of req)text+=b;const q=JSON.parse(text);methods.add(q.method);res.setHeader('Content-Type','application/json');if(mode==='unavailable'){res.writeHead(403);return res.end('{}');}if(mode==='historical'&&['eth_getCode','eth_call'].includes(q.method))return res.end(JSON.stringify({jsonrpc:'2.0',id:1,error:{code:-32000,message:'historical state unavailable: missing trie node'}}));if(mode==='mismatch'&&q.method==='eth_getCode')return res.end(JSON.stringify({jsonrpc:'2.0',id:1,result:'0x6000'}));const key=JSON.stringify({method:q.method,params:q.params||[]});if(!Object.hasOwn(snapshots.rpc,key)){res.writeHead(400);return res.end('{}');}res.end(JSON.stringify({jsonrpc:'2.0',id:1,result:snapshots.rpc[key]}));});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}`;
 try{
  let r=await child(['--online','--rpc',url],preload);assert.equal(r.code,2,r.stderr);let d=JSON.parse(r.stdout);assert.equal(d.offline.passed,true);assert.equal(d.online.status,'unconfirmed');assert.equal(d.online.reason,'rpc_transport_unavailable');assert.equal(d.passed,false);
  mode='historical';r=await child(['--online','--rpc',url],preload);assert.equal(r.code,2,r.stderr);d=JSON.parse(r.stdout);assert.equal(d.online.reason,'historical_state_unavailable');
  mode='mismatch';r=await child(['--online','--rpc',url],preload);assert.equal(r.code,3,r.stderr);d=JSON.parse(r.stdout);assert.equal(d.online.status,'failed');assert.equal(d.online.reason,'evidence_mismatch');
  mode='success';r=await child(['--online','--rpc',url],preload);assert.equal(r.code,0,r.stderr);d=JSON.parse(r.stdout);assert.equal(d.offline.passed,true);assert.equal(d.online.status,'verified');assert.equal(d.passed,true);
  assert.ok([...methods].every(m=>['eth_chainId','eth_blockNumber','eth_call','eth_getCode','eth_getTransactionByHash','eth_getTransactionReceipt'].includes(m)));
 }finally{await new Promise(r=>server.close(r));await rm(temporary,{recursive:true,force:true});}
});
