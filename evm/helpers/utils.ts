import {
  zeroPadBytes,
  hexlify,
  AbiCoder,
  keccak256,
  solidityPacked,
} from "ethers";
import { MerkleTree } from "merkletreejs";
import bs58 from "bs58";

export function solanaAddressToBytes32(solAddress: string) {
  const decodedValue = bs58.decode(solAddress);

  if (decodedValue.length !== 32) {
    throw new Error("Invalid Solana address length");
  }

  // Convert the byte array to a hex string
  const hexString = hexlify(decodedValue);

  // Return the bytes32 format (padded to 32 bytes)
  return zeroPadBytes(hexString, 32);
}

const abiCoder = new AbiCoder();

// Function to generate leaf nodes
export function generateLeafNode(address: string, amount: number): Buffer {
  const encoded = abiCoder.encode(["address", "uint256"], [address, amount]);
  const hashed = keccak256(solidityPacked(["bytes32"], [keccak256(encoded)]));
  return Buffer.from(hashed.slice(2), "hex");
}

// Function to generate Merkle root from leaf nodes
export function generateMerkleRoot(
  data: { address: string; amount: number }[]
): {
  merkleTree: MerkleTree;
  root: string;
} {
  const leaves = data.map((item) =>
    generateLeafNode(item.address, item.amount)
  );
  const merkleTree = new MerkleTree(leaves, keccak256, { sortPairs: true });
  const root = merkleTree.getHexRoot();
  return { merkleTree, root };
}

export const solAddress = "4gqA7ft9hTzLh4ecJuvap3im9f3ELRbNEMSFxy7nLKPs"; // random sample address
