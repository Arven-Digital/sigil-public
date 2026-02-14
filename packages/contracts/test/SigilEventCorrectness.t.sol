// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Test.sol";
import "../src/SigilAccount.sol";
import "../src/SigilAccountFactory.sol";
import "@account-abstraction/interfaces/PackedUserOperation.sol";
import "@account-abstraction/interfaces/IEntryPoint.sol";
import "@account-abstraction/core/BaseAccount.sol";

/**
 * @title SigilEventCorrectnessTest
 * @notice R39: Event correctness - verify every state change emits appropriate events with correct parameters
 */
contract SigilEventCorrectnessTest is Test {
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

    // All events from the contracts
    event AccountInitialized(address indexed owner, address indexed agentKey, address indexed guardianKey);
    event PolicyUpdated(uint256 maxTxValue, uint256 dailyLimit, uint256 guardianThreshold, uint256 ownerThreshold);
    event AgentKeyRotated(address indexed oldKey, address indexed newKey);
    event GuardianKeyRotated(address indexed oldKey, address indexed newKey);
    event AccountFrozen(address indexed frozenBy);
    event AccountUnfrozen(address indexed unfrozenBy);
    event TargetWhitelisted(address indexed target, bool allowed);
    event FunctionWhitelisted(bytes4 indexed selector, bool allowed);
    event TransactionQueued(uint256 indexed queueId, address indexed target, uint256 value, bytes data, uint256 executeAfter);
    event TransactionExecuted(uint256 indexed queueId, address indexed target, uint256 value);
    event TransactionCancelled(uint256 indexed queueId);
    event EmergencyWithdrawal(address indexed to, uint256 amount);
    event EmergencyTokenWithdrawal(address indexed token, address indexed to, uint256 amount);
    event Deposited(address indexed from, uint256 amount);
    event TokenPolicySet(address indexed token, uint256 maxApproval, uint256 dailyTransferLimit);
    event TokenPolicyRemoved(address indexed token);
    event OwnerTransferRequested(address indexed currentOwner, address indexed newOwner, uint256 executeAfter);
    event OwnerTransferExecuted(address indexed oldOwner, address indexed newOwner);
    event OwnerTransferCancelled(address indexed owner);
    event OwnerTransferDelayUpdated(uint256 oldDelay, uint256 newDelay);

    function setUp() public {
        owner = vm.addr(ownerPk);
        agentKey = vm.addr(agentPk);
        guardianKey = vm.addr(guardianPk);
        
        entryPoint = address(new MockEntryPoint());
        factory = new SigilAccountFactory(IEntryPoint(entryPoint), owner, 0);
        
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

    // R39.1: Test policy update events
    function test_policyUpdateEvents() public {
        uint256 newMaxTx = 2 ether;
        uint256 newDailyLimit = 10 ether;
        uint256 newGuardianThreshold = 1 ether;
        uint256 newOwnerThreshold = type(uint256).max;

        // Expect the PolicyUpdated event
        vm.expectEmit(true, true, true, true);
        emit PolicyUpdated(newMaxTx, newDailyLimit, newGuardianThreshold, newOwnerThreshold);

        vm.prank(owner);
        account.updatePolicy(newMaxTx, newDailyLimit, newGuardianThreshold, newOwnerThreshold);
    }

    // R39.2: Test key rotation events
    function test_keyRotationEvents() public {
        address newAgentKey = makeAddr("newAgentKey");
        address newGuardianKey = makeAddr("newGuardianKey");

        // Test agent key rotation
        vm.expectEmit(true, true, false, true);
        emit AgentKeyRotated(agentKey, newAgentKey);

        vm.prank(owner);
        account.rotateAgentKey(newAgentKey);

        // Test guardian key rotation
        vm.expectEmit(true, true, false, true);
        emit GuardianKeyRotated(guardianKey, newGuardianKey);

        vm.prank(owner);
        account.rotateGuardianKey(newGuardianKey);
    }

    // R39.3: Test freeze/unfreeze events
    function test_freezeUnfreezeEvents() public {

        // Test freeze event
        vm.expectEmit(true, false, false, true);
        emit AccountFrozen(owner);

        vm.prank(owner);
        account.freeze();

        // Test unfreeze event
        vm.expectEmit(true, false, false, true);
        emit AccountUnfrozen(owner);

        vm.prank(owner);
        account.unfreeze();
    }

    // R39.4: Test whitelist events
    function test_whitelistEvents() public {
        address targetContract = address(mockToken);
        bytes4 functionSelector = bytes4(0x12345678);

        // Test target whitelist event
        vm.expectEmit(true, false, false, true);
        emit TargetWhitelisted(targetContract, true);

        vm.prank(owner);
        account.setAllowedTarget(targetContract, true);

        // Test function whitelist event
        vm.expectEmit(true, false, false, true);
        emit FunctionWhitelisted(functionSelector, true);

        vm.prank(owner);
        account.setAllowedFunction(functionSelector, true);

        // Test removing from whitelist
        vm.expectEmit(true, false, false, true);
        emit TargetWhitelisted(targetContract, false);

        vm.prank(owner);
        account.setAllowedTarget(targetContract, false);

        vm.expectEmit(true, false, false, true);
        emit FunctionWhitelisted(functionSelector, false);

        vm.prank(owner);
        account.setAllowedFunction(functionSelector, false);
    }

    // R39.5: Test transaction queue events
    function test_transactionQueueEvents() public {
        address target = address(mockToken);
        uint256 value = 0;
        bytes memory data = abi.encodeWithSignature("transfer(address,uint256)", owner, 100);
        uint256 expectedExecuteAfter = block.timestamp + 1 hours;

        // Setup mock token balance so transfer can succeed
        mockToken.mint(address(account), 1000);

        // Test queue event (first queue ID is 0)
        vm.expectEmit(true, true, false, true);
        emit TransactionQueued(0, target, value, data, expectedExecuteAfter);

        vm.prank(owner);
        uint256 queueId = account.queueTransaction(target, value, data);

        // Fast forward time and test execute event
        vm.warp(block.timestamp + 1 hours + 1);

        vm.expectEmit(true, true, false, true);
        emit TransactionExecuted(queueId, target, value);

        vm.prank(owner);
        account.executeQueued(queueId);
    }

    // R39.6: Test transaction cancellation events
    function test_transactionCancellationEvents() public {
        // Queue a transaction first
        vm.prank(owner);
        uint256 queueId = account.queueTransaction(address(mockToken), 0, "");

        // Test cancel event
        vm.expectEmit(true, false, false, true);
        emit TransactionCancelled(queueId);

        vm.prank(owner);
        account.cancelQueued(queueId);
    }

    // R39.7: Test emergency withdrawal events
    function test_emergencyWithdrawalEvents() public {
        address recipient = owner;
        uint256 expectedAmount = address(account).balance; // Emergency withdraw takes full balance

        // Test native token emergency withdrawal
        vm.expectEmit(true, false, false, true);
        emit EmergencyWithdrawal(recipient, expectedAmount);

        vm.prank(owner);
        account.emergencyWithdraw(recipient);

        // Test ERC20 emergency withdrawal (withdraws full balance)
        uint256 tokenMintAmount = 1000e18;
        mockToken.mint(address(account), tokenMintAmount);

        vm.expectEmit(true, true, false, true);
        emit EmergencyTokenWithdrawal(address(mockToken), recipient, tokenMintAmount);

        vm.prank(owner);
        account.emergencyWithdrawToken(address(mockToken), recipient);
    }

    // R39.8: Test deposit events
    function test_depositEvents() public {
        address depositor = makeAddr("depositor");
        uint256 depositAmount = 2 ether;

        vm.deal(depositor, depositAmount);

        // Test deposit event
        vm.expectEmit(true, false, false, true);
        emit Deposited(depositor, depositAmount);

        vm.prank(depositor);
        (bool success,) = address(account).call{value: depositAmount}("");
        require(success, "Deposit failed");
    }

    // R39.9: Test token policy events
    function test_tokenPolicyEvents() public {
        address token = address(mockToken);
        uint256 maxApproval = 1000e18;
        uint256 dailyTransferLimit = 100e18;

        // Test set token policy event
        vm.expectEmit(true, false, false, true);
        emit TokenPolicySet(token, maxApproval, dailyTransferLimit);

        vm.prank(owner);
        account.setTokenPolicy(token, maxApproval, dailyTransferLimit);

        // Test remove token policy event
        vm.expectEmit(true, false, false, false);
        emit TokenPolicyRemoved(token);

        vm.prank(owner);
        account.removeTokenPolicy(token);
    }

    // R39.10: Test owner transfer events
    function test_ownerTransferEvents() public {
        address newOwner = makeAddr("newOwner");
        uint256 expectedExecuteAfter = block.timestamp + 24 hours;

        // Test owner transfer request event
        vm.expectEmit(true, true, false, true);
        emit OwnerTransferRequested(owner, newOwner, expectedExecuteAfter);

        vm.prank(owner);
        account.requestOwnerTransfer(newOwner);

        // Test owner transfer execution event
        vm.warp(block.timestamp + 24 hours + 1);

        vm.expectEmit(true, true, false, true);
        emit OwnerTransferExecuted(owner, newOwner);

        vm.prank(newOwner);
        account.executeOwnerTransfer();
    }

    // R39.11: Test owner transfer cancellation event
    function test_ownerTransferCancellationEvent() public {
        address newOwner = makeAddr("newOwner");

        // Request a transfer first
        vm.prank(owner);
        account.requestOwnerTransfer(newOwner);

        // Test cancellation event
        vm.expectEmit(true, false, false, true);
        emit OwnerTransferCancelled(owner);

        vm.prank(owner);
        account.cancelOwnerTransfer();
    }

    // R39.12: Test owner transfer delay update event
    function test_ownerTransferDelayUpdateEvent() public {
        uint256 oldDelay = account.ownerTransferDelay();
        uint256 newDelay = 48 hours;

        // Test delay update event
        vm.expectEmit(false, false, false, true);
        emit OwnerTransferDelayUpdated(oldDelay, newDelay);

        vm.prank(owner);
        account.setOwnerTransferDelay(newDelay);
    }

    // R39.13: Test multiple state changes emit all expected events
    function test_multipleStateChangesEmitAllEvents() public {
        // This test ensures that complex operations emit ALL expected events
        // We need to test each operation individually to verify events

        address newAgent = makeAddr("newAgent");
        address target = address(mockToken);
        uint256 newDelay = 48 hours;

        vm.startPrank(owner);
        
        // Test first operation emits correct event
        vm.expectEmit(true, true, false, true);
        emit AgentKeyRotated(agentKey, newAgent);
        account.rotateAgentKey(newAgent);

        // Test second operation emits correct event
        vm.expectEmit(true, false, false, true);
        emit TargetWhitelisted(target, true);
        account.setAllowedTarget(target, true);

        // Test third operation emits correct event
        vm.expectEmit(false, false, false, true);
        emit OwnerTransferDelayUpdated(24 hours, newDelay);
        account.setOwnerTransferDelay(newDelay);
        
        vm.stopPrank();
    }

    // R39.14: Test events are emitted with correct indexed parameters
    function test_eventIndexingCorrectness() public {
        // This test specifically validates that indexed parameters are correct
        
        address newAgent = makeAddr("newAgent");
        
        // Check that both old and new keys are properly indexed
        vm.expectEmit(true, true, false, true);
        emit AgentKeyRotated(agentKey, newAgent); // Both should be indexed

        vm.prank(owner);
        account.rotateAgentKey(newAgent);

        // Test transaction queued with proper indexing (first queue ID is 0)
        vm.expectEmit(true, true, false, true);
        emit TransactionQueued(0, address(mockToken), 0, "", block.timestamp + 1 hours);

        vm.prank(owner);
        account.queueTransaction(address(mockToken), 0, "");
    }

    // R39.15: Test that failed operations don't emit events
    function test_failedOperationsDontEmitEvents() public {
        // Test that reverted operations don't emit events
        
        // This should revert and NOT emit PolicyUpdated
        vm.prank(owner);
        vm.expectRevert(); // maxTxValue > dailyLimit should fail
        account.updatePolicy(10 ether, 5 ether, 1 ether, type(uint256).max);

        // This should revert and NOT emit AgentKeyRotated
        vm.prank(makeAddr("notOwner"));
        vm.expectRevert(abi.encodeWithSelector(SigilAccount.NotOwner.selector));
        account.rotateAgentKey(makeAddr("newAgent"));

        // This should revert and NOT emit AccountFrozen
        vm.prank(makeAddr("notOwner"));
        vm.expectRevert(abi.encodeWithSelector(SigilAccount.NotOwner.selector));
        account.freeze();
    }
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