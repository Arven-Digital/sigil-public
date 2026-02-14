// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@account-abstraction/core/BaseAccount.sol";
import "@account-abstraction/interfaces/IEntryPoint.sol";
import "@account-abstraction/interfaces/PackedUserOperation.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/interfaces/IERC1271.sol";
import "@openzeppelin/contracts/utils/introspection/IERC165.sol";

/**
 * @title SigilAccount
 * @notice ERC-4337 smart account with 3-tier co-signing and timelock for AI agent wallets.
 *
 * @dev SECURITY MODEL — Owner Authority:
 *   The owner (hardware wallet) has absolute authority over this account by design.
 *   After a 1-hour timelock, the owner can execute arbitrary transactions via the
 *   queue, bypassing policy limits. This is intentional: the owner IS the human operator.
 *   The policy engine protects against agent misbehavior, not owner actions.
 *   If the owner key is compromised, use emergencyWithdraw/emergencyWithdrawToken or freeze immediately.
 */
contract SigilAccount is BaseAccount, Initializable, ReentrancyGuard, UUPSUpgradeable, IERC1271, IERC165 {
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;
    using SafeERC20 for IERC20;

    // ─── Keys ───
    address public owner;
    address public agentKey;
    address public guardianKey;

    // ─── Policy Parameters ───
    uint256 public maxTxValue;
    uint256 public dailyLimit;
    uint256 public guardianThreshold;
    uint256 public ownerThreshold;

    // ─── Whitelists ───
    mapping(address => bool) public allowedTargets;
    mapping(bytes4 => bool) public allowedFunctions;

    // ─── Token Allowance Policies ───
    struct TokenAllowance {
        uint256 maxApproval;       // Max approve amount per tx (0 = blocked)
        uint256 dailyTransferLimit; // Max transfer amount per day (0 = unlimited)
        uint256 dailyTransferred;   // Amount transferred today
        uint256 dailyResetTime;     // Next reset timestamp for this token
    }
    mapping(address => TokenAllowance) public tokenAllowances;
    mapping(address => bool) public hasTokenPolicy;  // whether a token has a configured policy

    // ─── Velocity Tracking ───
    uint256 public dailySpent;
    uint256 public dailyResetTime;

    // ─── State ───
    bool public isFrozen;

    // ─── Ownership Transfer ───
    uint256 public ownerTransferDelay;          // configurable per account (1h–90d)
    address public pendingOwner;
    uint256 public ownerTransferRequestedAt;

    uint256 internal constant MIN_TRANSFER_DELAY = 1 hours;
    uint256 internal constant MAX_TRANSFER_DELAY = 90 days;
    uint256 internal constant DEFAULT_TRANSFER_DELAY = 24 hours;

    // ─── Timelock Queue ───
    struct QueuedTx {
        address target;
        uint256 value;
        bytes data;
        uint256 queuedAt;
        address queuedBy;
        bool executed;
        bool cancelled;
    }

    uint256 public nextQueueId;
    uint256 internal constant TIMELOCK_DELAY = 1 hours;
    uint256 internal constant QUEUE_EXPIRY = 7 days;
    mapping(uint256 => QueuedTx) public queuedTransactions;

    // ─── Immutables ───
    IEntryPoint private immutable _entryPoint;
    address public immutable factory;

    // ─── Events ───
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

    // ─── Errors ───
    error AccountIsFrozen();
    error NotOwner();
    error NotOwnerOrEntryPoint();
    error ZeroAddress(uint8 code); // 1=owner, 2=agent, 3=guardian, 4=target, 5=to, 6=token, 7=session
    error TargetNotWhitelisted(address target);
    error FunctionNotAllowed(bytes4 selector);
    error ExceedsPerTxLimit(uint256 value, uint256 limit);
    error ExceedsDailyLimit(uint256 spent, uint256 limit);
    error InvalidSignature();
    error GuardianCoSignRequired();
    error OwnerCoSignRequired();
    error TimelockNotElapsed(uint256 queueId, uint256 executeAfter);
    error TransactionAlreadyExecuted(uint256 queueId);
    error TransactionCancelledError(uint256 queueId);
    error InvalidQueueId(uint256 queueId);
    error UnknownSelector(bytes4 selector);
    error InvalidCallData();
    error InvalidPolicyParams(uint8 code); // 1=maxTxValue zero, 2=dailyLimit zero, 3=maxTxValue>dailyLimit, 4=guardianThreshold>ownerThreshold
    error TransactionExpired(uint256 queueId);
    error TransferNotRequested();
    error TransferDelayNotElapsed(uint256 executeAfter);
    error TransferDelayOutOfRange(uint256 delay, uint256 min, uint256 max);
    error CannotDecreaseDelay(); // V9R3-F1: Only UUPS upgrade can decrease. Renamed from misleading "Directly".
    error TransactionFromPreviousOwner(uint256 queueId);
    error TokenApprovalExceedsLimit(address token, uint256 amount, uint256 maxApproval);
    error TokenTransferExceedsDailyLimit(address token, uint256 amount, uint256 limit);
    // Size optimization errors (replace string requires)
    error EmptyBatch();
    error BatchTooLarge();
    error BatchSelfCall();
    error BatchCallFailed();
    error QueueSelfCall();
    error NoBalance();
    error WithdrawFailed();
    error NoTokenBalance();
    error CannotWhitelistSelf();
    error ZeroImpl();
    error NotContract();
    error NoPendingUpgrade();
    error UpgradeDelayNotElapsed();
    error InvalidGuardianSig();
    error EmptyMulticall();
    error MulticallTooLarge();
    error MulticallEmptyCalldata();
    error MulticallBlockedSelector();
    error MulticallFailed(uint256 index);
    error QueuedTxFailed();
    error ZeroDeposit();
    error OnlyFactory();
    error InsufficientOpFee(uint256 sent, uint256 required);
    error InsufficientGas();

    // ─── Modifiers ───
    modifier onlyOwner() {
        _onlyOwner();
        _;
    }

    function _onlyOwner() internal view {
        if (msg.sender != owner) revert NotOwner();
    }

    function _sessionKeyExists(uint256 sessionId) internal view {
        if (sessionKeys[sessionId].key == address(0)) revert SessionKeyNotFound();
    }

    modifier notFrozen() {
        _notFrozen();
        _;
    }

    function _notFrozen() internal view {
        if (isFrozen) revert AccountIsFrozen();
    }

    constructor(IEntryPoint entryPoint_, address factory_) {
        _entryPoint = entryPoint_;
        factory = factory_;
        _disableInitializers();
    }

    function initialize(
        address owner_,
        address agentKey_,
        address guardianKey_,
        uint256 maxTxValue_,
        uint256 dailyLimit_,
        uint256 guardianThreshold_
    ) external initializer {
        if (msg.sender != factory) revert OnlyFactory();
        _initializeInternal(owner_, agentKey_, guardianKey_, maxTxValue_, dailyLimit_, guardianThreshold_, DEFAULT_TRANSFER_DELAY);
    }

    function initializeWithDelay(
        address owner_,
        address agentKey_,
        address guardianKey_,
        uint256 maxTxValue_,
        uint256 dailyLimit_,
        uint256 guardianThreshold_,
        uint256 ownerTransferDelay_
    ) external initializer {
        if (msg.sender != factory) revert OnlyFactory();
        if (ownerTransferDelay_ < MIN_TRANSFER_DELAY || ownerTransferDelay_ > MAX_TRANSFER_DELAY) {
            revert TransferDelayOutOfRange(ownerTransferDelay_, MIN_TRANSFER_DELAY, MAX_TRANSFER_DELAY);
        }
        _initializeInternal(owner_, agentKey_, guardianKey_, maxTxValue_, dailyLimit_, guardianThreshold_, ownerTransferDelay_);
    }

    function _initializeInternal(
        address owner_,
        address agentKey_,
        address guardianKey_,
        uint256 maxTxValue_,
        uint256 dailyLimit_,
        uint256 guardianThreshold_,
        uint256 ownerTransferDelay_
    ) internal {
        if (owner_ == address(0)) revert ZeroAddress(1);
        if (agentKey_ == address(0)) revert ZeroAddress(2);
        if (guardianKey_ == address(0)) revert ZeroAddress(3);
        // R7: All three keys must be distinct
        if (owner_ == agentKey_) revert KeyCollision(1);
        if (owner_ == guardianKey_) revert KeyCollision(2);
        if (agentKey_ == guardianKey_) revert KeyCollision(3);
        if (maxTxValue_ == 0) revert InvalidPolicyParams(1);
        if (dailyLimit_ == 0) revert InvalidPolicyParams(2);
        if (maxTxValue_ > dailyLimit_) revert InvalidPolicyParams(3);

        owner = owner_;
        agentKey = agentKey_;
        guardianKey = guardianKey_;
        maxTxValue = maxTxValue_;
        dailyLimit = dailyLimit_;
        guardianThreshold = guardianThreshold_;
        ownerThreshold = type(uint256).max; // disabled by default
        ownerTransferDelay = ownerTransferDelay_;
        // L1 fix: Epoch-align the initial daily reset boundary (midnight UTC)
        dailyResetTime = ((block.timestamp / 1 days) + 1) * 1 days;

        emit AccountInitialized(owner_, agentKey_, guardianKey_);
    }

    // ═══════════════════════════════════════════════════════════
    //                      ERC-4337 CORE
    // ═══════════════════════════════════════════════════════════

    function entryPoint() public view override returns (IEntryPoint) {
        return _entryPoint;
    }

    /**
     * @dev NOTE on dailySpent: The ERC-4337 spec calls validateUserOp during the validation phase.
     *   If the UserOp later reverts during execution, the dailySpent increment is NOT rolled back
     *   (validation and execution are separate EVM frames). This is a known conservative tradeoff:
     *
     *   - RISK: A compromised agent key can exhaust the daily budget by submitting UserOps that
     *     pass validation but fail during execution, without moving actual funds. The account also
     *     pays validation gas for each attempt via the prefund mechanism.
     *
     *   - TRADEOFF: Rolling back dailySpent on execution failure would require post-execution hooks
     *     which are not available in the ERC-4337 validation phase. The conservative approach
     *     (budget consumed on failure) prevents budget probing — an attacker cannot test how much
     *     budget remains by submitting ops that intentionally fail.
     *
     *   - MITIGATION: Off-chain monitoring should track failed UserOps and freeze the account if
     *     consecutive failures exceed a threshold. The Guardian service handles this.
     */
    function validateUserOp(
        PackedUserOperation calldata userOp,
        bytes32 userOpHash,
        uint256 missingAccountFunds
    ) external virtual override returns (uint256 validationData) {
        _requireFromEntryPoint();

        if (isFrozen) return SIG_VALIDATION_FAILED;

        validationData = _validateSignature(userOp, userOpHash);
        if (validationData != SIG_VALIDATION_SUCCESS) return validationData;

        // Check if this is a session key UserOp — route to session policy instead of account policy
        if (userOp.signature.length == 65) {
            bytes32 ethHash = userOpHash.toEthSignedMessageHash();
            address signer = ethHash.recover(userOp.signature);
            uint256 sid = sessionKeyId[signer];
            if (sid != 0) {
                _enforceSessionPolicy(sid, userOp);
                _payPrefund(missingAccountFunds);
                return SIG_VALIDATION_SUCCESS;
            }
        }

        _enforcePolicies(userOp);

        _payPrefund(missingAccountFunds);

        return SIG_VALIDATION_SUCCESS;
    }

    /**
     * @dev 3-tier signature validation:
     *   - 65 bytes: single sig (agent or owner) — LOW tier
     *   - 130 bytes: agent + guardian — MEDIUM tier
     *   - 195 bytes: agent + guardian + owner — HIGH tier
     */
    function _validateSignature(
        PackedUserOperation calldata userOp,
        bytes32 userOpHash
    ) internal view override returns (uint256 validationData) {
        bytes32 ethHash = userOpHash.toEthSignedMessageHash();
        // R11: Cache key storage reads for gas optimization
        address _owner = owner;
        address _agentKey = agentKey;
        address _guardianKey = guardianKey;

        if (userOp.signature.length == 65) {
            address signer = ethHash.recover(userOp.signature);
            // R9: Guard against ecrecover returning address(0) — malleable signatures
            if (signer == address(0)) return SIG_VALIDATION_FAILED;
            if (signer == _agentKey || signer == _owner) {
                return SIG_VALIDATION_SUCCESS;
            }
            // Session keys are validated and policies enforced in validateUserOp
            // Return a sentinel value so validateUserOp knows to use session policy
            uint256 sid = sessionKeyId[signer];
            if (sid != 0) {
                // Return SIG_VALIDATION_SUCCESS — session policy checks happen in validateUserOp
                return SIG_VALIDATION_SUCCESS;
            }
            return SIG_VALIDATION_FAILED;
        } else if (userOp.signature.length == 130) {
            bytes memory agentSig = userOp.signature[0:65];
            bytes memory guardianSig = userOp.signature[65:130];

            address agentSigner = ethHash.recover(agentSig);
            address guardianSigner = ethHash.recover(guardianSig);

            // R9: Guard against ecrecover returning address(0)
            if (agentSigner == address(0) || guardianSigner == address(0)) return SIG_VALIDATION_FAILED;

            if ((agentSigner == _agentKey || agentSigner == _owner) && guardianSigner == _guardianKey) {
                return SIG_VALIDATION_SUCCESS;
            }
            return SIG_VALIDATION_FAILED;
        } else if (userOp.signature.length == 195) {
            bytes memory agentSig = userOp.signature[0:65];
            bytes memory guardianSig = userOp.signature[65:130];
            bytes memory ownerSig = userOp.signature[130:195];

            address agentSigner = ethHash.recover(agentSig);
            address guardianSigner = ethHash.recover(guardianSig);
            address ownerSigner = ethHash.recover(ownerSig);

            // R9: Guard against ecrecover returning address(0)
            if (agentSigner == address(0) || guardianSigner == address(0) || ownerSigner == address(0)) return SIG_VALIDATION_FAILED;

            if (agentSigner == _agentKey && guardianSigner == _guardianKey && ownerSigner == _owner) {
                return SIG_VALIDATION_SUCCESS;
            }
            return SIG_VALIDATION_FAILED;
        }

        return SIG_VALIDATION_FAILED;
    }

    // ═══════════════════════════════════════════════════════════
    //                      POLICY ENGINE
    // ═══════════════════════════════════════════════════════════

    /// @dev Known execute selectors
    bytes4 private constant EXECUTE_SELECTOR = 0xb61d27f6; // execute(address,uint256,bytes)

    /**
     * @dev Enforces all policy checks on UserOps routed through execute().
     *
     *   Policy enforcement flow:
     *   1. Reject malformed callData (< 4 bytes)
     *   2. Reject unknown outer selectors (only execute() allowed via EntryPoint)
     *   3. Block self-calls (prevents calling admin functions via UserOp)
     *   4. Target whitelist check
     *   5. Function selector whitelist check
     *   6. Per-transaction value limit
     *   7. Daily velocity limit (budget consumed even on later execution failure — see validateUserOp NatSpec)
     *   8. 3-tier co-signing based on value thresholds:
     *      - value <= guardianThreshold: agent alone (LOW)
     *      - value <= ownerThreshold: agent + guardian (MEDIUM)
     *      - value > ownerThreshold: agent + guardian + owner (HIGH)
     *
     *   Owner-only high-value transactions bypass this engine entirely — they go through
     *   the timelock queue (queueTransaction → 1 hour delay → executeQueued). This is by design:
     *   the policy engine protects against agent/guardian misbehavior, not owner actions.
     */
    function _enforcePolicies(PackedUserOperation calldata userOp) internal {
        // Reject malformed callData — prevents silent policy bypass
        if (userOp.callData.length < 4) revert InvalidCallData();

        bytes4 outerSelector = bytes4(userOp.callData[0:4]);

        // Reject unknown selectors — only whitelisted entry points allowed
        if (outerSelector != EXECUTE_SELECTOR) revert UnknownSelector(outerSelector);

        (address target_, uint256 value, bytes memory data) = abi.decode(
            userOp.callData[4:],
            (address, uint256, bytes)
        );

        // ── Block self-calls — prevents policy bypass ──
        if (target_ == address(this)) revert TargetNotWhitelisted(target_);

        // ── Target whitelist ──
        if (!allowedTargets[target_]) revert TargetNotWhitelisted(target_);

        // ── Function selector whitelist ──
        // V9R3-F3: Reject 1-3 byte calldata — bypasses selector whitelist, could hit fallback()
        if (data.length > 0 && data.length < 4) revert InvalidCallData();
        if (data.length >= 4) {
            bytes4 innerSelector;
            assembly {
                innerSelector := mload(add(data, 32))
            }
            if (!allowedFunctions[innerSelector]) revert FunctionNotAllowed(innerSelector);
        }

        // ── Token allowance policies ──
        _enforceTokenPolicy(target_, data);

        // R11: Cache storage reads to optimize gas (saves ~200 gas per SLOAD)
        uint256 _maxTxValue = maxTxValue;
        uint256 _dailyLimit = dailyLimit;
        uint256 _guardianThreshold = guardianThreshold;
        uint256 _ownerThreshold = ownerThreshold;

        // ── Per-tx value limit ──
        if (value > _maxTxValue) revert ExceedsPerTxLimit(value, _maxTxValue);

        // ── Daily velocity limit ──
        // R13: ERC-4337 compliance - reduced time dependency in validation
        _resetDailyIfNeeded();
        if (dailySpent + value > _dailyLimit) revert ExceedsDailyLimit(dailySpent + value, _dailyLimit);
        dailySpent += value;

        // ── 3-tier co-signing ──
        if (value > _ownerThreshold) {
            // HIGH tier: agent + guardian + owner (3-of-3)
            if (userOp.signature.length != 195) revert OwnerCoSignRequired();
        } else if (value > _guardianThreshold) {
            // MEDIUM tier: agent + guardian (2-of-2)
            if (userOp.signature.length != 130 && userOp.signature.length != 195) revert GuardianCoSignRequired();
        }
        // LOW tier: agent alone is fine (65-byte sig)
    }

    function _resetDailyIfNeeded() internal {
        // R11: Cache storage read for gas optimization
        uint256 _dailyResetTime = dailyResetTime;
        if (block.timestamp >= _dailyResetTime) {
            dailySpent = 0;
            // L1 fix: Advance to the next boundary aligned to the original epoch,
            // not block.timestamp. Prevents drift when gaps occur between txs.
            // If 3 days pass with no tx, this jumps to the correct next boundary.
            uint256 elapsed = block.timestamp - _dailyResetTime;
            uint256 periods = (elapsed / 1 days) + 1;
            dailyResetTime = _dailyResetTime + periods * 1 days;
        }
    }

    // ═══════════════════════════════════════════════════════════
    //                      EXECUTION
    // ═══════════════════════════════════════════════════════════

    function _requireForExecute() internal view override {
        if (msg.sender != address(entryPoint()) && msg.sender != owner) {
            revert NotOwnerOrEntryPoint();
        }
        // 5A-01: Enforce freeze on direct execute() too (consistent with executeBatch).
        // EntryPoint path: frozen accounts already fail in validateUserOp (SIG_VALIDATION_FAILED),
        // so EntryPoint never reaches execute(). This only gates direct owner calls.
        _notFrozen();
    }

    // ═══════════════════════════════════════════════════════════
    //                      BATCH EXECUTION
    // ═══════════════════════════════════════════════════════════

    /**
     * @dev R6 fix: Override executeBatch to restrict to owner-only.
     *   BaseAccount's executeBatch uses _requireForExecute() which allows EntryPoint.
     *   But our policy engine only validates single execute() calls.
     *   Allowing executeBatch through EntryPoint would bypass all policy checks.
     *   Owner can still call executeBatch directly (consistent with execute() design).
     */
    function executeBatch(Call[] calldata calls) external virtual override onlyOwner notFrozen nonReentrant {
        uint256 callsLength = calls.length;
        if (callsLength == 0) revert EmptyBatch();
        if (callsLength > 20) revert BatchTooLarge(); // R10: prevent gas griefing with huge batches
        for (uint256 i = 0; i < callsLength; i++) {
            Call calldata call1 = calls[i];
            // R10: Block self-calls in batch (same as UserOp policy)
            if (call1.target == address(this)) revert BatchSelfCall();
            (bool ok,) = call1.target.call{value: call1.value}(call1.data);
            if (!ok) revert BatchCallFailed();
        }
    }

    // ═══════════════════════════════════════════════════════════
    //                      TIMELOCK QUEUE
    // ═══════════════════════════════════════════════════════════

    function queueTransaction(address target_, uint256 value, bytes calldata data) external onlyOwner notFrozen returns (uint256 queueId) {
        if (target_ == address(0)) revert ZeroAddress(4);
        // R12: Prevent queuing self-calls (same as UserOp + batch policy)
        if (target_ == address(this)) revert QueueSelfCall();
        queueId = nextQueueId++;
        queuedTransactions[queueId] = QueuedTx({
            target: target_,
            value: value,
            data: data,
            queuedAt: block.timestamp,
            queuedBy: msg.sender,
            executed: false,
            cancelled: false
        });
        emit TransactionQueued(queueId, target_, value, data, block.timestamp + TIMELOCK_DELAY);
    }

    function executeQueued(uint256 queueId) external onlyOwner notFrozen nonReentrant {
        QueuedTx storage txn = queuedTransactions[queueId];
        if (txn.queuedAt == 0) revert InvalidQueueId(queueId);
        if (txn.executed) revert TransactionAlreadyExecuted(queueId);
        if (txn.cancelled) revert TransactionCancelledError(queueId);
        if (block.timestamp < txn.queuedAt + TIMELOCK_DELAY) {
            revert TimelockNotElapsed(queueId, txn.queuedAt + TIMELOCK_DELAY);
        }
        if (block.timestamp > txn.queuedAt + QUEUE_EXPIRY) {
            revert TransactionExpired(queueId);
        }
        // H1 fix: Reject if queued by a previous owner (prevents inherited queue attacks)
        if (txn.queuedBy != owner) revert TransactionFromPreviousOwner(queueId);

        txn.executed = true;

        // R13: Forward limited gas to prevent external contract from consuming all gas
        // Require enough gas for the call + post-call state writes (event, storage)
        if (gasleft() < 80_000) revert InsufficientGas();
        uint256 gasToForward = gasleft() - 50_000;
        (bool success,) = txn.target.call{value: txn.value, gas: gasToForward}(txn.data);
        if (!success) revert QueuedTxFailed();

        emit TransactionExecuted(queueId, txn.target, txn.value);
    }

    function cancelQueued(uint256 queueId) external onlyOwner {
        QueuedTx storage txn = queuedTransactions[queueId];
        if (txn.queuedAt == 0) revert InvalidQueueId(queueId);
        if (txn.executed) revert TransactionAlreadyExecuted(queueId);
        if (txn.cancelled) revert TransactionCancelledError(queueId);

        txn.cancelled = true;
        emit TransactionCancelled(queueId);
    }

    // ═══════════════════════════════════════════════════════════
    //                      EMERGENCY
    // ═══════════════════════════════════════════════════════════

    /// @notice Withdraw all native ETH to `to`. Works even when frozen.
    function emergencyWithdraw(address to) external onlyOwner nonReentrant {
        if (to == address(0)) revert ZeroAddress(5);
        uint256 amount = address(this).balance;
        if (amount == 0) revert NoBalance();
        // R11: Use generous gas (gasleft-based) so contract recipients work too
        uint256 gasToForward = gasleft() > 100_000 ? gasleft() - 50_000 : gasleft();
        (bool success,) = to.call{value: amount, gas: gasToForward}("");
        if (!success) revert WithdrawFailed();
        emit EmergencyWithdrawal(to, amount);
    }

    /// @notice Withdraw all of an ERC-20 token to `to`. Works even when frozen.
    function emergencyWithdrawToken(address token, address to) external onlyOwner nonReentrant {
        if (token == address(0)) revert ZeroAddress(6);
        if (to == address(0)) revert ZeroAddress(5);
        uint256 balance = IERC20(token).balanceOf(address(this));
        if (balance == 0) revert NoTokenBalance();
        IERC20(token).safeTransfer(to, balance);
        emit EmergencyTokenWithdrawal(token, to, balance);
    }

    // ═══════════════════════════════════════════════════════════
    //                      OWNER FUNCTIONS
    // ═══════════════════════════════════════════════════════════

    function freeze() external onlyOwner {
        isFrozen = true;
        emit AccountFrozen(msg.sender);
    }

    function unfreeze() external onlyOwner {
        isFrozen = false;
        emit AccountUnfrozen(msg.sender);
    }

    error KeyCollision(uint8 code); // 1=o/a, 2=o/g, 3=a/g, 4=a/s, 5=a/rg, 6=g/s, 7=g/rg, 8=s/rg, 9=s/po, 10=rg/s, 11=o/s

    function rotateAgentKey(address newAgentKey) external onlyOwner {
        if (newAgentKey == address(0)) revert ZeroAddress(2);
        // R7: Prevent key collisions that weaken the multi-sig model
        if (newAgentKey == guardianKey) revert KeyCollision(3);
        if (newAgentKey == owner) revert KeyCollision(1);
        if (newAgentKey == pendingOwner) revert KeyCollision(9);
        if (sessionKeyId[newAgentKey] != 0) revert KeyCollision(4);
        if (recoveryGuardians[newAgentKey]) revert KeyCollision(5);
        emit AgentKeyRotated(agentKey, newAgentKey);
        agentKey = newAgentKey;
    }

    function rotateGuardianKey(address newGuardianKey) external onlyOwner {
        if (newGuardianKey == address(0)) revert ZeroAddress(3);
        // R7: Prevent key collisions
        if (newGuardianKey == agentKey) revert KeyCollision(3);
        if (newGuardianKey == owner) revert KeyCollision(2);
        if (newGuardianKey == pendingOwner) revert KeyCollision(9);
        if (sessionKeyId[newGuardianKey] != 0) revert KeyCollision(6);
        if (recoveryGuardians[newGuardianKey]) revert KeyCollision(7);
        emit GuardianKeyRotated(guardianKey, newGuardianKey);
        guardianKey = newGuardianKey;
    }

    function updatePolicy(
        uint256 maxTxValue_,
        uint256 dailyLimit_,
        uint256 guardianThreshold_,
        uint256 ownerThreshold_
    ) external onlyOwner {
        if (maxTxValue_ == 0) revert InvalidPolicyParams(1);
        if (dailyLimit_ == 0) revert InvalidPolicyParams(2);
        if (maxTxValue_ > dailyLimit_) revert InvalidPolicyParams(3);
        if (guardianThreshold_ > ownerThreshold_) revert InvalidPolicyParams(4);

        maxTxValue = maxTxValue_;
        dailyLimit = dailyLimit_;
        guardianThreshold = guardianThreshold_;
        ownerThreshold = ownerThreshold_;
        emit PolicyUpdated(maxTxValue_, dailyLimit_, guardianThreshold_, ownerThreshold_);
    }

    function setAllowedTarget(address target_, bool allowed) external onlyOwner {
        if (target_ == address(0)) revert ZeroAddress(4);
        // R10: Prevent whitelisting self — policy engine blocks self-calls anyway
        if (target_ == address(this)) revert CannotWhitelistSelf();
        allowedTargets[target_] = allowed;
        emit TargetWhitelisted(target_, allowed);
    }

    function setAllowedFunction(bytes4 selector, bool allowed) external onlyOwner {
        allowedFunctions[selector] = allowed;
        emit FunctionWhitelisted(selector, allowed);
    }

    // ═══════════════════════════════════════════════════════════
    //                      TOKEN ALLOWANCE POLICIES
    // ═══════════════════════════════════════════════════════════

    /**
     * @notice Set a token allowance policy. Controls ERC-20 approve() and transfer() limits.
     * @param token ERC-20 token address
     * @param maxApproval_ Max amount per approve() call (0 = block all approvals)
     * @param dailyTransferLimit_ Max total transfer amount per day (0 = unlimited)
     */
    function setTokenPolicy(address token, uint256 maxApproval_, uint256 dailyTransferLimit_) external onlyOwner {
        if (token == address(0)) revert ZeroAddress(6);
        tokenAllowances[token] = TokenAllowance({
            maxApproval: maxApproval_,
            dailyTransferLimit: dailyTransferLimit_,
            dailyTransferred: 0,
            dailyResetTime: ((block.timestamp / 1 days) + 1) * 1 days
        });
        hasTokenPolicy[token] = true;
        emit TokenPolicySet(token, maxApproval_, dailyTransferLimit_);
    }

    /**
     * @notice Remove a token allowance policy.
     */
    function removeTokenPolicy(address token) external onlyOwner {
        if (token == address(0)) revert ZeroAddress(6);
        delete tokenAllowances[token];
        hasTokenPolicy[token] = false;
        emit TokenPolicyRemoved(token);
    }

    /**
     * @notice Get token policy details.
     */
    function getTokenPolicy(address token) external view returns (
        uint256 maxApproval_, uint256 dailyTransferLimit_, uint256 dailyTransferred_, bool exists_
    ) {
        TokenAllowance storage ta = tokenAllowances[token];
        return (ta.maxApproval, ta.dailyTransferLimit, ta.dailyTransferred, hasTokenPolicy[token]);
    }

    /**
     * @dev Enforce token allowance policies on ERC-20 approve/transfer/transferFrom calls.
     *   Called from _enforcePolicies when an inner call targets a token with a policy.
     *
     *   KNOWN LIMITATION: Fee-on-transfer tokens (e.g., STA, PAXG) may bypass daily limits
     *   because the policy tracks the transfer amount parameter, not actual tokens moved.
     *   For fee-on-transfer tokens, set limits with this behavior in mind or avoid if strict
     *   daily limits are required. Emergency withdrawals are unaffected.
     *
     *   VALIDATION/EXECUTION SPLIT: Like dailySpent and sk.spent, token dailyTransferred
     *   is incremented during the ERC-4337 validation phase. If the UserOp passes validation
     *   but execution reverts, the daily transfer budget is still consumed. A compromised
     *   agent key could exhaust a token's daily transfer limit via failing UserOps without
     *   actual tokens moving. Guardian monitoring detects consecutive execution failures.
     */
    function _enforceTokenPolicy(address target_, bytes memory data) internal {
        if (!hasTokenPolicy[target_]) return; // No policy = no restrictions beyond normal policies
        if (data.length < 4) return;

        bytes4 selector;
        assembly { selector := mload(add(data, 32)) }

        TokenAllowance storage ta = tokenAllowances[target_];

        // Reset daily counter if needed
        if (block.timestamp >= ta.dailyResetTime) {
            ta.dailyTransferred = 0;
            uint256 elapsed = block.timestamp - ta.dailyResetTime;
            uint256 periods = (elapsed / 1 days) + 1;
            ta.dailyResetTime += periods * 1 days;
        }

        // approve(address,uint256) = 0x095ea7b3
        if (selector == 0x095ea7b3 && data.length >= 68) {
            uint256 amount;
            assembly { amount := mload(add(data, 68)) }
            if (amount > ta.maxApproval) {
                revert TokenApprovalExceedsLimit(target_, amount, ta.maxApproval);
            }
        }
        // transfer(address,uint256) = 0xa9059cbb
        else if (selector == 0xa9059cbb && data.length >= 68) {
            uint256 amount;
            assembly { amount := mload(add(data, 68)) }
            // R11: Cache storage read for gas optimization
            uint256 _dailyTransferLimit = ta.dailyTransferLimit;
            if (_dailyTransferLimit > 0) {
                if (ta.dailyTransferred + amount > _dailyTransferLimit) {
                    revert TokenTransferExceedsDailyLimit(target_, ta.dailyTransferred + amount, _dailyTransferLimit);
                }
                ta.dailyTransferred += amount;
            }
        }
        // transferFrom(address,address,uint256) = 0x23b872dd
        else if (selector == 0x23b872dd && data.length >= 100) {
            uint256 amount;
            assembly { amount := mload(add(data, 100)) }
            // R11: Cache storage read for gas optimization  
            uint256 _dailyTransferLimit = ta.dailyTransferLimit;
            if (_dailyTransferLimit > 0) {
                if (ta.dailyTransferred + amount > _dailyTransferLimit) {
                    revert TokenTransferExceedsDailyLimit(target_, ta.dailyTransferred + amount, _dailyTransferLimit);
                }
                ta.dailyTransferred += amount;
            }
        }
        // V9R2-F1 fix: Block increaseAllowance entirely when token policy exists.
        // increaseAllowance has ADDITIVE semantics — N calls accumulate N×amount allowance,
        // bypassing the per-call maxApproval cap. Use approve() (set semantics) instead.
        // 0x39509351 = increaseAllowance(address,uint256)
        else if (selector == 0x39509351) {
            revert TokenApprovalExceedsLimit(target_, type(uint256).max, ta.maxApproval);
        }
        // M4 fix: permit(address,address,uint256,uint256,uint8,bytes32,bytes32) = 0xd505accf
        else if (selector == 0xd505accf && data.length >= 100) {
            uint256 amount;
            assembly { amount := mload(add(data, 100)) }
            if (amount > ta.maxApproval) {
                revert TokenApprovalExceedsLimit(target_, amount, ta.maxApproval);
            }
        }
        // R20 fix: decreaseAllowance(address,uint256) = 0xa457c2d7
        // Note: No enforcement needed for decreaseAllowance as it only reduces approvals
        // But track it for completeness to avoid unknown selector issues
        else if (selector == 0xa457c2d7 && data.length >= 68) {
            // decreaseAllowance is always safe - no limits needed
        }
    }

    // ═══════════════════════════════════════════════════════════
    //                      OWNERSHIP TRANSFER
    // ═══════════════════════════════════════════════════════════

    /**
     * @notice Request ownership transfer to a new address.
     *   The transfer executes after ownerTransferDelay (default 24h, configurable 1h–90d).
     *   Can be cancelled anytime before execution.
     */
    error CannotTransferToSelf();

    function requestOwnerTransfer(address newOwner) external onlyOwner notFrozen {
        if (newOwner == address(0)) revert ZeroAddress(1);
        if (newOwner == owner) revert CannotTransferToSelf();
        // R11: Prevent owner transfer to agentKey or guardianKey (key collision)
        if (newOwner == agentKey) revert KeyCollision(1);
        if (newOwner == guardianKey) revert KeyCollision(2);
        if (sessionKeyId[newOwner] != 0) revert KeyCollision(11);
        if (recoveryGuardians[newOwner]) revert KeyCollision(5);
        // M2 fix: Emit cancel event if overwriting a pending transfer
        if (pendingOwner != address(0)) {
            emit OwnerTransferCancelled(msg.sender);
        }
        pendingOwner = newOwner;
        ownerTransferRequestedAt = block.timestamp;
        emit OwnerTransferRequested(owner, newOwner, block.timestamp + ownerTransferDelay);
    }

    /**
     * @notice Execute a pending ownership transfer after the delay has elapsed.
     *   Can be called by the current owner OR the pending new owner.
     */
    function executeOwnerTransfer() external notFrozen {
        if (pendingOwner == address(0)) revert TransferNotRequested();
        if (msg.sender != owner && msg.sender != pendingOwner) revert NotOwner();
        // R9: Re-check ALL collision invariants at execution time (keys may have rotated since request)
        if (pendingOwner == agentKey) revert KeyCollision(1);
        if (pendingOwner == guardianKey) revert KeyCollision(2);
        if (sessionKeyId[pendingOwner] != 0) revert KeyCollision(11);
        if (recoveryGuardians[pendingOwner]) revert KeyCollision(5);
        if (block.timestamp < ownerTransferRequestedAt + ownerTransferDelay) {
            revert TransferDelayNotElapsed(ownerTransferRequestedAt + ownerTransferDelay);
        }

        address oldOwner = owner;
        owner = pendingOwner;
        pendingOwner = address(0);
        ownerTransferRequestedAt = 0;

        emit OwnerTransferExecuted(oldOwner, owner);
    }

    /**
     * @notice Cancel a pending ownership transfer.
     */
    function cancelOwnerTransfer() external onlyOwner {
        if (pendingOwner == address(0)) revert TransferNotRequested();
        pendingOwner = address(0);
        ownerTransferRequestedAt = 0;
        emit OwnerTransferCancelled(msg.sender);
    }

    /**
     * @notice Update the ownership transfer delay.
     *   - Increasing: takes effect immediately.
     *   - Decreasing: requires a timelock queue to prevent a compromised key from
     *     reducing the delay and then transferring ownership quickly.
     * @param newDelay The new delay in seconds (min 1 hour, max 90 days).
     */
    function setOwnerTransferDelay(uint256 newDelay) external onlyOwner {
        if (newDelay < MIN_TRANSFER_DELAY || newDelay > MAX_TRANSFER_DELAY) {
            revert TransferDelayOutOfRange(newDelay, MIN_TRANSFER_DELAY, MAX_TRANSFER_DELAY);
        }
        // Increasing is always safe — take effect immediately
        // Decreasing must go through the timelock queue to prevent attack
        if (newDelay < ownerTransferDelay) revert CannotDecreaseDelay();

        uint256 oldDelay = ownerTransferDelay;
        ownerTransferDelay = newDelay;
        emit OwnerTransferDelayUpdated(oldDelay, newDelay);
    }

    // ═══════════════════════════════════════════════════════════
    //                      UUPS UPGRADE TIMELOCK
    // ═══════════════════════════════════════════════════════════

    address public pendingImplementation;
    uint256 public upgradeRequestedAt;
    uint256 internal constant UPGRADE_DELAY = 24 hours;
    bool private _upgradeAuthorized;

    event UpgradeRequested(address indexed newImplementation, uint256 executeAfter);
    event UpgradeCancelled(address indexed cancelledBy);
    event UpgradeExecuted(address indexed newImplementation);

    /// @notice Request an upgrade. Owner initiates, AI guardian co-signs via executeUpgrade.
    function requestUpgrade(address newImplementation) external onlyOwner notFrozen {
        if (newImplementation == address(0)) revert ZeroImpl();
        if (newImplementation.code.length == 0) revert NotContract();
        pendingImplementation = newImplementation;
        upgradeRequestedAt = block.timestamp;
        emit UpgradeRequested(newImplementation, block.timestamp + UPGRADE_DELAY);
    }

    function cancelUpgrade() external onlyOwner {
        if (pendingImplementation == address(0)) revert NoPendingUpgrade();
        pendingImplementation = address(0);
        upgradeRequestedAt = 0;
        emit UpgradeCancelled(msg.sender);
    }

    /// @notice Execute upgrade after delay. Requires AI guardian co-sign (owner + guardian signatures).
    /// @param guardianSig EIP-191 signature from the AI guardian over the pending implementation address.
    function executeUpgrade(bytes calldata guardianSig) external onlyOwner notFrozen {
        if (pendingImplementation == address(0)) revert NoPendingUpgrade();
        if (block.timestamp < upgradeRequestedAt + UPGRADE_DELAY) revert UpgradeDelayNotElapsed();

        // Verify AI guardian co-sign (includes chainId to prevent cross-chain replay)
        bytes32 hash = keccak256(abi.encodePacked(
            "\x19Ethereum Signed Message:\n32",
            keccak256(abi.encodePacked(address(this), pendingImplementation, upgradeRequestedAt, block.chainid))
        ));
        address signer = hash.recover(guardianSig);
        if (signer != guardianKey) revert InvalidGuardianSig();

        address impl = pendingImplementation;
        pendingImplementation = address(0);
        upgradeRequestedAt = 0;

        emit UpgradeExecuted(impl);

        // Perform the UUPS upgrade (flag authorizes _authorizeUpgrade)
        _upgradeAuthorized = true;
        UUPSUpgradeable.upgradeToAndCall(impl, "");
        // Storage is replaced after upgrade — flag reset not strictly needed
        // but defensive in case upgrade preserves storage layout
        _upgradeAuthorized = false;
    }

    /// @dev UUPS authorization — ONLY allows upgrades through executeUpgrade flow.
    ///   Direct calls to upgradeToAndCall are blocked. This ensures timelock + guardian
    ///   co-sign cannot be bypassed.
    function _authorizeUpgrade(address) internal view override {
        if (!_upgradeAuthorized) revert NoPendingUpgrade();
    }

    // ═══════════════════════════════════════════════════════════
    //                      SOCIAL RECOVERY
    // ═══════════════════════════════════════════════════════════

    struct RecoveryRequest {
        address newOwner;
        uint256 initiatedAt;
        uint256 executeAfter;
        uint256 supportCount;
        uint256 epoch;        // R11: guardian epoch at initiation — must match current to execute
        bool executed;
        bool cancelled;
    }

    uint256 internal constant MAX_RECOVERY_GUARDIANS = 7;
    uint256 internal constant MIN_RECOVERY_DELAY = 48 hours;
    uint256 internal constant MAX_RECOVERY_DELAY = 30 days;
    uint256 internal constant DEFAULT_RECOVERY_DELAY = 48 hours;
    uint256 internal constant RECOVERY_EXPIRY = 30 days;

    mapping(address => bool) public recoveryGuardians;
    address[] public recoveryGuardianList;
    uint256 public recoveryThreshold;
    uint256 public recoveryDelay;
    uint256 public recoveryNonce;
    uint256 public guardianEpoch;  // R11: increments on guardian add/remove, invalidates pending recoveries

    mapping(bytes32 => RecoveryRequest) internal _recoveryRequests;
    mapping(bytes32 => mapping(address => bool)) public hasSupported;

    // ─── Recovery Events ───
    event GuardianAdded(address indexed guardian, uint256 threshold, uint256 totalGuardians);
    event GuardianRemoved(address indexed guardian, uint256 threshold, uint256 totalGuardians);
    event RecoveryThresholdUpdated(uint256 oldThreshold, uint256 newThreshold);
    event RecoveryDelayUpdated(uint256 oldDelay, uint256 newDelay);
    event RecoveryInitiated(bytes32 indexed recoveryId, address indexed newOwner, address indexed initiator, uint256 executeAfter);
    event RecoverySupported(bytes32 indexed recoveryId, address indexed guardian);
    event RecoveryExecuted(bytes32 indexed recoveryId, address indexed oldOwner, address indexed newOwner);
    event RecoveryCancelled(bytes32 indexed recoveryId, address indexed cancelledBy);

    // ─── Recovery Errors ───
    error NotRecoveryGuardian();
    error AlreadyRecoveryGuardian();
    error NotAlreadyRecoveryGuardian();
    error MaxGuardiansReached();
    error InvalidRecoveryThreshold();
    error InvalidRecoveryDelay();
    error RecoveryNotFound();
    error RecoveryAlreadyExecuted();
    error RecoveryAlreadyCancelled();
    error RecoveryThresholdNotMet();
    error RecoveryDelayNotElapsed();
    error AlreadySupported();
    error InvalidNewOwner();
    error RecoveryEpochMismatch();
    error RecoveryExpired();

    /// @notice Add a recovery guardian. Owner-only.
    function addRecoveryGuardian(address guardian_) external onlyOwner {
        if (guardian_ == address(0)) revert ZeroAddress(3);
        if (recoveryGuardians[guardian_]) revert AlreadyRecoveryGuardian();
        if (recoveryGuardianList.length >= MAX_RECOVERY_GUARDIANS) revert MaxGuardiansReached();
        // Recovery guardians must not be the AI guardian, agent, or owner
        if (guardian_ == guardianKey) revert KeyCollision(7);
        if (guardian_ == agentKey) revert KeyCollision(3);
        if (guardian_ == owner) revert KeyCollision(2);
        if (sessionKeyId[guardian_] != 0) revert KeyCollision(10);

        recoveryGuardians[guardian_] = true;
        recoveryGuardianList.push(guardian_);

        // Auto-set threshold if first guardian
        if (recoveryThreshold == 0) {
            recoveryThreshold = 1;
        }

        // Set default delay if not set
        if (recoveryDelay == 0) {
            recoveryDelay = DEFAULT_RECOVERY_DELAY;
        }

        // R11: Invalidate all pending recoveries when guardian set changes
        guardianEpoch++;

        emit GuardianAdded(guardian_, recoveryThreshold, recoveryGuardianList.length);
    }

    /// @notice Remove a recovery guardian. Owner-only.
    function removeRecoveryGuardian(address guardian_) external onlyOwner {
        if (!recoveryGuardians[guardian_]) revert NotAlreadyRecoveryGuardian();

        recoveryGuardians[guardian_] = false;

        // Remove from list
        uint256 len = recoveryGuardianList.length;
        for (uint256 i = 0; i < len; i++) {
            if (recoveryGuardianList[i] == guardian_) {
                recoveryGuardianList[i] = recoveryGuardianList[len - 1];
                recoveryGuardianList.pop();
                break;
            }
        }

        // Adjust threshold if needed
        if (recoveryThreshold > recoveryGuardianList.length) {
            uint256 oldThreshold = recoveryThreshold;
            recoveryThreshold = recoveryGuardianList.length;
            emit RecoveryThresholdUpdated(oldThreshold, recoveryThreshold);
        }

        // R11: Invalidate all pending recoveries when guardian set changes
        guardianEpoch++;

        emit GuardianRemoved(guardian_, recoveryThreshold, recoveryGuardianList.length);
    }

    /// @notice Set recovery threshold. Owner-only.
    function setRecoveryThreshold(uint256 threshold_) external onlyOwner {
        if (threshold_ == 0 || threshold_ > recoveryGuardianList.length) revert InvalidRecoveryThreshold();
        uint256 old = recoveryThreshold;
        recoveryThreshold = threshold_;
        guardianEpoch++; // R4-2: invalidate pending recoveries on threshold change
        emit RecoveryThresholdUpdated(old, threshold_);
    }

    /// @notice Set recovery delay. Owner-only.
    function setRecoveryDelay(uint256 delay_) external onlyOwner {
        if (delay_ < MIN_RECOVERY_DELAY || delay_ > MAX_RECOVERY_DELAY) revert InvalidRecoveryDelay();
        uint256 old = recoveryDelay;
        recoveryDelay = delay_;
        emit RecoveryDelayUpdated(old, delay_);
    }

    /// @notice Initiate recovery. Any recovery guardian. Works while frozen.
    function initiateRecovery(address newOwner_) external payable returns (bytes32 recoveryId) {
        _collectOpFee(2);
        if (!recoveryGuardians[msg.sender]) revert NotRecoveryGuardian();
        if (newOwner_ == address(0)) revert InvalidNewOwner();
        if (newOwner_ == owner) revert InvalidNewOwner();
        // R9: Prevent recovery to agent/guardian key (would break 3-tier model)
        if (newOwner_ == agentKey || newOwner_ == guardianKey) revert InvalidNewOwner();
        if (sessionKeyId[newOwner_] != 0) revert InvalidNewOwner();

        recoveryId = keccak256(abi.encodePacked(address(this), newOwner_, recoveryNonce));
        recoveryNonce++;

        RecoveryRequest storage req = _recoveryRequests[recoveryId];
        req.newOwner = newOwner_;
        req.initiatedAt = block.timestamp;
        req.supportCount = 1;
        req.epoch = guardianEpoch;  // R11: lock to current guardian set
        hasSupported[recoveryId][msg.sender] = true;

        uint256 executeAfter_ = 0;
        if (req.supportCount >= recoveryThreshold) {
            executeAfter_ = block.timestamp + recoveryDelay;
            req.executeAfter = executeAfter_;
        }

        emit RecoveryInitiated(recoveryId, newOwner_, msg.sender, executeAfter_);
    }

    /// @notice Support a recovery. Other recovery guardians. Works while frozen.
    function supportRecovery(bytes32 recoveryId) external {
        if (!recoveryGuardians[msg.sender]) revert NotRecoveryGuardian();

        RecoveryRequest storage req = _recoveryRequests[recoveryId];
        if (req.newOwner == address(0)) revert RecoveryNotFound();
        if (req.executed) revert RecoveryAlreadyExecuted();
        if (req.cancelled) revert RecoveryAlreadyCancelled();
        // R11: Reject support if guardian set changed since initiation
        if (req.epoch != guardianEpoch) revert RecoveryEpochMismatch();
        if (hasSupported[recoveryId][msg.sender]) revert AlreadySupported();

        hasSupported[recoveryId][msg.sender] = true;
        req.supportCount++;

        // Set executeAfter when threshold is first met
        if (req.executeAfter == 0 && req.supportCount >= recoveryThreshold) {
            req.executeAfter = block.timestamp + recoveryDelay;
        }

        emit RecoverySupported(recoveryId, msg.sender);
    }

    /// @notice Execute recovery after threshold met + delay elapsed. Anyone can call. Works while frozen.
    function executeRecovery(bytes32 recoveryId) external {
        RecoveryRequest storage req = _recoveryRequests[recoveryId];
        if (req.newOwner == address(0)) revert RecoveryNotFound();
        if (req.executed) revert RecoveryAlreadyExecuted();
        if (req.cancelled) revert RecoveryAlreadyCancelled();
        if (req.supportCount < recoveryThreshold) revert RecoveryThresholdNotMet();
        if (req.executeAfter == 0 || block.timestamp < req.executeAfter) revert RecoveryDelayNotElapsed();
        // R9: Re-check ALL collision invariants at execution time (keys may have rotated since initiation)
        if (req.newOwner == agentKey || req.newOwner == guardianKey) revert InvalidNewOwner();
        if (sessionKeyId[req.newOwner] != 0) revert InvalidNewOwner();
        // A-2: Reject stale recovery requests (30-day window after becoming executable)
        if (block.timestamp > req.executeAfter + RECOVERY_EXPIRY) revert RecoveryExpired();
        // R11: Reject if guardian set changed since initiation
        if (req.epoch != guardianEpoch) revert RecoveryEpochMismatch();

        req.executed = true;
        address oldOwner = owner;
        owner = req.newOwner;

        // Cancel any pending ownership transfer
        if (pendingOwner != address(0)) {
            pendingOwner = address(0);
            ownerTransferRequestedAt = 0;
        }

        // R8: Cancel pending upgrade + freeze account after recovery
        pendingImplementation = address(0);
        upgradeRequestedAt = 0;
        isFrozen = true;

        emit RecoveryExecuted(recoveryId, oldOwner, req.newOwner);
    }

    /// @notice Cancel recovery. Current owner only. Works while frozen.
    function cancelRecovery(bytes32 recoveryId) external onlyOwner {
        RecoveryRequest storage req = _recoveryRequests[recoveryId];
        if (req.newOwner == address(0)) revert RecoveryNotFound();
        if (req.executed) revert RecoveryAlreadyExecuted();
        if (req.cancelled) revert RecoveryAlreadyCancelled();

        req.cancelled = true;
        emit RecoveryCancelled(recoveryId, msg.sender);
    }

    // ─── Recovery Views ───

    function getRecoveryConfig() external view returns (uint256 threshold_, uint256 guardianCount_, uint256 delay_) {
        return (recoveryThreshold, recoveryGuardianList.length, recoveryDelay);
    }

    function getRecoveryStatus(bytes32 recoveryId) external view returns (
        address newOwner_, uint256 supportCount_, uint256 executeAfter_, bool executed_, bool cancelled_, uint256 epoch_
    ) {
        RecoveryRequest storage req = _recoveryRequests[recoveryId];
        return (req.newOwner, req.supportCount, req.executeAfter, req.executed, req.cancelled, req.epoch);
    }

    function isRecoveryGuardian(address addr) external view returns (bool) {
        return recoveryGuardians[addr];
    }

    function getRecoveryGuardians() external view returns (address[] memory) {
        return recoveryGuardianList;
    }

    // ═══════════════════════════════════════════════════════════
    //                      SESSION KEYS
    // ═══════════════════════════════════════════════════════════

    struct SessionKey {
        address key;                // The session key address
        uint256 validAfter;         // Unix timestamp: key becomes valid
        uint256 validUntil;         // Unix timestamp: key expires
        uint256 spendLimit;         // Max total value this session key can spend
        uint256 spent;              // Value spent so far
        uint256 maxTxValue;         // Per-tx value limit for this key (0 = use account default)
        uint256 cooldown;           // Min seconds between transactions (0 = no cooldown)
        uint256 lastUsedAt;         // Timestamp of last tx by this session key
        bool allowAllTargets;       // If true, bypasses target whitelist (uses account whitelist)
        bool revoked;               // Owner can revoke early
    }

    uint256 public nextSessionId;
    mapping(uint256 => SessionKey) public sessionKeys;
    mapping(address => uint256) public sessionKeyId;    // key address → session ID (0 = no session)
    mapping(uint256 => mapping(address => bool)) public sessionAllowedTargets;  // per-session target whitelist
    mapping(uint256 => mapping(bytes4 => bool)) public sessionAllowedFunctions; // per-session function whitelist

    // ─── Session Key Events ───
    event SessionKeyCreated(uint256 indexed sessionId, address indexed key, uint256 validAfter, uint256 validUntil, uint256 spendLimit);
    event SessionKeyRevoked(uint256 indexed sessionId, address indexed key);
    event SessionKeyUsed(uint256 indexed sessionId, address indexed target, uint256 value);

    // ─── Session Key Errors ───
    error SessionKeyExpired();
    error SessionKeyNotActive();
    error SessionKeyIsRevoked();
    error SessionKeySpendLimitExceeded(uint256 spent, uint256 limit);
    error SessionKeyTxLimitExceeded(uint256 value, uint256 limit);
    error SessionKeyTargetNotAllowed(address target);
    error SessionKeyFunctionNotAllowed(bytes4 selector);
    error SessionKeyNotFound();
    error SessionKeyAlreadyExists();
    error InvalidSessionDuration();
    error SessionKeyCooldownNotElapsed(uint256 nextAllowedAt);

    /**
     * @notice Create a session key with time-bounded, scope-limited permissions.
     * @param key_ Address of the session key (typically an ephemeral key)
     * @param validAfter_ When the key becomes valid (0 = immediately)
     * @param validUntil_ When the key expires (must be > validAfter)
     * @param spendLimit_ Total native value the key can spend (0 = no native value transfers; zero-value state-changing calls still allowed)
     * @param maxTxValue_ Per-tx limit (0 = use account default)
     * @param cooldown_ Min seconds between txs (0 = no cooldown)
     * @param allowAllTargets_ If true, uses account-level whitelist. If false, only session-specific targets.
     */
    function createSessionKey(
        address key_,
        uint256 validAfter_,
        uint256 validUntil_,
        uint256 spendLimit_,
        uint256 maxTxValue_,
        uint256 cooldown_,
        bool allowAllTargets_
    ) external payable onlyOwner notFrozen returns (uint256 sessionId) {
        _collectOpFee(1);
        if (key_ == address(0)) revert ZeroAddress(7);
        if (key_ == owner || key_ == agentKey || key_ == guardianKey) revert KeyCollision(4);
        if (key_ == pendingOwner) revert KeyCollision(9);
        if (recoveryGuardians[key_]) revert KeyCollision(8);
        if (sessionKeyId[key_] != 0) revert SessionKeyAlreadyExists();
        if (validAfter_ == 0) validAfter_ = block.timestamp;
        if (validUntil_ <= validAfter_) revert InvalidSessionDuration();

        sessionId = ++nextSessionId; // start at 1 so 0 = no session
        sessionKeys[sessionId] = SessionKey({
            key: key_,
            validAfter: validAfter_,
            validUntil: validUntil_,
            spendLimit: spendLimit_,
            spent: 0,
            maxTxValue: maxTxValue_,
            cooldown: cooldown_,
            lastUsedAt: 0,
            allowAllTargets: allowAllTargets_,
            revoked: false
        });
        sessionKeyId[key_] = sessionId;

        emit SessionKeyCreated(sessionId, key_, validAfter_, validUntil_, spendLimit_);
    }

    /**
     * @notice Add allowed targets for a session key.
     */
    function addSessionTarget(uint256 sessionId, address target_) external onlyOwner {
        _sessionKeyExists(sessionId);
        if (target_ == address(this)) revert BatchSelfCall();
        sessionAllowedTargets[sessionId][target_] = true;
    }

    /**
     * @notice Add allowed function selectors for a session key.
     */
    function addSessionFunction(uint256 sessionId, bytes4 selector) external onlyOwner {
        _sessionKeyExists(sessionId);
        sessionAllowedFunctions[sessionId][selector] = true;
    }

    /**
     * @notice Remove an allowed target for a session key. R11 fix.
     */
    function removeSessionTarget(uint256 sessionId, address target_) external onlyOwner {
        _sessionKeyExists(sessionId);
        sessionAllowedTargets[sessionId][target_] = false;
    }

    /**
     * @notice Remove an allowed function selector for a session key. R11 fix.
     */
    function removeSessionFunction(uint256 sessionId, bytes4 selector) external onlyOwner {
        _sessionKeyExists(sessionId);
        sessionAllowedFunctions[sessionId][selector] = false;
    }

    /**
     * @notice Revoke a session key. Owner-only.
     */
    function revokeSessionKey(uint256 sessionId) external onlyOwner {
        _sessionKeyExists(sessionId);
        SessionKey storage sk = sessionKeys[sessionId];
        // H2 fix: Clear mapping so address can be reused for new session keys
        delete sessionKeyId[sk.key];
        sk.revoked = true;
        emit SessionKeyRevoked(sessionId, sk.key);
    }

    /**
     * @notice Check if an address is a valid, active session key.
     */
    function isValidSessionKey(address key_) public view returns (bool) {
        uint256 sid = sessionKeyId[key_];
        if (sid == 0) return false;
        SessionKey storage sk = sessionKeys[sid];
        if (sk.revoked) return false;
        if (block.timestamp < sk.validAfter || block.timestamp > sk.validUntil) return false;
        return true;
    }

    /**
     * @notice Get session key details.
     */
    function getSessionKey(uint256 sessionId) external view returns (
        address key, uint256 validAfter, uint256 validUntil,
        uint256 spendLimit, uint256 spent, uint256 maxTxVal,
        uint256 cooldown, uint256 lastUsedAt,
        bool allowAllTargets, bool revoked
    ) {
        SessionKey storage sk = sessionKeys[sessionId];
        return (sk.key, sk.validAfter, sk.validUntil, sk.spendLimit, sk.spent, sk.maxTxValue, sk.cooldown, sk.lastUsedAt, sk.allowAllTargets, sk.revoked);
    }

    /**
     * @dev Validate and enforce session key policies during UserOp validation.
     *   Called from validateUserOp when a session key signs a UserOp.
     *
     *   NOTE on sk.spent: Same ERC-4337 validation/execution split caveat as dailySpent.
     *   If the UserOp passes validation but reverts during execution, sk.spent is still
     *   incremented (separate EVM frames). A compromised session key can exhaust its spend
     *   limit without moving actual funds. Mitigated by off-chain monitoring + revocation.
     */
    function _enforceSessionPolicy(uint256 sessionId, PackedUserOperation calldata userOp) internal {
        SessionKey storage sk = sessionKeys[sessionId];

        // Time bounds
        if (block.timestamp < sk.validAfter) revert SessionKeyNotActive();
        if (block.timestamp > sk.validUntil) revert SessionKeyExpired();
        if (sk.revoked) revert SessionKeyIsRevoked();

        // Parse execute calldata
        if (userOp.callData.length < 4) revert InvalidCallData();
        bytes4 outerSelector = bytes4(userOp.callData[0:4]);
        if (outerSelector != EXECUTE_SELECTOR) revert UnknownSelector(outerSelector);

        (address target_, uint256 value, bytes memory data) = abi.decode(
            userOp.callData[4:], (address, uint256, bytes)
        );

        // Block self-calls
        if (target_ == address(this)) revert TargetNotWhitelisted(target_);

        // Target whitelist — session-specific or account-level
        if (!sk.allowAllTargets) {
            if (!sessionAllowedTargets[sessionId][target_]) revert SessionKeyTargetNotAllowed(target_);
        } else {
            if (!allowedTargets[target_]) revert TargetNotWhitelisted(target_);
        }

        // V9R3-F3: Reject 1-3 byte calldata in session policy too
        if (data.length > 0 && data.length < 4) revert InvalidCallData();
        // L2 fix: Function whitelist — account-level is always enforced as baseline.
        // Session-level functions further restrict (AND logic, not OR).
        // Session keys must have their functions explicitly whitelisted at session level.
        if (data.length >= 4) {
            bytes4 innerSelector;
            assembly { innerSelector := mload(add(data, 32)) }
            // Account-level whitelist: baseline requirement for ALL callers
            if (!allowedFunctions[innerSelector]) revert SessionKeyFunctionNotAllowed(innerSelector);
            // Session-level whitelist: session keys need explicit per-session permission too
            if (!sessionAllowedFunctions[sessionId][innerSelector]) revert SessionKeyFunctionNotAllowed(innerSelector);
        }

        // Token allowance policies (also enforced for session keys)
        _enforceTokenPolicy(target_, data);

        // Cooldown rate limiting
        if (sk.cooldown > 0 && sk.lastUsedAt > 0) {
            uint256 nextAllowed = sk.lastUsedAt + sk.cooldown;
            if (block.timestamp < nextAllowed) revert SessionKeyCooldownNotElapsed(nextAllowed);
        }

        // Per-tx value limit
        uint256 txLimit = sk.maxTxValue > 0 ? sk.maxTxValue : maxTxValue;
        if (value > txLimit) revert SessionKeyTxLimitExceeded(value, txLimit);

        // Session spend limit
        if (sk.spent + value > sk.spendLimit) revert SessionKeySpendLimitExceeded(sk.spent + value, sk.spendLimit);
        sk.spent += value;
        sk.lastUsedAt = block.timestamp;

        // Also count against account daily limit
        _resetDailyIfNeeded();
        if (dailySpent + value > dailyLimit) revert ExceedsDailyLimit(dailySpent + value, dailyLimit);
        dailySpent += value;

        emit SessionKeyUsed(sessionId, target_, value);
    }

    // ═══════════════════════════════════════════════════════════
    //                      ERC-1271 (Smart Account Signatures)
    // ═══════════════════════════════════════════════════════════

    bytes4 internal constant ERC1271_MAGIC = 0x1626ba7e;
    bytes4 internal constant ERC1271_INVALID = 0xffffffff;

    // EIP-712 domain separator for chain-bound signature validation
    bytes32 internal constant DOMAIN_TYPEHASH = keccak256("EIP712Domain(uint256 chainId,address verifyingContract)");

    /**
     * @notice Compute the EIP-712 domain separator for this account.
     *   Binds to chainId + contract address, preventing cross-chain replay.
     *   Computed dynamically (not cached) to handle potential hard forks that change chainId.
     */
    function domainSeparator() public view returns (bytes32) {
        return keccak256(abi.encode(DOMAIN_TYPEHASH, block.chainid, address(this)));
    }

    /**
     * @notice ERC-1271: Validate a signature on behalf of this smart account.
     * @dev Dual-mode verification for maximum compatibility:
     *
     *   1. **Domain-bound (Sigil-native):** Signers sign
     *      `keccak256(abi.encodePacked("\x19\x01", domainSeparator(), hash))`
     *      This prevents cross-chain signature replay for Sigil-aware callers.
     *
     *   2. **Raw EIP-191 (DeFi protocols):** Signers sign
     *      `keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", hash))`
     *      This is what external protocols (Permit2, CoW, 1inch, etc.) expect.
     *      Cross-chain replay protection comes from the calling protocol's own
     *      EIP-712 domain separator which already includes chainId.
     *
     *   Accepts signatures from owner, agent key, or valid session keys.
     *   Owner signatures are always valid.
     *   Agent key signatures are valid when account is not frozen.
     *   Session key signatures are valid within their time/spend bounds.
     */
    function isValidSignature(bytes32 hash, bytes memory signature) external view override returns (bytes4) {
        if (signature.length != 65) return ERC1271_INVALID;

        // ── Mode 1: Domain-bound (Sigil-native callers) ──
        bytes32 domainDigest = keccak256(abi.encodePacked("\x19\x01", domainSeparator(), hash));
        address signer = domainDigest.recover(signature);
        if (signer != address(0) && _isAuthorizedSigner(signer)) return ERC1271_MAGIC;

        // ── Mode 2: Raw EIP-191 (external DeFi protocols) ──
        bytes32 ethHash = hash.toEthSignedMessageHash();
        signer = ethHash.recover(signature);
        if (signer != address(0) && _isAuthorizedSigner(signer)) return ERC1271_MAGIC;

        return ERC1271_INVALID;
    }

    /**
     * @dev Check if an address is an authorized signer for ERC-1271.
     *   R10 FIX: Agent key ERC-1271 signatures are RESTRICTED to prevent policy bypass.
     *   Only owner and session keys can sign arbitrary external protocol transactions.
     *   This prevents compromised agent keys from draining funds via Permit2, 1inch, etc.
     */
    function _isAuthorizedSigner(address signer) internal view returns (bool) {
        // Owner always valid for any signature
        if (signer == owner) return true;
        // R10: Agent key NOT authorized for ERC-1271 — prevents policy bypass
        // V9-F1: Session keys NOT authorized for ERC-1271 — same rationale as agent keys.
        // Session keys bypass ALL session restrictions (targets, functions, spend limits,
        // cooldowns) when signing via ERC-1271 because isValidSignature is view-only.
        // Both agent and session keys must operate through ERC-4337 UserOps with full
        // policy enforcement. Only the owner (hardware wallet) can sign ERC-1271.
        return false;
    }

    // ═══════════════════════════════════════════════════════════
    //                      ERC-165 (Interface Detection)
    // ═══════════════════════════════════════════════════════════

    /**
     * @notice ERC-165: Declare supported interfaces.
     */
    function supportsInterface(bytes4 interfaceId) external pure override returns (bool) {
        return
            interfaceId == type(IERC165).interfaceId ||      // 0x01ffc9a7
            interfaceId == type(IERC1271).interfaceId ||     // 0x1626ba7e
            interfaceId == 0x150b7a02 ||                     // IERC721Receiver
            interfaceId == 0x4e2312e0 ||                     // IERC1155Receiver
            interfaceId == 0x60fc6b6e;                       // IAccount (ERC-4337)
    }

    // ═══════════════════════════════════════════════════════════
    //                      NFT RECEIVE HOOKS
    // ═══════════════════════════════════════════════════════════

    /**
     * @notice ERC-721: Accept incoming NFT transfers.
     */
    function onERC721Received(address, address, uint256, bytes calldata) external pure returns (bytes4) {
        return 0x150b7a02; // IERC721Receiver.onERC721Received.selector
    }

    /**
     * @notice ERC-1155: Accept single token transfers.
     */
    function onERC1155Received(address, address, uint256, uint256, bytes calldata) external pure returns (bytes4) {
        return 0xf23a6e61; // IERC1155Receiver.onERC1155Received.selector
    }

    /**
     * @notice ERC-1155: Accept batch token transfers.
     */
    function onERC1155BatchReceived(address, address, uint256[] calldata, uint256[] calldata, bytes calldata) external pure returns (bytes4) {
        return 0xbc197c81; // IERC1155Receiver.onERC1155BatchReceived.selector
    }

    // ═══════════════════════════════════════════════════════════
    //                      MULTICALL
    // ═══════════════════════════════════════════════════════════

    /**
     * @notice Batch multiple admin calls in a single transaction.
     *   Only for owner admin operations (e.g. add targets, create session keys, update policy).
     *   NOT for value transfers — use executeBatch for that.
     * @param data Array of encoded function calls to this contract.
     * @return results Array of return data from each call.
     */
    function multicall(bytes[] calldata data) external onlyOwner nonReentrant returns (bytes[] memory results) {
        uint256 len = data.length;
        if (len == 0) revert EmptyMulticall();
        if (len > 20) revert MulticallTooLarge();
        results = new bytes[](len);
        for (uint256 i = 0; i < len; i++) {
            // H1 fix: Block dangerous selectors that could bypass timelocks/co-signing
            if (data[i].length < 4) revert MulticallEmptyCalldata();
            bytes4 sel = bytes4(data[i][0:4]);
            if (
                sel == UUPSUpgradeable.upgradeToAndCall.selector ||
                sel == this.executeUpgrade.selector ||
                sel == this.requestUpgrade.selector ||
                sel == this.executeRecovery.selector ||
                sel == this.executeOwnerTransfer.selector ||
                sel == this.executeQueued.selector ||
                sel == this.multicall.selector ||
                sel == this.emergencyWithdraw.selector ||
                sel == this.emergencyWithdrawToken.selector
            ) revert MulticallBlockedSelector();
            (bool success, bytes memory result) = address(this).delegatecall(data[i]);
            if (!success) revert MulticallFailed(i);
            results[i] = result;
        }
    }

    // _toStr removed — replaced string requires with custom errors for size optimization

    // ═══════════════════════════════════════════════════════════
    //                      STORAGE GAPS
    // ═══════════════════════════════════════════════════════════

    uint256[42] private __gap_recovery;     // 50 - 8 used (recoveryGuardians, recoveryGuardianList, recoveryThreshold, recoveryDelay, recoveryNonce, guardianEpoch, _recoveryRequests, hasSupported)
    uint256[45] private __gap_sessions;     // 50 - 5 used (nextSessionId, sessionKeys, sessionKeyId, sessionAllowedTargets, sessionAllowedFunctions)
    uint256[47] private __gap_upgrade;      // 50 - 3 used (pendingImplementation, upgradeRequestedAt, _upgradeAuthorized)

    // ═══════════════════════════════════════════════════════════
    //                  OPERATION FEE COLLECTION
    // ═══════════════════════════════════════════════════════════

    /// @dev Collect operation fee from msg.value and forward to factory.
    ///   op: 1 = sessionKey, 2 = recovery. Fee of 0 = free (no payment required).
    function _collectOpFee(uint8 op) internal {
        (uint128 skFee, uint128 recFee) = _getOpFees();
        uint256 required = op == 1 ? skFee : recFee;
        if (required == 0) return;
        if (msg.value < required) revert InsufficientOpFee(msg.value, required);
        // Forward fee to factory (which accumulates fees for treasury withdrawal)
        (bool ok,) = factory.call{value: required}("");
        require(ok, "Fee forward failed");
        // Refund excess
        uint256 excess = msg.value - required;
        if (excess > 0) {
            (bool refunded,) = msg.sender.call{value: excess}("");
            if (!refunded) {} // non-critical: excess stays in account
        }
    }

    /// @dev Read operation fees from factory. Returns (sessionKeyFee, recoveryFee).
    function _getOpFees() internal view returns (uint128, uint128) {
        // Use low-level call to avoid circular import (factory imports account)
        (bool ok, bytes memory ret) = factory.staticcall(
            abi.encodeWithSignature("getAllFees()")
        );
        if (!ok) return (0, 0); // graceful fallback: free if factory doesn't support fees
        (,uint128 skFee, uint128 recFee,,) = abi.decode(ret, (uint256, uint128, uint128, address, uint256));
        return (skFee, recFee);
    }

    // ═══════════════════════════════════════════════════════════
    //                      RECEIVE ETH
    // ═══════════════════════════════════════════════════════════

    receive() external payable {
        // R13: Reject zero-value deposits to prevent event spam / log pollution
        if (msg.value == 0) revert ZeroDeposit();
        emit Deposited(msg.sender, msg.value);
    }

    // R14: payable fallback to handle non-empty calldata ETH transfers (e.g. from contracts)
    // Reverts on actual function calls to prevent accidental proxy delegation
    fallback() external payable {
        if (msg.data.length >= 4) {
            revert InvalidCallData();
        }
        // R11: Consistent with receive() — reject zero-value calls
        if (msg.value == 0) revert ZeroDeposit();
        // Allow ETH transfers with data < 4 bytes (some contracts send with empty/short data)
        emit Deposited(msg.sender, msg.value);
    }
}
