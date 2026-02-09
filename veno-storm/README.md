# VenoStorm depositFromFountain Issue - Proof of Concept

## Quick Start

```bash
cd /home/odhiambo/veno-storm
forge test --match-path test/DepositFromFountainIssue.t.sol -vv
```

## Issue

`depositFromFountain()` credits deposits to the Fountain contract address instead of end-users because it lacks a user parameter and internally uses `msg.sender` for all accounting.

## Test Proof

**Single minimal test:** `testDepositFromFountainCreditsWrongUser`

**What it proves:**
1. Fountain calls `depositFromFountain(pid=1, 1000e18)`
2. End-user's stake: 0 (unchanged)
3. Fountain's stake: 1000e18 (increased)
4. After 1000 blocks:
   - End-user's rewards: **0**
   - Fountain's rewards: **80000e18**

**Preconditions checked:**
- Pool exists and is active
- Emissions are running
- Pool has non-zero allocPoint

## Expected Output

```
[PASS] testDepositFromFountainCreditsWrongUser() (gas: 245334)
Suite result: ok. 1 passed; 0 failed; 0 skipped
```

## Root Cause

```solidity
function _deposit(uint256 _pid, uint256 _amount, IVenoVault _vault) internal {
    UserInfo storage user = userInfo[_pid][msg.sender];  // msg.sender = Fountain
    // ...
    pool.lpToken.safeTransferFrom(msg.sender, address(this), _amount);
    user.amount += _amount;  // Credits Fountain, not end-user
}
```

## Impact

- Users depositing through Fountain never receive credit
- All rewards accrue to Fountain contract address
- Storm has no record of individual users
- Per-user boosted farming features cannot work

## Contracts

- **VenoStorm:** 0x02b16CAD7fe24664F106f49902F620C0beE36b55 (Cronos)
- **VNO Token:** 0xdb7d0A1eC37dE1dE924F8e8adac6Ed338D4404E9
- **LP Token:** 0x8900A1D1eAb5e8Af142017aF8a7535979Db6E629

## Files

- `test/DepositFromFountainIssue.t.sol` - Minimal PoC (no comments)
- `BOUNTY_SUBMISSION.md` - Detailed analysis
- `contracts/` - Full contract code
