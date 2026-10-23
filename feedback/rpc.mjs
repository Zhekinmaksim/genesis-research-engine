// Read-only verifier transport. No wallet, dotenv, signing, or RPC writes.
export const DEFAULT_RPC = 'https://ethereum-rpc.publicnode.com';
export const READ_METHODS = new Set(['eth_chainId','eth_blockNumber','eth_call','eth_getCode','eth_getTransactionByHash','eth_getTransactionReceipt']);
export class VerificationAccessError extends Error {
 constructor(kind,message){super(message);this.name='VerificationAccessError';this.kind=kind;}
}
export function parseOptions(args,env={}) {
 let online=false,help=false;const urls=[];
 for(let i=0;i<args.length;i++){
  const a=args[i];
  if(a==='--online')online=true;
  else if(a==='--help'||a==='-h')help=true;
  else if(a==='--rpc'){if(!args[i+1]||args[i+1].startsWith('--'))throw Error('--rpc requires an Ethereum HTTPS URL.');urls.push(args[++i]);}
  else throw Error('Unknown option. Use --help.');
 }
 if(online&&!urls.length&&env.GENESIS_VERIFY_RPC_URL)urls.push(env.GENESIS_VERIFY_RPC_URL);
 if(urls.length&&!online&&!help)throw Error('Use --online with --rpc or GENESIS_VERIFY_RPC_URL. Offline mode never contacts an RPC.');
 if(urls.length>4)throw Error('At most four RPC candidates are supported.');
 const checked=urls.map(value=>{
  let u;try{u=new URL(value);}catch{throw Error('Invalid RPC URL. Its value has been withheld.');}
  if(u.username||u.password||u.hash||!(u.protocol==='https:'||u.protocol==='http:'&&['127.0.0.1','[::1]','localhost'].includes(u.hostname)))throw Error('Use HTTPS for public RPCs or HTTP on numeric loopback/localhost, without userinfo or a fragment.');
  return u.href;
 });
 return {online,help,urls:checked.length?checked:[DEFAULT_RPC]};
}
export function makeRpcReader(urls,{fetcher=fetch,timeoutMs=20000}={}) {
 const validated=new Set(),pendingValidation=new Map();
 const diagnostics={configuredProviders:urls.length,usedProviderIndexes:new Set(),failures:[],terminalFailures:[],lastFailure:null};
 const classify=(method,error)=>{
  if(error instanceof VerificationAccessError)return error;
  return new VerificationAccessError('rpc_transport_unavailable','Ethereum RPC transport is unavailable.');
 };
 async function single(index,method,params){
  try{
   const response=await fetcher(urls[index],{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),redirect:'error',signal:AbortSignal.timeout(timeoutMs)});
   if(!response.ok)throw new VerificationAccessError('rpc_transport_unavailable',`RPC candidate ${index+1} returned HTTP ${response.status}.`);
   const j=await response.json();
   if(j.error){
    const historical=['eth_call','eth_getCode'].includes(method)&&/missing trie|historical|archive|pruned|state.*(unavailable|not available)|old state|history/i.test(String(j.error.message));
    throw new VerificationAccessError(historical?'historical_state_unavailable':'rpc_read_unavailable',historical?'Historical Ethereum state is unavailable from this RPC.':'The RPC could not complete a read.');
   }
   if(!Object.hasOwn(j,'result'))throw new VerificationAccessError('rpc_read_unavailable','RPC response has no result.');
   diagnostics.usedProviderIndexes.add(index+1);return j.result;
  }catch(error){throw classify(method,error);}
 }
 async function identity(index){
  if(validated.has(index))return;
  if(!pendingValidation.has(index))pendingValidation.set(index,(async()=>{
   const id=await single(index,'eth_chainId',[]);
   if(id!=='0x1')throw new VerificationAccessError('wrong_chain','The configured RPC is not Ethereum mainnet.');
   validated.add(index);
  })());
  try{await pendingValidation.get(index);}finally{pendingValidation.delete(index);}
 }
 async function request({method,params=[]}){
  if(!READ_METHODS.has(method))throw new VerificationAccessError('write_refused','The verifier refuses every non-read-only RPC method.');
  for(let index=0;index<urls.length;index++){
   try{await identity(index);const result=method==='eth_chainId'?'0x1':await single(index,method,params);diagnostics.lastFailure=null;return result;}
   catch(error){const failure=classify(method,error);diagnostics.lastFailure={kind:failure.kind,method,providerIndex:index+1};diagnostics.failures.push({...diagnostics.lastFailure});}
  }
  diagnostics.terminalFailures.push({...diagnostics.lastFailure});
  const kind=diagnostics.lastFailure?.kind||'rpc_transport_unavailable';
  throw new VerificationAccessError(kind,'No configured Ethereum RPC could verify this read. No snapshot was substituted for an online read.');
 }
 return {request,diagnostics};
}
