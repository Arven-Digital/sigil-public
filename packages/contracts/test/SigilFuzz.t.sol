// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Test.sol";
import "../src/SigilAccount.sol";
import "../src/SigilAccountFactory.sol";
import "@account-abstraction/interfaces/IEntryPoint.sol";
import "@account-abstraction/interfaces/INonceManager.sol";
import "@account-abstraction/interfaces/PackedUserOperation.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

/**
 * @title SigilFuzz — Fuzz & invariant tests for V7 contracts
 * @dev Runs with `forge test --match-contract SigilFuzz`
 */
contract SigilFuzzTest is Test {
    using MessageHashUtils for bytes32;

    SigilAccountFactory public factory;
    SigilAccount public account;

    uint256 constant DEPLOY_FEE = 0.2 ether;
    uint256 constant MAX_FEE = 10 ether;

    uint256 ownerPk = 0xA11CE;
    uint256 agentPk = 0xB0B;
    uint256 guardianPk = 0xC0DE;

    address owner;
    address agent;
    address guardian;
    address treasury = address(0x7EA5);
    address entryPointAddr;

    address target = address(0xBEEF);
    bytes4 constant TRANSFER_SELECTOR = bytes4(keccak256("transfer(address,uint256)"));

    function setUp() public {
        owner = vm.addr(ownerPk);
        agent = vm.addr(agentPk);
        guardian = vm.addr(guardianPk);
        entryPointAddr = address(0xE1);
        vm.mockCall(entryPointAddr, abi.encodeWithSelector(INonceManager.getNonce.selector), abi.encode(uint256(0)));

        factory = new SigilAccountFactory(IEntryPoint(entryPointAddr), treasury, DEPLOY_FEE);
        account = factory.createAccount{value: DEPLOY_FEE}(owner, agent, guardian, 1 ether, 5 ether, 0.5 ether, 0);

        vm.deal(address(account), 100 ether);
        vm.startPrank(owner);
        account.setAllowedTarget(target, true);
        account.setAllowedFunction(TRANSFER_SELECTOR, true);
        account.setAllowedFunction(bytes4(0), true);
        account.updatePolicy(1 ether, 5 ether, 0.5 ether, 2 ether);
        vm.stopPrank();
    }

    // ═══════════════════════════════════════════════════════════
    //                    FACTORY FEE FUZZING
    // ═══════════════════════════════════════════════════════════

    /// @dev Fuzz: Any fee value ≤ MAX_FEE should be settable
    function testFuzz_setDeployFee(uint256 fee) public {
        fee = bound(fee, 0, MAX_FEE);
        factory.setDeployFee(fee);
        assertEq(factory.deployFee(), fee);
    }

    /// @dev Fuzz: Fee > MAX_FEE always reverts
    function testFuzz_setDeployFeeAboveMaxReverts(uint256 fee) public {
        fee = bound(fee, MAX_FEE + 1, type(uint256).max);
        vm.expectRevert();
        factory.setDeployFee(fee);
    }

    /// @dev Fuzz: Deploy with exact fee always succeeds
    function testFuzz_createAccountExactFee(uint256 fee, uint256 salt) public {
        fee = bound(fee, 0, MAX_FEE);
        salt = bound(salt, 1000, type(uint256).max); // avoid collision with setUp salt
        factory.setDeployFee(fee);

        vm.deal(address(this), fee);
        SigilAccount acct = factory.createAccount{value: fee}(owner, agent, guardian, 1 ether, 5 ether, 0.5 ether, salt);
        assertTrue(address(acct) != address(0));
    }

    /// @dev Fuzz: Deploy with insufficient fee always reverts
    function testFuzz_createAccountInsufficientFeeReverts(uint256 sent) public {
        sent = bound(sent, 0, DEPLOY_FEE - 1);
        vm.deal(address(this), sent);
        vm.expectRevert();
        factory.createAccount{value: sent}(owner, agent, guardian, 1 ether, 5 ether, 0.5 ether, 9999);
    }

    /// @dev Fuzz: Excess payment is refunded
    function testFuzz_excessRefunded(uint256 excess) public {
        excess = bound(excess, 1, 100 ether);
        uint256 total = DEPLOY_FEE + excess;
        vm.deal(address(this), total);

        uint256 balBefore = address(this).balance;
        factory.createAccount{value: total}(owner, agent, guardian, 1 ether, 5 ether, 0.5 ether, 8888);

        // Should have been refunded the excess
        assertEq(address(this).balance, balBefore - DEPLOY_FEE);
        assertEq(address(factory).balance, DEPLOY_FEE * 2); // setUp fee + this fee
    }

    /// @dev Fuzz: Withdrawal amount never exceeds balance
    function testFuzz_withdrawFeesAmount(uint256 withdrawAmt) public {
        // Accumulate some fees first
        vm.deal(address(this), DEPLOY_FEE);
        factory.createAccount{value: DEPLOY_FEE}(owner, agent, guardian, 1 ether, 5 ether, 0.5 ether, 7777);

        uint256 factoryBal = address(factory).balance;
        withdrawAmt = bound(withdrawAmt, 1, factoryBal);

        factory.withdrawFeesAmount(withdrawAmt);
        assertEq(address(factory).balance, factoryBal - withdrawAmt);
    }

    // ═══════════════════════════════════════════════════════════
    //                    POLICY FUZZING
    // ═══════════════════════════════════════════════════════════

    /// @dev Fuzz: Policy params must satisfy invariants
    function testFuzz_updatePolicyValidation(uint256 maxTx, uint256 daily, uint256 guardThresh, uint256 ownerThresh) public {
        maxTx = bound(maxTx, 1, 1000 ether);
        daily = bound(daily, maxTx, 1000 ether); // daily >= maxTx
        guardThresh = bound(guardThresh, 0, ownerThresh > 0 ? ownerThresh : type(uint256).max);
        ownerThresh = bound(ownerThresh, guardThresh, type(uint256).max);

        vm.prank(owner);
        account.updatePolicy(maxTx, daily, guardThresh, ownerThresh);

        assertEq(account.maxTxValue(), maxTx);
        assertEq(account.dailyLimit(), daily);
    }

    /// @dev Fuzz: maxTxValue > dailyLimit always reverts
    function testFuzz_updatePolicyInvalidReverts(uint256 maxTx, uint256 daily) public {
        maxTx = bound(maxTx, 2, type(uint256).max);
        daily = bound(daily, 1, maxTx - 1); // daily < maxTx — invalid

        vm.prank(owner);
        vm.expectRevert();
        account.updatePolicy(maxTx, daily, 0, type(uint256).max);
    }

    // ═══════════════════════════════════════════════════════════
    //                    ERC-1271 FUZZING
    // ═══════════════════════════════════════════════════════════

    /// @dev Fuzz: Owner signature always valid for any hash
    function testFuzz_erc1271_ownerSignature(bytes32 hash) public view {
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", account.domainSeparator(), hash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(ownerPk, digest);
        bytes memory sig = abi.encodePacked(r, s, v);
        assertEq(account.isValidSignature(hash, sig), bytes4(0x1626ba7e));
    }

    /// @dev Fuzz: Random key signature always invalid
    function testFuzz_erc1271_randomKeyInvalid(bytes32 hash, uint256 randomPk) public view {
        randomPk = bound(randomPk, 1, type(uint128).max);
        address randomAddr = vm.addr(randomPk);
        // Skip if random key happens to match owner/agent/guardian
        vm.assume(randomAddr != owner && randomAddr != agent && randomAddr != guardian);

        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", account.domainSeparator(), hash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(randomPk, digest);
        bytes memory sig = abi.encodePacked(r, s, v);
        assertEq(account.isValidSignature(hash, sig), bytes4(0xffffffff));
    }

    /// @dev Fuzz: Cross-chain replay always fails
    function testFuzz_erc1271_crossChainReplay(bytes32 hash, uint64 otherChainId) public {
        vm.assume(otherChainId != block.chainid);

        // Sign on current chain
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", account.domainSeparator(), hash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(ownerPk, digest);
        bytes memory sig = abi.encodePacked(r, s, v);

        // Valid on current chain
        assertEq(account.isValidSignature(hash, sig), bytes4(0x1626ba7e));

        // Invalid on other chain
        vm.chainId(otherChainId);
        assertEq(account.isValidSignature(hash, sig), bytes4(0xffffffff));
    }

    /// @dev Fuzz: Invalid signature lengths always return INVALID
    function testFuzz_erc1271_invalidLength(bytes32 hash, bytes memory sig) public view {
        vm.assume(sig.length != 65);
        assertEq(account.isValidSignature(hash, sig), bytes4(0xffffffff));
    }

    // ═══════════════════════════════════════════════════════════
    //                    DAILY LIMIT FUZZING
    // ═══════════════════════════════════════════════════════════

    /// @dev Fuzz: Daily velocity correctly tracks spend
    function testFuzz_dailyVelocity(uint256 txValue) public {
        txValue = bound(txValue, 0.01 ether, 1 ether); // within maxTxValue

        PackedUserOperation memory userOp = _buildUserOp(target, txValue, "");
        bytes memory sig = _signAgent(userOp);
        if (txValue > 0.5 ether) {
            // Need guardian co-sign for medium tier
            sig = _signAgentGuardian(userOp);
        }
        userOp.signature = sig;

        vm.prank(entryPointAddr);
        uint256 result = account.validateUserOp(userOp, keccak256(abi.encode(userOp.sender, userOp.nonce, userOp.callData)), 0);
        assertEq(result, 0); // SIG_VALIDATION_SUCCESS

        assertEq(account.dailySpent(), txValue);
    }

    // ═══════════════════════════════════════════════════════════
    //                    SESSION KEY FUZZING
    // ═══════════════════════════════════════════════════════════

    /// @dev Fuzz: Session key duration must be valid
    function testFuzz_sessionKeyDuration(uint256 duration) public {
        duration = bound(duration, 1, 365 days);
        uint256 validUntil = block.timestamp + duration;

        uint256 sessionPk = 0xFEED;
        address sessionAddr = vm.addr(sessionPk);

        vm.prank(owner);
        uint256 sid = account.createSessionKey(sessionAddr, 0, validUntil, 1 ether, 0, 0, true);
        assertTrue(sid > 0);
    }

    /// @dev Fuzz: Expired session key is always invalid
    function testFuzz_expiredSessionKeyInvalid(uint256 warpTime) public {
        uint256 sessionPk = 0xFEED;
        address sessionAddr = vm.addr(sessionPk);

        vm.prank(owner);
        account.createSessionKey(sessionAddr, 0, block.timestamp + 1 hours, 1 ether, 0, 0, true);

        warpTime = bound(warpTime, 1 hours + 1, 365 days);
        vm.warp(block.timestamp + warpTime);

        assertFalse(account.isValidSessionKey(sessionAddr));
    }

    // ═══════════════════════════════════════════════════════════
    //                    OWNERSHIP TRANSFER FUZZING
    // ═══════════════════════════════════════════════════════════

    /// @dev Fuzz: Transfer delay must be in bounds
    function testFuzz_ownerTransferDelay(uint256 delay) public {
        if (delay < 1 hours || delay > 90 days) {
            vm.prank(owner);
            vm.expectRevert();
            account.setOwnerTransferDelay(delay);
        } else if (delay >= account.ownerTransferDelay()) {
            // Can only increase (decrease requires timelock queue)
            vm.prank(owner);
            account.setOwnerTransferDelay(delay);
            assertEq(account.ownerTransferDelay(), delay);
        }
    }

    // ═══════════════════════════════════════════════════════════
    //                    HELPERS
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

    function _signAgent(PackedUserOperation memory userOp) internal pure returns (bytes memory) {
        bytes32 hash = keccak256(abi.encode(userOp.sender, userOp.nonce, userOp.callData));
        bytes32 ethHash = MessageHashUtils.toEthSignedMessageHash(hash);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(0xB0B, ethHash);
        return abi.encodePacked(r, s, v);
    }

    function _signAgentGuardian(PackedUserOperation memory userOp) internal pure returns (bytes memory) {
        bytes32 hash = keccak256(abi.encode(userOp.sender, userOp.nonce, userOp.callData));
        bytes32 ethHash = MessageHashUtils.toEthSignedMessageHash(hash);
        (uint8 v1, bytes32 r1, bytes32 s1) = vm.sign(0xB0B, ethHash);
        (uint8 v2, bytes32 r2, bytes32 s2) = vm.sign(0xC0DE, ethHash);
        return abi.encodePacked(r1, s1, v1, r2, s2, v2);
    }

    receive() external payable {}
}
