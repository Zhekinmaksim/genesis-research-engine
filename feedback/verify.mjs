// Default mode uses only the saved public evidence. --online reads public RPC/API.
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {parseOptions,makeRpcReader,VerificationAccessError} from './rpc.mjs';
let options;try{options=parseOptions(process.argv.slice(2),{GENESIS_VERIFY_RPC_URL:process.env.GENESIS_VERIFY_RPC_URL});}catch(error){console.error(error.message);process.exit(64);}
if(options.help){console.log('node verify.mjs [--online] [--rpc HTTPS_URL] [--rpc FALLBACK_HTTPS_URL]\nEnvironment alternative: GENESIS_VERIFY_RPC_URL. No wallet or payment. Offline is always checked first. Exit 2: online unavailable; exit 3: evidence mismatch. RPC URLs and credentials are never printed.');process.exit(0);}
import {verifyRealLoop,verifyResearchEvidence,createPublicClient,custom,http,parseAbi,decodeEventLog,verifyFollowupCallbackFacts,formatEther} from './engine.mjs';
const read=path=>readFile(new URL(path,import.meta.url));
const json=async path=>JSON.parse(await read(path));
const sha=b=>createHash('sha256').update(b).digest('hex');
const manifest=await json('manifest.json');for(const [file,hash]of Object.entries(manifest.files)){assert.match(file,/^[a-zA-Z0-9_./-]+$/);assert.ok(!file.split('/').includes('..'));assert.equal(sha(await read(file)),hash,file);}
const d=await json('continuation-public.json'),originalBytes=await read('recorded-world.json');assert.equal(sha(originalBytes),d.parentArchiveSha256);
const original=JSON.parse(originalBytes),{record,observation,before,after}=verifyRealLoop(d,original);
const snapshots=await json('snapshots.json');
const allowed=new Set(['eth_chainId','eth_blockNumber','eth_call','eth_getCode','eth_getTransactionByHash','eth_getTransactionReceipt']);
const offlineRpc=createPublicClient({transport:custom({request:async({method,params})=>{assert.ok(allowed.has(method));const key=JSON.stringify({method,params:params||[]});assert.ok(Object.hasOwn(snapshots.rpc,key),'Missing RPC snapshot');return snapshots.rpc[key];}})});
const offlineFetch=async url=>{assert.ok(Object.hasOwn(snapshots.api,String(url)),'Missing official API snapshot');return new Response(Buffer.from(snapshots.api[String(url)],'base64'),{status:200})};
async function verifyProvenance(rpc,fetcher){
const verified=await verifyResearchEvidence(record,{rpc,fetcher});assert.equal(verified.status,'verified');assert.equal(verified.artifactHash,record.artifactHash);assert.deepEqual(verified.decision,record.decision);
const receipt=await rpc.getTransactionReceipt({hash:d.callback.transaction});assert.equal(receipt.status,'success');assert.ok(await rpc.getBlockNumber()>=receipt.blockNumber+3n);
const abi=parseAbi(['function requests(bytes32) view returns(bytes32 bodyHash,bytes32 resultHash,bytes32 uriHash,address intake,uint64 requestedAt,uint8 state)','event ResearchResult(bytes32 indexed requestId,bytes32 resultHash,string uri)']);
const stored=await rpc.readContract({address:record.registryAddress,abi,functionName:'requests',args:[record.evidence.requestId],blockNumber:receipt.blockNumber});
const events=receipt.logs.flatMap(l=>{if(l.address.toLowerCase()!==record.registryAddress.toLowerCase())return[];try{const e=decodeEventLog({abi,data:l.data,topics:l.topics});return e.eventName==='ResearchResult'&&e.args.requestId===record.evidence.requestId?[e.args]:[]}catch{return[]}});assert.equal(events.length,1);
const facts={...d.callbackFacts,stored:{bodyHash:stored[0],resultHash:stored[1],uriHash:stored[2],intake:stored[3],state:stored[5]},event:events[0]};assert.deepEqual(verifyFollowupCallbackFacts(facts),d.callback);
let gas=0n;for(const t of d.payment.transactions){const r=await rpc.getTransactionReceipt({hash:t.hash});assert.equal(r.status,'success');gas+=r.gasUsed*r.effectiveGasPrice;assert.equal(String(r.gasUsed*r.effectiveGasPrice),t.receipt.feeWei);}assert.ok(gas<=250000000000000n);assert.equal(formatEther(gas),d.payment.aggregateActualGasEth);return gas;
}
const gas=await verifyProvenance(offlineRpc,offlineFetch);
for(const mutate of [x=>{x.callbackFacts.completion.delivered=false},x=>{x.callbackFacts.event.requestId='0x'+'0'.repeat(64)},x=>{x.state.observations[2].conditions.water=!x.state.observations[2].conditions.water},x=>{x.payment.transactions.find(t=>t.kind==='order').hash='0x'+'0'.repeat(64)},x=>{x.state.seed='must-never-be-public'}]){const altered=structuredClone(d);mutate(altered);assert.throws(()=>verifyRealLoop(altered,original));}
const report={passed:true,mode:'offline_saved_public_evidence',researchId:record.id,artifactSha256:record.artifactHash,authenticatedCallback:true,previousMeasurementCarried:true,modelsBefore:before,modelsAfter:after,observedGrowth:observation.outcome.growth,aggregateActualGasEth:formatEther(gas),negativeControls:5,newPayments:0,offline:{status:'verified',passed:true},online:{status:'not_requested'},boundary:'Provenance and local candidate arithmetic are checked. The hidden opening is not released, so the saved simulator measurement is not independently regenerated. No superiority claim.'};
if(options.online){
 const transport=makeRpcReader(options.urls);
 const rpc=createPublicClient({transport:custom({request:transport.request},{retryCount:0})});
 let apiUnavailable=false;
 const officialFetch=async(input,init)=>{
  if(!String(input).startsWith('https://api.imd.fun/')||init?.method&&init.method!=='GET')throw Error('Only the official IMD API may be read.');
  try{const r=await fetch(input,{...init,redirect:'error'});if(!r.ok)apiUnavailable=true;return r;}catch{apiUnavailable=true;throw new VerificationAccessError('imd_api_unavailable','Official IMD API is unavailable.');}
 };
 try{await verifyProvenance(rpc,officialFetch);report.mode='fresh_public_read_only';report.online={status:'verified',passed:true,rpcCandidates:options.urls.length,usedProviderIndexes:[...transport.diagnostics.usedProviderIndexes]};}
 catch(error){
  const failure=transport.diagnostics.terminalFailures.at(-1);
  const unavailable=Boolean(failure)||apiUnavailable||error?.status===503;
  report.passed=false;report.mode='offline_verified_online_'+(unavailable?'unconfirmed':'failed');
  report.online={status:unavailable?'unconfirmed':'failed',passed:false,reason:failure?.kind||(apiUnavailable?'imd_api_unavailable':unavailable?'historical_state_unavailable':'evidence_mismatch'),rpcCandidates:options.urls.length,failedRead:failure?.method,providerIndex:failure?.providerIndex,message:unavailable?'Saved evidence passed offline. Fresh online verification was not established; no saved RPC response was used as a fallback.':'Fresh data did not satisfy the evidence checks. Offline success does not override this failure.'};process.exitCode=unavailable?2:3;
 }
}
console.log(JSON.stringify(report,null,2));
