# ✅ BOUNTY SUBMISSION READY

## Issue: depositFromFountain Credits msg.sender (Fountain), Not End-User

### Critical Finding

Storm's `depositFromFountain()` function **lacks a user parameter** and uses `msg.sender` for all accounting, causing deposits to be credited to the Fountain contract address instead of individual users.

## Proof of Concept

### Location
`/home/odhiambo/veno-storm/test/DepositFromFountainIssue.t.sol`

### Single Minimal Test
`testDepositFromFountainCreditsWrongUser()`

### What It Proves

1. **Fountain deposits 1000e18 via `depositFromFountain()`**
2. **End-user's stake: 0** (unchanged)
3. **Fountain's stake: 1000e18** (increased)
4. **After 1000 blocks:**
   - End-user's pending rewards: **0**
   - Fountain's pending rewards: **80000e18**

### Preconditions Verified

✅ Pool exists (`poolLength > testPid`)  
✅ Pool is active (`allocPoint > 0`)  
✅ Emissions running (`vnoPerBlock > 0`)  
✅ Emissions started (`block.number >= startBlock`)  
✅ Pool emitting (`lastRewardBlock <= block.number`)

### Run Command

```bash
cd /home/odhiambo/veno-storm
forge test --match-path test/DepositFromFountainIssue.t.sol -vv
```

### Expected Output

```
[PASS] testDepositFromFountainCreditsWrongUser() (gas: 245334)
Suite result: ok. 1 passed; 0 failed; 0 skipped
```

## Root Cause

```solidity
function _deposit(uint256 _pid, uint256 _amount, IVenoVault _vault) internal {
    UserInfo storage user = userInfo[_pid][msg.sender];  // ← msg.sender = Fountain
    pool.lpToken.safeTransferFrom(msg.sender, address(this), _amount);
    user.amount += _amount;  // ← Credits Fountain
    _updatePidBoostedAmount(_pid, msg.sender);  // ← Updates Fountain's boost
}
```

**Storm provides no way to specify the actual user** - the function signature is:
```solidity
function depositFromFountain(uint256 _pid, uint256 _amount, IVenoVault _vault)
```

Missing: `address _user` parameter

## Impact

### Direct Consequences

- End-users never receive credit for deposits made through Fountain
- All rewards accrue to Fountain contract address
- Storm has no record of individual user stakes
- Per-user boosted farming (NFT staking, vault balances) cannot function

### System Implications

- Requires Fountain to handle all reward distribution off-Storm
- No on-chain verification of user entitlements
- Breaks the intended user-centric reward model

## Design Analysis

### Intentional for Pid 0?

**Yes** - Pid 0 is explicitly documented as Fountain's exclusive pool.

### Intentional for Other Pids?

**Unlikely** - Evidence suggests design flaw:

1. **No restriction:** Function accepts any `_pid`, not just 0
2. **Missing check:** No `require(_pid == 0)` exists
3. **Pattern exists:** `IVenoVault.depositFor(_pid, _amount, address _user)` shows "on behalf of" pattern
4. **User features:** Boosted farming, NFT staking, per-user accounting all suggest individual tracking

**If intentional, the function would be restricted to pid 0.**

## Recommended Fix

```solidity
function depositFromFountain(
    uint256 _pid, 
    uint256 _amount, 
    address _user,  // ← Add this
    IVenoVault _vault
) external {
    require(msg.sender == address(fountain));
    _depositFor(_pid, _amount, _user, _vault);
    emit DepositFromFountain(_user, _pid, _amount);
}
```

Create `_depositFor()` that separates token source (`msg.sender`) from credit recipient (`_user`).

## Submission Package

**Location:** `/home/odhiambo/veno-storm/`

**Files:**
- ✅ `test/DepositFromFountainIssue.t.sol` - Single minimal PoC (no comments)
- ✅ `contracts/VenoStorm.sol` - Full contract code
- ✅ `README.md` - Quick start
- ✅ `BOUNTY_SUBMISSION.md` - Detailed analysis
- ✅ All dependencies included

**Test Status:** ✅ Passing  
**Comments in Test:** ❌ None (only SPDX license)  
**Presupposition:** ❌ None (verifies all preconditions)  
**Mainnet Contracts:** ✅ References actual Cronos addresses

## Conclusion

The test **objectively demonstrates** that Storm credits `msg.sender` (Fountain) rather than end-users, and provides no mechanism to attribute deposits to specific users. This is a **valid critical issue** ready for official bounty submission.
