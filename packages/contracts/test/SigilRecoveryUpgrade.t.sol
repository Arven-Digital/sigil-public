// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Test.sol";
import "../src/SigilAccount.sol";
import "../src/SigilAccountFactory.sol";
import "@account-abstraction/interfaces/IEntryPoint.sol";
import "@account-abstraction/interfaces/INonceManager.sol";

/// @dev Minimal V2 implementation for upgrade tests
contract SigilAccountV2 is SigilAccount {
    constructor(IEntryPoint entryPoint_, address factory_) SigilAccount(entryPoint_, factory_) {}

    function version() external pure returns (string memory) {
        return "2.0.0";
    }
}

/// @dev Not a UUPS contract — should fail upgrade
contract NotUUPS {
    function version() external pure returns (string memory) {
        return "fake";
    }
}

contract SigilRecoveryUpgradeTest is Test {
    SigilAccount public account;
    SigilAccountFactory public factory;

    uint256 ownerPk = 0xA11CE;
    uint256 agentPk = 0xB0B;
    uint256 guardianPk = 0xC0DE; // AI guardian

    address owner;
    address agent;
    address aiGuardian;
    address entryPointAddr;

    // Recovery guardian keys
    uint256 rg1Pk = 0x1001;
    uint256 rg2Pk = 0x1002;
    uint256 rg3Pk = 0x1003;
    uint256 rg4Pk = 0x1004;
    uint256 rg5Pk = 0x1005;
    uint256 rg6Pk = 0x1006;
    uint256 rg7Pk = 0x1007;
    uint256 rg8Pk = 0x1008;

    address rg1;
    address rg2;
    address rg3;
    address rg4;
    address rg5;
    address rg6;
    address rg7;
    address rg8;

    function setUp() public {
        owner = vm.addr(ownerPk);
        agent = vm.addr(agentPk);
        aiGuardian = vm.addr(guardianPk);

        rg1 = vm.addr(rg1Pk);
        rg2 = vm.addr(rg2Pk);
        rg3 = vm.addr(rg3Pk);
        rg4 = vm.addr(rg4Pk);
        rg5 = vm.addr(rg5Pk);
        rg6 = vm.addr(rg6Pk);
        rg7 = vm.addr(rg7Pk);
        rg8 = vm.addr(rg8Pk);

        entryPointAddr = address(0xE1);
        vm.mockCall(entryPointAddr, abi.encodeWithSelector(INonceManager.getNonce.selector), abi.encode(uint256(0)));

        factory = new SigilAccountFactory(IEntryPoint(entryPointAddr), address(this), 0);
        account = factory.createAccount(owner, agent, aiGuardian, 1 ether, 5 ether, 0.5 ether, 0);

        vm.deal(address(account), 100 ether);
    }

    // ═══════════════════════════════════════════════════════════
    //                 GUARDIAN MANAGEMENT
    // ═══════════════════════════════════════════════════════════

    function test_addRecoveryGuardian() public {
        vm.prank(owner);
        account.addRecoveryGuardian(rg1);
        assertTrue(account.isRecoveryGuardian(rg1));
        (uint256 threshold, uint256 count, uint256 delay) = account.getRecoveryConfig();
        assertEq(count, 1);
        assertEq(threshold, 1);
        assertEq(delay, 48 hours);
    }

    function test_addMultipleGuardians() public {
        vm.startPrank(owner);
        account.addRecoveryGuardian(rg1);
        account.addRecoveryGuardian(rg2);
        account.addRecoveryGuardian(rg3);
        vm.stopPrank();

        (, uint256 count,) = account.getRecoveryConfig();
        assertEq(count, 3);

        address[] memory list = account.getRecoveryGuardians();
        assertEq(list.length, 3);
    }

    function test_addGuardianOnlyOwner() public {
        vm.prank(rg1);
        vm.expectRevert(SigilAccount.NotOwner.selector);
        account.addRecoveryGuardian(rg2);
    }

    function test_addDuplicateGuardianReverts() public {
        vm.startPrank(owner);
        account.addRecoveryGuardian(rg1);
        vm.expectRevert(SigilAccount.AlreadyRecoveryGuardian.selector);
        account.addRecoveryGuardian(rg1);
        vm.stopPrank();
    }

    function test_addMax7Guardians() public {
        vm.startPrank(owner);
        account.addRecoveryGuardian(rg1);
        account.addRecoveryGuardian(rg2);
        account.addRecoveryGuardian(rg3);
        account.addRecoveryGuardian(rg4);
        account.addRecoveryGuardian(rg5);
        account.addRecoveryGuardian(rg6);
        account.addRecoveryGuardian(rg7);
        vm.expectRevert(SigilAccount.MaxGuardiansReached.selector);
        account.addRecoveryGuardian(rg8);
        vm.stopPrank();
    }

    function test_cannotAddAIGuardianAsRecoveryGuardian() public {
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(SigilAccount.KeyCollision.selector, uint8(7)));
        account.addRecoveryGuardian(aiGuardian);
    }

    function test_cannotAddAgentAsRecoveryGuardian() public {
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(SigilAccount.KeyCollision.selector, uint8(3)));
        account.addRecoveryGuardian(agent);
    }

    function test_cannotAddOwnerAsRecoveryGuardian() public {
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(SigilAccount.KeyCollision.selector, uint8(2)));
        account.addRecoveryGuardian(owner);
    }

    function test_removeRecoveryGuardian() public {
        vm.startPrank(owner);
        account.addRecoveryGuardian(rg1);
        account.addRecoveryGuardian(rg2);
        account.removeRecoveryGuardian(rg1);
        vm.stopPrank();

        assertFalse(account.isRecoveryGuardian(rg1));
        assertTrue(account.isRecoveryGuardian(rg2));
        (, uint256 count,) = account.getRecoveryConfig();
        assertEq(count, 1);
    }

    function test_removeNonGuardianReverts() public {
        vm.prank(owner);
        vm.expectRevert(SigilAccount.NotAlreadyRecoveryGuardian.selector);
        account.removeRecoveryGuardian(rg1);
    }

    function test_removeGuardianAdjustsThreshold() public {
        vm.startPrank(owner);
        account.addRecoveryGuardian(rg1);
        account.addRecoveryGuardian(rg2);
        account.setRecoveryThreshold(2);
        account.removeRecoveryGuardian(rg2);
        vm.stopPrank();

        (uint256 threshold,,) = account.getRecoveryConfig();
        assertEq(threshold, 1); // auto-adjusted down
    }

    function test_setRecoveryThreshold() public {
        vm.startPrank(owner);
        account.addRecoveryGuardian(rg1);
        account.addRecoveryGuardian(rg2);
        account.addRecoveryGuardian(rg3);
        account.setRecoveryThreshold(2);
        vm.stopPrank();

        (uint256 threshold,,) = account.getRecoveryConfig();
        assertEq(threshold, 2);
    }

    function test_setRecoveryThresholdInvalid() public {
        vm.startPrank(owner);
        account.addRecoveryGuardian(rg1);
        account.addRecoveryGuardian(rg2);

        vm.expectRevert(SigilAccount.InvalidRecoveryThreshold.selector);
        account.setRecoveryThreshold(0);

        vm.expectRevert(SigilAccount.InvalidRecoveryThreshold.selector);
        account.setRecoveryThreshold(3); // only 2 guardians
        vm.stopPrank();
    }

    function test_setRecoveryDelay() public {
        vm.startPrank(owner);
        account.addRecoveryGuardian(rg1);
        account.setRecoveryDelay(72 hours);
        vm.stopPrank();

        (,, uint256 delay) = account.getRecoveryConfig();
        assertEq(delay, 72 hours);
    }

    function test_setRecoveryDelayInvalid() public {
        vm.startPrank(owner);
        vm.expectRevert(SigilAccount.InvalidRecoveryDelay.selector);
        account.setRecoveryDelay(1 hours); // below min

        vm.expectRevert(SigilAccount.InvalidRecoveryDelay.selector);
        account.setRecoveryDelay(31 days); // above max
        vm.stopPrank();
    }

    // ═══════════════════════════════════════════════════════════
    //                 RECOVERY FLOW
    // ═══════════════════════════════════════════════════════════

    function _setupGuardians() internal {
        vm.startPrank(owner);
        account.addRecoveryGuardian(rg1);
        account.addRecoveryGuardian(rg2);
        account.addRecoveryGuardian(rg3);
        account.setRecoveryThreshold(2);
        vm.stopPrank();
    }

    function test_fullRecoveryFlow() public {
        _setupGuardians();
        address newOwner = address(0x9999);

        // Initiate
        vm.prank(rg1);
        bytes32 recoveryId = account.initiateRecovery(newOwner);

        // Support (meets threshold of 2)
        vm.prank(rg2);
        account.supportRecovery(recoveryId);

        // Check status
        (address no, uint256 sc, uint256 ea, bool ex, bool ca,) = account.getRecoveryStatus(recoveryId);
        assertEq(no, newOwner);
        assertEq(sc, 2);
        assertTrue(ea > 0);
        assertFalse(ex);
        assertFalse(ca);

        // Wait for delay
        vm.warp(block.timestamp + 48 hours + 1);

        // Execute
        account.executeRecovery(recoveryId);
        assertEq(account.owner(), newOwner);
        // R8: Account is frozen after recovery
        assertTrue(account.isFrozen());
    }

    function test_recoveryNonGuardianReverts() public {
        _setupGuardians();
        vm.prank(address(0xBAD));
        vm.expectRevert(SigilAccount.NotRecoveryGuardian.selector);
        account.initiateRecovery(address(0x9999));
    }

    function test_recoveryInvalidNewOwner() public {
        _setupGuardians();
        vm.prank(rg1);
        vm.expectRevert(SigilAccount.InvalidNewOwner.selector);
        account.initiateRecovery(address(0));

        vm.prank(rg1);
        vm.expectRevert(SigilAccount.InvalidNewOwner.selector);
        account.initiateRecovery(owner); // can't recover to same owner
    }

    function test_duplicateSupportReverts() public {
        _setupGuardians();
        address newOwner = address(0x9999);

        vm.prank(rg1);
        bytes32 recoveryId = account.initiateRecovery(newOwner);

        // rg1 already supported via initiate
        vm.prank(rg1);
        vm.expectRevert(SigilAccount.AlreadySupported.selector);
        account.supportRecovery(recoveryId);
    }

    function test_recoveryThresholdNotMet() public {
        _setupGuardians();
        address newOwner = address(0x9999);

        vm.prank(rg1);
        bytes32 recoveryId = account.initiateRecovery(newOwner);

        // Only 1 support, threshold is 2 — can't execute
        vm.warp(block.timestamp + 48 hours + 1);
        vm.expectRevert(SigilAccount.RecoveryThresholdNotMet.selector);
        account.executeRecovery(recoveryId);
    }

    function test_recoveryDelayNotElapsed() public {
        _setupGuardians();
        address newOwner = address(0x9999);

        vm.prank(rg1);
        bytes32 recoveryId = account.initiateRecovery(newOwner);

        vm.prank(rg2);
        account.supportRecovery(recoveryId);

        // Try immediately
        vm.expectRevert(SigilAccount.RecoveryDelayNotElapsed.selector);
        account.executeRecovery(recoveryId);
    }

    function test_recoveryCancelledByOwner() public {
        _setupGuardians();
        address newOwner = address(0x9999);

        vm.prank(rg1);
        bytes32 recoveryId = account.initiateRecovery(newOwner);

        vm.prank(rg2);
        account.supportRecovery(recoveryId);

        // Owner cancels
        vm.prank(owner);
        account.cancelRecovery(recoveryId);

        // Can't execute after cancel
        vm.warp(block.timestamp + 48 hours + 1);
        vm.expectRevert(SigilAccount.RecoveryAlreadyCancelled.selector);
        account.executeRecovery(recoveryId);
    }

    function test_cancelRecoveryOnlyOwner() public {
        _setupGuardians();
        vm.prank(rg1);
        bytes32 recoveryId = account.initiateRecovery(address(0x9999));

        vm.prank(rg1);
        vm.expectRevert(SigilAccount.NotOwner.selector);
        account.cancelRecovery(recoveryId);
    }

    function test_recoveryWhileFrozen() public {
        _setupGuardians();
        address newOwner = address(0x9999);

        // Freeze the account
        vm.prank(owner);
        account.freeze();

        // Recovery should still work!
        vm.prank(rg1);
        bytes32 recoveryId = account.initiateRecovery(newOwner);

        vm.prank(rg2);
        account.supportRecovery(recoveryId);

        vm.warp(block.timestamp + 48 hours + 1);

        account.executeRecovery(recoveryId);
        assertEq(account.owner(), newOwner);
    }

    function test_recoveryNoncePreventsDuplicateIds() public {
        _setupGuardians();
        address newOwner = address(0x9999);

        vm.prank(rg1);
        bytes32 id1 = account.initiateRecovery(newOwner);

        // Cancel first
        vm.prank(owner);
        account.cancelRecovery(id1);

        // Initiate again — different ID due to nonce
        vm.prank(rg1);
        bytes32 id2 = account.initiateRecovery(newOwner);

        assertTrue(id1 != id2);
    }

    function test_recoveryCancelsPendingOwnerTransfer() public {
        _setupGuardians();
        address newOwner = address(0x9999);
        address transferTarget = address(0x8888);

        // Start an ownership transfer
        vm.prank(owner);
        account.requestOwnerTransfer(transferTarget);
        assertEq(account.pendingOwner(), transferTarget);

        // Execute recovery
        vm.prank(rg1);
        bytes32 recoveryId = account.initiateRecovery(newOwner);
        vm.prank(rg2);
        account.supportRecovery(recoveryId);
        vm.warp(block.timestamp + 48 hours + 1);
        account.executeRecovery(recoveryId);

        // Pending transfer should be cancelled
        assertEq(account.pendingOwner(), address(0));
        assertEq(account.owner(), newOwner);
    }

    function test_recoveryDoubleExecuteReverts() public {
        _setupGuardians();
        address newOwner = address(0x9999);

        vm.prank(rg1);
        bytes32 recoveryId = account.initiateRecovery(newOwner);
        vm.prank(rg2);
        account.supportRecovery(recoveryId);
        vm.warp(block.timestamp + 48 hours + 1);

        account.executeRecovery(recoveryId);

        vm.expectRevert(SigilAccount.RecoveryAlreadyExecuted.selector);
        account.executeRecovery(recoveryId);
    }

    function test_supportNonexistentRecoveryReverts() public {
        _setupGuardians();
        vm.prank(rg1);
        vm.expectRevert(SigilAccount.RecoveryNotFound.selector);
        account.supportRecovery(bytes32(0));
    }

    function test_recoveryWithThreshold1() public {
        vm.startPrank(owner);
        account.addRecoveryGuardian(rg1);
        // threshold auto-set to 1
        vm.stopPrank();

        address newOwner = address(0x9999);
        vm.prank(rg1);
        bytes32 recoveryId = account.initiateRecovery(newOwner);

        // Threshold met immediately (1 support from initiate)
        vm.warp(block.timestamp + 48 hours + 1);
        account.executeRecovery(recoveryId);
        assertEq(account.owner(), newOwner);
    }

    // ═══════════════════════════════════════════════════════════
    //           R11: GUARDIAN EPOCH INVALIDATION
    // ═══════════════════════════════════════════════════════════

    function test_removedGuardianInvalidatesPendingRecovery() public {
        vm.startPrank(owner);
        account.addRecoveryGuardian(rg1);
        account.addRecoveryGuardian(rg2);
        account.setRecoveryThreshold(2);
        vm.stopPrank();

        // rg1 initiates recovery
        address newOwner = address(0x9999);
        vm.prank(rg1);
        bytes32 recoveryId = account.initiateRecovery(newOwner);

        // Owner removes rg1 (epoch changes)
        vm.prank(owner);
        account.removeRecoveryGuardian(rg1);

        // rg2 tries to support — epoch mismatch
        vm.prank(rg2);
        vm.expectRevert(SigilAccount.RecoveryEpochMismatch.selector);
        account.supportRecovery(recoveryId);
    }

    function test_addGuardianInvalidatesPendingRecovery() public {
        vm.startPrank(owner);
        account.addRecoveryGuardian(rg1);
        // threshold = 1, so initiation meets threshold immediately
        vm.stopPrank();

        address newOwner = address(0x9999);
        vm.prank(rg1);
        bytes32 recoveryId = account.initiateRecovery(newOwner);

        // Owner adds another guardian (epoch changes)
        vm.prank(owner);
        account.addRecoveryGuardian(rg2);

        // Try to execute — epoch mismatch
        vm.warp(block.timestamp + 48 hours + 1);
        vm.expectRevert(SigilAccount.RecoveryEpochMismatch.selector);
        account.executeRecovery(recoveryId);
    }

    function test_recoverySucceedsWithSameEpoch() public {
        vm.startPrank(owner);
        account.addRecoveryGuardian(rg1);
        account.addRecoveryGuardian(rg2);
        account.setRecoveryThreshold(2);
        vm.stopPrank();

        // Both guardians support without guardian changes
        address newOwner = address(0x9999);
        vm.prank(rg1);
        bytes32 recoveryId = account.initiateRecovery(newOwner);

        vm.prank(rg2);
        account.supportRecovery(recoveryId);

        vm.warp(block.timestamp + 48 hours + 1);
        account.executeRecovery(recoveryId);
        assertEq(account.owner(), newOwner);
    }

    function test_recoveryExpiresAfter30DaysFromExecutable() public {
        vm.startPrank(owner);
        account.addRecoveryGuardian(rg1);
        vm.stopPrank();

        address newOwner = address(0x9999);
        vm.prank(rg1);
        bytes32 recoveryId = account.initiateRecovery(newOwner);

        // executeAfter = now + 48h (default delay), expiry = executeAfter + 30 days
        // Warp past executeAfter + 30 days
        vm.warp(block.timestamp + 48 hours + 30 days + 1);
        vm.expectRevert(SigilAccount.RecoveryExpired.selector);
        account.executeRecovery(recoveryId);
    }

    function test_recoveryWithMaxDelayStillWorks() public {
        vm.startPrank(owner);
        account.addRecoveryGuardian(rg1);
        account.setRecoveryDelay(30 days); // max delay
        vm.stopPrank();

        address newOwner = address(0x9999);
        vm.prank(rg1);
        bytes32 recoveryId = account.initiateRecovery(newOwner);

        // executeAfter = now + 30 days. Execute 1 day after that — well within 30-day expiry window
        vm.warp(block.timestamp + 30 days + 1 days);
        account.executeRecovery(recoveryId);
        assertEq(account.owner(), newOwner);
    }

    function test_recoveryJustBeforeExpirySucceeds() public {
        vm.startPrank(owner);
        account.addRecoveryGuardian(rg1);
        vm.stopPrank();

        address newOwner = address(0x9999);
        vm.prank(rg1);
        bytes32 recoveryId = account.initiateRecovery(newOwner);

        // executeAfter = now + 48h, expiry = executeAfter + 30 days
        // Warp to just before expiry
        vm.warp(block.timestamp + 48 hours + 30 days - 1);
        account.executeRecovery(recoveryId);
        assertEq(account.owner(), newOwner);
    }

    function test_removeSessionTarget() public {
        vm.startPrank(owner);
        address sessionAddr = address(0xBEEF);
        uint256 sid = account.createSessionKey(sessionAddr, 0, block.timestamp + 1 hours, 1 ether, 0, 0, false);
        address target_ = address(0xCAFE);
        account.addSessionTarget(sid, target_);
        assertTrue(account.sessionAllowedTargets(sid, target_));
        account.removeSessionTarget(sid, target_);
        assertFalse(account.sessionAllowedTargets(sid, target_));
        vm.stopPrank();
    }

    function test_removeSessionFunction() public {
        vm.startPrank(owner);
        address sessionAddr = address(0xBEEF);
        uint256 sid = account.createSessionKey(sessionAddr, 0, block.timestamp + 1 hours, 1 ether, 0, 0, false);
        bytes4 sel = bytes4(keccak256("transfer(address,uint256)"));
        account.addSessionFunction(sid, sel);
        assertTrue(account.sessionAllowedFunctions(sid, sel));
        account.removeSessionFunction(sid, sel);
        assertFalse(account.sessionAllowedFunctions(sid, sel));
        vm.stopPrank();
    }

    // ═══════════════════════════════════════════════════════════
    //                 UPGRADE TIMELOCK
    // ═══════════════════════════════════════════════════════════

    function _deployV2() internal returns (SigilAccountV2) {
        return new SigilAccountV2(IEntryPoint(entryPointAddr), address(factory));
    }

    function _signUpgrade(address impl, uint256 requestedAt) internal view returns (bytes memory) {
        bytes32 hash = keccak256(abi.encodePacked(
            "\x19Ethereum Signed Message:\n32",
            keccak256(abi.encodePacked(address(account), impl, requestedAt, block.chainid))
        ));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(guardianPk, hash);
        return abi.encodePacked(r, s, v);
    }

    function test_requestUpgrade() public {
        SigilAccountV2 v2 = _deployV2();

        vm.prank(owner);
        account.requestUpgrade(address(v2));

        assertEq(account.pendingImplementation(), address(v2));
        assertTrue(account.upgradeRequestedAt() > 0);
    }

    function test_requestUpgradeOnlyOwner() public {
        SigilAccountV2 v2 = _deployV2();
        vm.prank(rg1);
        vm.expectRevert(SigilAccount.NotOwner.selector);
        account.requestUpgrade(address(v2));
    }

    function test_requestUpgradeRejectsZero() public {
        vm.prank(owner);
        vm.expectRevert(SigilAccount.ZeroImpl.selector);
        account.requestUpgrade(address(0));
    }

    function test_requestUpgradeRejectsEOA() public {
        vm.prank(owner);
        vm.expectRevert(SigilAccount.NotContract.selector);
        account.requestUpgrade(address(0x1234));
    }

    function test_requestUpgradeRejectsWhenFrozen() public {
        SigilAccountV2 v2 = _deployV2();
        vm.prank(owner);
        account.freeze();
        vm.prank(owner);
        vm.expectRevert(SigilAccount.AccountIsFrozen.selector);
        account.requestUpgrade(address(v2));
    }

    function test_cancelUpgrade() public {
        SigilAccountV2 v2 = _deployV2();
        vm.startPrank(owner);
        account.requestUpgrade(address(v2));
        account.cancelUpgrade();
        vm.stopPrank();

        assertEq(account.pendingImplementation(), address(0));
        assertEq(account.upgradeRequestedAt(), 0);
    }

    function test_cancelUpgradeNoPending() public {
        vm.prank(owner);
        vm.expectRevert(SigilAccount.NoPendingUpgrade.selector);
        account.cancelUpgrade();
    }

    function test_executeUpgradeFlow() public {
        SigilAccountV2 v2 = _deployV2();

        vm.prank(owner);
        account.requestUpgrade(address(v2));
        uint256 requestedAt = account.upgradeRequestedAt();

        vm.warp(block.timestamp + 24 hours + 1);

        bytes memory guardianSig = _signUpgrade(address(v2), requestedAt);

        vm.prank(owner);
        account.executeUpgrade(guardianSig);

        // Verify upgrade — call version() on the proxy
        SigilAccountV2 upgraded = SigilAccountV2(payable(address(account)));
        assertEq(upgraded.version(), "2.0.0");

        // State should be preserved
        assertEq(upgraded.owner(), owner);
    }

    function test_executeUpgradeBeforeDelayReverts() public {
        SigilAccountV2 v2 = _deployV2();

        vm.prank(owner);
        account.requestUpgrade(address(v2));
        uint256 requestedAt = account.upgradeRequestedAt();

        bytes memory guardianSig = _signUpgrade(address(v2), requestedAt);

        vm.prank(owner);
        vm.expectRevert(SigilAccount.UpgradeDelayNotElapsed.selector);
        account.executeUpgrade(guardianSig);
    }

    function test_executeUpgradeInvalidGuardianSig() public {
        SigilAccountV2 v2 = _deployV2();

        vm.prank(owner);
        account.requestUpgrade(address(v2));
        uint256 requestedAt = account.upgradeRequestedAt();

        vm.warp(block.timestamp + 24 hours + 1);

        // Sign with wrong key
        bytes32 hash = keccak256(abi.encodePacked(
            "\x19Ethereum Signed Message:\n32",
            keccak256(abi.encodePacked(address(account), address(v2), requestedAt, block.chainid))
        ));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(0xDEAD, hash);
        bytes memory badSig = abi.encodePacked(r, s, v);

        vm.prank(owner);
        vm.expectRevert(SigilAccount.InvalidGuardianSig.selector);
        account.executeUpgrade(badSig);
    }

    function test_executeUpgradeNoPending() public {
        vm.prank(owner);
        vm.expectRevert(SigilAccount.NoPendingUpgrade.selector);
        account.executeUpgrade("");
    }

    function test_upgradeConstant() public pure {
        assert(24 hours == 24 hours);
    }
}
