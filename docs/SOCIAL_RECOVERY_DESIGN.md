# Social Recovery & UUPS Upgrade Design

> **Status:** Draft — Week 6 design, pending review before implementation
> **Date:** 2026-02-11
> **Author:** Arvi

---

## Part 1: Social Recovery Module

### Overview

Guardian-based N-of-M threshold recovery for SigilAccount. If the owner key is lost or compromised, a quorum of pre-designated guardians can transfer ownership to a new address after a mandatory delay period.

### Architecture

```
Owner designates guardians (on-chain)
    ↓
Owner key lost/compromised
    ↓
Guardian initiates recovery → new owner proposed
    ↓
M-of-N guardians confirm
    ↓
Recovery delay starts (min 48h)
    ↓
Current owner can CANCEL during delay
    ↓
After delay: new owner takes over
```

### Parameters

| Parameter | Default | Range | Notes |
|-----------|---------|-------|-------|
| N (total guardians) | 3 | 1–7 | Gas cost scales with N |
| M (threshold) | 2 | 1–N | Must be > N/2 recommended |
| Recovery delay | 48 hours | 48h–30d | Configurable per account |
| Guardian cooldown | 24 hours | — | Time before guardian can re-vote after cancellation |

### Solidity Interface

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface ISigilRecovery {
    // ─── Events ───
    event GuardianAdded(address indexed guardian, uint256 threshold, uint256 totalGuardians);
    event GuardianRemoved(address indexed guardian, uint256 threshold, uint256 totalGuardians);
    event ThresholdUpdated(uint256 oldThreshold, uint256 newThreshold);
    event RecoveryInitiated(bytes32 indexed recoveryId, address indexed newOwner, uint256 executeAfter);
    event RecoverySupported(bytes32 indexed recoveryId, address indexed guardian);
    event RecoveryExecuted(bytes32 indexed recoveryId, address indexed oldOwner, address indexed newOwner);
    event RecoveryCancelled(bytes32 indexed recoveryId, address indexed cancelledBy);

    // ─── Guardian Management (owner-only) ───
    function addRecoveryGuardian(address guardian) external;
    function removeRecoveryGuardian(address guardian) external;
    function setRecoveryThreshold(uint256 threshold) external;
    function setRecoveryDelay(uint256 delay) external;

    // ─── Recovery Flow ───
    function initiateRecovery(address newOwner) external;    // any guardian
    function supportRecovery(bytes32 recoveryId) external;   // other guardians
    function executeRecovery(bytes32 recoveryId) external;   // anyone, after delay + threshold met
    function cancelRecovery(bytes32 recoveryId) external;    // current owner only

    // ─── Views ───
    function isRecoveryGuardian(address addr) external view returns (bool);
    function getRecoveryConfig() external view returns (uint256 threshold, uint256 guardianCount, uint256 delay);
    function getRecoveryStatus(bytes32 recoveryId) external view returns (
        address newOwner, uint256 supportCount, uint256 executeAfter, bool executed, bool cancelled
    );
}
```

### Recovery Data Structures

```solidity
struct RecoveryRequest {
    address newOwner;
    uint256 initiatedAt;
    uint256 executeAfter;
    uint256 supportCount;
    bool executed;
    bool cancelled;
    mapping(address => bool) hasSupported;
}

// Storage
mapping(address => bool) public recoveryGuardians;
uint256 public recoveryGuardianCount;
uint256 public recoveryThreshold;        // M
uint256 public recoveryDelay;            // min 48h
uint256 public constant MIN_RECOVERY_DELAY = 48 hours;
mapping(bytes32 => RecoveryRequest) public recoveryRequests;
uint256 public recoveryNonce;            // prevents recoveryId collisions
```

### Integration with SigilAccount

The recovery module integrates as an extension to SigilAccount:

1. **Option A — Inheritance:** `SigilAccount is ISigilRecovery` — add recovery storage and functions directly. Simpler but increases contract size.

2. **Option B — Module pattern:** Separate `SigilRecoveryModule` contract that the account delegates to. Cleaner separation but requires a delegate call setup.

**Recommendation: Option A** for V1. The contract is well under the 24KB limit, and recovery is core security functionality that shouldn't be delegated.

### Recovery Flow Detail

1. **Initiation:** Any recovery guardian calls `initiateRecovery(newOwner)`. This counts as the first support vote.
2. **Support:** Other guardians call `supportRecovery(recoveryId)`. Each guardian can only vote once per recovery.
3. **Threshold check:** Once `supportCount >= recoveryThreshold`, the delay timer starts.
4. **Delay period:** `executeAfter = block.timestamp + recoveryDelay` (min 48h). Owner can cancel during this window.
5. **Execution:** After delay, anyone can call `executeRecovery()`. This transfers ownership and invalidates the old owner's queued transactions.
6. **Cancellation:** Current owner calls `cancelRecovery()` at any time before execution. This resets the recovery and triggers a guardian cooldown.

### Security Considerations

1. **Guardian collusion:** M-of-N threshold means M guardians colluding can take over. Mitigation: delay period gives owner time to cancel. Recommended M > N/2.

2. **Guardian key compromise:** Single guardian compromise is insufficient (threshold). If M guardians are compromised, the delay window is the last defense.

3. **Griefing:** Guardians can repeatedly initiate recoveries to annoy the owner. Mitigation: guardian cooldown after cancellation (24h).

4. **Social engineering:** Attacker convinces guardians the owner lost their key. Mitigation: delay period + owner cancellation. Guardians should verify out-of-band.

5. **Guardian liveness:** If guardians become unreachable, recovery is impossible. Mitigation: owner should periodically verify guardian availability and rotate as needed.

6. **Recovery + ownership transfer race:** If owner is transferring ownership AND a recovery is active, they conflict. Rule: recovery cancels any pending ownership transfer. Ownership transfer cancels any pending recovery.

7. **Frozen account:** Recovery should work even when the account is frozen (the owner may have frozen it and then lost the key). The `notFrozen` modifier should NOT apply to recovery execution.

---

## Part 2: UUPS Upgrade Pattern

### Overview

ERC1967 proxy + UUPS (Universal Upgradeable Proxy Standard, ERC1822) for SigilAccount. Allows post-deployment bug fixes and feature additions while preserving account state and address.

### Why UUPS over Transparent Proxy

- **Gas:** No admin slot check on every call (UUPS puts upgrade logic in implementation)
- **Simpler:** No separate ProxyAdmin contract needed
- **Already proxied:** SigilAccount already uses ERC1967Proxy via the factory — just need to add `UUPSUpgradeable` to the implementation

### Architecture

```
User → ERC1967Proxy (same address forever)
           ↓ delegatecall
       SigilAccountV1 (current implementation)
           ↓ upgradeTo()
       SigilAccountV2 (new implementation)
```

### Implementation Changes

```solidity
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

contract SigilAccount is BaseAccount, Initializable, ReentrancyGuard, UUPSUpgradeable {

    // ─── Upgrade Timelock ───
    address public pendingImplementation;
    uint256 public upgradeRequestedAt;
    uint256 public constant UPGRADE_DELAY = 24 hours;

    event UpgradeRequested(address indexed newImplementation, uint256 executeAfter);
    event UpgradeCancelled(address indexed cancelledBy);

    /// @notice Request an upgrade. Takes effect after UPGRADE_DELAY.
    function requestUpgrade(address newImplementation) external onlyOwner {
        require(newImplementation != address(0), "Zero implementation");
        require(newImplementation.code.length > 0, "Not a contract");
        pendingImplementation = newImplementation;
        upgradeRequestedAt = block.timestamp;
        emit UpgradeRequested(newImplementation, block.timestamp + UPGRADE_DELAY);
    }

    function cancelUpgrade() external onlyOwner {
        pendingImplementation = address(0);
        upgradeRequestedAt = 0;
        emit UpgradeCancelled(msg.sender);
    }

    /// @dev UUPS authorization — only allows timelocked upgrades by owner
    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {
        require(pendingImplementation == newImplementation, "Not the pending implementation");
        require(block.timestamp >= upgradeRequestedAt + UPGRADE_DELAY, "Upgrade delay not elapsed");
        // Reset after authorization
        pendingImplementation = address(0);
        upgradeRequestedAt = 0;
    }

    // ─── Storage Gaps ───
    // Reserve 50 slots for future storage variables in each logical section
    // This prevents storage collisions when adding variables in upgrades
    uint256[50] private __gap_recovery;     // reserved for social recovery
    uint256[50] private __gap_modules;      // reserved for future modules
    uint256[50] private __gap_upgrade;      // reserved for upgrade mechanics
}
```

### Storage Layout Rules

1. **Never remove or reorder** existing storage variables
2. **Only append** new variables before the gap declarations
3. **Reduce gap size** by the number of new slots added (e.g., adding 3 vars → `uint256[47] private __gap`)
4. **Document storage slot numbers** in comments for each variable
5. **Use `@openzeppelin/upgrades-core`** to validate storage layout compatibility between versions

### Migration Strategy

Current contracts already use ERC1967Proxy via the factory. Migration path:

1. **Deploy new implementation** (SigilAccountV2 with UUPSUpgradeable)
2. **Factory upgrade:** Deploy new factory pointing to V2 implementation. New accounts get UUPS natively.
3. **Existing accounts:** Owner calls `upgradeToAndCall()` on the proxy (the ERC1967Proxy already supports this). But current V1 implementation lacks `_authorizeUpgrade`, so:
   - **One-time migration path:** Deploy a `SigilAccountV1_5` that adds ONLY `UUPSUpgradeable` + `_authorizeUpgrade` with a simple owner check (no timelock for the first upgrade)
   - Owner upgrades V1 → V1.5 (via raw proxy upgrade since V1 has no UUPS guard)
   - Owner upgrades V1.5 → V2 (now with proper timelock)
4. **Alternative:** Accept that existing V1 accounts can't self-upgrade. Users deploy new V2 accounts and migrate funds. Simpler but worse UX.

**Recommendation:** Option 3 (V1.5 bridge) for accounts with significant value. Option 4 for low-value testnet accounts.

### Security Considerations

1. **Upgrade authorization:** Timelocked + owner-only. No one else can upgrade.
2. **Implementation validation:** Check `newImplementation.code.length > 0` to prevent bricking.
3. **Storage collisions:** Gaps + OpenZeppelin storage validation tooling.
4. **Bricking risk:** If a buggy implementation is deployed, the account could become unusable. Mitigation: 24h delay gives time to cancel. Consider adding a "rollback" slot that stores the previous implementation.
5. **Initializer re-entrancy:** Use `reinitializer(version)` for upgrade initialization, not `initializer` (which can only be called once).
6. **SELFDESTRUCT:** New implementation must not contain `selfdestruct` — would brick all proxies.

---

## Implementation Priority

| Item | Priority | Complexity | Notes |
|------|----------|------------|-------|
| UUPS base (gaps + authorize) | P0 | Low | Prerequisite for everything |
| Social recovery storage | P0 | Medium | Core security feature |
| Recovery guardian management | P1 | Low | Owner-only admin |
| Recovery initiation + voting | P1 | Medium | Main recovery flow |
| Recovery cancellation | P1 | Low | Owner defense |
| Upgrade timelock | P1 | Low | Already sketched above |
| V1→V1.5 migration contract | P2 | Medium | Only needed for existing deployments |
| Guardian cooldown | P2 | Low | Anti-griefing |

---

## Design Decisions (Confirmed by Efe, 2026-02-11)

1. **Recovery guardians are humans only.** Completely separate from the AI co-signing guardian key. Recovery = trusted humans (friends, family, hardware wallets). The AI guardian has zero role in recovery.

2. **Recovery works while account is frozen.** Owner may have frozen the account and then lost the key. Only human recovery guardians can trigger this.

3. **Upgrades require owner + AI guardian co-sign.** NOT recovery guardians. The upgrade flow is: owner requests upgrade → AI guardian validates the new implementation → timelocked execution. This keeps upgrades in the human+AI trust model, not the social recovery trust model.

4. **Maximum 7 recovery guardians.** More is impractical and gas-expensive for on-chain voting.
