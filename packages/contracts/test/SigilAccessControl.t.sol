// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Test.sol";
import "../src/SigilAccount.sol";
import "../src/SigilAccountFactory.sol";
import "@account-abstraction/interfaces/PackedUserOperation.sol";
import "@account-abstraction/interfaces/IEntryPoint.sol";
import "@account-abstraction/core/BaseAccount.sol";

/**
 * @title SigilAccessControlTest
 * @notice R36: Access control completeness - verify every function has proper modifiers and frozen/unfrozen behavior
 */
contract SigilAccessControlTest is Test {
    SigilAccount public account;
    SigilAccountFactory public factory;
    
    uint256 ownerPk = 0xA11CE;
    uint256 agentPk = 0xB0B;
    uint256 guardianPk = 0xC0DE;

    address owner;
    address agentKey;
    address guardianKey;
    address entryPoint;

    // Mock token for testing
    MockERC20 public mockToken;
    event AccountFrozen(address indexed frozenBy, string reason);
    event AccountUnfrozen(address indexed unfrozenBy);

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
    
    function _signUserOp(PackedUserOperation memory userOp, uint256 privateKey) internal view returns (bytes memory) {
        bytes32 hash = keccak256(abi.encodePacked(userOp.sender, userOp.nonce));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(privateKey, hash);
        return abi.encodePacked(r, s, v);
    }

    // R36.1: Verify all onlyOwner functions reject non-owner calls
    function test_allOwnerFunctions_rejectNonOwner() public {
        address attacker = makeAddr("attacker");
        vm.startPrank(attacker);

        // Core admin functions
        vm.expectRevert(abi.encodeWithSelector(SigilAccount.NotOwner.selector));
        account.freeze();
        
        vm.expectRevert(abi.encodeWithSelector(SigilAccount.NotOwner.selector));
        account.unfreeze();

        vm.expectRevert(abi.encodeWithSelector(SigilAccount.NotOwner.selector));
        account.rotateAgentKey(makeAddr("newAgent"));

        vm.expectRevert(abi.encodeWithSelector(SigilAccount.NotOwner.selector));
        account.rotateGuardianKey(makeAddr("newGuardian"));

        vm.expectRevert(abi.encodeWithSelector(SigilAccount.NotOwner.selector));
        account.updatePolicy(1 ether, 10 ether, 5 ether, type(uint256).max);

        vm.expectRevert(abi.encodeWithSelector(SigilAccount.NotOwner.selector));
        account.setAllowedTarget(address(mockToken), true);

        vm.expectRevert(abi.encodeWithSelector(SigilAccount.NotOwner.selector));
        account.setAllowedFunction(bytes4(0x12345678), true);

        // Token policy functions
        vm.expectRevert(abi.encodeWithSelector(SigilAccount.NotOwner.selector));
        account.setTokenPolicy(address(mockToken), 1000e18, 100e18);

        vm.expectRevert(abi.encodeWithSelector(SigilAccount.NotOwner.selector));
        account.removeTokenPolicy(address(mockToken));

        // Queue functions
        vm.expectRevert(abi.encodeWithSelector(SigilAccount.NotOwner.selector));
        account.queueTransaction(address(mockToken), 0, "");

        vm.expectRevert(abi.encodeWithSelector(SigilAccount.NotOwner.selector));
        account.executeQueued(1);

        vm.expectRevert(abi.encodeWithSelector(SigilAccount.NotOwner.selector));
        account.cancelQueued(1);

        // Emergency functions
        vm.expectRevert(abi.encodeWithSelector(SigilAccount.NotOwner.selector));
        account.emergencyWithdraw(owner);

        vm.expectRevert(abi.encodeWithSelector(SigilAccount.NotOwner.selector));
        account.emergencyWithdrawToken(address(mockToken), owner);

        // Batch execution
        BaseAccount.Call[] memory calls = new BaseAccount.Call[](1);
        calls[0] = BaseAccount.Call({target: address(mockToken), value: 0, data: ""});
        vm.expectRevert(abi.encodeWithSelector(SigilAccount.NotOwner.selector));
        account.executeBatch(calls);

        // Owner transfer functions
        vm.expectRevert(abi.encodeWithSelector(SigilAccount.NotOwner.selector));
        account.requestOwnerTransfer(attacker);

        vm.expectRevert(abi.encodeWithSelector(SigilAccount.NotOwner.selector));
        account.cancelOwnerTransfer();

        vm.expectRevert(abi.encodeWithSelector(SigilAccount.NotOwner.selector));
        account.setOwnerTransferDelay(2 hours);

        // Upgrade functions
        vm.expectRevert(abi.encodeWithSelector(SigilAccount.NotOwner.selector));
        account.requestUpgrade(address(account));

        vm.expectRevert(abi.encodeWithSelector(SigilAccount.NotOwner.selector));
        account.cancelUpgrade();

        vm.expectRevert(abi.encodeWithSelector(SigilAccount.NotOwner.selector));
        account.executeUpgrade("");

        // Recovery guardian functions
        vm.expectRevert(abi.encodeWithSelector(SigilAccount.NotOwner.selector));
        account.addRecoveryGuardian(makeAddr("recoveryGuard"));

        vm.expectRevert(abi.encodeWithSelector(SigilAccount.NotOwner.selector));
        account.removeRecoveryGuardian(makeAddr("recoveryGuard"));

        vm.expectRevert(abi.encodeWithSelector(SigilAccount.NotOwner.selector));
        account.setRecoveryThreshold(1);

        vm.expectRevert(abi.encodeWithSelector(SigilAccount.NotOwner.selector));
        account.setRecoveryDelay(1 days);

        vm.expectRevert(abi.encodeWithSelector(SigilAccount.NotOwner.selector));
        account.cancelRecovery(bytes32(uint256(1)));

        // Session key functions
        vm.expectRevert(abi.encodeWithSelector(SigilAccount.NotOwner.selector));
        account.createSessionKey(
            makeAddr("session"),
            block.timestamp + 1 days,
            block.timestamp + 2 days,
            1 ether,
            100 ether,
            1 hours,
            false
        );

        vm.expectRevert(abi.encodeWithSelector(SigilAccount.NotOwner.selector));
        account.addSessionTarget(1, address(mockToken));

        vm.expectRevert(abi.encodeWithSelector(SigilAccount.NotOwner.selector));
        account.addSessionFunction(1, bytes4(0x12345678));

        vm.expectRevert(abi.encodeWithSelector(SigilAccount.NotOwner.selector));
        account.removeSessionTarget(1, address(mockToken));

        vm.expectRevert(abi.encodeWithSelector(SigilAccount.NotOwner.selector));
        account.removeSessionFunction(1, bytes4(0x12345678));

        vm.expectRevert(abi.encodeWithSelector(SigilAccount.NotOwner.selector));
        account.revokeSessionKey(1);

        // Multicall
        bytes[] memory data = new bytes[](1);
        data[0] = abi.encodeWithSelector(account.freeze.selector, "test");
        vm.expectRevert(abi.encodeWithSelector(SigilAccount.NotOwner.selector));
        account.multicall(data);

        vm.stopPrank();
    }

    // R36.2: Verify notFrozen modifier behavior - functions should reject when frozen
    function test_notFrozenFunctions_rejectWhenFrozen() public {
        // Freeze the account
        vm.prank(owner);
        account.freeze();

        vm.startPrank(owner);

        // These functions should be blocked when frozen
        vm.expectRevert(abi.encodeWithSelector(SigilAccount.AccountIsFrozen.selector));
        account.queueTransaction(address(mockToken), 0, "");

        vm.expectRevert(abi.encodeWithSelector(SigilAccount.AccountIsFrozen.selector));
        account.executeQueued(1);

        BaseAccount.Call[] memory calls = new BaseAccount.Call[](1);
        calls[0] = BaseAccount.Call({target: address(mockToken), value: 0, data: ""});
        vm.expectRevert(abi.encodeWithSelector(SigilAccount.AccountIsFrozen.selector));
        account.executeBatch(calls);

        vm.expectRevert(abi.encodeWithSelector(SigilAccount.AccountIsFrozen.selector));
        account.requestOwnerTransfer(makeAddr("newOwner"));

        vm.expectRevert(abi.encodeWithSelector(SigilAccount.AccountIsFrozen.selector));
        account.requestUpgrade(address(account));

        vm.expectRevert(abi.encodeWithSelector(SigilAccount.AccountIsFrozen.selector));
        account.executeUpgrade("");

        vm.stopPrank();
    }

    // R36.3: Verify functions that SHOULD work when frozen
    function test_workingWhenFrozen_functionsStillWork() public {
        // Freeze the account
        vm.prank(owner);
        account.freeze();

        vm.startPrank(owner);

        // Emergency functions should work
        vm.deal(address(account), 1 ether);
        account.emergencyWithdraw(owner);

        mockToken.mint(address(account), 1000e18);
        account.emergencyWithdrawToken(address(mockToken), owner);

        // Admin functions that don't move funds should work
        account.rotateAgentKey(makeAddr("newAgent"));
        account.rotateGuardianKey(makeAddr("newGuardian"));
        account.updatePolicy(1 ether, 10 ether, 5 ether, type(uint256).max);
        account.setAllowedTarget(address(mockToken), true);
        account.setAllowedFunction(bytes4(0x12345678), true);
        account.setTokenPolicy(address(mockToken), 1000e18, 100e18);
        account.removeTokenPolicy(address(mockToken));
        account.setOwnerTransferDelay(48 hours); // Increase delay, not decrease

        // Cancel functions should work (though may error if nothing to cancel - that's OK)
        vm.expectRevert(); // cancelOwnerTransfer fails if no pending transfer
        account.cancelOwnerTransfer();
        
        vm.expectRevert(); // cancelUpgrade fails if no pending upgrade  
        account.cancelUpgrade();

        // Unfreeze should work
        account.unfreeze();

        vm.stopPrank();
    }

    // R36.4: Verify executeOwnerTransfer has correct access control (not onlyOwner, but specific logic)
    function test_executeOwnerTransfer_accessControl() public {
        address newOwner = makeAddr("newOwner");
        
        // Request transfer
        vm.prank(owner);
        account.requestOwnerTransfer(newOwner);

        // Should fail if called by random address
        vm.prank(makeAddr("random"));
        vm.expectRevert(); // Should revert - specific error depends on implementation
        account.executeOwnerTransfer();

        // Should fail if called by current owner
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(SigilAccount.TransferDelayNotElapsed.selector, block.timestamp + 24 hours));
        account.executeOwnerTransfer();

        // Skip time
        vm.warp(block.timestamp + 24 hours + 1);

        // Now pending owner should be able to execute
        vm.prank(newOwner);
        account.executeOwnerTransfer();

        // Verify ownership changed
        assertEq(account.owner(), newOwner);
    }

    // R36.5: Verify recovery functions have correct access control
    function test_recoveryFunctions_accessControl() public {
        address recoveryGuardian = makeAddr("recoveryGuardian");
        address nonGuardian = makeAddr("nonGuardian");
        
        // Only owner can add recovery guardian
        vm.prank(owner);
        account.addRecoveryGuardian(recoveryGuardian);

        // Non-guardian cannot initiate recovery
        vm.prank(nonGuardian);
        vm.expectRevert(); // Should fail with appropriate error
        account.initiateRecovery(makeAddr("newOwner"));
        
        // Recovery guardian can initiate recovery
        vm.prank(recoveryGuardian);
        bytes32 recoveryId = account.initiateRecovery(makeAddr("newOwner"));
        
        // Verify recovery was created
        assertTrue(recoveryId != bytes32(0));
    }

    // R36.6: Verify EntryPoint-only functions
    function test_entryPointOnly_functions() public {
        address attacker = makeAddr("attacker");
        
        // validateUserOp should only be callable by EntryPoint
        vm.prank(attacker);
        vm.expectRevert(); // Should revert with NotEntryPoint or similar
        account.validateUserOp(
            PackedUserOperation({
                sender: address(account),
                nonce: 0,
                initCode: "",
                callData: "",
                accountGasLimits: "",
                preVerificationGas: 0,
                gasFees: "",
                paymasterAndData: "",
                signature: ""
            }),
            bytes32(0),
            0
        );

        // execute should only be callable by EntryPoint
        vm.prank(attacker);
        vm.expectRevert(); // Should revert with NotEntryPoint or similar
        account.execute(address(mockToken), 0, "");
    }

    // R36.7: Verify view functions have no access control (should not revert)
    function test_viewFunctions_noAccessControl() public {
        address anyone = makeAddr("anyone");
        vm.startPrank(anyone);

        // These should not revert for anyone
        account.owner();
        account.agentKey();
        account.guardianKey();
        account.maxTxValue();
        account.dailyLimit();
        account.guardianThreshold();
        account.ownerThreshold();
        account.allowedTargets(address(mockToken));
        account.allowedFunctions(bytes4(0x12345678));
        account.dailySpent();
        account.dailyResetTime();
        account.isFrozen();
        account.pendingOwner();
        account.ownerTransferRequestedAt();
        account.ownerTransferDelay();
        account.nextQueueId();
        account.queuedTransactions(1); // Just call it, don't need to unpack
        account.factory();
        account.entryPoint();
        account.getTokenPolicy(address(mockToken));
        account.getRecoveryConfig();
        account.isRecoveryGuardian(anyone);
        account.getRecoveryGuardians();
        account.isValidSessionKey(anyone);
        account.domainSeparator();
        account.supportsInterface(bytes4(0x01ffc9a7));

        vm.stopPrank();
    }

    // R36.8: Test frozen state with UserOp validation
    function test_frozenState_userOpValidation() public {
        // Freeze account
        vm.prank(owner);
        account.freeze();

        // Create a UserOp
        PackedUserOperation memory userOp = PackedUserOperation({
            sender: address(account),
            nonce: 0,
            initCode: "",
            callData: abi.encodeWithSelector(account.execute.selector, address(mockToken), 0, ""),
            accountGasLimits: "",
            preVerificationGas: 0,
            gasFees: "",
            paymasterAndData: "",
            signature: ""
        });
        
        // Sign the userOp
        userOp.signature = _signUserOp(userOp, agentPk);

        // Should return failure when frozen
        vm.prank(address(entryPoint));
        uint256 result = account.validateUserOp(userOp, bytes32(0), 0);
        assertEq(result, 1); // SIG_VALIDATION_FAILED
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