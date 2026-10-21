import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { encodeAbiParameters, encodeEventTopics, encodeFunctionData, keccak256, stringToHex, zeroAddress, type Hex } from 'viem';
import { Expedition } from './world.ts';
import { preflightResearch } from './imd.ts';
import { parseResearchDecision, researchIntakeAbi, researchRegistryEvidenceAbi, verifyResearchEvidence, type ResearchRpc } from './research-evidence.ts';
import { IMD_API_ORIGIN, IMD_ASSET, IMD_INTAKE, IMD_JOB_ACTION_ID, type ImdResearchRecord } from '../shared/imd-types.ts';
import { TRAINING } from './research.ts';

const txHash = `0x${'a'.repeat(64)}` as Hex;
const requestId = `0x${'b'.repeat(64)}` as Hex;
const blockHash = `0x${'c'.repeat(64)}` as Hex;
const payer = `0x${'1'.repeat(40)}` as Hex;
const jobId = '00000000-0000-0000-0000-000000000001';
async function prepare(world = new Expedition('provenance-fixture')) {
  const calls: string[] = [];
  const fetcher = (async (url: string | URL | Request) => {
    calls.push(String(url));
    return Response.json(calls.length === 1 ? { onchain: { chains: [{ chainId: 1, intake: IMD_INTAKE, asset: IMD_ASSET, actions: [{ action: 'job.open', version: 'job-1', actionId: IMD_JOB_ACTION_ID, amount: '500000000000000000' }] }] } } : { action: 'job.open', blockers: [] });
  }) as typeof fetch;
  const preflight = await preflightResearch(world.state(), fetcher, 'Does water improve growth?');
  const record = world.recordResearchPreflight(preflight);
  return { world, record, preflight, calls };
}
function fixture(record: ImdResearchRecord) {
  const body = stringToHex(JSON.stringify(record.input));
  const data = encodeFunctionData({ abi: researchIntakeAbi, functionName: 'request', args: [IMD_JOB_ACTION_ID, body, { target: zeroAddress, selector: '0x00000000' }, IMD_ASSET, BigInt(record.network.amount)] });
  const topics = encodeEventTopics({ abi: researchIntakeAbi, eventName: 'Requested', args: { requestId, payer, action: IMD_JOB_ACTION_ID } }) as Hex[];
  const log = { address: IMD_INTAKE, logIndex: 7, topics, data: encodeAbiParameters([{ type: 'bytes' }, { type: 'address' }, { type: 'bytes4' }, { type: 'address' }, { type: 'uint256' }], [body, zeroAddress, '0x00000000', IMD_ASSET, BigInt(record.network.amount)]) };
  const rpc: ResearchRpc = {
    getChainId: async () => 1,
    getTransaction: async () => ({ hash: txHash, to: IMD_INTAKE, from: payer, input: data, blockNumber: 100n, blockHash }),
    getTransactionReceipt: async () => ({ transactionHash: txHash, status: 'success', blockNumber: 100n, blockHash, logs: [log] }),
    getBlockNumber: async () => 103n,
  };
  const decision = { expeditionId: record.expeditionId, worldCommitment: record.worldCommitment, revision: record.revision, researchId: record.id, hypothesis: record.hypothesis, hypothesisAssessment: 'No controlled evidence yet; compare water at otherwise fixed conditions.', conditions: TRAINING[0]!, reason: 'Measure the initial water response.' };
  const raw = Buffer.from(JSON.stringify(decision));
  const hash = createHash('sha256').update(raw).digest('hex');
  const intake = { chainId: 1, transactionHash: txHash, entries: [{ logIndex: 7, requestId, intake: IMD_INTAKE, payer, action: 'job.open', actionVersion: 'job-1', state: 'admitted', admission: { result: { kind: 'job', jobId, statusUrl: `/jobs/${jobId}`, resultUrl: `/jobs/${jobId}/result` } } }] };
  const result = { jobId, complete: true, files: [{ name: 'decision', path: 'artifacts/decision.json', mediaType: 'application/json', hash, bytes: raw.length, submissionHash: 'd'.repeat(64), url: `${IMD_API_ORIGIN}/artifacts/${hash}` }] };
  const job: { id: string; state: string; blockedReason?: string } = { id: jobId, state: 'completed' };
  const calls: string[] = [];
  const fetcher = (async (url: string | URL | Request) => {
    const path = String(url); calls.push(path);
    if (path.includes('/intake/')) return Response.json(intake);
    if (path === `${IMD_API_ORIGIN}/jobs/${jobId}`) return Response.json(job);
    if (path === `${IMD_API_ORIGIN}/jobs/${jobId}/result`) return Response.json(result);
    if (path === `${IMD_API_ORIGIN}/artifacts/${hash}`) return new Response(raw);
    throw new Error('Unexpected URL');
  }) as typeof fetch;
  return { rpc, decision, intake, job, result, calls, fetcher, data, raw, log };
}

test('free hypothesis preflight persists without altering world identity, science revision or observations', async () => {
  const world = new Expedition('provenance-fixture'); const before = world.state();
  const { record, calls } = await prepare(world);
  assert.equal(world.state().revision, before.revision);
  assert.equal(world.state().commitment, before.commitment);
  assert.deepEqual(world.state().observations, before.observations);
  assert.equal(record.status, 'prepared');
  assert.match(record.input.objective, /Does water improve growth/);
  assert.equal(calls.length, 2); assert.ok(calls.every(x => x.endsWith('/capabilities') || x.endsWith('/check')));
  assert.deepEqual(Expedition.restore(world.serialize()).state(), world.state());
  const legacy = world.serialize() as Record<string, unknown>; delete legacy.researchRequests;
  assert.deepEqual(Expedition.restore(legacy).state().researchRequests, []);
});

test('verified transaction → admission → hash-checked artifact → one engine experiment → persisted journal', async () => {
  const { world, record } = await prepare();
  const attached = world.attachResearchTransaction(record.id, txHash);
  const f = fixture(attached);
  const verified = await world.refreshResearchRequest(record.id, f);
  assert.equal(verified.status, 'verified'); assert.equal(verified.evidence?.requestId, requestId);
  assert.deepEqual(f.calls, [`${IMD_API_ORIGIN}/intake/1/${txHash}`, `${IMD_API_ORIGIN}/jobs/${jobId}`, `${IMD_API_ORIGIN}/jobs/${jobId}/result`, `${IMD_API_ORIGIN}/artifacts/${f.result.files[0]!.hash}`]);
  const persisted = Expedition.restore(world.serialize());
  const result = persisted.applyResearchRequest(record.id);
  assert.equal(result.revision, 1); assert.equal(result.observations[0]!.agentId, 'imd');
  assert.equal(result.researchRequests[0]!.status, 'applied');
  assert.match(result.journal.at(-1)!.text, /artifact SHA-256/);
  assert.throws(() => persisted.applyResearchRequest(record.id), /already been executed/);
  assert.deepEqual(Expedition.restore(persisted.serialize()).state(), persisted.state());
});

test('arbitrary decisions, changed hypothesis, replayed transactions and stale world decisions cannot be applied', async () => {
  const { world, record } = await prepare();
  assert.throws(() => world.applyResearchRequest(record.id), /Verify the original/);
  world.attachResearchTransaction(record.id, txHash);
  const f = fixture(world.state().researchRequests[0]!);
  assert.throws(() => parseResearchDecision({ ...f.decision, hypothesis: 'another' }, record), /another research/);
  assert.throws(() => parseResearchDecision({ ...f.decision, injected: true }, record), /exact decision/);
  const second = await prepare(world);
  assert.throws(() => world.attachResearchTransaction(second.record.id, txHash), /already attached/);
  world.experiment(TRAINING[1]!);
  const refreshed = await world.refreshResearchRequest(record.id, f);
  assert.equal(refreshed.status, 'stale');
  assert.throws(() => world.applyResearchRequest(record.id), /Verify the original/);
  assert.equal(world.state().observations.length, 1);
});

test('transaction and artifact verification rejects mismatched body, missing event, foreign URLs and corrupt bytes', async () => {
  for (const attack of ['body', 'event', 'url', 'hash', 'admission'] as const) {
    const { world, record } = await prepare(); const attached = world.attachResearchTransaction(record.id, txHash); const f = fixture(attached);
    if (attack === 'body') { const original = f.rpc.getTransaction; f.rpc.getTransaction = async a => ({ ...await original(a), input: `${f.data.slice(0, -2)}00` as Hex }); }
    if (attack === 'event') { const original = f.rpc.getTransactionReceipt; f.rpc.getTransactionReceipt = async a => ({ ...await original(a), logs: [] }); }
    if (attack === 'url') f.result.files[0]!.url = 'http://127.0.0.1/secret';
    if (attack === 'hash') f.result.files[0]!.bytes++;
    if (attack === 'admission') f.intake.entries[0]!.requestId = `0x${'f'.repeat(64)}`;
    await assert.rejects(verifyResearchEvidence(attached, f));
    assert.equal(world.state().observations.length, 0);
    assert.ok(!f.calls.some(x => x.startsWith('http://')));
  }
});

test('same-length tampered artifact bytes fail their published hash and hypotheses are bounded before network work', async () => {
  const { world, record } = await prepare(); const attached = world.attachResearchTransaction(record.id, txHash); const f = fixture(attached);
  const fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
    if (String(url).includes('/artifacts/')) { const corrupt = Buffer.from(f.raw); corrupt[0] = 32; return new Response(corrupt); }
    return f.fetcher(url, init);
  }) as typeof fetch;
  await assert.rejects(verifyResearchEvidence(attached, { rpc: f.rpc, fetcher }), /published SHA-256/);
  let fetched = false;
  await assert.rejects(preflightResearch(world.state(), (async () => { fetched = true; throw new Error('must not fetch'); }) as typeof fetch, 'x'.repeat(1001)), /1,000/);
  assert.equal(fetched, false);
});

test('pending confirmations, delayed indexing and RPC outages do not fabricate a verified result', async () => {
  const { world, record } = await prepare(); const attached = world.attachResearchTransaction(record.id, txHash); const f = fixture(attached);
  f.rpc.getBlockNumber = async () => 101n;
  assert.equal((await world.refreshResearchRequest(record.id, f)).status, 'pending'); assert.equal(f.calls.length, 0);
  f.rpc.getBlockNumber = async () => 103n;
  const pending = await world.refreshResearchRequest(record.id, { rpc: f.rpc, fetcher: async () => new Response('', { status: 404 }) });
  assert.equal(pending.status, 'pending');
  f.rpc.getBlockNumber = async () => { throw new Error('offline'); };
  const unavailable = await world.refreshResearchRequest(record.id, f);
  assert.equal(unavailable.status, 'pending'); assert.match(unavailable.error!, /RPC is unavailable/);
  assert.equal(world.state().revision, 0); assert.equal(world.state().observations.length, 0);
});

test('oversized streamed responses are rejected and never become verified evidence', async () => {
  const { world, record } = await prepare(); const attached = world.attachResearchTransaction(record.id, txHash); const f = fixture(attached);
  await assert.rejects(verifyResearchEvidence(attached, { rpc: f.rpc, fetcher: async () => new Response('x'.repeat(48 * 1024 + 1)) }), /size limit/);
});

test('configured registry route binds bounded calldata, historical runtime, nested intake event and registry order', async () => {
  const { world, preflight } = await prepare();
  const registry = `0x${'2'.repeat(40)}` as Hex;
  const code = '0x60006000' as Hex;
  // A second fresh request represents trusted server-side registry preflight metadata.
  const next = await preflightResearch(world.state(), (async (url: string | URL | Request) => Response.json(String(url).endsWith('/capabilities') ? { onchain: { chains: [{ chainId: 1, intake: IMD_INTAKE, asset: IMD_ASSET, actions: [{ action: 'job.open', version: 'job-1', actionId: IMD_JOB_ACTION_ID, amount: preflight.network.amount }] }] } } : { action: 'job.open', blockers: [] })) as typeof fetch, 'Does water improve growth?');
  const record = world.recordResearchPreflight({ ...next, registryAddress: registry, registryCodeHash: keccak256(code) });
  const attached = world.attachResearchTransaction(record.id, txHash);
  const f = fixture(attached); const body = stringToHex(JSON.stringify(record.input)); const cost = BigInt(record.network.amount);
  const nested = { ...f.log, topics: encodeEventTopics({ abi: researchIntakeAbi, eventName: 'Requested', args: { requestId, payer: registry, action: IMD_JOB_ACTION_ID } }) as Hex[], data: encodeAbiParameters([{ type: 'bytes' }, { type: 'address' }, { type: 'bytes4' }, { type: 'address' }, { type: 'uint256' }], [body, registry, '0x4374622e', IMD_ASSET, cost]) };
  const order = { address: registry, logIndex: 8, topics: encodeEventTopics({ abi: researchRegistryEvidenceAbi, eventName: 'ResearchOrdered', args: { requestId, bodyHash: keccak256(body) } }) as Hex[], data: encodeAbiParameters([{ type: 'uint256' }], [cost]) };
  const tx = await f.rpc.getTransaction({ hash: txHash });
  f.rpc.getTransaction = async () => ({ ...tx, to: registry, input: encodeFunctionData({ abi: researchRegistryEvidenceAbi, functionName: 'orderResearch', args: [body, cost] }) });
  const receipt = await f.rpc.getTransactionReceipt({ hash: txHash });
  f.rpc.getTransactionReceipt = async () => ({ ...receipt, logs: [nested, order] });
  f.rpc.getCode = async ({ blockNumber }) => { assert.equal(blockNumber, 100n); return code; };
  f.rpc.readContract = async ({ functionName, blockNumber }) => { assert.equal(blockNumber, 100n); return functionName === 'intake' ? IMD_INTAKE : functionName === 'asset' ? IMD_ASSET : record.worldCommitment; };
  f.intake.entries[0]!.payer = registry;
  assert.equal((await verifyResearchEvidence(attached, f)).status, 'verified');
  f.rpc.getCode = async () => '0x6001';
  await assert.rejects(verifyResearchEvidence(attached, f), /runtime code/);
  f.rpc.getCode = async () => code;
  f.rpc.getTransactionReceipt = async () => ({ ...receipt, logs: [nested] });
  await assert.rejects(verifyResearchEvidence(attached, f), /ResearchOrdered/);
});

test('incorrect unverified hashes can be explicitly replaced with persistent bounded audit history', async () => {
  const { world, record } = await prepare();
  const wrong = `0x${'e'.repeat(64)}` as Hex;
  world.attachResearchTransaction(record.id, wrong);
  const offline = fixture(world.state().researchRequests[0]!);
  offline.rpc.getChainId = async () => { throw new Error('offline'); };
  await world.refreshResearchRequest(record.id, offline);
  assert.throws(() => world.attachResearchTransaction(record.id, txHash), /already bound/);
  const replaced = world.attachResearchTransaction(record.id, txHash, { replace: true });
  assert.equal(replaced.status, 'submitted'); assert.equal(replaced.txHash, txHash); assert.equal(replaced.error, undefined);
  assert.equal(replaced.txHistory?.[0]!.txHash, wrong); assert.match(replaced.txHistory![0]!.error!, /RPC chain identity/);
  assert.ok(replaced.txHistory![0]!.replacedAt >= replaced.txHistory![0]!.attachedAt);
  assert.deepEqual(Expedition.restore(world.serialize()).state().researchRequests, world.state().researchRequests);
  await world.refreshResearchRequest(record.id, fixture(replaced));
  assert.throws(() => world.attachResearchTransaction(record.id, wrong, { replace: true }), /authenticated/);
  world.applyResearchRequest(record.id);
  assert.throws(() => world.attachResearchTransaction(record.id, wrong, { replace: true }), /authenticated/);
  const next = await prepare(); next.world.attachResearchTransaction(next.record.id, wrong);
  for (let i = 0; i < 8; i++) next.world.attachResearchTransaction(next.record.id, `0x${String(i).repeat(64)}`, { replace: true });
  assert.throws(() => next.world.attachResearchTransaction(next.record.id, txHash, { replace: true }), /eight transaction replacements/);
});

test('terminal job statuses without accepted artifacts are surfaced, while working jobs remain pending', async () => {
  for (const state of ['blocked', 'failed', 'cancelled', 'running']) {
    const { world, record } = await prepare(); const attached = world.attachResearchTransaction(record.id, txHash); const f = fixture(attached);
    f.job.state = state; f.job.blockedReason = 'Worker could not produce a valid decision.';
    const fetcher = (async (url: string | URL | Request, init?: RequestInit) => String(url).endsWith('/result') ? new Response('', { status: 404 }) : f.fetcher(url, init)) as typeof fetch;
    const result = await world.refreshResearchRequest(record.id, { rpc: f.rpc, fetcher });
    assert.equal(result.status, state === 'running' ? 'pending' : 'failed');
    if (state !== 'running') assert.match(result.error!, /Worker could not produce a valid decision/);
    assert.equal(world.state().revision, 0); assert.equal(world.state().observations.length, 0);
  }
});

test('a late verification response cannot overwrite an explicitly replaced transaction', async () => {
  const { world, record } = await prepare(); const attached = world.attachResearchTransaction(record.id, txHash); const f = fixture(attached);
  let release!: () => void; const held = new Promise<void>(resolve => { release = resolve; });
  const original = f.rpc.getChainId; f.rpc.getChainId = async () => { await held; return original(); };
  const refreshing = world.refreshResearchRequest(record.id, f);
  const replacement = `0x${'e'.repeat(64)}` as Hex;
  world.attachResearchTransaction(record.id, replacement, { replace: true }); release();
  const latest = await refreshing;
  assert.equal(latest.txHash, replacement); assert.equal(latest.status, 'submitted'); assert.equal(latest.evidence, undefined);
});
