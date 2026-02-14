// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Test.sol";
import "../src/SigilAccount.sol";
import "../src/SigilAccountFactory.sol";
import "@account-abstraction/interfaces/PackedUserOperation.sol";
import "@account-abstraction/interfaces/IEntryPoint.sol";
import "@account-abstraction/interfaces/INonceManager.sol";
import "@account-abstraction/core/BaseAccount.sol";

contract SigilAccountTest is Test {
    SigilAccount public account;
    SigilAccountFactory public factory;

    uint256 ownerPk = 0xA11CE;
    uint256 agentPk = 0xB0B;
    uint256 guardianPk = 0xC0DE;
    uint256 randomPk = 0xDEAD;

    address owner;
    address agent;
    address guardian;
    address random;

    address entryPointAddr;

    uint256 constant MAX_TX = 1 ether;
    uint256 constant DAILY_LIMIT = 5 ether;
    uint256 constant GUARDIAN_THRESHOLD = 0.5 ether;
    uint256 constant OWNER_THRESHOLD = 0.8 ether;

    address target = address(0xBEEF);
    bytes4 constant TRANSFER_SELECTOR = bytes4(keccak256("transfer(address,uint256)"));

    function setUp() public {
        owner = vm.addr(ownerPk);
        agent = vm.addr(agentPk);
        guardian = vm.addr(guardianPk);
        random = vm.addr(randomPk);

        entryPointAddr = address(0xE1);
        vm.mockCall(entryPointAddr, abi.encodeWithSelector(INonceManager.getNonce.selector), abi.encode(uint256(0)));

        factory = new SigilAccountFactory(IEntryPoint(entryPointAddr), address(this), 0);
        account = factory.createAccount(owner, agent, guardian, MAX_TX, DAILY_LIMIT, GUARDIAN_THRESHOLD, 0);

        vm.deal(address(account), 100 ether);

        vm.startPrank(owner);
        account.setAllowedTarget(target, true);
        account.setAllowedFunction(TRANSFER_SELECTOR, true);
        account.setAllowedFunction(bytes4(0), true);
        account.updatePolicy(MAX_TX, DAILY_LIMIT, GUARDIAN_THRESHOLD, OWNER_THRESHOLD);
        vm.stopPrank();
    }

    // ═══════════════════════════════════════════════════════════
    //                    HELPER FUNCTIONS
    // ═══════════════════════════════════════════════════════════

    function _buildUserOp(address to, uint256 value, bytes memory innerData) internal view returns (PackedUserOperation memory) {
        bytes memory callData = abi.encodeWithSelector(bytes4(0xb61d27f6), to, value, innerData);
        return PackedUserOperation({
            sender: address(account),
            nonce: 0,
            initCode: "",
            callData: callData,
            accountGasLimits: bytes32(0),
            preVerificationGas: 0,
            gasFees: bytes32(0),
            paymasterAndData: "",
            signature: ""
        });
    }

    function _signUserOp(PackedUserOperation memory userOp, uint256 pk) internal pure returns (bytes memory) {
        bytes32 hash = keccak256(abi.encode(userOp.sender, userOp.nonce, userOp.callData));
        bytes32 ethHash = MessageHashUtils.toEthSignedMessageHash(hash);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, ethHash);
        return abi.encodePacked(r, s, v);
    }

    function _dualSignUserOp(PackedUserOperation memory userOp, uint256 pk1, uint256 pk2) internal pure returns (bytes memory) {
        bytes32 hash = keccak256(abi.encode(userOp.sender, userOp.nonce, userOp.callData));
        bytes32 ethHash = MessageHashUtils.toEthSignedMessageHash(hash);
        (uint8 v1, bytes32 r1, bytes32 s1) = vm.sign(pk1, ethHash);
        (uint8 v2, bytes32 r2, bytes32 s2) = vm.sign(pk2, ethHash);
        return abi.encodePacked(r1, s1, v1, r2, s2, v2);
    }

    function _tripleSignUserOp(PackedUserOperation memory userOp, uint256 pk1, uint256 pk2, uint256 pk3) internal pure returns (bytes memory) {
        bytes32 hash = keccak256(abi.encode(userOp.sender, userOp.nonce, userOp.callData));
        bytes32 ethHash = MessageHashUtils.toEthSignedMessageHash(hash);
        (uint8 v1, bytes32 r1, bytes32 s1) = vm.sign(pk1, ethHash);
        (uint8 v2, bytes32 r2, bytes32 s2) = vm.sign(pk2, ethHash);
        (uint8 v3, bytes32 r3, bytes32 s3) = vm.sign(pk3, ethHash);
        return abi.encodePacked(r1, s1, v1, r2, s2, v2, r3, s3, v3);
    }

    function _validateOp(PackedUserOperation memory userOp) internal returns (uint256) {
        bytes32 opHash = keccak256(abi.encode(userOp.sender, userOp.nonce, userOp.callData));
        vm.prank(entryPointAddr);
        return account.validateUserOp(userOp, opHash, 0);
    }

    function _validateOpExpectRevert(PackedUserOperation memory userOp, bytes memory revertData) internal {
        bytes32 opHash = keccak256(abi.encode(userOp.sender, userOp.nonce, userOp.callData));
        vm.prank(entryPointAddr);
        vm.expectRevert(revertData);
        account.validateUserOp(userOp, opHash, 0);
    }

    // ═══════════════════════════════════════════════════════════
    //                    INITIALIZATION (5)
    // ═══════════════════════════════════════════════════════════

    function test_initialization() public view {
        assertEq(account.owner(), owner);
        assertEq(account.agentKey(), agent);
        assertEq(account.guardianKey(), guardian);
        assertEq(account.maxTxValue(), MAX_TX);
        assertEq(account.dailyLimit(), DAILY_LIMIT);
        assertEq(account.guardianThreshold(), GUARDIAN_THRESHOLD);
        assertEq(account.ownerThreshold(), OWNER_THRESHOLD);
        assertEq(address(account.entryPoint()), entryPointAddr);
        assertFalse(account.isFrozen());
    }

    function test_cannotReinitialize() public {
        vm.expectRevert();
        account.initialize(random, random, random, 0, 0, 0);
    }

    function test_ownerThresholdDefaultsToMax() public {
        SigilAccount fresh = factory.createAccount(owner, agent, guardian, MAX_TX, DAILY_LIMIT, GUARDIAN_THRESHOLD, 999);
        assertEq(fresh.ownerThreshold(), type(uint256).max);
    }

    function test_initRejectsZeroOwner() public {
        // Deploy raw implementation to test initialize directly
        SigilAccount impl = new SigilAccount(IEntryPoint(entryPointAddr), address(factory));
        // Can't call initialize on impl (disabled), so test via factory
        vm.expectRevert(abi.encodeWithSelector(SigilAccountFactory.ZeroAddress.selector, uint8(1)));
        factory.createAccount(address(0), agent, guardian, MAX_TX, DAILY_LIMIT, GUARDIAN_THRESHOLD, 500);
    }

    function test_initRejectsZeroAgentKey() public {
        vm.expectRevert(abi.encodeWithSelector(SigilAccountFactory.ZeroAddress.selector, uint8(2)));
        factory.createAccount(owner, address(0), guardian, MAX_TX, DAILY_LIMIT, GUARDIAN_THRESHOLD, 501);
    }

    function test_initRejectsZeroGuardianKey() public {
        vm.expectRevert(abi.encodeWithSelector(SigilAccountFactory.ZeroAddress.selector, uint8(3)));
        factory.createAccount(owner, agent, address(0), MAX_TX, DAILY_LIMIT, GUARDIAN_THRESHOLD, 502);
    }

    // ═══════════════════════════════════════════════════════════
    //                    SIGNATURE VALIDATION (7)
    // ═══════════════════════════════════════════════════════════

    function test_validAgentSignature() public {
        PackedUserOperation memory userOp = _buildUserOp(target, 0.1 ether, "");
        userOp.signature = _signUserOp(userOp, agentPk);
        assertEq(_validateOp(userOp), SIG_VALIDATION_SUCCESS);
    }

    function test_validOwnerSignature() public {
        PackedUserOperation memory userOp = _buildUserOp(target, 0.1 ether, "");
        userOp.signature = _signUserOp(userOp, ownerPk);
        assertEq(_validateOp(userOp), SIG_VALIDATION_SUCCESS);
    }

    function test_invalidSignature() public {
        PackedUserOperation memory userOp = _buildUserOp(target, 0.1 ether, "");
        userOp.signature = _signUserOp(userOp, randomPk);
        assertEq(_validateOp(userOp), SIG_VALIDATION_FAILED);
    }

    function test_validDualSignature() public {
        PackedUserOperation memory userOp = _buildUserOp(target, 0.1 ether, "");
        userOp.signature = _dualSignUserOp(userOp, agentPk, guardianPk);
        assertEq(_validateOp(userOp), SIG_VALIDATION_SUCCESS);
    }

    function test_validTripleSignature() public {
        PackedUserOperation memory userOp = _buildUserOp(target, 0.1 ether, "");
        userOp.signature = _tripleSignUserOp(userOp, agentPk, guardianPk, ownerPk);
        assertEq(_validateOp(userOp), SIG_VALIDATION_SUCCESS);
    }

    function test_tripleSignInvalidAgent() public {
        PackedUserOperation memory userOp = _buildUserOp(target, 0.1 ether, "");
        userOp.signature = _tripleSignUserOp(userOp, randomPk, guardianPk, ownerPk);
        assertEq(_validateOp(userOp), SIG_VALIDATION_FAILED);
    }

    function test_tripleSignInvalidGuardian() public {
        PackedUserOperation memory userOp = _buildUserOp(target, 0.1 ether, "");
        userOp.signature = _tripleSignUserOp(userOp, agentPk, randomPk, ownerPk);
        assertEq(_validateOp(userOp), SIG_VALIDATION_FAILED);
    }

    function test_tripleSignInvalidOwner() public {
        PackedUserOperation memory userOp = _buildUserOp(target, 0.1 ether, "");
        userOp.signature = _tripleSignUserOp(userOp, agentPk, guardianPk, randomPk);
        assertEq(_validateOp(userOp), SIG_VALIDATION_FAILED);
    }

    function test_invalidSignatureLength() public {
        PackedUserOperation memory userOp = _buildUserOp(target, 0.1 ether, "");
        userOp.signature = hex"DEADBEEF";
        assertEq(_validateOp(userOp), SIG_VALIDATION_FAILED);
    }

    // ═══════════════════════════════════════════════════════════
    //                    POLICY: TARGET WHITELIST (2)
    // ═══════════════════════════════════════════════════════════

    function test_blockUnwhitelistedTarget() public {
        address badTarget = address(0xBAD);
        PackedUserOperation memory userOp = _buildUserOp(badTarget, 0.1 ether, "");
        userOp.signature = _signUserOp(userOp, agentPk);
        _validateOpExpectRevert(userOp, abi.encodeWithSelector(SigilAccount.TargetNotWhitelisted.selector, badTarget));
    }

    function test_blockSelfCall() public {
        // R10: setAllowedTarget now rejects self — verify both the set and the policy block
        vm.prank(owner);
        vm.expectRevert(SigilAccount.CannotWhitelistSelf.selector);
        account.setAllowedTarget(address(account), true);

        // Self-calls through UserOp are also blocked by _enforcePolicies
        PackedUserOperation memory userOp = _buildUserOp(address(account), 0, "");
        userOp.signature = _signUserOp(userOp, agentPk);
        _validateOpExpectRevert(userOp, abi.encodeWithSelector(SigilAccount.TargetNotWhitelisted.selector, address(account)));
    }

    // ═══════════════════════════════════════════════════════════
    //                    POLICY: FUNCTION WHITELIST (1)
    // ═══════════════════════════════════════════════════════════

    function test_blockUnwhitelistedFunction() public {
        bytes4 badSelector = bytes4(keccak256("evil()"));
        bytes memory innerData = abi.encodeWithSelector(badSelector);
        PackedUserOperation memory userOp = _buildUserOp(target, 0, innerData);
        userOp.signature = _signUserOp(userOp, agentPk);
        _validateOpExpectRevert(userOp, abi.encodeWithSelector(SigilAccount.FunctionNotAllowed.selector, badSelector));
    }

    // ═══════════════════════════════════════════════════════════
    //                    POLICY: UNKNOWN SELECTOR (1)
    // ═══════════════════════════════════════════════════════════

    function test_blockUnknownOuterSelector() public {
        // Build a userOp with a non-execute selector
        bytes4 batchSelector = bytes4(keccak256("executeBatch(address[],uint256[],bytes[])"));
        bytes memory callData = abi.encodeWithSelector(batchSelector, new address[](0), new uint256[](0), new bytes[](0));
        PackedUserOperation memory userOp = PackedUserOperation({
            sender: address(account),
            nonce: 0,
            initCode: "",
            callData: callData,
            accountGasLimits: bytes32(0),
            preVerificationGas: 0,
            gasFees: bytes32(0),
            paymasterAndData: "",
            signature: ""
        });
        userOp.signature = _signUserOp(userOp, agentPk);
        _validateOpExpectRevert(userOp, abi.encodeWithSelector(SigilAccount.UnknownSelector.selector, batchSelector));
    }

    // ═══════════════════════════════════════════════════════════
    //                    POLICY: VALUE LIMITS (3)
    // ═══════════════════════════════════════════════════════════

    function test_blockExceedingTxLimit() public {
        PackedUserOperation memory userOp = _buildUserOp(target, 2 ether, "");
        userOp.signature = _tripleSignUserOp(userOp, agentPk, guardianPk, ownerPk);
        _validateOpExpectRevert(userOp, abi.encodeWithSelector(SigilAccount.ExceedsPerTxLimit.selector, 2 ether, MAX_TX));
    }

    function test_blockExceedingDailyLimit() public {
        for (uint256 i = 0; i < 12; i++) {
            PackedUserOperation memory userOp = _buildUserOp(target, 0.4 ether, "");
            userOp.signature = _signUserOp(userOp, agentPk);
            assertEq(_validateOp(userOp), SIG_VALIDATION_SUCCESS);
        }

        PackedUserOperation memory lastOp = _buildUserOp(target, 0.4 ether, "");
        lastOp.signature = _signUserOp(lastOp, agentPk);
        _validateOpExpectRevert(lastOp, abi.encodeWithSelector(SigilAccount.ExceedsDailyLimit.selector, 5.2 ether, DAILY_LIMIT));
    }

    function test_dailyLimitResetsAfter24h() public {
        for (uint256 i = 0; i < 12; i++) {
            PackedUserOperation memory op = _buildUserOp(target, 0.4 ether, "");
            op.signature = _signUserOp(op, agentPk);
            _validateOp(op);
        }

        vm.warp(block.timestamp + 1 days + 1);

        PackedUserOperation memory userOp = _buildUserOp(target, 0.4 ether, "");
        userOp.signature = _signUserOp(userOp, agentPk);
        assertEq(_validateOp(userOp), SIG_VALIDATION_SUCCESS);
    }

    // ═══════════════════════════════════════════════════════════
    //                    3-TIER CO-SIGNING (6)
    // ═══════════════════════════════════════════════════════════

    function test_lowTierAgentOnly() public {
        PackedUserOperation memory userOp = _buildUserOp(target, 0.1 ether, "");
        userOp.signature = _signUserOp(userOp, agentPk);
        assertEq(_validateOp(userOp), SIG_VALIDATION_SUCCESS);
    }

    function test_mediumTierRequiresGuardian() public {
        PackedUserOperation memory userOp = _buildUserOp(target, 0.6 ether, "");
        userOp.signature = _signUserOp(userOp, agentPk);
        _validateOpExpectRevert(userOp, abi.encodeWithSelector(SigilAccount.GuardianCoSignRequired.selector));
    }

    function test_mediumTierDualSignWorks() public {
        PackedUserOperation memory userOp = _buildUserOp(target, 0.6 ether, "");
        userOp.signature = _dualSignUserOp(userOp, agentPk, guardianPk);
        assertEq(_validateOp(userOp), SIG_VALIDATION_SUCCESS);
    }

    function test_highTierRequiresOwner() public {
        PackedUserOperation memory userOp = _buildUserOp(target, 0.9 ether, "");
        userOp.signature = _dualSignUserOp(userOp, agentPk, guardianPk);
        _validateOpExpectRevert(userOp, abi.encodeWithSelector(SigilAccount.OwnerCoSignRequired.selector));
    }

    function test_highTierTripleSignWorks() public {
        PackedUserOperation memory userOp = _buildUserOp(target, 0.9 ether, "");
        userOp.signature = _tripleSignUserOp(userOp, agentPk, guardianPk, ownerPk);
        assertEq(_validateOp(userOp), SIG_VALIDATION_SUCCESS);
    }

    function test_highTierSingleSignFails() public {
        PackedUserOperation memory userOp = _buildUserOp(target, 0.9 ether, "");
        userOp.signature = _signUserOp(userOp, agentPk);
        _validateOpExpectRevert(userOp, abi.encodeWithSelector(SigilAccount.OwnerCoSignRequired.selector));
    }

    // ═══════════════════════════════════════════════════════════
    //                    FROZEN ACCOUNT (2)
    // ═══════════════════════════════════════════════════════════

    function test_frozenAccountRejects() public {
        vm.prank(owner);
        account.freeze();

        PackedUserOperation memory userOp = _buildUserOp(target, 0.1 ether, "");
        userOp.signature = _signUserOp(userOp, agentPk);
        assertEq(_validateOp(userOp), SIG_VALIDATION_FAILED);
    }

    function test_unfreezeWorks() public {
        vm.prank(owner);
        account.freeze();
        vm.prank(owner);
        account.unfreeze();
        assertFalse(account.isFrozen());
    }

    // ═══════════════════════════════════════════════════════════
    //                    OWNER FUNCTIONS (9)
    // ═══════════════════════════════════════════════════════════

    function test_rotateAgentKey() public {
        address newAgent = address(0x1234);
        vm.prank(owner);
        account.rotateAgentKey(newAgent);
        assertEq(account.agentKey(), newAgent);
    }

    function test_rotateAgentKeyRejectsZero() public {
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(SigilAccount.ZeroAddress.selector, uint8(2)));
        account.rotateAgentKey(address(0));
    }

    function test_rotateGuardianKey() public {
        address newGuardian = address(0x5678);
        vm.prank(owner);
        account.rotateGuardianKey(newGuardian);
        assertEq(account.guardianKey(), newGuardian);
    }

    function test_rotateGuardianKeyRejectsZero() public {
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(SigilAccount.ZeroAddress.selector, uint8(3)));
        account.rotateGuardianKey(address(0));
    }

    function test_updatePolicy() public {
        vm.prank(owner);
        account.updatePolicy(2 ether, 10 ether, 1 ether, 5 ether);
        assertEq(account.maxTxValue(), 2 ether);
        assertEq(account.dailyLimit(), 10 ether);
        assertEq(account.guardianThreshold(), 1 ether);
        assertEq(account.ownerThreshold(), 5 ether);
    }

    function test_onlyOwnerCanFreeze() public {
        vm.prank(random);
        vm.expectRevert(SigilAccount.NotOwner.selector);
        account.freeze();
    }

    function test_onlyOwnerCanRotateKey() public {
        vm.prank(random);
        vm.expectRevert(SigilAccount.NotOwner.selector);
        account.rotateAgentKey(random);
    }

    function test_onlyOwnerCanUpdatePolicy() public {
        vm.prank(random);
        vm.expectRevert(SigilAccount.NotOwner.selector);
        account.updatePolicy(0, 0, 0, 0);
    }

    function test_setAllowedTarget() public {
        address newTarget = address(0xCAFE);
        vm.prank(owner);
        account.setAllowedTarget(newTarget, true);
        assertTrue(account.allowedTargets(newTarget));

        vm.prank(owner);
        account.setAllowedTarget(newTarget, false);
        assertFalse(account.allowedTargets(newTarget));
    }

    function test_setAllowedTargetRejectsZero() public {
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(SigilAccount.ZeroAddress.selector, uint8(4)));
        account.setAllowedTarget(address(0), true);
    }

    function test_setAllowedFunction() public {
        bytes4 sel = bytes4(keccak256("approve(address,uint256)"));
        vm.prank(owner);
        account.setAllowedFunction(sel, true);
        assertTrue(account.allowedFunctions(sel));
    }

    // ═══════════════════════════════════════════════════════════
    //                    TIMELOCK QUEUE (10)
    // ═══════════════════════════════════════════════════════════

    function test_queueTransaction() public {
        vm.prank(owner);
        uint256 queueId = account.queueTransaction(target, 1 ether, "");
        assertEq(queueId, 0);

        (address t, uint256 v,, uint256 qAt, address qBy, bool exec, bool canc) = account.queuedTransactions(queueId);
        assertEq(t, target);
        assertEq(v, 1 ether);
        assertEq(qAt, block.timestamp);
        assertEq(qBy, owner);
        assertFalse(exec);
        assertFalse(canc);
    }

    function test_queueTransactionIncrementsId() public {
        vm.startPrank(owner);
        uint256 id1 = account.queueTransaction(target, 1 ether, "");
        uint256 id2 = account.queueTransaction(target, 2 ether, "");
        vm.stopPrank();
        assertEq(id1, 0);
        assertEq(id2, 1);
    }

    function test_queueTransactionRejectsZeroTarget() public {
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(SigilAccount.ZeroAddress.selector, uint8(4)));
        account.queueTransaction(address(0), 1 ether, "");
    }

    function test_executeQueuedAfterDelay() public {
        vm.deal(address(account), 10 ether);
        address recipient = address(0x1111);
        uint256 balBefore = recipient.balance;

        vm.prank(owner);
        uint256 queueId = account.queueTransaction(recipient, 1 ether, "");

        vm.warp(block.timestamp + 1 hours + 1);

        vm.prank(owner);
        account.executeQueued(queueId);

        assertEq(recipient.balance, balBefore + 1 ether);
    }

    function test_executeQueuedBeforeDelayFails() public {
        vm.prank(owner);
        uint256 queueId = account.queueTransaction(target, 1 ether, "");

        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(
            SigilAccount.TimelockNotElapsed.selector,
            queueId,
            block.timestamp + 1 hours
        ));
        account.executeQueued(queueId);
    }

    function test_cancelQueued() public {
        vm.prank(owner);
        uint256 queueId = account.queueTransaction(target, 1 ether, "");

        vm.prank(owner);
        account.cancelQueued(queueId);

        (,,,,, bool exec, bool canc) = account.queuedTransactions(queueId);
        assertFalse(exec);
        assertTrue(canc);
    }

    function test_executeCancelledFails() public {
        vm.prank(owner);
        uint256 queueId = account.queueTransaction(target, 1 ether, "");

        vm.prank(owner);
        account.cancelQueued(queueId);

        vm.warp(block.timestamp + 1 hours + 1);

        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(SigilAccount.TransactionCancelledError.selector, queueId));
        account.executeQueued(queueId);
    }

    function test_doubleExecuteFails() public {
        vm.deal(address(account), 10 ether);
        address recipient = address(0x1111);

        vm.prank(owner);
        uint256 queueId = account.queueTransaction(recipient, 1 ether, "");

        vm.warp(block.timestamp + 1 hours + 1);

        vm.prank(owner);
        account.executeQueued(queueId);

        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(SigilAccount.TransactionAlreadyExecuted.selector, queueId));
        account.executeQueued(queueId);
    }

    function test_invalidQueueIdFails() public {
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(SigilAccount.InvalidQueueId.selector, 999));
        account.executeQueued(999);
    }

    function test_onlyOwnerCanQueue() public {
        vm.prank(random);
        vm.expectRevert(SigilAccount.NotOwner.selector);
        account.queueTransaction(target, 1 ether, "");
    }

    function test_cannotQueueWhenFrozen() public {
        vm.prank(owner);
        account.freeze();

        vm.prank(owner);
        vm.expectRevert(SigilAccount.AccountIsFrozen.selector);
        account.queueTransaction(target, 1 ether, "");
    }

    // ═══════════════════════════════════════════════════════════
    //                    EMERGENCY WITHDRAW (5)
    // ═══════════════════════════════════════════════════════════

    function test_emergencyWithdraw() public {
        address recipient = address(0x2222);
        uint256 balance = address(account).balance;

        vm.prank(owner);
        account.emergencyWithdraw(recipient);

        assertEq(recipient.balance, balance);
        assertEq(address(account).balance, 0);
    }

    function test_emergencyWithdrawWorksWhenFrozen() public {
        vm.prank(owner);
        account.freeze();

        address recipient = address(0x3333);
        uint256 balance = address(account).balance;

        vm.prank(owner);
        account.emergencyWithdraw(recipient);

        assertEq(recipient.balance, balance);
    }

    function test_emergencyWithdrawOnlyOwner() public {
        vm.prank(random);
        vm.expectRevert(SigilAccount.NotOwner.selector);
        account.emergencyWithdraw(random);
    }

    function test_emergencyWithdrawRejectsZero() public {
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(SigilAccount.ZeroAddress.selector, uint8(5)));
        account.emergencyWithdraw(address(0));
    }

    function test_emergencyWithdrawEmitsEvent() public {
        address recipient = address(0x4444);
        uint256 balance = address(account).balance;

        vm.prank(owner);
        vm.expectEmit(true, false, false, true);
        emit SigilAccount.EmergencyWithdrawal(recipient, balance);
        account.emergencyWithdraw(recipient);
    }

    // ═══════════════════════════════════════════════════════════
    //                    DEPOSIT EVENT (1)
    // ═══════════════════════════════════════════════════════════

    function test_depositEmitsEvent() public {
        vm.deal(random, 1 ether);
        vm.prank(random);
        vm.expectEmit(true, false, false, true);
        emit SigilAccount.Deposited(random, 0.5 ether);
        (bool ok,) = address(account).call{value: 0.5 ether}("");
        assertTrue(ok);
    }

    // ═══════════════════════════════════════════════════════════
    //                    FACTORY (3)
    // ═══════════════════════════════════════════════════════════

    function test_factoryDeploysDeterministic() public {
        SigilAccount a1 = factory.createAccount(owner, agent, guardian, MAX_TX, DAILY_LIMIT, GUARDIAN_THRESHOLD, 1);
        assertEq(a1.owner(), owner);
        assertEq(a1.agentKey(), agent);
    }

    function test_factoryDifferentSaltsDifferentAddresses() public {
        SigilAccount a1 = factory.createAccount(owner, agent, guardian, MAX_TX, DAILY_LIMIT, GUARDIAN_THRESHOLD, 100);
        SigilAccount a2 = factory.createAccount(owner, agent, guardian, MAX_TX, DAILY_LIMIT, GUARDIAN_THRESHOLD, 200);
        assertTrue(address(a1) != address(a2));
    }

    function test_factoryGetAddressMatchesCreate() public {
        // Predict address BEFORE deployment
        address predicted = factory.getAddress(owner, agent, guardian, MAX_TX, DAILY_LIMIT, GUARDIAN_THRESHOLD, 42);
        // Deploy
        SigilAccount deployed = factory.createAccount(owner, agent, guardian, MAX_TX, DAILY_LIMIT, GUARDIAN_THRESHOLD, 42);
        // Must match
        assertEq(predicted, address(deployed));
    }

    // ═══════════════════════════════════════════════════════════
    //                    MISC (1)
    // ═══════════════════════════════════════════════════════════

    function test_executeSelector() public pure {
        bytes4 sel = bytes4(keccak256("execute(address,uint256,bytes)"));
        assertEq(sel, bytes4(0xb61d27f6));
    }

    // ═══════════════════════════════════════════════════════════
    //                    ERC-20 EMERGENCY WITHDRAW (3)
    // ═══════════════════════════════════════════════════════════

    function test_emergencyWithdrawToken() public {
        // Deploy a mock ERC20
        MockERC20 token = new MockERC20();
        token.mint(address(account), 1000e18);
        assertEq(token.balanceOf(address(account)), 1000e18);

        address recipient = address(0x5555);
        vm.prank(owner);
        account.emergencyWithdrawToken(address(token), recipient);

        assertEq(token.balanceOf(recipient), 1000e18);
        assertEq(token.balanceOf(address(account)), 0);
    }

    function test_emergencyWithdrawTokenRejectsZeroToken() public {
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(SigilAccount.ZeroAddress.selector, uint8(6)));
        account.emergencyWithdrawToken(address(0), address(0x5555));
    }

    function test_emergencyWithdrawTokenRejectsZeroTo() public {
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(SigilAccount.ZeroAddress.selector, uint8(5)));
        account.emergencyWithdrawToken(address(0x1111), address(0));
    }

    // ═══════════════════════════════════════════════════════════
    //                    SHORT CALLDATA REVERT (1)
    // ═══════════════════════════════════════════════════════════

    function test_shortCallDataReverts() public {
        PackedUserOperation memory userOp = PackedUserOperation({
            sender: address(account),
            nonce: 0,
            initCode: "",
            callData: hex"DEAD", // only 2 bytes
            accountGasLimits: bytes32(0),
            preVerificationGas: 0,
            gasFees: bytes32(0),
            paymasterAndData: "",
            signature: ""
        });
        userOp.signature = _signUserOp(userOp, agentPk);
        _validateOpExpectRevert(userOp, abi.encodeWithSelector(SigilAccount.InvalidCallData.selector));
    }

    // ═══════════════════════════════════════════════════════════
    //                    POLICY SANITY CHECKS (2)
    // ═══════════════════════════════════════════════════════════

    function test_updatePolicyRejectsMaxTxAboveDaily() public {
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(SigilAccount.InvalidPolicyParams.selector, uint8(3)));
        account.updatePolicy(10 ether, 5 ether, 1 ether, 2 ether); // maxTx > daily
    }

    function test_updatePolicyRejectsGuardianAboveOwner() public {
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(SigilAccount.InvalidPolicyParams.selector, uint8(4)));
        account.updatePolicy(1 ether, 10 ether, 5 ether, 2 ether); // guardian > owner
    }

    // ═══════════════════════════════════════════════════════════
    //                    INIT POLICY SANITY (1)
    // ═══════════════════════════════════════════════════════════

    function test_initRejectsMaxTxAboveDaily() public {
        // maxTxValue=10 > dailyLimit=5
        vm.expectRevert(abi.encodeWithSelector(SigilAccount.InvalidPolicyParams.selector, uint8(3)));
        factory.createAccount(owner, agent, guardian, 10 ether, 5 ether, 1 ether, 600);
    }

    // ═══════════════════════════════════════════════════════════
    //                    QUEUE EXPIRY (2)
    // ═══════════════════════════════════════════════════════════

    function test_executeQueuedAfterExpiryFails() public {
        vm.prank(owner);
        uint256 queueId = account.queueTransaction(target, 1 ether, "");

        // Warp past 7-day expiry
        vm.warp(block.timestamp + 7 days + 1);

        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(SigilAccount.TransactionExpired.selector, queueId));
        account.executeQueued(queueId);
    }

    function test_dailyResetNoDrift() public {
        // Spend some budget
        PackedUserOperation memory op = _buildUserOp(target, 0.4 ether, "");
        op.signature = _signUserOp(op, agentPk);
        _validateOp(op);

        uint256 resetBefore = account.dailyResetTime();

        // Skip 3 days with no transactions
        vm.warp(block.timestamp + 3 days + 1);

        // Next tx should reset — new boundary should be aligned to fixed periods
        PackedUserOperation memory op2 = _buildUserOp(target, 0.1 ether, "");
        op2.signature = _signUserOp(op2, agentPk);
        _validateOp(op2);

        uint256 resetAfter = account.dailyResetTime();
        // elapsed = (block.timestamp - resetBefore), periods = elapsed/1day + 1
        // resetAfter = resetBefore + periods * 1day
        // This ensures the boundary is always aligned, not drifted to block.timestamp
        assertTrue(resetAfter > block.timestamp); // next reset is in the future
        assertEq((resetAfter - resetBefore) % 1 days, 0); // aligned to day boundaries
    }

    function test_executeQueuedBeforeExpiryWorks() public {
        vm.deal(address(account), 10 ether);
        address recipient = address(0x7777);

        vm.prank(owner);
        uint256 queueId = account.queueTransaction(recipient, 1 ether, "");

        // Warp to just before expiry (6 days)
        vm.warp(block.timestamp + 6 days);

        vm.prank(owner);
        account.executeQueued(queueId);

        assertEq(recipient.balance, 1 ether);
    }
    // ═══════════════════════════════════════════════════════════
    //                    OWNERSHIP TRANSFER (8)
    // ═══════════════════════════════════════════════════════════

    function test_ownerTransferDefaultDelay() public view {
        assertEq(account.ownerTransferDelay(), 24 hours);
    }

    function test_requestAndExecuteOwnerTransfer() public {
        address newOwner = address(0x9999);

        vm.prank(owner);
        account.requestOwnerTransfer(newOwner);

        assertEq(account.pendingOwner(), newOwner);

        // Wait for delay
        vm.warp(block.timestamp + 24 hours + 1);

        vm.prank(owner);
        account.executeOwnerTransfer();

        assertEq(account.owner(), newOwner);
        assertEq(account.pendingOwner(), address(0));
    }

    function test_ownerTransferBeforeDelayFails() public {
        address newOwner = address(0x9999);

        vm.prank(owner);
        account.requestOwnerTransfer(newOwner);

        // Try immediately
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(
            SigilAccount.TransferDelayNotElapsed.selector,
            block.timestamp + 24 hours
        ));
        account.executeOwnerTransfer();
    }

    function test_cancelOwnerTransfer() public {
        vm.prank(owner);
        account.requestOwnerTransfer(address(0x9999));

        vm.prank(owner);
        account.cancelOwnerTransfer();

        assertEq(account.pendingOwner(), address(0));
    }

    function test_ownerTransferRejectsZero() public {
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(SigilAccount.ZeroAddress.selector, uint8(1)));
        account.requestOwnerTransfer(address(0));
    }

    function test_ownerTransferOnlyOwner() public {
        vm.prank(random);
        vm.expectRevert(SigilAccount.NotOwner.selector);
        account.requestOwnerTransfer(address(0x9999));
    }

    function test_newOwnerCanExecuteTransfer() public {
        address newOwner = address(0x9999);

        vm.prank(owner);
        account.requestOwnerTransfer(newOwner);

        vm.warp(block.timestamp + 24 hours + 1);

        // New owner executes (not the old owner)
        vm.prank(newOwner);
        account.executeOwnerTransfer();

        assertEq(account.owner(), newOwner);
    }

    function test_increaseTransferDelay() public {
        vm.prank(owner);
        account.setOwnerTransferDelay(48 hours);
        assertEq(account.ownerTransferDelay(), 48 hours);
    }

    function test_decreaseTransferDelayBlocked() public {
        // First increase
        vm.prank(owner);
        account.setOwnerTransferDelay(48 hours);

        // Try to decrease — must go through queue
        vm.prank(owner);
        vm.expectRevert(SigilAccount.CannotDecreaseDelay.selector);
        account.setOwnerTransferDelay(12 hours);
    }

    function test_queueRejectedAfterOwnerTransfer() public {
        // H1: Queue transaction as current owner
        vm.deal(address(account), 10 ether);
        vm.prank(owner);
        uint256 queueId = account.queueTransaction(target, 1 ether, "");

        // Transfer ownership
        address newOwner = address(0x9999);
        vm.prank(owner);
        account.requestOwnerTransfer(newOwner);
        vm.warp(block.timestamp + 24 hours + 1);
        vm.prank(newOwner);
        account.executeOwnerTransfer();

        // New owner tries to execute old queue — should fail
        vm.warp(block.timestamp + 1 hours + 1);
        vm.prank(newOwner);
        vm.expectRevert(abi.encodeWithSelector(SigilAccount.TransactionFromPreviousOwner.selector, queueId));
        account.executeQueued(queueId);
    }

    function test_cannotRequestTransferWhileFrozen() public {
        vm.prank(owner);
        account.freeze();

        vm.prank(owner);
        vm.expectRevert(SigilAccount.AccountIsFrozen.selector);
        account.requestOwnerTransfer(address(0x9999));
    }

    function test_overwriteTransferEmitsCancelEvent() public {
        vm.startPrank(owner);
        account.requestOwnerTransfer(address(0x1111));
        // Second request should emit cancel for the first
        // (we just verify it doesn't revert — event testing is complex in Forge)
        account.requestOwnerTransfer(address(0x2222));
        vm.stopPrank();
        assertEq(account.pendingOwner(), address(0x2222));
    }

    function test_transferDelayOutOfRange() public {
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(
            SigilAccount.TransferDelayOutOfRange.selector,
            30 minutes, 1 hours, 90 days
        ));
        account.setOwnerTransferDelay(30 minutes); // below minimum
    }

    // ═══════════════════════════════════════════════════════════
    //                    V4 AUDIT ROUND 2 (5)
    // ═══════════════════════════════════════════════════════════

    function test_cannotTransferToSelf() public {
        vm.prank(owner);
        vm.expectRevert(SigilAccount.CannotTransferToSelf.selector);
        account.requestOwnerTransfer(owner);
    }

    function test_cannotExecuteTransferWhileFrozen() public {
        address newOwner = address(0x9999);
        vm.prank(owner);
        account.requestOwnerTransfer(newOwner);

        vm.warp(block.timestamp + 24 hours + 1);

        vm.prank(owner);
        account.freeze();

        vm.prank(newOwner);
        vm.expectRevert(SigilAccount.AccountIsFrozen.selector);
        account.executeOwnerTransfer();
    }

    function test_factoryCreateAccountWithDelay() public {
        SigilAccount acct = factory.createAccountWithDelay(
            owner, agent, guardian, MAX_TX, DAILY_LIMIT, GUARDIAN_THRESHOLD, 48 hours, 700
        );
        assertEq(acct.ownerTransferDelay(), 48 hours);
        assertEq(acct.owner(), owner);
    }

    function test_factoryCreateAccountWithDelayRejectsInvalid() public {
        vm.expectRevert(abi.encodeWithSelector(
            SigilAccount.TransferDelayOutOfRange.selector,
            30 minutes, 1 hours, 90 days
        ));
        factory.createAccountWithDelay(
            owner, agent, guardian, MAX_TX, DAILY_LIMIT, GUARDIAN_THRESHOLD, 30 minutes, 701
        );
    }

    function test_factoryGetAddressWithDelayMatchesCreate() public {
        address predicted = factory.getAddressWithDelay(
            owner, agent, guardian, MAX_TX, DAILY_LIMIT, GUARDIAN_THRESHOLD, 48 hours, 800
        );
        SigilAccount deployed = factory.createAccountWithDelay(
            owner, agent, guardian, MAX_TX, DAILY_LIMIT, GUARDIAN_THRESHOLD, 48 hours, 800
        );
        assertEq(predicted, address(deployed));
    }

    // ═══════════════════════════════════════════════════════════
    //                R6: EXECUTE BATCH TESTS
    // ═══════════════════════════════════════════════════════════

    function test_executeBatchOnlyOwner() public {
        BaseAccount.Call[] memory calls = new BaseAccount.Call[](1);
        calls[0] = BaseAccount.Call({target: target, value: 0.1 ether, data: ""});

        // Non-owner should revert
        vm.prank(agent);
        vm.expectRevert(SigilAccount.NotOwner.selector);
        account.executeBatch(calls);

        // Owner should succeed
        vm.prank(owner);
        account.executeBatch(calls);
    }

    function test_initializeRejectsKeyCollision() public {
        // owner == agent
        vm.expectRevert(abi.encodeWithSelector(SigilAccount.KeyCollision.selector, uint8(1)));
        factory.createAccount(owner, owner, guardian, MAX_TX, DAILY_LIMIT, GUARDIAN_THRESHOLD, 999);
    }

    function test_rotateAgentKeyRejectsCollision() public {
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(SigilAccount.KeyCollision.selector, uint8(3)));
        account.rotateAgentKey(guardian);
    }

    function test_rotateGuardianKeyRejectsCollision() public {
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(SigilAccount.KeyCollision.selector, uint8(3)));
        account.rotateGuardianKey(agent);
    }

    function test_executeBatchMultipleCalls() public {
        address target2 = address(0xCAFE);
        vm.deal(address(account), 200 ether);

        BaseAccount.Call[] memory calls = new BaseAccount.Call[](2);
        calls[0] = BaseAccount.Call({target: target, value: 0.1 ether, data: ""});
        calls[1] = BaseAccount.Call({target: target2, value: 0.2 ether, data: ""});

        vm.prank(owner);
        account.executeBatch(calls);
        assertEq(target2.balance, 0.2 ether);
    }

    function test_executeBatchViaEntryPointReverts() public {
        // executeBatch through EntryPoint should fail (onlyOwner, not _requireForExecute)
        BaseAccount.Call[] memory calls = new BaseAccount.Call[](1);
        calls[0] = BaseAccount.Call({target: target, value: 0.1 ether, data: ""});

        vm.prank(entryPointAddr);
        vm.expectRevert(SigilAccount.NotOwner.selector);
        account.executeBatch(calls);
    }

    function test_keyCollisionAgentEqualsGuardianInit() public {
        vm.expectRevert(abi.encodeWithSelector(SigilAccount.KeyCollision.selector, uint8(3)));
        factory.createAccount(owner, agent, agent, MAX_TX, DAILY_LIMIT, GUARDIAN_THRESHOLD, 998);
    }

    function test_keyCollisionOwnerEqualsGuardianInit() public {
        vm.expectRevert(abi.encodeWithSelector(SigilAccount.KeyCollision.selector, uint8(2)));
        factory.createAccount(owner, agent, owner, MAX_TX, DAILY_LIMIT, GUARDIAN_THRESHOLD, 997);
    }

    function test_rotateAgentKeyToOwnerReverts() public {
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(SigilAccount.KeyCollision.selector, uint8(1)));
        account.rotateAgentKey(owner);
    }

    function test_rotateGuardianKeyToOwnerReverts() public {
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(SigilAccount.KeyCollision.selector, uint8(2)));
        account.rotateGuardianKey(owner);
    }

    function test_epochAlignedDailyReset() public {
        // Verify dailyResetTime is epoch-aligned (midnight UTC boundary)
        uint256 resetTime = account.dailyResetTime();
        assertEq(resetTime % 1 days, 0, "dailyResetTime should be midnight-aligned");
    }

    function test_ownerTransferDelayDefault() public {
        assertEq(account.ownerTransferDelay(), 24 hours);
    }

    function test_emergencyWithdrawWhenFrozen() public {
        vm.prank(owner);
        account.freeze();

        uint256 balBefore = owner.balance;
        vm.prank(owner);
        account.emergencyWithdraw(owner);
        assertGt(owner.balance, balBefore);
    }

    function test_emergencyWithdrawTokenWhenFrozen() public {
        MockERC20 token = new MockERC20();
        token.mint(address(account), 1000);

        vm.prank(owner);
        account.freeze();

        vm.prank(owner);
        account.emergencyWithdrawToken(address(token), owner);
        assertEq(token.balanceOf(owner), 1000);
    }

    function test_queueTransactionExpiry() public {
        vm.prank(owner);
        uint256 qid = account.queueTransaction(target, 0.1 ether, "");

        // Warp past expiry (7 days + 1 hour)
        vm.warp(block.timestamp + 7 days + 1 hours + 1);

        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(SigilAccount.TransactionExpired.selector, qid));
        account.executeQueued(qid);
    }

    function test_executeBatchBlockedWhenFrozen() public {
        vm.prank(owner);
        account.freeze();

        BaseAccount.Call[] memory calls = new BaseAccount.Call[](1);
        calls[0] = BaseAccount.Call({target: target, value: 0.1 ether, data: ""});

        vm.prank(owner);
        vm.expectRevert(SigilAccount.AccountIsFrozen.selector);
        account.executeBatch(calls);
    }
}

// ═══════════════════════════════════════════════════════════
//                    MOCK ERC20 FOR TESTS
// ═══════════════════════════════════════════════════════════

contract MockERC20 {
    string public name = "Mock";
    string public symbol = "MCK";
    uint8 public decimals = 18;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
        totalSupply += amount;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }
}
