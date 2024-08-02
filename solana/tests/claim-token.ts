import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { ClaimToken } from "../target/types/claim_token";
import { PublicKey, Transaction, SystemProgram } from "@solana/web3.js";
import { expect } from "chai";
import assert from "assert";

describe("claim-token", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.ClaimToken as Program<ClaimToken>;
  const myAccount = anchor.web3.Keypair.generate();
  const myAccount1 = anchor.web3.Keypair.generate();

  it("Is initialized!", async () => {
    const signature = await program.provider.connection.requestAirdrop(
      myAccount.publicKey,
      1000000000000
    );
    await program.provider.connection.confirmTransaction(signature);
    const signature1 = await program.provider.connection.requestAirdrop(
      myAccount1.publicKey,
      1000000000000
    );
    await program.provider.connection.confirmTransaction(signature1);

    console.log(
      await program.provider.connection.getBalance(myAccount.publicKey)
    );
    const tx = await program.methods
      .initialize(myAccount.publicKey)
      .accounts({
        admin: myAccount.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([myAccount])
      .rpc();
    console.log("Your transaction signature", tx);

    const account = await program.account.state.fetch(
      provider.wallet.publicKey
    );

    assert.equal(account.owner.toBase58(), myAccount.publicKey.toBase58());
  });

  it("Claim recieved token!", async () => {
    const signature = await program.provider.connection.requestAirdrop(
      myAccount.publicKey,
      1000000000000
    );
    await program.provider.connection.confirmTransaction(signature);
    const signature1 = await program.provider.connection.requestAirdrop(
      myAccount1.publicKey,
      1000000000000
    );
    await program.provider.connection.confirmTransaction(signature1);

    const state = await program.account.state.fetch(provider.wallet.publicKey);

    //   console.log(await program.provider.connection.getAccountInfo(myAccount1.publicKey));
    //   console.log(await program.provider.connection.getAccountInfo(myAccount.publicKey));

    const userInfo = await program.account.userState.fetch(
      provider.wallet.publicKey
    );

    const [mint] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("mint")],
      anchor.web3.SystemProgram.programId
    );

    const tx = await program.methods
      .claimToken()
      .accounts({
        state: state.owner,
        user: myAccount.publicKey,
        owner: myAccount.publicKey,
        tokenProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([myAccount])
      .rpc();
    console.log("Your transaction signature", tx);
  });
});
