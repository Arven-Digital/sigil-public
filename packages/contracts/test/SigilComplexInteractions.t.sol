// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Test.sol";
import "../src/SigilAccount.sol";
import "../src/SigilAccountFactory.sol";
import "@account-abstraction/interfaces/IEntryPoint.sol";

/**
 * @title SigilComplexInteractions
 * @notice R33: Complex interaction chains, state dependencies, advanced edge cases
 */
contract SigilComplexInteractionsTest is Test {
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
        entryPoint = IEntryPoint(address(new MockEntryPointComplex()));
        
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
    //              COMPLEX POLICY + SESSION CHAINS
    // ═══════════════════════════════════════════════════════════

    function test_sessionKeyPolicyUpdateChain() public {
        // Step 1: Create multiple session keys with different limits
        vm.prank(owner);
        uint256 sessionId1 = account.createSessionKey(
            makeAddr("sessionKey1"),
            block.timestamp,
            block.timestamp + 1 days,
            1 ether,     // spendLimit
            0.5 ether,   // maxTxValue
            3600,        // cooldown
            false        // allowAllTargets
        );
        
        vm.prank(owner);
        uint256 sessionId2 = account.createSessionKey(
            makeAddr("sessionKey2"),
            block.timestamp,
            block.timestamp + 2 days,
            3 ether,     // spendLimit  
            1.5 ether,   // maxTxValue
            1800,        // cooldown
            true         // allowAllTargets
        );
        
        // Step 2: Update account policy to more restrictive values
        vm.prank(owner);
        account.updatePolicy(
            0.3 ether,   // maxTxValue (more restrictive than sessions)
            8 ether,     // dailyLimit
            4 ether,     // guardianThreshold
            7 ether      // ownerThreshold
        );
        
        // Step 3: Verify session keys are affected by account policy
        (address key1, , , uint256 spendLimit1, , uint256 maxTxVal1, , , , bool revoked1) = account.getSessionKey(sessionId1);
        (address key2, , , uint256 spendLimit2, , uint256 maxTxVal2, , , , bool revoked2) = account.getSessionKey(sessionId2);
        
        assertEq(key1, makeAddr("sessionKey1"));
        assertEq(key2, makeAddr("sessionKey2"));
        assertFalse(revoked1);
        assertFalse(revoked2);
        
        // Session keys retain their own limits but account limits apply
        assertEq(spendLimit1, 1 ether);
        assertEq(spendLimit2, 3 ether);
        assertEq(maxTxVal1, 0.5 ether);
        assertEq(maxTxVal2, 1.5 ether);
        
        // But account maxTxValue is now 0.3 ether (more restrictive)
        assertEq(account.maxTxValue(), 0.3 ether);
        
        // Step 4: Add token policy that further restricts
        address token = makeAddr("restrictedToken");
        vm.prank(owner);
        account.setTokenPolicy(token, 0.1 ether, 2 ether); // Even more restrictive for this token
        
        assertTrue(account.hasTokenPolicy(token));
        (uint256 maxApproval, uint256 dailyTransferLimit, , ) = account.tokenAllowances(token);
        assertEq(maxApproval, 0.1 ether);
        assertEq(dailyTransferLimit, 2 ether);
    }

    function test_multipleSessionKeysWithTargetsAndFunctions() public {
        // Create session key with specific targets and functions
        vm.prank(owner);
        uint256 sessionId = account.createSessionKey(
            makeAddr("sessionKey"),
            block.timestamp,
            block.timestamp + 1 days,
            2 ether,
            1 ether,
            3600,
            false  // allowAllTargets = false, need specific targets
        );
        
        address target1 = makeAddr("target1");
        address target2 = makeAddr("target2");
        bytes4 func1 = bytes4(0x12345678);
        bytes4 func2 = bytes4(0x87654321);
        
        // Add targets and functions using multicall
        bytes[] memory calls = new bytes[](6);
        calls[0] = abi.encodeCall(account.addSessionTarget, (sessionId, target1));
        calls[1] = abi.encodeCall(account.addSessionTarget, (sessionId, target2));
        calls[2] = abi.encodeCall(account.addSessionFunction, (sessionId, func1));
        calls[3] = abi.encodeCall(account.addSessionFunction, (sessionId, func2));
        calls[4] = abi.encodeCall(account.setAllowedTarget, (target1, true));
        calls[5] = abi.encodeCall(account.setAllowedFunction, (func1, true));
        
        vm.prank(owner);
        account.multicall(calls);
        
        // Verify session configuration
        assertTrue(account.sessionAllowedTargets(sessionId, target1));
        assertTrue(account.sessionAllowedTargets(sessionId, target2));
        assertTrue(account.sessionAllowedFunctions(sessionId, func1));
        assertTrue(account.sessionAllowedFunctions(sessionId, func2));
        
        // Verify account-level allowlists
        assertTrue(account.allowedTargets(target1));
        assertTrue(account.allowedFunctions(func1));
        assertFalse(account.allowedTargets(target2));  // Not in account allowlist
        assertFalse(account.allowedFunctions(func2));  // Not in account allowlist
    }

    // ═══════════════════════════════════════════════════════════
    //              RECOVERY + GUARDIAN MANAGEMENT CHAINS  
    // ═══════════════════════════════════════════════════════════


    function test_guardianThresholdAdjustmentChain() public {
        address guardian1 = makeAddr("guardian1");
        address guardian2 = makeAddr("guardian2");
        address guardian3 = makeAddr("guardian3");
        
        // Step 1: Add guardians one by one, threshold auto-adjusts
        vm.prank(owner);
        account.addRecoveryGuardian(guardian1);
        assertEq(account.recoveryThreshold(), 1); // Auto-set to 1
        
        vm.prank(owner);
        account.addRecoveryGuardian(guardian2);
        assertEq(account.recoveryThreshold(), 1); // Remains 1
        
        vm.prank(owner);
        account.addRecoveryGuardian(guardian3);
        assertEq(account.recoveryThreshold(), 1); // Still 1
        
        // Step 2: Manually increase threshold
        vm.prank(owner);
        account.setRecoveryThreshold(3); // Require all 3
        assertEq(account.recoveryThreshold(), 3);
        
        // Step 3: Remove one guardian, verify threshold auto-adjusts
        vm.prank(owner);
        account.removeRecoveryGuardian(guardian3);
        assertEq(account.recoveryThreshold(), 2); // Auto-reduced to 2 (max possible)
        
        // Step 4: Remove another guardian
        vm.prank(owner);
        account.removeRecoveryGuardian(guardian2);
        assertEq(account.recoveryThreshold(), 1); // Auto-reduced to 1
        
        // Verify remaining guardian can still initiate recovery
        vm.prank(guardian1);
        bytes32 recoveryId = account.initiateRecovery(makeAddr("newOwner"));
        
        (, uint256 supportCount, , , , ) = account.getRecoveryStatus(recoveryId);
        assertEq(supportCount, 1); // Guardian1 automatically supports
        
        vm.warp(block.timestamp + 48 hours + 1);
        account.executeRecovery(recoveryId);
        assertEq(account.owner(), makeAddr("newOwner"));
    }

    // ═══════════════════════════════════════════════════════════
    //              QUEUE + TIMELOCK INTERACTION CHAINS
    // ═══════════════════════════════════════════════════════════



    // ═══════════════════════════════════════════════════════════
    //              VELOCITY TRACKING + POLICY CHAINS
    // ═══════════════════════════════════════════════════════════

    function test_velocityTrackingAcrossTokenPolicies() public {
        address token1 = makeAddr("token1");
        address token2 = makeAddr("token2");
        
        // Step 1: Set up different token policies
        vm.prank(owner);
        account.setTokenPolicy(token1, 1 ether, 3 ether); // Max 1 ETH approval, 3 ETH daily
        
        vm.prank(owner);
        account.setTokenPolicy(token2, 0.5 ether, 2 ether); // Max 0.5 ETH approval, 2 ETH daily
        
        // Step 2: Verify policies are independent
        (uint256 maxApproval1, uint256 dailyLimit1, uint256 dailySpent1, uint256 resetTime1) = account.tokenAllowances(token1);
        (uint256 maxApproval2, uint256 dailyLimit2, uint256 dailySpent2, uint256 resetTime2) = account.tokenAllowances(token2);
        
        assertEq(maxApproval1, 1 ether);
        assertEq(dailyLimit1, 3 ether);
        assertEq(dailySpent1, 0);
        
        assertEq(maxApproval2, 0.5 ether);
        assertEq(dailyLimit2, 2 ether);
        assertEq(dailySpent2, 0);
        
        // Step 3: Test daily reset timing alignment
        uint256 currentTime = block.timestamp;
        uint256 expectedResetTime = ((currentTime / 1 days) + 1) * 1 days;
        
        // Both tokens should have same daily reset time (aligned to day boundary)
        assertTrue(resetTime1 == expectedResetTime || resetTime1 == 0); // 0 means no transfers yet
        assertTrue(resetTime2 == expectedResetTime || resetTime2 == 0);
        
        // Step 4: Update account daily limit and verify account-level tracking
        uint256 initialAccountSpent = account.dailySpent();
        uint256 initialAccountReset = account.dailyResetTime();
        
        assertEq(initialAccountSpent, 0);
        assertTrue(initialAccountReset >= currentTime);
        
        // Step 5: Remove one token policy and verify cleanup
        vm.prank(owner);
        account.removeTokenPolicy(token1);
        
        assertFalse(account.hasTokenPolicy(token1));
        assertTrue(account.hasTokenPolicy(token2));
        
        // Removed token should have zero values
        (maxApproval1, dailyLimit1, dailySpent1, resetTime1) = account.tokenAllowances(token1);
        assertEq(maxApproval1, 0);
        assertEq(dailyLimit1, 0);
        assertEq(dailySpent1, 0);
        assertEq(resetTime1, 0);
    }

    function test_dailyLimitResetBehavior() public {
        // Step 1: Set specific account policy
        vm.prank(owner);
        account.updatePolicy(
            1 ether,    // maxTxValue
            5 ether,    // dailyLimit
            3 ether,    // guardianThreshold
            6 ether     // ownerThreshold
        );
        
        uint256 startTime = block.timestamp;
        
        // Step 2: Verify initial daily tracking state
        assertEq(account.dailySpent(), 0);
        
        uint256 expectedResetTime = ((startTime / 1 days) + 1) * 1 days;
        assertEq(account.dailyResetTime(), expectedResetTime);
        
        // Step 3: Simulate time progression across day boundary
        vm.warp(expectedResetTime + 1); // Next day + 1 second
        
        // Step 4: Create new session key to test daily reset in different context
        vm.prank(owner);
        uint256 sessionId = account.createSessionKey(
            makeAddr("sessionKey"),
            block.timestamp,
            block.timestamp + 1 days,
            2 ether,     // spendLimit
            0.8 ether,   // maxTxValue
            1800,        // cooldown
            false
        );
        
        // Step 5: Verify session key created successfully and has correct limits
        (address key, , , uint256 spendLimit, uint256 spent, uint256 maxTxVal, , , , bool revoked) = account.getSessionKey(sessionId);
        assertEq(key, makeAddr("sessionKey"));
        assertEq(spendLimit, 2 ether);
        assertEq(spent, 0);
        assertEq(maxTxVal, 0.8 ether);
        assertFalse(revoked);
        
        // Step 6: Verify account daily limit reset for new day
        uint256 newExpectedReset = ((block.timestamp / 1 days) + 1) * 1 days;
        assertEq(account.dailyResetTime(), newExpectedReset);
        assertEq(account.dailySpent(), 0); // Should be reset for new day
    }

    // ═══════════════════════════════════════════════════════════
    //              COMPREHENSIVE STATE VALIDATION
    // ═══════════════════════════════════════════════════════════

    function test_complexStateTransitionChain() public {
        address guardian1 = makeAddr("guardian1");
        address newOwner = makeAddr("newOwner");
        address token = makeAddr("token");
        
        // Step 1: Set up complex initial state
        vm.prank(owner);
        account.addRecoveryGuardian(guardian1);
        
        vm.prank(owner);
        account.setRecoveryThreshold(1);
        
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
        
        vm.prank(owner);
        account.setTokenPolicy(token, 0.5 ether, 2 ether);
        
        vm.prank(owner);
        uint256 queueId = account.queueTransaction(
            makeAddr("target"),
            0.1 ether,
            abi.encodeWithSignature("test()")
        );
        
        // Step 2: Initiate recovery (major state change)
        vm.prank(guardian1);
        bytes32 recoveryId = account.initiateRecovery(newOwner);
        
        // Step 3: Execute recovery
        vm.warp(block.timestamp + 48 hours + 1);
        account.executeRecovery(recoveryId);
        
        // Step 4: Verify all state after recovery
        assertEq(account.owner(), newOwner);
        assertTrue(account.isFrozen());
        
        // Queued transaction should be invalidated
        // After recovery, account is frozen, so might get AccountIsFrozen error first
        vm.prank(newOwner);
        try account.executeQueued(queueId) {
            // If it doesn't revert, that's unexpected
            assertTrue(false, "Expected executeQueued to revert");
        } catch (bytes memory reason) {
            // Should revert with either AccountIsFrozen or TransactionFromPreviousOwner
            bytes4 selector = bytes4(reason);
            assertTrue(
                selector == SigilAccount.AccountIsFrozen.selector || 
                selector == SigilAccount.TransactionFromPreviousOwner.selector,
                "Should revert with AccountIsFrozen or TransactionFromPreviousOwner"
            );
        }
        
        // Session keys should still exist but new owner controls them
        (address key, , , , , , , , , bool revoked) = account.getSessionKey(sessionId);
        assertEq(key, makeAddr("sessionKey"));
        assertFalse(revoked);
        
        // Token policies should persist
        assertTrue(account.hasTokenPolicy(token));
        (uint256 maxApproval, uint256 dailyLimit, , ) = account.tokenAllowances(token);
        assertEq(maxApproval, 0.5 ether);
        assertEq(dailyLimit, 2 ether);
        
        // Step 5: New owner unfreezes and manages account
        vm.prank(newOwner);
        account.unfreeze();
        assertFalse(account.isFrozen());
        
        // New owner can revoke old session keys
        vm.prank(newOwner);
        account.revokeSessionKey(sessionId);
        
        (, , , , , , , , , revoked) = account.getSessionKey(sessionId);
        assertTrue(revoked);
        
        // New owner can update policies
        vm.prank(newOwner);
        account.updatePolicy(
            1.5 ether,   // maxTxValue
            8 ether,     // dailyLimit
            4 ether,     // guardianThreshold
            7 ether      // ownerThreshold
        );
        
        assertEq(account.maxTxValue(), 1.5 ether);
        assertEq(account.dailyLimit(), 8 ether);
    }
}

// Mock EntryPoint for testing
contract MockEntryPointComplex {
    function getNonce(address, uint192) external pure returns (uint256) {
        return 0;
    }
    
    function validateUserOp(address, bytes32, uint256) external pure returns (uint256) {
        return 0;
    }
}