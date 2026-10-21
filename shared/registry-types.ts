import { isAddress, keccak256, parseAbi, stringToHex, zeroAddress, zeroHash, type Abi, type Address, type Hex } from 'viem';
import { IMD_ASSET, IMD_INTAKE, IMD_JOB_ACTION_ID, IMD_PREFLIGHT_MAX_AGE_MS, type ImdPreflight } from './imd-types.ts';

export const registryAbi = parseAbi([
  'function owner() view returns (address)',
  'function intake() view returns (address)',
  'function asset() view returns (address)',
  'function worldCommitment() view returns (bytes32)',
  'function price() view returns (uint256)',
  'function spendCap() view returns (uint256)',
  'function spent() view returns (uint256)',
  'function remainingBudget() view returns (uint256)',
  'function pendingRequestId() view returns (bytes32)',
  'function usedBodies(bytes32 bodyHash) view returns (bool)',
  'function researchers(address researcher) view returns (bool)',
  'function orderResearch(bytes body) returns (bytes32 requestId)',
  'function orderResearch(bytes body, uint256 expectedPrice) returns (bytes32 requestId)',
]);
export const registryTokenAbi = parseAbi(['function balanceOf(address account) view returns (uint256)']);
export const registryIntakeAbi = parseAbi(['function priceOf(bytes32 action, address asset) view returns (uint256)']);

export interface RegistryReader {
  getChainId(): Promise<number>;
  getCode(args: { address: Address }): Promise<Hex | undefined>;
  readContract(args: { address: Address; abi: Abi; functionName: string; args?: readonly unknown[] }): Promise<unknown>;
}
export interface ReadyRegistry {
  status: 'ready'; address: Address; codeHash: Hex; chainId: 1; intake: Address; asset: Address;
  worldCommitment: Hex; owner: Address; price: string; spendCap: string; spent: string;
  remainingBudget: string; tokenBalance: string; pendingRequestId: Hex;
  bodyHash: Hex; checkedAt: number;
}
export type RegistryPreflight = { status: 'unconfigured' } | ReadyRegistry;
export type ResearchPreflight = ImdPreflight & { registry?: RegistryPreflight };

export function researchBodyHash(preflight: ImdPreflight): Hex {
  return keccak256(stringToHex(JSON.stringify(preflight.input)));
}
function address(value: unknown, label: string): Address {
  if (typeof value !== 'string' || !isAddress(value) || value.toLowerCase() === zeroAddress) throw new Error(`Invalid registry ${label}.`);
  return value as Address;
}
function digest(value: unknown, label: string): Hex {
  if (typeof value !== 'string' || !/^0x[0-9a-f]{64}$/i.test(value)) throw new Error(`Invalid registry ${label}.`);
  return value as Hex;
}
function amount(value: unknown, label: string): bigint {
  if (typeof value !== 'bigint' || value < 0n || value >= 2n ** 256n) throw new Error(`Invalid registry ${label}.`);
  return value;
}

/** Reads trusted operator configuration through RPC; never signs or sends a transaction. */
export async function inspectRegistry(client: RegistryReader, registry: Address, preflight: ImdPreflight, account?: Address): Promise<ReadyRegistry> {
  if (!isAddress(registry) || registry.toLowerCase() === zeroAddress) throw new Error('Invalid research registry address.');
  if (await client.getChainId() !== 1) throw new Error('The research registry RPC must use Ethereum mainnet.');
  const code = await client.getCode({ address: registry });
  if (!code || code === '0x') throw new Error('The configured research registry has no deployed code.');
  const read = (functionName: string, args?: readonly unknown[]) => client.readContract({ address: registry, abi: registryAbi, functionName, ...(args ? { args } : {}) });
  const bodyHash = researchBodyHash(preflight);
  const [rawOwner, rawIntake, rawAsset, rawWorld, rawPrice, rawCap, rawSpent, rawRemaining, rawPending, used] = await Promise.all([
    read('owner'), read('intake'), read('asset'), read('worldCommitment'), read('price'), read('spendCap'),
    read('spent'), read('remainingBudget'), read('pendingRequestId'), read('usedBodies', [bodyHash]),
  ]);
  const owner = address(rawOwner, 'owner');
  const intake = address(rawIntake, 'Intake');
  const asset = address(rawAsset, 'asset');
  if (intake.toLowerCase() !== IMD_INTAKE || asset.toLowerCase() !== IMD_ASSET) throw new Error('The research registry uses a different Intake or IMD asset.');
  const snapshot: ReadyRegistry = {
    status: 'ready', address: registry, codeHash: keccak256(code), chainId: 1, intake, asset, owner,
    worldCommitment: digest(rawWorld, 'world commitment'), price: amount(rawPrice, 'price').toString(),
    spendCap: amount(rawCap, 'spend cap').toString(), spent: amount(rawSpent, 'spent amount').toString(),
    remainingBudget: amount(rawRemaining, 'remaining budget').toString(),
    pendingRequestId: digest(rawPending, 'pending request'), bodyHash, checkedAt: Date.now(), tokenBalance: '0',
  };
  if (used !== false) throw new Error('This exact research body was already ordered by the registry.');
  const [rawBalance, rawLivePrice] = await Promise.all([
    client.readContract({ address: asset, abi: registryTokenAbi, functionName: 'balanceOf', args: [registry] }),
    client.readContract({ address: intake, abi: registryIntakeAbi, functionName: 'priceOf', args: [preflight.network.actionId, asset] }),
  ]);
  snapshot.tokenBalance = amount(rawBalance, 'token balance').toString();
  if (amount(rawLivePrice, 'live Intake price').toString() !== preflight.network.amount) throw new Error('The live Intake price changed. Run preflight again.');
  validateRegistry(snapshot, preflight);
  if (account && owner.toLowerCase() !== account.toLowerCase() && await read('researchers', [account]) !== true) {
    throw new Error('The connected wallet is not the registry owner or an authorized researcher.');
  }
  return snapshot;
}

/** Validates displayed metadata and calldata; live checks must additionally precede every send. */
export function validateRegistry(registry: ReadyRegistry, preflight: ImdPreflight): void {
  const age = Date.now() - registry.checkedAt;
  if (registry.status !== 'ready' || registry.chainId !== 1 || !isAddress(registry.address) || registry.address.toLowerCase() === zeroAddress
      || !/^0x[0-9a-f]{64}$/i.test(registry.codeHash) || registry.codeHash === zeroHash
      || preflight.network.chainId !== 1 || preflight.network.intake?.toLowerCase() !== IMD_INTAKE
      || preflight.network.asset?.toLowerCase() !== IMD_ASSET || preflight.network.actionId !== IMD_JOB_ACTION_ID
      || registry.intake?.toLowerCase() !== IMD_INTAKE || registry.asset?.toLowerCase() !== IMD_ASSET
      || registry.worldCommitment?.toLowerCase() !== preflight.worldCommitment.toLowerCase()
      || registry.bodyHash !== researchBodyHash(preflight)) throw new Error('The research registry does not match this expedition or research body.');
  if (!Number.isFinite(age) || age < -30_000 || age > IMD_PREFLIGHT_MAX_AGE_MS) throw new Error('The registry preflight expired. Run preflight again.');
  for (const value of [registry.price, registry.spendCap, registry.spent, registry.remainingBudget, registry.tokenBalance]) {
    if (typeof value !== 'string' || !/^(0|[1-9][0-9]{0,77})$/.test(value) || BigInt(value) >= 2n ** 256n) throw new Error('The research registry budget metadata is invalid.');
  }
  const price = BigInt(registry.price), cap = BigInt(registry.spendCap), spent = BigInt(registry.spent), remaining = BigInt(registry.remainingBudget);
  if (price === 0n || price.toString() !== preflight.network.amount) throw new Error('The registry price does not match the current IMD quote.');
  if (spent > cap || remaining !== cap - spent || remaining < price) throw new Error('The registry has insufficient remaining research budget.');
  if (registry.pendingRequestId !== zeroHash) throw new Error('The registry already has a pending research request.');
  if (BigInt(registry.tokenBalance) < price) throw new Error('The research registry needs IMD funding before ordering. Fund the registry separately, then run preflight again.');
}
