// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Test.sol";
import "../src/SigilAccount.sol";
import "../src/SigilAccountFactory.sol";
import "@account-abstraction/interfaces/IEntryPoint.sol";
import "@account-abstraction/interfaces/PackedUserOperation.sol";
import "@openzeppelin/contracts/interfaces/IERC1271.sol";
import "@openzeppelin/contracts/utils/introspection/IERC165.sol";

contract MockEntryPoint {
    function getNonce(address, uint192) external pure returns (uint256) { return 0; }
    function getUserOpHash(PackedUserOperation calldata) external pure returns (bytes32) {
        return keccak256("test");
    }
}

contract SigilSessionERCTest is Test {
    SigilAccountFactory factory;
    SigilAccount account;
    MockEntryPoint mockEP;

    uint256 ownerKey = 0x1;
    uint256 agentKeyPK = 0x2;
    uint256 guardianKeyPK = 0x3;
    uint256 sessionKeyPK = 0x4;
    uint256 sessionKey2PK = 0x5;
    uint256 randomKeyPK = 0x99;

    address ownerAddr;
    address agentAddr;
    address guardianAddr;
    address sessionAddr;
    address sessionAddr2;
    address randomAddr;

    function setUp() public {
        ownerAddr = vm.addr(ownerKey);
        agentAddr = vm.addr(agentKeyPK);
        guardianAddr = vm.addr(guardianKeyPK);
        sessionAddr = vm.addr(sessionKeyPK);
        sessionAddr2 = vm.addr(sessionKey2PK);
        randomAddr = vm.addr(randomKeyPK);

        mockEP = new MockEntryPoint();
        factory = new SigilAccountFactory(IEntryPoint(address(mockEP)), address(this), 0);
        account = factory.createAccount(
            ownerAddr, agentAddr, guardianAddr,
            1 ether, 10 ether, 0.5 ether, 0
        );
        vm.deal(address(account), 100 ether);
    }

    // ═══════════════════════════════════════════════════════════
    //                      SESSION KEY TESTS
    // ═══════════════════════════════════════════════════════════

    function test_createSessionKey() public {
        vm.prank(ownerAddr);
        uint256 sid = account.createSessionKey(
            sessionAddr, 0, block.timestamp + 1 hours, 5 ether, 0.5 ether, 0, true
        );
        assertEq(sid, 1);
        assertTrue(account.isValidSessionKey(sessionAddr));
    }

    function test_createSessionKey_nonOwnerReverts() public {
        vm.prank(agentAddr);
        vm.expectRevert();
        account.createSessionKey(sessionAddr, 0, block.timestamp + 1 hours, 5 ether, 0, 0, true);
    }

    function test_createSessionKey_zeroAddressReverts() public {
        vm.prank(ownerAddr);
        vm.expectRevert();
        account.createSessionKey(address(0), 0, block.timestamp + 1 hours, 5 ether, 0, 0, true);
    }

    function test_createSessionKey_collisionWithOwnerReverts() public {
        vm.prank(ownerAddr);
        vm.expectRevert();
        account.createSessionKey(ownerAddr, 0, block.timestamp + 1 hours, 5 ether, 0, 0, true);
    }

    function test_createSessionKey_collisionWithAgentReverts() public {
        vm.prank(ownerAddr);
        vm.expectRevert();
        account.createSessionKey(agentAddr, 0, block.timestamp + 1 hours, 5 ether, 0, 0, true);
    }

    function test_createSessionKey_collisionWithGuardianReverts() public {
        vm.prank(ownerAddr);
        vm.expectRevert();
        account.createSessionKey(guardianAddr, 0, block.timestamp + 1 hours, 5 ether, 0, 0, true);
    }

    function test_createSessionKey_duplicateReverts() public {
        vm.startPrank(ownerAddr);
        account.createSessionKey(sessionAddr, 0, block.timestamp + 1 hours, 5 ether, 0, 0, true);
        vm.expectRevert();
        account.createSessionKey(sessionAddr, 0, block.timestamp + 2 hours, 5 ether, 0, 0, true);
        vm.stopPrank();
    }

    function test_createSessionKey_invalidDurationReverts() public {
        vm.prank(ownerAddr);
        vm.expectRevert();
        // validUntil <= validAfter
        account.createSessionKey(sessionAddr, block.timestamp + 2 hours, block.timestamp + 1 hours, 5 ether, 0, 0, true);
    }

    function test_createSessionKey_frozenReverts() public {
        vm.prank(ownerAddr);
        account.freeze();
        vm.prank(ownerAddr);
        vm.expectRevert();
        account.createSessionKey(sessionAddr, 0, block.timestamp + 1 hours, 5 ether, 0, 0, true);
    }

    function test_revokeSessionKey() public {
        vm.startPrank(ownerAddr);
        uint256 sid = account.createSessionKey(sessionAddr, 0, block.timestamp + 1 hours, 5 ether, 0, 0, true);
        assertTrue(account.isValidSessionKey(sessionAddr));
        account.revokeSessionKey(sid);
        assertFalse(account.isValidSessionKey(sessionAddr));
        vm.stopPrank();
    }

    function test_revokeSessionKey_nonOwnerReverts() public {
        vm.prank(ownerAddr);
        uint256 sid = account.createSessionKey(sessionAddr, 0, block.timestamp + 1 hours, 5 ether, 0, 0, true);
        vm.prank(agentAddr);
        vm.expectRevert();
        account.revokeSessionKey(sid);
    }

    function test_revokeSessionKey_invalidIdReverts() public {
        vm.prank(ownerAddr);
        vm.expectRevert();
        account.revokeSessionKey(999);
    }

    function test_sessionKey_expiresAfterValidUntil() public {
        vm.prank(ownerAddr);
        account.createSessionKey(sessionAddr, 0, block.timestamp + 1 hours, 5 ether, 0, 0, true);
        assertTrue(account.isValidSessionKey(sessionAddr));

        vm.warp(block.timestamp + 2 hours);
        assertFalse(account.isValidSessionKey(sessionAddr));
    }

    function test_sessionKey_notActiveBeforeValidAfter() public {
        vm.prank(ownerAddr);
        account.createSessionKey(sessionAddr, block.timestamp + 1 hours, block.timestamp + 2 hours, 5 ether, 0, 0, true);
        assertFalse(account.isValidSessionKey(sessionAddr));

        vm.warp(block.timestamp + 90 minutes);
        assertTrue(account.isValidSessionKey(sessionAddr));
    }

    function test_getSessionKey() public {
        vm.prank(ownerAddr);
        uint256 sid = account.createSessionKey(
            sessionAddr, 0, block.timestamp + 1 hours, 5 ether, 0.5 ether, 300, true
        );
        (address key, uint256 validAfter, uint256 validUntil,
         uint256 spendLimit, uint256 spent, uint256 maxTxVal,
         uint256 cooldown, uint256 lastUsedAt,
         bool allowAllTargets, bool revoked) = account.getSessionKey(sid);

        assertEq(key, sessionAddr);
        assertEq(validUntil, block.timestamp + 1 hours);
        assertEq(spendLimit, 5 ether);
        assertEq(spent, 0);
        assertEq(maxTxVal, 0.5 ether);
        assertEq(cooldown, 300);
        assertEq(lastUsedAt, 0);
        assertTrue(allowAllTargets);
        assertFalse(revoked);
    }

    function test_addSessionTarget() public {
        vm.startPrank(ownerAddr);
        uint256 sid = account.createSessionKey(sessionAddr, 0, block.timestamp + 1 hours, 5 ether, 0, 0, false);
        account.addSessionTarget(sid, address(0xBEEF));
        // No revert = success. We can't easily check the mapping directly but it's stored
        vm.stopPrank();
    }

    function test_addSessionTarget_selfReverts() public {
        vm.startPrank(ownerAddr);
        uint256 sid = account.createSessionKey(sessionAddr, 0, block.timestamp + 1 hours, 5 ether, 0, 0, false);
        vm.expectRevert();
        account.addSessionTarget(sid, address(account));
        vm.stopPrank();
    }

    function test_addSessionFunction() public {
        vm.startPrank(ownerAddr);
        uint256 sid = account.createSessionKey(sessionAddr, 0, block.timestamp + 1 hours, 5 ether, 0, 0, false);
        account.addSessionFunction(sid, bytes4(0x12345678));
        vm.stopPrank();
    }

    function test_multipleSessionKeys() public {
        vm.startPrank(ownerAddr);
        uint256 sid1 = account.createSessionKey(sessionAddr, 0, block.timestamp + 1 hours, 5 ether, 0, 0, true);
        uint256 sid2 = account.createSessionKey(sessionAddr2, 0, block.timestamp + 2 hours, 10 ether, 0, 0, true);
        assertEq(sid1, 1);
        assertEq(sid2, 2);
        assertTrue(account.isValidSessionKey(sessionAddr));
        assertTrue(account.isValidSessionKey(sessionAddr2));
        vm.stopPrank();
    }

    // ═══════════════════════════════════════════════════════════
    //                      ERC-1271 TESTS
    // ═══════════════════════════════════════════════════════════

    bytes4 constant ERC1271_MAGIC = 0x1626ba7e;
    bytes4 constant ERC1271_INVALID = 0xffffffff;

    function test_erc1271_ownerSignatureValid() public view {
        bytes32 hash = keccak256("test message");
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", account.domainSeparator(), hash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(ownerKey, digest);
        bytes memory sig = abi.encodePacked(r, s, v);
        assertEq(account.isValidSignature(hash, sig), ERC1271_MAGIC);
    }

    function test_erc1271_agentSignatureInvalid() public view {
        // R10 FIX: Agent signatures now INVALID for ERC-1271 to prevent policy bypass
        bytes32 hash = keccak256("test message");
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", account.domainSeparator(), hash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(agentKeyPK, digest);
        bytes memory sig = abi.encodePacked(r, s, v);
        assertEq(account.isValidSignature(hash, sig), ERC1271_INVALID);
    }

    function test_erc1271_agentSignatureInvalidWhenFrozen() public {
        vm.prank(ownerAddr);
        account.freeze();

        bytes32 hash = keccak256("test message");
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", account.domainSeparator(), hash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(agentKeyPK, digest);
        bytes memory sig = abi.encodePacked(r, s, v);
        assertEq(account.isValidSignature(hash, sig), ERC1271_INVALID);
    }

    function test_erc1271_ownerSignatureValidWhenFrozen() public {
        vm.prank(ownerAddr);
        account.freeze();

        bytes32 hash = keccak256("test message");
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", account.domainSeparator(), hash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(ownerKey, digest);
        bytes memory sig = abi.encodePacked(r, s, v);
        assertEq(account.isValidSignature(hash, sig), ERC1271_MAGIC);
    }

    /// @dev V9-F1 fix: Session keys are NO LONGER authorized for ERC-1271 signatures.
    /// They bypass spend limits, targets, functions, and cooldowns when signing via ERC-1271.
    /// Only owner can sign ERC-1271 (same rationale as V8 agent key removal).
    function test_erc1271_sessionKeySignatureValid() public {
        vm.prank(ownerAddr);
        account.createSessionKey(sessionAddr, 0, block.timestamp + 1 hours, 5 ether, 0, 0, true);

        bytes32 hash = keccak256("test message");
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", account.domainSeparator(), hash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(sessionKeyPK, digest);
        bytes memory sig = abi.encodePacked(r, s, v);
        // V9-F1: Session keys must return INVALID for ERC-1271 (policy bypass prevention)
        assertEq(account.isValidSignature(hash, sig), ERC1271_INVALID);
    }

    function test_erc1271_expiredSessionKeyInvalid() public {
        vm.prank(ownerAddr);
        account.createSessionKey(sessionAddr, 0, block.timestamp + 1 hours, 5 ether, 0, 0, true);
        vm.warp(block.timestamp + 2 hours);

        bytes32 hash = keccak256("test message");
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", account.domainSeparator(), hash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(sessionKeyPK, digest);
        bytes memory sig = abi.encodePacked(r, s, v);
        assertEq(account.isValidSignature(hash, sig), ERC1271_INVALID);
    }

    function test_erc1271_revokedSessionKeyInvalid() public {
        vm.startPrank(ownerAddr);
        uint256 sid = account.createSessionKey(sessionAddr, 0, block.timestamp + 1 hours, 5 ether, 0, 0, true);
        account.revokeSessionKey(sid);
        vm.stopPrank();

        bytes32 hash = keccak256("test message");
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", account.domainSeparator(), hash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(sessionKeyPK, digest);
        bytes memory sig = abi.encodePacked(r, s, v);
        assertEq(account.isValidSignature(hash, sig), ERC1271_INVALID);
    }

    function test_erc1271_randomSignatureInvalid() public view {
        bytes32 hash = keccak256("test message");
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", account.domainSeparator(), hash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(randomKeyPK, digest);
        bytes memory sig = abi.encodePacked(r, s, v);
        assertEq(account.isValidSignature(hash, sig), ERC1271_INVALID);
    }

    function test_erc1271_invalidSignatureLength() public view {
        bytes32 hash = keccak256("test message");
        bytes memory sig = hex"deadbeef"; // 4 bytes, not 65
        assertEq(account.isValidSignature(hash, sig), ERC1271_INVALID);
    }

    function test_erc1271_crossChainReplayBlocked() public {
        // Sign on current chain (default chainId = 31337 in forge)
        bytes32 hash = keccak256("test message");
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", account.domainSeparator(), hash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(ownerKey, digest);
        bytes memory sig = abi.encodePacked(r, s, v);

        // Valid on current chain
        assertEq(account.isValidSignature(hash, sig), ERC1271_MAGIC);

        // Switch to a different chain — same signature must be INVALID
        vm.chainId(43114); // Avalanche mainnet
        assertEq(account.isValidSignature(hash, sig), ERC1271_INVALID);
    }

    function test_erc1271_domainSeparatorIncludesChainAndAddress() public view {
        bytes32 expected = keccak256(abi.encode(
            keccak256("EIP712Domain(uint256 chainId,address verifyingContract)"),
            block.chainid,
            address(account)
        ));
        assertEq(account.domainSeparator(), expected);
    }

    function test_erc1271_domainSeparatorChangesWithChain() public {
        bytes32 sep1 = account.domainSeparator();
        vm.chainId(43114);
        bytes32 sep2 = account.domainSeparator();
        assertTrue(sep1 != sep2);
    }

    // ═══════════════════════════════════════════════════════════
    //                      ERC-165 TESTS
    // ═══════════════════════════════════════════════════════════

    function test_erc165_supportsERC165() public view {
        assertTrue(account.supportsInterface(type(IERC165).interfaceId));
    }

    function test_erc165_supportsERC1271() public view {
        assertTrue(account.supportsInterface(type(IERC1271).interfaceId));
    }

    function test_erc165_supportsIAccount() public view {
        // IAccount (ERC-4337) = 0x60fc6b6e
        assertTrue(account.supportsInterface(0x60fc6b6e));
    }

    function test_erc165_doesNotSupportRandom() public view {
        assertFalse(account.supportsInterface(0xdeadbeef));
    }

    function test_erc165_supportsERC721Receiver() public view {
        assertTrue(account.supportsInterface(0x150b7a02));
    }

    function test_erc165_supportsERC1155Receiver() public view {
        assertTrue(account.supportsInterface(0x4e2312e0));
    }

    // ═══════════════════════════════════════════════════════════
    //                      NFT RECEIVE HOOKS
    // ═══════════════════════════════════════════════════════════

    function test_onERC721Received() public view {
        bytes4 result = account.onERC721Received(address(0), address(0), 1, "");
        assertEq(result, bytes4(0x150b7a02));
    }

    function test_onERC1155Received() public view {
        bytes4 result = account.onERC1155Received(address(0), address(0), 1, 1, "");
        assertEq(result, bytes4(0xf23a6e61));
    }

    function test_onERC1155BatchReceived() public view {
        uint256[] memory ids = new uint256[](2);
        uint256[] memory amounts = new uint256[](2);
        ids[0] = 1; ids[1] = 2;
        amounts[0] = 10; amounts[1] = 20;
        bytes4 result = account.onERC1155BatchReceived(address(0), address(0), ids, amounts, "");
        assertEq(result, bytes4(0xbc197c81));
    }

    // ═══════════════════════════════════════════════════════════
    //                      MULTICALL TESTS
    // ═══════════════════════════════════════════════════════════

    function test_multicall_addMultipleTargets() public {
        bytes[] memory calls = new bytes[](3);
        calls[0] = abi.encodeCall(account.setAllowedTarget, (address(0xBEEF), true));
        calls[1] = abi.encodeCall(account.setAllowedTarget, (address(0xCAFE), true));
        calls[2] = abi.encodeCall(account.setAllowedFunction, (bytes4(0x12345678), true));

        vm.prank(ownerAddr);
        account.multicall(calls);

        assertTrue(account.allowedTargets(address(0xBEEF)));
        assertTrue(account.allowedTargets(address(0xCAFE)));
        assertTrue(account.allowedFunctions(bytes4(0x12345678)));
    }

    function test_multicall_createSessionAndAddTargets() public {
        bytes[] memory calls = new bytes[](3);
        calls[0] = abi.encodeCall(account.setAllowedTarget, (address(0xBEEF), true));
        calls[1] = abi.encodeCall(account.setAllowedFunction, (bytes4(0xa9059cbb), true)); // transfer
        calls[2] = abi.encodeCall(account.createSessionKey, (sessionAddr, 0, block.timestamp + 1 hours, 5 ether, 0, 0, true));

        vm.prank(ownerAddr);
        account.multicall(calls);

        assertTrue(account.allowedTargets(address(0xBEEF)));
        assertTrue(account.isValidSessionKey(sessionAddr));
    }

    function test_multicall_nonOwnerReverts() public {
        bytes[] memory calls = new bytes[](1);
        calls[0] = abi.encodeCall(account.setAllowedTarget, (address(0xBEEF), true));

        vm.prank(agentAddr);
        vm.expectRevert();
        account.multicall(calls);
    }

    function test_multicall_emptyReverts() public {
        bytes[] memory calls = new bytes[](0);
        vm.prank(ownerAddr);
        vm.expectRevert();
        account.multicall(calls);
    }

    function test_multicall_tooLargeReverts() public {
        bytes[] memory calls = new bytes[](21);
        for (uint i = 0; i < 21; i++) {
            calls[i] = abi.encodeCall(account.setAllowedFunction, (bytes4(uint32(i)), true));
        }
        vm.prank(ownerAddr);
        vm.expectRevert();
        account.multicall(calls);
    }

    // ═══════════════════════════════════════════════════════════
    //                      SESSION KEY COOLDOWN TESTS
    // ═══════════════════════════════════════════════════════════

    function test_sessionKey_cooldown_stored() public {
        vm.prank(ownerAddr);
        uint256 sid = account.createSessionKey(sessionAddr, 0, block.timestamp + 1 hours, 5 ether, 0, 300, true);
        (,,,,,,uint256 cooldown,,, ) = account.getSessionKey(sid);
        assertEq(cooldown, 300);
    }

    function test_sessionKey_zeroCooldown_allowed() public {
        vm.prank(ownerAddr);
        uint256 sid = account.createSessionKey(sessionAddr, 0, block.timestamp + 1 hours, 5 ether, 0, 0, true);
        (,,,,,,uint256 cooldown,,, ) = account.getSessionKey(sid);
        assertEq(cooldown, 0);
    }
}
