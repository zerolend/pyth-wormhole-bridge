import { ethers } from "hardhat";
import { PythBridge, WormHoleMock } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

import { expect } from "chai";
import {
  solanaAddressToBytes32,
  solAddress,
  generateMerkleRoot,
  generateLeafNode,
} from "../helpers/utils";
import MerkleTree from "merkletreejs";

// Sample data
const sampleData = [
  { address: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266", amount: 10000 }, // hardhat user 1
  { address: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", amount: 11000 }, // hardhat user 2
  { address: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC", amount: 12000 }, // hardhat user 3
  { address: "0x90F79bf6EB2c4f870365E785982E1f101E93b906", amount: 13000 }, // hardhat user 4
];

describe("PythBridge", () => {
  let bridge: PythBridge;
  let owner: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let wormHoleMock: WormHoleMock;
  let merkleTree: MerkleTree;
  let root: string;

  const CHAIN_ID_WORMHOLE = 10002; // Sepolia WORM_HOLE CHAINID
  const WORMHOL_FINALITY = 5;

  before(async () => {
    ({ merkleTree, root } = generateMerkleRoot(sampleData));
    // Optional: Generate proof for a specific leaf node
    const leaf = generateLeafNode(sampleData[0].address, sampleData[0].amount);
    const proof = merkleTree.getHexProof(leaf);
  });

  beforeEach(async () => {
    [owner, alice, bob] = await ethers.getSigners();
    const Bridge = await ethers.getContractFactory("PythBridge", owner);
    const wormHoleMockFactory = await ethers.getContractFactory("WormHoleMock");
    wormHoleMock = await wormHoleMockFactory.deploy();

    await wormHoleMock.setMessageFee(2);

    bridge = await Bridge.deploy(
      root,
      await wormHoleMock.getAddress(),
      CHAIN_ID_WORMHOLE,
      WORMHOL_FINALITY
    );
  });

  describe("Constructor", () => {
    it("Should revert if pass invalid rootHash", async () => {
      const Bridge = await ethers.getContractFactory("PythBridge", owner);

      await expect(
        Bridge.deploy(
          ethers.ZeroHash,
          await wormHoleMock.getAddress(),
          CHAIN_ID_WORMHOLE,
          WORMHOL_FINALITY
        )
      ).to.be.rejectedWith("Invalid Root Hash");
    });

    it("Should revert if pass invalid Wormhole address", async () => {
      const Bridge = await ethers.getContractFactory("PythBridge", owner);

      await expect(
        Bridge.deploy(
          root,
          ethers.ZeroAddress,
          CHAIN_ID_WORMHOLE,
          WORMHOL_FINALITY
        )
      ).to.be.rejectedWith("Invalid Wormhole Address");
    });

    it("Should revert if pass invalid chainId", async () => {
      const Bridge = await ethers.getContractFactory("PythBridge", owner);

      await expect(
        Bridge.deploy(
          root,
          await wormHoleMock.getAddress(),
          0,
          WORMHOL_FINALITY
        )
      ).to.be.rejectedWith("Invalid ChainId");
    });

    it("Should revert if pass invalid Wormhole finality", async () => {
      const Bridge = await ethers.getContractFactory("PythBridge", owner);

      await expect(
        Bridge.deploy(
          root,
          await wormHoleMock.getAddress(),
          CHAIN_ID_WORMHOLE,
          0
        )
      ).to.be.rejectedWith("Invalid Wormhole Finality");
    });
  });

  describe("intializeClaimRequest", () => {
    it("should revert if user pass invalid amount in the root hash", async () => {
      let invalidAmount = 100;
      const leaf = generateLeafNode(
        sampleData[0].address,
        sampleData[0].amount
      );
      const proof = merkleTree.getHexProof(leaf);
      await expect(
        bridge.initializeClaimRequest(
          solanaAddressToBytes32(solAddress),
          invalidAmount,
          proof
        )
      ).to.be.revertedWith("Invalid Proof");
    });

    it("should revert if  msg.sender is not part in the root hash", async () => {
      const stacy = (await ethers.getSigners())[4];
      const leaf = generateLeafNode(
        sampleData[0].address,
        sampleData[0].amount
      );
      const proof = merkleTree.getHexProof(leaf);
      await expect(
        bridge
          .connect(stacy)
          .initializeClaimRequest(
            solanaAddressToBytes32(solAddress),
            10000,
            proof
          )
      ).to.be.revertedWith("Invalid Proof");
    });

    it("should revert if msg.sender  passed invalid proof in the root hash", async () => {
      const leaf = generateLeafNode(
        sampleData[1].address,
        sampleData[1].amount
      );
      const proof = merkleTree.getHexProof(leaf);
      await expect(
        bridge.initializeClaimRequest(
          solanaAddressToBytes32(solAddress),
          10000,
          proof
        )
      ).to.be.revertedWith("Invalid Proof");
    });

    it("should revert if msg.sender initialized twice", async () => {
      const leaf = generateLeafNode(
        sampleData[0].address,
        sampleData[0].amount
      );
      const proof = merkleTree.getHexProof(leaf);

      await bridge.initializeClaimRequest(
        solanaAddressToBytes32(solAddress),
        10000,
        proof,
        { value: 3 }
      );

      await expect(
        bridge.initializeClaimRequest(
          solanaAddressToBytes32(solAddress),
          10000,
          proof,
          { value: 3 }
        )
      ).to.be.revertedWith("Already Initiated");
    });

    it("should revert if the pause by owner", async () => {
      await bridge.connect(owner).pause();
      const leaf = generateLeafNode(
        sampleData[0].address,
        sampleData[0].amount
      );
      const proof = merkleTree.getHexProof(leaf);
      await expect(
        bridge.initializeClaimRequest(
          solanaAddressToBytes32(solAddress),
          10000,
          proof,
          { value: 3 }
        )
      ).to.be.revertedWithCustomError(bridge, "EnforcedPause");
    });

    it("should revert if msg.value is less than wormhole fee", async () => {
      const leaf = generateLeafNode(
        sampleData[0].address,
        sampleData[0].amount
      );
      const proof = merkleTree.getHexProof(leaf);

      await expect(
        bridge.initializeClaimRequest(
          solanaAddressToBytes32(solAddress),
          10000,
          proof,
          { value: 1 }
        )
      ).to.be.revertedWith("Insufficient funds!");
    });

    it("should revert if wormhole protocol failed to send message", async () => {
      wormHoleMock.setFail(true);
      const leaf = generateLeafNode(
        sampleData[2].address,
        sampleData[2].amount
      );
      const proof = merkleTree.getHexProof(leaf);

      await expect(
        bridge
          .connect(bob)
          .initializeClaimRequest(
            solanaAddressToBytes32(solAddress),
            12000,
            proof,
            { value: 3 }
          )
      ).to.be.revertedWith("Wormhole: Message failed");
    });

    it("should success intialize claim request if msg.sender pass all valid params", async () => {
      const leaf = generateLeafNode(
        sampleData[0].address,
        sampleData[0].amount
      );
      const proof = merkleTree.getHexProof(leaf);

      expect(
        await bridge.initializeClaimRequest(
          solanaAddressToBytes32(solAddress),
          10000,
          proof,
          { value: 3 }
        )
      ).to.emit(bridge, "ClaimRequestInitiated");

      expect(await bridge.isInitiated(owner.address)).to.be.equals(true);
    });
  });

  describe("reInitiateClaimRequest", () => {
    it("Should revert if caller is non-owner re-intiate claim request", async () => {
      const leaf = generateLeafNode(
        sampleData[0].address,
        sampleData[0].amount
      );
      const proof = merkleTree.getHexProof(leaf);

      await expect(
        bridge
          .connect(bob)
          .reInitiateClaimRequest(
            solanaAddressToBytes32(solAddress),
            owner.address,
            10000,
            proof,
            { value: 3 }
          )
      ).to.be.revertedWithCustomError(bridge, "OwnableUnauthorizedAccount");
    });

    it("should revert if the pause by owner", async () => {
      await bridge.connect(owner).pause();
      const leaf = generateLeafNode(
        sampleData[0].address,
        sampleData[0].amount
      );
      const proof = merkleTree.getHexProof(leaf);
      await expect(
        bridge.reInitiateClaimRequest(
          solanaAddressToBytes32(solAddress),
          owner.address,
          10000,
          proof,
          { value: 3 }
        )
      ).to.be.revertedWithCustomError(bridge, "EnforcedPause");
    });

    it("should revert when user not claimed and retrying", async () => {
      const leaf = generateLeafNode(
        sampleData[0].address,
        sampleData[0].amount
      );
      const proof = merkleTree.getHexProof(leaf);

      await expect(
        bridge
          .connect(owner)
          .reInitiateClaimRequest(
            solanaAddressToBytes32(solAddress),
            owner.address,
            10000,
            proof
          )
      ).to.be.revertedWith("Not Initiated");
    });

    it("should revert if user pass invalid proof", async () => {
      let leaf = generateLeafNode(sampleData[0].address, sampleData[0].amount);
      let proof = merkleTree.getHexProof(leaf);

      await bridge.initializeClaimRequest(
        solanaAddressToBytes32(solAddress),
        10000,
        proof,
        { value: 3 }
      );

      leaf = generateLeafNode(sampleData[1].address, sampleData[0].amount);

      proof = merkleTree.getHexProof(leaf);

      await expect(
        bridge.reInitiateClaimRequest(
          solanaAddressToBytes32(solAddress),
          owner.address,
          10000,
          proof,
          { value: 3 }
        )
      ).to.be.revertedWith("Invalid Proof");
    });
    it("owner should be able to re-initiate claim request", async () => {
      const leaf = generateLeafNode(
        sampleData[1].address,
        sampleData[1].amount
      );
      const proof = merkleTree.getHexProof(leaf);

      await bridge
        .connect(alice)
        .initializeClaimRequest(
          solanaAddressToBytes32(solAddress),
          11000,
          proof,
          { value: 3 }
        );

      expect(await bridge.isInitiated(alice.address)).to.be.equals(true);

      await bridge
        .connect(owner)
        .reInitiateClaimRequest(
          solanaAddressToBytes32(solAddress),
          alice.address,
          11000,
          proof,
          { value: 3 }
        );
    });
  });

  describe("pausable oz", () => {
    it("should revert if non owner call pause", async () => {
      await expect(bridge.connect(alice).pause()).to.be.revertedWithCustomError(
        bridge,
        "OwnableUnauthorizedAccount"
      );
    });

    it("should revert if non owner call unpause", async () => {
      await expect(
        bridge.connect(alice).unpause()
      ).to.be.revertedWithCustomError(bridge, "OwnableUnauthorizedAccount");
    });

    it("should not revert if owner call pause", async () => {
      await bridge.connect(owner).pause();
      let isPaused = await bridge.paused();
      expect(isPaused).to.be.true;
    });

    it("should not revert if owner call unpause", async () => {
      await bridge.connect(owner).pause();
      await bridge.connect(owner).unpause();
      let isPaused = await bridge.paused();
      expect(isPaused).to.be.false;
    });
  });
  describe("getWormHoleFee", () => {
    it("should return correct wormhole fee", async () => {
      expect(await bridge.getWormHoleFee()).to.be.equal(2);
    });
  });

  describe("Emitter Address", () => {
    it("should return the correct value", async () => {
      await bridge.emitterAddress();
    });
  });
});
