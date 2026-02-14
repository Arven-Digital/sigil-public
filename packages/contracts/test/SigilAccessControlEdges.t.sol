// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Test.sol";
import "../src/SigilAccount.sol";
import "../src/SigilAccountFactory.sol";
import "@account-abstraction/interfaces/PackedUserOperation.sol";
import "@account-abstraction/interfaces/IEntryPoint.sol";
import "@account-abstraction/core/BaseAccount.sol";

/**
 * @title SigilAccessControlEdgesTest  
 * @notice R37: Access control edge cases - special scenarios, transitions, and boundary conditions
 */
contract SigilAccessControlEdgesTest is Test {
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

    // R37.1: Test access control during owner transfer process
    function test_accessControlDuringOwnerTransfer() public {
        address newOwner = makeAddr("newOwner");
        
        // Request transfer
        vm.prank(owner);
        account.requestOwnerTransfer(newOwner);
        
        // During pending transfer: 
        // - Current owner still has full control
        vm.prank(owner);
        account.freeze();
        
        vm.prank(owner);
        account.unfreeze();
        
        // - Pending owner cannot do owner functions yet
        vm.prank(newOwner);
        vm.expectRevert(abi.encodeWithSelector(SigilAccount.NotOwner.selector));
        account.freeze();
        
        // After transfer delay, execute transfer
        vm.warp(block.timestamp + 24 hours + 1);
        vm.prank(newOwner);
        account.executeOwnerTransfer();
        
        // Now newOwner has control, old owner does not
        vm.prank(newOwner);
        account.freeze();
        
        vm.prank(owner); // old owner
        vm.expectRevert(abi.encodeWithSelector(SigilAccount.NotOwner.selector));
        account.unfreeze();
        
        vm.prank(newOwner);
        account.unfreeze();
    }

    // R37.2: Test access control with multiple recovery guardians
    function test_accessControlWithMultipleRecoveryGuardians() public {
        address guardian1 = makeAddr("guardian1");
        address guardian2 = makeAddr("guardian2");
        address guardian3 = makeAddr("guardian3");
        address nonGuardian = makeAddr("nonGuardian");
        
        // Owner adds multiple guardians
        vm.startPrank(owner);
        account.addRecoveryGuardian(guardian1);
        account.addRecoveryGuardian(guardian2);
        account.addRecoveryGuardian(guardian3);
        account.setRecoveryThreshold(2); // Need 2 guardians to support
        vm.stopPrank();
        
        // Only guardians can initiate recovery
        vm.prank(nonGuardian);
        vm.expectRevert(); // Should fail
        account.initiateRecovery(makeAddr("newOwner"));
        
        // Guardian can initiate
        vm.prank(guardian1);
        bytes32 recoveryId = account.initiateRecovery(makeAddr("newOwner"));
        
        // Only guardians can support recovery
        vm.prank(nonGuardian);
        vm.expectRevert(); // Should fail
        account.supportRecovery(recoveryId);
        
        // Other guardians can support
        vm.prank(guardian2);
        account.supportRecovery(recoveryId);
        
        // Non-guardians cannot support
        vm.prank(nonGuardian);
        vm.expectRevert();
        account.supportRecovery(recoveryId);
    }

    // R37.3: Test access control when keys are rotated
    function test_accessControlAfterKeyRotation() public {
        address newAgent = makeAddr("newAgent");
        address newGuardian = makeAddr("newGuardian");
        address oldAgent = agentKey;
        address oldGuardian = guardianKey;
        
        // Cannot use current keys as session keys (collision)
        vm.prank(owner);
        vm.expectRevert(); // KeyCollision with current agentKey
        account.createSessionKey(
            agentKey,
            block.timestamp + 1 days,
            block.timestamp + 2 days, 
            1 ether,
            0.1 ether,
            0,
            false
        );
        
        // Rotate keys
        vm.prank(owner);
        account.rotateAgentKey(newAgent);
        
        vm.prank(owner);
        account.rotateGuardianKey(newGuardian);
        
        // After rotation, old keys are no longer "special" and can be used as session keys
        vm.prank(owner);
        uint256 sessionId1 = account.createSessionKey(
            oldAgent, // old agent key - now allowed
            block.timestamp + 1 days,
            block.timestamp + 2 days, 
            1 ether,
            0.1 ether,
            0,
            false
        );
        
        vm.prank(owner);
        uint256 sessionId2 = account.createSessionKey(
            oldGuardian, // old guardian key - now allowed
            block.timestamp + 1 days,
            block.timestamp + 2 days,
            1 ether, 
            0.1 ether,
            0,
            false
        );
        
        // Verify they were created successfully
        assertTrue(sessionId1 > 0);
        assertTrue(sessionId2 > 0);
        
        // But cannot use NEW current keys as session keys (collision)
        vm.prank(owner);
        vm.expectRevert(); // KeyCollision with current newAgent
        account.createSessionKey(
            newAgent,
            block.timestamp + 1 days,
            block.timestamp + 2 days,
            1 ether,
            0.1 ether,
            0,
            false
        );
        
        vm.prank(owner);
        vm.expectRevert(); // KeyCollision with current newGuardian
        account.createSessionKey(
            newGuardian,
            block.timestamp + 1 days,
            block.timestamp + 2 days,
            1 ether,
            0.1 ether,
            0,
            false
        );
    }

    // R37.4: Test access control edge cases with session keys
    function test_sessionKeyAccessControlEdgeCases() public {
        address sessionKeyAddr = makeAddr("sessionKey");
        
        // Create session key
        vm.prank(owner);
        uint256 sessionId = account.createSessionKey(
            sessionKeyAddr,
            block.timestamp,
            block.timestamp + 1 days,
            1 ether,
            0.1 ether, 
            0,
            false
        );
        
        // Non-owner cannot manage session key targets/functions
        vm.prank(makeAddr("attacker"));
        vm.expectRevert(abi.encodeWithSelector(SigilAccount.NotOwner.selector));
        account.addSessionTarget(sessionId, address(mockToken));
        
        vm.prank(makeAddr("attacker"));
        vm.expectRevert(abi.encodeWithSelector(SigilAccount.NotOwner.selector));
        account.addSessionFunction(sessionId, bytes4(0x12345678));
        
        vm.prank(makeAddr("attacker"));
        vm.expectRevert(abi.encodeWithSelector(SigilAccount.NotOwner.selector));
        account.revokeSessionKey(sessionId);
        
        // Owner can manage session keys
        vm.prank(owner);
        account.addSessionTarget(sessionId, address(mockToken));
        
        vm.prank(owner);
        account.addSessionFunction(sessionId, bytes4(0x12345678));
        
        // Test that session key cannot be same as critical keys
        vm.prank(owner);
        vm.expectRevert(); // KeyCollision
        account.createSessionKey(
            owner,
            block.timestamp + 1 days,
            block.timestamp + 2 days,
            1 ether,
            0.1 ether,
            0,
            false
        );
    }

    // R37.5: Test access control during freeze/unfreeze transitions
    function test_accessControlDuringFreezeTransitions() public {
        address attacker = makeAddr("attacker");
        
        // Only owner can freeze
        vm.prank(attacker);
        vm.expectRevert(abi.encodeWithSelector(SigilAccount.NotOwner.selector));
        account.freeze();
        
        // Owner freezes account
        vm.prank(owner);
        account.freeze();
        
        // Verify frozen state blocks certain operations
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(SigilAccount.AccountIsFrozen.selector));
        account.queueTransaction(address(mockToken), 0, "");
        
        // But allows others
        vm.prank(owner);
        account.rotateAgentKey(makeAddr("newAgent")); // Should work
        
        // Only owner can unfreeze
        vm.prank(attacker);
        vm.expectRevert(abi.encodeWithSelector(SigilAccount.NotOwner.selector));
        account.unfreeze();
        
        // Owner unfreezes
        vm.prank(owner);
        account.unfreeze();
        
        // Now operations work again
        vm.prank(owner);
        account.queueTransaction(address(mockToken), 0, ""); // Should work
    }

    // R37.6: Test access control with EntryPoint interactions
    function test_entryPointAccessControlEdgeCases() public {
        address attacker = makeAddr("attacker");
        
        // Only EntryPoint can call validateUserOp
        vm.prank(attacker);
        vm.expectRevert(); // Should revert - not from EntryPoint
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
        
        // Only EntryPoint can call execute
        vm.prank(attacker);
        vm.expectRevert(); // Should revert - not from EntryPoint
        account.execute(address(mockToken), 0, "");
        
        // executeBatch is NOT callable via EntryPoint (onlyOwner, not _requireForExecute)
        BaseAccount.Call[] memory calls = new BaseAccount.Call[](1);
        calls[0] = BaseAccount.Call({target: address(mockToken), value: 0, data: ""});
        
        vm.prank(entryPoint);
        vm.expectRevert(abi.encodeWithSelector(SigilAccount.NotOwner.selector));
        account.executeBatch(calls);
    }

    // R37.7: Test access control boundaries with upgrade process
    function test_upgradeAccessControlEdgeCases() public {
        MockImplementation newImpl = new MockImplementation();
        
        // Only owner can request upgrade
        vm.prank(makeAddr("attacker"));
        vm.expectRevert(abi.encodeWithSelector(SigilAccount.NotOwner.selector));
        account.requestUpgrade(address(newImpl));
        
        // Owner requests upgrade
        vm.prank(owner);
        account.requestUpgrade(address(newImpl));
        
        // Only owner can cancel upgrade  
        vm.prank(makeAddr("attacker"));
        vm.expectRevert(abi.encodeWithSelector(SigilAccount.NotOwner.selector));
        account.cancelUpgrade();
        
        // Only owner can execute upgrade (with guardian signature)
        vm.prank(makeAddr("attacker"));
        vm.expectRevert(abi.encodeWithSelector(SigilAccount.NotOwner.selector));
        account.executeUpgrade(""); // Invalid signature but should fail on access control first
    }

    // R37.8: Test access control with multicall edge cases
    function test_multicallAccessControlEdgeCases() public {
        bytes[] memory data = new bytes[](2);
        data[0] = abi.encodeWithSelector(account.freeze.selector, "test");
        data[1] = abi.encodeWithSelector(account.unfreeze.selector);
        
        // Only owner can call multicall
        vm.prank(makeAddr("attacker"));
        vm.expectRevert(abi.encodeWithSelector(SigilAccount.NotOwner.selector));
        account.multicall(data);
        
        // Owner can call multicall
        vm.prank(owner);
        account.multicall(data);
        
        // Multicall should block sensitive operations
        bytes[] memory blockedData = new bytes[](1);
        blockedData[0] = abi.encodeWithSelector(account.executeUpgrade.selector, "");
        
        vm.prank(owner);
        vm.expectRevert(); // Should block executeUpgrade
        account.multicall(blockedData);
    }

    // R37.9: Test factory access control edge cases
    function test_factoryAccessControlEdgeCases() public {
        // Only factory can initialize accounts
        SigilAccount newAccount = new SigilAccount(IEntryPoint(entryPoint), address(factory));
        
        vm.prank(makeAddr("attacker"));
        vm.expectRevert(); // Should fail - not from factory
        newAccount.initialize(owner, agentKey, guardianKey, 1 ether, 5 ether, 0.5 ether);
        
        vm.prank(makeAddr("attacker"));
        vm.expectRevert(); // Should fail - not from factory  
        newAccount.initializeWithDelay(owner, agentKey, guardianKey, 1 ether, 5 ether, 0.5 ether, 48 hours);
        
        // Cannot reinitialize existing account
        vm.prank(address(factory));
        vm.expectRevert(); // Should fail - already initialized
        account.initialize(makeAddr("newOwner"), makeAddr("newAgent"), makeAddr("newGuardian"), 1 ether, 5 ether, 0.5 ether);
    }

    // R37.10: Test access control inheritance after recovery
    function test_accessControlAfterRecovery() public {
        address recoveryGuardian = makeAddr("recoveryGuardian");
        address newOwner = makeAddr("newOwner");
        
        // Setup recovery
        vm.prank(owner);
        account.addRecoveryGuardian(recoveryGuardian);
        
        // Initiate and execute recovery
        vm.prank(recoveryGuardian);
        bytes32 recoveryId = account.initiateRecovery(newOwner);
        
        vm.warp(block.timestamp + 7 days + 1);
        vm.prank(makeAddr("executor"));
        account.executeRecovery(recoveryId);
        
        // Old owner should lose access
        vm.prank(owner); // old owner
        vm.expectRevert(abi.encodeWithSelector(SigilAccount.NotOwner.selector));
        account.freeze();
        
        // New owner should have access
        vm.prank(newOwner);
        account.freeze(); // Should work
        
        vm.prank(newOwner);
        account.unfreeze();
    }
}

contract MockImplementation {
    // Empty mock implementation for upgrade testing
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