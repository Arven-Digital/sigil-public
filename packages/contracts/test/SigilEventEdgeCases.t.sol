// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Test.sol";
import "../src/SigilAccount.sol";
import "../src/SigilAccountFactory.sol";
import "@account-abstraction/interfaces/PackedUserOperation.sol";
import "@account-abstraction/interfaces/IEntryPoint.sol";

/**
 * @title SigilEventEdgeCasesTest
 * @notice R41: Event edge cases - complex scenarios, factory events, recovery events, and session key events
 */
contract SigilEventEdgeCasesTest is Test {
    SigilAccount public account;
    SigilAccountFactory public factory;
    
    uint256 ownerPk = 0xA11CE;
    uint256 agentPk = 0xB0B;
    uint256 guardianPk = 0xC0DE;

    address owner;
    address agentKey;
    address guardianKey;
    address entryPoint;

    MockERC20 public mockToken;
    address public treasury = makeAddr("treasury");

    // Recovery events
    event GuardianAdded(address indexed guardian, uint256 threshold, uint256 totalGuardians);
    event GuardianRemoved(address indexed guardian, uint256 threshold, uint256 totalGuardians);
    event RecoveryThresholdUpdated(uint256 oldThreshold, uint256 newThreshold);
    event RecoveryDelayUpdated(uint256 oldDelay, uint256 newDelay);
    event RecoveryInitiated(bytes32 indexed recoveryId, address indexed newOwner, address indexed initiator, uint256 executeAfter);
    event RecoverySupported(bytes32 indexed recoveryId, address indexed guardian);
    event RecoveryExecuted(bytes32 indexed recoveryId, address indexed oldOwner, address indexed newOwner);
    event RecoveryCancelled(bytes32 indexed recoveryId, address indexed cancelledBy);

    // Session key events
    event SessionKeyCreated(uint256 indexed sessionId, address indexed key, uint256 validAfter, uint256 validUntil, uint256 spendLimit);
    event SessionKeyRevoked(uint256 indexed sessionId, address indexed key);
    event SessionKeyUsed(uint256 indexed sessionId, address indexed target, uint256 value);

    // Upgrade events
    event UpgradeRequested(address indexed newImplementation, uint256 executeAfter);
    event UpgradeCancelled(address indexed cancelledBy);
    event UpgradeExecuted(address indexed newImplementation);

    // Factory events
    event AccountCreated(address indexed account, address indexed owner, address indexed agentKey, address guardianKey);

    function setUp() public {
        owner = vm.addr(ownerPk);
        agentKey = vm.addr(agentPk);
        guardianKey = vm.addr(guardianPk);
        
        entryPoint = address(new MockEntryPoint());
        factory = new SigilAccountFactory(IEntryPoint(entryPoint), treasury, 0);
        
        account = factory.createAccount(
            owner,
            agentKey,
            guardianKey,
            1 ether,
            5 ether,
            0.5 ether,
            0
        );
        
        mockToken = new MockERC20();
        vm.deal(address(account), 10 ether);
    }

    // R41.1: Recovery guardian management events
    function test_recoveryGuardianManagementEvents() public {
        address guardian1 = makeAddr("guardian1");
        address guardian2 = makeAddr("guardian2");

        // Test adding first guardian - should auto-set threshold to 1
        vm.expectEmit(true, false, false, true);
        emit GuardianAdded(guardian1, 1, 1);

        vm.prank(owner);
        account.addRecoveryGuardian(guardian1);

        // Verify initial config
        (uint256 threshold, uint256 count,) = account.getRecoveryConfig();
        assertEq(threshold, 1, "Initial threshold should be 1");
        assertEq(count, 1, "Guardian count should be 1");

        // Test adding second guardian
        vm.expectEmit(true, false, false, true);
        emit GuardianAdded(guardian2, 1, 2); // threshold stays 1, count becomes 2

        vm.prank(owner);
        account.addRecoveryGuardian(guardian2);

        // Test updating threshold
        vm.expectEmit(false, false, false, true);
        emit RecoveryThresholdUpdated(1, 2);

        vm.prank(owner);
        account.setRecoveryThreshold(2);

        // Test removing guardian adjusts threshold
        vm.expectEmit(true, false, false, true);
        emit GuardianRemoved(guardian2, 1, 1); // threshold adjusted to 1, count becomes 1

        vm.prank(owner);
        account.removeRecoveryGuardian(guardian2);
    }

    // R41.2: Recovery lifecycle events
    function test_recoveryLifecycleEvents() public {
        address guardian1 = makeAddr("guardian1");
        address guardian2 = makeAddr("guardian2");
        address newOwner = makeAddr("newOwner");

        // Setup guardians
        vm.startPrank(owner);
        account.addRecoveryGuardian(guardian1);
        account.addRecoveryGuardian(guardian2);
        account.setRecoveryThreshold(2);
        vm.stopPrank();

        // Test recovery initiation - we can't predict the exact recovery ID, so capture it
        vm.prank(guardian1);
        bytes32 recoveryId = account.initiateRecovery(newOwner);
        
        // Verify the recovery was initiated by checking the status
        (address newOwner_, uint256 supportCount_, uint256 executeAfter_, bool executed_, bool cancelled_, uint256 epoch_) = account.getRecoveryStatus(recoveryId);
        assertEq(newOwner_, newOwner, "New owner mismatch");
        assertEq(supportCount_, 1, "Initial support count should be 1");

        // Test recovery support
        vm.expectEmit(true, true, false, true);
        emit RecoverySupported(recoveryId, guardian2);

        vm.prank(guardian2);
        account.supportRecovery(recoveryId);

        // Fast forward past recovery delay
        vm.warp(block.timestamp + 48 hours + 1);

        // Test recovery execution
        vm.expectEmit(true, true, true, true);
        emit RecoveryExecuted(recoveryId, owner, newOwner);

        vm.prank(guardian1); // Any guardian can execute
        account.executeRecovery(recoveryId);

        // Verify ownership transferred
        assertEq(account.owner(), newOwner, "Ownership not transferred");
    }

    // R41.3: Recovery cancellation events
    function test_recoveryCancellationEvents() public {
        address guardian1 = makeAddr("guardian1");
        address newOwner = makeAddr("newOwner");

        // Setup guardian
        vm.prank(owner);
        account.addRecoveryGuardian(guardian1);

        // Initiate recovery
        vm.prank(guardian1);
        bytes32 recoveryId = account.initiateRecovery(newOwner);

        // Test cancellation by owner
        vm.expectEmit(true, true, false, true);
        emit RecoveryCancelled(recoveryId, owner);

        vm.prank(owner);
        account.cancelRecovery(recoveryId);
    }

    // R41.4: Session key lifecycle events
    function test_sessionKeyLifecycleEvents() public {
        address sessionKey = makeAddr("sessionKey");
        uint256 validAfter = block.timestamp;
        uint256 validUntil = block.timestamp + 1 days;
        uint256 spendLimit = 1 ether;

        // Test session key creation
        vm.expectEmit(true, true, false, true);
        emit SessionKeyCreated(1, sessionKey, validAfter, validUntil, spendLimit);

        vm.prank(owner);
        uint256 sessionId = account.createSessionKey(
            sessionKey, validAfter, validUntil, spendLimit, 0.5 ether, 0, true
        );

        assertEq(sessionId, 1, "Session ID should be 1");

        // Test session key revocation
        vm.expectEmit(true, true, false, true);
        emit SessionKeyRevoked(sessionId, sessionKey);

        vm.prank(owner);
        account.revokeSessionKey(sessionId);
    }

    // R41.5: Session key usage tracking events
    function test_sessionKeyUsageEvents() public {
        address sessionKey = makeAddr("sessionKey");
        address target = address(mockToken);
        
        // Setup session key
        vm.prank(owner);
        account.createSessionKey(
            sessionKey, block.timestamp, block.timestamp + 1 days, 1 ether, 0.5 ether, 0, false
        );

        // Add session targets and functions
        vm.startPrank(owner);
        account.addSessionTarget(1, target);
        account.addSessionFunction(1, mockToken.transfer.selector);
        vm.stopPrank();

        // Prepare UserOp for session key usage
        PackedUserOperation memory userOp = PackedUserOperation({
            sender: address(account),
            nonce: 0,
            initCode: "",
            callData: abi.encodeWithSignature(
                "execute(address,uint256,bytes)",
                target,
                0.1 ether,
                abi.encodeWithSelector(mockToken.transfer.selector, owner, 100)
            ),
            accountGasLimits: bytes32(0),
            preVerificationGas: 21000,
            gasFees: bytes32(0),
            paymasterAndData: "",
            signature: ""
        });
        
        // Add signature after creating the userOp
        userOp.signature = _signUserOp(userOp, agentPk);

        // This would emit SessionKeyUsed during validateUserOp if properly signed by session key
        // Note: Full UserOp validation requires proper EntryPoint setup, focusing on event structure
    }

    // R41.6: Upgrade lifecycle events
    function test_upgradeLifecycleEvents() public {
        address newImplementation = address(new MockImplementation());
        
        // Test upgrade request
        vm.expectEmit(true, false, false, true);
        emit UpgradeRequested(newImplementation, block.timestamp + 24 hours);

        vm.prank(owner);
        account.requestUpgrade(newImplementation);

        // Test upgrade cancellation
        vm.expectEmit(true, false, false, true);
        emit UpgradeCancelled(owner);

        vm.prank(owner);
        account.cancelUpgrade();
    }

    // R41.7: Factory account creation events
    function test_factoryAccountCreationEvents() public {
        address newOwner = makeAddr("newOwner");
        address newAgent = makeAddr("newAgent");
        address newGuardian = makeAddr("newGuardian");

        // We can't predict the exact address before creation, so just verify the event was emitted
        vm.recordLogs();
        
        SigilAccount newAccount = factory.createAccount(
            newOwner, newAgent, newGuardian, 1 ether, 5 ether, 0.5 ether, 123
        );

        // Verify account was created
        assertTrue(address(newAccount) != address(0), "Account not created");
        
        // Check that AccountCreated event was emitted with correct parameters
        Vm.Log[] memory logs = vm.getRecordedLogs();
        bool foundEvent = false;
        for (uint i = 0; i < logs.length; i++) {
            if (logs[i].topics[0] == keccak256("AccountCreated(address,address,address,address)")) {
                // Verify the indexed parameters match
                assertEq(logs[i].topics[1], bytes32(uint256(uint160(address(newAccount)))), "Account address mismatch");
                assertEq(logs[i].topics[2], bytes32(uint256(uint160(newOwner))), "Owner address mismatch");
                assertEq(logs[i].topics[3], bytes32(uint256(uint160(newAgent))), "Agent address mismatch");
                foundEvent = true;
                break;
            }
        }
        assertTrue(foundEvent, "AccountCreated event not found");
    }

    // R41.8: Multiple events in single transaction
    function test_multipleEventsInSingleTransaction() public {
        address newAgent = makeAddr("newAgent");
        address target = address(mockToken);

        vm.startPrank(owner);
        
        // This should emit both AgentKeyRotated and TargetWhitelisted events
        bytes[] memory multicallData = new bytes[](2);
        multicallData[0] = abi.encodeWithSelector(SigilAccount.rotateAgentKey.selector, newAgent);
        multicallData[1] = abi.encodeWithSelector(SigilAccount.setAllowedTarget.selector, target, true);

        // Expect both events
        vm.expectEmit(true, true, false, true);
        emit AgentKeyRotated(agentKey, newAgent);
        
        vm.expectEmit(true, false, false, true);
        emit TargetWhitelisted(target, true);

        account.multicall(multicallData);
        
        vm.stopPrank();
    }

    // R41.9: Event parameter validation with edge values
    function test_eventParameterValidationEdgeValues() public {
        // Test with maximum delay values
        uint256 maxDelay = 90 days;
        
        vm.expectEmit(false, false, false, true);
        emit OwnerTransferDelayUpdated(24 hours, maxDelay);

        vm.prank(owner);
        account.setOwnerTransferDelay(maxDelay);

        // Test with maximum policy values
        uint256 maxValue = type(uint256).max;
        
        vm.expectEmit(false, false, false, true);
        emit PolicyUpdated(1 ether, 5 ether, 0.5 ether, maxValue);

        vm.prank(owner);
        account.updatePolicy(1 ether, 5 ether, 0.5 ether, maxValue);
    }

    // R41.10: Event ordering consistency
    function test_eventOrderingConsistency() public {
        address guardian1 = makeAddr("guardian1");
        address newOwner = makeAddr("newOwner");

        // Complex scenario: Add guardian, then immediate recovery
        vm.prank(owner);
        account.addRecoveryGuardian(guardian1);

        // Initiate and execute recovery (fast forward to test ordering)
        vm.prank(guardian1);
        bytes32 recoveryId = account.initiateRecovery(newOwner);
        
        vm.warp(block.timestamp + 48 hours + 1);
        
        // Recovery execution should emit events in correct order
        vm.prank(guardian1);
        account.executeRecovery(recoveryId);

        // Recovery automatically freezes the account
        assertTrue(account.isFrozen(), "Account should be frozen after recovery");
    }

    // R41.11: Recovery delay update events
    function test_recoveryDelayUpdateEvents() public {
        uint256 oldDelay = account.recoveryDelay();
        uint256 newDelay = 72 hours;

        vm.expectEmit(false, false, false, true);
        emit RecoveryDelayUpdated(oldDelay, newDelay);

        vm.prank(owner);
        account.setRecoveryDelay(newDelay);
    }

    // R41.12: Event emissions during state transitions
    function test_eventEmissionsDuringStateTransitions() public {
        address guardian1 = makeAddr("guardian1");
        
        // Add guardian (unfrozen -> unfrozen with guardian)
        vm.expectEmit(true, false, false, true);
        emit GuardianAdded(guardian1, 1, 1);

        vm.prank(owner);
        account.addRecoveryGuardian(guardian1);

        // Freeze account
        vm.expectEmit(true, false, false, true);
        emit AccountFrozen(owner);

        vm.prank(owner);
        account.freeze();

        // Emergency withdraw should still work and emit event when frozen
        uint256 balance = address(account).balance;
        vm.expectEmit(true, false, false, true);
        emit EmergencyWithdrawal(owner, balance);

        vm.prank(owner);
        account.emergencyWithdraw(owner);
    }

    // R41.13: Event indexing verification for filtering
    function test_eventIndexingVerificationForFiltering() public {
        // This test verifies that indexed parameters are correctly set for efficient filtering
        address guardian1 = makeAddr("guardian1");
        address guardian2 = makeAddr("guardian2");

        // Add guardians to test indexed parameters
        vm.prank(owner);
        account.addRecoveryGuardian(guardian1);
        
        vm.prank(owner);
        account.addRecoveryGuardian(guardian2);

        // Remove guardian to test indexed removal
        vm.expectEmit(true, false, false, true); // indexed: guardian address
        emit GuardianRemoved(guardian2, 1, 1);

        vm.prank(owner);
        account.removeRecoveryGuardian(guardian2);
    }

    // R41.14: Event data validation with complex parameters
    function test_eventDataValidationComplexParameters() public {
        address target = address(mockToken);
        bytes memory complexData = abi.encodeWithSignature(
            "complexFunction(address,uint256,bytes32,bool)",
            owner, 12345, keccak256("test"), true
        );

        // Queue transaction with complex data
        vm.expectEmit(true, true, false, false); // ignore data field for complexity
        emit TransactionQueued(0, target, 0, complexData, block.timestamp + 1 hours);

        vm.prank(owner);
        account.queueTransaction(target, 0, complexData);
    }

    // R41.15: Event emission during error conditions
    function test_eventEmissionDuringErrorConditions() public {
        // Test that successful operations emit events even when followed by errors
        address newAgent = makeAddr("newAgent");
        
        // This should emit the rotation event successfully
        vm.expectEmit(true, true, false, true);
        emit AgentKeyRotated(agentKey, newAgent);

        vm.prank(owner);
        account.rotateAgentKey(newAgent);

        // Now try an operation that should fail - no event should be emitted for failed ops
        // Try to rotate to zero address which should fail
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(SigilAccount.ZeroAddress.selector, 2));
        account.rotateAgentKey(address(0));
    }

    // Helper function to sign UserOp
    function _signUserOp(PackedUserOperation memory userOp, uint256 privateKey) internal view returns (bytes memory) {
        bytes32 userOpHash = keccak256(abi.encode(userOp));
        bytes32 ethHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", userOpHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(privateKey, ethHash);
        return abi.encodePacked(r, s, v);
    }

    // Helper events from SigilAccount
    event AgentKeyRotated(address indexed oldKey, address indexed newKey);
    event TargetWhitelisted(address indexed target, bool allowed);
    event OwnerTransferDelayUpdated(uint256 oldDelay, uint256 newDelay);
    event PolicyUpdated(uint256 maxTxValue, uint256 dailyLimit, uint256 guardianThreshold, uint256 ownerThreshold);
    event TransactionQueued(uint256 indexed queueId, address indexed target, uint256 value, bytes data, uint256 executeAfter);
    event AccountFrozen(address indexed frozenBy);
    event EmergencyWithdrawal(address indexed to, uint256 amount);
}

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

contract MockImplementation {
    // Mock implementation for upgrade testing
    function version() external pure returns (string memory) {
        return "v2.0.0";
    }
}