import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import {
  mplTokenMetadata,
  createFungible,
} from "@metaplex-foundation/mpl-token-metadata";
import {
  keypairIdentity,
  createSignerFromKeypair,
  percentAmount,
  generateSigner,
} from "@metaplex-foundation/umi";
import * as fs from "fs";
import * as path from "path";

async function main() {
  console.log("\n🪨 Oggcoin ($OGG) — Creating Token WITH Metadata");

  const walletPath = path.join(process.env.HOME || "~", ".config/solana/id.json");
  const secretKey = JSON.parse(fs.readFileSync(walletPath, "utf8"));

  const umi = createUmi("https://api.devnet.solana.com")
    .use(mplTokenMetadata());

  const keypair = umi.eddsa.createKeypairFromSecretKey(new Uint8Array(secretKey));
  const signer = createSignerFromKeypair(umi, keypair);
  umi.use(keypairIdentity(signer));

  const mint = generateSigner(umi);
  console.log(`\n  New Mint Address: ${mint.publicKey}`);
  console.log("  Creating token with metadata...\n");

  await createFungible(umi, {
    mint,
    name: "Oggcoin",
    symbol: "OGG",
    uri: "https://salmon-changing-termite-215.mypinata.cloud/ipfs/bafkreigu4tj2k66umyrvedgltyzf6wny3irb6or7ioiszd6434xc2rn5dq",
    sellerFeeBasisPoints: percentAmount(0),
    decimals: 9,
    isMutable: true,
  }).sendAndConfirm(umi);

  console.log("✅ Token created with metadata!");
  console.log("\n   ══════════════════════════════════════");
  console.log("   SAVE THIS MINT ADDRESS:");
  console.log(`   ${mint.publicKey}`);
  console.log("   ══════════════════════════════════════");
  console.log(`\n   Explorer: https://explorer.solana.com/address/${mint.publicKey}?cluster=devnet\n`);
}

main().catch((err) => {
  console.error("\n❌ Failed:", err.message);
  process.exit(1);
});
