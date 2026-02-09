// SPDX-License-Identifier: MIT
pragma solidity 0.8.15;

import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/interfaces/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/structs/EnumerableSetUpgradeable.sol";
import "nft-staking-module/interfaces/IRarityRegistry.sol";

import "./interfaces/IVenoToken.sol";
import "./interfaces/IVenoVault.sol";

/**
 * @title  VenoStorm
 * @notice VenoStorm is the master of VNO, she can make VNO and shes a fair lady. The
 *         contract is upgradable to accomdate for boosted farming in v2. Upgradability
 *         will be removed once boosted farming has been implemented.
 */
contract VenoStormStorage {
    // NFT staked
    struct NFT {
        address tokenContract;
        uint256 tokenId;
    }

    // Info of each user.
    struct UserInfo {
        uint256 amount; // How many LP tokens the user has provided.
        uint256 rewardDebt; // How much reward been paid for the user current staked amt
        uint256 nftStakedAmount; // num of NFT staked
        uint256 boostedMultiplier; // Boosted multiplier
        uint256 boostedAmount; // amount * boostMultiplier from NFT staking or increase in vault stakes
        uint256 pendingHarvest; // pending vno to harvest. amount accumulated when user stake/unstake NFT or deposit/withdraw/upgrade from vault
    }

    // Info of each pool.
    struct PoolInfo {
        IERC20Upgradeable lpToken; // Address of LP token contract.
        uint256 allocPoint; // How many allocation points assigned to this pool.
        uint256 lastRewardBlock; // Last block number that VNO distribution occurs.
        uint256 accVnoPerShare; // Accumulated VNO per share, times 1e18. See below.
        bool hasHarvestLock; // If true, harvesting from this pid will result in a percentage (harvestLockRatio) to Stom/Reservoir
        uint256 totalBoostedAmount; // total boosted amount for the pool
    }

    IVenoToken public vno;
    IVenoVault public reservoir;
    IVenoVault public fountain;

    // vno tokens created per block.
    uint256 public vnoPerBlock;

    // upper limit of MAX_VNO_PER_BLOCK emission configurable
    uint256 public MAX_VNO_PER_BLOCK;

    // Info of each pool.
    PoolInfo[] public poolInfo;

    // pid => user address => Info of each user that stakes LP tokens.
    mapping(uint256 => mapping(address => UserInfo)) public userInfo;

    // lp address => Info of each pool lp address
    mapping(address => PoolInfo) public poolInfoMap;

    // Total allocation points. Must be the sum of all allocation points in all pools.
    uint256 public totalAllocPoint;

    // The block number when mining starts.
    uint256 public startBlock;

    // The ratio of pid 0 pool against totalAllocPoint, pid 0 is for VenoFountain
    uint256 public pidZeroRatio; // 20 = 20%

    // The percentage of harvested token sent into vault, only applicable if pool.hasHarvestLock=true
    uint256 public harvestLockRatio; // 75 = 75%

    // list of pools to lock user's harvested reward at
    EnumerableSetUpgradeable.UintSet internal vaultPids;

    // Pid => lockshare. For example if the pids are 0 => 2500, 1 => 2500, 2 => 2500,
    // it means the harvest locked token will split equally into 3 pids at the vault
    mapping(uint256 => uint256) public vaultPidToLockShare;

    // Total lock share for all the vault pids
    uint256 public totalLockShare;

    ///////////////////////////////////////////////////////////////////////////////////////
    ///////////////////////////// BOOSTED FARMING ATTRIBUTES /////////////////////////////
    ///////////////////////////////////////////////////////////////////////////////////////

    // If the feature is enabled
    bool public isBoostedFarmingEnabled;

    // Boost multiplier based on vno locked on reservoir/fountain
    // Example: minVnoRequired = [0, 100, 200, 300] and vnoBoostMultiplier = [0, 1000, 2000, 3000]
    // - If user has 100 boosted vno, it imply 1000 boost multiplier (0.1x)
    // - If user has 250 boosted vno, it imply 2000 boost multiplier (0.2x)
    uint256[] public minVnoRequired;
    uint16[] public vnoBoostMultiplier;

    // max NFT stakable per pid
    uint256 public constant MAX_NFT_STAKABLE_PER_PID = 5;

    // pid => user address => nft address => list of NFT tokenIds staked
    mapping(uint256 => mapping(address => mapping(address => EnumerableSetUpgradeable.UintSet))) userStakedNfts;

    // Max boost multiplier for a user - 20,000 = 2x, min at 10,000 = 1x
    uint256 public constant MAX_BOOST_MULTIPLIER = 20_000;

    // (NFT address -> multiplier). This boost multipler includes both rarity/tier,
    // Example [3,2,1,6,5,4,9,8,7] and nft has 3 rarity with 3 tier
    // val: 3 would mean COMMON tier 1 while val 5 would mean UNCOMMON tier 2.
    // val 100 = 0.01x, 1000 = 0.1x. uint16 should suffice as max multiplier is 20_000
    mapping(address => uint16[]) public nftBoostMultipliers;

    // Nft address => rarity registry
    mapping(address => IRarityRegistry) public rarityRegistries;
}
