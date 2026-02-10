# 💼 WALLET CONFIGURATION - Multi-Wallet Architecture

## 🎯 Your 3 Wallets for PokeballGame

You need to configure **3 separate wallets** for the smart contracts:

---

## 1️⃣ OWNER WALLET
**Purpose**: Controls contract upgrades and admin functions

**Responsibilities**:
- ✅ Upgrade contracts (UUPS proxy)
- ✅ Change treasury wallet address
- ✅ Change NFT revenue wallet address
- ✅ Pause/unpause game if needed
- ✅ Only wallet that can call owner-only functions

**Who Should Own This**: You (the developer)

**Save As**: `OWNER_WALLET_ADDRESS`

---

## 2️⃣ TREASURY WALLET
**Purpose**: Receives 3% of all ball purchases (fees)

**Responsibilities**:
- ✅ Receives 3% fee from each ball purchase
- ✅ Can be any wallet (even a multisig)
- ✅ No special permissions needed
- ✅ Just receives transfers

**Who Should Own This**: You or a team wallet

**Save As**: `TREASURY_WALLET_ADDRESS`

**Example Annual Revenue** (if successful):
- 1,000 players × 3 balls/week × $25 avg = $3,900/week
- 3% fee = $117/week → ~$6,000/year

---

## 3️⃣ NFT REVENUE WALLET
**Purpose**: Holds revenue pool (97% of fees), auto-buys NFTs

**Responsibilities**:
- ✅ Receives 97% of ball purchase fees
- ✅ Holds USDC.e for NFT purchases
- ✅ Triggers auto-purchase when balance >= $51
- ✅ Funds SlabMachine.pull() calls

**Who Should Own This**: Contract itself (or separate wallet you control)

**Save As**: `NFT_REVENUE_WALLET_ADDRESS`

**Flow**:
```
Player buys ball for $50 USDC.e
    ↓
97% ($48.50) → NFT Revenue Wallet
3% ($1.50) → Treasury Wallet
    ↓
NFT Revenue Wallet accumulates...
    ↓
When balance >= $51 → Auto-purchase 1 NFT from SlabMachine
    ↓
NFT goes to winner
```

---

## 🎯 How to Set These Up (Today)

### Option A: Use Your Current Wallet (Simplest)
Use your **main MetaMask/wallet address** for all 3 initially:
- Owner: Your address
- Treasury: Your address
- NFT Revenue: Your address

**Pros**:
- ✅ Simple for testing
- ✅ All funds go to you
- ✅ Easy to manage

**Cons**:
- ❌ Not production-ready
- ❌ No separation of concerns

### Option B: Create 3 New Wallets (Recommended for Testing)
Create 3 separate MetaMask accounts or test wallets:

**Steps**:
1. Open MetaMask (or similar)
2. Click account icon (top right)
3. Click "Create account" 3 times
4. Name them:
   - "PokeballGame - Owner"
   - "PokeballGame - Treasury"
   - "PokeballGame - NFT Revenue"
5. Copy each address to this file

**Pros**:
- ✅ Tests wallet separation
- ✅ More realistic
- ✅ Good for production

**Cons**:
- ❌ Need to fund them with test APE/USDC.e
- ❌ More complex

---

## 📋 Configuration Template

**Create `/contracts/wallets.json`:**

```json
{
  "apechain": {
    "chainId": 33139,
    "network": "ApeChain Mainnet"
  },
  "wallets": {
    "owner": {
      "address": "0x...", // FILL THIS IN
      "purpose": "Controls contract upgrades and admin functions",
      "funding": "Fund with small amount (~0.1 APE) for gas",
      "notes": "This is your address or team deployer"
    },
    "treasury": {
      "address": "0x...", // FILL THIS IN
      "purpose": "Receives 3% fee from ball purchases",
      "funding": "Receives automatic transfers, no initial funding needed",
      "notes": "Can be same as owner initially"
    },
    "nftRevenue": {
      "address": "0x...", // FILL THIS IN
      "purpose": "Holds revenue pool (97%), triggers auto-purchase at $51",
      "funding": "Will be funded by ball purchases, no initial funding needed",
      "notes": "This wallet needs USDC.e approval for SlabMachine"
    }
  },
  "relatedAddresses": {
    "slabMachine": "0xC2DC75bdd0bAa476fcE8A9C628fe45a72e19C466",
    "slabNFT": "0x8a981C2cfdd7Fbc65395dD2c02ead94e9a2f65a7",
    "usdc": "0xF1815bd50389c46847f0Bda824eC8da914045D14",
    "ape": "0x4d224452801aced8b2f0aebe155379bb5d594381",
    "popVRNG": "0x9eC728Fce50c77e0BeF7d34F1ab28a46409b7aF1"
  }
}
```

---

## 🎯 Right Now (Do This Today)

### Option A: Use Your Current Wallet (5 min)

1. Get your MetaMask address:
   - Open MetaMask
   - Click account icon
   - Click "Copy address to clipboard"

2. Create `/contracts/wallets.json`:
   ```json
   {
     "apechain": {
       "chainId": 33139,
       "network": "ApeChain Mainnet"
     },
     "wallets": {
       "owner": "0xYOUR_ADDRESS_HERE",
       "treasury": "0xYOUR_ADDRESS_HERE",
       "nftRevenue": "0xYOUR_ADDRESS_HERE"
     }
   }
   ```

3. Commit:
   ```bash
   git add contracts/wallets.json
   git commit -m "config: set wallet addresses for PokeballGame (testing)"
   ```

### Option B: Create 3 Separate Wallets (15 min)

1. Open MetaMask
2. Create 3 accounts (click + icon next to account name)
3. Name each one clearly
4. Copy each address
5. Fill in wallets.json
6. Commit

---

## 🔐 Security Notes

**For Testing (Current):**
- ✅ Using your addresses is fine
- ✅ Separate wallets are good practice but not required
- ✅ Keep private keys safe

**For Production (Later):**
- ⚠️ Use a multisig wallet for treasury
- ⚠️ Use a contract-owned wallet for NFT revenue
- ⚠️ Consider Gnosis Safe or similar

---

## ✅ What Goes Into Smart Contracts

**When Claude generates PokeballGame.sol, it will need:**

```solidity
contract PokeballGame {
    address public ownerWallet;
    address public treasuryWallet;
    address public nftRevenueWallet;
    
    constructor(
        address _owner,
        address _treasury,
        address _nftRevenue
    ) {
        ownerWallet = _owner;
        treasuryWallet = _treasury;
        nftRevenueWallet = _nftRevenue;
    }
}
```

**You'll pass these when deploying:**
```bash
npx hardhat run scripts/deploy.js \
  --owner 0xYOUR_OWNER \
  --treasury 0xYOUR_TREASURY \
  --nftRevenue 0xYOUR_NFT_REVENUE
```

---

## 📝 Document in Agent Prompt

When you give Claude Agent 1 the contract task, include:

```
Wallet Configuration:
- Owner Wallet: [ADDRESS]
- Treasury Wallet: [ADDRESS]
- NFT Revenue Wallet: [ADDRESS]

The constructor should accept all 3 in this order.
```

---

## 🚀 Next Steps

1. **Today**: Create wallets.json with your addresses
2. **Commit**: `git add contracts/wallets.json && git commit -m "config: wallet addresses"`
3. **Wednesday**: When generating PokeballGame.sol, reference these addresses
4. **Friday**: Deploy with actual wallet addresses

---

**Simple version**: Use your current MetaMask address for all 3, move forward. You can always change them later! ✅
