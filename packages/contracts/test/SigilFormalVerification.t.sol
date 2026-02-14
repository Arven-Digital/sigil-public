// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Test.sol";
import "../src/SigilAccount.sol";
import "../src/SigilAccountFactory.sol";
import "@account-abstraction/interfaces/IEntryPoint.sol";
import "@account-abstraction/core/BaseAccount.sol";

/**
 * @title Halmos Formal Verification — SigilAccount Invariants
 * @notice Halmos doesn't support vm.expectRevert, vm.prank, vm.assume.
 *         Tests use try/catch and direct assert() for Halmos compatibility.
 *         Function names prefixed with `check_` are picked up by Halmos.
 */
contract SigilFormalVerification is Test {
    SigilAccountFactory factory;
    SigilAccount account;

    address constant OWNER = address(0x1111);
    address constant AGENT = address(0x2222);
    address constant GUARDIAN = address(0x3333);

    function setUp() public {
        address entryPointAddr = address(0x0000000071727De22E5E9d8BAf0edAc6f37da032);
        vm.etch(entryPointAddr, hex"00");

        factory = new SigilAccountFactory(
            IEntryPoint(entryPointAddr),
            address(0xEC0D6435fFA48E33cf39c56f21A0cCFB9b50Ad45),
            0.2 ether
        );

        vm.deal(address(this), 1 ether);
        account = SigilAccount(payable(
            factory.createAccount{value: 0.2 ether}(
                OWNER, AGENT, GUARDIAN,
                1 ether, 10 ether, 0.5 ether, 0
            )
        ));
    }

    // ═══════════════════════════════════════════════════════════════
    // INVARIANT 1: Three keys are always distinct
    // ═══════════════════════════════════════════════════════════════

    function check_threeKeysDistinct() public view {
        assert(account.owner() != account.agentKey());
        assert(account.owner() != account.guardianKey());
        assert(account.agentKey() != account.guardianKey());
        assert(account.owner() != address(0));
        assert(account.agentKey() != address(0));
        assert(account.guardianKey() != address(0));
    }

    function check_rotateAgentKeyDistinct(address newAgent) public {
        vm.assume(newAgent != address(0));
        vm.assume(newAgent != account.owner());
        vm.assume(newAgent != account.guardianKey());

        vm.prank(OWNER);
        account.rotateAgentKey(newAgent);

        assert(account.owner() != account.agentKey());
        assert(account.owner() != account.guardianKey());
        assert(account.agentKey() != account.guardianKey());
    }

    function check_rotateGuardianKeyDistinct(address newGuardian) public {
        vm.assume(newGuardian != address(0));
        vm.assume(newGuardian != account.owner());
        vm.assume(newGuardian != account.agentKey());

        vm.prank(OWNER);
        account.rotateGuardianKey(newGuardian);

        assert(account.owner() != account.agentKey());
        assert(account.owner() != account.guardianKey());
        assert(account.agentKey() != account.guardianKey());
    }

    // ═══════════════════════════════════════════════════════════════
    // INVARIANT 2: Frozen state blocks execution (try/catch pattern)
    // ═══════════════════════════════════════════════════════════════

    function check_frozenBlocksExecuteBatch() public {
        vm.prank(OWNER);
        account.freeze();
        assert(account.isFrozen());

        BaseAccount.Call[] memory calls = new BaseAccount.Call[](1);
        calls[0] = BaseAccount.Call(address(0x99), 0, "");

        vm.prank(OWNER);
        try account.executeBatch(calls) {
            assert(false); // must not succeed
        } catch {
            // expected revert — frozen
        }
    }

    function check_frozenBlocksQueue() public {
        vm.prank(OWNER);
        account.freeze();

        vm.prank(OWNER);
        try account.queueTransaction(address(0x99), 0, "") {
            assert(false);
        } catch {}
    }

    function check_frozenBlocksOwnerTransfer() public {
        vm.prank(OWNER);
        account.freeze();

        vm.prank(OWNER);
        try account.requestOwnerTransfer(address(0x99)) {
            assert(false);
        } catch {}
    }

    // ═══════════════════════════════════════════════════════════════
    // INVARIANT 3: Only owner can call owner-only functions
    // ═══════════════════════════════════════════════════════════════

    function check_nonOwnerCannotFreeze(address caller) public {
        vm.assume(caller != OWNER);
        vm.prank(caller);
        try account.freeze() {
            assert(false); // non-owner must not succeed
        } catch {}
    }

    function check_nonOwnerCannotUnfreeze(address caller) public {
        vm.prank(OWNER);
        account.freeze();

        vm.assume(caller != OWNER);
        vm.prank(caller);
        try account.unfreeze() {
            assert(false);
        } catch {}
    }

    function check_nonOwnerCannotRotateAgent(address caller) public {
        vm.assume(caller != OWNER);
        vm.prank(caller);
        try account.rotateAgentKey(address(0x9999)) {
            assert(false);
        } catch {}
    }

    function check_nonOwnerCannotRotateGuardian(address caller) public {
        vm.assume(caller != OWNER);
        vm.prank(caller);
        try account.rotateGuardianKey(address(0x9999)) {
            assert(false);
        } catch {}
    }

    function check_nonOwnerCannotEmergencyWithdraw(address caller) public {
        vm.assume(caller != OWNER);
        vm.prank(caller);
        try account.emergencyWithdraw(caller) {
            assert(false);
        } catch {}
    }

    function check_nonOwnerCannotExecuteBatch(address caller) public {
        vm.assume(caller != OWNER);
        BaseAccount.Call[] memory calls = new BaseAccount.Call[](0);
        vm.prank(caller);
        try account.executeBatch(calls) {
            assert(false);
        } catch {}
    }

    // ═══════════════════════════════════════════════════════════════
    // INVARIANT 4: Policy updates preserve valid ranges
    // ═══════════════════════════════════════════════════════════════

    function check_policyUpdateValid(
        uint256 maxTx, uint256 daily, uint256 guardianThresh, uint256 ownerThresh
    ) public {
        vm.prank(OWNER);
        try account.updatePolicy(maxTx, daily, guardianThresh, ownerThresh) {
            assert(account.maxTxValue() == maxTx);
            assert(account.dailyLimit() == daily);
            assert(account.guardianThreshold() == guardianThresh);
        } catch {}
    }

    // ═══════════════════════════════════════════════════════════════
    // INVARIANT 5: Factory fee enforcement
    // ═══════════════════════════════════════════════════════════════

    function check_factoryRequiresFee(uint256 sent) public {
        vm.assume(sent < factory.deployFee());
        vm.deal(address(this), sent);

        try factory.createAccount{value: sent}(
            address(0xA), address(0xB), address(0xC),
            1 ether, 10 ether, 0.5 ether, 999
        ) {
            assert(false); // underpayment must revert
        } catch {}
    }

    function check_factoryCannotRenounce() public {
        vm.prank(factory.owner());
        try factory.renounceOwnership() {
            assert(false);
        } catch {}
    }
}
