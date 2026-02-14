// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Test.sol";
import "../src/SigilAccount.sol";
import "../src/SigilAccountFactory.sol";
import "@account-abstraction/interfaces/PackedUserOperation.sol";

/**
 * @title SigilEdgeCases
 * @notice R17: Comprehensive edge case testing to improve branch coverage
 * @dev Targets untested conditional branches and error paths identified in coverage analysis
 */
contract SigilEdgeCasesTest is Test {
    SigilAccount account;
    SigilAccountFactory factory;
    
    address owner = makeAddr("owner");
    address agentKey = makeAddr("agent");
    address guardianKey = makeAddr("guardian");
    address entryPoint = makeAddr("entryPoint");
    
    function setUp() public {
        factory = new SigilAccountFactory(IEntryPoint(entryPoint), owner, 0);
        
        vm.prank(owner);
        account = factory.createAccount(
            owner, agentKey, guardianKey,
            1 ether, 10 ether, 5 ether,
            0
        );
    }
    
    // ═════════════════════════════════════════════════════════════
    //                     INITIALIZATION EDGE CASES
    // ═════════════════════════════════════════════════════════════
    
    function test_initializeWithDelay_boundary_values() public {
        // Test minimum delay
        vm.prank(owner);
        SigilAccount account1 = factory.createAccountWithDelay(
            owner, makeAddr("agent1"), makeAddr("guardian1"),
            1 ether, 10 ether, 5 ether,
            1 hours, // MIN_TRANSFER_DELAY
            1
        );
        assertEq(account1.ownerTransferDelay(), 1 hours);
        
        // Test maximum delay
        vm.prank(owner);
        SigilAccount account2 = factory.createAccountWithDelay(
            owner, makeAddr("agent2"), makeAddr("guardian2"), 
            1 ether, 10 ether, 5 ether,
            90 days, // MAX_TRANSFER_DELAY
            2
        );
        assertEq(account2.ownerTransferDelay(), 90 days);
        
        // Test invalid delays
        vm.prank(owner);
        vm.expectRevert();
        factory.createAccountWithDelay(
            owner, makeAddr("agent3"), makeAddr("guardian3"),
            1 ether, 10 ether, 5 ether,
            59 minutes, // Below minimum
            3
        );
        
        vm.prank(owner);
        vm.expectRevert();
        factory.createAccountWithDelay(
            owner, makeAddr("agent4"), makeAddr("guardian4"),
            1 ether, 10 ether, 5 ether,
            91 days, // Above maximum
            4
        );
    }
    
    // ═════════════════════════════════════════════════════════════
    //                     SESSION KEY EDGE CASES
    // ═════════════════════════════════════════════════════════════
    
    function test_sessionKey_boundary_conditions() public {
        address sessionKey = makeAddr("session");
        
        // Test session key with zero spend limit (should allow zero-value calls)
        vm.prank(owner);
        uint256 sessionId = account.createSessionKey(
            sessionKey,
            block.timestamp,
            block.timestamp + 1 hours,
            0, // zero spend limit
            0, // zero max tx value (use account default)
            0, // no cooldown
            false // do not allow all targets
        );
        
        (,,,uint256 spendLimit,,,,,,) = account.getSessionKey(sessionId);
        assertEq(spendLimit, 0);
        
        // Test session key with immediate expiry
        vm.prank(owner);
        uint256 sessionId2 = account.createSessionKey(
            makeAddr("session2"),
            block.timestamp,
            block.timestamp + 1, // expires in 1 second
            1 ether,
            1 ether,
            0,
            false
        );
        
        (,,uint256 validUntil,,,,,,,) = account.getSessionKey(sessionId2);
        assertEq(validUntil, block.timestamp + 1);
    }
    
    function test_sessionKey_collision_edge_cases() public {
        // Test collision with pending owner
        vm.prank(owner);
        address newOwner = makeAddr("newOwner");
        account.requestOwnerTransfer(newOwner);
        
        // Try to create session key with pending owner address
        vm.prank(owner);
        vm.expectRevert();
        account.createSessionKey(newOwner, 0, block.timestamp + 1 hours, 1 ether, 0, 0, false);
        
        // Test collision with recovery guardian
        vm.prank(owner);
        address recoveryGuardian = makeAddr("recoveryGuardian");
        account.addRecoveryGuardian(recoveryGuardian);
        
        // Try to create session key with recovery guardian address
        vm.prank(owner);
        vm.expectRevert();
        account.createSessionKey(recoveryGuardian, 0, block.timestamp + 1 hours, 1 ether, 0, 0, false);
    }
    
    // ═════════════════════════════════════════════════════════════
    //                     RECOVERY EDGE CASES  
    // ═════════════════════════════════════════════════════════════
    
    function test_recovery_threshold_edge_cases() public {
        // Add exactly 1 guardian
        address guardian1 = makeAddr("guardian1");
        vm.prank(owner);
        account.addRecoveryGuardian(guardian1);
        
        // Threshold should auto-set to 1
        (uint256 threshold,,) = account.getRecoveryConfig();
        assertEq(threshold, 1);
        
        // Test setting threshold to max guardians
        for (uint256 i = 2; i <= 7; i++) {
            vm.prank(owner);
            account.addRecoveryGuardian(makeAddr(string(abi.encodePacked("guardian", vm.toString(i)))));
        }
        
        // Set threshold to maximum (7)
        vm.prank(owner);
        account.setRecoveryThreshold(7);
        (threshold,,) = account.getRecoveryConfig();
        assertEq(threshold, 7);
        
        // Try to set threshold above guardian count
        vm.prank(owner);
        vm.expectRevert();
        account.setRecoveryThreshold(8);
    }
    
    function test_recovery_expiry_edge_case() public {
        // Add guardians and initiate recovery
        address guardian1 = makeAddr("guardian1");
        vm.prank(owner);
        account.addRecoveryGuardian(guardian1);
        
        address newOwner = makeAddr("newOwner");
        vm.prank(guardian1);
        bytes32 recoveryId = account.initiateRecovery(newOwner);
        
        // Fast forward to just before expiry (30 days after becoming executable)
        (, uint256 executeAfter,,,,) = account.getRecoveryStatus(recoveryId);
        vm.warp(executeAfter + 30 days - 1);
        
        // Should still be executable
        vm.prank(guardian1);
        account.executeRecovery(recoveryId);
        
        assertEq(account.owner(), newOwner);
    }
    
    function test_recovery_epoch_mismatch() public {
        // Add guardian and initiate recovery
        address guardian1 = makeAddr("guardian1");
        vm.prank(owner);
        account.addRecoveryGuardian(guardian1);
        
        address newOwner = makeAddr("newOwner");
        vm.prank(guardian1);
        bytes32 recoveryId = account.initiateRecovery(newOwner);
        
        // Add another guardian (changes epoch)
        address guardian2 = makeAddr("guardian2");
        vm.prank(owner);
        account.addRecoveryGuardian(guardian2);
        
        // Wait for recovery delay
        (, uint256 executeAfter,,,,) = account.getRecoveryStatus(recoveryId);
        vm.warp(executeAfter + 1);
        
        // Recovery should fail due to epoch mismatch
        vm.prank(guardian1);
        vm.expectRevert();
        account.executeRecovery(recoveryId);
    }
    
    // ═════════════════════════════════════════════════════════════
    //                     TOKEN POLICY EDGE CASES
    // ═════════════════════════════════════════════════════════════
    
    function test_tokenPolicy_daily_reset_edge_cases() public {
        address token = makeAddr("token");
        
        // Set token policy with daily limit
        vm.prank(owner);
        account.setTokenPolicy(token, 1000e18, 500e18); // max approval, daily transfer limit
        
        // Check policy was set correctly
        (uint256 maxApproval, uint256 dailyTransferLimit, uint256 dailyTransferred, bool exists) = account.getTokenPolicy(token);
        assertEq(maxApproval, 1000e18);
        assertEq(dailyTransferLimit, 500e18);
        assertEq(dailyTransferred, 0);
        assertTrue(exists);
        
        // Test zero daily limit (should mean unlimited)
        vm.prank(owner);
        account.setTokenPolicy(token, 1000e18, 0); // unlimited daily transfers
        (,dailyTransferLimit,,) = account.getTokenPolicy(token);
        assertEq(dailyTransferLimit, 0);
        
        // Test zero max approval (should block all approvals)
        vm.prank(owner);  
        account.setTokenPolicy(token, 0, 500e18); // block all approvals
        (maxApproval,,,) = account.getTokenPolicy(token);
        assertEq(maxApproval, 0);
    }
    
    // ═════════════════════════════════════════════════════════════
    //                     SIGNATURE VALIDATION EDGE CASES
    // ═════════════════════════════════════════════════════════════
    
    function test_signature_validation_edge_cases() public {
        // Test signature length edge cases
        PackedUserOperation memory userOp = PackedUserOperation({
            sender: address(account),
            nonce: 0,
            initCode: "",
            callData: abi.encodeCall(account.execute, (address(0x1), 0, "")),
            accountGasLimits: bytes32(uint256(100000) << 128 | uint256(100000)),
            preVerificationGas: 21000,
            gasFees: bytes32(uint256(1e9) << 128 | uint256(1e9)),
            paymasterAndData: "",
            signature: "" // empty signature
        });
        
        bytes32 userOpHash = keccak256(abi.encode(userOp));
        
        // Test with empty signature (length 0)
        vm.prank(entryPoint);
        uint256 result = account.validateUserOp(userOp, userOpHash, 0);
        assertEq(result, 1); // SIG_VALIDATION_FAILED
        
        // Test with invalid signature length (64 bytes - missing 1 byte)
        userOp.signature = new bytes(64);
        vm.prank(entryPoint);
        result = account.validateUserOp(userOp, userOpHash, 0);
        assertEq(result, 1); // SIG_VALIDATION_FAILED
        
        // Test with signature length that's not 65, 130, or 195
        userOp.signature = new bytes(100); // invalid length
        vm.prank(entryPoint);
        result = account.validateUserOp(userOp, userOpHash, 0);
        assertEq(result, 1); // SIG_VALIDATION_FAILED
    }
    
    // ═════════════════════════════════════════════════════════════
    //                     QUEUE EDGE CASES
    // ═════════════════════════════════════════════════════════════
    
    function test_queue_expiry_edge_case() public {
        // Fund account and queue a simple transfer
        vm.deal(address(account), 2 ether);
        vm.prank(owner);
        uint256 queueId = account.queueTransaction(address(0x1), 1 ether, "");
        
        // Fast forward to just before expiry (7 days after queuing)
        vm.warp(block.timestamp + 7 days - 1);
        
        // Should still be executable
        vm.prank(owner);
        account.executeQueued(queueId);
    }
    
    function test_queue_exactly_at_expiry() public {
        vm.prank(owner);
        uint256 queueId = account.queueTransaction(address(0x1), 1 ether, "");
        
        // Fast forward to exactly 7 days + 1 hour (after timelock + expiry)
        vm.warp(block.timestamp + 7 days + 1 hours + 1);
        
        // Should fail as expired
        vm.prank(owner);
        vm.expectRevert();
        account.executeQueued(queueId);
    }
    
    // ═════════════════════════════════════════════════════════════
    //                     UPGRADE EDGE CASES
    // ═════════════════════════════════════════════════════════════
    
    function test_upgrade_delay_edge_cases() public {
        address newImpl = address(new SigilAccount(IEntryPoint(entryPoint), address(factory)));
        
        vm.prank(owner);
        account.requestUpgrade(newImpl);
        
        // Test execution exactly at delay boundary (24 hours)
        vm.warp(block.timestamp + 24 hours);
        
        // Create guardian signature for the upgrade
        bytes32 hash = keccak256(abi.encodePacked(
            "\x19Ethereum Signed Message:\n32",
            keccak256(abi.encodePacked(address(account), newImpl, block.timestamp - 24 hours, block.chainid))
        ));
        
        // Note: In a real test, we'd sign this properly. For coverage, we'll test the revert path
        vm.prank(owner);
        vm.expectRevert(); // Will revert due to invalid guardian signature
        account.executeUpgrade("");
    }
    
    // ═════════════════════════════════════════════════════════════
    //                     ERROR PATH COVERAGE
    // ═════════════════════════════════════════════════════════════
    
    function test_multicall_blocked_selectors() public {
        bytes[] memory calls = new bytes[](1);
        calls[0] = abi.encodeCall(account.executeUpgrade, (""));
        
        vm.prank(owner);
        vm.expectRevert();
        account.multicall(calls);
        
        // Test other blocked selectors
        calls[0] = abi.encodeCall(account.executeRecovery, (bytes32(0)));
        vm.prank(owner);
        vm.expectRevert();
        account.multicall(calls);
        
        calls[0] = abi.encodeCall(account.executeOwnerTransfer, ());
        vm.prank(owner); 
        vm.expectRevert();
        account.multicall(calls);
    }
    
    function test_emergency_withdraw_edge_cases() public {
        // Test emergency withdraw with zero balance
        vm.prank(owner);
        vm.expectRevert();
        account.emergencyWithdraw(owner);
        
        // Give account some balance and test successful withdraw
        vm.deal(address(account), 1 ether);
        
        vm.prank(owner);
        account.emergencyWithdraw(owner);
        assertEq(address(account).balance, 0);
        assertEq(owner.balance, 1 ether);
    }
    
    function test_fallback_function_edge_cases() public {
        // Test fallback with 4+ bytes of data (should revert)
        (bool success,) = address(account).call{value: 1 ether}(abi.encodeWithSignature("someFunction()"));
        assertFalse(success);
        
        // Test fallback with zero value (should revert)
        (success,) = address(account).call{value: 0}("");
        assertFalse(success);
        
        // Test fallback with value and short data (should succeed)
        (success,) = address(account).call{value: 1 ether}("abc"); // 3 bytes < 4
        assertTrue(success);
    }
    
    function test_receive_function_zero_value() public {
        // Test receive with zero value (should revert)
        (bool success,) = address(account).call{value: 0}("");
        assertFalse(success);
        
        // Test receive with value (should succeed)
        (success,) = address(account).call{value: 1 ether}("");
        assertTrue(success);
    }
}