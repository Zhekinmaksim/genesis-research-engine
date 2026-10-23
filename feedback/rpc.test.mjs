import test from 'node:test';
import assert from 'node:assert/strict';
import {parseOptions,makeRpcReader} from './rpc.mjs';
const response=(result)=>new Response(JSON.stringify({jsonrpc:'2.0',id:1,result}),{status:200});
test('CLI selects RPCs explicitly and never enables online implicitly',()=>{
 assert.equal(parseOptions([]).online,false);assert.equal(parseOptions([],{GENESIS_VERIFY_RPC_URL:'https://unused.example/'}).online,false);
 assert.deepEqual(parseOptions(['--online','--rpc','https://a.example/key','--rpc','https://b.example/']).urls,['https://a.example/key','https://b.example/']);
 assert.throws(()=>parseOptions(['--rpc','https://a.example/']));
 assert.throws(()=>parseOptions(['--online','--rpc','http://public.example/']));
 assert.throws(()=>parseOptions(['--online','--rpc','https://user:secret@example.com/']),/userinfo/);
 assert.throws(()=>parseOptions(['--online','--rpc','not-a-secret-url']),e=>!e.message.includes('not-a-secret-url'));
 assert.equal(parseOptions(['--online'],{GENESIS_VERIFY_RPC_URL:'https://a.example/'}).urls[0],'https://a.example/');
});
test('RPC denies every write before making a network request',async()=>{
 let calls=0;const r=makeRpcReader(['https://a.example/'],{fetcher:async()=>{calls++;return response('0x1')}});
 for(const method of ['eth_sendRawTransaction','eth_sendTransaction','personal_sign','eth_sign','wallet_sendCalls'])await assert.rejects(r.request({method}),e=>e.kind==='write_refused');assert.equal(calls,0);
});
test('fallback uses another mainnet provider for reads and does not leak URL credentials',async()=>{
 const calls=[];const r=makeRpcReader(['https://a.example/SECRET','https://b.example/'],{fetcher:async(url,init)=>{
  const {method}=JSON.parse(init.body);calls.push([url,method]);if(url.includes('SECRET'))return new Response('forbidden',{status:403});return response(method==='eth_chainId'?'0x1':'0x42');
 }});
 assert.equal(await r.request({method:'eth_blockNumber'}),'0x42');assert.ok(calls.some(([url,method])=>url==='https://b.example/'&&method==='eth_chainId'));assert.ok(!JSON.stringify(r.diagnostics).includes('SECRET'));
});
test('historical state, wrong chain and transport errors stay distinct',async()=>{
 const archive=makeRpcReader(['https://a.example/'],{fetcher:async(_,init)=>JSON.parse(init.body).method==='eth_chainId'?response('0x1'):new Response(JSON.stringify({error:{code:-32000,message:'missing trie node: historical state pruned'}}))});
 await assert.rejects(archive.request({method:'eth_call',params:[{},'0x123']}),e=>e.kind==='historical_state_unavailable');
 const wrong=makeRpcReader(['https://a.example/'],{fetcher:async()=>response('0x89')});await assert.rejects(wrong.request({method:'eth_blockNumber'}),e=>e.kind==='wrong_chain');
 const down=makeRpcReader(['https://a.example/SECRET'],{fetcher:async()=>{throw Error('network SECRET')}});await assert.rejects(down.request({method:'eth_chainId'}),e=>e.kind==='rpc_transport_unavailable'&&!e.message.includes('SECRET'));
});
