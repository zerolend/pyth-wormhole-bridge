// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.24;

contract WormHoleMock {
    uint256 public messageFee;

    bool doFail;

    function publishMessage(
        uint32,
        bytes memory,
        uint8
    ) external view returns (uint64 sequence) {
        require(!doFail, "Wormhole: Message failed");
        return 10;
    }

    function setMessageFee(uint256 _fee) external {
        messageFee = _fee;
    }

    function setFail(bool _doFail) external {
        doFail = _doFail;
    }
}
