import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Calci } from "../target/types/calci";
import { Keypair, SystemProgram } from "@solana/web3.js";
import { assert } from "chai";

describe("calci", () => {
  // Configure the client to use the local cluster.
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

const program = anchor.workspace.Calci as Program<Calci>;

  // Keypair for calculator account
  const calciAcc = Keypair.generate();

  it("Initialize the calculator account", async () => {
    const tx = await program.methods
      .initialize()
      .accounts({
        feePayer: provider.wallet.publicKey,
        cacliAcc: calciAcc.publicKey,
        // systemProgram: SystemProgram.programId,
      })
      .signers([calciAcc])
      .rpc();

    console.log("Init Tx:", tx);

    const account = await program.account.calciResult.fetch(calciAcc.publicKey);
    assert.equal(account.calciResult, 0);
    assert.equal(
      account.payer.toBase58(),
      provider.wallet.publicKey.toBase58()
    );
  });

  it("Performs addition", async () => {
    await program.methods
      .add(10, 20)
      .accounts({
        cacliAcc: calciAcc.publicKey,
      })
      .rpc();

    const account = await program.account.calciResult.fetch(calciAcc.publicKey);
    assert.equal(account.calciResult, 30);
  });

  it("Performs subtraction", async () => {
    await program.methods
      .sub(50, 15)
      .accounts({
        cacliAcc: calciAcc.publicKey,
      })
      .rpc();

    const account = await program.account.calciResult.fetch(calciAcc.publicKey);
    assert.equal(account.calciResult, 35);
  });

  it("Performs division", async () => {
    await program.methods
      .div(100, 5)
      .accounts({
        cacliAcc: calciAcc.publicKey,
      })
      .rpc();

    const account = await program.account.calciResult.fetch(calciAcc.publicKey);
    assert.equal(account.calciResult, 20);
  });

  it("Fails division by zero", async () => {
    try {
      await program.methods
        .div(10, 0)
        .accounts({
          cacliAcc: calciAcc.publicKey,
        })
        .rpc();
      assert.fail("Expected division by zero to throw");
    } catch (err: any) {
      const errMsg = err.error.errorMessage;
      assert.equal(errMsg, "Division by zero is not allowed");
    }
  });
});
