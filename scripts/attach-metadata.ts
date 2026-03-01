import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { mplTokenMetadata, createV1, TokenStandard } from "@metaplex-foundation/mpl-token-metadata";
import { keypairIdentity, publicKey } from "@metaplex-foundation/umi";
import * as fs from "fs";
import * as path from "path";

async function main() {
  console.log("\n🪨 Oggcoin ($OGG) — Attaching Metaplex Metadata");

  // Load wallet
  const walletPath = path.join(process.env.HOME || "~", ".config/solana/id.json");
  const secretKey = JSON.parse(fs.readFileSync(walletPath, "utf8"));

  // Setup UMI
  const umi = createUmi("https://api.devnet.solana.com")
    .use(mplTokenMetadata());

  const keypair = umi.eddsa.createKeypairFromSecretKey(new Uint8Array(secretKey));
  umi.use(keypairIdentity(keypair));

  // Your mint address
  const mintAddress = publicKey("3WnPVinjy1BDdNaVMBucdfXWL5ephCT7vdjwquS9X54A");

  console.log("  Mint:     3WnPVinjy1BDdNaVMBucdfXWL5ephCT7vdjwquS9X54A");
  console.log("  Metadata: https://salmon-changing-termite-215.mypinata.cloud/ipfs/bafkreigu4tj2k66umyrvedgltyzf6wny3irb6or7ioiszd6434xc2rn5dq");

  console.log("\n  Attaching metadata to token...");

  await createV1(umi, {
    mint: mintAddress,
    name: "Oggcoin",
    symbol: "OGG",
    uri: "https://salmon-changing-termite-215.mypinata.cloud/ipfs/bafkreigu4tj2k66umyrvedgltyzf6wny3irb6or7ioiszd6434xc2rn5dq",
    sellerFeeBasisPoints: { basisPoints: BigInt(0), identifier: "%", decimals: 2 },
    tokenStandard: TokenStandard.Fungible,
  }).sendAndConfirm(umi);

  console.log("\n✅ Metadata attached successfully!");
  console.log("   Token name:   Oggcoin");
  console.log("   Token symbol: OGG");
  console.log("   Check on Explorer:");
  console.log("   https://explorer.solana.com/address/3WnPVinjy1BDdNaVMBucdfXWL5ephCT7vdjwquS9X54A?cluster=devnet");
}

main().catch((err) => {
  console.error("\n❌ Failed:", err);
  process.exit(1);
});
