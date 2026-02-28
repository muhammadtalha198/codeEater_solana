import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import {
  getMint,
  getAccount,
  getAssociatedTokenAddress,
} from "@solana/spl-token";
import { Oggcoin } from "../target/types/oggcoin";

// ============================================================
//  CONSTANTS (must match on-chain program)
// ============================================================

const TOKEN_DECIMALS = 9;
const INITIAL_MINT_AMOUNT = new BN("1900000000000000000"); // 1.9B with 9 decimals
const MINT_AUTHORITY_SEED = Buffer.from("ogg_mint_authority");
const STATE_SEED = Buffer.from("ogg_state");

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

// ============================================================
//  MAIN VERIFICATION SCRIPT
// ============================================================

async function main() {
  console.log("🪨 Oggcoin ($OGG) — Devnet Verification Script\n");

  // Expect these to be provided:
  //   OGG_MINT_ADDRESS    — the SPL token mint address on devnet
  //   OGG_TREASURY_PUBKEY — the treasury wallet that should hold 19%
  const mintPubkey = new PublicKey(requireEnv("OGG_MINT_ADDRESS"));
  const treasuryPubkey = new PublicKey(requireEnv("OGG_TREASURY_PUBKEY"));

  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const connection = provider.connection;
  const program = anchor.workspace.Oggcoin as Program<Oggcoin>;

  console.log(`  Program ID: ${program.programId.toBase58()}`);
  console.log(`  Mint:       ${mintPubkey.toBase58()}`);
  console.log(`  Treasury:   ${treasuryPubkey.toBase58()}`);

  // Derive PDAs (must match on-chain)
  const [mintAuthority] = PublicKey.findProgramAddressSync(
    [MINT_AUTHORITY_SEED],
    program.programId
  );
  const [statePda] = PublicKey.findProgramAddressSync(
    [STATE_SEED],
    program.programId
  );

  console.log(`  Mint Authority PDA: ${mintAuthority.toBase58()}`);
  console.log(`  State PDA:          ${statePda.toBase58()}`);
  console.log("");

  // Fetch on-chain accounts
  const mintInfo = await getMint(connection, mintPubkey);
  const treasuryAta = await getAssociatedTokenAddress(
    mintPubkey,
    treasuryPubkey
  );
  const treasuryAccount = await getAccount(connection, treasuryAta);
  const state = await program.account.oggState.fetch(statePda);

  const checks: { name: string; ok: boolean; details?: string }[] = [];

  // 1) Decimals
  checks.push({
    name: "Token decimals = 9",
    ok: mintInfo.decimals === TOKEN_DECIMALS,
    details: `on-chain: ${mintInfo.decimals}`,
  });

  // 2) Freeze authority is null (anti-honeypot)
  checks.push({
    name: "Freeze authority is NULL (revoked)",
    ok: mintInfo.freezeAuthority === null,
    details: mintInfo.freezeAuthority
      ? `on-chain: ${mintInfo.freezeAuthority.toBase58()}`
      : "on-chain: null",
  });

  // 3) Mint authority is PDA (no wallet can mint directly)
  const mintAuthorityMatches =
    !!mintInfo.mintAuthority &&
    mintInfo.mintAuthority.toBase58() === mintAuthority.toBase58();
  checks.push({
    name: "Mint authority is PDA (no wallet)",
    ok: mintAuthorityMatches,
    details: mintInfo.mintAuthority
      ? `on-chain: ${mintInfo.mintAuthority.toBase58()}`
      : "on-chain: null",
  });

  // 4) Treasury address matches program state
  const treasuryMatchesState =
    state.treasury.toBase58() === treasuryPubkey.toBase58();
  checks.push({
    name: "Treasury address stored in state",
    ok: treasuryMatchesState,
    details: `state.treasury: ${state.treasury.toBase58()}`,
  });

  // 5) Total minted and treasury balance equal 1.9B OGG
  const expectedSupply = BigInt(INITIAL_MINT_AMOUNT.toString());
  const supplyMatchesTreasury =
    mintInfo.supply === expectedSupply &&
    treasuryAccount.amount === expectedSupply;
  checks.push({
    name: "Initial supply (1.9B OGG) minted to treasury",
    ok: supplyMatchesTreasury,
    details: `mint.supply: ${mintInfo.supply.toString()}, treasury ATA: ${treasuryAccount.amount.toString()}`,
  });

  // 6) State.total_minted equals 1.9B OGG
  const stateTotalMintedOk =
    state.totalMinted.toString() === INITIAL_MINT_AMOUNT.toString();
  checks.push({
    name: "State.total_minted = 1.9B OGG",
    ok: stateTotalMintedOk,
    details: `state.totalMinted: ${state.totalMinted.toString()}`,
  });

  console.log("Verification results:\n");
  let allOk = true;
  for (const check of checks) {
    const status = check.ok ? "✅" : "❌";
    console.log(`  ${status} ${check.name}`);
    if (check.details) {
      console.log(`     ${check.details}`);
    }
    if (!check.ok) {
      allOk = false;
    }
  }

  console.log("");
  if (allOk) {
    console.log("🎉 All devnet verification checks PASSED.");
    console.log(
      "   You can now safely point Phantom / MetaMask to this mint and treasury."
    );
  } else {
    console.log("⚠️  One or more checks FAILED. See details above.");
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("\n❌ Devnet verification script failed:");
  console.error(err);
  process.exit(1);
});

