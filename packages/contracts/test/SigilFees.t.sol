// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Test.sol";
import "../src/SigilAccount.sol";
import "../src/SigilAccountFactory.sol";
import "@account-abstraction/interfaces/IEntryPoint.sol";
import "@account-abstraction/interfaces/INonceManager.sol";

contract SigilFeesTest is Test {
    SigilAccountFactory public factory;

    uint256 constant DEPLOY_FEE = 0.2 ether; // 0.2 AVAX

    address owner = address(0xA11CE);
    address agent = address(0xB0B);
    address guardian = address(0xC0DE);
    address treasury = address(0x7EA5);
    address factoryOwner;
    address user = address(0xCAFE);
    address entryPointAddr;

    function setUp() public {
        factoryOwner = address(this);
        entryPointAddr = address(0xE1);
        vm.mockCall(entryPointAddr, abi.encodeWithSelector(INonceManager.getNonce.selector), abi.encode(uint256(0)));

        factory = new SigilAccountFactory(IEntryPoint(entryPointAddr), treasury, DEPLOY_FEE);
        vm.deal(user, 100 ether);
        vm.deal(owner, 100 ether);
    }

    // ═══════════════════════════════════════════════════════════
    //                    CONSTRUCTOR
    // ═══════════════════════════════════════════════════════════

    function test_constructorSetsFeeAndTreasury() public view {
        assertEq(factory.deployFee(), DEPLOY_FEE);
        assertEq(factory.treasury(), treasury);
        assertEq(factory.owner(), factoryOwner);
    }

    function test_constructorZeroFeeAllowed() public {
        SigilAccountFactory f = new SigilAccountFactory(IEntryPoint(entryPointAddr), treasury, 0);
        assertEq(f.deployFee(), 0);
    }

    function test_constructorRejectsZeroTreasury() public {
        vm.expectRevert(abi.encodeWithSelector(SigilAccountFactory.ZeroAddress.selector, uint8(5)));
        new SigilAccountFactory(IEntryPoint(entryPointAddr), address(0), DEPLOY_FEE);
    }

    function test_constructorRejectsZeroEntryPoint() public {
        vm.expectRevert(abi.encodeWithSelector(SigilAccountFactory.ZeroAddress.selector, uint8(1)));
        new SigilAccountFactory(IEntryPoint(address(0)), treasury, DEPLOY_FEE);
    }

    function test_constructorRejectsFeeTooHigh() public {
        vm.expectRevert(abi.encodeWithSelector(SigilAccountFactory.FeeTooHigh.selector, 11 ether, 10 ether));
        new SigilAccountFactory(IEntryPoint(entryPointAddr), treasury, 11 ether);
    }

    // ═══════════════════════════════════════════════════════════
    //                    DEPLOYMENT WITH FEES
    // ═══════════════════════════════════════════════════════════

    function test_createAccountWithExactFee() public {
        vm.prank(user);
        SigilAccount account = factory.createAccount{value: DEPLOY_FEE}(
            owner, agent, guardian, 1 ether, 5 ether, 0.5 ether, 0
        );
        assertTrue(address(account) != address(0));
        assertEq(address(factory).balance, DEPLOY_FEE);
    }

    function test_createAccountEmitsFeeCollected() public {
        vm.expectEmit(true, false, false, true);
        emit SigilAccountFactory.FeeCollected(user, DEPLOY_FEE);
        vm.prank(user);
        factory.createAccount{value: DEPLOY_FEE}(owner, agent, guardian, 1 ether, 5 ether, 0.5 ether, 99);
    }

    function test_createAccountWithExcessRefunds() public {
        uint256 excess = 0.5 ether;
        uint256 userBalBefore = user.balance;

        vm.prank(user);
        factory.createAccount{value: DEPLOY_FEE + excess}(
            owner, agent, guardian, 1 ether, 5 ether, 0.5 ether, 1
        );

        // Factory keeps only the fee
        assertEq(address(factory).balance, DEPLOY_FEE);
        // User gets refund (minus gas, but we're in a test so gas is free)
        assertEq(user.balance, userBalBefore - DEPLOY_FEE);
    }

    function test_createAccountInsufficientFeeReverts() public {
        vm.prank(user);
        vm.expectRevert(abi.encodeWithSelector(
            SigilAccountFactory.InsufficientFee.selector, 0.1 ether, DEPLOY_FEE
        ));
        factory.createAccount{value: 0.1 ether}(
            owner, agent, guardian, 1 ether, 5 ether, 0.5 ether, 2
        );
    }

    function test_createAccountZeroFeeReverts() public {
        vm.prank(user);
        vm.expectRevert(abi.encodeWithSelector(
            SigilAccountFactory.InsufficientFee.selector, 0, DEPLOY_FEE
        ));
        factory.createAccount(owner, agent, guardian, 1 ether, 5 ether, 0.5 ether, 3);
    }

    function test_createAccountWithDelayAndFee() public {
        vm.prank(user);
        SigilAccount account = factory.createAccountWithDelay{value: DEPLOY_FEE}(
            owner, agent, guardian, 1 ether, 5 ether, 0.5 ether, 2 hours, 4
        );
        assertTrue(address(account) != address(0));
        assertEq(address(factory).balance, DEPLOY_FEE);
    }

    function test_createAccountFreeWhenFeeIsZero() public {
        // Set fee to 0 (promotional period)
        factory.setDeployFee(0);

        vm.prank(user);
        SigilAccount account = factory.createAccount(
            owner, agent, guardian, 1 ether, 5 ether, 0.5 ether, 5
        );
        assertTrue(address(account) != address(0));
        assertEq(address(factory).balance, 0);
    }

    function test_multipleDeploys_accumulateFees() public {
        vm.startPrank(user);
        factory.createAccount{value: DEPLOY_FEE}(owner, agent, guardian, 1 ether, 5 ether, 0.5 ether, 10);
        factory.createAccount{value: DEPLOY_FEE}(owner, agent, guardian, 1 ether, 5 ether, 0.5 ether, 11);
        factory.createAccount{value: DEPLOY_FEE}(owner, agent, guardian, 1 ether, 5 ether, 0.5 ether, 12);
        vm.stopPrank();

        assertEq(address(factory).balance, DEPLOY_FEE * 3);
    }

    // ═══════════════════════════════════════════════════════════
    //                    FEE MANAGEMENT
    // ═══════════════════════════════════════════════════════════

    function test_setDeployFee() public {
        uint256 newFee = 0.5 ether;
        factory.setDeployFee(newFee);
        assertEq(factory.deployFee(), newFee);
    }

    function test_setDeployFeeToZero() public {
        factory.setDeployFee(0);
        assertEq(factory.deployFee(), 0);
    }

    function test_setDeployFeeRejectsAboveMax() public {
        vm.expectRevert(abi.encodeWithSelector(SigilAccountFactory.FeeTooHigh.selector, 11 ether, 10 ether));
        factory.setDeployFee(11 ether);
    }

    function test_setDeployFeeAtMaxAllowed() public {
        factory.setDeployFee(10 ether);
        assertEq(factory.deployFee(), 10 ether);
    }

    function test_setDeployFeeOnlyOwner() public {
        vm.prank(user);
        vm.expectRevert();
        factory.setDeployFee(1 ether);
    }

    function test_setDeployFeeEmitsEvent() public {
        vm.expectEmit(false, false, false, true);
        emit SigilAccountFactory.DeployFeeUpdated(DEPLOY_FEE, 0.3 ether);
        factory.setDeployFee(0.3 ether);
    }

    function test_setTreasury() public {
        address newTreasury = address(0xBEEF);
        factory.setTreasury(newTreasury);
        assertEq(factory.treasury(), newTreasury);
    }

    function test_setTreasuryRejectsZero() public {
        vm.expectRevert(abi.encodeWithSelector(SigilAccountFactory.ZeroAddress.selector, uint8(5)));
        factory.setTreasury(address(0));
    }

    function test_setTreasuryOnlyOwner() public {
        vm.prank(user);
        vm.expectRevert();
        factory.setTreasury(address(0xBEEF));
    }

    function test_setTreasuryEmitsEvent() public {
        address newTreasury = address(0xBEEF);
        vm.expectEmit(true, true, false, true);
        emit SigilAccountFactory.TreasuryUpdated(treasury, newTreasury);
        factory.setTreasury(newTreasury);
    }

    // ═══════════════════════════════════════════════════════════
    //                    WITHDRAWAL
    // ═══════════════════════════════════════════════════════════

    function test_withdrawFees() public {
        // Accumulate fees
        vm.prank(user);
        factory.createAccount{value: DEPLOY_FEE}(owner, agent, guardian, 1 ether, 5 ether, 0.5 ether, 20);

        uint256 treasuryBefore = treasury.balance;
        factory.withdrawFees();

        assertEq(treasury.balance, treasuryBefore + DEPLOY_FEE);
        assertEq(address(factory).balance, 0);
    }

    function test_withdrawFeesEmitsEvent() public {
        vm.prank(user);
        factory.createAccount{value: DEPLOY_FEE}(owner, agent, guardian, 1 ether, 5 ether, 0.5 ether, 21);

        vm.expectEmit(true, false, false, true);
        emit SigilAccountFactory.FeesWithdrawn(treasury, DEPLOY_FEE);
        factory.withdrawFees();
    }

    function test_withdrawFeesRevertsWhenEmpty() public {
        vm.expectRevert(SigilAccountFactory.NoBalance.selector);
        factory.withdrawFees();
    }

    function test_withdrawFeesOnlyOwner() public {
        vm.prank(user);
        factory.createAccount{value: DEPLOY_FEE}(owner, agent, guardian, 1 ether, 5 ether, 0.5 ether, 22);

        vm.prank(user);
        vm.expectRevert();
        factory.withdrawFees();
    }

    function test_withdrawFeesAmount() public {
        vm.prank(user);
        factory.createAccount{value: DEPLOY_FEE}(owner, agent, guardian, 1 ether, 5 ether, 0.5 ether, 23);

        uint256 half = DEPLOY_FEE / 2;
        factory.withdrawFeesAmount(half);

        assertEq(address(factory).balance, DEPLOY_FEE - half);
    }

    function test_withdrawFeesAmountRevertsExcessive() public {
        vm.prank(user);
        factory.createAccount{value: DEPLOY_FEE}(owner, agent, guardian, 1 ether, 5 ether, 0.5 ether, 24);

        vm.expectRevert(SigilAccountFactory.NoBalance.selector);
        factory.withdrawFeesAmount(DEPLOY_FEE + 1);
    }

    // ═══════════════════════════════════════════════════════════
    //                    FEE CONFIG VIEW
    // ═══════════════════════════════════════════════════════════

    function test_getFeeConfig() public {
        vm.prank(user);
        factory.createAccount{value: DEPLOY_FEE}(owner, agent, guardian, 1 ether, 5 ether, 0.5 ether, 30);

        (uint256 fee, address treas, uint256 bal) = factory.getFeeConfig();
        assertEq(fee, DEPLOY_FEE);
        assertEq(treas, treasury);
        assertEq(bal, DEPLOY_FEE);
    }

    // ═══════════════════════════════════════════════════════════
    //                    FEE CHANGE + DEPLOY INTERACTION
    // ═══════════════════════════════════════════════════════════

    function test_feeChangeAffectsNextDeploy() public {
        // Deploy at original fee
        vm.prank(user);
        factory.createAccount{value: DEPLOY_FEE}(owner, agent, guardian, 1 ether, 5 ether, 0.5 ether, 40);

        // Increase fee
        uint256 newFee = 0.5 ether;
        factory.setDeployFee(newFee);

        // Old fee should now fail
        vm.prank(user);
        vm.expectRevert(abi.encodeWithSelector(
            SigilAccountFactory.InsufficientFee.selector, DEPLOY_FEE, newFee
        ));
        factory.createAccount{value: DEPLOY_FEE}(owner, agent, guardian, 1 ether, 5 ether, 0.5 ether, 41);

        // New fee works
        vm.prank(user);
        factory.createAccount{value: newFee}(owner, agent, guardian, 1 ether, 5 ether, 0.5 ether, 41);
    }

    function test_promotionalFreePeriod() public {
        // Set fee to 0
        factory.setDeployFee(0);

        // Free deploy
        vm.prank(user);
        factory.createAccount(owner, agent, guardian, 1 ether, 5 ether, 0.5 ether, 50);

        // Restore fee
        factory.setDeployFee(DEPLOY_FEE);

        // Now requires payment
        vm.prank(user);
        vm.expectRevert();
        factory.createAccount(owner, agent, guardian, 1 ether, 5 ether, 0.5 ether, 51);
    }

    // ═══════════════════════════════════════════════════════════
    //                    ADDRESS PREDICTION UNCHANGED
    // ═══════════════════════════════════════════════════════════

    function test_getAddressStillWorks() public {
        address predicted = factory.getAddress(owner, agent, guardian, 1 ether, 5 ether, 0.5 ether, 60);

        vm.prank(user);
        SigilAccount account = factory.createAccount{value: DEPLOY_FEE}(
            owner, agent, guardian, 1 ether, 5 ether, 0.5 ether, 60
        );

        assertEq(address(account), predicted);
    }

    // ═══════════════════════════════════════════════════════════
    //                    OWNERSHIP TRANSFER
    // ═══════════════════════════════════════════════════════════

    function test_transferOwnership2Step() public {
        address newOwner = address(0xBEEF);
        factory.transferOwnership(newOwner);
        // Owner doesn't change until accepted (Ownable2Step)
        assertEq(factory.owner(), factoryOwner);
        assertEq(factory.pendingOwner(), newOwner);

        // New owner accepts
        vm.prank(newOwner);
        factory.acceptOwnership();
        assertEq(factory.owner(), newOwner);
    }

    function test_transferOwnershipOnlyOwner() public {
        vm.prank(user);
        vm.expectRevert();
        factory.transferOwnership(user);
    }

    function test_acceptOwnershipOnlyPendingOwner() public {
        factory.transferOwnership(user);
        vm.prank(address(0xDEAD));
        vm.expectRevert();
        factory.acceptOwnership();
    }

    // ═══════════════════════════════════════════════════════════
    //                    EDGE CASES
    // ═══════════════════════════════════════════════════════════

    function test_refundFailureEmitsEventAndKeepsFunds() public {
        // Deploy a contract that can't receive ETH refunds
        NonReceivable nr = new NonReceivable(address(factory));
        vm.deal(address(nr), 10 ether);

        uint256 excess = 0.1 ether;

        // Expect RefundFailed event
        vm.expectEmit(true, false, false, true);
        emit SigilAccountFactory.RefundFailed(address(nr), excess);

        // Deploy with excess — refund will fail, event emitted, deploy succeeds
        nr.deployAccount(DEPLOY_FEE + excess, owner, agent, guardian, 70);

        // Factory keeps the excess since refund to NonReceivable failed
        assertEq(address(factory).balance, DEPLOY_FEE + excess);
    }

    // For testing failed refund
    receive() external payable {}
}

/// @dev Contract that calls factory but rejects incoming ETH (no receive/fallback for refund)
contract NonReceivable {
    SigilAccountFactory immutable fac;

    constructor(address factory_) {
        fac = SigilAccountFactory(payable(factory_));
    }

    function deployAccount(uint256 val, address o, address a, address g, uint256 salt) external {
        fac.createAccount{value: val}(o, a, g, 1 ether, 5 ether, 0.5 ether, salt);
    }

    // No receive() or fallback() — can't receive refunds
}
