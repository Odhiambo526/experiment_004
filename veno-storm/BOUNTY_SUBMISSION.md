# Bug Bounty Submission: depositFromFountain Credits Wrong User

## Executive Summary

The `depositFromFountain()` function credits all deposits and rewards to the Fountain contract address (`msg.sender`) instead of individual end-users. Storm provides no mechanism to attribute deposits made through Fountain to specific users.

## Vulnerability Classification

- **Severity:** Critical
- **Type:** Logic Error / Missing User Parameter
- **Impact:** Complete loss of user reward attribution

## Affected Contract

- **Contract:** VenoStorm
- **Network:** Cronos
- **Address:** 0x02b16CAD7fe24664F106f49902F620C0beE36b55
- **Function:** `depositFromFountain(uint256 _pid, uint256 _amount, IVenoVault _vault)`

## Technical Analysis

### The Code

```solidity
function depositFromFountain(uint256 _pid, uint256 _amount, IVenoVault _vault) external {
    require(msg.sender == address(fountain));
    _deposit(_pid, _amount, _vault);
    emit DepositFromFountain(msg.sender, _pid, _amount);
}

function _deposit(uint256 _pid, uint256 _amount, IVenoVault _vault) internal {
    UserInfo storage user = userInfo[_pid][msg.sender];
    
    pool.lpToken.safeTransferFrom(msg.sender, address(this), _amount);
    user.amount += _amount;
    _updatePidBoostedAmount(_pid, msg.sender);
    user.rewardDebt = (user.boostedAmount * pool.accVnoPerShare) / 1e18;
}
```

### The Problem

`_deposit()` uses `msg.sender` for all accounting operations. When `depositFromFountain()` is called:
- `msg.sender` = Fountain contract address
- `userInfo[_pid][fountain]` is updated, not `userInfo[_pid][actualUser]`
- All rewards accrue to the Fountain contract
- **No user parameter exists to specify the actual depositor**

## Proof of Concept

### Single Minimal Test

The test demonstrates:
1. Fountain calls `depositFromFountain(pid=1, amount=1000e18)`
2. End-user's stake remains 0
3. Fountain's stake increases by 1000e18
4. After 1000 blocks:
   - End-user's pending rewards: **0**
   - Fountain's pending rewards: **80000e18**

### Preconditions Verified

The test includes hard requirements:
- `poolLength > testPid` - Pool exists
- `allocPoint > 0` - Pool is active
- `vnoPerBlock > 0` - Emissions are active
- `block.number >= startBlock` - Emissions started
- `lastRewardBlock <= block.number` - Pool is emitting

### Run Test

```bash
cd /home/odhiambo/veno-storm
forge test --match-path test/DepositFromFountainIssue.t.sol -vv
```

### Test Output

```
[PASS] testDepositFromFountainCreditsWrongUser() (gas: 245334)

Key Trace Evidence:
- depositFromFountain called by Fountain
- emit UpdatePidBoostedAmount(user: MockVault [Fountain], ...)
- emit Deposit(user: MockVault [Fountain], ...)
- emit DepositFromFountain(user: MockVault [Fountain], ...)
- pendingVno(1, endUser) → 0
- pendingVno(1, Fountain) → 80000000000000000000000 [8e22]
```

## Impact

### What Happens

- Users deposit through Fountain
- Storm has **no record** of individual users
- All deposits credited to Fountain contract address
- All rewards accrue to Fountain contract address
- Users cannot claim rewards from Storm

### Why This Matters

1. **No User Attribution:** Storm cannot track which user deposited what amount
2. **Reward Loss:** Users never receive rewards for their deposits
3. **Boosted Farming Broken:** NFT staking and vault balance boosts cannot work per-user
4. **Trust Assumption:** Relies entirely on Fountain to redistribute rewards off-chain

## Design Analysis

### Is This Intentional?

**Partially, but likely incomplete:**

- **Pid 0:** Explicitly designed for Fountain as sole staker (documented in code)
- **Other Pids:** `depositFromFountain()` accepts any `_pid` without restriction
- **No Guard:** Missing `require(_pid == 0)` check
- **Pattern Exists:** `IVenoVault.depositFor(_pid, _amount, address _user)` shows "on behalf of" patterns exist elsewhere

**Conclusion:** If fully intentional, the function would restrict to pid 0 only. The unrestricted `_pid` parameter indicates incomplete implementation.

## Recommended Fix

Add user parameter to enable proper attribution:

```solidity
function depositFromFountain(
    uint256 _pid, 
    uint256 _amount, 
    address _user,
    IVenoVault _vault
) external {
    require(msg.sender == address(fountain));
    _depositFor(_pid, _amount, _user, _vault);
    emit DepositFromFountain(_user, _pid, _amount);
}

function _depositFor(
    uint256 _pid, 
    uint256 _amount, 
    address _user,
    IVenoVault _vault
) internal {
    PoolInfo storage pool = poolInfo[_pid];
    UserInfo storage user = userInfo[_pid][_user];
    
    if (pool.hasHarvestLock) {
        require(_vault == reservoir || _vault == fountain, "INVALID_VAULT");
    }
    updatePool(_pid);
    
    uint256 totalPending = user.pendingHarvest;
    if (user.boostedAmount > 0) {
        uint256 pending = (user.boostedAmount * pool.accVnoPerShare) / 1e18 - user.rewardDebt;
        totalPending += pending;
    }
    if (totalPending > 0) {
        _safeVnoTransfer(_user, totalPending, pool, _vault);
        user.pendingHarvest = 0;
    }
    
    if (_amount > 0) {
        pool.lpToken.safeTransferFrom(msg.sender, address(this), _amount);
        user.amount += _amount;
    }
    
    _updatePidBoostedAmount(_pid, _user);
    user.rewardDebt = (user.boostedAmount * pool.accVnoPerShare) / 1e18;
    emit Deposit(_user, _pid, _amount);
}
```

## Files Included

- `test/DepositFromFountainIssue.t.sol` - Single minimal PoC test (no comments except SPDX)
- `contracts/VenoStorm.sol` - Complete contract implementation
- `foundry.toml` - Build configuration
- `README.md` - Quick start guide
- `BOUNTY_SUBMISSION.md` - This document
