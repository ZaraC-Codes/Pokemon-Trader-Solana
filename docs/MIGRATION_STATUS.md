# Migration Status: ApeChain -> Solana

Last updated: 2026-02-10

## Summary

The Pokemon Trader frontend has been fully ported from ApeChain (EVM) to Solana. The active build (`npm run build`) uses **only Solana code** and produces no EVM-related imports. Legacy ApeChain files remain in the repo for reference but are completely tree-shaken out by Vite.

## Feature Migration Table

| Feature | ApeChain Status | Solana Status | Notes |
|---------|----------------|---------------|-------|
| **Wallet Connection** | RainbowKit + Wagmi | Solana Wallet Adapter | Phantom, Solflare, Coinbase + auto-detect |
| **Ball Purchase** | ERC-20 approval + contract call | SPL Token transfer (1 tx) | No approval step needed on Solana |
| **Ball Throw / Catch** | Gasless meta-tx via CF Worker | Direct Anchor tx (~$0.001) | ORAO VRF for randomness |
| **NFT Awards** | SlabNFTManager (EVM) | Anchor vault + Metaplex NFTs | On-chain vault PDA |
| **Token Swap** | ThirdWeb Universal Bridge | Jupiter Terminal v3 (CDN) | Output locked to SolBalls |
| **Transaction History** | EVM event polling (viem) | Anchor WebSocket events | Session-based, sorted by receivedAt |
| **Pokemon Spawns** | Contract read (wagmi) | Anchor account polling (5s) | PokemonSlots PDA |
| **Player Inventory** | Contract read (wagmi) | Anchor account polling (10s) | Auto-refetch after purchase |
| **Explorer Links** | Apescan | Solana Explorer | Devnet cluster param included |
| **OTC Trading** | EVM OTC contract | Stubbed | Not yet implemented on Solana |
| **NFT Metadata** | Alchemy API | Placeholder | Metaplex metadata TBD |
| **Operator Dashboard** | EVM contract reads | Not ported | Legacy component, not imported |
| **Revenue Processing** | N/A (manual) | Backend service | Node.js/Express + Jupiter + Gacha API |

## Active Solana Files (Used by Build)

| Path | Purpose |
|------|---------|
| `src/solana/wallet.tsx` | SolanaWalletProvider |
| `src/solana/programClient.ts` | Anchor IDL client, PDA derivation |
| `src/solana/constants.ts` | Ball prices, catch rates, program ID |
| `src/hooks/solana/*.ts` | 8 Solana hooks (inventory, purchase, throw, spawns, events, balance) |
| `src/components/PokeBallShop/` | SolBalls-only shop with Jupiter swap button |
| `src/components/SwapWidget/` | Jupiter Terminal v3 integration |
| `src/components/CatchAttemptModal/` | Direct Anchor tx throw flow |
| `src/components/CatchWinModal/` | Solana Explorer links |
| `src/components/CatchResultModal/` | Solana Explorer links |
| `src/components/WalletConnector.tsx` | Solana Wallet Adapter button |
| `src/components/AdminDevTools.tsx` | Reads Anchor accounts |
| `src/components/TransactionHistory.tsx` | WebSocket event log |
| `src/App.tsx` | Root, wraps with SolanaWalletProvider |

## Legacy ApeChain Files (Kept for Reference, NOT Imported)

These files exist in the repo but are **completely excluded** from the Vite build via tree-shaking:

| Category | Files | Count |
|----------|-------|-------|
| EVM Hooks | `src/hooks/pokeballGame/*.ts` | ~15 |
| EVM Services | `src/services/{apechainConfig,contractService,pokeballGameConfig,slabNFTManagerConfig,thirdwebConfig}.ts` | 5 |
| EVM Connectors | `src/connectors/*.ts` | 4 |
| EVM Components | `src/components/{FundingWidget,OperatorDashboard,BallShop}.tsx` | 3 |
| EVM Utilities | `src/utils/{alchemy,walletDetection}.ts` | 2 |
| Legacy Hooks | `src/hooks/{useTransactionHistory,useTokenBalances,usePokeballGame,useNFTMetadata,...}.ts` | ~10 |
| ABIs | `contracts/abi/*.json` | 2 |

## Code Changes Made (This Migration Pass)

### Removed / Renamed
- `GameScene.ts`: Renamed 'apechain' decorative tile texture to 'solana' with Solana brand colors

### Improved Error Handling
- `usePurchaseBalls.ts`: Added parsing for InvalidBallType, NotInitialized, timeout, blockhash, insufficient SOL errors
- `useThrowBall.ts`: Added parsing for InvalidSlotIndex, InvalidBallType, NotInitialized, timeout, blockhash errors; improved SlotNotActive message
- `CatchAttemptModal.tsx`: Added friendly messages for SlotNotActive, MaxAttemptsReached, insufficient SOL, network congestion

### UX Improvements
- `PokeBallShop.tsx`: Auto-refetch inventory after successful purchase (was waiting 10s for next poll)
- `SwapWidget.tsx`: Added retry loop (up to 5s) for Jupiter CDN loading race condition

## Remaining Work

### Must Do Before Ship
- [ ] Deploy SolBalls token mint to devnet and set `VITE_SOLBALLS_MINT`
- [ ] Initialize the Anchor program on devnet with correct mints
- [ ] Deposit at least one NFT into the vault for testing
- [ ] End-to-end devnet test (see `docs/QA_DEVNET.md`)

### Nice to Have
- [ ] Port NFT metadata display (Metaplex DAS API or on-chain metadata)
- [ ] Port Operator Dashboard to read Solana Anchor accounts
- [ ] Implement OTC trading on Solana
- [ ] Add wallet disconnect detection during in-flight transactions
- [ ] Add VRF consumption polling (currently relies on WebSocket events)
- [ ] Switch Pokemon spawn polling to WebSocket (currently 5s interval)
- [ ] Add RPC connection health monitoring

### Won't Do (Explicitly Out of Scope)
- ThirdWeb Universal Bridge (replaced by Jupiter)
- dGen1/Glyph wallet connectors (ApeChain-specific hardware)
- Gasless relayer (Solana fees are < $0.001)
- Alchemy NFT API (replaced by Metaplex)
