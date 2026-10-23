import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { ExpeditionState } from '../shared/types';
import { buildImdFollowup } from './imd-followup';
const load = (): ExpeditionState => JSON.parse(readFileSync(new URL('./fixtures/recorded-public.json', import.meta.url), 'utf8'));
const id = '1bc48fd7-c805-4c65-a40c-1d68c5766012';
test('real follow-up receives the actual previous IMD proposal and later measurement without hidden state', () => {
  const state = load(), original = JSON.stringify(state);
  Object.assign(state, { seed: 'SECRET-SEED', salt: 'SECRET-SALT', opening: 'SECRET-OPENING', hiddenModel: 'SECRET-MODEL' });
  const plan = buildImdFollowup(state, id);
  assert.equal(plan.inputRevision, 2); assert.equal(plan.publicObservations.length, 2);
  assert.equal(plan.comparison.compatibleModelsBefore, 14); assert.equal(plan.comparison.localChoices.length, 3);
  assert.ok(plan.input.objective.includes('"resultOfPreviousProposal":{"sequence":2'));
  assert.ok(plan.input.objective.includes('Retaining it is acceptable'));
  assert.ok(!/SECRET-(SEED|SALT|OPENING|MODEL)/.test(plan.body));
  assert.equal(plan.status, 'prepared_only_no_payment_authorization');
  assert.ok(plan.route.mixedRoute); assert.equal(plan.researchId, id);
  assert.ok(plan.stopRules.some(r => r.includes('one additional paid job')));
  assert.ok(plan.input.objective.length < 8000); assert.ok(Buffer.byteLength(plan.body) < 16384);
  const clean = load(); buildImdFollowup(clean, id); assert.equal(JSON.stringify(clean), original);
});
test('follow-up refuses a stale or unbound historical record before any network request', () => {
  const state = load(); state.revision = 3;
  assert.throws(() => buildImdFollowup(state, id), /recorded world/);
  const wrong = load(); wrong.researchRequests.find(r => r.id === 'ec8cebff-9a12-42af-9bdf-70313db2be36')!.artifactHash = '0'.repeat(64);
  assert.throws(() => buildImdFollowup(wrong, id), /provenance/);
  assert.throws(() => buildImdFollowup(load(), 'ec8cebff-9a12-42af-9bdf-70313db2be36'), /distinct/);
});

test('standard request builder carries only a bound prior agent result and rejects swapped measurements', () => {
  const state = load();
  const record = state.researchRequests.find(r => r.id === 'ec8cebff-9a12-42af-9bdf-70313db2be36')!;
  record.decision!.conditions = { ...record.decision!.conditions, water: false };
  assert.throws(() => buildImdFollowup(state, id), /comparison|measured|water-only/);
});
