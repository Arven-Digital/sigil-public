// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import "forge-std/Test.sol";
import "../src/SigilAccountV11.sol";
import "../src/SigilAccountFactory.sol";

/// @notice Test V11 scoped ERC-1271 logic
contract SigilV11UpgradeTest is Test {
    address constant AGENT_KEY = 0x68e180DF5999e941e58E238dcF278d37B383b591;
    address constant GUARDIAN = 0xD06fBe90c06703C4b705571113740AfB104e3C67;
    address constant POLYMARKET_CTF = 0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E;
    address constant ENTRYPOINT = 0x0000000071727De22E5E9d8BAf0edAc6f37da032;

    SigilAccountV11 v11impl;
    address owner;

    function setUp() public {
        owner = address(this);
        v11impl = new SigilAccountV11(IEntryPoint(ENTRYPOINT), address(this));
    }

    function _deployAccount() internal returns (SigilAccountV11) {
        SigilAccountV11 account = SigilAccountV11(payable(address(new MinProxy(address(v11impl)))));
        // Call initialize as "factory" (this contract)
        account.initialize(address(this), AGENT_KEY, GUARDIAN, 1 ether, 10 ether, 0.5 ether);
        return account;
    }

    function test_V11Compiles() public view {
        assertEq(v11impl.allowedERC1271Callers(address(0)), false);
    }

    function test_SetAllowedERC1271Caller() public {
        // Deploy via factory-like pattern
        SigilAccountV11 account = SigilAccountV11(payable(address(new MinProxy(address(v11impl)))));
        account.initialize(address(this), AGENT_KEY, GUARDIAN, 1 ether, 10 ether, 0.5 ether);

        // Owner (this) whitelists Polymarket
        account.setAllowedERC1271Caller(POLYMARKET_CTF, true);
        assertTrue(account.allowedERC1271Callers(POLYMARKET_CTF));

        // Remove
        account.setAllowedERC1271Caller(POLYMARKET_CTF, false);
        assertFalse(account.allowedERC1271Callers(POLYMARKET_CTF));
    }

    function test_OnlyOwnerCanWhitelist() public {
        SigilAccountV11 account = SigilAccountV11(payable(address(new MinProxy(address(v11impl)))));
        account.initialize(address(this), AGENT_KEY, GUARDIAN, 1 ether, 10 ether, 0.5 ether);

        // Non-owner should revert
        vm.prank(AGENT_KEY);
        vm.expectRevert();
        account.setAllowedERC1271Caller(POLYMARKET_CTF, true);
    }

    function test_AgentSigBlockedWithoutWhitelist() public {
        uint256 agentPk = 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80;
        address agentAddr = vm.addr(agentPk);

        SigilAccountV11 account = SigilAccountV11(payable(address(new MinProxy(address(v11impl)))));
        account.initialize(address(this), agentAddr, GUARDIAN, 1 ether, 10 ether, 0.5 ether);

        bytes32 testHash = keccak256("test");
        bytes32 ethHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", testHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(agentPk, ethHash);
        bytes memory sig = abi.encodePacked(r, s, v);

        // Polymarket NOT whitelisted — agent sig should fail
        vm.prank(POLYMARKET_CTF);
        bytes4 result = account.isValidSignature(testHash, sig);
        assertEq(result, bytes4(0xffffffff));
    }

    function test_FrozenBlocksAgentERC1271() public {
        uint256 agentPk = 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80;
        address agentAddr = vm.addr(agentPk);

        SigilAccountV11 account = SigilAccountV11(payable(address(new MinProxy(address(v11impl)))));
        account.initialize(address(this), agentAddr, GUARDIAN, 1 ether, 10 ether, 0.5 ether);

        account.setAllowedERC1271Caller(POLYMARKET_CTF, true);
        account.freeze();

        bytes32 testHash = keccak256("test");
        bytes32 ethHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", testHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(agentPk, ethHash);
        bytes memory sig = abi.encodePacked(r, s, v);

        // Whitelisted caller but account frozen — agent sig should fail
        vm.prank(POLYMARKET_CTF);
        bytes4 result = account.isValidSignature(testHash, sig);
        assertEq(result, bytes4(0xffffffff));
    }

    function test_AgentSigAcceptedFromWhitelistedCaller() public {
        // Use a real private key for the agent
        uint256 agentPk = 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80;
        address agentAddr = vm.addr(agentPk);

        SigilAccountV11 account = SigilAccountV11(payable(address(new MinProxy(address(v11impl)))));
        account.initialize(address(this), agentAddr, GUARDIAN, 1 ether, 10 ether, 0.5 ether);

        // Whitelist the caller
        account.setAllowedERC1271Caller(POLYMARKET_CTF, true);

        // Sign a hash as the agent
        bytes32 testHash = keccak256("polymarket order");
        // Try EIP-191 mode (raw hash signed as eth_sign)
        bytes32 ethHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", testHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(agentPk, ethHash);
        bytes memory sig = abi.encodePacked(r, s, v);

        // Call from whitelisted Polymarket contract
        vm.prank(POLYMARKET_CTF);
        bytes4 result = account.isValidSignature(testHash, sig);
        assertEq(result, bytes4(0x1626ba7e)); // ERC1271_MAGIC
    }

    function test_AgentSigRejectedFromRandomCaller() public {
        uint256 agentPk = 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80;
        address agentAddr = vm.addr(agentPk);

        SigilAccountV11 account = SigilAccountV11(payable(address(new MinProxy(address(v11impl)))));
        account.initialize(address(this), agentAddr, GUARDIAN, 1 ether, 10 ether, 0.5 ether);

        account.setAllowedERC1271Caller(POLYMARKET_CTF, true);

        bytes32 testHash = keccak256("polymarket order");
        bytes32 ethHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", testHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(agentPk, ethHash);
        bytes memory sig = abi.encodePacked(r, s, v);

        // Call from random (non-whitelisted) address — should fail
        vm.prank(address(0xdead));
        bytes4 result = account.isValidSignature(testHash, sig);
        assertEq(result, bytes4(0xffffffff));
    }
}

// Minimal ERC1967 proxy
contract MinProxy {
    constructor(address impl) {
        assembly { sstore(0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc, impl) }
    }
    fallback() external payable {
        assembly {
            let impl := sload(0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc)
            calldatacopy(0, 0, calldatasize())
            let r := delegatecall(gas(), impl, 0, calldatasize(), 0, 0)
            returndatacopy(0, 0, returndatasize())
            switch r case 0 { revert(0, returndatasize()) } default { return(0, returndatasize()) }
        }
    }
    receive() external payable {}
}
