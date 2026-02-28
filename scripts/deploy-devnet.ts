import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import {
  Keypair,
  PublicKey,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  createMint,
  getMint,
  getAccount,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  setAuthority,
  AuthorityType,
} from "@solana/spl-token";
import { Oggcoin } from "../target/types/oggcoin";

// ============================================================
//  CONSTANTS (must match on-chain program)
// ============================================================

const TOKEN_DECIMALS = 9;
const INITIAL_MINT_AMOUNT = new BN("1900000000000000000"); // 1.9B with 9 decimals
const MINT_AUTHORITY_SEED = Buffer.from("ogg_mint_authority");
const STATE_SEED = Buffer.from("ogg_state");

// ============================================================
//  HELPERS
// ============================================================

async function airdropIfNeeded(
  connection: anchor.web3.Connection,
  pubkey: PublicKey,
  minSol: number = 1
) {
  const balance = await connection.getBalance(pubkey);
  if (balance >= minSol * LAMPORTS_PER_SOL) {
    return;
  }

  console.log(
    `  • Airdropping ${minSol} SOL to ${pubkey.toBase58()} (current balance: ${
      balance / LAMPORTS_PER_SOL
    } SOL)`
  );
  const sig = await connection.requestAirdrop(pubkey, minSol * LAMPORTS_PER_SOL);
  await connection.confirmTransaction(sig, "confirmed");
}

async function getOrCreateATA(
  connection: anchor.web3.Connection,
  payer: Keypair,
  mint: PublicKey,
  owner: PublicKey
): Promise<PublicKey> {
  const ata = await getAssociatedTokenAddress(mint, owner);
  const info = await connection.getAccountInfo(ata);
  if (!info) {
    const tx = new anchor.web3.Transaction().add(
      createAssociatedTokenAccountInstruction(
        payer.publicKey,
        ata,
        owner,
        mint
      )
    );
    await anchor.web3.sendAndConfirmTransaction(connection, tx, [payer]);
  }
  return ata;
}

function getEnv(key: string, fallback?: string): string {
  const value = process.env[key];
  if (value) {
    return value;
  }
  if (fallback !== undefined) {
    return fallback;
  }
  throw new Error(`Missing required environment variable: ${key}`);
}

// ============================================================
//  MAIN DEPLOY SCRIPT
// ============================================================

async function main() {
  console.log("🪨 Oggcoin ($OGG) — Devnet Deploy Script\n");

  // Use Anchor's environment configuration.
  // Set ANCHOR_PROVIDER_URL to a devnet RPC and ANCHOR_WALLET to your keypair.
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const connection = provider.connection;
  const program = anchor.workspace.Oggcoin as Program<Oggcoin>;
  const admin = (provider.wallet as anchor.Wallet).payer;

  console.log(`  Program ID: ${program.programId.toBase58()}`);
  console.log(`  Admin:      ${admin.publicKey.toBase58()}`);

  // Treasury wallet: defaults to admin wallet unless overridden.
  const treasuryPubkey = new PublicKey(
    getEnv("OGG_TREASURY_PUBKEY", admin.publicKey.toBase58())
  );

  console.log(`  Treasury:   ${treasuryPubkey.toBase58()}`);

  // Ensure the admin has enough SOL for rent + fees.
  await airdropIfNeeded(connection, admin.publicKey, 2);

  // Derive PDAs
  const [mintAuthority, mintAuthorityBump] =
    PublicKey.findProgramAddressSync([MINT_AUTHORITY_SEED], program.programId);
  const [statePda, stateBump] = PublicKey.findProgramAddressSync(
    [STATE_SEED],
    program.programId
  );

  console.log(`  Mint Authority PDA: ${mintAuthority.toBase58()}`);
  console.log(`  State PDA:          ${statePda.toBase58()}`);
  console.log("");

  // Either use an existing mint or create a fresh one.
  let mint: PublicKey;
  const existingMintStr = process.env.OGG_MINT_ADDRESS;

  if (existingMintStr) {
    mint = new PublicKey(existingMintStr);
    console.log(`  Using existing mint: ${mint.toBase58()}`);
  } else {
    console.log("  Creating new SPL token mint...");
    mint = await createMint(
      connection,
      admin, // payer
      admin.publicKey, // temporary mint authority
      null, // freeze authority: NULL = revoked from the start
      TOKEN_DECIMALS,
      undefined,
      undefined,
      TOKEN_PROGRAM_ID
    );
    console.log(`  New mint created:    ${mint.toBase58()}`);
  }

  // Validate mint configuration (decimals + freeze authority)
  const mintInfo = await getMint(connection, mint);
  if (mintInfo.decimals !== TOKEN_DECIMALS) {
    throw new Error(
      `Mint decimals mismatch. Expected ${TOKEN_DECIMALS}, got ${mintInfo.decimals}`
    );
  }
  if (mintInfo.freezeAuthority !== null) {
    throw new Error(
      "Freeze authority must be null (revoked) to avoid honeypot behavior."
    );
  }

  console.log("  ✅ Mint configuration validated (decimals + freeze authority).\n");

  // Initialize program state (idempotent — will fail with AlreadyInitialized if run twice)
  console.log("  Calling initialize()...");
  try {
    const tx = await program.methods
      .initialize(treasuryPubkey)
      .accounts({
        admin: admin.publicKey,
        mint,
      })
      .rpc();
    console.log(`  ✅ initialize() transaction: ${tx}`);
  } catch (err: any) {
    const msg = err?.message ?? String(err);
    if (
      msg.includes("AlreadyInitialized") ||
      msg.includes("already in use") ||
      msg.includes("custom program error")
    ) {
      console.log("  ⚠️  initialize() skipped — program already initialized.");
    } else {
      throw err;
    }
  }

  // Transfer mint authority from admin wallet → PDA (program-controlled)
  console.log("\n  Transferring mint authority to PDA...");
  await setAuthority(
    connection,
    admin,
    mint,
    admin.publicKey,
    AuthorityType.MintTokens,
    mintAuthority // new authority = PDA
  );

  const updatedMintInfo = await getMint(connection, mint);
  if (!updatedMintInfo.mintAuthority) {
    throw new Error("Mint authority is null after transfer — expected PDA.");
  }
  if (!updatedMintInfo.mintAuthority.equals(mintAuthority)) {
    throw new Error(
      `Mint authority mismatch. Expected PDA ${mintAuthority.toBase58()}, got ${updatedMintInfo.mintAuthority.toBase58()}`
    );
  }

  console.log(
    `  ✅ Mint authority is now PDA: ${updatedMintInfo.mintAuthority.toBase58()}`
  );

  // Create treasury ATA and mint the initial 19% supply (1.9B OGG)
  console.log("\n  Creating treasury ATA and minting initial supply (19%)...");
  const treasuryAta = await getOrCreateATA(
    connection,
    admin,
    mint,
    treasuryPubkey
  );

  const txMint = await program.methods
    .mintInitialSupply()
    .accounts({
      admin: admin.publicKey,
      mint,
      treasuryTokenAccount: treasuryAta,
    })
    .rpc();

  console.log(`  ✅ mintInitialSupply() transaction: ${txMint}`);

  const treasuryAccount = await getAccount(connection, treasuryAta);
  const expected = BigInt(INITIAL_MINT_AMOUNT.toString());

  if (treasuryAccount.amount !== expected) {
    throw new Error(
      `Unexpected treasury balance. Expected ${expected}, got ${treasuryAccount.amount}`
    );
  }

  console.log(
    `  ✅ Treasury ATA: ${treasuryAta.toBase58()} holds initial supply: ${treasuryAccount.amount.toString()} raw units.`
  );

  console.log("\n🎉 Devnet deployment complete.");
  console.log("   Save these addresses for your records:");
  console.log(`   • Program ID:   ${program.programId.toBase58()}`);
  console.log(`   • Mint:         ${mint.toBase58()}`);
  console.log(`   • Treasury:     ${treasuryPubkey.toBase58()}`);
  console.log(`   • Treasury ATA: ${treasuryAta.toBase58()}`);
  console.log("");
  console.log(
    "Next steps: run scripts/verify-devnet.ts to double-check decimals, supply, PDA mint authority, and treasury balance on devnet."
  );
}

main().catch((err) => {
  console.error("\n❌ Devnet deploy script failed:");
  console.error(err);
  process.exit(1);
});

