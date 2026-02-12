@echo off
set ANCHOR_PROVIDER_URL=https://api.devnet.solana.com
set ANCHOR_WALLET=\\wsl.localhost\Ubuntu\home\chanz08\.config\solana\id.json
tsx scripts\solana\mint-test-nfts.ts --count 3 --alt 3iiRu5SejD9PyZn1tBMhH7euCkBZ1XcPiY2nLqb8ZY9M
