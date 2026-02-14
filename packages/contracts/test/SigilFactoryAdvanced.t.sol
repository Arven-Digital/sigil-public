// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Test.sol";
import "../src/SigilAccount.sol";
import "../src/SigilAccountFactory.sol";
import "@account-abstraction/interfaces/PackedUserOperation.sol";
import "@account-abstraction/interfaces/IEntryPoint.sol";
import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

/**
 * @title SigilFactoryAdvancedTest
 * @notice R42: Advanced factory scenarios - stress testing, gas optimization, edge cases, and deployment limits
 */
contract SigilFactoryAdvancedTest is Test {
    SigilAccountFactory public factory;
    IEntryPoint public entryPoint;
    
    address public immutable treasury = makeAddr("treasury");
    uint256 public constant DEPLOY_FEE = 0.05 ether;
    
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
    }

    // R42.1: Stress test with maximum CREATE2 salt values
    function test_stressTestMaxSaltValues() public {
        uint256[] memory extremeSalts = new uint256[](5);
        extremeSalts[0] = 0;
        extremeSalts[1] = 1;
        extremeSalts[2] = type(uint256).max;
        extremeSalts[3] = type(uint256).max / 2;
        extremeSalts[4] = 0x8000000000000000000000000000000000000000000000000000000000000000;

        address[] memory deployedAddresses = new address[](extremeSalts.length);

        vm.deal(address(this), 10 ether);

        // Deploy accounts with extreme salt values
        for (uint256 i = 0; i < extremeSalts.length; i++) {
            SigilAccount deployedAccount = factory.createAccount{value: DEPLOY_FEE}(
                owner, agentKey, guardianKey, 1 ether, 5 ether, 0.5 ether, extremeSalts[i]
            );
            deployedAddresses[i] = address(deployedAccount);
            
            // Verify account is properly initialized
            assertEq(deployedAccount.owner(), owner, "Owner not set correctly");
            assertEq(deployedAccount.agentKey(), agentKey, "Agent key not set correctly");
            assertEq(deployedAccount.guardianKey(), guardianKey, "Guardian key not set correctly");
        }

        // Verify all addresses are unique
        for (uint256 i = 0; i < deployedAddresses.length; i++) {
            for (uint256 j = i + 1; j < deployedAddresses.length; j++) {
                assertTrue(deployedAddresses[i] != deployedAddresses[j], "Duplicate addresses detected");
            }
        }
    }

    // R42.2: Gas optimization analysis for bulk deployments
    function test_gasOptimizationBulkDeployments() public {
        uint256 numDeployments = 10;
        vm.deal(address(this), 10 ether);

        uint256[] memory gasCosts = new uint256[](numDeployments);
        
        for (uint256 i = 0; i < numDeployments; i++) {
            uint256 gasStart = gasleft();
            
            factory.createAccount{value: DEPLOY_FEE}(
                owner, agentKey, guardianKey, 1 ether, 5 ether, 0.5 ether, i
            );
            
            gasCosts[i] = gasStart - gasleft();
        }

        // Verify gas costs are relatively consistent (no major outliers)
        uint256 maxGas = gasCosts[0];
        uint256 minGas = gasCosts[0];
        
        for (uint256 i = 1; i < numDeployments; i++) {
            if (gasCosts[i] > maxGas) maxGas = gasCosts[i];
            if (gasCosts[i] < minGas) minGas = gasCosts[i];
        }

        // Gas variance should be minimal (less than 5%)
        uint256 variance = ((maxGas - minGas) * 100) / minGas;
        assertLt(variance, 5, "Gas costs vary too much between deployments");

        // Log gas costs for analysis
        console.log("Min gas cost:", minGas);
        console.log("Max gas cost:", maxGas);
        console.log("Variance %:", variance);
    }

    // R42.3: Memory and storage optimization validation
    function test_memoryStorageOptimization() public {
        // Test that factory doesn't store unnecessary state
        uint256 factoryCodeSize;
        address factoryAddr = address(factory);
        assembly {
            factoryCodeSize := extcodesize(factoryAddr)
        }
        
        // Factory should be relatively small (less than 20KB)
        assertLt(factoryCodeSize, 20 * 1024, "Factory code size too large");

        // Test storage reads are minimal
        uint256 deployFee = factory.deployFee();
        address treasuryAddr = factory.treasury();
        address impl = address(factory.accountImplementation());
        
        assertTrue(deployFee == DEPLOY_FEE, "Deploy fee read failed");
        assertTrue(treasuryAddr == treasury, "Treasury read failed");
        assertTrue(impl != address(0), "Implementation read failed");
    }

    // R42.4: Deployment with extreme policy values
    function test_deploymentWithExtremePolicyValues() public {
        vm.deal(address(this), 1 ether);

        // Test with minimum valid values
        SigilAccount minAccount = factory.createAccount{value: DEPLOY_FEE}(
            owner, agentKey, guardianKey, 
            1 wei,          // minimum maxTxValue
            1 wei,          // minimum dailyLimit (equal to maxTxValue)
            0,              // minimum guardianThreshold
            1               // salt
        );

        (uint256 maxTx, uint256 daily, uint256 guardian, uint256 ownerThresh) = (
            minAccount.maxTxValue(),
            minAccount.dailyLimit(),
            minAccount.guardianThreshold(),
            minAccount.ownerThreshold()
        );
        
        assertEq(maxTx, 1 wei, "Min maxTxValue not set");
        assertEq(daily, 1 wei, "Min dailyLimit not set");
        assertEq(guardian, 0, "Min guardianThreshold not set");
        assertEq(ownerThresh, type(uint256).max, "Default ownerThreshold incorrect");

        // Test with very large values (within practical limits)
        SigilAccount maxAccount = factory.createAccount{value: DEPLOY_FEE}(
            owner, agentKey, guardianKey,
            type(uint256).max / 2,     // large but valid maxTxValue
            type(uint256).max / 2,     // large but valid dailyLimit
            type(uint256).max / 4,     // large guardianThreshold
            2                          // salt
        );

        (maxTx, daily, guardian,) = (
            maxAccount.maxTxValue(),
            maxAccount.dailyLimit(),
            maxAccount.guardianThreshold(),
            maxAccount.ownerThreshold()
        );

        assertEq(maxTx, type(uint256).max / 2, "Max maxTxValue not set");
        assertEq(daily, type(uint256).max / 2, "Max dailyLimit not set");
        assertEq(guardian, type(uint256).max / 4, "Max guardianThreshold not set");
    }

    // R42.5: CREATE2 collision resistance with crafted inputs
    function test_create2CollisionResistanceAdvanced() public {
        // Test collision resistance with similar address patterns
        address[] memory similarOwners = new address[](5);
        similarOwners[0] = address(0x1111111111111111111111111111111111111111);
        similarOwners[1] = address(0x1111111111111111111111111111111111111112);
        similarOwners[2] = address(0x2222222222222222222222222222222222222222);
        similarOwners[3] = address(0x1000000000000000000000000000000000000000);
        similarOwners[4] = address(0x0000000000000000000000000000000000000001);

        address[] memory predictedAddresses = new address[](similarOwners.length);
        
        // Predict all addresses first
        for (uint256 i = 0; i < similarOwners.length; i++) {
            predictedAddresses[i] = factory.getAddress(
                similarOwners[i], agentKey, guardianKey, 1 ether, 5 ether, 0.5 ether, i
            );
        }

        // Verify all predicted addresses are unique
        for (uint256 i = 0; i < predictedAddresses.length; i++) {
            for (uint256 j = i + 1; j < predictedAddresses.length; j++) {
                assertTrue(predictedAddresses[i] != predictedAddresses[j], "Collision in predicted addresses");
            }
        }
    }

    // R42.6: Factory fee mechanics under extreme conditions
    function test_factoryFeeMechanicsExtreme() public {
        address factoryOwner = factory.owner();

        // Test setting fee to maximum allowed value
        uint256 maxFee = factory.MAX_DEPLOY_FEE();
        vm.prank(factoryOwner);
        factory.setDeployFee(maxFee);

        // Deploy account with maximum fee
        vm.deal(address(this), maxFee + 1 ether);
        SigilAccount account = factory.createAccount{value: maxFee}(
            owner, agentKey, guardianKey, 1 ether, 5 ether, 0.5 ether, 1
        );

        assertTrue(address(account) != address(0), "Account creation failed with max fee");
        assertEq(address(factory).balance, maxFee, "Max fee not collected");

        // Test massive overpayment refund
        uint256 massiveOverpay = 100 ether;
        address payer = makeAddr("richPayer");
        vm.deal(payer, massiveOverpay);

        uint256 payerInitialBalance = payer.balance;
        
        vm.prank(payer);
        factory.createAccount{value: massiveOverpay}(
            owner, agentKey, guardianKey, 1 ether, 5 ether, 0.5 ether, 2
        );

        // Verify correct refund
        assertEq(payer.balance, payerInitialBalance - maxFee, "Incorrect refund for massive overpayment");
    }

    // R42.7: Factory state consistency during rapid operations
    function test_factoryStateConsistencyRapidOperations() public {
        address factoryOwner = factory.owner();
        
        vm.deal(address(this), 10 ether);
        
        // Rapid fee changes
        vm.startPrank(factoryOwner);
        factory.setDeployFee(0.01 ether);
        factory.setDeployFee(0.02 ether);
        factory.setDeployFee(0.03 ether);
        vm.stopPrank();

        // Deploy account with latest fee
        factory.createAccount{value: 0.03 ether}(
            owner, agentKey, guardianKey, 1 ether, 5 ether, 0.5 ether, 1
        );

        // Rapid treasury changes
        address treasury2 = makeAddr("treasury2");
        address treasury3 = makeAddr("treasury3");
        
        vm.startPrank(factoryOwner);
        factory.setTreasury(treasury2);
        factory.setTreasury(treasury3);
        vm.stopPrank();

        // Withdraw should go to latest treasury
        vm.prank(factoryOwner);
        factory.withdrawFees();
        
        assertEq(treasury3.balance, 0.03 ether, "Fees not sent to correct treasury");
    }

    // R42.8: CREATE2 address prediction accuracy under edge conditions
    function test_create2AddressPredictionAccuracy() public {
        // Test prediction with zero values
        address zeroOwner = address(0);
        
        // This should predict an address even though deployment would fail
        address predictedZero = factory.getAddress(
            zeroOwner, agentKey, guardianKey, 1 ether, 5 ether, 0.5 ether, 0
        );
        assertTrue(predictedZero != address(0), "Zero address prediction failed");

        // Test prediction with identical parameters but different delay
        address addr1 = factory.getAddress(
            owner, agentKey, guardianKey, 1 ether, 5 ether, 0.5 ether, 123
        );
        address addr2 = factory.getAddressWithDelay(
            owner, agentKey, guardianKey, 1 ether, 5 ether, 0.5 ether, 48 hours, 123
        );
        
        assertTrue(addr1 != addr2, "Different init data should yield different addresses");

        // Verify prediction matches actual deployment
        vm.deal(address(this), 1 ether);
        SigilAccount deployed = factory.createAccountWithDelay{value: DEPLOY_FEE}(
            owner, agentKey, guardianKey, 1 ether, 5 ether, 0.5 ether, 48 hours, 123
        );
        
        assertEq(address(deployed), addr2, "Delayed deployment address mismatch");
    }

    // R42.9: Factory inheritance and interface compliance
    function test_factoryInheritanceInterfaceCompliance() public {
        // Test Ownable2Step functionality
        assertTrue(factory.owner() != address(0), "Factory should have an owner");
        
        // Test ReentrancyGuard inheritance (should not revert)
        vm.deal(address(this), 1 ether);
        factory.createAccount{value: DEPLOY_FEE}(
            owner, agentKey, guardianKey, 1 ether, 5 ether, 0.5 ether, 1
        );

        // Test that factory properly inherits all required functionality
        address factoryOwner = factory.owner();
        assertTrue(factoryOwner != address(0), "Ownable functionality broken");

        // Test treasury management inheritance
        address currentTreasury = factory.treasury();
        assertEq(currentTreasury, treasury, "Treasury management broken");
    }

    // R42.10: Deployment with invalid initialization parameters
    function test_deploymentWithInvalidInitParams() public {
        vm.deal(address(this), 5 ether);

        // Test various invalid parameter combinations
        vm.expectRevert(abi.encodeWithSelector(SigilAccountFactory.ZeroAddress.selector, 1));
        factory.createAccount{value: DEPLOY_FEE}(
            address(0), agentKey, guardianKey, 1 ether, 5 ether, 0.5 ether, 1
        );

        vm.expectRevert(abi.encodeWithSelector(SigilAccountFactory.ZeroAddress.selector, 2));
        factory.createAccount{value: DEPLOY_FEE}(
            owner, address(0), guardianKey, 1 ether, 5 ether, 0.5 ether, 2
        );

        vm.expectRevert(abi.encodeWithSelector(SigilAccountFactory.ZeroAddress.selector, 3));
        factory.createAccount{value: DEPLOY_FEE}(
            owner, agentKey, address(0), 1 ether, 5 ether, 0.5 ether, 3
        );

        // Test invalid policy parameters
        vm.expectRevert(); // maxTxValue > dailyLimit
        factory.createAccount{value: DEPLOY_FEE}(
            owner, agentKey, guardianKey, 10 ether, 5 ether, 0.5 ether, 4
        );

        vm.expectRevert(); // zero maxTxValue
        factory.createAccount{value: DEPLOY_FEE}(
            owner, agentKey, guardianKey, 0, 5 ether, 0.5 ether, 5
        );

        vm.expectRevert(); // zero dailyLimit
        factory.createAccount{value: DEPLOY_FEE}(
            owner, agentKey, guardianKey, 1 ether, 0, 0.5 ether, 6
        );
    }

    // R42.11: Factory upgrade safety mechanisms
    function test_factoryUpgradeSafetyMechanisms() public {
        // Verify factory is not upgradeable (no proxy pattern)
        bytes32 slot = 0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc; // Implementation slot
        bytes32 implSlot = vm.load(address(factory), slot);
        assertEq(implSlot, bytes32(0), "Factory should not be upgradeable");

        // Verify implementation contract is properly initialized and disabled
        SigilAccount impl = factory.accountImplementation();
        
        vm.expectRevert(); // Should be disabled
        impl.initialize(owner, agentKey, guardianKey, 1 ether, 5 ether, 0.5 ether);

        vm.expectRevert(); // Should be disabled
        impl.initializeWithDelay(owner, agentKey, guardianKey, 1 ether, 5 ether, 0.5 ether, 48 hours);
    }

    // R42.12: Factory with extremely high concurrency simulation
    function test_factoryConcurrencySimulation() public {
        uint256 numConcurrentDeployments = 20;
        vm.deal(address(this), 20 ether);

        address[] memory deployedAccounts = new address[](numConcurrentDeployments);
        
        // Simulate high concurrency by deploying many accounts rapidly
        for (uint256 i = 0; i < numConcurrentDeployments; i++) {
            // Use different owners to ensure different addresses
            address currentOwner = address(uint160(uint256(keccak256(abi.encode("owner", i)))));
            
            SigilAccount account = factory.createAccount{value: DEPLOY_FEE}(
                currentOwner, agentKey, guardianKey, 1 ether, 5 ether, 0.5 ether, i
            );
            
            deployedAccounts[i] = address(account);
            
            // Verify each account is properly initialized
            assertEq(account.owner(), currentOwner, "Owner not set correctly in concurrent deployment");
        }

        // Verify all accounts are unique
        for (uint256 i = 0; i < numConcurrentDeployments; i++) {
            for (uint256 j = i + 1; j < numConcurrentDeployments; j++) {
                assertTrue(deployedAccounts[i] != deployedAccounts[j], "Concurrent deployment created duplicates");
            }
        }
    }

    // R42.13: Factory fee collection precision and edge cases
    function test_factoryFeeCollectionPrecision() public {
        address factoryOwner = factory.owner();
        
        // Test fee collection with wei-level precision
        vm.prank(factoryOwner);
        factory.setDeployFee(1 wei);

        vm.deal(address(this), 1000 wei);
        
        // Deploy multiple accounts with 1 wei fee
        for (uint256 i = 0; i < 100; i++) {
            factory.createAccount{value: 1 wei}(
                owner, agentKey, guardianKey, 1 ether, 5 ether, 0.5 ether, i
            );
        }

        assertEq(address(factory).balance, 100 wei, "Wei-level fee collection failed");

        // Test partial withdrawal precision
        vm.prank(factoryOwner);
        factory.withdrawFeesAmount(50 wei);
        
        assertEq(address(factory).balance, 50 wei, "Partial wei withdrawal failed");
        assertEq(treasury.balance, 50 wei, "Treasury didn't receive wei payment");
    }

    // R42.14: Factory interaction with account implementation edge cases
    function test_factoryImplementationInteraction() public {
        SigilAccount impl = factory.accountImplementation();
        
        // Verify implementation immutable values
        assertEq(address(impl.entryPoint()), address(entryPoint), "Implementation entryPoint mismatch");
        assertEq(impl.factory(), address(factory), "Implementation factory mismatch");

        // Verify implementation is properly disabled
        assertEq(impl.owner(), address(0), "Implementation should have zero owner");
        assertEq(impl.agentKey(), address(0), "Implementation should have zero agent key");
        assertEq(impl.guardianKey(), address(0), "Implementation should have zero guardian key");

        // Test that implementation code size is reasonable
        uint256 implCodeSize;
        address implAddr = address(impl);
        assembly {
            implCodeSize := extcodesize(implAddr)
        }
        assertGt(implCodeSize, 20000, "Implementation too small");
        assertLt(implCodeSize, 30000, "Implementation too large");
    }

    // R42.15: Factory deployment with custom delay validation
    function test_factoryCustomDelayValidation() public {
        vm.deal(address(this), 5 ether);

        // Test valid custom delays
        uint256[] memory validDelays = new uint256[](3);
        validDelays[0] = 1 hours;      // minimum
        validDelays[1] = 7 days;       // common value
        validDelays[2] = 90 days;      // maximum

        for (uint256 i = 0; i < validDelays.length; i++) {
            SigilAccount account = factory.createAccountWithDelay{value: DEPLOY_FEE}(
                owner, agentKey, guardianKey, 1 ether, 5 ether, 0.5 ether, validDelays[i], i
            );
            
            assertEq(account.ownerTransferDelay(), validDelays[i], "Custom delay not set correctly");
        }

        // Test invalid delays
        vm.expectRevert(); // delay too small
        factory.createAccountWithDelay{value: DEPLOY_FEE}(
            owner, agentKey, guardianKey, 1 ether, 5 ether, 0.5 ether, 30 minutes, 100
        );

        vm.expectRevert(); // delay too large
        factory.createAccountWithDelay{value: DEPLOY_FEE}(
            owner, agentKey, guardianKey, 1 ether, 5 ether, 0.5 ether, 91 days, 101
        );
    }
}

contract MockEntryPoint {
    // Minimal implementation for testing
}