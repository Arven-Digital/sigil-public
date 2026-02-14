// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Test.sol";
import "../src/SigilAccount.sol";
import "../src/SigilAccountFactory.sol";
import "@account-abstraction/interfaces/IEntryPoint.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockToken is ERC20 {
    constructor() ERC20("Mock", "MCK") {
        _mint(msg.sender, 1_000_000 ether);
    }
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract MockEntryPoint2 {
    function getNonce(address, uint192) external pure returns (uint256) { return 0; }
}

contract SigilTokenPolicyTest is Test {
    SigilAccountFactory factory;
    SigilAccount account;
    MockEntryPoint2 mockEP;
    MockToken token;

    uint256 ownerKey = 0x1;
    address ownerAddr;

    function setUp() public {
        ownerAddr = vm.addr(ownerKey);
        mockEP = new MockEntryPoint2();
        factory = new SigilAccountFactory(IEntryPoint(address(mockEP)), address(this), 0);
        account = factory.createAccount(
            ownerAddr, vm.addr(0x2), vm.addr(0x3),
            1 ether, 10 ether, 0.5 ether, 0
        );
        token = new MockToken();
        token.mint(address(account), 100 ether);
    }

    function test_setTokenPolicy() public {
        vm.prank(ownerAddr);
        account.setTokenPolicy(address(token), 10 ether, 50 ether);
        (uint256 maxApproval, uint256 dailyLimit, uint256 transferred, bool exists) = account.getTokenPolicy(address(token));
        assertEq(maxApproval, 10 ether);
        assertEq(dailyLimit, 50 ether);
        assertEq(transferred, 0);
        assertTrue(exists);
    }

    function test_setTokenPolicy_nonOwnerReverts() public {
        vm.prank(vm.addr(0x2));
        vm.expectRevert();
        account.setTokenPolicy(address(token), 10 ether, 50 ether);
    }

    function test_setTokenPolicy_zeroAddressReverts() public {
        vm.prank(ownerAddr);
        vm.expectRevert();
        account.setTokenPolicy(address(0), 10 ether, 50 ether);
    }

    function test_removeTokenPolicy() public {
        vm.startPrank(ownerAddr);
        account.setTokenPolicy(address(token), 10 ether, 50 ether);
        account.removeTokenPolicy(address(token));
        (,,, bool exists) = account.getTokenPolicy(address(token));
        assertFalse(exists);
        vm.stopPrank();
    }

    function test_removeTokenPolicy_nonOwnerReverts() public {
        vm.prank(ownerAddr);
        account.setTokenPolicy(address(token), 10 ether, 50 ether);
        vm.prank(vm.addr(0x2));
        vm.expectRevert();
        account.removeTokenPolicy(address(token));
    }

    function test_getTokenPolicy_nonExistent() public view {
        (uint256 maxApproval, uint256 dailyLimit, uint256 transferred, bool exists) = account.getTokenPolicy(address(0xBEEF));
        assertEq(maxApproval, 0);
        assertEq(dailyLimit, 0);
        assertEq(transferred, 0);
        assertFalse(exists);
    }

    function test_setTokenPolicy_overwrite() public {
        vm.startPrank(ownerAddr);
        account.setTokenPolicy(address(token), 10 ether, 50 ether);
        account.setTokenPolicy(address(token), 20 ether, 100 ether);
        (uint256 maxApproval, uint256 dailyLimit,,) = account.getTokenPolicy(address(token));
        assertEq(maxApproval, 20 ether);
        assertEq(dailyLimit, 100 ether);
        vm.stopPrank();
    }

    function test_setTokenPolicy_zeroMaxApproval_blocksAllApprovals() public {
        vm.prank(ownerAddr);
        account.setTokenPolicy(address(token), 0, 50 ether);
        (uint256 maxApproval,,,) = account.getTokenPolicy(address(token));
        assertEq(maxApproval, 0);
    }

    function test_setTokenPolicy_zeroDailyLimit_meansUnlimited() public {
        vm.prank(ownerAddr);
        account.setTokenPolicy(address(token), 10 ether, 0);
        (,uint256 dailyLimit,,) = account.getTokenPolicy(address(token));
        assertEq(dailyLimit, 0); // 0 = unlimited
    }

    function test_multicall_setMultipleTokenPolicies() public {
        MockToken token2 = new MockToken();
        bytes[] memory calls = new bytes[](2);
        calls[0] = abi.encodeCall(account.setTokenPolicy, (address(token), 5 ether, 25 ether));
        calls[1] = abi.encodeCall(account.setTokenPolicy, (address(token2), 10 ether, 50 ether));

        vm.prank(ownerAddr);
        account.multicall(calls);

        (uint256 max1,,, bool e1) = account.getTokenPolicy(address(token));
        (uint256 max2,,, bool e2) = account.getTokenPolicy(address(token2));
        assertEq(max1, 5 ether);
        assertEq(max2, 10 ether);
        assertTrue(e1);
        assertTrue(e2);
    }
}
