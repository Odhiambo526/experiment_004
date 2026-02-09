// SPDX-License-Identifier: MIT
pragma solidity 0.8.15;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/interfaces/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import {BaseStakingPermissioned} from "nft-staking-module/StakingModuleInternal.sol";

import "./UUPSUpgradeableWithDelay.sol";
import "./VenoStormStorage.sol";
import "./VenoFountainDepositToken.sol";

/**
 * @title  VenoStorm
 * @notice VenoStorm is the master of VNO, she can make VNO and shes a fair lady. The
 *         contract is upgradable to accomdate for boosted farming in v2. Upgradability
 *         will be removed once boosted farming has been implemented.
 * @dev    Future upgrades should avoid adding a new inheritance, or developr cannot add new variables in
 *         VenoStormStorage and must add in VenoStorm directly.
 */
contract VenoStorm is
    UUPSUpgradeableWithDelay,
    OwnableUpgradeable,
    BaseStakingPermissioned,
    VenoStormStorage,
    ReentrancyGuardUpgradeable
{
    using SafeERC20Upgradeable for IERC20Upgradeable;
    using EnumerableSetUpgradeable for EnumerableSetUpgradeable.UintSet;
    using EnumerableSet for EnumerableSet.AddressSet;

    event Deposit(address indexed user, uint256 indexed pid, uint256 amount);
    event Withdraw(address indexed user, uint256 indexed pid, uint256 amount);
    event EmergencyWithdraw(address indexed user, uint256 indexed pid, uint256 amount);
    event UpdatePidZeroRatio(uint256 newRatio);
    event UpdateLockRatio(uint256 newRatio);
    event UpdateEmissionRate(uint256 newVnoPerBlock);
    event AddVaultPool(uint256[] pids, uint256[] shares);
    event SetVaultPool(uint256[] pids, uint256[] shares);
    event SetNftRarityRegistry(address indexed tokenAddress, IRarityRegistry _rarityRegistry);
    event EnableBoostedFarming();
    event SetNftMultiplier(address indexed tokenAddress, uint16[] nftBoostMultiplier);
    event SetVnoMultiplier(uint256[] minVnoRequired, uint16[] vnoBoostMultiplier);
    event StakeNft(address indexed user, uint256 indexed pid);
    event UnstakeNft(address indexed user, uint256 indexed pid);
    event UpdatePidBoostedAmount(address indexed user, uint256 indexed pid, uint256 newBoostedAmount);
    event UpdateVaultApproval(address vault, uint256 amount);
    event Add(address lpToken, uint256 allocPoint, bool hasHarvestLock);
    event Set(uint256 pid, uint256 allocPoint, bool hasHarvestLock);
    event DepositFromFountain(address indexed user, uint256 indexed pid, uint256 amount);

    modifier checkPoolDuplicate(IERC20Upgradeable _lpToken) {
        IERC20Upgradeable poolInfoMapLpToken = poolInfoMap[address(_lpToken)].lpToken;
        require(poolInfoMapLpToken != _lpToken, "VenoStorm: existing pool?");
        _;
    }

    modifier onlyBoostedFarmingEnabled() {
        require(isBoostedFarmingEnabled == true, "BOOSTING_FARMING_DISABLED");
        _;
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        IVenoToken _vno,
        IVenoVault _reservoir,
        IVenoVault _fountain,
        IERC20Upgradeable _fountainDepositToken,
        uint256 _startBlock,
        uint256 _vnoPerBlock,
        uint256 _maxVnoPerBlock,
        uint256 _upgradeDelay
    ) public initializer {
        require(address(_vno) != address(0), "vno should not be address(0)");
        require(address(_reservoir) != address(0), "reservoir should not be address(0)");
        require(address(_fountain) != address(0), "fountain should not be address(0)");
        require(
            address(_fountainDepositToken) != address(0),
            "_fountainDepositToken should not be address(0)"
        );
        require(_startBlock > block.number, "Start block should be in future");
        require(_maxVnoPerBlock >= _vnoPerBlock, "max vno per block must be higher");
        require(_upgradeDelay > 0, "upgradeDelay is zero");

        vno = _vno;
        reservoir = _reservoir;
        fountain = _fountain;
        startBlock = _startBlock;
        vnoPerBlock = _vnoPerBlock;

        // Admin cannot increase the emission rate, only able to decrease
        MAX_VNO_PER_BLOCK = _maxVnoPerBlock;

        // default config
        pidZeroRatio = 100; // 100% emission to pid 0
        harvestLockRatio = 75; // 75% of token goes into vault by default

        poolInfo.push(
            PoolInfo({
                lpToken: _fountainDepositToken,
                allocPoint: 1000,
                lastRewardBlock: startBlock,
                accVnoPerShare: 0,
                hasHarvestLock: false,
                totalBoostedAmount: 0
            })
        );
        totalAllocPoint = 1000;

        // Gas saving: pre-approve vno to fountain/reservoir
        vno.approve(address(_reservoir), type(uint256).max);
        vno.approve(address(_fountain), type(uint256).max);

        // Disable at launch until a further date
        isBoostedFarmingEnabled = false;

        __UUPSUpgradeableWithDelay_init(_upgradeDelay);
        __Ownable_init();
        __ReentrancyGuard_init();
    }

    /**
     * @notice Add a new lp to the pool. Contract is initialized with only pid 0 and 100% ratio. When
     *         adding a pid for the first time, set pidZeroRatio to the desired ratio first before adding
     */
    function add(
        uint256 _allocPoint,
        IERC20Upgradeable _lpToken,
        bool _hasHarvestLock,
        bool _withUpdate
    ) external onlyOwner checkPoolDuplicate(_lpToken) {
        require(pidZeroRatio != 100, "Adjust pid zero ratio below 100 first");

        if (_withUpdate) {
            massUpdatePools();
        }

        uint256 lastRewardBlock = block.number > startBlock ? block.number : startBlock;
        totalAllocPoint += _allocPoint;

        PoolInfo memory pool = PoolInfo({
            lpToken: _lpToken,
            allocPoint: _allocPoint,
            lastRewardBlock: lastRewardBlock,
            accVnoPerShare: 0,
            hasHarvestLock: _hasHarvestLock,
            totalBoostedAmount: 0
        });
        poolInfo.push(pool);
        poolInfoMap[address(_lpToken)] = pool;

        _updatePidZeroPool();

        emit Add(address(_lpToken), _allocPoint, _hasHarvestLock);
    }

    /**
     * @notice Update the given pool's alloc point.
     */
    function set(
        uint256 _pid,
        uint256 _allocPoint,
        bool _hasHarvestLock,
        bool _withUpdate
    ) external onlyOwner {
        if (_withUpdate) {
            massUpdatePools();
        }

        uint256 prevAllocPoint = poolInfo[_pid].allocPoint;
        poolInfo[_pid].allocPoint = _allocPoint;
        poolInfo[_pid].hasHarvestLock = _hasHarvestLock;

        // Also update pool info map with the new pool detail
        poolInfoMap[address(poolInfo[_pid].lpToken)] = poolInfo[_pid];

        if (prevAllocPoint != _allocPoint) {
            totalAllocPoint = totalAllocPoint - prevAllocPoint + _allocPoint;
            _updatePidZeroPool();
        }

        emit Set(_pid, _allocPoint, _hasHarvestLock);
    }

    /**
     * @notice update % of token harvested that would be locked - 75 = 75%
     * @dev    this would apply for future token claim immediately
     */
    function updateHarvestLockRatio(uint256 _ratio) external onlyOwner {
        require(_ratio <= 100, "VenoStorm: updateHarvestLockRatio: must be lte 100%");

        harvestLockRatio = _ratio;
        emit UpdateLockRatio(_ratio);
    }

    function updateEmissionRate(uint256 _vnoPerBlock) external onlyOwner {
        require(_vnoPerBlock <= MAX_VNO_PER_BLOCK, "VenoStorm: vnoPerBlock is too high");
        require(_vnoPerBlock != vnoPerBlock, "VenoStorm: vnoPerBlock is same as existing");

        massUpdatePools();
        vnoPerBlock = _vnoPerBlock;
        emit UpdateEmissionRate(_vnoPerBlock);
    }

    /**
     * @notice update the % of emission to pid 0
     * @dev pid 0 is meant for VenoFountain
     */
    function updatePidZeroRatio(uint256 _ratio) external onlyOwner {
        require(_ratio <= 100, "VenoStorm: ratio must be lte 100%");

        massUpdatePools();
        pidZeroRatio = _ratio;
        _updatePidZeroPool();

        emit UpdatePidZeroRatio(_ratio);
    }

    /**
     * @notice Add list of vaults pid where harvested vno will be sent to
     * @param _pids an array of pids on fountain and reservoir
     * @param _shares for each pid. if the total share is 100 and pids[0] is 25, 25% of locked vno will go into pids[0]
     */
    function addVaultPid(uint256[] memory _pids, uint256[] memory _shares) external onlyOwner {
        require(_pids.length == _shares.length, "_pids.length ! = _shares.length");
        for (uint256 i = 0; i < _pids.length; i++) {
            uint256 pid = _pids[i];
            uint256 share = _shares[i];

            require(!vaultPids.contains(pid), "pid has been added");
            // Will revert txn if pid does not exist in fountain/reservoir
            reservoir.poolInfo(pid);
            fountain.poolInfo(pid);

            vaultPids.add(pid);
            vaultPidToLockShare[pid] = share;
            totalLockShare += share;
        }

        emit AddVaultPool(_pids, _shares);
    }

    /**
     * @notice Update existing vault pool. This update applies to future user who harvest immediately
     * @param _pids an array of pids on fountain and reservoir
     * @param _shares for each pid. if the total share is 100 and pids[0] is 25, 25% of locked vno will go into pids[0]
     */
    function setVaultPid(uint256[] memory _pids, uint256[] memory _shares) external onlyOwner {
        require(_pids.length == _shares.length, "_pids.length ! = _shares.length");
        for (uint256 i = 0; i < _pids.length; i++) {
            uint256 pid = _pids[i];
            uint256 share = _shares[i];

            require(vaultPids.contains(pid), "pid is not added");

            uint256 oldShare = vaultPidToLockShare[pid];
            vaultPidToLockShare[pid] = share;

            if (oldShare != share) {
                totalLockShare = totalLockShare - oldShare + share;
            }
        }

        emit SetVaultPool(_pids, _shares);
    }

    /**
     * @notice update vno approval to vault
     * @dev to be used if reservoir/fountain are compromised as contract upgrades have delay
     */
    function updateVaultApproval(IVenoVault _vault, uint256 _amount) external onlyOwner {
        require(address(_vault) == address(reservoir) || address(_vault) == address(fountain), "Not vault");

        vno.approve(address(_vault), _amount);

        emit UpdateVaultApproval(address(_vault), _amount);
    }

    /**
     * @notice deposit LP to VenoStorm
     */
    function _deposit(uint256 _pid, uint256 _amount, IVenoVault _vault) internal {
        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][msg.sender];

        if (pool.hasHarvestLock) {
            require(_vault == reservoir || _vault == fountain, "INVALID_VAULT");
        }
        updatePool(_pid);

        // Check any pending token and transfer to user
        uint256 totalPending = user.pendingHarvest;
        if (user.boostedAmount > 0) {
            uint256 pending = (user.boostedAmount * pool.accVnoPerShare) / 1e18 - user.rewardDebt;
            totalPending += pending;
        }
        if (totalPending > 0) {
            _safeVnoTransfer(msg.sender, totalPending, pool, _vault);
            user.pendingHarvest = 0;
        }

        if (_amount > 0) {
            pool.lpToken.safeTransferFrom(msg.sender, address(this), _amount);
            user.amount += _amount;
        }

        _updatePidBoostedAmount(_pid, msg.sender);
        user.rewardDebt = (user.boostedAmount * pool.accVnoPerShare) / 1e18;
        emit Deposit(msg.sender, _pid, _amount);
    }

    /**
     * @notice deposit LP to VenoStorm
     */
    function deposit(uint256 _pid, uint256 _amount, IVenoVault _vault) external nonReentrant {
        _deposit(_pid, _amount, _vault);
        emit Deposit(msg.sender, _pid, _amount);
    }

    /**
     * @notice call back from fountain
     */
    function depositFromFountain(uint256 _pid, uint256 _amount, IVenoVault _vault) external {
        require(msg.sender == address(fountain));
        _deposit(_pid, _amount, _vault);
        emit DepositFromFountain(msg.sender, _pid, _amount);
    }

    /**
     * @notice withdraw LP from VenoStorm
     */
    function withdraw(uint256 _pid, uint256 _amount, IVenoVault _vault) external nonReentrant {
        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][msg.sender];
        require(user.amount >= _amount, "withdraw: not good");

        if (pool.hasHarvestLock) {
            require(_vault == reservoir || _vault == fountain, "Invalid vault address");
        }

        updatePool(_pid);

        // Check any pending token and transfer to user
        uint256 pending = (user.boostedAmount * pool.accVnoPerShare) / 1e18 - user.rewardDebt;
        uint256 totalPending = user.pendingHarvest + pending;
        if (totalPending > 0) {
            _safeVnoTransfer(msg.sender, totalPending, pool, _vault);
            user.pendingHarvest = 0;
        }

        if (_amount > 0) {
            user.amount -= _amount;
            pool.lpToken.safeTransfer(msg.sender, _amount);
        }

        _updatePidBoostedAmount(_pid, msg.sender);
        user.rewardDebt = (user.boostedAmount * pool.accVnoPerShare) / 1e18;
        emit Withdraw(msg.sender, _pid, _amount);
    }

    /// @notice withdraw without caring about rewards. EMERGENCY ONLY.
    function emergencyWithdraw(uint256 _pid) external nonReentrant {
        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][msg.sender];
        pool.lpToken.safeTransfer(msg.sender, user.amount);

        emit EmergencyWithdraw(msg.sender, _pid, user.amount);
        user.amount = 0;
        user.rewardDebt = 0;
        user.pendingHarvest = 0;

        _updatePidBoostedAmount(_pid, msg.sender);
        user.boostedAmount = 0;
    }

    function poolLength() external view returns (uint256) {
        return poolInfo.length;
    }

    /**
     * @return list of pids user's farmed reward are locked into
     */
    function getVaultPids() external view returns (uint256[] memory) {
        return vaultPids.values();
    }

    function minVnoRequiredLength() external view returns (uint256) {
        return minVnoRequired.length;
    }

    /// @notice view function to see pending vno on frontend.
    function pendingVno(uint256 _pid, address _user) external view returns (uint256) {
        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][_user];

        uint256 accVnoPerShare = pool.accVnoPerShare;
        uint256 totalBoostedAmount = pool.totalBoostedAmount;

        if (block.number > pool.lastRewardBlock && totalBoostedAmount != 0) {
            uint256 multiplier = _getMultiplier(pool.lastRewardBlock, block.number);
            uint256 vnoReward = (multiplier * vnoPerBlock * pool.allocPoint) / totalAllocPoint;
            accVnoPerShare += ((vnoReward * 1e18) / totalBoostedAmount);
        }

        uint256 pendingVno = (user.boostedAmount * accVnoPerShare) / 1e18 - user.rewardDebt;

        // Sum up any pending harvest
        return user.pendingHarvest + pendingVno;
    }

    /**
     * @notice enable NFT for staking
     * @param _tokenAddress for the NFT
     * @param _rarityRegistry address of NFT rarity registry
     * @param _nftBoostMultiplier example [3,2,1,6,5,4,9,8,7] and nft has 3 rarity with 3 tier.
     *                            val: 3 would mean COMMON tier 1 while val 5 would mean UNCOMMON tier 2
     *                            val 100 = 0.01x, 525 = 0.0525x multiplier
     */
    function enableNft(
        address _tokenAddress,
        IRarityRegistry _rarityRegistry,
        uint16[] calldata _nftBoostMultiplier
    ) external onlyOwner {
        require(_rarityRegistry.nftContractAddress() == _tokenAddress, "MISMATCH_RARITY");

        uint256 boostMultiplierLength = _rarityRegistry.maxTier() * _rarityRegistry.maxRarityLevel();
        require(boostMultiplierLength == _nftBoostMultiplier.length, "MISMATCH_BOOST_MUTLIPLIER");

        _enableToken(_tokenAddress);
        rarityRegistries[_tokenAddress] = _rarityRegistry;

        nftBoostMultipliers[_tokenAddress] = _nftBoostMultiplier;
    }

    /**
     * @notice disable NFT for staking
     * @param _tokenAddress for the NFT
     */
    function disableNft(address _tokenAddress) external onlyOwner onlyEnabledTokens(_tokenAddress) {
        _disableToken(_tokenAddress);

        // Reset these storage
        rarityRegistries[_tokenAddress] = IRarityRegistry(address(0));
        delete nftBoostMultipliers[_tokenAddress];
    }

    /**
     * @notice Update NFT registry address if NFT has a new rarity registry implementation.
     */
    function setNftRarityRegistry(
        address _tokenAddress,
        IRarityRegistry _rarityRegistry
    ) external onlyOwner onlyEnabledTokens(_tokenAddress) {
        require(_rarityRegistry.nftContractAddress() == _tokenAddress, "MISMATCH_RARITY");

        rarityRegistries[_tokenAddress] = _rarityRegistry;
        emit SetNftRarityRegistry(_tokenAddress, _rarityRegistry);
    }

    /**
     * @notice Set NFT multiplier for a token, can only update
     * @param  _tokenAddress for the NFT
     * @param _nftBoostMultiplier boost multiplier which take into account of both tier and rarity
     * @dev If theres an update required after feature enabled, updating of boosted amount for existing user would be required
     */
    function setNftMultiplier(
        address _tokenAddress,
        uint16[] calldata _nftBoostMultiplier
    ) external onlyOwner onlyEnabledTokens(_tokenAddress) {
        IRarityRegistry rarityRegistry = rarityRegistries[_tokenAddress];
        uint256 boostMultiplierLength = rarityRegistry.maxTier() * rarityRegistry.maxRarityLevel();
        require(boostMultiplierLength == _nftBoostMultiplier.length, "MISMATCH_BOOST_MUTLIPLIER");

        nftBoostMultipliers[_tokenAddress] = _nftBoostMultiplier;
        emit SetNftMultiplier(_tokenAddress, _nftBoostMultiplier);
    }

    /**
     * @notice Set boost multiplier based on vno locked in vault
     * @param _minVnoRequired for each tier, eg. [0, 100_000, 200_000, 300_000]
     * @param _vnoBoostMultiplier for each tier, eg. [0, 1000, 2000, 3000]
     * @dev If theres an update required after feature enabled, updating of boosted amount for existing user would be required
     */
    function setVnoMultiplier(
        uint256[] calldata _minVnoRequired,
        uint16[] calldata _vnoBoostMultiplier
    ) external onlyOwner {
        // If ever a change, contract need to be upgraded to remove this check.
        require(!isBoostedFarmingEnabled, "BOOSTED_FARM_ENABLED_NO_UPDATE");

        require(_minVnoRequired.length == _vnoBoostMultiplier.length, "MISMATCH_LENGTH");

        // Should be 0 as thats the base tier if user did not lock up any VNO
        require(_minVnoRequired[0] == 0 && _vnoBoostMultiplier[0] == 0, "INDEX_0_SHOULD_BE_0");

        minVnoRequired = _minVnoRequired;
        vnoBoostMultiplier = _vnoBoostMultiplier;

        emit SetVnoMultiplier(_minVnoRequired, _vnoBoostMultiplier);
    }

    /**
     * @notice Enable boosted farming feature. Ensure pre-req such as
     * @dev Designed not be disabled once feature enabled as some user would already be boosted
     *      unless the team perform updateBoostedAmount(address _user) for each user
     */
    function enableBoostedFarming() external onlyOwner {
        require(!isBoostedFarmingEnabled, "ALREADY_ENABLED");

        // Checks if boost multipliers are set
        require(minVnoRequired.length > 0, "VNO_MULTIPLIER_NOT_SETUP");

        isBoostedFarmingEnabled = true;
        emit EnableBoostedFarming();
    }

    /**
     * @notice Stake NFT(s) for a pid, increase user's multiplier/APR for the pid.
     */
    function stakeNft(uint256 _pid, NFT[] calldata _nfts) external onlyBoostedFarmingEnabled nonReentrant {
        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][msg.sender];
        require(user.nftStakedAmount + _nfts.length <= MAX_NFT_STAKABLE_PER_PID, "OVER_LIMIT");

        updatePool(_pid);

        // Check if any pending amount and add to userInfo
        if (user.boostedAmount > 0) {
            uint256 pending = (user.boostedAmount * pool.accVnoPerShare) / 1e18 - user.rewardDebt;
            user.pendingHarvest += pending;
        }

        for (uint256 i = 0; i < _nfts.length; i++) {
            _stake(_nfts[i].tokenContract, _nfts[i].tokenId);

            user.nftStakedAmount++;
            userStakedNfts[_pid][msg.sender][_nfts[i].tokenContract].add(_nfts[i].tokenId);
        }

        _updatePidBoostedAmount(_pid, msg.sender);
        user.rewardDebt = (user.boostedAmount * pool.accVnoPerShare) / 1e18;
        emit StakeNft(msg.sender, _pid);
    }

    /**
     * @notice Unstake NFT(s) for a pid.
     */
    function unstakeNft(uint256 _pid, NFT[] calldata _nfts) external nonReentrant {
        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][msg.sender];

        updatePool(_pid);

        // Check if any pending amount and add to userInfo
        if (user.boostedAmount > 0) {
            uint256 pending = (user.boostedAmount * pool.accVnoPerShare) / 1e18 - user.rewardDebt;
            user.pendingHarvest += pending;
        }

        // will throw "token not staked" error if user did not stake the nft
        for (uint256 i = 0; i < _nfts.length; i++) {
            _unstake(_nfts[i].tokenContract, _nfts[i].tokenId);

            user.nftStakedAmount--;
            userStakedNfts[_pid][msg.sender][_nfts[i].tokenContract].remove(_nfts[i].tokenId);
        }

        _updatePidBoostedAmount(_pid, msg.sender);
        user.rewardDebt = (user.boostedAmount * pool.accVnoPerShare) / 1e18;
        emit UnstakeNft(msg.sender, _pid);
    }

    /**
     * @notice Updated user's boosted amount for each pid, called when user multiplier could change.
     *         For example: when user deposit/withdraw/upgrade from VenoReservoir or VenoFountain.
     * @dev    If fountain/reservoir does not call this function, it will rely on external party to
     *         downgrade user's boosted amount if they withdraw
     */
    function updateBoostedAmount(address _user) public {
        require(msg.sender == address(fountain) || msg.sender == address(reservoir) || msg.sender == owner());
        if (!isBoostedFarmingEnabled) {
            // Return early as boostedMultiplier will always be 10_000 if feature not enabled
            // Gas saving: Potentially upgrade contract removing this check when boosted farming is live
            return;
        }

        // start from 1 as pid:0 is vault's emission, nobody has token to stake in pid 0
        for (uint256 pid = 1; pid < poolInfo.length; pid++) {
            UserInfo storage user = userInfo[pid][_user];
            if (user.boostedAmount == 0) {
                // Gas saving: as user do not have any amount staked in this pid,
                // update of user.boostedMultiplier below is not critical
                continue;
            }

            PoolInfo storage pool = poolInfo[pid];

            // Update the current pool accVnoPerShare
            updatePool(pid);

            // Check if any pending amount and add to userInfo
            uint256 pending = (user.boostedAmount * pool.accVnoPerShare) / 1e18 - user.rewardDebt;
            user.pendingHarvest += pending; // Store in pending harvest to claim in another flow

            // Update boosted amount and reward debt
            _updatePidBoostedAmount(pid, _user);
            user.rewardDebt = (user.boostedAmount * pool.accVnoPerShare) / 1e18;
        }
    }

    function getNftStakedByAddress(
        uint256 _pid,
        address _user,
        address _nftAddress
    ) external view returns (uint256[] memory) {
        EnumerableSetUpgradeable.UintSet storage ids = userStakedNfts[_pid][_user][_nftAddress];

        return ids.values();
    }

    /**
     * @return boostMultiplier accumulated, inclusive of locked vno and nft staking.
     *                         10,000 = 1x (no boost), 15,000 = 1.5x, 10,250 = 1.025x
     */
    function getBoostMultiplier(uint256 _pid, address _user) public view returns (uint256) {
        uint256 totalMultiplier = 10_000; // start at base: 1x

        if (!isBoostedFarmingEnabled) {
            return totalMultiplier; // Return early if feature is not enabled
        }

        // Step 1: Add boost based on user's boost balance
        uint256 totalBoostBalance = reservoir.balanceOf(_user) + fountain.balanceOf(_user);
        if (totalBoostBalance == 0) {
            return totalMultiplier; // Return early if no vno locked, NFT multiplier only active if user has VNO locked
        }
        for (uint256 i = 1; i < minVnoRequired.length; i++) {
            // Start from index 1 as index 0 is 0 vno = 0 multiplier
            if (totalBoostBalance < minVnoRequired[i]) {
                totalMultiplier += vnoBoostMultiplier[i - 1];
                break;
            }

            if (i == minVnoRequired.length - 1) {
                totalMultiplier += vnoBoostMultiplier[i];
            }
        }

        // Step 2: Add Boost based on NFT staked
        for (uint256 i = 0; i < enabledTokens.length(); i++) {
            // Retrieve the rarity and boost multiplier
            IRarityRegistry registry = rarityRegistries[enabledTokens.at(i)];
            uint16[] memory nftBoostMultiplier = nftBoostMultipliers[enabledTokens.at(i)];
            uint256 maxTier = registry.maxTier();

            // For each token user staked, calculate the boost multiplier
            EnumerableSetUpgradeable.UintSet storage ids = userStakedNfts[_pid][_user][enabledTokens.at(i)];
            for (uint256 j = 0; j < ids.length(); j++) {
                uint256 rarity = registry.getRarityLevel(ids.at(j)); // 0 = COMMON, 1 == RARE etc..
                uint256 tier = registry.getTier(ids.at(j)); // 1 == god, 2 == master, 3 == junior

                // Follows the calculation at MultiplierRegistry.sol
                uint256 index = rarity * maxTier + tier - 1;
                totalMultiplier += nftBoostMultiplier[index];
            }
        }

        // Step 3: Ensure max multiplier is less than MAX_BOOST_MULTIPLIER
        if (totalMultiplier > MAX_BOOST_MULTIPLIER) {
            return MAX_BOOST_MULTIPLIER;
        }

        return totalMultiplier;
    }

    /// @notice Update reward variables for all pools. Be careful of gas spending!
    function massUpdatePools() public {
        uint256 length = poolInfo.length;
        for (uint256 pid = 0; pid < length; ++pid) {
            updatePool(pid);
        }
    }

    /// @notice Update reward variables of the given pool to be up-to-date.
    function updatePool(uint256 _pid) public {
        PoolInfo storage pool = poolInfo[_pid];
        if (block.number <= pool.lastRewardBlock) {
            return;
        }

        uint256 totalBoostedAmount = pool.totalBoostedAmount;
        if (totalBoostedAmount == 0) {
            pool.lastRewardBlock = block.number;
            return;
        }

        uint256 multiplier = _getMultiplier(pool.lastRewardBlock, block.number);
        uint256 vnoReward = (multiplier * vnoPerBlock * pool.allocPoint) / totalAllocPoint;
        vno.mint(address(this), vnoReward);
        pool.accVnoPerShare += ((vnoReward * 1e18) / totalBoostedAmount);
        pool.lastRewardBlock = block.number;
    }

    /**
     * @notice Update user's multiplier and amount for a pid. Also update pool's totalBoostedAmount
     */
    function _updatePidBoostedAmount(uint256 _pid, address _user) internal {
        UserInfo storage user = userInfo[_pid][_user];
        PoolInfo storage pool = poolInfo[_pid];

        // get boost multiplier based on a pid
        uint256 newMultiplier = getBoostMultiplier(_pid, _user);
        user.boostedMultiplier = newMultiplier;

        uint256 newBoostedAmount = user.amount * newMultiplier;
        pool.totalBoostedAmount = pool.totalBoostedAmount + newBoostedAmount - user.boostedAmount;
        user.boostedAmount = newBoostedAmount;

        emit UpdatePidBoostedAmount(_user, _pid, newBoostedAmount);
    }

    /// @notice Return reward multiplier over the given _from to _to block.
    function _getMultiplier(uint256 _from, uint256 _to) internal pure returns (uint256) {
        return _to - _from;
    }

    /**
     * @notice transfer vno to user, if pool hasHarvestLock mechanism, take a % and lock in vaults
     */
    function _safeVnoTransfer(
        address _to,
        uint256 _amount,
        PoolInfo memory _pool,
        IVenoVault _vault
    ) internal {
        uint256 vnoBal = vno.balanceOf(address(this));

        // just in case if rounding error causes pool to not have enough vno.
        if (_amount > vnoBal) {
            _amount = vnoBal;
        }

        if (!_pool.hasHarvestLock) {
            vno.transfer(_to, _amount);
        } else {
            // Deposit locked vno amount to user selected vault (fountain or reservoir)
            uint256 totalLockedVnoAmount = (_amount * harvestLockRatio) / 100;
            for (uint256 i = 0; i < vaultPids.length(); i++) {
                uint256 pid = vaultPids.at(i);
                uint256 lockShare = vaultPidToLockShare[pid];

                // Gas optimization: don't deposit if lockShare was set to 0 for the vault
                if (lockShare != 0) {
                    uint256 amount = (totalLockedVnoAmount * lockShare) / totalLockShare;
                    _vault.depositFor(vaultPids.at(i), amount, _to);
                }
            }

            // Transfer remaining vno to the user (the unlocked amount)
            vno.transfer(_to, _amount - totalLockedVnoAmount);
        }
    }

    /**
     * @notice ensure pid 0 mantains a fixed percentage of total allocPoint
     */
    function _updatePidZeroPool() internal {
        uint256 length = poolInfo.length;
        uint256 points;
        for (uint256 pid = 1; pid < length; ++pid) {
            points += poolInfo[pid].allocPoint;
        }

        if (points != 0) {
            points = (points * pidZeroRatio) / (100 - pidZeroRatio);
            totalAllocPoint = totalAllocPoint - poolInfo[0].allocPoint + points;
            poolInfo[0].allocPoint = points;
        }
    }

    /**
     * @dev Required by UUPSUpgradeableWithDelay
     */
    function _authorizeUpgradeWithDelay(address) internal override onlyOwner {}
}
