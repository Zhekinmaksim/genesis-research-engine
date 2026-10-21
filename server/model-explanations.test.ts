import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { explainModelElimination } from '../shared/model-explanations';
import { ALL_CANDIDATE_MODELS, simulatePublicModelOutcome } from '../shared/reference-models';
import { CANDIDATES, modelOutcome } from './research';
import type { ExpeditionState } from '../shared/types';

const fixture=()=>JSON.parse(readFileSync(new URL('./fixtures/recorded-public.json',import.meta.url),'utf8')) as ExpeditionState;
test('reference predictions shown to reviewers match the engine for all 576 model/input pairs',()=>{
  assert.deepEqual(ALL_CANDIDATE_MODELS,CANDIDATES);
  for(const model of ALL_CANDIDATE_MODELS)for(const conditions of ALL_CANDIDATE_MODELS){
    assert.deepEqual(simulatePublicModelOutcome(model,conditions),modelOutcome(model,conditions));
  }
});
test('recorded experiment rules out exactly five identifiable models for measured contradictions',()=>{
  const state=fixture(),before=JSON.stringify(state);
  const analysis=explainModelElimination(state.observations);
  assert.equal(analysis.beforeCount,19);assert.equal(analysis.afterCount,14);
  assert.deepEqual(analysis.newlyEliminated.map(m=>m.index),[7,11,13,14,16]);
  assert.deepEqual(analysis.newlyEliminated.map(m=>m.comparison!.predicted.growth),[0,0,100,100,100]);
  for(const model of analysis.newlyEliminated){
    assert.equal(model.comparison!.observation.sequence,2);
    assert.equal(model.comparison!.observation.agentId,'imd');
    assert.equal(model.comparison!.observation.outcome.growth,50);
    assert.ok(model.comparison!.mismatches.includes('growth'));
  }
  assert.equal(analysis.models.filter(m=>m.status==='eliminated-before').length,5);
  assert.ok(analysis.models.filter(m=>m.compatible).every(m=>m.comparison!.mismatches.length===0));
  assert.equal(JSON.stringify(state),before,'explanations never modify the recorded archive');
});
test('earlier contradictions stay attributed to the original measurement and input order is preserved',()=>{
  const observations=fixture().observations.reverse(),ids=observations.map(o=>o.id);
  const analysis=explainModelElimination(observations);
  assert.deepEqual(analysis.newlyEliminated.map(m=>m.index),[7,11,13,14,16]);
  assert.ok(analysis.models.filter(m=>m.status==='eliminated-before').every(m=>m.comparison!.observation.sequence===1));
  assert.deepEqual(observations.map(o=>o.id),ids);
  const empty=explainModelElimination([]);assert.equal(empty.afterCount,24);assert.equal(empty.newlyEliminated.length,0);
});
