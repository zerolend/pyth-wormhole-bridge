// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.24;

import "wormhole-solidity-sdk/interfaces/IWormhole.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title PythBridge EVM
 * @notice This contract is responsible for initializing cross-chain and validating claim requests using the Wormhole protocol.
 */
contract PythBridge is Ownable2Step, Pausable {
    /// @notice Structure to define a message payload
    struct Message {
        uint8 payloadId;
        bytes32 solAddress;
        uint256 amount;
    }

    event ClaimRequestInitiated(
        address indexed user,
        uint64 indexed messageSequence,
        bytes32 indexed solAddress,
        uint256 amount
    );

    /// @notice The root hash of the Merkle tree used for proof validation.
    bytes32 public immutable ROOT_HASH;

    /// @notice Wormhole implementation address
    IWormhole public immutable WORM_HOLE;

    /// @notice Wormhole chain ID of this contract
    uint16 public immutable CHAIN_ID;

    /// @notice The number of block confirmations needed before the wormhole network will attest a message.
    uint8 public immutable WORHHOLE_FINALITY;

    /// @notice Mapping to track whether an address has been initiated.
    mapping(address => bool) public isInitiated;

    /**
     * @notice Constructor to initialize the contract with required parameters.
     * @param _rootHash The root hash of the Merkle tree.
     * @param _wormHole The address of the Wormhole contract.
     * @param _chainId The chain ID where the contract is deployed.
     * @param _wormholeFinality The finality requirement of the Wormhole contract.
     */
    constructor(
        bytes32 _rootHash,
        address _wormHole,
        uint16 _chainId,
        uint8 _wormholeFinality
    ) Ownable(msg.sender) {
        require(_rootHash != bytes32(0), "Invalid Root Hash");
        require(_wormHole != address(0), "Invalid Wormhole Address");
        require(_chainId > 0, "Invalid ChainId");
        require(_wormholeFinality > 0, "Invalid Wormhole Finality");

        ROOT_HASH = _rootHash;
        WORM_HOLE = IWormhole(_wormHole);
        CHAIN_ID = _chainId;
        WORHHOLE_FINALITY = _wormholeFinality;
    }

    /**
     * @notice Initializes a claim request.
     * @param _solAddress The address on the Solana network in bytes.
     * @param _amount The amount to be claimed.
     * @param _proof The proof path array for validation.
     * @return messageSequence The sequence number of the published message.
     */
    function initializeClaimRequest(
        bytes32 _solAddress,
        uint256 _amount,
        bytes32[] calldata _proof
    ) external payable whenNotPaused returns (uint64 messageSequence) {
        require(!isInitiated[msg.sender], "Already Initiated");
        require(_validateProof(msg.sender, _amount, _proof), "Invalid Proof");

        isInitiated[msg.sender] = true;
        messageSequence = _publishMessage(_solAddress, _amount);

        emit ClaimRequestInitiated(
            msg.sender,
            messageSequence,
            _solAddress,
            _amount
        );
    }

    /**
     * @notice Re-initiates a claim request for a user by the contract owner.
     * @param _solAddress The address on the Solana network in bytes.
     * @param _user The address of the user.
     * @param _amount The amount to be claimed.
     * @param _proof The proof path array for validation.
     * @return messageSequence The sequence number of the published message.
     */
    function reInitiateClaimRequest(
        bytes32 _solAddress,
        address _user,
        uint256 _amount,
        bytes32[] calldata _proof
    )
        external
        payable
        onlyOwner
        whenNotPaused
        returns (uint64 messageSequence)
    {
        require(isInitiated[_user], "Not Initiated");
        require(_validateProof(_user, _amount, _proof), "Invalid Proof");

        messageSequence = _publishMessage(_solAddress, _amount);
    }

    /**
     * @notice Triggers stopped state of the bridge.
     * @custom:access Only owner.
     */
    function pause() external onlyOwner {
        _pause();
    }

    /**
     * @notice Triggers resume state of the bridge.
     * @custom:access Only owner.
     */
    function unpause() external onlyOwner {
        _unpause();
    }

    /**
     * @notice Gets the emitter address in bytes32 format.
     * @return The address of the contract as bytes32.
     */
    function emitterAddress() public view returns (bytes32) {
        return bytes32(uint256(uint160(address(this))));
    }

    /**
     * @notice Gets the Wormhole fee.
     * @return The current Wormhole fee.
     */
    function getWormHoleFee() public view returns (uint256) {
        return WORM_HOLE.messageFee();
    }

    /**
     * @notice Validates the Merkle proof for a given address and amount.
     * @param _caller The address on the caller on EVM chain.
     * @param _amount The amount to be claimed.
     * @param _proof The Merkle proof for validation.
     * @return isValid Boolean indicating whether the proof is valid.
     */
    function _validateProof(
        address _caller,
        uint256 _amount,
        bytes32[] calldata _proof
    ) internal view returns (bool) {
        bytes32 leaf = keccak256(
            bytes.concat(keccak256(abi.encode(_caller, _amount)))
        );
        return MerkleProof.verifyCalldata(_proof, ROOT_HASH, leaf);
    }

    /**
     * @notice Publishes a message to the Wormhole network.
     * @param _solAddress The address on the Solana network in bytes.
     * @param _amount The amount to be claimed.
     * @return messageSequence The sequence number of the published message.
     */
    function _publishMessage(
        bytes32 _solAddress,
        uint256 _amount
    ) private returns (uint64 messageSequence) {
        require(msg.value >= getWormHoleFee(), "Insufficient funds!");

        Message memory message = Message({
            payloadId: uint8(1),
            solAddress: _solAddress,
            amount: _amount
        });

        bytes memory encodedMessage = abi.encodePacked(
            message.payloadId,
            message.solAddress,
            message.amount
        );

        messageSequence = WORM_HOLE.publishMessage(
            1,
            encodedMessage,
            WORHHOLE_FINALITY
        );
    }
}
