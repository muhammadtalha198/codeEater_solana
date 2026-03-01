import * as anchor from "@coral-xyz/anchor";
import {
  Keypair,
  PublicKey,
  Connection,
  clusterApiUrl,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  getAccount,
  getMint,
  setAuthority,
  AuthorityType,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccount,
} from "@solana/spl-token";
import * as fs from "fs";
import * as path from "path";

const MINT_AUTHORITY_SEED = Buffer.from("ogg_mint_authority");
const STATE_SEED = Buffer.from("ogg_state");
const TOKEN_DECIMALS = 9;

async function main() {
  console.log("\n🪨 Oggcoin ($OGG) — Devnet Deploy Script");

  // Load wallet
  const walletPath = path.join(process.env.HOME || "~", ".config/solana/id.json");
  const secretKey = JSON.parse(fs.readFileSync(walletPath, "utf8"));
  const admin = Keypair.fromSecretKey(new Uint8Array(secretKey));

  // Setup connection and provider
  const connection = new Connection(clusterApiUrl("devnet"), "confirmed");
  const wallet = new anchor.Wallet(admin);
  const provider = new anchor.AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });
  anchor.setProvider(provider);

  // Load program
  const idl = JSON.parse(fs.readFileSync(path.join(__dirname, "../target/idl/oggcoin.json"), "utf8"));
  const programId = new PublicKey("DGenjdsqRc7grLZhfvLe8XJNVUqW2qAe6GNNknEXWkPS");
  const program = new anchor.Program(idl as anchor.Idl, provider) as anchor.Program<anchor.Idl>;

  // Get mint address from environment variable
  const mintAddressStr = process.env.OGG_MINT_ADDRESS;
  if (!mintAddressStr) {
    throw new Error("OGG_MINT_ADDRESS environment variable is required!\nRun: export OGG_MINT_ADDRESS=<your_mint_address>");
  }
  const mint = new PublicKey(mintAddressStr);

  // Get treasury from env or use admin
  const treasuryStr = process.env.OGG_TREASURY_PUBKEY || admin.publicKey.toBase58();
  const treasury = new PublicKey(treasuryStr);

  // Derive PDAs
  const [mintAuthority] = PublicKey.findProgramAddressSync([MINT_AUTHORITY_SEED], programId);
  const [statePda] = PublicKey.findProgramAddressSync([STATE_SEED], programId);

  console.log(`  Program ID:         ${programId.toBase58()}`);
  console.log(`  Admin:              ${admin.publicKey.toBase58()}`);
  console.log(`  Treasury:           ${treasury.toBase58()}`);
  console.log(`  Mint:               ${mint.toBase58()}`);
  console.log(`  Mint Authority PDA: ${mintAuthority.toBase58()}`);
  console.log(`  State PDA:          ${statePda.toBase58()}`);

  // Validate mint
  const mintInfo = await getMint(connection, mint);
  console.log(`\n  Decimals:        ${mintInfo.decimals}`);
  console.log(`  Freeze Authority: ${mintInfo.freezeAuthority ?? "null ✅"}`);
  if (mintInfo.decimals !== TOKEN_DECIMALS) throw new Error(`Decimals must be ${TOKEN_DECIMALS}`);
  if (mintInfo.freezeAuthority !== null) throw new Error("Freeze authority must be null!");
  console.log("  ✅ Mint validated.");

  // Initialize program
  const stateInfo = await connection.getAccountInfo(statePda);
  if (stateInfo) {
    console.log("\n  ⚠️  Program already initialized — skipping.");
  } else {
    console.log("\n  Calling initialize()...");
    const tx = await program.methods
      .initialize(treasury)
      .accounts({
        admin: admin.publicKey,
        mint,
      })
      .rpc();
    console.log(`  ✅ initialize() TX: ${tx}`);
  }

  // Transfer mint authority to PDA
  const freshMintInfo = await getMint(connection, mint);
  if (freshMintInfo.mintAuthority?.toBase58() === mintAuthority.toBase58()) {
    console.log("\n  ✅ Mint authority already transferred to PDA — skipping.");
  } else {
    console.log("\n  Transferring mint authority to PDA...");
    await setAuthority(
      connection,
      admin,
      mint,
      admin.publicKey,
      AuthorityType.MintTokens,
      mintAuthority
    );
    console.log(`  ✅ Mint authority transferred to PDA: ${mintAuthority.toBase58()}`);
  }

  // Create treasury ATA and mint initial supply
  console.log("\n  Creating treasury ATA and minting initial supply (19%)...");
  let treasuryAta: PublicKey;
  try {
    treasuryAta = await createAssociatedTokenAccount(connection, admin, mint, treasury);
    console.log(`  ✅ Treasury ATA created: ${treasuryAta.toBase58()}`);
  } catch (e: any) {
    if (e.message?.includes("already in use")) {
      const { getAssociatedTokenAddress } = await import("@solana/spl-token");
      treasuryAta = await getAssociatedTokenAddress(mint, treasury);
      console.log(`  ✅ Treasury ATA already exists: ${treasuryAta.toBase58()}`);
    } else throw e;
  }

  // Check if already minted
  const state = await (program.account as any).oggState.fetch(statePda);
  if (state.totalMinted.toString() !== "0") {
    console.log("  ✅ Initial supply already minted — skipping.");
  } else {
    const mintTx = await program.methods
      .mintInitialSupply()
      .accounts({
        admin: admin.publicKey,
        treasuryTokenAccount: treasuryAta,
      })
      .rpc();
    console.log(`  ✅ mintInitialSupply() TX: ${mintTx}`);
  }

  // Verify treasury balance
  const treasuryAccount = await getAccount(connection, treasuryAta);
  console.log(`\n  ✅ Treasury holds: ${treasuryAccount.amount} raw units`);

  // Summary
  console.log("\n🎉 Deployment complete!");
  console.log("   ══════════════════════════════════════");
  console.log(`   Program ID:   ${programId.toBase58()}`);
  console.log(`   Mint:         ${mint.toBase58()}`);
  console.log(`   Treasury:     ${treasury.toBase58()}`);
  console.log(`   Treasury ATA: ${treasuryAta.toBase58()}`);
  console.log("   ══════════════════════════════════════");
  console.log(`\n   Explorer: https://explorer.solana.com/address/${mint.toBase58()}?cluster=devnet\n`);

  // Save deployment info
  const info = {
    programId: programId.toBase58(),
    mint: mint.toBase58(),
    statePda: statePda.toBase58(),
    treasury: treasury.toBase58(),
    treasuryAta: treasuryAta.toBase58(),
    deployedAt: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(__dirname, "../deployment-info.json"), JSON.stringify(info, null, 2));
  console.log("   ✅ Saved to deployment-info.json\n");
}

main().catch((err) => {
  console.error("\n❌ Devnet deploy failed:", err.message);
  process.exit(1);
});
