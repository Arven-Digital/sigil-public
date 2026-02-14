// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./SigilAccount.sol";

/**
 * @title SigilAccountFactory
 * @notice Factory for deploying SigilAccount proxies via CREATE2.
 *   V7: Dynamic protocol fees, owner-controlled treasury, Ownable2Step.
 *
 * @dev Fee model:
 *   - deployFee: Charged on createAccount (paid by whoever calls the factory)
 *   - Fees accumulate in the factory contract
 *   - Owner can withdraw to treasury at any time
 *   - Owner can adjust fees at any time (capped at MAX_DEPLOY_FEE)
 *   - Fee can be set to 0 for promotional periods
 */
contract SigilAccountFactory is Ownable2Step, ReentrancyGuard {
    SigilAccount public immutable accountImplementation;
    IEntryPoint public immutable entryPoint;

    // ─── Fee Configuration ───
    uint256 public deployFee;          // Fee for deploying a new account (in native token)
    address public treasury;           // Where withdrawn fees go
    uint256 public constant MAX_DEPLOY_FEE = 10 ether; // Safety cap (~$90 at current AVAX)

    // ─── Errors ───
    error ZeroAddress(uint8 code);
    error InsufficientFee(uint256 sent, uint256 required);
    error FeeTooHigh(uint256 fee, uint256 max);
    error WithdrawFailed();
    error NoBalance();
    error RenounceDisabled();

    // ─── Events ───
    event AccountCreated(address indexed account, address indexed owner, address indexed agentKey, address guardianKey);
    event FeeCollected(address indexed payer, uint256 amount);
    event RefundFailed(address indexed to, uint256 amount);
    event DeployFeeUpdated(uint256 oldFee, uint256 newFee);
    event TreasuryUpdated(address indexed oldTreasury, address indexed newTreasury);
    event FeesWithdrawn(address indexed to, uint256 amount);

    constructor(IEntryPoint entryPoint_, address treasury_, uint256 deployFee_) Ownable(msg.sender) {
        if (address(entryPoint_) == address(0)) revert ZeroAddress(1);
        if (treasury_ == address(0)) revert ZeroAddress(5);
        if (deployFee_ > MAX_DEPLOY_FEE) revert FeeTooHigh(deployFee_, MAX_DEPLOY_FEE);
        entryPoint = entryPoint_;
        treasury = treasury_;
        deployFee = deployFee_;
        accountImplementation = new SigilAccount(entryPoint_, address(this));
    }

    // 5A-03: Disable renounceOwnership to prevent permanent fee lockup
    function renounceOwnership() public pure override {
        revert RenounceDisabled();
    }

    // ═══════════════════════════════════════════════════════════
    //                      ACCOUNT CREATION
    // ═══════════════════════════════════════════════════════════

    /**
     * @notice Deploy a new SigilAccount proxy with default transfer delay (24h).
     *   Requires msg.value >= deployFee.
     */
    function createAccount(
        address owner_,
        address agentKey_,
        address guardianKey_,
        uint256 maxTxValue_,
        uint256 dailyLimit_,
        uint256 guardianThreshold_,
        uint256 salt
    ) external payable returns (SigilAccount account) {
        return _createAccount(owner_, agentKey_, guardianKey_, maxTxValue_, dailyLimit_, guardianThreshold_, 0, salt);
    }

    /**
     * @notice Deploy a new SigilAccount proxy with custom owner transfer delay.
     * @param ownerTransferDelay_ Custom delay in seconds (min 1h, max 90d). Pass 0 for default (24h).
     */
    function createAccountWithDelay(
        address owner_,
        address agentKey_,
        address guardianKey_,
        uint256 maxTxValue_,
        uint256 dailyLimit_,
        uint256 guardianThreshold_,
        uint256 ownerTransferDelay_,
        uint256 salt
    ) external payable returns (SigilAccount account) {
        return _createAccount(owner_, agentKey_, guardianKey_, maxTxValue_, dailyLimit_, guardianThreshold_, ownerTransferDelay_, salt);
    }

    function _createAccount(
        address owner_,
        address agentKey_,
        address guardianKey_,
        uint256 maxTxValue_,
        uint256 dailyLimit_,
        uint256 guardianThreshold_,
        uint256 ownerTransferDelay_,
        uint256 salt
    ) internal returns (SigilAccount account) {
        // ── Fee check ──
        if (msg.value < deployFee) revert InsufficientFee(msg.value, deployFee);

        if (owner_ == address(0)) revert ZeroAddress(1);
        if (agentKey_ == address(0)) revert ZeroAddress(2);
        if (guardianKey_ == address(0)) revert ZeroAddress(3);

        // R8: Include all keys in salt to prevent collisions with different key configurations
        bytes32 create2Salt = keccak256(abi.encodePacked(owner_, agentKey_, guardianKey_, salt));

        // Use initializeWithDelay if custom delay, otherwise default initialize
        bytes memory initData = ownerTransferDelay_ > 0
            ? abi.encodeCall(
                SigilAccount.initializeWithDelay,
                (owner_, agentKey_, guardianKey_, maxTxValue_, dailyLimit_, guardianThreshold_, ownerTransferDelay_)
              )
            : abi.encodeCall(
                SigilAccount.initialize,
                (owner_, agentKey_, guardianKey_, maxTxValue_, dailyLimit_, guardianThreshold_)
              );

        account = SigilAccount(payable(
            address(new ERC1967Proxy{salt: create2Salt}(
                address(accountImplementation),
                initData
            ))
        ));

        // Emit fee collection event
        if (deployFee > 0) {
            emit FeeCollected(msg.sender, deployFee);
        }

        // Refund excess payment
        uint256 excess = msg.value - deployFee;
        if (excess > 0) {
            (bool refunded,) = msg.sender.call{value: excess}("");
            if (!refunded) {
                emit RefundFailed(msg.sender, excess);
            }
        }

        emit AccountCreated(address(account), owner_, agentKey_, guardianKey_);
    }

    // ═══════════════════════════════════════════════════════════
    //                      FEE MANAGEMENT
    // ═══════════════════════════════════════════════════════════

    /**
     * @notice Update the deployment fee. Owner-only. Capped at MAX_DEPLOY_FEE.
     *   Can be set to 0 for free deployment periods.
     */
    function setDeployFee(uint256 newFee) external onlyOwner {
        if (newFee > MAX_DEPLOY_FEE) revert FeeTooHigh(newFee, MAX_DEPLOY_FEE);
        uint256 oldFee = deployFee;
        deployFee = newFee;
        emit DeployFeeUpdated(oldFee, newFee);
    }

    /**
     * @notice Update the treasury address. Owner-only.
     */
    function setTreasury(address newTreasury) external onlyOwner {
        if (newTreasury == address(0)) revert ZeroAddress(5);
        address oldTreasury = treasury;
        treasury = newTreasury;
        emit TreasuryUpdated(oldTreasury, newTreasury);
    }

    /**
     * @notice Withdraw accumulated fees to the treasury. Owner-only.
     */
    function withdrawFees() external onlyOwner nonReentrant {
        uint256 balance = address(this).balance;
        if (balance == 0) revert NoBalance();
        (bool success,) = treasury.call{value: balance}("");
        if (!success) revert WithdrawFailed();
        emit FeesWithdrawn(treasury, balance);
    }

    /**
     * @notice Withdraw a specific amount of fees. Owner-only.
     */
    function withdrawFeesAmount(uint256 amount) external onlyOwner nonReentrant {
        if (amount == 0 || amount > address(this).balance) revert NoBalance();
        (bool success,) = treasury.call{value: amount}("");
        if (!success) revert WithdrawFailed();
        emit FeesWithdrawn(treasury, amount);
    }

    // ═══════════════════════════════════════════════════════════
    //                      ADDRESS PREDICTION
    // ═══════════════════════════════════════════════════════════

    /**
     * @notice Predict the address of a SigilAccount before deployment.
     */
    function getAddress(
        address owner_,
        address agentKey_,
        address guardianKey_,
        uint256 maxTxValue_,
        uint256 dailyLimit_,
        uint256 guardianThreshold_,
        uint256 salt
    ) external view returns (address) {
        return getAddressWithDelay(owner_, agentKey_, guardianKey_, maxTxValue_, dailyLimit_, guardianThreshold_, 0, salt);
    }

    function getAddressWithDelay(
        address owner_,
        address agentKey_,
        address guardianKey_,
        uint256 maxTxValue_,
        uint256 dailyLimit_,
        uint256 guardianThreshold_,
        uint256 ownerTransferDelay_,
        uint256 salt
    ) public view returns (address) {
        // R8: Must match _createAccount salt computation
        bytes32 create2Salt = keccak256(abi.encodePacked(owner_, agentKey_, guardianKey_, salt));

        bytes memory initData = ownerTransferDelay_ > 0
            ? abi.encodeCall(
                SigilAccount.initializeWithDelay,
                (owner_, agentKey_, guardianKey_, maxTxValue_, dailyLimit_, guardianThreshold_, ownerTransferDelay_)
              )
            : abi.encodeCall(
                SigilAccount.initialize,
                (owner_, agentKey_, guardianKey_, maxTxValue_, dailyLimit_, guardianThreshold_)
              );

        bytes memory proxyBytecode = abi.encodePacked(
            type(ERC1967Proxy).creationCode,
            abi.encode(address(accountImplementation), initData)
        );
        bytes32 hash = keccak256(abi.encodePacked(bytes1(0xff), address(this), create2Salt, keccak256(proxyBytecode)));
        return address(uint160(uint256(hash)));
    }

    // ═══════════════════════════════════════════════════════════
    //                      VIEWS
    // ═══════════════════════════════════════════════════════════

    /**
     * @notice Get current fee configuration.
     */
    function getFeeConfig() external view returns (uint256 deployFee_, address treasury_, uint256 balance_) {
        return (deployFee, treasury, address(this).balance);
    }

    // ═══════════════════════════════════════════════════════════
    //                 OPERATION FEES (anti-spam)
    // ═══════════════════════════════════════════════════════════

    uint128 public sessionKeyFee;  // fee for createSessionKey
    uint128 public recoveryFee;    // fee for initiateRecovery
    uint256 public constant MAX_OP_FEE = 1 ether;

    event OpFeeUpdated(uint8 indexed op, uint256 newFee);

    /**
     * @notice Set operation fees. Owner-only.
     * @param op 1 = sessionKey, 2 = recovery
     * @param newFee Fee in wei (max 1 ether)
     */
    function setOpFee(uint8 op, uint128 newFee) external onlyOwner {
        if (newFee > MAX_OP_FEE) revert FeeTooHigh(newFee, MAX_OP_FEE);
        if (op == 1) sessionKeyFee = newFee;
        else if (op == 2) recoveryFee = newFee;
        else revert("Invalid op");
        emit OpFeeUpdated(op, newFee);
    }

    /**
     * @notice Get all fee configuration including operation fees.
     */
    /// @notice Accept ETH from accounts forwarding operation fees.
    receive() external payable {}

    function getAllFees() external view returns (
        uint256 deployFee_,
        uint128 sessionKeyFee_,
        uint128 recoveryFee_,
        address treasury_,
        uint256 balance_
    ) {
        return (deployFee, sessionKeyFee, recoveryFee, treasury, address(this).balance);
    }
}
