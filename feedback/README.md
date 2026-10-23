# GENESIS: verify the real IMD feedback loop

The original IMD agent suggested a water-only experiment. Genesis measured it and sent the result back to IMD. The follow-up agent revised its assessment and chose a basalt test. GenesisResearch paid for that follow-up, received a real Intake callback, and Genesis applied the accepted decision once. The remaining reference models changed from 14 to 10.

## Download and check

Download [genesis-real-loop-v2.zip](https://imdgenesis.xyz/feedback/genesis-real-loop-v2.zip) and extract it. Node.js 20+ is enough; no npm install, wallet or tokens are needed.

```sh
node verify.mjs
node verify.mjs --online
node verify.mjs --online --rpc https://ethereum-rpc.publicnode.com
node verify.mjs --online --rpc https://your-archive-rpc.example --rpc https://your-fallback.example
```

Supply your own archive-capable Ethereum mainnet endpoint. Repeat --rpc for up to four candidates. As an alternative, set GENESIS_VERIFY_RPC_URL in your shell. The verifier does not read .env, and it never prints an RPC URL or credentials. Public historical-state access can be rate-limited or unavailable. No provider subscription is created by this tool.

Offline verification ALWAYS runs first against the saved public snapshots. --online then reads fresh Ethereum and official IMD data. A fallback RPC supplies another fresh read; the verifier never substitutes saved evidence for an unavailable online response. RPC writes are refused.

### Reading the result

- Exit 0: requested checks passed. Without --online this means offline checks only.
- Exit 2: offline passed, but online could not be confirmed. The JSON identifies transport, historical-state, wrong-chain or IMD API access failures. This is not a verified live result.
- Exit 3: fresh data did not satisfy an evidence check. Offline success does not override that mismatch.
- Other nonzero exits: invalid arguments or failed offline integrity checks.

The package checks the calldata, price, events, admission, accepted artifact SHA-256, world/revision binding, delivered callback/storage, actual receipt gas, prior-measurement feedback, candidate counts and negative controls. You can also run node --test rpc.test.mjs to check the read-only transport and diagnostics without network access.

## Two research records

| Record | Route | What it establishes |
|---|---|---|
| [Historical review v2](https://imdgenesis.xyz/review/genesis-review-v2.zip) | Builder wallet → Intake | Original water-only proposal and measurement, 19 → 14 models. Its spent=0 contract read is a historical snapshot. |
| [Feedback verifier v2](https://imdgenesis.xyz/feedback/genesis-real-loop-v2.zip) | Owner → GenesisResearch → Intake → callback | Real follow-up received the previous measurement, returned an accepted decision, and was applied once: 14 → 10 models. |

Continuation archive SHA-256: 1e985c840f4f1242208ff44c0ea374725af8660d9fa770607b75acb98ab75479
Original unchanged archive SHA-256: 281d59f730460ddf86d075da1e6d39082bb58dad492a2630b9225f31a154d54f
Original continuation check time (UTC): 2026-10-22T19:29:05.932Z
Preserved feedback-v1 ZIP SHA-256: a42516f99dff77729f9aa9fc3d77344dcb991cb3f9906e80157af206495475cb

[Download latest package checksums](https://imdgenesis.xyz/feedback/releases.json). The original review v2 ZIP, feedback v1 ZIP and both measurement archives remain unchanged. This v2 update changes verification and adds source for the free practice task; it purchases no new research.

## Try the next question

After the [second result](https://imdgenesis.xyz/research-loop?stage=3), [choose your next controlled test](https://imdgenesis.xyz/research-loop/practice). The feedback uses the same ten remaining models and clearly labels conditional predictions. No new measurement, payment or IMD response is generated.

## Rebuild the source

The public GitHub repository includes this verifier, its entry point and its source. In that checkout, run npm ci followed by npm run build to rebuild both engines and their file manifests. Rebuilding needs the pinned esbuild dependency; ordinary offline verification does not.

## Boundaries

Genesis is a deterministic synthetic world. Measurements are saved simulator outputs; the historical hidden opening is not published, so they cannot be independently regenerated from it. The callback authenticates origin, not scientific truth. Its result-document Keccak is different from the decision artifact SHA-256. Local algorithms know the model family while IMD receives observations, so this is not an equal-information superiority benchmark. The contract has spent its lifetime budget of 0.5/0.5 IMD and cannot order more jobs.
