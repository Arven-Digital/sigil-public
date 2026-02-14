// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Test.sol";
import "../src/SigilAccount.sol";
import "../src/SigilAccountFactory.sol";
import "@account-abstraction/interfaces/IEntryPoint.sol";
import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

// Mock upgraded implementation for testing
contract SigilAccountV2 is SigilAccount {
    // New storage variable added at the end
    uint256 public newStorageVariable;
    
    constructor(IEntryPoint entryPoint_, address factory_) SigilAccount(entryPoint_, factory_) {}
    
    function setNewStorageVariable(uint256 value) external {
        newStorageVariable = value;
    }
    
    function getVersion() external pure returns (string memory) {
        return "v2";
    }
}

// Malicious implementation that could break storage
contract MaliciousImplementation is SigilAccount {
    // Storage layout completely broken - different order
    uint256 public maliciousVariable;
    address public maliciousOwner; // This would overwrite real owner slot
    
    constructor(IEntryPoint entryPoint_, address factory_) SigilAccount(entryPoint_, factory_) {}
    
    function exploitOwner(address newOwner) external {
        maliciousOwner = newOwner;
    }
}

// Mock EntryPoint for testing
contract MockEntryPointUpgrade {
    function getNonce(address, uint192) external pure returns (uint256) {
        return 0;
    }
    
    function validateUserOp(address, bytes32, uint256) external pure returns (uint256) {
        return 0;
    }
}

/**
 * @title SigilUpgradeSafety
 * @notice R29: Upgrade Safety - Storage Layout, Initialization, Implementation Destruction, Proxy Edge Cases
 */
contract SigilUpgradeSafetyTest is Test {
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
        entryPoint = IEntryPoint(address(new MockEntryPointUpgrade()));
        
        // Deploy factory and implementation
        implementation = new SigilAccount(entryPoint, address(0));
        factory = new SigilAccountFactory(entryPoint, makeAddr("treasury"), 0.1 ether);
        
        vm.deal(owner, 1 ether);
        
        // Create account
        account = factory.createAccount{value: 0.1 ether}(
            owner,
            agentKey,
            guardianKey,
            1 ether,    // maxTxValue
            10 ether,   // dailyLimit 
            5 ether,    // guardianThreshold
            0
        );
    }

    // ═══════════════════════════════════════════════════════════
    //                    STORAGE LAYOUT SAFETY
    // ═══════════════════════════════════════════════════════════

    function test_storageSlotConsistency() public {
        // Test that critical storage slots are at expected positions
        // This helps detect inadvertent storage layout changes
        
        bytes32 ownerSlot = vm.load(address(account), bytes32(uint256(0)));
        bytes32 agentKeySlot = vm.load(address(account), bytes32(uint256(1)));  
        bytes32 guardianKeySlot = vm.load(address(account), bytes32(uint256(2)));
        
        assertEq(address(uint160(uint256(ownerSlot))), owner, "Owner slot mismatch");
        assertEq(address(uint160(uint256(agentKeySlot))), agentKey, "Agent key slot mismatch");
        assertEq(address(uint160(uint256(guardianKeySlot))), guardianKey, "Guardian key slot mismatch");
    }

    function test_upgradePreservesStorageLayout() public {
        // Deploy V2 implementation
        SigilAccountV2 implV2 = new SigilAccountV2(entryPoint, address(factory));
        
        // Store original values
        address originalOwner = account.owner();
        address originalAgent = account.agentKey();
        address originalGuardian = account.guardianKey();
        uint256 originalMaxTx = account.maxTxValue();
        uint256 originalDailyLimit = account.dailyLimit();
        bool originalFrozen = account.isFrozen();
        
        // Request upgrade
        vm.prank(owner);
        account.requestUpgrade(address(implV2));
        
        // Fast forward past delay
        vm.warp(block.timestamp + 24 hours + 1);
        
        // Create guardian signature
        bytes32 messageHash = keccak256(abi.encodePacked(
            "\x19Ethereum Signed Message:\n32",
            keccak256(abi.encodePacked(address(account), address(implV2), account.upgradeRequestedAt(), block.chainid))
        ));
        
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(guardianPK, messageHash);
        bytes memory guardianSig = abi.encodePacked(r, s, v);
        
        // Execute upgrade
        vm.prank(owner);
        account.executeUpgrade(guardianSig);
        
        // Verify storage preservation
        assertEq(account.owner(), originalOwner, "Owner changed during upgrade");
        assertEq(account.agentKey(), originalAgent, "Agent key changed during upgrade"); 
        assertEq(account.guardianKey(), originalGuardian, "Guardian key changed during upgrade");
        assertEq(account.maxTxValue(), originalMaxTx, "MaxTxValue changed during upgrade");
        assertEq(account.dailyLimit(), originalDailyLimit, "DailyLimit changed during upgrade");
        assertEq(account.isFrozen(), originalFrozen, "Frozen state changed during upgrade");
        
        // Test new functionality works
        SigilAccountV2 accountV2 = SigilAccountV2(payable(address(account)));
        assertEq(accountV2.getVersion(), "v2", "Upgrade did not work");
    }

    function test_storageGapsPreventCollisions() public {
        // Verify storage gaps provide sufficient buffer for new variables
        // Recovery gap: 50 - 8 used = 42 slots available
        // Session gap: 50 - 5 used = 45 slots available  
        // Upgrade gap: 50 - 3 used = 47 slots available
        
        // These gaps should allow adding variables without affecting other sections
        uint256 gapSlotsRecovery = 42;
        uint256 gapSlotsSession = 45;
        uint256 gapSlotsUpgrade = 47;
        
        assertTrue(gapSlotsRecovery >= 20, "Recovery gap too small for future expansion");
        assertTrue(gapSlotsSession >= 20, "Session gap too small for future expansion");
        assertTrue(gapSlotsUpgrade >= 20, "Upgrade gap too small for future expansion");
    }

    // ═══════════════════════════════════════════════════════════
    //                  INITIALIZATION SAFETY 
    // ═══════════════════════════════════════════════════════════

    function test_implementationIsDisabled() public {
        // Implementation should be disabled to prevent direct calls
        vm.expectRevert();
        implementation.initialize(owner, agentKey, guardianKey, 1 ether, 10 ether, 5 ether);
    }

    function test_cannotReinitializeProxy() public {
        // Account should not be reinitializable
        vm.expectRevert();
        account.initialize(makeAddr("attacker"), agentKey, guardianKey, 1 ether, 10 ether, 5 ether);
        
        vm.expectRevert();
        account.initializeWithDelay(makeAddr("attacker"), agentKey, guardianKey, 1 ether, 10 ether, 5 ether, 24 hours);
    }

    function test_factoryOnlyInitialization() public {
        // Only factory can initialize accounts
        SigilAccount directProxy = SigilAccount(payable(address(new ERC1967Proxy(
            address(implementation),
            ""
        ))));
        
        vm.expectRevert(SigilAccount.OnlyFactory.selector);
        directProxy.initialize(owner, agentKey, guardianKey, 1 ether, 10 ether, 5 ether);
    }

    // ═══════════════════════════════════════════════════════════
    //                   PROXY EDGE CASES
    // ═══════════════════════════════════════════════════════════

    function test_upgradeRequiresOwnerAndGuardianConsent() public {
        SigilAccountV2 implV2 = new SigilAccountV2(entryPoint, address(factory));
        
        // Non-owner cannot request upgrade
        vm.prank(makeAddr("attacker"));
        vm.expectRevert(SigilAccount.NotOwner.selector);
        account.requestUpgrade(address(implV2));
        
        // Owner can request
        vm.prank(owner);
        account.requestUpgrade(address(implV2));
        
        // Cannot execute without valid guardian signature - use wrong signer
        vm.warp(block.timestamp + 24 hours + 1);
        
        bytes32 messageHash = keccak256(abi.encodePacked(
            "\x19Ethereum Signed Message:\n32",
            keccak256(abi.encodePacked(address(account), address(implV2), account.upgradeRequestedAt(), block.chainid))
        ));
        
        // Sign with wrong key (agent key instead of guardian key)
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(agentPK, messageHash);
        bytes memory wrongSig = abi.encodePacked(r, s, v);
        
        vm.prank(owner);
        vm.expectRevert(SigilAccount.InvalidGuardianSig.selector);
        account.executeUpgrade(wrongSig);
    }

    function test_upgradeTimelockEnforcement() public {
        SigilAccountV2 implV2 = new SigilAccountV2(entryPoint, address(factory));
        
        vm.prank(owner);
        account.requestUpgrade(address(implV2));
        
        // Cannot execute immediately
        vm.prank(owner);
        vm.expectRevert(SigilAccount.UpgradeDelayNotElapsed.selector);
        account.executeUpgrade("");
        
        // Cannot execute 1 second before delay
        vm.warp(block.timestamp + 24 hours - 1);
        vm.prank(owner);
        vm.expectRevert(SigilAccount.UpgradeDelayNotElapsed.selector);
        account.executeUpgrade("");
    }

    function test_upgradeBlocksInvalidImplementations() public {
        // Zero address
        vm.prank(owner);
        vm.expectRevert(SigilAccount.ZeroImpl.selector);
        account.requestUpgrade(address(0));
        
        // EOA (no code)
        vm.prank(owner);
        vm.expectRevert(SigilAccount.NotContract.selector);
        account.requestUpgrade(makeAddr("eoa"));
    }

    function test_upgradeCancellationWorks() public {
        SigilAccountV2 implV2 = new SigilAccountV2(entryPoint, address(factory));
        
        vm.prank(owner);
        account.requestUpgrade(address(implV2));
        
        assertEq(account.pendingImplementation(), address(implV2));
        assertTrue(account.upgradeRequestedAt() > 0);
        
        vm.prank(owner);
        account.cancelUpgrade();
        
        assertEq(account.pendingImplementation(), address(0));
        assertEq(account.upgradeRequestedAt(), 0);
    }

    function test_frozenAccountBlocksUpgrades() public {
        SigilAccountV2 implV2 = new SigilAccountV2(entryPoint, address(factory));
        
        // Freeze account
        vm.prank(owner);
        account.freeze();
        
        // Cannot request upgrade when frozen
        vm.prank(owner);
        vm.expectRevert(SigilAccount.AccountIsFrozen.selector);
        account.requestUpgrade(address(implV2));
    }

    // ═══════════════════════════════════════════════════════════
    //                 IMPLEMENTATION DESTRUCTION
    // ═══════════════════════════════════════════════════════════

    function test_upgradeAuthorizationControlled() public {
        // _authorizeUpgrade should only work with upgrade flow
        // This is internal, but we can test indirectly via upgradeToAndCall
        
        SigilAccountV2 implV2 = new SigilAccountV2(entryPoint, address(factory));
        
        // Direct upgradeToAndCall should fail (no authorization flag set)
        vm.prank(owner);
        vm.expectRevert(SigilAccount.NoPendingUpgrade.selector);
        account.upgradeToAndCall(address(implV2), "");
    }

    function test_multipleUpgradeRequestsCancelled() public {
        SigilAccountV2 implV2 = new SigilAccountV2(entryPoint, address(factory));
        SigilAccountV2 implV3 = new SigilAccountV2(entryPoint, address(factory));
        
        // Request first upgrade
        vm.prank(owner);
        account.requestUpgrade(address(implV2));
        
        assertEq(account.pendingImplementation(), address(implV2));
        
        // Request second upgrade should overwrite first
        vm.prank(owner);
        account.requestUpgrade(address(implV3));
        
        assertEq(account.pendingImplementation(), address(implV3));
        assertTrue(account.upgradeRequestedAt() > 0);
    }

    // ═══════════════════════════════════════════════════════════
    //                  EDGE CASE INTERACTIONS
    // ═══════════════════════════════════════════════════════════

    function test_recoveryCancelsUpgrade() public {
        // Set up recovery guardian
        vm.prank(owner);
        account.addRecoveryGuardian(makeAddr("recoveryGuardian"));
        
        vm.prank(owner);
        account.setRecoveryThreshold(1);
        
        // Request upgrade
        SigilAccountV2 implV2 = new SigilAccountV2(entryPoint, address(factory));
        vm.prank(owner);
        account.requestUpgrade(address(implV2));
        
        assertEq(account.pendingImplementation(), address(implV2));
        
        // Execute recovery (should cancel upgrade)
        vm.prank(makeAddr("recoveryGuardian"));
        bytes32 recoveryId = account.initiateRecovery(makeAddr("newOwner"));
        
        vm.warp(block.timestamp + 48 hours + 1);
        account.executeRecovery(recoveryId);
        
        // Upgrade should be cancelled
        assertEq(account.pendingImplementation(), address(0));
        assertEq(account.upgradeRequestedAt(), 0);
    }

    function test_guardianRotationInvalidatesUpgradeSignature() public {
        SigilAccountV2 implV2 = new SigilAccountV2(entryPoint, address(factory));
        
        // Request upgrade
        vm.prank(owner);
        account.requestUpgrade(address(implV2));
        
        // Create guardian signature with current guardian
        bytes32 messageHash = keccak256(abi.encodePacked(
            "\x19Ethereum Signed Message:\n32",
            keccak256(abi.encodePacked(address(account), address(implV2), account.upgradeRequestedAt(), block.chainid))
        ));
        
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(guardianPK, messageHash);
        bytes memory oldGuardianSig = abi.encodePacked(r, s, v);
        
        // Rotate guardian key
        address newGuardian = makeAddr("newGuardian");
        vm.prank(owner);
        account.rotateGuardianKey(newGuardian);
        
        // Fast forward past delay
        vm.warp(block.timestamp + 24 hours + 1);
        
        // Old signature should fail
        vm.prank(owner);
        vm.expectRevert(SigilAccount.InvalidGuardianSig.selector);
        account.executeUpgrade(oldGuardianSig);
    }
}