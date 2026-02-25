// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/interfaces/IERC1271.sol";

/**
 * @title MockExchange
 * @notice Simulates Polymarket's CTF Exchange signature verification.
 *   Calls isValidSignature on a smart account to verify EIP-712 orders.
 */
contract MockExchange {
    bytes4 internal constant ERC1271_MAGIC = 0x1626ba7e;

    event OrderVerified(address indexed account, bytes32 orderHash, bool valid);
    event OrderExecuted(address indexed account, bytes32 orderHash, uint256 amount);

    /**
     * @notice Verify that an order was signed by an authorized signer of the smart account.
     * @param account The smart account (Sigil wallet) that should have signed
     * @param orderHash The EIP-712 hash of the order
     * @param signature The signature to verify
     * @return valid Whether the signature is valid
     */
    function verifyOrder(
        address account,
        bytes32 orderHash,
        bytes memory signature
    ) external returns (bool valid) {
        bytes4 result = IERC1271(account).isValidSignature(orderHash, signature);
        valid = (result == ERC1271_MAGIC);
        emit OrderVerified(account, orderHash, valid);
    }

    /**
     * @notice Verify + execute a mock order (simulates Polymarket matchOrders).
     *   In real Polymarket, this would transfer USDC/tokens.
     */
    function executeOrder(
        address account,
        bytes32 orderHash,
        bytes memory signature,
        uint256 amount
    ) external returns (bool) {
        bytes4 result = IERC1271(account).isValidSignature(orderHash, signature);
        require(result == ERC1271_MAGIC, "MockExchange: invalid signature");
        emit OrderExecuted(account, orderHash, amount);
        return true;
    }
}
