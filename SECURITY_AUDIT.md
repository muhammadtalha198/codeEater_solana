# Oggcoin ($OGG) — Security Audit Report

**Program:** `programs/calci/src/lib.rs`  
**Scope:** Full program logic, account validation, access control, CPI safety  
**Audit style:** Defense-in-depth, no trust in client-provided accounts beyond required constraints  

---

## Executive Summary

The Oggcoin program implements a fixed-supply SPL token with a PDA as mint authority and one-time initial mint (19%). The design is sound. Several **hardening measures** were identified and applied so that every critical path is explicitly validated and program IDs are pinned.

---

## Findings and Remediation

### CRITICAL — Fake program IDs (FIXED)

**Issue:** `token_program` and `system_program` were not constrained to the official Solana/SPL program IDs. A malicious client could pass a fake program that looks like the Token or System program and alter behavior (e.g., mint to a different account, skip checks).

**Remediation:**  
- `Initialize`: add `address = anchor_spl::token::ID` on `token_program` and `address = anchor_lang::system_program::ID` on `system_program`.  
- `MintInitialSupply`: add `address = anchor_spl::token::ID` on `token_program`.

---

### HIGH — Unrestricted `mint_initial_supply` caller (FIXED)

**Issue:** Any signer could call `mint_initial_supply`; the instruction did not require the signer to be `state.admin`. Tokens still go to `state.treasury`, but the intended design is admin-only. A front-run or bug could allow a non-admin to trigger the one-time mint.

**Remediation:** Add at the start of `mint_initial_supply`:  
`require!(ctx.accounts.admin.key() == state.admin, OggError::Unauthorized);`

---

### MEDIUM — Treasury token account mint/owner (FIXED)

**Issue:** Only `treasury_token_account.owner == state.treasury` was checked. The SPL CPI enforces that the destination is the correct mint’s token account, but an explicit check that `treasury_token_account.mint == state.mint` improves clarity and defense-in-depth.

**Remediation:**  
- In `MintInitialSupply` accounts: add `constraint = treasury_token_account.mint == state.mint` and `constraint = treasury_token_account.owner == state.treasury`.  
- Keep the existing runtime `require!` in the handler.

---

### LOW — Default / zero pubkeys (FIXED)

**Issue:**  
- `initialize(treasury)`: If `treasury == Pubkey::default()`, tokens could be sent to an unintended or burn-like address.  
- `update_treasury(new_treasury)`: Same risk if `new_treasury == Pubkey::default()`.

**Remediation:**  
- In `initialize`: `require!(treasury != Pubkey::default(), OggError::InvalidTreasury);` (or a dedicated error).  
- In `update_treasury`: `require!(new_treasury != Pubkey::default(), OggError::InvalidTreasury);` (or a dedicated error).

---

### INFORMATIONAL — No change required

1. **PDA derivation**  
   State and mint authority use fixed seeds (`STATE_SEED`, `MINT_AUTHORITY_SEED`) with no user-controlled inputs. No PDA spoofing.

2. **Double initialization**  
   `require!(!state.is_initialized, AlreadyInitialized)` plus `init` on state PDA prevents re-init. Safe.

3. **Double mint**  
   `require!(state.total_minted == 0, AlreadyMinted)` and single update to `total_minted` prevent multiple initial mints. Safe.

4. **Admin-only instructions**  
   `mint_future_allocation` and `update_treasury` both check `admin.key() == state.admin`. Correct.

5. **CPI**  
   Only `token::mint_to` is used; no arbitrary CPI. Token program does not call back. No reentrancy concern.

6. **Integer overflow**  
   `INITIAL_MINT_AMOUNT` and `total_minted` are fixed/constant. For future 4% mint, use checked arithmetic (e.g. `total_minted.checked_add(amount)` and cap vs `MAX_SUPPLY`).

7. **Supply cap**  
   Initial mint is a constant below `MAX_SUPPLY`. When implementing future mint, enforce `total_minted + amount <= MAX_SUPPLY` and use checked math.

8. **Freeze authority**  
   Intended to be null at mint creation (off-chain). Program does not set freeze; document that mint must be created with freeze authority revoked.

9. **Initialize first-caller**  
   Anyone can call `initialize` with their own `admin` and `mint`; first successful caller wins. Acceptable if deployment is a single atomic flow (e.g. deploy script). Optionally document or restrict to a deployer PDA in a future version.

---

## Checklist (Post-Fix)

- [x] Token program constrained to official ID in all instructions that use it  
- [x] System program constrained to official ID where used  
- [x] `mint_initial_supply` restricted to `state.admin`  
- [x] Treasury token account constrained by mint and owner  
- [x] `treasury` and `new_treasury` rejected when `Pubkey::default()`  
- [x] No arbitrary CPI; only SPL token mint_to  
- [x] PDAs use fixed seeds only  
- [x] Double-init and double-mint guarded  
- [x] Admin-only paths enforce `admin == state.admin`  

---

## Recommendations for Future Upgrades

1. **4% mint:** Use `checked_add` for `total_minted`, enforce `total_minted + amount <= MAX_SUPPLY`, and keep admin-only.  
2. **Upgrade authority:** Prefer multi-sig or timelock for the program upgrade key where possible.  
3. **Initialize:** If desired, add a single “deployer” PDA or fixed bootstrap key so only the deployer can call `initialize`.

---

*Audit applied: hardening implemented in `lib.rs` per above.*
