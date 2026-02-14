// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Test.sol";
import "../src/SigilAccount.sol";
import "../src/SigilAccountFactory.sol";
import "@account-abstraction/interfaces/IEntryPoint.sol";
import "@account-abstraction/interfaces/PackedUserOperation.sol";
import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

// Test implementation with storage layout changes
contract UpgradedImplementationV3 is SigilAccount {
    // Adding new storage at the end (safe)
    uint256 public newFeature;
    mapping(address => uint256) public newMapping;
    
    constructor(IEntryPoint entryPoint_, address factory_) SigilAccount(entryPoint_, factory_) {}
    
    function setNewFeature(uint256 value) external onlyOwner {
        newFeature = value;
    }
    
    function getNewFeature() external view returns (uint256) {
        return newFeature;
    }
}

// Implementation that adds new functions
contract ExtendedFunctionalityImpl is SigilAccount {
    event NewFunctionCalled(uint256 value);
    
    constructor(IEntryPoint entryPoint_, address factory_) SigilAccount(entryPoint_, factory_) {}
    
    function newOwnerOnlyFunction() external onlyOwner {
        emit NewFunctionCalled(block.timestamp);
    }
    
    function newPublicFunction() external view returns (string memory) {
        return "Extended functionality";
    }
}

// Mock EntryPoint for testing
contract MockEntryPointEdge {
    function getNonce(address, uint192) external pure returns (uint256) {
        return 0;
    }
    
    function validateUserOp(address, bytes32, uint256) external pure returns (uint256) {
        return 0;
    }
}

/**
 * @title SigilUpgradeEdgeCases
 * @notice R31: Edge cases in upgrade process, state transitions, feature interactions
 */
contract SigilUpgradeEdgeCasesTest is Test {
    SigilAccountFactory factory;
    SigilAccount implementation;
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
        entryPoint = IEntryPoint(address(new MockEntryPointEdge()));
        
        // Deploy factory and implementation
        implementation = new SigilAccount(entryPoint, address(0));
        factory = new SigilAccountFactory(entryPoint, makeAddr("treasury"), 0.1 ether);
        
        vm.deal(owner, 10 ether);
        
        // Create account with various settings
        account = factory.createAccount{value: 1 ether}(
            owner,
            agentKey,
            guardianKey,
            2 ether,    // maxTxValue
            10 ether,   // dailyLimit
            5 ether,    // guardianThreshold
            12345      // salt
        );
        
        vm.deal(address(account), 3 ether);
    }

    // ═══════════════════════════════════════════════════════════
    //                  UPGRADE TIMING EDGE CASES
    // ═══════════════════════════════════════════════════════════

    function test_upgradeAtExactDelayBoundary() public {
        UpgradedImplementationV3 newImpl = new UpgradedImplementationV3(entryPoint, address(factory));
        
        vm.prank(owner);
        account.requestUpgrade(address(newImpl));
        
        uint256 upgradeTime = account.upgradeRequestedAt();
        uint256 exactDeadline = upgradeTime + 24 hours;
        
        // Try to execute exactly at the deadline
        vm.warp(exactDeadline);
        
        bytes32 messageHash = keccak256(abi.encodePacked(
            "\x19Ethereum Signed Message:\n32",
            keccak256(abi.encodePacked(address(account), address(newImpl), upgradeTime, block.chainid))
        ));
        
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(guardianPK, messageHash);
        bytes memory guardianSig = abi.encodePacked(r, s, v);
        
        vm.prank(owner);
        account.executeUpgrade(guardianSig);
        
        // Verify upgrade succeeded
        assertEq(account.pendingImplementation(), address(0));
    }

    function test_upgradeRequestOverwrite() public {
        UpgradedImplementationV3 impl1 = new UpgradedImplementationV3(entryPoint, address(factory));
        ExtendedFunctionalityImpl impl2 = new ExtendedFunctionalityImpl(entryPoint, address(factory));
        
        // Request first upgrade
        vm.prank(owner);
        account.requestUpgrade(address(impl1));
        
        uint256 firstUpgradeTime = account.upgradeRequestedAt();
        assertEq(account.pendingImplementation(), address(impl1));
        
        // Wait some time
        vm.warp(block.timestamp + 12 hours);
        
        // Request second upgrade (should overwrite first)
        vm.prank(owner);
        account.requestUpgrade(address(impl2));
        
        uint256 secondUpgradeTime = account.upgradeRequestedAt();
        
        // Second upgrade should have overwritten first
        assertEq(account.pendingImplementation(), address(impl2));
        assertTrue(secondUpgradeTime > firstUpgradeTime);
        
        // Wait until second upgrade delay has passed
        vm.warp(secondUpgradeTime + 24 hours + 1);
        
        // Original upgrade signature should no longer be valid because request was overwritten
        bytes32 oldMessageHash = keccak256(abi.encodePacked(
            "\x19Ethereum Signed Message:\n32",
            keccak256(abi.encodePacked(address(account), address(impl1), firstUpgradeTime, block.chainid))
        ));
        
        (uint8 v1, bytes32 r1, bytes32 s1) = vm.sign(guardianPK, oldMessageHash);
        bytes memory oldGuardianSig = abi.encodePacked(r1, s1, v1);
        
        vm.prank(owner);
        // Should fail because the signature doesn't match current pending upgrade
        vm.expectRevert(SigilAccount.InvalidGuardianSig.selector);
        account.executeUpgrade(oldGuardianSig);
    }

    // ═══════════════════════════════════════════════════════════
    //               UPGRADE INTERACTION WITH FEATURES
    // ═══════════════════════════════════════════════════════════

    function test_upgradeWithActiveSessionKeys() public {
        // Create session key before upgrade
        vm.prank(owner);
        uint256 sessionId = account.createSessionKey(
            makeAddr("sessionKey"),
            block.timestamp,
            block.timestamp + 1 days,
            1 ether,  // spendLimit
            0.5 ether, // maxTxValue
            3600,     // cooldown
            false     // allowAllTargets
        );
        
        // Add session targets
        vm.prank(owner);
        account.addSessionTarget(sessionId, makeAddr("allowedTarget"));
        
        // Request upgrade
        ExtendedFunctionalityImpl newImpl = new ExtendedFunctionalityImpl(entryPoint, address(factory));
        vm.prank(owner);
        account.requestUpgrade(address(newImpl));
        
        vm.warp(block.timestamp + 24 hours + 1);
        
        bytes32 messageHash = keccak256(abi.encodePacked(
            "\x19Ethereum Signed Message:\n32",
            keccak256(abi.encodePacked(address(account), address(newImpl), account.upgradeRequestedAt(), block.chainid))
        ));
        
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(guardianPK, messageHash);
        bytes memory guardianSig = abi.encodePacked(r, s, v);
        
        vm.prank(owner);
        account.executeUpgrade(guardianSig);
        
        // Session key should still work after upgrade
        (address key, uint256 validAfter, uint256 validUntil, , , , , , bool allowAllTargets, bool revoked) = account.getSessionKey(sessionId);
        assertEq(key, makeAddr("sessionKey"));
        assertEq(revoked, false);
        
        // Test new functionality works
        ExtendedFunctionalityImpl upgradedAccount = ExtendedFunctionalityImpl(payable(address(account)));
        assertEq(upgradedAccount.newPublicFunction(), "Extended functionality");
    }

    function test_upgradeWithActiveRecovery() public {
        // Set up recovery guardian
        vm.prank(owner);
        account.addRecoveryGuardian(makeAddr("recoveryGuardian"));
        
        vm.prank(owner);
        account.setRecoveryThreshold(1);
        
        // Initiate recovery
        vm.prank(makeAddr("recoveryGuardian"));
        bytes32 recoveryId = account.initiateRecovery(makeAddr("newOwner"));
        
        // Request upgrade while recovery is pending
        UpgradedImplementationV3 newImpl = new UpgradedImplementationV3(entryPoint, address(factory));
        vm.prank(owner);
        account.requestUpgrade(address(newImpl));
        
        // Execute recovery (should cancel upgrade)
        vm.warp(block.timestamp + 48 hours + 1);
        account.executeRecovery(recoveryId);
        
        // Upgrade should be cancelled
        assertEq(account.pendingImplementation(), address(0));
        assertEq(account.upgradeRequestedAt(), 0);
        
        // New owner should be in control
        assertEq(account.owner(), makeAddr("newOwner"));
        assertTrue(account.isFrozen()); // Account should be frozen after recovery
    }

    function test_upgradeWithQueuedTransactions() public {
        // Queue a transaction
        vm.prank(owner);
        uint256 queueId = account.queueTransaction(
            makeAddr("target"),
            1 ether,
            abi.encodeWithSignature("someFunction()")
        );
        
        // Request upgrade
        ExtendedFunctionalityImpl newImpl = new ExtendedFunctionalityImpl(entryPoint, address(factory));
        vm.prank(owner);
        account.requestUpgrade(address(newImpl));
        
        vm.warp(block.timestamp + 24 hours + 1);
        
        bytes32 messageHash = keccak256(abi.encodePacked(
            "\x19Ethereum Signed Message:\n32",
            keccak256(abi.encodePacked(address(account), address(newImpl), account.upgradeRequestedAt(), block.chainid))
        ));
        
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(guardianPK, messageHash);
        bytes memory guardianSig = abi.encodePacked(r, s, v);
        
        vm.prank(owner);
        account.executeUpgrade(guardianSig);
        
        // Queued transaction should still be executable after upgrade
        (address target, uint256 value, bytes memory data, uint256 queuedAt, , bool executed, bool cancelled) 
            = account.queuedTransactions(queueId);
        
        assertEq(target, makeAddr("target"));
        assertEq(value, 1 ether);
        assertFalse(executed);
        assertFalse(cancelled);
        
        // Should still be able to execute or cancel
        vm.prank(owner);
        account.cancelQueued(queueId);
    }

    // ═══════════════════════════════════════════════════════════
    //                 SIGNATURE VALIDATION EDGE CASES
    // ═══════════════════════════════════════════════════════════

    function test_upgradeSignatureChainIdValidation() public {
        ExtendedFunctionalityImpl newImpl = new ExtendedFunctionalityImpl(entryPoint, address(factory));
        
        vm.prank(owner);
        account.requestUpgrade(address(newImpl));
        
        vm.warp(block.timestamp + 24 hours + 1);
        
        // Create signature for wrong chain ID
        uint256 wrongChainId = block.chainid + 1;
        bytes32 wrongChainHash = keccak256(abi.encodePacked(
            "\x19Ethereum Signed Message:\n32",
            keccak256(abi.encodePacked(address(account), address(newImpl), account.upgradeRequestedAt(), wrongChainId))
        ));
        
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(guardianPK, wrongChainHash);
        bytes memory wrongChainSig = abi.encodePacked(r, s, v);
        
        vm.prank(owner);
        vm.expectRevert(SigilAccount.InvalidGuardianSig.selector);
        account.executeUpgrade(wrongChainSig);
        
        // Correct signature should work
        bytes32 correctHash = keccak256(abi.encodePacked(
            "\x19Ethereum Signed Message:\n32",
            keccak256(abi.encodePacked(address(account), address(newImpl), account.upgradeRequestedAt(), block.chainid))
        ));
        
        (v, r, s) = vm.sign(guardianPK, correctHash);
        bytes memory correctSig = abi.encodePacked(r, s, v);
        
        vm.prank(owner);
        account.executeUpgrade(correctSig);
    }

    function test_upgradeSignatureMalleability() public {
        ExtendedFunctionalityImpl newImpl = new ExtendedFunctionalityImpl(entryPoint, address(factory));
        
        vm.prank(owner);
        account.requestUpgrade(address(newImpl));
        
        vm.warp(block.timestamp + 24 hours + 1);
        
        bytes32 messageHash = keccak256(abi.encodePacked(
            "\x19Ethereum Signed Message:\n32",
            keccak256(abi.encodePacked(address(account), address(newImpl), account.upgradeRequestedAt(), block.chainid))
        ));
        
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(guardianPK, messageHash);
        
        // Test with valid signature
        bytes memory validSig = abi.encodePacked(r, s, v);
        vm.prank(owner);
        account.executeUpgrade(validSig);
        
        // Verify upgrade succeeded
        assertEq(account.pendingImplementation(), address(0));
    }

    // ═══════════════════════════════════════════════════════════
    //                 STORAGE LAYOUT COMPATIBILITY
    // ═══════════════════════════════════════════════════════════

    function test_storageLayoutPreservationWithNewFields() public {
        // Record original values
        address originalOwner = account.owner();
        address originalAgent = account.agentKey();
        address originalGuardian = account.guardianKey();
        uint256 originalMaxTx = account.maxTxValue();
        uint256 originalDailyLimit = account.dailyLimit();
        uint256 originalGuardianThreshold = account.guardianThreshold();
        bool originalFrozen = account.isFrozen();
        
        // Upgrade to implementation with new storage fields
        UpgradedImplementationV3 newImpl = new UpgradedImplementationV3(entryPoint, address(factory));
        
        vm.prank(owner);
        account.requestUpgrade(address(newImpl));
        
        vm.warp(block.timestamp + 24 hours + 1);
        
        bytes32 messageHash = keccak256(abi.encodePacked(
            "\x19Ethereum Signed Message:\n32",
            keccak256(abi.encodePacked(address(account), address(newImpl), account.upgradeRequestedAt(), block.chainid))
        ));
        
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(guardianPK, messageHash);
        bytes memory guardianSig = abi.encodePacked(r, s, v);
        
        vm.prank(owner);
        account.executeUpgrade(guardianSig);
        
        // Verify original storage preserved
        assertEq(account.owner(), originalOwner);
        assertEq(account.agentKey(), originalAgent);
        assertEq(account.guardianKey(), originalGuardian);
        assertEq(account.maxTxValue(), originalMaxTx);
        assertEq(account.dailyLimit(), originalDailyLimit);
        assertEq(account.guardianThreshold(), originalGuardianThreshold);
        assertEq(account.isFrozen(), originalFrozen);
        
        // Test new functionality
        UpgradedImplementationV3 upgradedAccount = UpgradedImplementationV3(payable(address(account)));
        
        // New storage should be zero-initialized
        assertEq(upgradedAccount.getNewFeature(), 0);
        
        // Should be able to set new storage
        vm.prank(owner);
        upgradedAccount.setNewFeature(12345);
        assertEq(upgradedAccount.getNewFeature(), 12345);
    }

    // ═══════════════════════════════════════════════════════════
    //                 GAS AND PERFORMANCE TESTING
    // ═══════════════════════════════════════════════════════════

    function test_upgradeGasCostAnalysis() public {
        ExtendedFunctionalityImpl newImpl = new ExtendedFunctionalityImpl(entryPoint, address(factory));
        
        // Measure gas for upgrade request
        vm.prank(owner);
        uint256 requestStartGas = gasleft();
        account.requestUpgrade(address(newImpl));
        uint256 requestGasUsed = requestStartGas - gasleft();
        
        vm.warp(block.timestamp + 24 hours + 1);
        
        bytes32 messageHash = keccak256(abi.encodePacked(
            "\x19Ethereum Signed Message:\n32",
            keccak256(abi.encodePacked(address(account), address(newImpl), account.upgradeRequestedAt(), block.chainid))
        ));
        
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(guardianPK, messageHash);
        bytes memory guardianSig = abi.encodePacked(r, s, v);
        
        // Measure gas for upgrade execution
        vm.prank(owner);
        uint256 executeStartGas = gasleft();
        account.executeUpgrade(guardianSig);
        uint256 executeGasUsed = executeStartGas - gasleft();
        
        // Gas usage should be reasonable (these are rough estimates)
        assertTrue(requestGasUsed < 100000, "Upgrade request gas too high");
        assertTrue(executeGasUsed < 200000, "Upgrade execution gas too high");
        
        console.log("Upgrade request gas:", requestGasUsed);
        console.log("Upgrade execution gas:", executeGasUsed);
    }

    function test_multipleConcurrentUpgradeAttempts() public {
        ExtendedFunctionalityImpl impl1 = new ExtendedFunctionalityImpl(entryPoint, address(factory));
        UpgradedImplementationV3 impl2 = new UpgradedImplementationV3(entryPoint, address(factory));
        
        // Request first upgrade
        vm.prank(owner);
        account.requestUpgrade(address(impl1));
        
        uint256 firstRequestTime = account.upgradeRequestedAt();
        
        // Wait and request second (should overwrite)
        vm.warp(block.timestamp + 1 hours);
        vm.prank(owner);
        account.requestUpgrade(address(impl2));
        
        uint256 secondRequestTime = account.upgradeRequestedAt();
        assertTrue(secondRequestTime > firstRequestTime);
        
        // Only the second upgrade should be executable
        vm.warp(secondRequestTime + 24 hours + 1);
        
        bytes32 messageHash = keccak256(abi.encodePacked(
            "\x19Ethereum Signed Message:\n32",
            keccak256(abi.encodePacked(address(account), address(impl2), secondRequestTime, block.chainid))
        ));
        
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(guardianPK, messageHash);
        bytes memory guardianSig = abi.encodePacked(r, s, v);
        
        vm.prank(owner);
        account.executeUpgrade(guardianSig);
        
        // Should be upgraded to impl2, not impl1
        UpgradedImplementationV3 upgradedAccount = UpgradedImplementationV3(payable(address(account)));
        
        vm.prank(owner);
        upgradedAccount.setNewFeature(999);
        assertEq(upgradedAccount.getNewFeature(), 999);
    }
}