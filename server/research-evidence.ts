import { createHash } from 'node:crypto';
import { createPublicClient, decodeEventLog, decodeFunctionData, hexToBytes, http, keccak256, parseAbi, stringToHex, zeroAddress, type Abi, type Address, type Hex } from 'viem';
import { mainnet } from 'viem/chains';
import { IMD_API_ORIGIN, IMD_ASSET, IMD_INTAKE, IMD_JOB_ACTION_ID, type ImdResearchDecision, type ImdResearchRecord } from '../shared/imd-types.ts';
import { ImdApiError } from './imd.ts';
import { conditionKey, TRAINING } from './research.ts';

// Requested event ABI verified against the Ethereum intake's published source at
// https://eth.blockscout.com/address/0xa43e6f75ee006411f79ac1c84120606c2330de82?tab=contract
export const researchIntakeAbi = parseAbi([
  'function request(bytes32 action, bytes body, (address target, bytes4 selector) callback, address asset, uint256 amount) returns (bytes32 requestId)',
  'event Requested(bytes32 indexed requestId, address indexed payer, bytes32 indexed action, bytes body, address callbackTarget, bytes4 callbackSelector, address asset, uint256 amount)',
]);
export const researchRegistryEvidenceAbi = parseAbi([
  'function orderResearch(bytes body, uint256 expectedPrice) returns (bytes32 requestId)',
  'function intake() view returns (address)', 'function asset() view returns (address)', 'function worldCommitment() view returns (bytes32)',
  'event ResearchOrdered(bytes32 indexed requestId, bytes32 indexed bodyHash, uint256 amount)',
]);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const hexHash = /^0x[0-9a-f]{64}$/i;
const fileHash = /^[0-9a-f]{64}$/i;
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
function fail(text: string): never { throw new ImdApiError(text, 422); }
export const researchBodyHash = (input: unknown) => createHash('sha256').update(JSON.stringify(input)).digest('hex');

export function parseResearchDecision(value: unknown, record: ImdResearchRecord): ImdResearchDecision {
  const keys = ['expeditionId', 'worldCommitment', 'revision', 'researchId', 'hypothesis', 'hypothesisAssessment', 'conditions', 'reason'];
  if (!object(value) || Object.keys(value).length !== keys.length || keys.some(k => !Object.hasOwn(value, k))) fail('The IMD artifact must match the exact decision schema.');
  const v = value as Record<string, unknown>;
  if (v.expeditionId !== record.expeditionId || v.worldCommitment !== record.worldCommitment || v.revision !== record.revision || v.researchId !== record.id || v.hypothesis !== record.hypothesis) fail('The IMD artifact belongs to another research request or world revision.');
  for (const [key, limit] of [['reason', 500], ['hypothesisAssessment', 1000]] as const) {
    if (typeof v[key] !== 'string' || !v[key].trim() || v[key].length > limit || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v[key])) fail(`The IMD artifact has an invalid ${key}.`);
  }
  const c = v.conditions;
  if (!object(c) || Object.keys(c).length !== 4 || typeof c.water !== 'boolean' || !['none', 'basalt', 'quartz'].includes(String(c.mineral)) || !['amber', 'blue'].includes(String(c.light)) || !['cool', 'warm'].includes(String(c.temperature))) fail('The IMD artifact has invalid experiment conditions.');
  // Validate against the public request, not the engine's hidden answer.
  const evidence = JSON.parse(record.input.objective.split('<public_evidence>\n')[1]!.split('\n</public_evidence>')[0]!) as { availableExperiments: unknown[] };
  if (!TRAINING.some(x => conditionKey(x) === conditionKey(c as never)) || !evidence.availableExperiments.some(x => object(x) && conditionKey(x as never) === conditionKey(c as never))) fail('The IMD artifact selected an unavailable or held-out experiment.');
  return structuredClone(v) as unknown as ImdResearchDecision;
}

export async function limitedResponseBytes(response: Response, limit: number): Promise<Uint8Array> {
  if (Number(response.headers.get('content-length')) > limit) throw new ImdApiError('IMD response exceeds the evidence size limit.');
  const reader = response.body?.getReader();
  if (!reader) throw new ImdApiError('IMD returned an empty response.');
  const chunks: Uint8Array[] = []; let length = 0;
  try {
    while (true) {
      const part = await reader.read(); if (part.done) break;
      length += part.value.length;
      if (length > limit) { await reader.cancel(); throw new ImdApiError('IMD response exceeds the evidence size limit.'); }
      chunks.push(part.value);
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks);
}
async function api(path: string, fetcher: typeof fetch, raw = false): Promise<unknown | null> {
  let response: Response;
  try { response = await fetcher(`${IMD_API_ORIGIN}${path}`, { headers: { Accept: raw ? 'application/octet-stream' : 'application/json' }, signal: AbortSignal.timeout(20_000), redirect: 'error' }); }
  catch { throw new ImdApiError('IMD evidence service is unavailable; retry status without paying again.', 503); }
  if (response.status === 404) return null;
  if (!response.ok) throw new ImdApiError(`IMD evidence service returned HTTP ${response.status}.`, 502);
  const bytes = await limitedResponseBytes(response, raw ? 16 * 1024 : 48 * 1024);
  if (raw) return bytes;
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { throw new ImdApiError('IMD evidence service returned invalid JSON.'); }
}
export interface ResearchRpc {
  getChainId(): Promise<number>;
  getTransaction(args: { hash: Hex }): Promise<{ hash: Hex; to: string | null; from: string; input: Hex; blockNumber: bigint | null; blockHash: string | null }>;
  getTransactionReceipt(args: { hash: Hex }): Promise<{ transactionHash: Hex; status: string; blockNumber: bigint; blockHash: string; logs: Array<{ address: string; data: Hex; topics: readonly Hex[]; logIndex: number | null }> }>;
  getBlockNumber(): Promise<bigint>;
  getCode?(args: { address: Address; blockNumber: bigint }): Promise<Hex | undefined>;
  readContract?(args: { address: Address; abi: Abi; functionName: string; blockNumber: bigint }): Promise<unknown>;
}
export interface ResearchEvidenceOptions { fetcher?: typeof fetch; rpc?: ResearchRpc }

/** Read-only provenance verification. No client supplied artifact or URL is accepted.
 * Trust boundary: Ethereum RPC for inclusion + official IMD HTTPS API for admission
 * and accepted files. A job file is NOT an oracle attestation of scientific truth.
 */
export async function verifyResearchEvidence(record: ImdResearchRecord, options: ResearchEvidenceOptions = {}): Promise<Partial<ImdResearchRecord>> {
  if (!record.txHash || !hexHash.test(record.txHash)) throw new ImdApiError('Attach a transaction hash before checking research.', 400);
  if (researchBodyHash(record.input) !== record.bodyHash) fail('The stored research body was modified.');
  const fetcher = options.fetcher ?? fetch;
  const rpc: ResearchRpc = options.rpc ?? createPublicClient({ chain: mainnet, transport: http(process.env.IMD_ETHEREUM_RPC_URL?.trim() || process.env.GENESIS_RPC?.trim() || undefined, { timeout: 20_000, retryCount: 0 }) });
  let chainId: number;
  try { chainId = await rpc.getChainId(); } catch { throw new ImdApiError('Ethereum RPC chain identity is unavailable. Retry without paying again.', 503); }
  if (chainId !== 1) fail('Research evidence must be verified on Ethereum mainnet.');
  let tx: Awaited<ReturnType<ResearchRpc['getTransaction']>>, receipt: Awaited<ReturnType<ResearchRpc['getTransactionReceipt']>>, head: bigint;
  try { [tx, receipt, head] = await Promise.all([rpc.getTransaction({ hash: record.txHash }), rpc.getTransactionReceipt({ hash: record.txHash }), rpc.getBlockNumber()]); }
  catch { throw new ImdApiError('Ethereum transaction is not yet available or RPC is unavailable. Retry without paying again.', 503); }
  if (receipt.status !== 'success') fail('The attached Ethereum transaction reverted.');
  const registry = record.registryAddress?.toLowerCase() as Address | undefined;
  if (tx.hash.toLowerCase() !== record.txHash.toLowerCase() || receipt.transactionHash.toLowerCase() !== record.txHash.toLowerCase() || tx.to?.toLowerCase() !== (registry ?? IMD_INTAKE) || tx.blockHash !== receipt.blockHash || tx.blockNumber !== receipt.blockNumber) fail('The attached transaction does not match the prepared research route and receipt.');
  if (head < receipt.blockNumber + 3n) return { status: 'pending', error: 'Waiting for three Ethereum confirmation blocks.', checkedAt: Date.now() };
  const expectedBody = Buffer.from(JSON.stringify(record.input), 'utf8');
  const action = IMD_JOB_ACTION_ID, body = stringToHex(JSON.stringify(record.input)), amount = BigInt(record.network.amount);
  const expectedPayer = registry ?? tx.from.toLowerCase();
  const callbackTarget = registry ?? zeroAddress, callbackSelector = registry ? '0x4374622e' : '0x00000000';
  try {
    if (registry) {
      const decoded = decodeFunctionData({ abi: researchRegistryEvidenceAbi, data: tx.input });
      if (decoded.functionName !== 'orderResearch' || decoded.args[0] !== body || decoded.args[1] !== amount) fail('The registry call does not contain the exact research body and expected price.');
      if (!rpc.getCode || !rpc.readContract || !record.registryCodeHash) fail('Historical registry identity cannot be verified by this RPC.');
      let historical: unknown[];
      try { historical = await Promise.all([
        rpc.getCode({ address: registry, blockNumber: receipt.blockNumber }),
        ...['intake', 'asset', 'worldCommitment'].map(functionName => rpc.readContract!({ address: registry, abi: researchRegistryEvidenceAbi, functionName, blockNumber: receipt.blockNumber })),
      ]); } catch { throw new ImdApiError('Historical Ethereum registry state is unavailable from this RPC. Choose an archive-capable endpoint; no fresh verification has been established.', 503); }
      const [code, intake, asset, world] = historical;
      if (typeof code !== 'string' || code === '0x' || keccak256(code as Hex) !== record.registryCodeHash || String(intake).toLowerCase() !== IMD_INTAKE || String(asset).toLowerCase() !== IMD_ASSET || String(world).toLowerCase() !== record.worldCommitment.toLowerCase()) fail('The registry runtime code or world configuration differs from its prepared identity.');
    } else {
      const decoded = decodeFunctionData({ abi: researchIntakeAbi, data: tx.input });
      const [callAction, callBody, callback, asset, callAmount] = decoded.args;
      if (callAction !== action || !Buffer.from(hexToBytes(callBody)).equals(expectedBody) || callback.target !== zeroAddress || callback.selector !== '0x00000000' || asset.toLowerCase() !== IMD_ASSET || callAmount !== amount) fail('The transaction does not contain this exact prepared research body and payment.');
    }
  } catch (error) { if (error instanceof ImdApiError) throw error; return fail('The transaction is not a supported bounded research request or its historical registry cannot be verified.'); }
  const matching = receipt.logs.flatMap(log => {
    if (log.address.toLowerCase() !== IMD_INTAKE) return [];
    try {
      const event = decodeEventLog({ abi: researchIntakeAbi, eventName: 'Requested', data: log.data, topics: log.topics as [Hex, ...Hex[]], strict: true });
      const a = event.args;
      return a.action === action && a.body === body && a.asset.toLowerCase() === IMD_ASSET && a.amount === amount && a.payer.toLowerCase() === expectedPayer && a.callbackTarget.toLowerCase() === callbackTarget && a.callbackSelector === callbackSelector ? [{ log, args: a }] : [];
    } catch { return []; }
  });
  if (matching.length !== 1 || matching[0]!.log.logIndex === null) fail('A unique matching IMD Requested event was not found.');
  const { log, args } = matching[0]!;
  if (registry) {
    const ordered = receipt.logs.some(log => {
      if (log.address.toLowerCase() !== registry) return false;
      try {
        const event = decodeEventLog({ abi: researchRegistryEvidenceAbi, eventName: 'ResearchOrdered', data: log.data, topics: log.topics as [Hex, ...Hex[]], strict: true });
        return event.args.requestId === args.requestId && event.args.bodyHash === keccak256(body) && event.args.amount === amount;
      } catch { return false; }
    });
    if (!ordered) fail('The registry did not emit a matching ResearchOrdered event.');
  }
  const intake = await api(`/intake/1/${record.txHash}`, fetcher);
  if (intake === null) return { status: 'pending', checkedAt: Date.now(), error: 'Transaction confirmed; IMD has not indexed it yet.' };
  if (!object(intake) || intake.chainId !== 1 || String(intake.transactionHash).toLowerCase() !== record.txHash.toLowerCase() || !Array.isArray(intake.entries)) fail('IMD intake response does not match the attached transaction.');
  const entries = intake.entries as unknown[];
  const entry = entries.find(x => object(x) && x.logIndex === log.logIndex && x.requestId === args.requestId);
  if (!object(entry) || String(entry.intake).toLowerCase() !== IMD_INTAKE || String(entry.payer).toLowerCase() !== args.payer.toLowerCase() || entry.action !== 'job.open' || entry.actionVersion !== 'job-1') fail('IMD intake admission does not match the onchain event.');
  if (['refused', 'failed'].includes(String(entry.state))) return { status: 'failed', error: `IMD ${entry.state}: ${String(entry.reason ?? 'no result').slice(0, 200)}`, checkedAt: Date.now() };
  const admission = object(entry.admission) && object(entry.admission.result) ? entry.admission.result : null;
  if (!admission) return { status: 'pending', checkedAt: Date.now(), error: undefined };
  if (admission.kind !== 'job' || typeof admission.jobId !== 'string' || !uuid.test(admission.jobId) || admission.statusUrl !== `/jobs/${admission.jobId}` || admission.resultUrl !== `/jobs/${admission.jobId}/result`) fail('IMD returned an unsupported job admission.');
  const jobId = admission.jobId;
  const job = await api(`/jobs/${jobId}`, fetcher);
  if (job === null) return { status: 'pending', jobId, checkedAt: Date.now(), error: 'The admitted job is not yet available.' };
  if (!object(job) || job.id !== jobId || typeof job.state !== 'string') fail('IMD job status does not match the admitted job.');
  const terminal = ['blocked', 'failed', 'cancelled', 'canceled', 'deleted', 'superseded'].includes(job.state);
  const noArtifact = (): Partial<ImdResearchRecord> => ({ status: terminal ? 'failed' : 'pending', jobId, checkedAt: Date.now(), error: terminal ? `IMD job ${job.state}: ${String(job.blockedReason ?? job.reason ?? job.failure ?? 'ended without an accepted decision artifact').slice(0, 600)}` : undefined });
  const result = await api(`/jobs/${jobId}/result`, fetcher);
  if (result === null) return noArtifact();
  if (!object(result) || result.jobId !== jobId || !Array.isArray(result.files)) fail('IMD result does not match the admitted job.');
  if (result.complete !== true) return noArtifact();
  const files = result.files.filter(x => object(x) && x.name === 'decision' && x.path === 'artifacts/decision.json');
  if (files.length === 0 && terminal) return noArtifact();
  if (files.length !== 1 || !object(files[0])) fail('IMD has not published exactly one accepted decision artifact.');
  const file = files[0];
  if (file.mediaType !== 'application/json' || typeof file.hash !== 'string' || !fileHash.test(file.hash) || typeof file.submissionHash !== 'string' || !fileHash.test(file.submissionHash) || !Number.isSafeInteger(file.bytes) || Number(file.bytes) < 1 || Number(file.bytes) > 16 * 1024 || file.url !== `${IMD_API_ORIGIN}/artifacts/${file.hash}`) fail('IMD decision artifact metadata is invalid or points outside the official API.');
  const raw = await api(`/artifacts/${file.hash}`, fetcher, true);
  if (!(raw instanceof Uint8Array)) throw new ImdApiError('Accepted decision bytes are not yet available.', 503);
  if (raw.length !== file.bytes || createHash('sha256').update(raw).digest('hex') !== file.hash.toLowerCase()) fail('The decision artifact bytes do not match their published SHA-256 hash.');
  let value: unknown;
  try { value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw)); } catch { return fail('The decision artifact is not valid UTF-8 JSON.'); }
  const decision = parseResearchDecision(value, record);
  return { status: 'verified', jobId, checkedAt: Date.now(), error: undefined, decision, artifactHash: file.hash.toLowerCase(), artifactBytes: raw.length,
    evidence: { requestId: args.requestId, logIndex: log.logIndex!, blockNumber: receipt.blockNumber.toString(), blockHash: receipt.blockHash, payer: args.payer, intake, result } };
}
