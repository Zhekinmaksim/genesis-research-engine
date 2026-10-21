import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeFunctionData, encodeFunctionResult, hexToString, zeroAddress, zeroHash, type Abi, type Address, type EIP1193Provider } from 'viem';
import { Expedition } from './world.ts';
import { buildResearchJob } from './imd.ts';
import { prepareRegistry } from './registry.ts';
import { IMD_ASSET, IMD_INTAKE, IMD_JOB_ACTION_ID, type ImdPreflight } from '../shared/imd-types.ts';
import { inspectRegistry, registryAbi, registryIntakeAbi, registryTokenAbi, type RegistryReader, type ResearchPreflight } from '../shared/registry-types.ts';
import { intakeAbi, researchTransaction, submitResearchRequest } from '../src/lib/imd-wallet.ts';

const REGISTRY = `0x${'8'.repeat(40)}` as Address;
const OWNER = `0x${'1'.repeat(40)}` as Address;
const OTHER = `0x${'9'.repeat(40)}` as Address;
const PRICE = 500000000000000000n;
function preflight(): ImdPreflight {
  const state = new Expedition().state();
  return {
    action: 'job.open', input: buildResearchJob(state), check: { action: 'job.open', blockers: [] },
    checkedAt: Date.now(), revision: state.revision, expeditionId: state.id, worldCommitment: state.commitment,
    network: { chainId: 1, intake: IMD_INTAKE, asset: IMD_ASSET, amount: PRICE.toString(), actionId: IMD_JOB_ACTION_ID },
  };
}
function fixture(p: ImdPreflight, changes: Record<string, unknown> = {}) {
  const values: Record<string, unknown> = {
    owner: OWNER, intake: IMD_INTAKE, asset: IMD_ASSET, worldCommitment: p.worldCommitment,
    price: PRICE, spendCap: PRICE * 4n, spent: PRICE, remainingBudget: PRICE * 3n,
    pendingRequestId: zeroHash, usedBodies: false, researchers: false, balanceOf: PRICE, priceOf: PRICE, ...changes,
  };
  const calls: string[] = [];
  const reader: RegistryReader = {
    async getChainId() { calls.push('chain'); return (values.chainId as number | undefined) ?? 1; },
    async getCode() { calls.push('code'); return values.code === '0x' ? '0x' : '0x6001'; },
    async readContract({ functionName }) { calls.push(functionName); return values[functionName]; },
  };
  return { values, calls, reader };
}

test('unconfigured registry is explicit and performs no RPC reads', async () => {
  const p = preflight(), mock = fixture(p);
  assert.deepEqual(await prepareRegistry(p, { env: {}, client: mock.reader }), { status: 'unconfigured' });
  assert.deepEqual(mock.calls, []);
  const transaction = researchTransaction({ ...p, registry: { status: 'unconfigured' } });
  assert.equal(transaction.kind, 'direct');
  assert.equal(transaction.to, IMD_INTAKE);
  assert.equal(decodeFunctionData({ abi: intakeAbi, data: transaction.data }).functionName, 'request');
});

test('registry configuration verifies deployed state, exact body and current price without transactions', async () => {
  const p = preflight(), mock = fixture(p);
  const registry = await prepareRegistry(p, { env: { GENESIS_RESEARCH_CONTRACT: REGISTRY }, client: mock.reader });
  assert.equal(registry.status, 'ready');
  if (registry.status !== 'ready') throw new Error('not ready');
  assert.equal(registry.address, REGISTRY);
  assert.equal(registry.worldCommitment, p.worldCommitment);
  assert.equal(registry.price, p.network.amount);
  assert.equal(registry.remainingBudget, (PRICE * 3n).toString());
  assert.equal(registry.tokenBalance, PRICE.toString());
  const transaction = researchTransaction({ ...p, registry });
  assert.equal(transaction.kind, 'registry');
  assert.equal(transaction.to, REGISTRY);
  const decoded = decodeFunctionData({ abi: registryAbi, data: transaction.data });
  assert.equal(decoded.functionName, 'orderResearch');
  assert.equal(hexToString(decoded.args![0] as `0x${string}`), JSON.stringify(p.input));
  assert.equal(decoded.args![1], PRICE);
  assert.equal(mock.calls.includes('approve'), false);
});

test('configured registry fails closed for wrong world, protocol, chain, budget, pending job, replay or funding', async () => {
  const p = preflight();
  const cases: Array<[Record<string, unknown>, RegExp]> = [
    [{ chainId: 4663 }, /mainnet/], [{ code: '0x' }, /no deployed code/],
    [{ worldCommitment: `0x${'f'.repeat(64)}` }, /does not match/],
    [{ intake: OTHER }, /different Intake/], [{ asset: OTHER }, /different Intake/],
    [{ price: PRICE * 2n }, /price does not match/], [{ priceOf: PRICE + 1n }, /live Intake price changed/],
    [{ spent: PRICE * 5n }, /insufficient remaining/], [{ remainingBudget: PRICE - 1n }, /insufficient remaining/],
    [{ pendingRequestId: `0x${'a'.repeat(64)}` }, /pending research/], [{ usedBodies: true }, /already ordered/],
    [{ balanceOf: PRICE - 1n }, /needs IMD funding/],
  ];
  for (const [changes, message] of cases) {
    await assert.rejects(prepareRegistry(p, { env: { GENESIS_RESEARCH_CONTRACT: REGISTRY }, client: fixture(p, changes).reader }), message);
  }
  await assert.rejects(prepareRegistry(p, { env: { GENESIS_RESEARCH_CONTRACT: zeroAddress } }), /deployed research registry address/);
  await assert.rejects(prepareRegistry(p, { env: { GENESIS_RESEARCH_CONTRACT: REGISTRY } }), /GENESIS_RPC/);
});

test('reviewable registry calldata rejects modified body, world, stale metadata and blocked status', async () => {
  const p = preflight(), registry = await inspectRegistry(fixture(p).reader, REGISTRY, p);
  assert.throws(() => researchTransaction({ ...p, input: { ...p.input, objective: `${p.input.objective} Changed` }, registry }), /does not match/);
  assert.throws(() => researchTransaction({ ...p, worldCommitment: zeroHash, registry }), /does not match/);
  assert.throws(() => researchTransaction({ ...p, registry: { ...registry, checkedAt: Date.now() - 600_000 } }), /expired/);
  assert.throws(() => researchTransaction({ ...p, registry: { status: 'blocked' } } as unknown as ResearchPreflight), /not ready/);
});

function wallet(p: ImdPreflight, changes: Record<string, unknown> = {}, account: Address = OWNER, onEstimate?: (values: Record<string, unknown>) => void) {
  const mock = fixture(p, changes);
  const sent: Array<{ to: Address; data: `0x${string}` }> = [];
  const methods: string[] = [];
  const provider = { request: async ({ method, params }: { method: string; params?: unknown[] }) => {
    methods.push(method);
    if (method === 'eth_requestAccounts' || method === 'eth_accounts') return [account];
    if (method === 'eth_chainId') return '0x1';
    if (method === 'eth_getCode') return mock.reader.getCode({ address: REGISTRY });
    if (method === 'eth_call') {
      const { to, data } = params![0] as { to: Address; data: `0x${string}` };
      const abi: Abi = to.toLowerCase() === IMD_ASSET ? registryTokenAbi : to.toLowerCase() === IMD_INTAKE ? registryIntakeAbi : registryAbi;
      const decoded = decodeFunctionData({ abi, data });
      const result = await mock.reader.readContract({ address: to, abi, functionName: decoded.functionName!, args: decoded.args });
      return encodeFunctionResult({ abi, functionName: decoded.functionName, result });
    }
    if (method === 'eth_getBalance') return '0x10000000000000000';
    if (method === 'eth_estimateGas') { onEstimate?.(mock.values); return '0x30d40'; }
    if (method === 'eth_getBlockByNumber') return { number: '0x1', baseFeePerGas: '0x3b9aca00', transactions: [] };
    if (method === 'eth_maxPriorityFeePerGas') return '0x3b9aca00';
    if (method === 'eth_sendTransaction') {
      sent.push(params![0] as typeof sent[number]);
      return `0x${'a'.repeat(64)}`;
    }
    throw new Error(`Unexpected method ${method}`);
  } } as EIP1193Provider;
  return { ...mock, provider, sent, methods };
}

test('authorized registry wallet sends only orderResearch and never requests token approval', async () => {
  const p = preflight(), registry = await inspectRegistry(fixture(p).reader, REGISTRY, p);
  for (const [account, changes] of [[OWNER, {}], [OTHER, { researchers: true }]] as const) {
    const mock = wallet(p, changes, account);
    const submitted = await submitResearchRequest({ ...p, registry }, mock.provider);
    assert.equal(submitted.walletAddress.toLowerCase(), account);
    assert.equal(mock.sent.length, 1);
    assert.equal(mock.sent[0]!.to.toLowerCase(), REGISTRY);
    const decoded = decodeFunctionData({ abi: registryAbi, data: mock.sent[0]!.data });
    assert.equal(decoded.functionName, 'orderResearch');
    assert.equal(decoded.args![1], PRICE);
    assert.equal(mock.calls.includes('allowance'), false);
    assert.ok(mock.calls.filter(v => v === 'worldCommitment').length >= 2);
  }
});

test('wallet rechecks registry state before sending and never falls back to direct Intake', async () => {
  const p = preflight(), registry = await inspectRegistry(fixture(p).reader, REGISTRY, p);
  const cases: Array<[Record<string, unknown>, Address, RegExp]> = [
    [{}, OTHER, /not the registry owner/],
    [{ balanceOf: 0n }, OWNER, /needs IMD funding/],
    [{ price: PRICE + 1n }, OWNER, /price does not match/],
    [{ worldCommitment: zeroHash }, OWNER, /does not match/],
    [{ pendingRequestId: `0x${'b'.repeat(64)}` }, OWNER, /pending research/],
  ];
  for (const [changes, account, message] of cases) {
    const mock = wallet(p, changes, account);
    await assert.rejects(submitResearchRequest({ ...p, registry }, mock.provider), message);
    assert.deepEqual(mock.sent, []);
    assert.equal(mock.methods.includes('eth_sendTransaction'), false);
  }
});

test('registry changes during gas estimation prevent the final wallet send', async () => {
  const p = preflight(), registry = await inspectRegistry(fixture(p).reader, REGISTRY, p);
  const mock = wallet(p, {}, OWNER, values => { values.pendingRequestId = `0x${'d'.repeat(64)}`; });
  await assert.rejects(submitResearchRequest({ ...p, registry }, mock.provider), /pending research/);
  assert.deepEqual(mock.sent, []);
});
