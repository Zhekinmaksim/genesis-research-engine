import { keccak256, stringToHex, zeroHash } from 'viem';
import { IMD_INTAKE } from '../shared/imd-types';
export interface FollowupCallbackFacts {
  requestId: string; bodyHash: string;
  completion: { state: string; status: number; delivered: boolean; resultHash: string; uri: string; txHash: string };
  stored: { bodyHash: string; resultHash: string; uriHash: string; intake: string; state: number };
  event: { requestId: string; resultHash: string; uri: string };
}
/** Result-document Keccak is distinct from decision-artifact SHA-256. No network or writes. */
export function verifyFollowupCallbackFacts(f: FollowupCallbackFacts) {
  const c=f.completion,s=f.stored,e=f.event;
  if(c.state!=='confirmed'||c.status!==0||c.delivered!==true||!/^0x[a-f0-9]{64}$/i.test(c.txHash)
    ||!/^0x[a-f0-9]{64}$/i.test(c.resultHash)||c.resultHash===zeroHash||!c.uri||c.uri.length>2048) throw new Error('A confirmed delivered success callback is required. No experiment was applied.');
  if(s.state!==2||s.bodyHash.toLowerCase()!==f.bodyHash.toLowerCase()||s.resultHash.toLowerCase()!==c.resultHash.toLowerCase()
    ||s.uriHash.toLowerCase()!==keccak256(stringToHex(c.uri))||s.intake.toLowerCase()!==IMD_INTAKE
    ||e.requestId.toLowerCase()!==f.requestId.toLowerCase()||e.resultHash.toLowerCase()!==c.resultHash.toLowerCase()||e.uri!==c.uri) throw new Error('The stored callback, event, body and IMD completion do not match. No experiment was applied.');
  return { requestId:f.requestId,bodyKeccak256:f.bodyHash,resultDocumentKeccak256:c.resultHash,uri:c.uri,transaction:c.txHash,delivered:true,scientificAttestation:false };
}
