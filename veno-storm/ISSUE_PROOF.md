# DepositFromFountain Issue Proof

## Issue Summary
The `depositFromFountain()` function credits deposits to the Fountain contract address instead of the actual end-user, causing all rewards to accrue to the Fountain contract rather than individual users.

## Test Results

All 4 tests pass, proving the issue exists:

### Test 1: `testDepositFromFountainCreditsWrongUser`
**Proves:** When Fountain calls `depositFromFountain()`, the deposit is credited to the Fountain contract, not Alice.

**Result:**
- Alice's staked amount: 0 (unchanged)
- Fountain's staked amount: 1000e18 (increased)
- Alice's pending rewards after 1000 blocks: 0
- Fountain's pending rewards after 1000 blocks: 79200e18 (> 0)

### Test 2: `testDirectDepositCreditsCorrectUser`
**Proves:** When Alice calls `deposit()` directly, she correctly receives credit and rewards.

**Result:**
- Alice's staked amount: 1000e18 (correctly credited)
- Alice's pending rewards after 1000 blocks: > 0 (correctly accruing)

### Test 3: `testCompareFountainVsDirectDeposit`
**Proves:** Both Fountain (via `depositFromFountain`) and Bob (via `deposit`) receive equal rewards, while Alice receives nothing.

**Result:**
- Alice's pending rewards: 0
- Bob's pending rewards: > 0
- Fountain's pending rewards: > 0
- Bob's rewards ≈ Fountain's rewards (within 1% tolerance)

### Test 4: `testMultipleUsersDepositFromFountain`
**Proves:** Multiple deposits via `depositFromFountain()` all accumulate to the Fountain contract, with no individual user tracking.

**Result:**
- Alice's staked amount: 0
- Bob's staked amount: 0
- Fountain's staked amount: 2000e18 (both deposits)
- Alice's pending rewards: 0
- Bob's pending rewards: 0
- Fountain's pending rewards: > 0 (all rewards)

## Root Cause

The `_deposit()` internal function always uses `msg.sender` for all operations:

```solidity
function _deposit(uint256 _pid, uint256 _amount, IVenoVault _vault) internal {
    UserInfo storage user = userInfo[_pid][msg.sender];  // ❌ msg.sender = fountain
    // ...
    pool.lpToken.safeTransferFrom(msg.sender, address(this), _amount);  // ❌ pulls from fountain
    user.amount += _amount;  // ❌ credits fountain
    _updatePidBoostedAmount(_pid, msg.sender);  // ❌ updates fountain's boost
}
```

When `depositFromFountain()` is called:
```solidity
function depositFromFountain(uint256 _pid, uint256 _amount, IVenoVault _vault) external {
    require(msg.sender == address(fountain));
    _deposit(_pid, _amount, _vault);  // msg.sender is fountain contract
}
```

## Impact

- End-users never accrue rewards in Storm
- All rewards go to the Fountain contract address
- Individual user boosted farming (NFT staking, vault balances) cannot work
- Users cannot claim their rightful rewards

## Running the Tests

```bash
cd /home/odhiambo/veno-storm
forge test --match-path test/DepositFromFountainIssue.t.sol -vv
```

All 4 tests pass, confirming the issue exists.
