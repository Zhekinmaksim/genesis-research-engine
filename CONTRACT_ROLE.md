> **Later mainnet usage:** The text below describes the original review-v2 snapshot, when spent() was zero. A later real request was funded through GenesisResearch: https://etherscan.io/tx/0x59fcd440cb6ef056f33529ac1d74f13e9e1ca069c973748ea7b226f23b2f9a56 . The real Intake delivered its success callback: https://etherscan.io/tx/0x70d660e98ad243efd268777ce0eb1653f202273e5b27141a2d2b793d3d11eb09 . Its accepted IMD decision was applied once after verification. Current continuation, costs and source: https://imdgenesis.xyz/research-loop and https://imdgenesis.xyz/feedback/README.md . The original review ZIP and its checksums remain unchanged.

# GenesisResearch: historical review-v2 snapshot

## Two separate operations

1. **Actual research cycle, 20 October 2026:** the builder wallet paid 0.5 IMD by calling the existing IMD Intake directly. The admitted research job produced a decision artifact. Genesis verified its provenance, checked its exact world/revision/request binding, and applied the proposed water-only experiment once. This is the record in evidence/recorded-world.json. It did not call GenesisResearch.
2. **Project contract deployment:** IMD Launch #2322 deployed GenesisResearch on Ethereum at 0x06f8ceff95e5d72887c575d2759e36230b711d06. Owner/requester: 0x550011CAdCC758969391050241B2Fc43ED1a4B97. Its factory and deployment-service transaction sender differ from the owner. The deployed instance was unfunded and spent() was zero in the saved deployment snapshot. Fresh read-only owner/spent reads are saved in evidence/contract-current-readonly.json; spent() remains zero. This package does not claim that it has ordered research on mainnet.

## What the contract implements

- An owner-controlled IMD research budget, bounded price and spending cap.
- Funding, exact Intake ordering and allowance cleanup.
- Intake-authenticated success/failure callbacks, pending request and replay guards.
- Prediction commitment/reveal linked to its configured world commitment.

The application contains an optional registry route: preflight reads deployed code, owner/configuration, budget and exact price; evidence verification checks the registry call, ResearchOrdered event and the matching Intake Requested event. That route is distinct from the historical direct-Intake request. The currently deployed contract has a fixed world commitment: it is not automatically suitable for every newly generated world.

## Published source and local tests

contracts/src/GenesisResearch.sol is the exact source from IMD's delivered repository at commit d5c4307c5625c94b2106a861aac0646a5f4dc1e4 (SHA-256 2efc761467ef886317f5136ccb64bb88ecab7d0209db4e5edb0ebcf56f611a15). It differs from the earlier locally prepared contract: the nonzero-code validation occurs at ordering rather than construction. See evidence/contract-source-comparison.json.

`forge test --root contracts` tests the published source against local mock token/Intake contracts. These tests involve no network, real token or deployment. They establish tested local behavior; they are not evidence of mainnet usage or a full independent security audit.

## Trust limits

The contract does not decide the simulator's biological outcomes or certify a scientific discovery. An artifact hash authenticates bytes, not scientific truth. A deployment through IMD demonstrates the launch, not a successful subsequent contract-funded research cycle. The prize recipient cannot be configured by this website or this verifier; organizer confirmation of factory-deployment payout attribution remains required.

No funding, signatures, new research purchase or new deployment is needed to inspect this source or run the offline verification package.
