// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Test.sol";
import "../src/SigilAccount.sol";
import "../src/SigilAccountFactory.sol";
import "@account-abstraction/interfaces/IEntryPoint.sol";

/**
 * @title SigilArithmeticEdgeCases
 * @notice R35: Edge case arithmetic testing - max values, overflow protection, boundary conditions
 */
contract SigilArithmeticEdgeCasesTest is Test {
    SigilAccountFactory factory;
    SigilAccount account;
    IEntryPoint entryPoint;

    uint256 ownerPK = 0x1;
    uint256 agentPK = 0x2;
    uint256 guardianPK = 0x3;
    
    address owner;
    address agentKey;
    address guardianKey;

    // Arithmetic constants for testing
    uint256 constant MAX_UINT256 = type(uint256).max;
    uint256 constant HALF_MAX = MAX_UINT256 / 2;
    uint256 constant NEAR_MAX = MAX_UINT256 - 1000;

    function setUp() public {
        // Derive addresses from private keys
        owner = vm.addr(ownerPK);
        agentKey = vm.addr(agentPK);
        guardianKey = vm.addr(guardianPK);
        
        // Deploy mock EntryPoint
        entryPoint = IEntryPoint(address(new MockEntryPointArithmetic()));
        
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
    //                    MAXIMUM VALUE TESTING
    // ═══════════════════════════════════════════════════════════

    function test_maxUint256PolicyValues() public {
        // Test setting policy values to maximum uint256
        vm.prank(owner);
        account.updatePolicy(
            MAX_UINT256,    // maxTxValue
            MAX_UINT256,    // dailyLimit
            HALF_MAX,       // guardianThreshold
            MAX_UINT256     // ownerThreshold
        );
        
        // Verify values were set correctly
        assertEq(account.maxTxValue(), MAX_UINT256);
        assertEq(account.dailyLimit(), MAX_UINT256);
        assertEq(account.guardianThreshold(), HALF_MAX);
        assertEq(account.ownerThreshold(), MAX_UINT256);
        
        // Test that arithmetic operations don't overflow
        // Daily spent tracking should handle large values
        assertEq(account.dailySpent(), 0);
        assertTrue(account.dailyResetTime() > 0);
    }

    function test_maxUint256SessionKeyValues() public {
        // Test creating session key with maximum values
        vm.prank(owner);
        uint256 sessionId = account.createSessionKey(
            makeAddr("maxSessionKey"),
            block.timestamp,
            block.timestamp + 365 days,
            MAX_UINT256,    // spendLimit
            NEAR_MAX,       // maxTxValue (slightly less than max)
            type(uint32).max, // cooldown (max uint32)
            true
        );
        
        // Verify session key was created with correct values
        (
            address key,
            uint256 validAfter,
            uint256 validUntil,
            uint256 spendLimit,
            uint256 spent,
            uint256 maxTxValue,
            uint256 cooldown,
            uint256 lastUsedAt,
            bool allowAllTargets,
            bool revoked
        ) = account.getSessionKey(sessionId);
        
        assertEq(key, makeAddr("maxSessionKey"));
        assertEq(validAfter, block.timestamp);
        assertEq(validUntil, block.timestamp + 365 days);
        assertEq(spendLimit, MAX_UINT256);
        assertEq(spent, 0);
        assertEq(maxTxValue, NEAR_MAX);
        assertEq(cooldown, type(uint32).max);
        assertEq(lastUsedAt, 0);
        assertTrue(allowAllTargets);
        assertFalse(revoked);
    }

    function test_maxUint256TokenPolicyValues() public {
        address token = makeAddr("maxToken");
        
        // Test setting token policy with maximum values
        vm.prank(owner);
        account.setTokenPolicy(token, MAX_UINT256, MAX_UINT256);
        
        assertTrue(account.hasTokenPolicy(token));
        
        (
            uint256 maxApproval,
            uint256 dailyTransferLimit,
            uint256 dailyTransferred,
            uint256 dailyResetTime
        ) = account.tokenAllowances(token);
        
        assertEq(maxApproval, MAX_UINT256);
        assertEq(dailyTransferLimit, MAX_UINT256);
        assertEq(dailyTransferred, 0);
        assertTrue(dailyResetTime > 0);
    }


    // ═══════════════════════════════════════════════════════════
    //                    ZERO VALUE EDGE CASES
    // ═══════════════════════════════════════════════════════════

    function test_zeroValuePolicies() public {
        // Test setting policies to zero (should be valid for some parameters)
        vm.prank(owner);
        account.updatePolicy(
            1,          // maxTxValue (cannot be zero)
            1,          // dailyLimit (cannot be zero)  
            0,          // guardianThreshold (can be zero)
            1           // ownerThreshold (must be >= guardianThreshold)
        );
        
        assertEq(account.maxTxValue(), 1);
        assertEq(account.dailyLimit(), 1);
        assertEq(account.guardianThreshold(), 0);
        assertEq(account.ownerThreshold(), 1);
    }

    function test_zeroValueSessionKeys() public {
        // Test session key with zero values where valid
        vm.prank(owner);
        uint256 sessionId = account.createSessionKey(
            makeAddr("zeroSessionKey"),
            block.timestamp,
            block.timestamp + 1 days,
            1,          // spendLimit (cannot be zero in practice)
            1,          // maxTxValue (cannot be zero in practice)
            0,          // cooldown (can be zero - no cooldown)
            false
        );
        
        (
            address key,
            ,,,,,
            uint256 cooldown,
            ,,
        ) = account.getSessionKey(sessionId);
        
        assertEq(key, makeAddr("zeroSessionKey"));
        assertEq(cooldown, 0); // No cooldown
    }

    function test_zeroTokenPolicies() public {
        address token = makeAddr("blockedToken");
        
        // Setting token policy to zero should effectively block the token
        vm.prank(owner);
        account.setTokenPolicy(token, 0, 0);
        
        assertTrue(account.hasTokenPolicy(token));
        
        (
            uint256 maxApproval,
            uint256 dailyTransferLimit,
            uint256 dailyTransferred,
            uint256 dailyResetTime
        ) = account.tokenAllowances(token);
        
        assertEq(maxApproval, 0);        // Blocked
        assertEq(dailyTransferLimit, 0); // Blocked  
        assertEq(dailyTransferred, 0);
        // dailyResetTime might be set to current day boundary even for blocked tokens
    }

    // ═══════════════════════════════════════════════════════════
    //                    BOUNDARY CONDITIONS
    // ═══════════════════════════════════════════════════════════



    function test_recoveryDelayBoundaries() public {
        uint256 minDelay = 48 hours;  // MIN_RECOVERY_DELAY
        uint256 maxDelay = 30 days;   // MAX_RECOVERY_DELAY
        
        // Test setting to minimum
        vm.prank(owner);
        account.setRecoveryDelay(minDelay);
        assertEq(account.recoveryDelay(), minDelay);
        
        // Test setting to maximum  
        vm.prank(owner);
        account.setRecoveryDelay(maxDelay);
        assertEq(account.recoveryDelay(), maxDelay);
        
        // Test values outside boundaries should fail
        vm.prank(owner);
        vm.expectRevert();
        account.setRecoveryDelay(minDelay - 1);
        
        vm.prank(owner);
        vm.expectRevert();
        account.setRecoveryDelay(maxDelay + 1);
    }

    // ═══════════════════════════════════════════════════════════
    //                    ADDITION/SUBTRACTION SAFETY
    // ═══════════════════════════════════════════════════════════




    // ═══════════════════════════════════════════════════════════
    //                    COMPARISON OPERATIONS  
    // ═══════════════════════════════════════════════════════════

    function test_policyComparisonValidation() public {
        // Test that policy validation correctly compares values
        
        // Valid: guardianThreshold <= ownerThreshold
        vm.prank(owner);
        account.updatePolicy(
            1 ether,    // maxTxValue
            10 ether,   // dailyLimit
            5 ether,    // guardianThreshold
            5 ether     // ownerThreshold (equal is valid)
        );
        
        assertEq(account.guardianThreshold(), 5 ether);
        assertEq(account.ownerThreshold(), 5 ether);
        
        // Valid: guardianThreshold < ownerThreshold  
        vm.prank(owner);
        account.updatePolicy(
            1 ether,    // maxTxValue
            10 ether,   // dailyLimit
            3 ether,    // guardianThreshold
            7 ether     // ownerThreshold
        );
        
        assertEq(account.guardianThreshold(), 3 ether);
        assertEq(account.ownerThreshold(), 7 ether);
        
        // Invalid: guardianThreshold > ownerThreshold should fail
        vm.prank(owner);
        vm.expectRevert();
        account.updatePolicy(
            1 ether,    // maxTxValue
            10 ether,   // dailyLimit
            8 ether,    // guardianThreshold
            5 ether     // ownerThreshold (less than guardian)
        );
    }


    // ═══════════════════════════════════════════════════════════
    //                    DIVISION OPERATIONS
    // ═══════════════════════════════════════════════════════════


    function test_percentageCalculations() public {
        // While the contract doesn't explicitly use percentages,
        // test any ratio-based calculations that might exist
        
        uint256 maxPolicy = MAX_UINT256;
        uint256 halfPolicy = maxPolicy / 2;
        uint256 quarterPolicy = maxPolicy / 4;
        
        // Set policies at different ratios
        vm.prank(owner);
        account.updatePolicy(
            quarterPolicy,  // 25% of max
            maxPolicy,      // 100% of max
            halfPolicy,     // 50% of max
            maxPolicy       // 100% of max
        );
        
        // Verify no arithmetic errors in storage/retrieval
        assertEq(account.maxTxValue(), quarterPolicy);
        assertEq(account.dailyLimit(), maxPolicy);
        assertEq(account.guardianThreshold(), halfPolicy);
        assertEq(account.ownerThreshold(), maxPolicy);
        
        // Verify relationships are maintained
        assertTrue(account.maxTxValue() <= account.dailyLimit());
        assertTrue(account.guardianThreshold() <= account.ownerThreshold());
    }
}

// Mock EntryPoint for testing
contract MockEntryPointArithmetic {
    function getNonce(address, uint192) external pure returns (uint256) {
        return 0;
    }
    
    function validateUserOp(address, bytes32, uint256) external pure returns (uint256) {
        return 0;
    }
}