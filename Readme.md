# Oggcoin ($OGG) — Solana Program

## Quick reference

# to get the keypair id of your program
solana address -k target/deploy/calci-keypair.json

# to build the program
anchor build

# to test our program
anchor test

# to deploy the program
anchor deploy

# to run local validator
solana-test-validator

# to make sure program id is same everywhere
anchor keys sync

---

## Devnet deployment and verification

### 1. Configure Solana for devnet

```bash
solana config set --url https://api.devnet.solana.com
solana config get
```

Ensure your default keypair exists and has devnet SOL:

```bash
solana address
solana airdrop 2   # if needed
```

### 2. Build and deploy the program

```bash
anchor build
anchor deploy
```

### 3. Run the deploy script (creates mint, transfers auth to PDA, mints 19%)

Set Anchor env vars (optional: `OGG_TREASURY_PUBKEY` and `OGG_MINT_ADDRESS`):

```bash
export ANCHOR_PROVIDER_URL=https://api.devnet.solana.com
export ANCHOR_WALLET=~/.config/solana/id.json

# optional: use a dedicated treasury wallet instead of admin
# export OGG_TREASURY_PUBKEY=<YOUR_TREASURY_PUBKEY>
```

Then run:

```bash
yarn install
yarn deploy:devnet
```

Save the printed **Mint** and **Treasury ATA** addresses.

### 4. Verify deployment on devnet

```bash
export OGG_MINT_ADDRESS=<MINT_FROM_DEPLOY_OUTPUT>
export OGG_TREASURY_PUBKEY=<TREASURY_PUBKEY_USED>

yarn verify:devnet
```

This checks decimals, supply, freeze authority, mint authority, and treasury balance.

### 5. Phantom / MetaMask integration

- Add the token in Phantom (devnet): paste the **mint address** when adding a custom token.
- The token is safe to add (no freeze authority, PDA mint control, unrestricted transfers).