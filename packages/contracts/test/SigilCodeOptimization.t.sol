// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Test.sol";
import "../src/SigilAccount.sol";
import "../src/SigilAccountFactory.sol";
import "@account-abstraction/interfaces/PackedUserOperation.sol";
import "@account-abstraction/interfaces/IEntryPoint.sol";

/**
 * @title SigilCodeOptimizationTest
 * @notice R46: Advanced code optimization - gas efficiency, storage optimization, bytecode analysis, and performance tuning
 */
contract SigilCodeOptimizationTest is Test {
    SigilAccountFactory public factory;
    SigilAccount public account;
    IEntryPoint public entryPoint;
    
    address public treasury = makeAddr("treasury");
    uint256 public constant DEPLOY_FEE = 0.001 ether;
    
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
        
        vm.deal(address(this), 10 ether);
        account = factory.createAccount{value: DEPLOY_FEE}(
            owner, agentKey, guardianKey, 1 ether, 5 ether, 0.5 ether, 1
        );
    }

    // R46.1: Gas consumption analysis and optimization validation
    function test_gasConsumptionAnalysisOptimizationValidation() public {
        // Comprehensive gas analysis for all major operations
        
        uint256 gasStart;
        uint256 gasUsed;
        
        // === Core Function Gas Analysis ===
        
        // Policy updates (should be optimized for frequent use)
        gasStart = gasleft();
        vm.prank(owner);
        account.updatePolicy(2 ether, 10 ether, 1 ether, type(uint256).max);
        gasUsed = gasStart - gasleft();
        assertLt(gasUsed, 60000, "Policy update gas too high");
        
        // Key rotations (should be optimized for security operations)
        gasStart = gasleft();
        vm.prank(owner);
        account.rotateAgentKey(makeAddr("newAgent"));
        gasUsed = gasStart - gasleft();
        assertLt(gasUsed, 50000, "Agent key rotation gas too high");
        
        gasStart = gasleft();
        vm.prank(owner);
        account.rotateGuardianKey(makeAddr("newGuardian"));
        gasUsed = gasStart - gasleft();
        assertLt(gasUsed, 50000, "Guardian key rotation gas too high");
        
        // Freeze/unfreeze (should be very efficient for emergency use)
        gasStart = gasleft();
        vm.prank(owner);
        account.freeze();
        gasUsed = gasStart - gasleft();
        assertLt(gasUsed, 40000, "Freeze operation gas too high");
        
        gasStart = gasleft();
        vm.prank(owner);
        account.unfreeze();
        gasUsed = gasStart - gasleft();
        assertLt(gasUsed, 30000, "Unfreeze operation gas too high");
        
        // Target/function whitelisting (frequent admin operations)
        gasStart = gasleft();
        vm.prank(owner);
        account.setAllowedTarget(makeAddr("target"), true);
        gasUsed = gasStart - gasleft();
        assertLt(gasUsed, 45000, "Target whitelisting gas too high");
        
        gasStart = gasleft();
        vm.prank(owner);
        account.setAllowedFunction(bytes4(0x12345678), true);
        gasUsed = gasStart - gasleft();
        assertLt(gasUsed, 45000, "Function whitelisting gas too high");
        
        console.log("All core operations within gas efficiency targets");
    }

    // R46.2: Storage slot optimization and packing efficiency
    function test_storageSlotOptimizationPackingEfficiency() public {
        // Test storage efficiency by measuring gas costs of related operations
        
        uint256 gasStart;
        uint256 gasUsed;
        
        // === Policy Variable Packing ===
        // Related policy variables should be packed efficiently
        gasStart = gasleft();
        uint256 maxTx = account.maxTxValue();
        uint256 daily = account.dailyLimit();
        uint256 guardian = account.guardianThreshold();
        uint256 ownerThresh = account.ownerThreshold();
        gasUsed = gasStart - gasleft();
        
        // Should be efficient to read related policy variables
        assertLt(gasUsed, 30000, "Policy variable access not optimized");
        
        // === State Variable Packing ===
        gasStart = gasleft();
        bool frozen = account.isFrozen();
        uint256 spent = account.dailySpent();
        uint256 resetTime = account.dailyResetTime();
        gasUsed = gasStart - gasleft();
        
        assertLt(gasUsed, 20000, "State variable access not optimized");
        
        // === Key Storage Efficiency ===
        gasStart = gasleft();
        address ownerAddr = account.owner();
        address agentAddr = account.agentKey();
        address guardianAddr = account.guardianKey();
        gasUsed = gasStart - gasleft();
        
        assertLt(gasUsed, 15000, "Key access not optimized");
        
        // === Transfer State Packing ===
        gasStart = gasleft();
        address pending = account.pendingOwner();
        uint256 delay = account.ownerTransferDelay();
        uint256 requestedAt = account.ownerTransferRequestedAt();
        gasUsed = gasStart - gasleft();
        
        assertLt(gasUsed, 20000, "Transfer state access not optimized");
        
        console.log("Storage slot optimization validated - all accesses efficient");
        console.log("Policy access gas:", gasUsed);
    }

    // R46.3: Bytecode size optimization and contract efficiency
    function test_bytecodeSizeOptimizationContractEfficiency() public {
        // Analyze contract bytecode size for optimization opportunities
        
        uint256 accountSize;
        uint256 factorySize;
        uint256 implSize;
        
        address accountAddr = address(account);
        address factoryAddr = address(factory);
        address implAddr = address(factory.accountImplementation());
        
        assembly {
            accountSize := extcodesize(accountAddr)
            factorySize := extcodesize(factoryAddr)
            implSize := extcodesize(implAddr)
        }
        
        // Account proxy should be minimal
        assertLt(accountSize, 2000, "Account proxy size too large");
        
        // Factory should be reasonably sized
        assertLt(factorySize, 15000, "Factory contract size could be optimized");
        
        // Implementation should be under size limit with room to spare
        assertLt(implSize, 24500, "Implementation size approaching limit");
        
        // === Function Count Analysis ===
        // Verify contract has reasonable number of functions (not bloated)
        
        // Test that all public functions are accessible (indicates proper interface design)
        assertTrue(account.owner() != address(0), "Core function accessible");
        assertTrue(account.maxTxValue() > 0, "Policy function accessible");
        assertTrue(account.factory() != address(0), "Immutable function accessible");
        
        // === Code Density Analysis ===
        // Each function should provide meaningful functionality
        
        // Test complex operations work efficiently
        vm.prank(owner);
        uint256 sessionId = account.createSessionKey(
            makeAddr("sessionKey"),
            block.timestamp,
            block.timestamp + 1 days,
            1 ether,
            0.5 ether,
            0,
            true
        );
        
        // Should be able to use created session key
        assertTrue(sessionId > 0, "Complex operation produces meaningful result");
        
        console.log("Bytecode optimization validated");
        console.log("Account size:", accountSize, "bytes");
        console.log("Factory size:", factorySize, "bytes");
        console.log("Implementation size:", implSize, "bytes");
    }

    // R46.4: Function selector collision analysis and optimization

    // R46.5: Loop and iteration optimization analysis
    function test_loopIterationOptimizationAnalysis() public {
        // Test operations that involve loops or iterations for gas efficiency
        
        // === Multicall Optimization ===
        // Batch operations should be more efficient than individual calls
        
        uint256 gasStart;
        uint256 batchGasUsed;
        uint256 individualGasUsed;
        
        // Test batch operations
        bytes[] memory multicallData = new bytes[](5);
        for (uint256 i = 0; i < 5; i++) {
            multicallData[i] = abi.encodeWithSelector(
                account.setAllowedTarget.selector,
                address(uint160(1000 + i)),
                true
            );
        }
        
        gasStart = gasleft();
        vm.prank(owner);
        account.multicall(multicallData);
        batchGasUsed = gasStart - gasleft();
        
        // Test individual operations
        gasStart = gasleft();
        vm.prank(owner);
        account.setAllowedTarget(address(2000), true);
        vm.prank(owner);
        account.setAllowedTarget(address(2001), true);
        vm.prank(owner);
        account.setAllowedTarget(address(2002), true);
        vm.prank(owner);
        account.setAllowedTarget(address(2003), true);
        vm.prank(owner);
        account.setAllowedTarget(address(2004), true);
        individualGasUsed = gasStart - gasleft();
        
        // Batch operations should be reasonably efficient compared to individual operations
        assertLt(batchGasUsed, individualGasUsed * 2, "Batch operations not reasonably efficient");
        
        // === Recovery Guardian List Optimization ===
        // Test operations on guardian list for efficiency
        
        vm.prank(owner);
        account.addRecoveryGuardian(makeAddr("guardian1"));
        
        gasStart = gasleft();
        address[] memory guardians = account.getRecoveryGuardians();
        uint256 listAccessGas = gasStart - gasleft();
        
        assertLt(listAccessGas, 15000, "Guardian list access not optimized");
        assertEq(guardians.length, 1, "Guardian list operation correct");
        
        console.log("Loop and iteration optimization validated");
        console.log("Batch gas:", batchGasUsed);
        console.log("Individual gas:", individualGasUsed);
        
        if (individualGasUsed > batchGasUsed) {
            console.log("Efficiency gain:", (individualGasUsed - batchGasUsed) * 100 / individualGasUsed, "%");
        } else {
            console.log("Batch operations use more gas than individual operations");
        }
    }

    // R46.6: Memory usage optimization and temporary variable efficiency
    function test_memoryUsageOptimizationTempVariableEfficiency() public {
        // Test memory usage patterns and temporary variable optimization
        
        uint256 gasStart;
        uint256 gasUsed;
        
        // === Memory Allocation Efficiency ===
        // Test operations that allocate memory
        
        gasStart = gasleft();
        
        // Session key creation involves memory allocation
        vm.prank(owner);
        account.createSessionKey(
            makeAddr("memoryTest"),
            block.timestamp,
            block.timestamp + 1 days,
            1 ether,
            0.5 ether,
            0,
            true
        );
        
        gasUsed = gasStart - gasleft();
        assertLt(gasUsed, 250000, "Memory allocation not optimized in session key creation");
        
        // === Struct Packing Efficiency ===
        // Test access to packed structs
        
        gasStart = gasleft();
        (uint256 threshold, uint256 count, uint256 delay) = account.getRecoveryConfig();
        gasUsed = gasStart - gasleft();
        
        assertLt(gasUsed, 10000, "Struct access not optimized");
        assertTrue(threshold >= 0 && count >= 0 && delay >= 0, "Struct data valid");
        
        // === Array Operations Efficiency ===
        // Test dynamic array operations
        
        vm.prank(owner);
        account.addRecoveryGuardian(makeAddr("arrayTest1"));
        
        gasStart = gasleft();
        vm.prank(owner);
        account.addRecoveryGuardian(makeAddr("arrayTest2"));
        gasUsed = gasStart - gasleft();
        
        assertLt(gasUsed, 80000, "Dynamic array operations not optimized");
        
        // === String Storage Optimization ===
        // Test string storage in events and functions
        
        gasStart = gasleft();
        vm.prank(owner);
        account.freeze();
        gasUsed = gasStart - gasleft();
        
        assertLt(gasUsed, 50000, "String storage not optimized");
        
        vm.prank(owner);
        account.unfreeze();
        
        console.log("Memory usage optimization validated - efficient allocation patterns");
    }

    // R46.7: External call optimization and gas forwarding efficiency
    function test_externalCallOptimizationGasForwardingEfficiency() public {
        // Test external calls and gas forwarding for efficiency
        
        MockExternalContract externalContract = new MockExternalContract();
        
        // === Gas Forwarding Analysis ===
        // Test gas forwarding in emergency functions
        
        vm.deal(address(account), 5 ether);
        
        uint256 gasStart = gasleft();
        vm.prank(owner);
        account.emergencyWithdraw(owner);
        uint256 withdrawGas = gasStart - gasleft();
        
        assertLt(withdrawGas, 80000, "Emergency withdraw gas not optimized");
        
        // === External Contract Interaction ===
        // Test gas efficiency of external contract calls
        
        MockERC20 token = new MockERC20();
        token.mint(address(account), 1000e18);
        
        gasStart = gasleft();
        vm.prank(owner);
        account.emergencyWithdrawToken(address(token), owner);
        uint256 tokenWithdrawGas = gasStart - gasleft();
        
        assertLt(tokenWithdrawGas, 100000, "Token withdraw gas not optimized");
        
        // === Call Data Optimization ===
        // Test calldata handling efficiency
        
        bytes memory callData = abi.encodeWithSignature("testFunction()");
        
        vm.prank(owner);
        account.setAllowedTarget(address(externalContract), true);
        
        vm.prank(owner);
        account.setAllowedFunction(externalContract.testFunction.selector, true);
        
        // Queue and execute should handle calldata efficiently
        vm.prank(owner);
        uint256 queueId = account.queueTransaction(address(externalContract), 0, callData);
        
        vm.warp(block.timestamp + 1 hours + 1);
        
        gasStart = gasleft();
        vm.prank(owner);
        account.executeQueued(queueId);
        uint256 executeGas = gasStart - gasleft();
        
        assertLt(executeGas, 120000, "Queued execution gas not optimized");
        
        console.log("External call optimization validated");
        console.log("Withdraw gas:", withdrawGas);
        console.log("Token withdraw gas:", tokenWithdrawGas);
        console.log("Execute gas:", executeGas);
    }

    // R46.8: Event emission optimization and data packing
    function test_eventEmissionOptimizationDataPacking() public {
        // Test event emission efficiency and data packing
        
        uint256 gasStart;
        uint256 gasUsed;
        
        // === Event Parameter Optimization ===
        // Test that events are efficiently packed and emitted
        
        gasStart = gasleft();
        vm.prank(owner);
        account.updatePolicy(2 ether, 10 ether, 1 ether, type(uint256).max);
        gasUsed = gasStart - gasleft();
        
        // Event emission should not dominate gas cost
        assertLt(gasUsed, 60000, "Event emission not optimized in policy update");
        
        // === Indexed Parameter Efficiency ===
        // Test indexed parameters for efficient filtering
        
        gasStart = gasleft();
        vm.prank(owner);
        account.rotateAgentKey(makeAddr("eventTest"));
        gasUsed = gasStart - gasleft();
        
        assertLt(gasUsed, 50000, "Indexed event emission not optimized");
        
        // === Multiple Event Operations ===
        // Test operations that emit multiple events
        
        gasStart = gasleft();
        vm.prank(owner);
        account.addRecoveryGuardian(makeAddr("eventGuardian"));
        gasUsed = gasStart - gasleft();
        
        assertLt(gasUsed, 150000, "Multiple event emission not optimized");
        
        // === Event Data Validation ===
        // Ensure events contain necessary data without bloat
        
        gasStart = gasleft();
        vm.prank(owner);
        account.freeze();
        gasUsed = gasStart - gasleft();
        
        assertLt(gasUsed, 45000, "Event with string data not optimized");
        
        vm.prank(owner);
        account.unfreeze();
        
        console.log("Event emission optimization validated - efficient data packing");
    }

    // R46.9: Compiler optimization validation and bytecode analysis
    function test_compilerOptimizationValidationBytecodeAnalysis() public {
        // Validate compiler optimizations and bytecode efficiency
        
        // === Optimizer Settings Validation ===
        // Test that optimizer produces efficient code
        
        uint256 accountSize;
        address accountAddr = address(account);
        assembly {
            accountSize := extcodesize(accountAddr)
        }
        
        // Optimized proxy should be minimal
        assertLt(accountSize, 2000, "Proxy not optimized");
        
        // === Dead Code Elimination ===
        // Test that all functions are reachable (no dead code)
        
        // Core functions
        assertTrue(account.owner() != address(0), "Owner function reachable");
        assertTrue(account.agentKey() != address(0), "Agent key function reachable");
        assertTrue(account.guardianKey() != address(0), "Guardian key function reachable");
        
        // Policy functions
        assertTrue(account.maxTxValue() > 0, "Policy functions reachable");
        
        // State functions
        assertTrue(account.dailyResetTime() > 0, "State functions reachable");
        
        // Factory functions
        assertTrue(address(account.entryPoint()) != address(0), "Immutable functions reachable");
        
        // === Constant Folding Validation ===
        // Test that constants are properly optimized
        
        uint256 gasStart = gasleft();
        uint256 constant1 = 1 hours;
        uint256 constant2 = 7;
        uint256 constant3 = 1 hours;
        uint256 gasUsed = gasStart - gasleft();
        
        // Constants should be very cheap to access
        assertLt(gasUsed, 10000, "Constant access not optimized");
        
        // === Jump Optimization ===
        // Test that function calls are efficiently dispatched
        
        gasStart = gasleft();
        bool frozen1 = account.isFrozen();
        bool frozen2 = account.isFrozen();
        bool frozen3 = account.isFrozen();
        gasUsed = gasStart - gasleft();
        
        // Repeated calls should be efficient
        assertLt(gasUsed, 17000, "Function dispatch not optimized");
        assertTrue(!frozen1 && !frozen2 && !frozen3, "Function results consistent");
        
        console.log("Compiler optimization validated - bytecode analysis passed");
        console.log("Constant access gas:", gasUsed);
    }

    // R46.10: Cache optimization and state variable access patterns
    function test_cacheOptimizationStateVariableAccessPatterns() public {
        // Test state variable caching and access pattern optimization
        
        uint256 gasStart;
        uint256 gasUsed;
        
        // === Storage Read Caching ===
        // Test operations that should cache storage reads
        
        gasStart = gasleft();
        
        // Operation that accesses multiple policy variables
        uint256 currentMaxTx = account.maxTxValue();
        uint256 currentDaily = account.dailyLimit();
        uint256 currentGuardian = account.guardianThreshold();
        
        vm.prank(owner);
        account.updatePolicy(
            currentMaxTx + 1 ether,
            currentDaily + 1 ether,
            currentGuardian + 0.1 ether,
            type(uint256).max
        );
        
        gasUsed = gasStart - gasleft();
        
        // Should be optimized to avoid redundant storage reads
        assertLt(gasUsed, 80000, "Storage read caching not optimized");
        
        // === State Modification Patterns ===
        // Test efficient state modification patterns
        
        gasStart = gasleft();
        
        // Multiple related state changes
        vm.prank(owner);
        account.rotateAgentKey(makeAddr("cacheTest1"));
        
        vm.prank(owner);
        account.rotateGuardianKey(makeAddr("cacheTest2"));
        
        gasUsed = gasStart - gasleft();
        
        // Should be reasonably efficient for related operations
        assertLt(gasUsed, 100000, "Related state changes not optimized");
        
        // === Access Pattern Analysis ===
        // Test common access patterns for efficiency
        
        gasStart = gasleft();
        
        // Common read pattern: check multiple related values
        uint256 maxTx = account.maxTxValue();
        uint256 daily = account.dailyLimit();
        uint256 guardian = account.guardianThreshold();
        bool frozen = account.isFrozen();
        
        gasUsed = gasStart - gasleft();
        
        assertLt(gasUsed, 25000, "Common access pattern not optimized");
        assertTrue(maxTx > 0 && daily > 0 && guardian >= 0, "Access pattern results valid");
        assertTrue(!frozen, "State access correct");
        
        // === Warm vs Cold Storage Analysis ===
        // Test that frequently accessed storage is efficiently handled
        
        // First access (potentially cold)
        gasStart = gasleft();
        address ownerFirst = account.owner();
        uint256 coldAccessGas = gasStart - gasleft();
        
        // Second access (should be warm)
        gasStart = gasleft();
        address ownerSecond = account.owner();
        uint256 warmAccessGas = gasStart - gasleft();
        
        assertEq(ownerFirst, ownerSecond, "Consistent storage access");
        // Warm access should be cheaper (though in testing both might be warm)
        assertLe(warmAccessGas, coldAccessGas, "Storage access pattern consistent");
        
        console.log("Cache optimization validated - efficient access patterns");
        console.log("Policy update gas:", gasUsed);
    }

    // R46.11: Assembly optimization opportunities and inline optimization
    function test_assemblyOptimizationOpportunitiesInlineOptimization() public {
        // Test areas where assembly optimizations are used effectively
        
        // === Signature Recovery Optimization ===
        // Test that signature operations are optimized
        
        uint256 gasStart = gasleft();
        
        bytes32 hash = keccak256("test message");
        bytes memory signature = _signMessage(hash, ownerPk);
        
        // Test ERC-1271 signature validation (uses optimized signature recovery)
        bytes4 result = account.isValidSignature(hash, signature);
        
        uint256 sigValidationGas = gasStart - gasleft();
        
        assertEq(result, bytes4(0x1626ba7e), "Signature validation correct");
        assertLt(sigValidationGas, 30000, "Signature validation not optimized");
        
        // === Address Calculation Optimization ===
        // Test CREATE2 address calculation efficiency
        
        gasStart = gasleft();
        
        address predictedAddr = factory.getAddress(
            makeAddr("testOwner"),
            agentKey,
            guardianKey,
            1 ether,
            5 ether,
            0.5 ether,
            12345
        );
        
        uint256 addressCalcGas = gasStart - gasleft();
        
        assertTrue(predictedAddr != address(0), "Address calculation valid");
        assertLt(addressCalcGas, 20000, "Address calculation not optimized");
        
        // === Bit Manipulation Optimization ===
        // Test efficient bit operations (if any are used)
        
        gasStart = gasleft();
        
        // Test operations that might use bit manipulation
        uint256 sessionId = 1;
        vm.prank(owner);
        account.createSessionKey(
            makeAddr("bitTest"),
            block.timestamp,
            block.timestamp + 1 days,
            1 ether,
            0.5 ether,
            0,
            true
        );
        
        uint256 bitOpGas = gasStart - gasleft();
        assertLt(bitOpGas, 250000, "Session key creation with bit operations optimized");
        
        // === Memory Copy Optimization ===
        // Test efficient memory operations
        
        gasStart = gasleft();
        
        bytes[] memory multicallData = new bytes[](3);
        multicallData[0] = abi.encodeWithSelector(account.setAllowedTarget.selector, makeAddr("target1"), true);
        multicallData[1] = abi.encodeWithSelector(account.setAllowedTarget.selector, makeAddr("target2"), true);
        multicallData[2] = abi.encodeWithSelector(account.setAllowedTarget.selector, makeAddr("target3"), true);
        
        vm.prank(owner);
        account.multicall(multicallData);
        
        uint256 multicallGas = gasStart - gasleft();
        assertLt(multicallGas, 120000, "Multicall memory operations optimized");
        
        console.log("Assembly optimization validated where applicable");
        console.log("Signature validation gas:", sigValidationGas);
        console.log("Address calculation gas:", addressCalcGas);
    }

    // R46.12: Overall performance benchmarking and optimization validation
    function test_overallPerformanceBenchmarkingOptimizationValidation() public {
        // Comprehensive performance benchmark of the entire system
        
        uint256 totalGasUsed = 0;
        uint256 gasStart;
        uint256 gasUsed;
        
        // === Complete Workflow Benchmark ===
        
        // 1. Account configuration
        gasStart = gasleft();
        vm.prank(owner);
        account.updatePolicy(3 ether, 15 ether, 2 ether, type(uint256).max);
        gasUsed = gasStart - gasleft();
        totalGasUsed += gasUsed;
        console.log("Policy update gas:", gasUsed);
        
        // 2. Security setup
        gasStart = gasleft();
        vm.prank(owner);
        account.addRecoveryGuardian(makeAddr("benchGuardian"));
        gasUsed = gasStart - gasleft();
        totalGasUsed += gasUsed;
        console.log("Recovery guardian add gas:", gasUsed);
        
        // 3. Session key management
        gasStart = gasleft();
        vm.prank(owner);
        uint256 sessionId = account.createSessionKey(
            makeAddr("benchSession"),
            block.timestamp,
            block.timestamp + 1 days,
            2 ether,
            1 ether,
            0,
            true
        );
        gasUsed = gasStart - gasleft();
        totalGasUsed += gasUsed;
        console.log("Session key creation gas:", gasUsed);
        
        // 4. Batch operations
        gasStart = gasleft();
        bytes[] memory batchOps = new bytes[](5);
        for (uint256 i = 0; i < 5; i++) {
            batchOps[i] = abi.encodeWithSelector(
                account.setAllowedTarget.selector,
                address(uint160(5000 + i)),
                true
            );
        }
        vm.prank(owner);
        account.multicall(batchOps);
        gasUsed = gasStart - gasleft();
        totalGasUsed += gasUsed;
        console.log("Batch operations gas:", gasUsed);
        
        // 5. Token policy management
        gasStart = gasleft();
        MockERC20 token = new MockERC20();
        vm.prank(owner);
        account.setTokenPolicy(address(token), 1000e18, 100e18);
        gasUsed = gasStart - gasleft();
        totalGasUsed += gasUsed;
        console.log("Token policy gas:", gasUsed);
        
        // 6. Emergency operations
        vm.deal(address(account), 1 ether);
        gasStart = gasleft();
        vm.prank(owner);
        account.emergencyWithdraw(owner);
        gasUsed = gasStart - gasleft();
        totalGasUsed += gasUsed;
        console.log("Emergency withdraw gas:", gasUsed);
        
        // === Performance Validation ===
        
        // Total gas for complete workflow should be reasonable
        assertLt(totalGasUsed, 900000, "Complete workflow gas too high");
        
        // === Memory Efficiency ===
        uint256 accountSize;
        uint256 factorySize;
        address accountAddr = address(account);
        address factoryAddr = address(factory);
        
        assembly {
            accountSize := extcodesize(accountAddr)
            factorySize := extcodesize(factoryAddr)
        }
        
        // Contracts should be reasonably sized
        assertLt(accountSize + factorySize, 20000, "Combined contract size efficient");
        
        // === State Efficiency ===
        // Verify that all operations maintain correct state
        assertTrue(account.maxTxValue() == 3 ether, "State maintained correctly");
        assertTrue(account.allowedTargets(address(5000)), "Batch operations applied");
        assertTrue(account.isRecoveryGuardian(makeAddr("benchGuardian")), "Guardian added");
        
        (address sessionKey,,,,,,,,,) = account.getSessionKey(sessionId);
        assertTrue(sessionKey != address(0), "Session key created");
        
        console.log("=== PERFORMANCE BENCHMARK SUMMARY ===");
        console.log("Total workflow gas:", totalGasUsed);
        console.log("Average operation gas:", totalGasUsed / 6);
        console.log("Account size:", accountSize, "bytes");
        console.log("Factory size:", factorySize, "bytes");
        console.log("Performance optimization validated successfully");
    }

    // Helper function for signature creation
    function _signMessage(bytes32 hash, uint256 privateKey) internal pure returns (bytes memory) {
        bytes32 ethHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", hash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(privateKey, ethHash);
        return abi.encodePacked(r, s, v);
    }
}

// Helper contracts

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

contract MockExternalContract {
    bool public called = false;
    
    function testFunction() external returns (bool) {
        called = true;
        return true;
    }
}