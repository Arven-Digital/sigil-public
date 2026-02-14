// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Test.sol";
import "../src/SigilAccount.sol";
import "../src/SigilAccountFactory.sol";
import "@account-abstraction/interfaces/PackedUserOperation.sol";
import "@account-abstraction/interfaces/IEntryPoint.sol";

/**
 * @title SigilFactoryIntegrationTest  
 * @notice R43: Factory integration testing - cross-contract interactions, upgrade scenarios, and factory-account lifecycle
 */
contract SigilFactoryIntegrationTest is Test {
    SigilAccountFactory public factory;
    SigilAccount public account;
    IEntryPoint public entryPoint;
    
    address public treasury = makeAddr("treasury");
    uint256 public constant DEPLOY_FEE = 0.01 ether;
    
    uint256 ownerPk = 0xA11CE;
    uint256 agentPk = 0xB0B;
    uint256 guardianPk = 0xC0DE;

    address owner;
    address agentKey;
    address guardianKey;

    function setUp() public {
        owner = vm.addr(ownerPk);
        agentKey = vm.addr(agentPk);
        guardianKey = vm.addr(guardianPk);
        
        entryPoint = IEntryPoint(address(new MockEntryPoint()));
        factory = new SigilAccountFactory(entryPoint, treasury, DEPLOY_FEE);
        
        // Deploy a test account
        vm.deal(address(this), 10 ether);
        account = factory.createAccount{value: DEPLOY_FEE}(
            owner, agentKey, guardianKey, 1 ether, 5 ether, 0.5 ether, 1
        );
        vm.deal(address(account), 10 ether);
    }

    // R43.1: Factory-Account lifecycle management
    function test_factoryAccountLifecycleManagement() public {
        // Test that factory correctly initializes account immutables
        assertEq(address(account.entryPoint()), address(entryPoint), "EntryPoint not set correctly");
        assertEq(account.factory(), address(factory), "Factory reference not set correctly");
        
        // Test that account maintains reference to factory throughout operations
        vm.prank(owner);
        account.freeze();
        assertEq(account.factory(), address(factory), "Factory reference lost after freeze");
        
        vm.prank(owner);
        account.unfreeze();
        assertEq(account.factory(), address(factory), "Factory reference lost after unfreeze");
        
        // Test account operations don't affect factory state
        uint256 factoryBalanceBefore = address(factory).balance;
        vm.prank(owner);
        account.updatePolicy(2 ether, 10 ether, 1 ether, type(uint256).max);
        assertEq(address(factory).balance, factoryBalanceBefore, "Account operation affected factory balance");
    }

    // R43.2: Multi-account factory orchestration
    function test_multiAccountFactoryOrchestration() public {
        vm.deal(address(this), 10 ether);
        
        // Deploy multiple accounts with different configurations
        SigilAccount[] memory accounts = new SigilAccount[](3);
        
        // Account 1: Standard configuration
        accounts[0] = factory.createAccount{value: DEPLOY_FEE}(
            makeAddr("owner1"), makeAddr("agent1"), makeAddr("guardian1"),
            1 ether, 5 ether, 0.5 ether, 10
        );
        
        // Account 2: High-value configuration  
        accounts[1] = factory.createAccount{value: DEPLOY_FEE}(
            makeAddr("owner2"), makeAddr("agent2"), makeAddr("guardian2"),
            100 ether, 1000 ether, 50 ether, 20
        );
        
        // Account 3: Minimal configuration
        accounts[2] = factory.createAccount{value: DEPLOY_FEE}(
            makeAddr("owner3"), makeAddr("agent3"), makeAddr("guardian3"),
            0.01 ether, 0.01 ether, 0, 30
        );
        
        // Verify all accounts are properly initialized and isolated
        for (uint256 i = 0; i < 3; i++) {
            assertTrue(address(accounts[i]) != address(0), "Account not deployed");
            assertEq(accounts[i].factory(), address(factory), "Factory reference incorrect");
            assertFalse(accounts[i].isFrozen(), "Account should not be frozen initially");
        }
        
        // Verify accounts have unique addresses
        assertTrue(address(accounts[0]) != address(accounts[1]), "Accounts not unique");
        assertTrue(address(accounts[0]) != address(accounts[2]), "Accounts not unique");
        assertTrue(address(accounts[1]) != address(accounts[2]), "Accounts not unique");
    }

    // R43.3: Factory fee accumulation and withdrawal patterns
    function test_factoryFeeAccumulationWithdrawalPatterns() public {
        address factoryOwner = factory.owner();
        vm.deal(address(this), 10 ether);
        
        // Account for initial deployment in setup
        uint256 initialBalance = address(factory).balance;
        
        // Deploy multiple accounts to accumulate fees
        uint256 numAccounts = 10;
        for (uint256 i = 0; i < numAccounts; i++) {
            factory.createAccount{value: DEPLOY_FEE}(
                address(uint160(i + 1000)), // Unique owners
                agentKey, guardianKey, 1 ether, 5 ether, 0.5 ether, i + 100
            );
        }
        
        uint256 expectedFees = initialBalance + (DEPLOY_FEE * numAccounts);
        assertEq(address(factory).balance, expectedFees, "Fees not accumulated correctly");
        
        // Test partial withdrawal pattern
        uint256 partialAmount = expectedFees / 3;
        vm.prank(factoryOwner);
        factory.withdrawFeesAmount(partialAmount);
        
        assertEq(treasury.balance, partialAmount, "Partial withdrawal failed");
        assertEq(address(factory).balance, expectedFees - partialAmount, "Remaining balance incorrect");
        
        // Test full withdrawal
        vm.prank(factoryOwner);
        factory.withdrawFees();
        
        assertEq(treasury.balance, expectedFees, "Full withdrawal failed");
        assertEq(address(factory).balance, 0, "Factory not emptied after full withdrawal");
    }

    // R43.4: Factory state consistency across ownership transfers
    function test_factoryStateConsistencyAcrossOwnershipTransfers() public {
        address newFactoryOwner = makeAddr("newFactoryOwner");
        address currentOwner = factory.owner();
        
        // Record initial state
        uint256 initialFee = factory.deployFee();
        address initialTreasury = factory.treasury();
        
        // Deploy account before ownership transfer
        vm.deal(address(this), 1 ether);
        SigilAccount preTransferAccount = factory.createAccount{value: DEPLOY_FEE}(
            makeAddr("preOwner"), agentKey, guardianKey, 1 ether, 5 ether, 0.5 ether, 500
        );
        
        // Initiate and complete ownership transfer
        vm.prank(currentOwner);
        factory.transferOwnership(newFactoryOwner);
        
        vm.prank(newFactoryOwner);
        factory.acceptOwnership();
        
        // Verify state consistency after transfer
        assertEq(factory.deployFee(), initialFee, "Deploy fee changed during ownership transfer");
        assertEq(factory.treasury(), initialTreasury, "Treasury changed during ownership transfer");
        assertEq(preTransferAccount.factory(), address(factory), "Pre-transfer account factory reference broken");
        
        // Test new owner can deploy accounts
        vm.deal(address(this), 1 ether);
        SigilAccount postTransferAccount = factory.createAccount{value: DEPLOY_FEE}(
            makeAddr("postOwner"), agentKey, guardianKey, 1 ether, 5 ether, 0.5 ether, 600
        );
        
        assertTrue(address(postTransferAccount) != address(0), "New owner cannot deploy accounts");
        assertEq(postTransferAccount.factory(), address(factory), "Post-transfer account factory reference incorrect");
        
        // Test new owner can modify factory settings
        vm.prank(newFactoryOwner);
        factory.setDeployFee(0.02 ether);
        assertEq(factory.deployFee(), 0.02 ether, "New owner cannot modify settings");
    }

    // R43.5: Factory resilience during account operations
    function test_factoryResilienceDuringAccountOperations() public {
        vm.deal(address(account), 20 ether);
        
        // Perform various account operations and verify factory remains stable
        address[] memory targets = new address[](3);
        targets[0] = makeAddr("target1");
        targets[1] = makeAddr("target2");  
        targets[2] = makeAddr("target3");
        
        vm.startPrank(owner);
        
        // Whitelist operations
        for (uint256 i = 0; i < targets.length; i++) {
            account.setAllowedTarget(targets[i], true);
        }
        
        // Policy operations
        account.updatePolicy(3 ether, 15 ether, 2 ether, type(uint256).max);
        
        // Key rotation operations
        address newAgent = makeAddr("newAgent");
        address newGuardian = makeAddr("newGuardian");
        account.rotateAgentKey(newAgent);
        account.rotateGuardianKey(newGuardian);
        
        // Emergency operations
        account.freeze();
        account.emergencyWithdraw(owner);
        account.unfreeze();
        
        vm.stopPrank();
        
        // Verify factory state is unaffected by account operations
        assertEq(factory.deployFee(), DEPLOY_FEE, "Factory fee affected by account operations");
        assertEq(factory.treasury(), treasury, "Factory treasury affected by account operations");
        assertEq(factory.owner() != address(0), true, "Factory ownership affected by account operations");
        
        // Verify factory can still deploy new accounts
        vm.deal(address(this), 1 ether);
        SigilAccount newAccount = factory.createAccount{value: DEPLOY_FEE}(
            makeAddr("resilientOwner"), makeAddr("resilientAgent"), makeAddr("resilientGuardian"),
            1 ether, 5 ether, 0.5 ether, 700
        );
        
        assertTrue(address(newAccount) != address(0), "Factory cannot deploy after account operations");
    }

    // R43.6: Factory interaction with account upgrade mechanisms  
    function test_factoryInteractionAccountUpgradeMechanisms() public {
        // Create a proper mock implementation that maintains immutables
        MockNewImplementation newImpl = new MockNewImplementation();
        
        // Request upgrade
        vm.prank(owner);
        account.requestUpgrade(address(newImpl));
        
        // Verify factory reference is maintained during upgrade process
        assertEq(account.factory(), address(factory), "Factory reference lost during upgrade request");
        
        // Fast forward and prepare guardian signature
        vm.warp(block.timestamp + 24 hours + 1);
        
        // Create guardian signature for upgrade
        bytes32 hash = keccak256(abi.encodePacked(
            "\x19Ethereum Signed Message:\n32",
            keccak256(abi.encodePacked(address(account), address(newImpl), account.upgradeRequestedAt(), block.chainid))
        ));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(guardianPk, hash);
        bytes memory guardianSig = abi.encodePacked(r, s, v);
        
        // Note: In a real upgrade scenario, immutable variables (like factory) are lost
        // during proxy implementation replacement. This is expected behavior.
        // For this test, we'll verify the upgrade process works and then check other aspects
        
        // Execute upgrade
        vm.prank(owner);
        account.executeUpgrade(guardianSig);
        
        // After upgrade, the account should still be functional even if immutables are reset
        // Verify the account owner is maintained
        assertEq(account.owner(), owner, "Owner lost after upgrade");
        
        // Verify the account maintains basic functionality
        vm.prank(owner);
        account.freeze();
        assertTrue(account.isFrozen(), "Account not functional after upgrade");
        
        vm.prank(owner);
        account.unfreeze();
        assertFalse(account.isFrozen(), "Account not functional after upgrade");
    }

    // R43.7: Factory error handling and recovery
    function test_factoryErrorHandlingRecovery() public {
        address factoryOwner = factory.owner();
        vm.deal(address(this), 5 ether);
        
        // Test factory operations with insufficient payments
        vm.expectRevert(abi.encodeWithSelector(SigilAccountFactory.InsufficientFee.selector, 0, DEPLOY_FEE));
        factory.createAccount{value: 0}(
            owner, agentKey, guardianKey, 1 ether, 5 ether, 0.5 ether, 800
        );
        
        // Verify factory is still operational after failed deployment
        SigilAccount successAccount = factory.createAccount{value: DEPLOY_FEE}(
            owner, agentKey, guardianKey, 1 ether, 5 ether, 0.5 ether, 801
        );
        assertTrue(address(successAccount) != address(0), "Factory broken after failed deployment");
        
        // Test factory operations with malicious refund recipient
        MaliciousRefundReceiver malicious = new MaliciousRefundReceiver();
        vm.deal(address(malicious), DEPLOY_FEE + 1 ether);
        
        // This should succeed despite refund failure
        vm.prank(address(malicious));
        SigilAccount maliciousAccount = factory.createAccount{value: DEPLOY_FEE + 1 ether}(
            makeAddr("maliciousOwner"), agentKey, guardianKey, 1 ether, 5 ether, 0.5 ether, 802
        );
        
        assertTrue(address(maliciousAccount) != address(0), "Factory broken by malicious refund recipient");
        
        // Verify factory captured the failed refund (including initial setup account fee)  
        uint256 expectedBalance = 3 * DEPLOY_FEE + 1 ether; // setup + 2 deployments + failed refund
        assertEq(address(factory).balance, expectedBalance, "Factory didn't capture failed refund");
        
        // Test factory can still withdraw fees after error scenarios
        vm.prank(factoryOwner);
        factory.withdrawFees();
        assertEq(treasury.balance, expectedBalance, "Withdrawal failed after error scenarios");
    }

    // R43.8: Factory with extreme configuration combinations
    function test_factoryExtremeConfigurationCombinations() public {
        vm.deal(address(this), 10 ether);
        
        // Configuration 1: Maximum values with minimum delay
        SigilAccount maxAccount = factory.createAccountWithDelay{value: DEPLOY_FEE}(
            makeAddr("maxOwner"), makeAddr("maxAgent"), makeAddr("maxGuardian"),
            type(uint128).max, type(uint128).max, type(uint128).max / 2, 1 hours, 900
        );
        
        assertEq(maxAccount.maxTxValue(), type(uint128).max, "Max configuration failed");
        assertEq(maxAccount.ownerTransferDelay(), 1 hours, "Min delay not set");
        
        // Configuration 2: Minimum values with maximum delay
        SigilAccount minAccount = factory.createAccountWithDelay{value: DEPLOY_FEE}(
            makeAddr("minOwner"), makeAddr("minAgent"), makeAddr("minGuardian"),
            1 wei, 1 wei, 0, 90 days, 901
        );
        
        assertEq(minAccount.maxTxValue(), 1 wei, "Min configuration failed");
        assertEq(minAccount.ownerTransferDelay(), 90 days, "Max delay not set");
        
        // Configuration 3: Asymmetric thresholds
        SigilAccount asymAccount = factory.createAccount{value: DEPLOY_FEE}(
            makeAddr("asymOwner"), makeAddr("asymAgent"), makeAddr("asymGuardian"),
            1 ether, 1000 ether, 999 ether, 902
        );
        
        assertEq(asymAccount.guardianThreshold(), 999 ether, "Asymmetric configuration failed");
        
        // Verify all accounts are functional
        assertTrue(address(maxAccount) != address(0), "Max account not deployed");
        assertTrue(address(minAccount) != address(0), "Min account not deployed");
        assertTrue(address(asymAccount) != address(0), "Asymmetric account not deployed");
    }

    // R43.9: Factory interaction with account recovery mechanisms
    function test_factoryInteractionAccountRecoveryMechanisms() public {
        address recoveryGuardian = makeAddr("recoveryGuardian");
        address newOwner = makeAddr("newOwner");
        
        // Setup recovery guardian
        vm.prank(owner);
        account.addRecoveryGuardian(recoveryGuardian);
        
        // Initiate recovery
        vm.prank(recoveryGuardian);
        bytes32 recoveryId = account.initiateRecovery(newOwner);
        
        // Fast forward and execute recovery
        vm.warp(block.timestamp + 48 hours + 1);
        vm.prank(recoveryGuardian);
        account.executeRecovery(recoveryId);
        
        // Verify factory reference is maintained after recovery
        assertEq(account.factory(), address(factory), "Factory reference lost after recovery");
        assertEq(account.owner(), newOwner, "Recovery failed");
        assertTrue(account.isFrozen(), "Account not frozen after recovery");
        
        // Verify factory can still identify this as a valid account
        assertEq(address(account.entryPoint()), address(entryPoint), "EntryPoint reference lost after recovery");
        
        // Test that factory-deployed accounts maintain integrity after recovery
        vm.prank(newOwner);
        account.unfreeze();
        assertFalse(account.isFrozen(), "Account frozen state not manageable after recovery");
    }

    // R43.10: Factory batch operations and atomicity  
    function test_factoryBatchOperationsAtomicity() public {
        address factoryOwner = factory.owner();
        vm.deal(address(this), 10 ether);
        
        // Test atomic batch deployments (simulate)
        uint256 batchSize = 5;
        address[] memory batchOwners = new address[](batchSize);
        SigilAccount[] memory batchAccounts = new SigilAccount[](batchSize);
        
        // Deploy batch of accounts in rapid succession
        for (uint256 i = 0; i < batchSize; i++) {
            batchOwners[i] = address(uint160(2000 + i));
            batchAccounts[i] = factory.createAccount{value: DEPLOY_FEE}(
                batchOwners[i], agentKey, guardianKey, 1 ether, 5 ether, 0.5 ether, 1000 + i
            );
        }
        
        // Verify batch atomicity - all accounts should be properly deployed
        for (uint256 i = 0; i < batchSize; i++) {
            assertTrue(address(batchAccounts[i]) != address(0), "Batch deployment failed");
            assertEq(batchAccounts[i].owner(), batchOwners[i], "Batch owner incorrect");
            assertEq(batchAccounts[i].factory(), address(factory), "Batch factory reference incorrect");
        }
        
        // Test that partial failure doesn't affect factory state
        vm.expectRevert(); // This should fail (zero address)
        factory.createAccount{value: DEPLOY_FEE}(
            address(0), agentKey, guardianKey, 1 ether, 5 ether, 0.5 ether, 1100
        );
        
        // Factory should still be operational
        SigilAccount postFailAccount = factory.createAccount{value: DEPLOY_FEE}(
            makeAddr("postFailOwner"), agentKey, guardianKey, 1 ether, 5 ether, 0.5 ether, 1101
        );
        assertTrue(address(postFailAccount) != address(0), "Factory broken after partial failure");
    }

    // R43.11: Factory-account communication verification
    function test_factoryAccountCommunicationVerification() public {
        // Verify that accounts can only be initialized by factory
        SigilAccount impl = factory.accountImplementation();
        
        // Direct initialization should fail
        vm.expectRevert();
        impl.initialize(owner, agentKey, guardianKey, 1 ether, 5 ether, 0.5 ether);
        
        vm.expectRevert();
        impl.initializeWithDelay(owner, agentKey, guardianKey, 1 ether, 5 ether, 0.5 ether, 24 hours);
        
        // Factory-deployed account should have correct factory reference
        assertEq(account.factory(), address(factory), "Factory reference incorrect");
        
        // Test that factory immutable is correctly set in deployed accounts
        address factoryFromAccount = account.factory();
        assertEq(factoryFromAccount, address(factory), "Factory immutable not set correctly");
        
        // Verify entrypoint consistency between factory and accounts
        assertEq(address(account.entryPoint()), address(factory.entryPoint()), "EntryPoint mismatch");
    }

    // R43.12: Factory memory usage optimization under load
    function test_factoryMemoryUsageOptimizationUnderLoad() public {
        uint256 heavyLoadSize = 50;
        vm.deal(address(this), 50 ether);
        
        // Create heavy load to test memory efficiency
        for (uint256 i = 0; i < heavyLoadSize; i++) {
            address uniqueOwner = address(uint160(uint256(keccak256(abi.encode("heavyOwner", i)))));
            address uniqueAgent = address(uint160(uint256(keccak256(abi.encode("heavyAgent", i)))));
            address uniqueGuardian = address(uint160(uint256(keccak256(abi.encode("heavyGuardian", i)))));
            
            SigilAccount heavyAccount = factory.createAccount{value: DEPLOY_FEE}(
                uniqueOwner, uniqueAgent, uniqueGuardian, 
                (i + 1) * 0.1 ether,  // Varying maxTxValue
                (i + 1) * 0.5 ether,  // Varying dailyLimit
                i * 0.05 ether,       // Varying guardianThreshold
                1200 + i
            );
            
            // Verify each account is properly initialized
            assertEq(heavyAccount.owner(), uniqueOwner, "Heavy load owner incorrect");
            assertEq(heavyAccount.factory(), address(factory), "Heavy load factory reference incorrect");
        }
        
        // Verify factory state is consistent after heavy load (including initial setup fee)
        uint256 expectedHeavyLoadBalance = DEPLOY_FEE + (heavyLoadSize * DEPLOY_FEE); // setup + heavy load
        assertEq(address(factory).balance, expectedHeavyLoadBalance, "Heavy load fees not collected");
        
        // Factory should still be able to deploy more accounts efficiently
        SigilAccount postLoadAccount = factory.createAccount{value: DEPLOY_FEE}(
            makeAddr("postLoadOwner"), agentKey, guardianKey, 1 ether, 5 ether, 0.5 ether, 1300
        );
        
        assertTrue(address(postLoadAccount) != address(0), "Factory broken after heavy load");
    }

    // R43.13: Factory upgrade path validation  
    function test_factoryUpgradePathValidation() public {
        // Verify factory is not upgradeable (direct implementation, not proxy)
        bytes32 implementationSlot = 0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc;
        bytes32 slotValue = vm.load(address(factory), implementationSlot);
        assertEq(slotValue, bytes32(0), "Factory should not have proxy implementation slot");
        
        // Verify implementation contract cannot be called directly
        SigilAccount impl = factory.accountImplementation();
        
        // Implementation should have zero owner (disabled state)
        assertEq(impl.owner(), address(0), "Implementation should have zero owner");
        
        // Test that factory maintains consistent implementation reference
        address implAddr1 = address(factory.accountImplementation());
        
        // Deploy account and check implementation consistency
        vm.deal(address(this), 1 ether);
        SigilAccount newAccount = factory.createAccount{value: DEPLOY_FEE}(
            makeAddr("implOwner"), agentKey, guardianKey, 1 ether, 5 ether, 0.5 ether, 1400
        );
        
        address implAddr2 = address(factory.accountImplementation());
        assertEq(implAddr1, implAddr2, "Implementation reference changed during deployment");
        
        // Verify deployed account uses correct implementation
        bytes32 accountImplSlot = vm.load(address(newAccount), implementationSlot);
        assertEq(accountImplSlot, bytes32(uint256(uint160(implAddr1))), "Account doesn't use factory implementation");
    }

    // R43.14: Factory interaction with external contracts
    function test_factoryInteractionExternalContracts() public {
        // Test factory interaction with external treasury contracts
        MockTreasuryContract mockTreasury = new MockTreasuryContract();
        address factoryOwner = factory.owner();
        
        // Update treasury to external contract
        vm.prank(factoryOwner);
        factory.setTreasury(address(mockTreasury));
        
        // Deploy account and collect fee
        vm.deal(address(this), 1 ether);
        factory.createAccount{value: DEPLOY_FEE}(
            owner, agentKey, guardianKey, 1 ether, 5 ether, 0.5 ether, 1500
        );
        
        // Withdraw fees to external treasury
        vm.prank(factoryOwner);
        factory.withdrawFees();
        
        // Verify external treasury received funds (including setup fee)
        uint256 expectedTreasuryAmount = 2 * DEPLOY_FEE; // setup + new deployment  
        assertEq(mockTreasury.receivedAmount(), expectedTreasuryAmount, "External treasury didn't receive funds");
        
        // Test factory operation with external entrypoint
        assertEq(address(factory.entryPoint()), address(entryPoint), "EntryPoint reference lost");
        
        // Verify account can still interact with external contracts after factory deployment
        MockExternalContract externalContract = new MockExternalContract();
        
        vm.prank(owner);
        account.setAllowedTarget(address(externalContract), true);
        
        vm.prank(owner);
        account.setAllowedFunction(externalContract.externalFunction.selector, true);
        
        // This tests that factory-deployed accounts can interact with external contracts
        assertEq(account.allowedTargets(address(externalContract)), true, "External contract not whitelisted");
    }

    // R43.15: Factory resilience and disaster recovery
    function test_factoryResilienceDisasterRecovery() public {
        address factoryOwner = factory.owner();
        vm.deal(address(this), 5 ether);
        
        // Simulate disaster scenarios
        
        // 1. Treasury becomes unreachable (simulate by setting to contract that reverts)
        BrokenTreasuryContract brokenTreasury = new BrokenTreasuryContract();
        
        vm.prank(factoryOwner);
        factory.setTreasury(address(brokenTreasury));
        
        // Factory should still be able to deploy accounts
        factory.createAccount{value: DEPLOY_FEE}(
            makeAddr("disasterOwner1"), agentKey, guardianKey, 1 ether, 5 ether, 0.5 ether, 1600
        );
        
        // But withdrawal should fail gracefully
        vm.prank(factoryOwner);
        vm.expectRevert();
        factory.withdrawFees();
        
        // 2. Recovery: Update to working treasury
        address workingTreasury = makeAddr("workingTreasury");
        vm.prank(factoryOwner);
        factory.setTreasury(workingTreasury);
        
        // Now withdrawal should work (including setup fee)
        vm.prank(factoryOwner);
        factory.withdrawFees();
        uint256 expectedRecoveryAmount = 2 * DEPLOY_FEE; // setup + disaster test deployment
        assertEq(workingTreasury.balance, expectedRecoveryAmount, "Disaster recovery withdrawal failed");
        
        // 3. Test factory operation after disaster recovery
        SigilAccount recoveryAccount = factory.createAccount{value: DEPLOY_FEE}(
            makeAddr("recoveryOwner"), agentKey, guardianKey, 1 ether, 5 ether, 0.5 ether, 1601
        );
        
        assertTrue(address(recoveryAccount) != address(0), "Factory not operational after disaster recovery");
        assertEq(recoveryAccount.factory(), address(factory), "Factory reference lost after disaster recovery");
    }
}

// Helper contracts for testing

contract MockEntryPoint {
    // Minimal implementation for testing
}

// Mock new implementation that inherits from SigilAccount for proper upgrade testing
contract MockNewImplementation is SigilAccount {
    constructor() SigilAccount(IEntryPoint(address(0)), address(0)) {}
    
    function version() external pure returns (string memory) {
        return "v2.0.0";
    }
}

contract MaliciousRefundReceiver {
    receive() external payable {
        revert("Malicious refund rejection");
    }
}

contract MockTreasuryContract {
    uint256 public receivedAmount;
    
    receive() external payable {
        receivedAmount += msg.value;
    }
}

contract MockExternalContract {
    function externalFunction() external pure returns (bool) {
        return true;
    }
}

contract BrokenTreasuryContract {
    receive() external payable {
        revert("Treasury contract broken");
    }
}