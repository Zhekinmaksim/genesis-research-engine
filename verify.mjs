#!/usr/bin/env node
// No dependency installation is needed. Default mode performs no network access.
import assert from 'node:assert/strict';
import {readFile,lstat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const root=new URL('./',import.meta.url),checks=[];
if(!process.argv.includes('--online'))globalThis.fetch=async()=>{throw Error('Network is disabled in offline verification');};
const sha=b=>createHash('sha256').update(b).digest('hex');
const read=path=>readFile(new URL(path,root));
const json=async path=>JSON.parse(await read(path));
const ok=(condition,name)=>{assert.ok(condition,name);checks.push(name);};
try {
 const manifest=await json('manifest.json');
 for(const [path,hash] of Object.entries(manifest.files)){
  assert.match(path,/^[a-zA-Z0-9_./-]+$/);assert.ok(!path.split('/').includes('..'));
  const info=await lstat(new URL(path,root));assert.ok(info.isFile()&&!info.isSymbolicLink());
  assert.equal(sha(await read(path)),hash,'Changed package file: '+path);
 }
 ok(true,'Every manifest-listed source, artifact and verifier file matches SHA-256');
 const {Expedition,CANDIDATES,ALL_CONDITIONS,HOLDOUT,TRAINING,candidatesFor,conditionKey,decideExperiment,modelOutcome,simulatePublicModelOutcome,explainModelElimination,recordedResearch,parseResearchDecision,researchBodyHash,verifyResearchEvidence}=await import('./engine.mjs');
 const contractRead=await json('evidence/contract-current-readonly.json');
 ok(sha(await read('contracts/src/GenesisResearch.sol'))==='2efc761467ef886317f5136ccb64bb88ecab7d0209db4e5edb0ebcf56f611a15','Contract source matches the exact IMD-published deployed-source snapshot');
 ok(contractRead.chainId===1&&contractRead.owner.toLowerCase()==='0x550011cadcc758969391050241b2fc43ed1a4b97'&&contractRead.spent==='0','Saved read-only contract snapshot distinguishes deployment ownership from zero research spending');
 const worldBytes=await read('evidence/recorded-world.json');
 ok(sha(worldBytes)==='281d59f730460ddf86d075da1e6d39082bb58dad492a2630b9225f31a154d54f','Original public research archive matches its pinned SHA-256');
 const state=JSON.parse(worldBytes),{record,control,treatment}=recordedResearch(state);
 const decisionBytes=await read('evidence/decision.json');
 ok(sha(decisionBytes)==='a832e2611353d3cb8e8c29d5c6250fe591b58be650413f03a48eb6fe7c746fc9','Original IMD artifact bytes match accepted SHA-256');
 const decision=parseResearchDecision(JSON.parse(decisionBytes),record);
 assert.deepEqual(decision,record.decision);
 ok(researchBodyHash(record.input)===record.bodyHash,'Prepared request body hash and artifact world/revision/research binding match');
 const chain=await json('evidence/ethereum.json');
 const snapshots=new Map([
  ['https://api.imd.fun/intake/1/'+record.txHash,await read('evidence/intake.json')],
  ['https://api.imd.fun/jobs/'+record.jobId,await read('evidence/job.json')],
  ['https://api.imd.fun/jobs/'+record.jobId+'/result',await read('evidence/result.json')],
  ['https://api.imd.fun/artifacts/'+record.artifactHash,decisionBytes],
 ]);
 const offlineFetch=async url=>{
  if(!snapshots.has(String(url)))throw Error('Unexpected snapshot request');
  return new Response(snapshots.get(String(url)),{status:200});
 };
 const rpcFrom=(snapshot)=>({
  getChainId:async()=>Number(BigInt(snapshot.chainId)),
  getBlockNumber:async()=>BigInt(snapshot.head),
  getTransaction:async({hash})=>{assert.equal(hash,record.txHash);const t=snapshot.transaction;return {...t,blockNumber:BigInt(t.blockNumber)};},
  getTransactionReceipt:async({hash})=>{assert.equal(hash,record.txHash);const r=snapshot.receipt;return {...r,status:r.status==='0x1'?'success':'reverted',blockNumber:BigInt(r.blockNumber),logs:r.logs.map(l=>({...l,logIndex:Number(BigInt(l.logIndex))}))};},
 });
 const verified=await verifyResearchEvidence(record,{fetcher:offlineFetch,rpc:rpcFrom(chain)});
 ok(verified.status==='verified'&&verified.artifactHash===record.artifactHash&&verified.jobId===record.jobId,'Production verifier accepts saved calldata, Requested event, IMD admission, job and original artifact');
 assert.deepEqual(verified.decision,record.decision);
 ok(true,'Verified proposal equals the proposal applied to the recorded experiment');
 assert.equal(control.conditions.water,false);assert.equal(treatment.conditions.water,true);
 for(const k of ['mineral','light','temperature'])assert.equal(control.conditions[k],treatment.conditions[k]);
 assert.deepEqual(control.outcome,{growth:50,energy:40,survived:false});
 assert.deepEqual(treatment.outcome,control.outcome);
 ok(true,'Only water changed; both recorded measurements are growth 50, energy 40, survival false');
 const before=candidatesFor([control]),after=candidatesFor([control,treatment]);
 const excluded=CANDIDATES.map((m,i)=>({m,id:i+1})).filter(({m})=>before.includes(m)&&!after.includes(m)).map(x=>x.id);
 assert.equal(before.length,19);assert.equal(after.length,14);assert.deepEqual(excluded,[7,11,13,14,16]);
 const explanation=explainModelElimination([control,treatment]);
 assert.deepEqual(explanation.newlyEliminated.map(m=>m.index),excluded);
 ok(true,'Recomputed 19 → 14 compatible models; excluded IDs 07, 11, 13, 14, 16');
 for(const m of CANDIDATES)for(const c of ALL_CONDITIONS)assert.deepEqual(modelOutcome(m,c),simulatePublicModelOutcome(m,c));
 ok(true,'All 576 reference model/condition outcomes match the production engine');
 const source=(await read('server/research.ts')).toString();
 assert.doesNotMatch(source,/from\s+['"].*(world|simulator)/);
 const a=new Expedition('public-review-fixture-a'),b=new Expedition('public-review-fixture-b');
 assert.deepEqual(decideExperiment(a.state().observations,0),decideExperiment(b.state().observations,0));
 ok(true,'Local experiment selector uses public observations and the known model family, not a hidden world import');
 const local=[];
 for(let i=0;i<24;i++){
  const e=new Expedition('public-review-independent-fixture-'+i);
  const commitment=e.state().commitment;
  for(let step=0;step<15&&e.state().phase!=='ready';step++)e.step();
  assert.equal(e.state().phase,'ready');
  const training=structuredClone(e.state().observations),remaining=e.state().credits;
  assert.ok(training.every(o=>!HOLDOUT.some(c=>conditionKey(c)===conditionKey(o.conditions))));
  const result=e.predict();assert.equal(result.holdoutScore,100);assert.equal(result.predictions.length,4);
  assert.deepEqual(result.observations,training);assert.equal(result.credits,remaining);
  assert.equal(e.reveal().commitment,commitment);assert.equal(e.reveal().matches,true);
  local.push({fixture:i,trainingExperiments:training.length,heldOutCorrect:4});
 }
 ok(true,'24 separate local seeded fixtures complete four held-out combinations and verify their world commitments');
 // Negative controls: these must fail for semantic reasons, not a manifest mismatch.
 const wrongDecision={...decision,researchId:'00000000-0000-0000-0000-000000000000'};
 assert.throws(()=>parseResearchDecision(wrongDecision,record));
 const wrongChain=structuredClone(chain);wrongChain.receipt.logs=[];
 await assert.rejects(()=>verifyResearchEvidence(record,{fetcher:offlineFetch,rpc:rpcFrom(wrongChain)}));
 const wrongBody={...record,input:{...record.input,objective:record.input.objective+' forged'}};
 await assert.rejects(()=>verifyResearchEvidence(wrongBody,{fetcher:offlineFetch,rpc:rpcFrom(chain)}));
 ok(true,'Negative controls reject a substituted research ID, missing on-chain event and altered request body');
 let online=false;
 if(process.argv.includes('--online')){
  // Fixed public read-only destinations, never signing, sending or creating jobs.
  const call=async(method,params=[])=>{
   assert.ok(['eth_chainId','eth_blockNumber','eth_getTransactionByHash','eth_getTransactionReceipt'].includes(method));
   const r=await fetch('https://ethereum-rpc.publicnode.com',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),signal:AbortSignal.timeout(30000)});
   assert.ok(r.ok);const j=await r.json();assert.ok(!j.error&&j.result!==null);return j.result;
  };
  const fresh={chainId:await call('eth_chainId'),head:await call('eth_blockNumber'),transaction:await call('eth_getTransactionByHash',[record.txHash]),receipt:await call('eth_getTransactionReceipt',[record.txHash])};
  const safeFetch=async url=>{assert.ok(snapshots.has(String(url)));return fetch(url,{signal:AbortSignal.timeout(30000),redirect:'error'});};
  const current=await verifyResearchEvidence(record,{fetcher:safeFetch,rpc:rpcFrom(fresh)});
  ok(current.status==='verified'&&current.artifactHash===record.artifactHash,'Fresh read-only Ethereum RPC and official IMD API confirm the same request and artifact');
  online=true;
 }
 console.log(JSON.stringify({passed:true,mode:online?'offline plus fresh read-only provenance':'offline snapshots',checks,modelElimination:{before:19,after:14,excluded},localFixtures:local.length,paidImdResearchCycles:1,newPaidRequests:0,limits:['Offline Ethereum/API snapshots are not independently authenticated consensus proofs. Use --online for a fresh read-only RPC/API check.','The two historical measurements are recorded evidence. Their secret world opening is not published or reconstructed by this package.','Local held-out validation is within a known 24-model synthetic family, not an IMD intelligence benchmark.','GenesisResearch was deployed separately. This historical research request used direct Intake.']},null,2));
} catch(error){console.error('VERIFICATION FAILED:',error.message);process.exitCode=1;}
