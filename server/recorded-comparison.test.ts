import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {compareRecordedResearch} from './recorded-comparison';
import {decideExperiment,candidatesFor,modelOutcome} from './research';
import {USER_SCENARIO} from '../shared/user-scenario';
import type {ExpeditionState} from '../shared/types';
const fixture=()=>JSON.parse(readFileSync(new URL('./fixtures/recorded-public.json',import.meta.url),'utf8')) as ExpeditionState;
test('comparison uses only the first observation and reproduces the next Kepler choice without changing the archive',()=>{
 const state=fixture(),before=JSON.stringify(state);const c=compareRecordedResearch(state);
 assert.equal(c.baseline.compatibleModels,19);assert.equal(c.baseline.availableExperiments,19);
 assert.equal(c.baseline.observations.length,1);assert.equal(c.baseline.defaultNextLocalResearcher,'kepler');
 for(let turn=0;turn<3;turn++)assert.deepEqual(c.localChoices[turn]!.conditions,decideExperiment([state.observations[0]!],turn)!.conditions);
 assert.deepEqual(c.localChoices[1]!.conditions,c.imd.conditions);assert.equal(c.interpretation.defaultChoiceMatchesImd,true);
 assert.equal(JSON.stringify(state),before);
});
test('uniform model-weighted expectation is distinct from the recorded outcome and no counterfactual measurement is invented',()=>{
 const state=fixture(),c=compareRecordedResearch(state),models=candidatesFor([state.observations[0]!]);
 for(const choice of [c.imd,...c.localChoices]){
  assert.equal(choice.branches.reduce((n,b)=>n+b.modelCount,0),19);
  for(const b of choice.branches)assert.equal(models.filter(m=>JSON.stringify(modelOutcome(m,choice.conditions))===JSON.stringify(b.outcome)).length,b.modelCount);
  assert.deepEqual(choice.expectedRemainingFraction,{numerator:209,denominator:19});assert.equal(choice.expectedRemainingModels,11);
 }
 assert.deepEqual(c.imd.branches.map(b=>[b.outcome.growth,b.modelCount]),[[0,2],[50,14],[100,3]]);
 assert.equal(c.imd.actualRemainingModels,14);assert.equal(c.imd.actualEliminatedModels,5);
 assert.deepEqual(c.imd.excludedModelIds,[7,11,13,14,16]);
 assert.ok(c.localChoices.every(x=>x.measuredSeparately===false&&!Object.hasOwn(x,'measuredOutcome')));
 assert.equal(c.information.equalInformation,false);
});
test('comparison rejects substituted research and does not read extra private fields or infer an opening',()=>{
 const state=fixture();Object.assign(state,{seed:'must-not-be-read',salt:'must-not-be-read'});
 const text=JSON.stringify(compareRecordedResearch(state));assert.ok(!text.includes('must-not-be-read'));
 state.researchRequests.find(r=>r.status==='applied')!.artifactHash='0'.repeat(64);assert.throws(()=>compareRecordedResearch(state));
});
test('learning scenario enters the recorded prediction and distinguishes a free new world from the historical run',()=>{
 assert.equal(USER_SCENARIO.steps.length,3);assert.equal(USER_SCENARIO.recordedWalkthrough,'/replay?view=text');
 assert.ok(USER_SCENARIO.transfer.action.includes('Your experiment'));
 assert.ok(USER_SCENARIO.transfer.cost.includes('No wallet'));
 assert.ok(USER_SCENARIO.transfer.limit.includes('not a continuation'));
});
