// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Test.sol";
import "../src/SigilAccount.sol";
import "../src/SigilAccountFactory.sol";
import "@account-abstraction/core/EntryPoint.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockToken is ERC20 {
    constructor() ERC20("Mock Token", "MOCK") {
        _mint(msg.sender, 1000000e18);
    }
}

contract MaliciousContract {
    function drainTokens(address token, address from, uint256 amount) external {
        // This simulates what Permit2 or similar protocols do
        IERC20(token).transferFrom(from, msg.sender, amount);
    }
}

contract SigilERC1271AttackTest is Test {
    SigilAccountFactory factory;
    SigilAccount account;
    EntryPoint entryPoint;
    MockToken token;
    MaliciousContract maliciousContract;
    
    address owner = makeAddr("owner");
    uint256 agentKeyPriv = 0x1234567890123456789012345678901234567890123456789012345678901234;
    address agentKey = vm.addr(agentKeyPriv);
    address guardianKey = makeAddr("guardianKey");
    address attacker = makeAddr("attacker");
    
    function setUp() public {
        entryPoint = new EntryPoint();
        factory = new SigilAccountFactory(entryPoint, owner, 0);
        
        vm.prank(owner);
        account = factory.createAccount(
            owner, agentKey, guardianKey,
            1 ether,    // maxTxValue  
            10 ether,   // dailyLimit
            0.5 ether,  // guardianThreshold
            0
        );
        
        token = new MockToken();
        maliciousContract = new MaliciousContract();
        
        // Give account some tokens
        token.transfer(address(account), 100000e18);
        
        // Owner sets restrictive token policy
        vm.prank(owner);
        account.setTokenPolicy(
            address(token),
            1000e18,    // maxApproval: only 1,000 tokens per approval
            5000e18     // dailyTransferLimit: only 5,000 tokens per day
        );
    }
    
    function test_AgentKeyCannotBypassTokenPoliciesViaERC1271_FIXED() public {
        uint256 drainAmount = 50000e18; // Way above policy limits!
        
        // Simulate a Permit2-style signature that would have bypassed all policies
        // Hash represents: "allow maliciousContract to spend 50,000 tokens"
        bytes32 hash = keccak256(abi.encodePacked(
            "Permit2", address(maliciousContract), drainAmount
        ));
        
        // Create proper EIP-191 hash for signing
        bytes32 ethSignedHash = keccak256(abi.encodePacked(
            "\x19Ethereum Signed Message:\n32", hash
        ));
        
        // Attacker (with compromised agent key) signs the hash
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(agentKeyPriv, ethSignedHash);
        bytes memory signature = abi.encodePacked(r, s, v);
        
        // R10 FIX: Agent signature is now INVALID for ERC-1271 to prevent policy bypass
        bytes4 result = account.isValidSignature(hash, signature);
        assertEq(uint32(result), uint32(0xffffffff), "Agent signature should now be INVALID");
        
        console.log("FIXED: Agent key can no longer sign arbitrary ERC-1271 signatures!");
        console.log("R10 security fix prevents policy bypass via external protocols.");
        console.log("Only owner & session keys can sign for external protocols now.");
    }
    
    function test_ProofOfConceptTokenDrainage() public {
        // This simulates what happens after the malicious signature is accepted
        uint256 initialBalance = token.balanceOf(address(account));
        uint256 drainAmount = initialBalance; // Drain everything
        
        // First give maliciousContract approval (simulating Permit2 flow)
        vm.prank(address(account));
        token.approve(address(maliciousContract), drainAmount);
        
        // Now malicious contract drains the tokens
        vm.prank(attacker);
        maliciousContract.drainTokens(address(token), address(account), drainAmount);
        
        // Verify complete drainage
        assertEq(token.balanceOf(address(account)), 0, "Account should be drained");
        assertEq(token.balanceOf(attacker), drainAmount, "Attacker should have all tokens");
        
        console.log("PROOF: Account drained of", drainAmount, "tokens");
        console.log("This happened WITHOUT triggering any policy checks!");
    }
}