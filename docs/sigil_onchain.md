# Sigil — Smart Contract Documentation

> Complete reference for Sigil's on-chain components. ERC-4337 smart accounts with embedded policy engines.

---

## Overview

Sigil's on-chain layer consists of three contracts:

| Contract | Purpose |
|----------|---------|
| `SigilAccount.sol` | The user's smart account. Holds funds, enforces policy, manages keys. |
| `SigilAccountFactory.sol` | Deploys new SigilAccount instances via `CREATE2` (deterministic addresses). |
| `PolicyEngine.sol` | Library/module containing the policy check logic (used by SigilAccount). |

All contracts are ERC-4337 compatible and deployed behind UUPS proxies for upgradeability.

---

## SigilAccount.sol

### Inheritance

```
SigilAccount
  ├── BaseAccount (ERC-4337)         — validateUserOp interface
  ├── UUPSUpgradeable (OpenZeppelin) — proxy upgrade pattern
  ├── Initializable (OpenZeppelin)   — proxy initialization
  └── PolicyEngine                   — policy check logic
```

### Storage Layout

```solidity
// ─── Keys ───
address public owner;              // Owner key (hardware wallet). Ultimate authority.
address public agentKey;           // Agent key (TEE/VPS). Scoped to policy limits.
address public guardianKey;        // Guardian key (co-signer). Can only co-sign or reject.
address public recoveryAddress;    // Time-delayed recovery address.

// ─── Policy Parameters ───
uint256 public maxTxValue;         // Max value per single transaction (wei)
uint256 public dailyLimit;         // Max total value per 24h period (wei)
uint256 public weeklyLimit;        // Max total value per 7-day period (wei)
uint256 public guardianThreshold;  // Value above which guardian co-sign required
uint256 public ownerThreshold;     // Value above which owner signature required
uint256 public timelockDuration;   // Delay for high-value txs (default: 10 min)

// ─── Whitelist/Blacklist ───
mapping(address => bool) public allowedTargets;    // Whitelisted contract addresses
mapping(bytes4 => bool) public allowedFunctions;   // Whitelisted function selectors
mapping(address => bool) public blockedAddresses;  // Blacklisted addresses

// ─── Velocity Tracking ───
uint256 public dailySpent;         // Amount spent in current 24h window
uint256 public dailyResetTime;     // Timestamp when daily counter resets
uint256 public weeklySpent;        // Amount spent in current 7-day window
uint256 public weeklyResetTime;    // Timestamp when weekly counter resets

// ─── Guardian Liveness ───
uint256 public lastGuardianHeartbeat;  // Last heartbeat timestamp
uint256 public heartbeatTimeout;       // Max time without heartbeat (default: 24h)
bool public isDegraded;                // Whether operating in degraded mode
bool public isFrozen;                  // Whether account is frozen

// ─── Recovery ───
address public pendingRecoveryOwner;   // New owner proposed via recovery
uint256 public recoveryInitiatedAt;    // When recovery was initiated
uint256 public recoveryTimelock;       // Delay before recovery executes (default: 48h)

// ─── Upgrade ───
address public pendingImplementation;  // New implementation announced
uint256 public upgradeAnnouncedAt;     // When upgrade was announced
uint256 public upgradeTimelock;        // Delay before upgrade executes (default: 72h)
```

### validateUserOp (Core Function)

This is the entry point for ALL transactions. Called by the ERC-4337 EntryPoint contract. There is no bypass path.

```solidity
function validateUserOp(
    PackedUserOperation calldata userOp,
    bytes32 userOpHash,
    uint256 missingAccountFunds
) external override returns (uint256 validationData) {
    // 1. FROZEN CHECK
    require(!isFrozen, "Account frozen");

    // 2. SIGNATURE VERIFICATION
    // Extract signer from userOp.signature
    // Must be agentKey, owner, or (agentKey + guardianKey for co-signed ops)
    address signer = _validateSignature(userOp, userOpHash);
    require(signer == agentKey || signer == owner, "Invalid signer");

    // 3. NONCE CHECK (replay protection — handled by EntryPoint)

    // 4. POLICY ENGINE (cannot bypass)
    _enforcePolicies(userOp);

    // 5. PAY PREFUND
    if (missingAccountFunds > 0) {
        (bool success,) = payable(msg.sender).call{value: missingAccountFunds}("");
        require(success, "Prefund failed");
    }

    return 0; // valid
}
```

### Policy Engine (_enforcePolicies)

```solidity
function _enforcePolicies(PackedUserOperation calldata userOp) internal {
    address target = _extractTarget(userOp.callData);
    bytes4 selector = _extractSelector(userOp.callData);
    uint256 value = _extractValue(userOp.callData);

    // ─── Target Whitelist ───
    require(allowedTargets[target], "Target not whitelisted");

    // ─── Blocked Address ───
    require(!blockedAddresses[target], "Target is blocked");

    // ─── Function Whitelist ───
    require(allowedFunctions[selector], "Function not allowed");

    // ─── Per-Transaction Limit ───
    require(value <= maxTxValue, "Exceeds per-tx limit");

    // ─── Velocity Checks ───
    _resetDailyIfNeeded();
    _resetWeeklyIfNeeded();
    require(dailySpent + value <= dailyLimit, "Exceeds daily limit");
    require(weeklySpent + value <= weeklyLimit, "Exceeds weekly limit");

    // ─── Guardian Co-Sign (tiered) ───
    if (value > guardianThreshold) {
        _requireGuardianCoSign(userOp);
    }

    // ─── Owner Co-Sign (high value) ───
    if (value > ownerThreshold) {
        _requireOwnerCoSign(userOp);
    }

    // ─── Degradation Check ───
    if (_isGuardianOffline()) {
        _applyDegradedLimits(value, target);
    }

    // ─── Update Velocity ───
    dailySpent += value;
    weeklySpent += value;
}
```

### Degradation Logic

```solidity
function _isGuardianOffline() internal view returns (bool) {
    return block.timestamp - lastGuardianHeartbeat > 5 minutes;
}

function _applyDegradedLimits(uint256 value, address target) internal view {
    // In degraded mode, limits are halved
    require(value <= maxTxValue / 2, "Degraded: per-tx limit halved");
    require(dailySpent + value <= dailyLimit / 2, "Degraded: daily limit halved");
    // New addresses blocked entirely in degraded mode
    require(_hasBeenUsedBefore(target), "Degraded: new addresses blocked");
}

function _checkDeadManSwitch() internal {
    if (block.timestamp - lastGuardianHeartbeat > heartbeatTimeout) {
        isFrozen = true;
        emit AccountFrozen("Dead-man switch: guardian offline > 24h");
    }
}
```

### Owner-Only Functions

```solidity
// ─── Policy Management ───
function updatePolicy(PolicyParams calldata params) external onlyOwner { ... }
function addAllowedTarget(address target) external onlyOwner { ... }
function removeAllowedTarget(address target) external onlyOwner { ... }
function addAllowedFunction(bytes4 selector) external onlyOwner { ... }
function removeAllowedFunction(bytes4 selector) external onlyOwner { ... }
function addBlockedAddress(address addr) external onlyOwner { ... }

// ─── Key Management ───
function rotateAgentKey(address newAgentKey) external onlyOwner { ... }
function addGuardian(address guardian) external onlyOwner { ... }
function removeGuardian(address guardian) external onlyOwner { ... }

// ─── Emergency ───
function freeze() external onlyOwner { ... }
function unfreeze() external onlyOwner { ... }
function emergencyWithdraw(address payable to) external onlyOwner { ... }
```

### Social Recovery

```solidity
// Initiated by guardian + recovery address together
function initiateRecovery(address newOwner) external {
    require(
        msg.sender == guardianKey || msg.sender == recoveryAddress,
        "Not authorized for recovery"
    );
    pendingRecoveryOwner = newOwner;
    recoveryInitiatedAt = block.timestamp;
    emit RecoveryInitiated(newOwner, block.timestamp + recoveryTimelock);
}

// Owner can cancel during timelock window
function cancelRecovery() external onlyOwner {
    delete pendingRecoveryOwner;
    delete recoveryInitiatedAt;
    emit RecoveryCancelled();
}

// Execute after timelock expires
function executeRecovery() external {
    require(pendingRecoveryOwner != address(0), "No recovery pending");
    require(
        block.timestamp >= recoveryInitiatedAt + recoveryTimelock,
        "Timelock not expired"
    );
    owner = pendingRecoveryOwner;
    delete pendingRecoveryOwner;
    delete recoveryInitiatedAt;
    emit RecoveryExecuted(owner);
}
```

### UUPS Upgrades

```solidity
// Step 1: Announce upgrade (starts 72h timelock)
function announceUpgrade(address newImplementation) external onlyOwner {
    pendingImplementation = newImplementation;
    upgradeAnnouncedAt = block.timestamp;
    emit UpgradeAnnounced(newImplementation, block.timestamp + upgradeTimelock);
}

// Step 2: Execute upgrade after timelock
function executeUpgrade() external onlyOwner {
    require(pendingImplementation != address(0), "No upgrade announced");
    require(
        block.timestamp >= upgradeAnnouncedAt + upgradeTimelock,
        "Timelock not expired"
    );
    _upgradeToAndCall(pendingImplementation, "");
    delete pendingImplementation;
    delete upgradeAnnouncedAt;
    emit UpgradeExecuted(pendingImplementation);
}

// Cancel pending upgrade
function cancelUpgrade() external onlyOwner {
    delete pendingImplementation;
    delete upgradeAnnouncedAt;
    emit UpgradeCancelled();
}

// Required by UUPSUpgradeable — only owner can authorize
function _authorizeUpgrade(address) internal override onlyOwner {}
```

### Events

```solidity
event PolicyUpdated(PolicyParams params);
event AgentKeyRotated(address oldKey, address newKey);
event GuardianAdded(address guardian);
event GuardianRemoved(address guardian);
event AccountFrozen(string reason);
event AccountUnfrozen();
event EmergencyWithdraw(address to, uint256 amount);
event TransactionBlocked(bytes32 userOpHash, string reason);
event GuardianHeartbeat(uint256 timestamp);
event RecoveryInitiated(address newOwner, uint256 executeAfter);
event RecoveryCancelled();
event RecoveryExecuted(address newOwner);
event UpgradeAnnounced(address newImplementation, uint256 executeAfter);
event UpgradeExecuted(address newImplementation);
event UpgradeCancelled();
event DegradedModeEntered(uint256 lastHeartbeat);
event DegradedModeExited();
```

---

## SigilAccountFactory.sol

```solidity
contract SigilAccountFactory {
    // CREATE2 deployment for deterministic addresses
    function createAccount(
        address owner,
        address agentKey,
        address guardianKey,
        PolicyParams calldata initialPolicy,
        uint256 salt
    ) external returns (SigilAccount account) {
        // Deterministic address based on owner + salt
        bytes32 create2Salt = keccak256(abi.encodePacked(owner, salt));

        account = SigilAccount(payable(
            new ERC1967Proxy{salt: create2Salt}(
                address(accountImplementation),
                abi.encodeCall(
                    SigilAccount.initialize,
                    (owner, agentKey, guardianKey, initialPolicy)
                )
            )
        ));

        emit AccountCreated(address(account), owner, agentKey, guardianKey);
    }

    // Predict address before deployment
    function getAddress(
        address owner,
        uint256 salt
    ) external view returns (address) { ... }
}
```

---

## PolicyParams Struct

```solidity
struct PolicyParams {
    uint256 maxTxValue;           // Max value per single transaction
    uint256 dailyLimit;           // Max total value per 24h
    uint256 weeklyLimit;          // Max total value per 7 days
    uint256 guardianThreshold;    // Co-sign above this value
    uint256 ownerThreshold;       // Owner required above this value
    uint256 timelockDuration;     // Delay for high-value txs
    address[] allowedTargets;     // Initial target whitelist
    bytes4[] allowedFunctions;    // Initial function whitelist
}
```

---

## Deployment

### Testnet (0G Testnet + Ethereum Sepolia)

```bash
# Deploy to 0G Testnet
forge script script/Deploy.s.sol:DeployScript \
  --rpc-url $OG_TESTNET_RPC \
  --private-key $DEPLOYER_KEY \
  --broadcast

# Deploy to Ethereum Sepolia
forge script script/Deploy.s.sol:DeployScript \
  --rpc-url $SEPOLIA_RPC \
  --private-key $DEPLOYER_KEY \
  --broadcast
```

### Deploy Script

```solidity
contract DeployScript is Script {
    function run() external {
        vm.startBroadcast();

        // 1. Deploy account implementation
        SigilAccount implementation = new SigilAccount();

        // 2. Deploy factory
        SigilAccountFactory factory = new SigilAccountFactory(
            address(implementation),
            ENTRYPOINT_ADDRESS  // ERC-4337 EntryPoint
        );

        vm.stopBroadcast();

        console.log("Implementation:", address(implementation));
        console.log("Factory:", address(factory));
    }
}
```

---

## Testing Strategy

### Unit Tests (Foundry)

```
test/
├── SigilAccount.t.sol          — Core account tests
├── PolicyEngine.t.sol          — Policy check tests
├── SocialRecovery.t.sol        — Recovery flow tests
├── UUPSUpgrade.t.sol           — Upgrade flow tests
├── Degradation.t.sol           — Guardian offline tests
├── Factory.t.sol               — Factory deployment tests
└── Integration.t.sol           — End-to-end with EntryPoint
```

### Key Test Scenarios

```solidity
// Policy enforcement
function test_blockUnwhitelistedTarget() public { ... }
function test_blockExceedingTxLimit() public { ... }
function test_blockExceedingDailyLimit() public { ... }
function test_blockUnwhitelistedFunction() public { ... }
function test_blockBlacklistedAddress() public { ... }
function test_requireGuardianAboveThreshold() public { ... }
function test_requireOwnerAboveHighThreshold() public { ... }

// Velocity tracking
function test_dailyLimitResetsAfter24h() public { ... }
function test_weeklyLimitResetsAfter7d() public { ... }
function test_cumulativeSpendingTracked() public { ... }

// Degradation
function test_degradedModeHalvesLimits() public { ... }
function test_degradedModeBlocksNewAddresses() public { ... }
function test_deadManSwitchFreezes() public { ... }

// Recovery
function test_recoveryTimelockEnforced() public { ... }
function test_ownerCanCancelRecovery() public { ... }
function test_recoveryChangesOwner() public { ... }

// Upgrades
function test_upgradeTimelockEnforced() public { ... }
function test_onlyOwnerCanUpgrade() public { ... }
function test_upgradePreservesState() public { ... }

// Fuzzing
function testFuzz_cannotExceedLimits(uint256 value) public { ... }
function testFuzz_signatureValidation(bytes memory sig) public { ... }
```

---

## Gas Estimates

| Operation | Estimated Gas | Cost on Base L2 |
|-----------|--------------|-----------------|
| Deploy SigilAccount (via factory) | ~2,500,000 | ~$0.01 |
| Simple transfer (within policy) | ~150,000 | ~$0.001 |
| Transfer with guardian co-sign | ~200,000 | ~$0.002 |
| Update policy | ~100,000 | ~$0.001 |
| Rotate agent key | ~50,000 | ~$0.0005 |
| Freeze/Unfreeze | ~30,000 | ~$0.0003 |
| Guardian heartbeat | ~30,000 | ~$0.0003 |
| Initiate recovery | ~50,000 | ~$0.0005 |

---

## ERC-4337 Integration

### EntryPoint

The standard ERC-4337 EntryPoint contract is deployed on all supported chains. Sigil does NOT deploy its own EntryPoint.

| Chain | EntryPoint Address |
|-------|-------------------|
| Ethereum | `0x0000000071727De22E5E9d8BAf0edAc6f37da032` (v0.7) |
| Base | Same address (deterministic deployment) |
| 0G Chain | To be deployed / verified |

### Bundler

UserOperations are submitted to a bundler which batches them into regular transactions. For demo, use:
- **Stackup Bundler** (free tier)
- **Pimlico** (free tier for testnet)
- **Self-hosted**: Run `@account-abstraction/bundler` on VPS

### Paymaster (Optional)

A Paymaster can sponsor gas for users (they don't need to hold ETH). Consider for onboarding UX:
- Deploy simple `SigilPaymaster.sol` that sponsors account creation
- Fund with small ETH balance for testnet

---

## Security Considerations

### Why NOT Safe

Safe's Transaction Guards only apply to multisig transactions. Modules can bypass guards entirely (open issue #335). SigilAccount embeds policy enforcement in `validateUserOp` which is called by the EntryPoint before ANY execution — no bypass path exists.

### Reentrancy

- `validateUserOp` is called before execution, not during
- State changes (velocity tracking) happen in validation, before execution
- No external calls during validation except signature verification

### Upgrade Safety

- UUPS pattern: only owner can authorize upgrades
- 72-hour timelock prevents instant malicious upgrades
- Old implementation address stored for rollback
- Initializer pattern prevents re-initialization attacks

### Key Compromise Scenarios

| Compromised Key | Impact | Mitigation |
|----------------|--------|------------|
| Agent key only | Can transact within policy limits | Owner freezes, rotates key |
| Guardian key only | Can co-sign anything (but can't initiate) | Owner removes guardian, adds new one |
| Agent + Guardian | Can transact up to ownerThreshold | On-chain limits still enforced. Owner freezes. |
| Owner key | Full control | Social recovery via guardian + recovery address |
| All three keys | Full compromise | 48h recovery timelock is last defense |
