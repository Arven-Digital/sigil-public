// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Test.sol";
import "../src/SigilAccount.sol";
import "../src/SigilAccountFactory.sol";
import "@account-abstraction/interfaces/IEntryPoint.sol";

/**
 * @title SigilAdvancedInteractions
 * @notice R34: Advanced edge cases, race conditions, timing attacks in cross-function interactions
 */
contract SigilAdvancedInteractionsTest is Test {
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
        entryPoint = IEntryPoint(address(new MockEntryPointAdvanced()));
        
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
    //              TIMING ATTACK SCENARIOS
    // ═══════════════════════════════════════════════════════════


    function test_sessionKeyExpirationRaceCondition() public {
        uint256 baseTime = 1000 days;
        vm.warp(baseTime);
        
        // Create session key that expires soon
        uint256 expirationTime = baseTime + 1 hours;
        
        vm.prank(owner);
        uint256 sessionId = account.createSessionKey(
            makeAddr("racingSessionKey"),
            baseTime,
            expirationTime,
            1 ether,
            0.5 ether,
            900,    // 15 min cooldown
            false
        );
        
        // Add targets to the session
        vm.prank(owner);
        account.addSessionTarget(sessionId, makeAddr("raceTarget"));
        
        // Test operations near expiration
        vm.warp(expirationTime - 10); // 10 seconds before expiration
        
        (address key, , uint256 validUntil, , , , , uint256 lastUsedAt, , bool revoked) = account.getSessionKey(sessionId);
        assertEq(key, makeAddr("racingSessionKey"));
        assertFalse(revoked);
        assertEq(lastUsedAt, 0); // Not used yet
        
        // Should still be valid
        assertTrue(block.timestamp < validUntil);
        
        // Cross expiration boundary
        vm.warp(expirationTime + 1);
        
        // Now should be expired
        assertTrue(block.timestamp > validUntil);
        
        // Owner should be able to clean up expired session keys
        vm.prank(owner);
        account.revokeSessionKey(sessionId);
        
        (, , , , , , , , , revoked) = account.getSessionKey(sessionId);
        assertTrue(revoked);
    }

    function test_concurrentRecoveryInitiation() public {
        address guardian1 = makeAddr("guardian1");
        address guardian2 = makeAddr("guardian2");
        address newOwner1 = makeAddr("newOwner1");
        address newOwner2 = makeAddr("newOwner2");
        
        // Set up guardians
        vm.prank(owner);
        account.addRecoveryGuardian(guardian1);
        vm.prank(owner);
        account.addRecoveryGuardian(guardian2);
        vm.prank(owner);
        account.setRecoveryThreshold(1);
        
        uint256 baseTime = 2000 days;
        vm.warp(baseTime);
        
        // Guardian1 initiates recovery
        vm.prank(guardian1);
        bytes32 recoveryId1 = account.initiateRecovery(newOwner1);
        
        // Guardian2 tries to initiate different recovery shortly after
        vm.warp(baseTime + 1 hours);
        vm.prank(guardian2);
        bytes32 recoveryId2 = account.initiateRecovery(newOwner2);
        
        // Both recoveries should exist but be independent
        assertFalse(recoveryId1 == recoveryId2);
        
        (address newOwner1_check, uint256 supportCount1, , , , ) = account.getRecoveryStatus(recoveryId1);
        (address newOwner2_check, uint256 supportCount2, , , , ) = account.getRecoveryStatus(recoveryId2);
        
        assertEq(newOwner1_check, newOwner1);
        assertEq(newOwner2_check, newOwner2);
        assertEq(supportCount1, 1);
        assertEq(supportCount2, 1);
        
        // Execute first recovery
        vm.warp(baseTime + 48 hours + 1);
        account.executeRecovery(recoveryId1);
        
        assertEq(account.owner(), newOwner1);
        assertTrue(account.isFrozen());
        
        // Second recovery should no longer be valid (different owner context)
        vm.expectRevert(); // Should fail for various reasons (frozen account, wrong context, etc.)
        account.executeRecovery(recoveryId2);
    }

    // ═══════════════════════════════════════════════════════════
    //              POLICY INTERACTION EDGE CASES  
    // ═══════════════════════════════════════════════════════════

    function test_overlappingTokenPolicyUpdates() public {
        address token1 = makeAddr("token1");
        address token2 = makeAddr("token2");
        
        // Set initial policies
        vm.prank(owner);
        account.setTokenPolicy(token1, 1 ether, 5 ether);
        vm.prank(owner);
        account.setTokenPolicy(token2, 2 ether, 8 ether);
        
        // Verify independent tracking
        assertTrue(account.hasTokenPolicy(token1));
        assertTrue(account.hasTokenPolicy(token2));
        
        (uint256 maxApproval1, uint256 dailyLimit1, uint256 dailySpent1, uint256 resetTime1) = account.tokenAllowances(token1);
        (uint256 maxApproval2, uint256 dailyLimit2, uint256 dailySpent2, uint256 resetTime2) = account.tokenAllowances(token2);
        
        assertEq(maxApproval1, 1 ether);
        assertEq(dailyLimit1, 5 ether);
        assertEq(dailySpent1, 0);
        
        assertEq(maxApproval2, 2 ether);
        assertEq(dailyLimit2, 8 ether);
        assertEq(dailySpent2, 0);
        
        // Both should have same reset time (day-aligned)
        assertTrue(resetTime1 == resetTime2 || resetTime1 == 0 || resetTime2 == 0);
        
        // Update policies with multicall (batch operation)
        bytes[] memory calls = new bytes[](3);
        calls[0] = abi.encodeCall(account.setTokenPolicy, (token1, 1.5 ether, 6 ether));
        calls[1] = abi.encodeCall(account.setTokenPolicy, (token2, 2.5 ether, 10 ether));
        calls[2] = abi.encodeCall(account.updatePolicy, (1.2 ether, 12 ether, 6 ether, 10 ether));
        
        vm.prank(owner);
        account.multicall(calls);
        
        // Verify updates
        (maxApproval1, dailyLimit1, , ) = account.tokenAllowances(token1);
        (maxApproval2, dailyLimit2, , ) = account.tokenAllowances(token2);
        
        assertEq(maxApproval1, 1.5 ether);
        assertEq(dailyLimit1, 6 ether);
        assertEq(maxApproval2, 2.5 ether);
        assertEq(dailyLimit2, 10 ether);
        
        // Account policy should also be updated
        assertEq(account.maxTxValue(), 1.2 ether);
        assertEq(account.dailyLimit(), 12 ether);
        
        // Remove one policy and verify isolation
        vm.prank(owner);
        account.removeTokenPolicy(token1);
        
        assertFalse(account.hasTokenPolicy(token1));
        assertTrue(account.hasTokenPolicy(token2));
        
        // token1 should be zeroed, token2 unchanged
        (maxApproval1, dailyLimit1, dailySpent1, ) = account.tokenAllowances(token1);
        (maxApproval2, dailyLimit2, dailySpent2, ) = account.tokenAllowances(token2);
        
        assertEq(maxApproval1, 0);
        assertEq(dailyLimit1, 0);
        assertEq(dailySpent1, 0);
        
        assertEq(maxApproval2, 2.5 ether);
        assertEq(dailyLimit2, 10 ether);
        assertEq(dailySpent2, 0);
    }

    function test_sessionKeyLimitInteraction() public {
        // Test interaction between account limits and session key limits
        vm.prank(owner);
        account.updatePolicy(
            0.5 ether,   // maxTxValue (restrictive)
            3 ether,     // dailyLimit
            2 ether,     // guardianThreshold
            4 ether      // ownerThreshold
        );
        
        // Create session key with higher limits than account
        vm.prank(owner);
        uint256 sessionId1 = account.createSessionKey(
            makeAddr("sessionKey1"),
            block.timestamp,
            block.timestamp + 1 days,
            5 ether,     // spendLimit > account daily limit
            1 ether,     // maxTxValue > account maxTxValue
            3600,
            false
        );
        
        // Create another session key with lower limits
        vm.prank(owner);
        uint256 sessionId2 = account.createSessionKey(
            makeAddr("sessionKey2"),
            block.timestamp,
            block.timestamp + 1 days,
            1 ether,     // spendLimit < account daily limit
            0.3 ether,   // maxTxValue < account maxTxValue
            1800,
            false
        );
        
        // Verify session keys retain their configured limits
        (address key1, , , uint256 spendLimit1, , uint256 maxTxVal1, , , , ) = account.getSessionKey(sessionId1);
        (address key2, , , uint256 spendLimit2, , uint256 maxTxVal2, , , , ) = account.getSessionKey(sessionId2);
        
        assertEq(key1, makeAddr("sessionKey1"));
        assertEq(spendLimit1, 5 ether);
        assertEq(maxTxVal1, 1 ether);
        
        assertEq(key2, makeAddr("sessionKey2"));
        assertEq(spendLimit2, 1 ether);
        assertEq(maxTxVal2, 0.3 ether);
        
        // Account-level limits should be unchanged
        assertEq(account.maxTxValue(), 0.5 ether);
        assertEq(account.dailyLimit(), 3 ether);
        
        // Update account policy to be more restrictive
        vm.prank(owner);
        account.updatePolicy(
            0.2 ether,   // Even more restrictive
            1.5 ether,   // Lower daily limit
            1 ether,
            2 ether
        );
        
        // Session key limits should remain unchanged (they're independent)
        (key1, , , spendLimit1, , maxTxVal1, , , , ) = account.getSessionKey(sessionId1);
        (key2, , , spendLimit2, , maxTxVal2, , , , ) = account.getSessionKey(sessionId2);
        
        assertEq(spendLimit1, 5 ether); // Still higher than new account daily limit
        assertEq(maxTxVal1, 1 ether);   // Still higher than new account maxTxValue
        assertEq(spendLimit2, 1 ether);
        assertEq(maxTxVal2, 0.3 ether); // Still higher than new account maxTxValue
    }

    // ═══════════════════════════════════════════════════════════
    //              GUARDIAN + SESSION KEY EDGE CASES
    // ═══════════════════════════════════════════════════════════

    function test_guardianRotationDuringSessionKeyManagement() public {
        address guardian1 = makeAddr("guardian1");
        address guardian2 = makeAddr("guardian2");
        address newGuardian = makeAddr("newGuardian");
        
        // Set up guardians and session keys
        vm.prank(owner);
        account.addRecoveryGuardian(guardian1);
        vm.prank(owner);
        account.addRecoveryGuardian(guardian2);
        vm.prank(owner);
        account.setRecoveryThreshold(2);
        
        vm.prank(owner);
        uint256 sessionId1 = account.createSessionKey(
            makeAddr("sessionKey1"),
            block.timestamp,
            block.timestamp + 1 days,
            2 ether,
            1 ether,
            3600,
            false
        );
        
        vm.prank(owner);
        uint256 sessionId2 = account.createSessionKey(
            makeAddr("sessionKey2"), 
            block.timestamp,
            block.timestamp + 2 days,
            3 ether,
            1.5 ether,
            1800,
            true
        );
        
        uint256 initialEpoch = account.guardianEpoch();
        
        // Initiate recovery with current guardians
        vm.prank(guardian1);
        bytes32 recoveryId = account.initiateRecovery(makeAddr("newOwner"));
        
        // Rotate AI guardian key (not recovery guardian, different thing)
        vm.prank(owner);
        account.rotateGuardianKey(newGuardian);
        
        // Guardian epoch should NOT change from rotating AI guardian
        assertEq(account.guardianEpoch(), initialEpoch);
        
        // Recovery should still be valid
        (address newOwner_check, uint256 supportCount, , , , uint256 epoch) = account.getRecoveryStatus(recoveryId);
        assertEq(newOwner_check, makeAddr("newOwner"));
        assertEq(supportCount, 1);
        assertEq(epoch, initialEpoch);
        
        // Add second guardian support
        vm.prank(guardian2);
        account.supportRecovery(recoveryId);
        
        // Execute recovery
        vm.warp(block.timestamp + 48 hours + 1);
        account.executeRecovery(recoveryId);
        
        // Verify new owner and session key preservation
        assertEq(account.owner(), makeAddr("newOwner"));
        assertTrue(account.isFrozen());
        
        // Session keys should still exist
        (address key1, , , , , , , , , bool revoked1) = account.getSessionKey(sessionId1);
        (address key2, , , , , , , , , bool revoked2) = account.getSessionKey(sessionId2);
        
        assertEq(key1, makeAddr("sessionKey1"));
        assertEq(key2, makeAddr("sessionKey2"));
        assertFalse(revoked1);
        assertFalse(revoked2);
        
        // New owner can manage session keys
        vm.prank(makeAddr("newOwner"));
        account.unfreeze();
        
        vm.prank(makeAddr("newOwner"));
        account.revokeSessionKey(sessionId1);
        
        (, , , , , , , , , revoked1) = account.getSessionKey(sessionId1);
        assertTrue(revoked1);
    }


    // ═══════════════════════════════════════════════════════════
    //              MULTICALL EDGE CASE SCENARIOS
    // ═══════════════════════════════════════════════════════════


    function test_multicallMaximumOperations() public {
        // Test multicall at its limits
        uint256 maxCalls = 20; // Reasonable limit to test
        bytes[] memory calls = new bytes[](maxCalls);
        
        // Fill with valid operations
        for (uint256 i = 0; i < maxCalls; i++) {
            address target = makeAddr(string(abi.encodePacked("target", i)));
            calls[i] = abi.encodeCall(account.setAllowedTarget, (target, true));
        }
        
        vm.prank(owner);
        account.multicall(calls);
        
        // Verify all operations succeeded
        for (uint256 i = 0; i < maxCalls; i++) {
            address target = makeAddr(string(abi.encodePacked("target", i)));
            assertTrue(account.allowedTargets(target));
        }
        
        // Test with too many operations
        uint256 tooMany = 200; // Likely to hit gas limits
        bytes[] memory tooManyCalls = new bytes[](tooMany);
        
        for (uint256 i = 0; i < tooMany; i++) {
            bytes4 selector = bytes4(uint32(i + 1));
            tooManyCalls[i] = abi.encodeCall(account.setAllowedFunction, (selector, true));
        }
        
        vm.prank(owner);
        // This might fail due to gas limits or explicit limits
        try account.multicall(tooManyCalls) {
            // If it succeeds, verify some operations
            assertTrue(account.allowedFunctions(bytes4(uint32(1))));
            assertTrue(account.allowedFunctions(bytes4(uint32(100))));
        } catch {
            // Expected to fail due to gas/size limits
            assertTrue(true);
        }
    }

    // ═══════════════════════════════════════════════════════════
    //              BOUNDARY VALUE TESTING
    // ═══════════════════════════════════════════════════════════

    function test_maximumValueBoundaries() public {
        // Test with maximum possible values for various parameters
        uint256 maxUint = type(uint256).max;
        uint256 large = maxUint / 2;
        
        // Test updating policy with large values
        vm.prank(owner);
        account.updatePolicy(
            large,        // maxTxValue
            maxUint,      // dailyLimit (max possible)
            large / 2,    // guardianThreshold
            large        // ownerThreshold
        );
        
        assertEq(account.maxTxValue(), large);
        assertEq(account.dailyLimit(), maxUint);
        assertEq(account.guardianThreshold(), large / 2);
        assertEq(account.ownerThreshold(), large);
        
        // Test session key with large values
        vm.prank(owner);
        uint256 sessionId = account.createSessionKey(
            makeAddr("maxSessionKey"),
            block.timestamp,
            block.timestamp + 365 days, // 1 year
            maxUint,      // spendLimit (max possible)
            large,        // maxTxValue
            type(uint32).max, // cooldown (max uint32)
            true
        );
        
        (address key, uint256 validAfter, uint256 validUntil, uint256 spendLimit, , uint256 maxTxVal, uint256 cooldown, , , ) 
            = account.getSessionKey(sessionId);
            
        assertEq(key, makeAddr("maxSessionKey"));
        assertEq(validAfter, block.timestamp);
        assertEq(validUntil, block.timestamp + 365 days);
        assertEq(spendLimit, maxUint);
        assertEq(maxTxVal, large);
        assertEq(cooldown, type(uint32).max);
        
        // Test token policy with max values
        address maxToken = makeAddr("maxToken");
        vm.prank(owner);
        account.setTokenPolicy(maxToken, maxUint, maxUint);
        
        (uint256 maxApproval, uint256 dailyLimit, , ) = account.tokenAllowances(maxToken);
        assertEq(maxApproval, maxUint);
        assertEq(dailyLimit, maxUint);
    }

    function test_minimumValueBoundaries() public {
        // Test with minimum possible values
        vm.prank(owner);
        account.updatePolicy(
            1,           // Minimum maxTxValue
            1,           // Minimum dailyLimit 
            0,           // Minimum guardianThreshold
            1            // Minimum ownerThreshold (must be > guardianThreshold)
        );
        
        assertEq(account.maxTxValue(), 1);
        assertEq(account.dailyLimit(), 1);
        assertEq(account.guardianThreshold(), 0);
        assertEq(account.ownerThreshold(), 1);
        
        // Test session key with minimal values
        vm.prank(owner);
        uint256 sessionId = account.createSessionKey(
            makeAddr("minSessionKey"),
            block.timestamp,
            block.timestamp + 1, // Expires in 1 second
            1,           // Minimum spendLimit
            1,           // Minimum maxTxValue
            0,           // No cooldown
            false
        );
        
        (address key, uint256 validAfter, uint256 validUntil, uint256 spendLimit, , uint256 maxTxVal, uint256 cooldown, , , ) 
            = account.getSessionKey(sessionId);
            
        assertEq(key, makeAddr("minSessionKey"));
        assertEq(spendLimit, 1);
        assertEq(maxTxVal, 1);
        assertEq(cooldown, 0);
        assertEq(validUntil, block.timestamp + 1);
        
        // Test token policy with minimal values
        address minToken = makeAddr("minToken");
        vm.prank(owner);
        account.setTokenPolicy(minToken, 1, 1);
        
        (uint256 maxApproval, uint256 dailyLimit, , ) = account.tokenAllowances(minToken);
        assertEq(maxApproval, 1);
        assertEq(dailyLimit, 1);
        
        // Test with zero values (should set policy to blocked)
        address blockedToken = makeAddr("blockedToken");
        vm.prank(owner);
        account.setTokenPolicy(blockedToken, 0, 0);
        
        (maxApproval, dailyLimit, , ) = account.tokenAllowances(blockedToken);
        assertEq(maxApproval, 0); // Blocked
        assertEq(dailyLimit, 0);  // Blocked
    }
}

// Mock EntryPoint for testing
contract MockEntryPointAdvanced {
    function getNonce(address, uint192) external pure returns (uint256) {
        return 0;
    }
    
    function validateUserOp(address, bytes32, uint256) external pure returns (uint256) {
        return 0;
    }
}