// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Test.sol";
import "../src/SigilAccount.sol";
import "../src/SigilAccountFactory.sol";
import "@account-abstraction/interfaces/PackedUserOperation.sol";
import "@account-abstraction/interfaces/IEntryPoint.sol";
import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

/**
 * @title SigilFactoryDeepDiveTest
 * @notice R40: Factory deep dive - CREATE2 determinism, fee mechanics, Ownable2Step security
 */
contract SigilFactoryDeepDiveTest is Test {
    SigilAccountFactory public factory;
    IEntryPoint public entryPoint;
    
    address public immutable treasury = makeAddr("treasury");
    uint256 public constant DEPLOY_FEE = 0.1 ether;
    
    uint256 ownerPk = 0xA11CE;
    uint256 agentPk = 0xB0B;
    uint256 guardianPk = 0xC0DE;

    address owner;
    address agentKey;
    address guardianKey;

    // Factory events
    event AccountCreated(address indexed account, address indexed owner, address indexed agentKey, address guardianKey);
    event FeeCollected(address indexed payer, uint256 amount);
    event RefundFailed(address indexed to, uint256 amount);
    event DeployFeeUpdated(uint256 oldFee, uint256 newFee);
    event TreasuryUpdated(address indexed oldTreasury, address indexed newTreasury);
    event FeesWithdrawn(address indexed to, uint256 amount);

    function setUp() public {
        owner = vm.addr(ownerPk);
        agentKey = vm.addr(agentPk);
        guardianKey = vm.addr(guardianPk);
        
        entryPoint = IEntryPoint(address(new MockEntryPoint()));
        factory = new SigilAccountFactory(entryPoint, treasury, DEPLOY_FEE);
    }

    // R40.1: CREATE2 deterministic address prediction
    function test_create2DeterministicAddresses() public {
        uint256 salt = 12345;
        
        // Predict address before deployment
        address predictedAddress = factory.getAddress(
            owner,
            agentKey,
            guardianKey,
            1 ether,
            5 ether,
            0.5 ether,
            salt
        );

        // Deploy and verify address matches
        SigilAccount deployedAccount = factory.createAccount{value: DEPLOY_FEE}(
            owner,
            agentKey,
            guardianKey,
            1 ether,
            5 ether,
            0.5 ether,
            salt
        );

        assertEq(address(deployedAccount), predictedAddress, "Deployed address doesn't match prediction");
    }

    // R40.2: CREATE2 salt includes all keys for security
    function test_create2SaltIncludesAllKeys() public {
        uint256 salt = 12345;
        
        // Same salt, different keys = different addresses
        address addr1 = factory.getAddress(owner, agentKey, guardianKey, 1 ether, 5 ether, 0.5 ether, salt);
        address addr2 = factory.getAddress(owner, agentKey, makeAddr("differentGuardian"), 1 ether, 5 ether, 0.5 ether, salt);
        address addr3 = factory.getAddress(owner, makeAddr("differentAgent"), guardianKey, 1 ether, 5 ether, 0.5 ether, salt);
        address addr4 = factory.getAddress(makeAddr("differentOwner"), agentKey, guardianKey, 1 ether, 5 ether, 0.5 ether, salt);
        
        assertTrue(addr1 != addr2, "Different guardian keys should yield different addresses");
        assertTrue(addr1 != addr3, "Different agent keys should yield different addresses");
        assertTrue(addr1 != addr4, "Different owner keys should yield different addresses");
        assertTrue(addr2 != addr3, "All addresses should be unique");
        assertTrue(addr2 != addr4, "All addresses should be unique");
        assertTrue(addr3 != addr4, "All addresses should be unique");
    }

    // R40.3: CREATE2 different salts yield different addresses
    function test_create2DifferentSaltsDifferentAddresses() public {
        address addr1 = factory.getAddress(owner, agentKey, guardianKey, 1 ether, 5 ether, 0.5 ether, 1);
        address addr2 = factory.getAddress(owner, agentKey, guardianKey, 1 ether, 5 ether, 0.5 ether, 2);
        address addr3 = factory.getAddress(owner, agentKey, guardianKey, 1 ether, 5 ether, 0.5 ether, type(uint256).max);
        
        assertTrue(addr1 != addr2, "Different salts should yield different addresses");
        assertTrue(addr1 != addr3, "Max salt should yield different address");
        assertTrue(addr2 != addr3, "All addresses should be unique");
    }

    // R40.4: CREATE2 collision resistance with edge case inputs
    function test_create2CollisionResistance() public {
        // Test with extreme addresses
        address max = address(type(uint160).max);
        address mid = address(0x8000000000000000000000000000000000000000);
        
        // Note: These will revert due to zero address checks, but we test address calculation works
        address addr1 = factory.getAddress(owner, agentKey, guardianKey, 1 ether, 5 ether, 0.5 ether, 0);
        address addr2 = factory.getAddress(owner, agentKey, guardianKey, 1 ether, 5 ether, 0.5 ether, type(uint256).max);
        address addr3 = factory.getAddress(max, agentKey, guardianKey, 1 ether, 5 ether, 0.5 ether, 12345);
        address addr4 = factory.getAddress(mid, agentKey, guardianKey, 1 ether, 5 ether, 0.5 ether, 12345);
        
        assertTrue(addr1 != addr2, "Extreme salts should yield different addresses");
        assertTrue(addr3 != addr4, "Extreme owner addresses should yield different addresses");
        assertTrue(addr1 != addr3, "All addresses should be unique");
        assertTrue(addr1 != addr4, "All addresses should be unique");
        assertTrue(addr2 != addr3, "All addresses should be unique");
        assertTrue(addr2 != addr4, "All addresses should be unique");
    }

    // R40.5: getAddressWithDelay matches CREATE2 calculation for delayed accounts
    function test_getAddressWithDelayMatchesDeployment() public {
        uint256 customDelay = 48 hours;
        uint256 salt = 54321;
        
        address predictedAddr = factory.getAddressWithDelay(
            owner, agentKey, guardianKey, 1 ether, 5 ether, 0.5 ether, customDelay, salt
        );

        SigilAccount deployedAccount = factory.createAccountWithDelay{value: DEPLOY_FEE}(
            owner, agentKey, guardianKey, 1 ether, 5 ether, 0.5 ether, customDelay, salt
        );

        assertEq(address(deployedAccount), predictedAddr, "Delayed account address prediction failed");
    }

    // R40.6: Fee collection and handling
    function test_feeCollectionMechanics() public {
        uint256 initialBalance = address(factory).balance;
        address payer = makeAddr("payer");
        vm.deal(payer, 10 ether);

        // Test exact fee payment
        vm.expectEmit(true, false, false, true);
        emit FeeCollected(payer, DEPLOY_FEE);
        
        vm.prank(payer);
        factory.createAccount{value: DEPLOY_FEE}(
            owner, agentKey, guardianKey, 1 ether, 5 ether, 0.5 ether, 1
        );

        assertEq(address(factory).balance, initialBalance + DEPLOY_FEE, "Fee not collected correctly");
    }

    // R40.7: Excess payment refund with success
    function test_excessPaymentRefund() public {
        address payer = makeAddr("payer");
        uint256 payment = DEPLOY_FEE + 0.5 ether; // Overpay by 0.5 ETH
        vm.deal(payer, payment);

        uint256 payerInitialBalance = payer.balance;
        uint256 factoryInitialBalance = address(factory).balance;

        vm.prank(payer);
        factory.createAccount{value: payment}(
            owner, agentKey, guardianKey, 1 ether, 5 ether, 0.5 ether, 1
        );

        // Factory should only keep the deploy fee
        assertEq(address(factory).balance, factoryInitialBalance + DEPLOY_FEE, "Factory kept too much");
        // Payer should be refunded the excess
        assertEq(payer.balance, payerInitialBalance - DEPLOY_FEE, "Payer not refunded correctly");
    }

    // R40.8: Refund failure handling with malicious contract
    function test_refundFailureHandling() public {
        MaliciousRefundReceiver malicious = new MaliciousRefundReceiver();
        uint256 payment = DEPLOY_FEE + 0.3 ether;
        vm.deal(address(malicious), payment);

        uint256 factoryInitialBalance = address(factory).balance;

        // Expect refund failure event
        vm.expectEmit(true, false, false, true);
        emit RefundFailed(address(malicious), 0.3 ether);

        vm.prank(address(malicious));
        factory.createAccount{value: payment}(
            owner, agentKey, guardianKey, 1 ether, 5 ether, 0.5 ether, 1
        );

        // Factory should keep both fee and failed refund amount
        assertEq(address(factory).balance, factoryInitialBalance + payment, "Failed refund not retained");
    }

    // R40.9: Deploy fee update mechanics
    function test_deployFeeUpdates() public {
        address factoryOwner = factory.owner();
        uint256 newFee = 0.2 ether;

        // Test fee update event emission
        vm.expectEmit(false, false, false, true);
        emit DeployFeeUpdated(DEPLOY_FEE, newFee);

        vm.prank(factoryOwner);
        factory.setDeployFee(newFee);

        assertEq(factory.deployFee(), newFee, "Deploy fee not updated");

        // Test new fee is enforced on next deployment
        address payer = makeAddr("payer");
        vm.deal(payer, 1 ether);

        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(
            SigilAccountFactory.InsufficientFee.selector,
            DEPLOY_FEE, // paying old fee
            newFee      // required new fee
        ));
        factory.createAccount{value: DEPLOY_FEE}(
            owner, agentKey, guardianKey, 1 ether, 5 ether, 0.5 ether, 2
        );
    }

    // R40.10: Deploy fee cap enforcement
    function test_deployFeeCap() public {
        address factoryOwner = factory.owner();
        uint256 maxFee = factory.MAX_DEPLOY_FEE();

        // Setting at max should work
        vm.prank(factoryOwner);
        factory.setDeployFee(maxFee);
        assertEq(factory.deployFee(), maxFee, "Max fee not set");

        // Setting above max should revert
        vm.prank(factoryOwner);
        vm.expectRevert(abi.encodeWithSelector(
            SigilAccountFactory.FeeTooHigh.selector,
            maxFee + 1,
            maxFee
        ));
        factory.setDeployFee(maxFee + 1);
    }

    // R40.11: Treasury address management
    function test_treasuryManagement() public {
        address factoryOwner = factory.owner();
        address newTreasury = makeAddr("newTreasury");

        // Test treasury update event
        vm.expectEmit(true, true, false, true);
        emit TreasuryUpdated(treasury, newTreasury);

        vm.prank(factoryOwner);
        factory.setTreasury(newTreasury);

        assertEq(factory.treasury(), newTreasury, "Treasury not updated");

        // Test zero address rejection
        vm.prank(factoryOwner);
        vm.expectRevert(abi.encodeWithSelector(SigilAccountFactory.ZeroAddress.selector, 5));
        factory.setTreasury(address(0));
    }

    // R40.12: Fee withdrawal mechanics
    function test_feeWithdrawalMechanics() public {
        // First collect some fees
        address payer = makeAddr("payer");
        vm.deal(payer, 10 ether);

        vm.prank(payer);
        factory.createAccount{value: DEPLOY_FEE}(
            owner, agentKey, guardianKey, 1 ether, 5 ether, 0.5 ether, 1
        );

        vm.prank(payer);
        factory.createAccount{value: DEPLOY_FEE}(
            owner, agentKey, guardianKey, 1 ether, 5 ether, 0.5 ether, 2
        );

        uint256 totalFees = DEPLOY_FEE * 2;
        assertEq(address(factory).balance, totalFees, "Fees not collected");

        // Test full withdrawal
        address factoryOwner = factory.owner();
        uint256 treasuryInitialBalance = treasury.balance;

        vm.expectEmit(true, false, false, true);
        emit FeesWithdrawn(treasury, totalFees);

        vm.prank(factoryOwner);
        factory.withdrawFees();

        assertEq(address(factory).balance, 0, "Factory not emptied");
        assertEq(treasury.balance, treasuryInitialBalance + totalFees, "Treasury not funded");
    }

    // R40.13: Partial fee withdrawal
    function test_partialFeeWithdrawal() public {
        // Collect fees first
        address payer = makeAddr("payer");
        vm.deal(payer, 10 ether);

        vm.prank(payer);
        factory.createAccount{value: DEPLOY_FEE}(
            owner, agentKey, guardianKey, 1 ether, 5 ether, 0.5 ether, 1
        );

        uint256 partialAmount = DEPLOY_FEE / 2;
        address factoryOwner = factory.owner();

        vm.expectEmit(true, false, false, true);
        emit FeesWithdrawn(treasury, partialAmount);

        vm.prank(factoryOwner);
        factory.withdrawFeesAmount(partialAmount);

        assertEq(address(factory).balance, DEPLOY_FEE - partialAmount, "Incorrect remaining balance");
        assertEq(treasury.balance, partialAmount, "Incorrect withdrawn amount");
    }

    // R40.14: Ownable2Step security - prevents accidental ownership transfer
    function test_ownable2StepSecurity() public {
        address currentOwner = factory.owner();
        address newOwner = makeAddr("newOwner");

        // Step 1: Transfer ownership (should not immediately change owner)
        vm.prank(currentOwner);
        factory.transferOwnership(newOwner);

        // Owner should not have changed yet
        assertEq(factory.owner(), currentOwner, "Ownership changed prematurely");

        // Step 2: Accept ownership as new owner
        vm.prank(newOwner);
        factory.acceptOwnership();

        // Now ownership should have transferred
        assertEq(factory.owner(), newOwner, "Ownership not transferred");
        assertEq(factory.pendingOwner(), address(0), "Pending owner not cleared");
    }

    // R40.15: Ownable2Step security - wrong accepter cannot steal ownership
    function test_ownable2StepWrongAccepterBlocked() public {
        address currentOwner = factory.owner();
        address newOwner = makeAddr("newOwner");
        address attacker = makeAddr("attacker");

        // Initiate transfer
        vm.prank(currentOwner);
        factory.transferOwnership(newOwner);

        // Attacker tries to accept
        vm.prank(attacker);
        vm.expectRevert(); // Modern Ownable2Step reverts with OwnableUnauthorizedAccount
        factory.acceptOwnership();

        // Owner should remain unchanged
        assertEq(factory.owner(), currentOwner, "Ownership stolen");
    }

    // R40.16: Constructor validation
    function test_constructorValidation() public {
        // Test zero entryPoint rejection
        vm.expectRevert(abi.encodeWithSelector(SigilAccountFactory.ZeroAddress.selector, 1));
        new SigilAccountFactory(IEntryPoint(address(0)), treasury, DEPLOY_FEE);

        // Test zero treasury rejection
        vm.expectRevert(abi.encodeWithSelector(SigilAccountFactory.ZeroAddress.selector, 5));
        new SigilAccountFactory(entryPoint, address(0), DEPLOY_FEE);

        // Test fee too high rejection
        uint256 maxFee = 10 ether; // MAX_DEPLOY_FEE
        vm.expectRevert(abi.encodeWithSelector(SigilAccountFactory.FeeTooHigh.selector, maxFee + 1, maxFee));
        new SigilAccountFactory(entryPoint, treasury, maxFee + 1);
    }

    // R40.17: Account implementation is correctly initialized
    function test_accountImplementationInitialized() public {
        SigilAccount impl = factory.accountImplementation();
        
        // Implementation should be disabled (can't be initialized directly)
        vm.expectRevert(); // Modern initializer reverts with InvalidInitialization()
        impl.initialize(owner, agentKey, guardianKey, 1 ether, 5 ether, 0.5 ether);
    }

    // R40.18: getFeeConfig returns correct values
    function test_getFeeConfigReturnsCorrectValues() public {
        // Collect some fees first
        address payer = makeAddr("payer");
        vm.deal(payer, 1 ether);

        vm.prank(payer);
        factory.createAccount{value: DEPLOY_FEE}(
            owner, agentKey, guardianKey, 1 ether, 5 ether, 0.5 ether, 1
        );

        (uint256 currentFee, address currentTreasury, uint256 balance) = factory.getFeeConfig();
        
        assertEq(currentFee, DEPLOY_FEE, "Incorrect fee in config");
        assertEq(currentTreasury, treasury, "Incorrect treasury in config");
        assertEq(balance, DEPLOY_FEE, "Incorrect balance in config");
    }

    // R40.19: Factory can deploy accounts with zero fee (promotional mode)
    function test_zeroFeePromotionalMode() public {
        address factoryOwner = factory.owner();

        // Set fee to zero
        vm.prank(factoryOwner);
        factory.setDeployFee(0);

        address payer = makeAddr("payer");
        vm.deal(payer, 1 ether);

        // Should work with zero value
        vm.prank(payer);
        SigilAccount account = factory.createAccount{value: 0}(
            owner, agentKey, guardianKey, 1 ether, 5 ether, 0.5 ether, 1
        );

        assertTrue(address(account) != address(0), "Account not created in zero-fee mode");
        assertEq(address(factory).balance, 0, "Factory should not collect fees in zero-fee mode");
    }

    // R40.20: Multiple accounts can be deployed without collision
    function test_multipleAccountDeploymentNoCollision() public {
        address[] memory deployedAccounts = new address[](10);
        
        vm.deal(address(this), 10 ether);

        // Deploy 10 accounts with different salts
        for (uint256 i = 0; i < 10; i++) {
            SigilAccount account = factory.createAccount{value: DEPLOY_FEE}(
                owner, agentKey, guardianKey, 1 ether, 5 ether, 0.5 ether, i
            );
            deployedAccounts[i] = address(account);
        }

        // Verify all addresses are unique
        for (uint256 i = 0; i < 10; i++) {
            for (uint256 j = i + 1; j < 10; j++) {
                assertTrue(deployedAccounts[i] != deployedAccounts[j], "Address collision detected");
            }
        }
    }
}

// Helper contract that reverts on receive to test refund failure
contract MaliciousRefundReceiver {
    receive() external payable {
        revert("Refusing refund");
    }
}

contract MockEntryPoint {
    // Minimal implementation for testing
}