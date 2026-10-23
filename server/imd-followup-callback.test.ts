import test from 'node:test';
import assert from 'node:assert/strict';
import { keccak256, stringToHex } from 'viem';
import { IMD_INTAKE } from '../shared/imd-types';
import { verifyFollowupCallbackFacts, type FollowupCallbackFacts } from './imd-followup-callback';
function fixture():FollowupCallbackFacts {
  const resultHash='0x'+'c'.repeat(64),bodyHash='0x'+'b'.repeat(64),uri='ipfs://test/result.json',requestId='0x'+'a'.repeat(64);
  return {requestId,bodyHash,completion:{state:'confirmed',status:0,delivered:true,resultHash,uri,txHash:'0x'+'d'.repeat(64)},stored:{state:2,bodyHash,resultHash,uriHash:keccak256(stringToHex(uri)),intake:IMD_INTAKE},event:{requestId,resultHash,uri}};
}
test('callback binds protocol result-document hash independently of the artifact hash',()=>{
 const proof=verifyFollowupCallbackFacts(fixture());assert.equal(proof.delivered,true);assert.equal(proof.scientificAttestation,false);assert.equal(proof.resultDocumentKeccak256,'0x'+'c'.repeat(64));
});
test('an undelivered, substituted or cross-request callback cannot authorize measurement',()=>{
 const changed=fixture();changed.completion.delivered=false;assert.throws(()=>verifyFollowupCallbackFacts(changed),/delivered/);
 const wrongBody=fixture();wrongBody.stored.bodyHash='0x'+'0'.repeat(64);assert.throws(()=>verifyFollowupCallbackFacts(wrongBody),/do not match/);
 const wrongId=fixture();wrongId.event.requestId='0x'+'f'.repeat(64);assert.throws(()=>verifyFollowupCallbackFacts(wrongId),/do not match/);
 const wrongHash=fixture();wrongHash.stored.resultHash='0x'+'e'.repeat(64);assert.throws(()=>verifyFollowupCallbackFacts(wrongHash),/do not match/);
 const wrongIntake=fixture();wrongIntake.stored.intake='0x'+'1'.repeat(40);assert.throws(()=>verifyFollowupCallbackFacts(wrongIntake),/do not match/);
});
