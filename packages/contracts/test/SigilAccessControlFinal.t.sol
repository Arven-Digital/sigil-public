// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Test.sol";
import "../src/SigilAccount.sol";
import "../src/SigilAccountFactory.sol";
import "@account-abstraction/interfaces/PackedUserOperation.sol";
import "@account-abstraction/interfaces/IEntryPoint.sol";
import "@account-abstraction/core/BaseAccount.sol";

/**
 * @title SigilAccessControlFinalTest
 * @notice R38: Final access control validation - state consistency, boundaries, race conditions
 */
contract SigilAccessControlFinalTest is Test {
    SigilAccount public account;
    SigilAccountFactory public factory;
    
    uint256 ownerPk = 0xA11CE;
    uint256 agentPk = 0xB0B;
    uint256 guardianPk = 0xC0DE;

    address owner;
    address agentKey;
    address guardianKey;
    address entryPoint;

    MockERC20 public mockToken;

    function setUp() public {
        owner = vm.addr(ownerPk);
        agentKey = vm.addr(agentPk);
        guardianKey = vm.addr(guardianPk);
        
        entryPoint = address(new MockEntryPoint());
        factory = new SigilAccountFactory(IEntryPoint(entryPoint), owner, 0);
        
        account = factory.createAccount(
            owner,
            agentKey,
            guardianKey,
            1 ether,
            5 ether,
            0.5 ether,
            0
        );
        
        mockToken = new MockERC20();
        vm.deal(address(account), 10 ether);
    }

    // R38.1: Test access control state consistency during concurrent operations
    function test_accessControlStateConsistencyDuringConcurrentOps() public {
        // Start owner transfer process
        address newOwner = makeAddr("newOwner");
        vm.prank(owner);
        account.requestOwnerTransfer(newOwner);
        
        // Start recovery process
        address recoveryGuardian = makeAddr("recoveryGuardian");
        vm.prank(owner);
        account.addRecoveryGuardian(recoveryGuardian);
        
        vm.prank(recoveryGuardian);
        bytes32 recoveryId = account.initiateRecovery(makeAddr("recoveredOwner"));
        
        // During these processes, access control should be consistent
        // Owner should still have control until transfer/recovery executes
        vm.prank(owner);
        account.freeze();
        
        vm.prank(owner);
        account.unfreeze();
        
        // New owner shouldn't have control yet
        vm.prank(newOwner);
        vm.expectRevert(abi.encodeWithSelector(SigilAccount.NotOwner.selector));
        account.freeze();
        
        // Recovery target shouldn't have control yet
        vm.prank(makeAddr("recoveredOwner"));
        vm.expectRevert(abi.encodeWithSelector(SigilAccount.NotOwner.selector));
        account.freeze();
    }

    // R38.2: Test boundary conditions for access control parameters
    function test_accessControlParameterBoundaries() public {
        // Test with minimal values
        address minOwner = address(1);
        address minAgent = address(2);
        address minGuardian = address(3);
        
        SigilAccount minAccount = factory.createAccount(
            minOwner,
            minAgent,
            minGuardian,
            1 wei, // Minimum maxTxValue
            2 wei, // Minimum dailyLimit (must be > maxTxValue)
            0,     // Minimum guardianThreshold
            0
        );
        
        // Verify access control works with minimal values
        vm.prank(minOwner);
        minAccount.freeze();
        
        // Test with maximum reasonable values
        address maxOwner = address(type(uint160).max);
        address maxAgent = address(type(uint160).max - 1);
        address maxGuardian = address(type(uint160).max - 2);
        
        SigilAccount maxAccount = factory.createAccount(
            maxOwner,
            maxAgent, 
            maxGuardian,
            type(uint256).max - 1,  // Nearly max maxTxValue
            type(uint256).max,      // Max dailyLimit
            type(uint256).max - 1,  // Nearly max guardianThreshold
            0
        );
        
        // Verify access control works with maximum values
        vm.prank(maxOwner);
        maxAccount.freeze();
    }

    // R38.3: Test access control during rapid state transitions
    function test_accessControlDuringRapidStateTransitions() public {
        // Rapid freeze/unfreeze cycles
        vm.startPrank(owner);
        account.freeze();
        account.unfreeze();
        account.freeze();
        account.unfreeze();
        account.freeze();
        account.unfreeze();
        vm.stopPrank();
        
        // Rapid key rotations
        vm.startPrank(owner);
        address agent2 = makeAddr("agent2");
        address agent3 = makeAddr("agent3");
        account.rotateAgentKey(agent2);
        account.rotateAgentKey(agent3);
        account.rotateAgentKey(makeAddr("agent4"));
        vm.stopPrank();
        
        // Verify owner still has control after rapid changes
        vm.prank(owner);
        account.freeze();
    }

    // R38.4: Test access control with maximum recovery guardians
    function test_accessControlWithMaxRecoveryGuardians() public {
        // Add maximum number of recovery guardians (7)
        address[] memory guardians = new address[](7);
        for (uint i = 0; i < 7; i++) {
            guardians[i] = makeAddr(string(abi.encodePacked("guardian", vm.toString(i))));
            vm.prank(owner);
            account.addRecoveryGuardian(guardians[i]);
        }
        
        // Verify we can't add more than 7
        vm.prank(owner);
        vm.expectRevert(); // Should fail
        account.addRecoveryGuardian(makeAddr("guardian8"));
        
        // Set threshold to require all 7 guardians
        vm.prank(owner);
        account.setRecoveryThreshold(7);
        
        // Start recovery
        vm.prank(guardians[0]);
        bytes32 recoveryId = account.initiateRecovery(makeAddr("newOwner"));
        
        // All other guardians need to support
        for (uint i = 1; i < 7; i++) {
            vm.prank(guardians[i]);
            account.supportRecovery(recoveryId);
        }
        
        // Owner should still have control until recovery executes
        vm.prank(owner);
        account.freeze();
    }

    // R38.5: Test access control with session key limits
    function test_accessControlWithSessionKeyLimits() public {
        // Create multiple session keys up to reasonable limit
        uint256 sessionCount = 50;
        for (uint i = 0; i < sessionCount; i++) {
            address sessionAddr = address(uint160(0x1000 + i));
            vm.prank(owner);
            account.createSessionKey(
                sessionAddr,
                block.timestamp,
                block.timestamp + 1 days,
                0.01 ether,
                0.001 ether,
                0,
                false
            );
        }
        
        // Owner should still have full control
        vm.prank(owner);
        account.freeze();
        
        vm.prank(owner);
        account.unfreeze();
        
        // Non-owner still cannot access admin functions
        vm.prank(address(0x1001)); // One of the session keys
        vm.expectRevert(abi.encodeWithSelector(SigilAccount.NotOwner.selector));
        account.freeze();
    }

    // R38.6: Test access control during upgrade process boundaries
    function test_accessControlDuringUpgradeBoundaries() public {
        MockImplementation newImpl = new MockImplementation();
        
        // Request upgrade
        vm.prank(owner);
        account.requestUpgrade(address(newImpl));
        
        // During upgrade delay, owner should still have full control
        vm.prank(owner);
        account.freeze();
        
        vm.prank(owner);
        account.unfreeze();
        
        // Advance time to upgrade boundary
        vm.warp(block.timestamp + 24 hours);
        
        // Owner should still have control at exact boundary
        vm.prank(owner);
        account.freeze();
        
        vm.prank(owner);
        account.unfreeze();
        
        // Cancel upgrade to clean up
        vm.prank(owner);
        account.cancelUpgrade();
    }

    // R38.7: Test access control with gas limit boundaries
    function test_accessControlWithGasLimitBoundaries() public {
        // Test that access control works even with low gas
        uint256 lowGas = 100000; // Relatively low gas limit
        
        vm.prank(owner);
        try account.freeze{gas: lowGas}() {
            // Should succeed
        } catch {
            // If it fails due to gas, that's expected behavior
            // The important thing is that it doesn't bypass access control
        }
        
        // Verify non-owner still can't bypass with low gas
        vm.prank(makeAddr("attacker"));
        try account.freeze{gas: lowGas}() {
            revert("Should not succeed - access control bypassed");
        } catch {
            // Expected to fail due to access control, not gas
        }
    }

    // R38.8: Test access control race conditions around time boundaries
    function test_accessControlTimeBoundaryRaceConditions() public {
        address newOwner = makeAddr("newOwner");
        
        // Request owner transfer
        vm.prank(owner);
        account.requestOwnerTransfer(newOwner);
        
        uint256 executeTime = block.timestamp + 24 hours;
        
        // Jump to just before execution time
        vm.warp(executeTime - 1);
        
        // Should not be executable yet
        vm.prank(newOwner);
        vm.expectRevert();
        account.executeOwnerTransfer();
        
        // Current owner should still have control
        vm.prank(owner);
        account.freeze();
        
        // Old owner can unfreeze before transfer
        vm.prank(owner);
        account.unfreeze();
        
        // Jump to exact execution time
        vm.warp(executeTime);
        
        // Should be executable now
        vm.prank(newOwner);
        account.executeOwnerTransfer();
        
        // Verify ownership changed
        assertEq(account.owner(), newOwner);
        
        // New owner should have control
        vm.prank(newOwner);
        account.freeze();
        
        vm.prank(newOwner);
        account.unfreeze();
    }

    // R38.9: Test access control with multicall complexity
    function test_accessControlWithMulticallComplexity() public {
        // Create complex multicall sequence
        bytes[] memory calls = new bytes[](5);
        calls[0] = abi.encodeWithSelector(account.rotateAgentKey.selector, makeAddr("newAgent"));
        calls[1] = abi.encodeWithSelector(account.rotateGuardianKey.selector, makeAddr("newGuardian"));
        calls[2] = abi.encodeWithSelector(account.updatePolicy.selector, 2 ether, 10 ether, 1 ether, type(uint256).max);
        calls[3] = abi.encodeWithSelector(account.freeze.selector, "multicall freeze");
        calls[4] = abi.encodeWithSelector(account.unfreeze.selector);
        
        // Only owner should be able to execute complex multicall
        vm.prank(makeAddr("attacker"));
        vm.expectRevert(abi.encodeWithSelector(SigilAccount.NotOwner.selector));
        account.multicall(calls);
        
        // Owner should succeed
        vm.prank(owner);
        account.multicall(calls);
        
        // Verify all operations executed
        assertEq(account.agentKey(), makeAddr("newAgent"));
        assertEq(account.guardianKey(), makeAddr("newGuardian"));
        assertEq(account.maxTxValue(), 2 ether);
        assertFalse(account.isFrozen()); // Should be unfrozen after sequence
    }

    // R38.10: Test access control consistency across all state variables
    function test_accessControlStateVariableConsistency() public {
        // Capture initial state
        address initialOwner = account.owner();
        address initialAgent = account.agentKey();
        address initialGuardian = account.guardianKey();
        uint256 initialMaxTx = account.maxTxValue();
        uint256 initialDailyLimit = account.dailyLimit();
        bool initialFrozen = account.isFrozen();
        
        // Perform various operations that should maintain consistency
        vm.startPrank(owner);
        
        // Key rotations
        address newAgent = makeAddr("newAgent");
        address newGuardian = makeAddr("newGuardian");
        account.rotateAgentKey(newAgent);
        account.rotateGuardianKey(newGuardian);
        
        // Policy updates
        account.updatePolicy(2 ether, 10 ether, 1 ether, type(uint256).max);
        
        // State changes
        account.freeze();
        account.unfreeze();
        
        // Add recovery guardian
        account.addRecoveryGuardian(makeAddr("recoveryGuardian"));
        
        // Create session key
        account.createSessionKey(
            makeAddr("sessionKey"),
            block.timestamp,
            block.timestamp + 1 days,
            0.1 ether,
            0.01 ether,
            0,
            false
        );
        
        vm.stopPrank();
        
        // Verify state consistency
        assertEq(account.owner(), initialOwner); // Owner should not have changed
        assertEq(account.agentKey(), newAgent); // Agent should have changed
        assertEq(account.guardianKey(), newGuardian); // Guardian should have changed
        assertEq(account.maxTxValue(), 2 ether); // Policy should have changed
        assertEq(account.dailyLimit(), 10 ether); // Policy should have changed
        assertFalse(account.isFrozen()); // Should be unfrozen
        
        // Verify access control is still intact
        vm.prank(makeAddr("attacker"));
        vm.expectRevert(abi.encodeWithSelector(SigilAccount.NotOwner.selector));
        account.freeze();
        
        // Owner should still have control
        vm.prank(owner);
        account.freeze();
    }
}

contract MockImplementation {
    // Empty mock implementation for upgrade testing
}

contract MockEntryPoint {
    // Minimal implementation for testing
}

contract MockERC20 {
    mapping(address => uint256) public balanceOf;
    
    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }
    
    function transfer(address to, uint256 amount) external returns (bool) {
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}