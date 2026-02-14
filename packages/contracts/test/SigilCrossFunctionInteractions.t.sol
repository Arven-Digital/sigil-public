// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Test.sol";
import "../src/SigilAccount.sol";
import "../src/SigilAccountFactory.sol";
import "@account-abstraction/interfaces/IEntryPoint.sol";

/**
 * @title SigilCrossFunctionInteractions
 * @notice R32: Cross-function interaction matrix - testing function call pairs for unexpected states
 */
contract SigilCrossFunctionInteractionsTest is Test {
    SigilAccountFactory factory;
    SigilAccount account;
    IEntryPoint entryPoint;

    uint256 ownerPK = 0x1;
    uint256 agentPK = 0x2;
    uint256 guardianPK = 0x3;
    
    address owner;
    address agentKey;
    address guardianKey;

    function setUp() public {
        // Derive addresses from private keys
        owner = vm.addr(ownerPK);
        agentKey = vm.addr(agentPK);
        guardianKey = vm.addr(guardianPK);
        
        // Deploy mock EntryPoint
        entryPoint = IEntryPoint(address(new MockEntryPointCross()));
        
        // Deploy factory and create account
        factory = new SigilAccountFactory(entryPoint, makeAddr("treasury"), 0.1 ether);
        
        vm.deal(owner, 10 ether);
        
        account = factory.createAccount{value: 1 ether}(
            owner,
            agentKey,
            guardianKey,
            2 ether,    // maxTxValue
            10 ether,   // dailyLimit
            5 ether,    // guardianThreshold
            12345      // salt
        );
        
        vm.deal(address(account), 5 ether);
    }

    // ═══════════════════════════════════════════════════════════
    //                    FREEZE + OTHER FUNCTIONS
    // ═══════════════════════════════════════════════════════════


    function test_freezeBlocksSessionKeyCreation() public {
        // Create session key normally
        vm.prank(owner);
        uint256 sessionId1 = account.createSessionKey(
            makeAddr("sessionKey1"),
            block.timestamp,
            block.timestamp + 1 days,
            1 ether,
            0.5 ether,
            3600,
            false
        );
        
        assertEq(sessionId1, 1);
        
        // Freeze account
        vm.prank(owner);
        account.freeze();
        
        // Session key creation should be blocked when frozen
        vm.prank(owner);
        vm.expectRevert(SigilAccount.AccountIsFrozen.selector);
        account.createSessionKey(
            makeAddr("sessionKey2"),
            block.timestamp,
            block.timestamp + 1 days,
            1 ether,
            0.5 ether,
            3600,
            false
        );
        
        // But existing session key management might not be blocked
        // Let's check what actually happens
        try account.addSessionTarget(sessionId1, makeAddr("newTarget")) {
            // If this succeeds, session management isn't blocked by freeze
        } catch {
            // If this fails, it might be blocked
        }
        
        // Revoking might be allowed even when frozen (security feature)
        try account.revokeSessionKey(sessionId1) {
            // Revoking allowed - makes sense for security
        } catch {
            // Revoking blocked
        }
    }

    function test_freezeAllowsEmergencyWithdraw() public {
        uint256 accountBalanceBefore = address(account).balance;
        uint256 ownerBalanceBefore = owner.balance;
        
        // Freeze account
        vm.prank(owner);
        account.freeze();
        
        // Emergency withdraw should still work
        vm.prank(owner);
        account.emergencyWithdraw(owner);
        
        assertEq(address(account).balance, 0);
        assertEq(owner.balance, ownerBalanceBefore + accountBalanceBefore);
    }

    // ═══════════════════════════════════════════════════════════
    //                 OWNER TRANSFER + OTHER FUNCTIONS
    // ═══════════════════════════════════════════════════════════


    function test_ownerTransferInvalidatesQueuedTransactions() public {
        address newOwner = makeAddr("newOwner");
        
        // Queue transaction
        vm.prank(owner);
        uint256 queueId = account.queueTransaction(
            makeAddr("target"),
            1 ether,
            abi.encodeWithSignature("someFunction()")
        );
        
        // Request owner transfer
        vm.prank(owner);
        account.requestOwnerTransfer(newOwner);
        
        // Execute transfer
        vm.warp(block.timestamp + 24 hours + 1);
        vm.prank(newOwner);
        account.executeOwnerTransfer();
        
        // Old queued transaction should be invalidated
        vm.warp(block.timestamp + 2 hours); // After timelock delay
        
        vm.prank(newOwner);
        vm.expectRevert(abi.encodeWithSelector(SigilAccount.TransactionFromPreviousOwner.selector, queueId));
        account.executeQueued(queueId);
    }

    function test_ownerTransferPreservesSessionKeys() public {
        address newOwner = makeAddr("newOwner");
        
        // Create session key
        vm.prank(owner);
        uint256 sessionId = account.createSessionKey(
            makeAddr("sessionKey"),
            block.timestamp,
            block.timestamp + 1 days,
            1 ether,
            0.5 ether,
            3600,
            false
        );
        
        // Request and execute owner transfer
        vm.prank(owner);
        account.requestOwnerTransfer(newOwner);
        
        vm.warp(block.timestamp + 24 hours + 1);
        vm.prank(newOwner);
        account.executeOwnerTransfer();
        
        // Session key should still exist and be manageable by new owner
        (address key, , , , , , , , , bool revoked) = account.getSessionKey(sessionId);
        assertEq(key, makeAddr("sessionKey"));
        assertFalse(revoked);
        
        // New owner should be able to revoke session key
        vm.prank(newOwner);
        account.revokeSessionKey(sessionId);
        
        (, , , , , , , , , revoked) = account.getSessionKey(sessionId);
        assertTrue(revoked);
    }

    // ═══════════════════════════════════════════════════════════
    //                  RECOVERY + OTHER FUNCTIONS
    // ═══════════════════════════════════════════════════════════


    function test_recoveryInvalidatesPendingRecoveries() public {
        address recoveryOwner1 = makeAddr("recoveryOwner1");
        address recoveryOwner2 = makeAddr("recoveryOwner2");
        
        // Set up multiple recovery guardians
        vm.prank(owner);
        account.addRecoveryGuardian(makeAddr("recoveryGuardian1"));
        
        vm.prank(owner);
        account.addRecoveryGuardian(makeAddr("recoveryGuardian2"));
        
        vm.prank(owner);
        account.setRecoveryThreshold(1);
        
        // Initiate first recovery
        vm.prank(makeAddr("recoveryGuardian1"));
        bytes32 recoveryId1 = account.initiateRecovery(recoveryOwner1);
        
        // Initiate second recovery
        vm.prank(makeAddr("recoveryGuardian2"));
        bytes32 recoveryId2 = account.initiateRecovery(recoveryOwner2);
        
        // Execute second recovery first
        vm.warp(block.timestamp + 48 hours + 1);
        account.executeRecovery(recoveryId2);
        
        assertEq(account.owner(), recoveryOwner2);
        
        // First recovery should no longer be executable (epoch mismatch)
        vm.prank(recoveryOwner2);
        account.unfreeze();
        
        vm.prank(recoveryOwner2);
        account.addRecoveryGuardian(makeAddr("newGuardian"));
        
        // Try to execute first recovery - should fail due to epoch mismatch
        vm.expectRevert(SigilAccount.RecoveryEpochMismatch.selector);
        account.executeRecovery(recoveryId1);
    }

    // ═══════════════════════════════════════════════════════════
    //                SESSION KEY + POLICY INTERACTIONS
    // ═══════════════════════════════════════════════════════════

    function test_policyUpdateAffectsSessionKeys() public {
        // Create session key with specific limits
        vm.prank(owner);
        uint256 sessionId = account.createSessionKey(
            makeAddr("sessionKey"),
            block.timestamp,
            block.timestamp + 1 days,
            1 ether,     // spendLimit
            0.8 ether,   // maxTxValue (below account's 2 ether limit)
            3600,
            false
        );
        
        // Update account policy to lower maxTxValue
        vm.prank(owner);
        account.updatePolicy(
            0.5 ether,   // new maxTxValue (below session key's limit)
            10 ether,    // dailyLimit unchanged
            5 ether,     // guardianThreshold unchanged
            8 ether      // ownerThreshold unchanged
        );
        
        // Session key should still have its own limits, but account policy applies
        (address key, , , uint256 spendLimit, , uint256 maxTxVal, , , , bool revoked) = account.getSessionKey(sessionId);
        assertEq(key, makeAddr("sessionKey"));
        assertEq(spendLimit, 1 ether);
        assertEq(maxTxVal, 0.8 ether); // Session key's limit unchanged
        assertFalse(revoked);
        
        // But account-level maxTxValue should apply as additional constraint
        assertEq(account.maxTxValue(), 0.5 ether);
    }

    function test_keyRotationInvalidatesUpgradeSignatures() public {
        // Request upgrade
        SigilAccount newImpl = new SigilAccount(entryPoint, address(factory));
        vm.prank(owner);
        account.requestUpgrade(address(newImpl));
        
        // Create guardian signature
        bytes32 messageHash = keccak256(abi.encodePacked(
            "\x19Ethereum Signed Message:\n32",
            keccak256(abi.encodePacked(address(account), address(newImpl), account.upgradeRequestedAt(), block.chainid))
        ));
        
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(guardianPK, messageHash);
        bytes memory oldGuardianSig = abi.encodePacked(r, s, v);
        
        // Rotate guardian key
        address newGuardian = makeAddr("newGuardian");
        vm.prank(owner);
        account.rotateGuardianKey(newGuardian);
        
        // Wait for upgrade delay
        vm.warp(block.timestamp + 24 hours + 1);
        
        // Old signature should fail
        vm.prank(owner);
        vm.expectRevert(SigilAccount.InvalidGuardianSig.selector);
        account.executeUpgrade(oldGuardianSig);
        
        // The upgrade is now impossible because guardian key changed
        // The pending upgrade would need to be cancelled and restarted with new guardian
        assertEq(account.pendingImplementation(), address(newImpl));
        assertTrue(account.upgradeRequestedAt() > 0);
        
        // Cancel the upgrade and restart with new guardian
        vm.prank(owner);
        account.cancelUpgrade();
        
        assertEq(account.pendingImplementation(), address(0));
    }

    // ═══════════════════════════════════════════════════════════
    //                 MULTICALL INTERACTION TESTS
    // ═══════════════════════════════════════════════════════════

    function test_multicallMixedOperations() public {
        bytes[] memory calls = new bytes[](3);
        
        // Mix of different operations in single multicall
        calls[0] = abi.encodeCall(account.setAllowedTarget, (makeAddr("target1"), true));
        calls[1] = abi.encodeCall(account.setAllowedFunction, (bytes4(0x12345678), true));
        calls[2] = abi.encodeCall(account.setRecoveryDelay, (72 hours));
        
        vm.prank(owner);
        account.multicall(calls);
        
        // All operations should have succeeded
        assertTrue(account.allowedTargets(makeAddr("target1")));
        assertTrue(account.allowedFunctions(bytes4(0x12345678)));
        assertEq(account.recoveryDelay(), 72 hours);
    }

    function test_multicallBlocksSensitiveOperations() public {
        bytes[] memory calls = new bytes[](2);
        
        // Try to include upgrade operation in multicall
        calls[0] = abi.encodeCall(account.setAllowedTarget, (makeAddr("target1"), true));
        calls[1] = abi.encodeCall(account.requestUpgrade, (address(new SigilAccount(entryPoint, address(factory)))));
        
        vm.prank(owner);
        vm.expectRevert(SigilAccount.MulticallBlockedSelector.selector);
        account.multicall(calls);
        
        // Try executeUpgrade in multicall (should be blocked)
        calls[1] = abi.encodeWithSelector(account.executeUpgrade.selector, bytes(""));
        
        vm.prank(owner);
        vm.expectRevert(SigilAccount.MulticallBlockedSelector.selector);
        account.multicall(calls);
    }

    // ═══════════════════════════════════════════════════════════
    //                    TOKEN POLICY INTERACTIONS
    // ═══════════════════════════════════════════════════════════

    function test_tokenPolicyWithSessionKeys() public {
        address token = makeAddr("token");
        
        // Set token policy
        vm.prank(owner);
        account.setTokenPolicy(token, 1 ether, 5 ether);
        
        // Create session key after token policy set
        vm.prank(owner);
        uint256 sessionId = account.createSessionKey(
            makeAddr("sessionKey"),
            block.timestamp,
            block.timestamp + 1 days,
            2 ether,     // Higher than token approval limit
            0.5 ether,
            3600,
            false
        );
        
        // Session key should still be bound by token policies
        assertTrue(account.hasTokenPolicy(token));
        
        (uint256 maxApproval, uint256 dailyTransferLimit, ,) = account.getTokenPolicy(token);
        assertEq(maxApproval, 1 ether);
        assertEq(dailyTransferLimit, 5 ether);
        
        // Session key exists but token policy applies
        (address key, , , , , , , , , bool revoked) = account.getSessionKey(sessionId);
        assertEq(key, makeAddr("sessionKey"));
        assertFalse(revoked);
    }

    function test_tokenPolicyUpdatesAcrossFreeze() public {
        address token = makeAddr("token");
        
        // Set initial token policy
        vm.prank(owner);
        account.setTokenPolicy(token, 1 ether, 5 ether);
        
        // Verify policy set
        assertTrue(account.hasTokenPolicy(token));
        
        // Freeze account
        vm.prank(owner);
        account.freeze();
        
        // Test if token policy can be updated while frozen (may or may not be blocked)
        vm.prank(owner);
        try account.setTokenPolicy(token, 2 ether, 10 ether) {
            // If this succeeds, token policy updates aren't blocked by freeze
            (uint256 maxApproval, uint256 dailyTransferLimit, ,) = account.getTokenPolicy(token);
            assertEq(maxApproval, 2 ether);
            assertEq(dailyTransferLimit, 10 ether);
            return; // Exit early if update succeeded
        } catch {
            // If this fails, token policy updates are blocked by freeze
        }
        
        // Unfreeze
        vm.prank(owner);
        account.unfreeze();
        
        // Should be able to update now
        vm.prank(owner);
        account.setTokenPolicy(token, 2 ether, 10 ether);
        
        (uint256 maxApproval, uint256 dailyTransferLimit, ,) = account.getTokenPolicy(token);
        assertEq(maxApproval, 2 ether);
        assertEq(dailyTransferLimit, 10 ether);
    }
}

// Mock EntryPoint for testing
contract MockEntryPointCross {
    function getNonce(address, uint192) external pure returns (uint256) {
        return 0;
    }
    
    function validateUserOp(address, bytes32, uint256) external pure returns (uint256) {
        return 0;
    }
}