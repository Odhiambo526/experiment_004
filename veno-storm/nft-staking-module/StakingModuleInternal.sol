// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.4;

import {StakingInfo} from "./Types.sol";
import {EnumerableSet} from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC721} from "@openzeppelin/contracts/interfaces/IERC721.sol";
import {ERC721Receiver} from "./ERC721Receiver.sol";
import {SetUtils} from "./utils/SetUtils.sol";

/// @title Management of whitelisted token contracts / collections for staking
/// @dev This contract keeps a list of whitelisted token contracts.
/// @dev This contract does NOT implement access control for controlling the whitelist, which needs to be implemented by the inheriting contract.
//
abstract contract TokenPermissions {
    using EnumerableSet for EnumerableSet.AddressSet;
    using SetUtils for EnumerableSet.AddressSet;

    // Tokens that can be staked, controlled by contract owner
    EnumerableSet.AddressSet enabledTokens;

    /* ============ Modifiers ============ */

    modifier onlyEnabledTokens(address _token) {
        require(enabledTokens.contains(_token));
        _;
    }

    /* ============ Events ============ */

    event EnableToken(address indexed tokenContract);
    event DisableToken(address indexed tokenContract);

    /// @notice OWNER ONLY: Add an ERC721 contract address to the list of supported tokens
    /// @param _token Address of token to enable
    function _enableToken(address _token) internal {
        enabledTokens.add(_token);
        emit EnableToken(_token);
    }

    /// @notice Will only disable staking of tokens. Already staked tokens can still be unstaked.
    /// @param _token Address of token to disable
    function _disableToken(address _token) internal {
        enabledTokens.remove(_token);
        emit DisableToken(_token);
    }

    /// @notice Gets addresses of all nft collections / contracts that are enabled for staking
    /// @return Array of enabled tokens
    function _getEnabledTokens() internal view returns (address[] memory) {
        return enabledTokens.toArray();
    }
}

/// @title Basic Staking functionality
/// @dev This constract handles transfering of tokens as well as keeping track of which user staked which tokens
/// @dev This constract does NOT keep track of staking history
abstract contract BaseStaking is ERC721Receiver {
    using EnumerableSet for EnumerableSet.UintSet;
    using SetUtils for EnumerableSet.UintSet;

    /* ============ State Variables ============ */

    // (tokenContract, staker) => All tokenIds currently staked
    mapping(address => mapping(address => EnumerableSet.UintSet)) stakersCurrentlyStakedIds;

    /* ============ Events ============ */

    event Stake(
        address indexed tokenContract,
        address indexed staker,
        uint256 indexed tokenId
    );
    event Unstake(
        address indexed tokenContract,
        address indexed staker,
        uint256 indexed tokenId
    );

    function _stake(address _token, uint256 _tokenId) internal virtual {
        require(
            !stakersCurrentlyStakedIds[_token][msg.sender].contains(_tokenId),
            "Token already staked"
        );

        // Transfer ERC721 from user
        IERC721(_token).safeTransferFrom(msg.sender, address(this), _tokenId);

        // Update stakers specific data
        stakersCurrentlyStakedIds[_token][msg.sender].add(_tokenId);

        emit Stake(_token, msg.sender, _tokenId);
    }

    function _unstake(address _token, uint256 _tokenId) internal virtual {
        require(
            _isTokenStaked(_token, msg.sender, _tokenId),
            "Token not staked"
        );

        // Update tokens currently staked
        stakersCurrentlyStakedIds[_token][msg.sender].remove(_tokenId);

        // Transfer ERC721 from user
        IERC721(_token).safeTransferFrom(address(this), msg.sender, _tokenId);

        emit Unstake(_token, msg.sender, _tokenId);
    }

    /* ============ Views ============ */

    /// @notice Get tokenIds of a given collection currently staked by specific user
    /// @param _token   Address of the ERC721 contract
    /// @param _staker  User for whom to retrieve staked token ids
    /// @return Array of tokenIds which are currently staked by the user for the given token contract
    function _getCurrentlyStakedTokenIds(address _token, address _staker)
        internal
        view
        returns (uint256[] memory)
    {
        return stakersCurrentlyStakedIds[_token][_staker].toArray();
    }

    /// @notice Checks wether a specific token is currently staked by a specific user
    /// @param _token   Address of the ERC721 contract
    /// @param _staker  User for whom to retrieve staked token ids
    /// @param _tokenId TokenId to check for staking
    /// @return bool True if token is staked by user, false otherwise
    function _isTokenStaked(
        address _token,
        address _staker,
        uint256 _tokenId
    ) internal view returns (bool) {
        return stakersCurrentlyStakedIds[_token][_staker].contains(_tokenId);
    }
}

/// @title Contract that combines the basic staking functionality limiting it to white listed tokens
abstract contract BaseStakingPermissioned is BaseStaking, TokenPermissions {
    function _stake(address _token, uint256 _tokenId)
        internal
        virtual
        override
        onlyEnabledTokens(_token)
    {
        BaseStaking._stake(_token, _tokenId);
    }
}

/// @title Staking contract including keeping track of staking history in various ways
/// @dev This contract extends the basic staking functionality by keeping track of staking history as well as staked ids across users
abstract contract StakingModuleInternal is BaseStakingPermissioned {
    using EnumerableSet for EnumerableSet.UintSet;
    using SetUtils for EnumerableSet.UintSet;

    /* ============ State Variables ============ */

    // (tokenContract, staker, tokenId) => History of past staking periods
    mapping(address => mapping(address => mapping(uint256 => uint256[]))) stakersHistory;
    // (tokenContract, staker) => All tokenIds ever staked (including currently staked ones)
    mapping(address => mapping(address => EnumerableSet.UintSet)) stakersPreviouslyStakedIds;

    // (tokenContract, tokenId) => History of past staking periods for this token
    mapping(address => mapping(uint256 => uint256[])) tokenHistory;
    // (tokenContract) => All tokenIds currently staked
    mapping(address => EnumerableSet.UintSet) currentlyStakedIds;
    // (tokenContract, staker) => All tokenIds ever staked (including currently staked ones)
    mapping(address => EnumerableSet.UintSet) previouslyStakedIds;

    uint256 currentStakingDataId;
    mapping(uint256 => StakingInfo) stakingData;

    /* ============ State Changing Methods ============ */

    /// @notice Stake an ERC721 token and transfer it to the contract
    /// @param _token   Address of the ERC721 contract (must be one of the enabled tokens)
    /// @param _tokenId Token id to stake (caller must be owner and have approved this contract to transfer token)
    function _stake(address _token, uint256 _tokenId) internal override {
        BaseStakingPermissioned._stake(_token, _tokenId);

        uint256 stakingDataId = currentStakingDataId++;
        stakingData[stakingDataId] = StakingInfo({
            staker: msg.sender,
            startTime: block.timestamp,
            endTime: 0
        });

        stakersPreviouslyStakedIds[_token][msg.sender].add(_tokenId);
        stakersHistory[_token][msg.sender][_tokenId].push(stakingDataId);

        // Update token specific data
        currentlyStakedIds[_token].add(_tokenId);
        previouslyStakedIds[_token].add(_tokenId);
        tokenHistory[_token][_tokenId].push(stakingDataId);
    }

    /// @notice Unstake an ERC721 token and transfer it back to the caller
    /// @param _token   Address of the ERC721 contract (must be one of the enabled tokens)
    /// @param _tokenId Token id to stake (caller must be the address which originally staked this token)
    function _unstake(address _token, uint256 _tokenId) internal override {
        BaseStaking._unstake(_token, _tokenId);

        // Update tokens currently staked
        currentlyStakedIds[_token].remove(_tokenId);

        // End time to staking history
        uint256 historyLength = tokenHistory[_token][_tokenId].length;
        uint256 stakingDataId = tokenHistory[_token][_tokenId][
            historyLength - 1
        ];
        require(
            stakingData[stakingDataId].staker == msg.sender,
            "Wrong staker"
        );
        stakingData[stakingDataId].endTime = block.timestamp;
    }

    /* ============ Views ============ */

    /// @notice Get tokenIds of a given collection currently staked across users
    /// @param _token   Address of the ERC721 contract
    /// @return Array of tokenIds which are currently staked by any user for the given token contract
    function _getCurrentlyStakedTokenIds(address _token)
        internal
        view
        returns (uint256[] memory)
    {
        return currentlyStakedIds[_token].toArray();
    }

    /// @notice Get tokenIds of a given collection that have ever been staked by specific user
    /// @param _token   Address of the ERC721 contract
    /// @param _staker  User for whom to retrieved staked token ids
    /// @return Array of tokenIds which have ever been staked by the user for the given token contract
    function _getPreviouslyStakedTokenIds(address _token, address _staker)
        internal
        view
        returns (uint256[] memory)
    {
        return stakersPreviouslyStakedIds[_token][_staker].toArray();
    }

    /// @notice Get tokenIds of a given collection that have ever been staked by any user
    /// @param _token   Address of the ERC721 contract
    /// @return Array of tokenIds which have ever been staked for the given token contract
    function _getPreviouslyStakedTokenIds(address _token)
        internal
        view
        returns (uint256[] memory)
    {
        return previouslyStakedIds[_token].toArray();
    }

    /// @notice Gets the history of staking periods for given staker and tokenId
    /// @param _token   Address of the ERC721 contract
    /// @param _staker  Adress of user for which to retrieve staking history
    /// @param _token   Token id for which to retrieve staking history
    /// @return Array of structs containing start and end time of each staking period
    function _getStakingHistory(
        address _token,
        address _staker,
        uint256 _tokenId
    ) internal view returns (StakingInfo[] memory) {
        uint256[] memory stakingIds = stakersHistory[_token][_staker][_tokenId];
        return _getStakingDataForIds(stakingIds);
    }

    /// @notice Gets the history of staking periods for given tokenId across all stakers
    /// @param _token   Address of the ERC721 contract
    /// @param _token   Token id for which to retrieve staking history
    /// @return Array of structs containing start and end time of each staking period as well as the staker address
    function _getStakingHistory(address _token, uint256 _tokenId)
        internal
        view
        returns (StakingInfo[] memory)
    {
        uint256[] memory stakingIds = tokenHistory[_token][_tokenId];
        return _getStakingDataForIds(stakingIds);
    }

    /// @notice Gets the last staking period for given staker and tokenId
    /// @param _token   Address of the ERC721 contract
    /// @param _tokenId Token id for which to retrieve latest data
    /// @param _staker  Adress of user for which to retrieve staking history
    /// @return currentInfo Struct containing start and end date for latest staking period. Will both be zero if this tokenId was never staked by the given user.
    function _getCurrentStakingInfo(
        address _token,
        address _staker,
        uint256 _tokenId
    ) internal view returns (StakingInfo memory currentInfo) {
        uint256 historyLength = stakersHistory[_token][_staker][_tokenId]
            .length;
        if (historyLength > 0) {
            uint256 stakingId = stakersHistory[_token][_staker][_tokenId][
                historyLength - 1
            ];
            currentInfo = stakingData[stakingId];
        }
    }

    /// @notice Gets the last staking period for given staker and tokenId
    /// @param _token   Address of the ERC721 contract
    /// @param _tokenId Token id for which to retrieve latest data
    /// @return currentInfo Struct containing start and end date for latest staking period. Will both be zero if this tokenId was never staked by the given user.
    function _getCurrentStakingInfo(address _token, uint256 _tokenId)
        internal
        view
        returns (StakingInfo memory currentInfo)
    {
        uint256 historyLength = tokenHistory[_token][_tokenId].length;
        if (historyLength > 0) {
            uint256 stakingId = tokenHistory[_token][_tokenId][
                historyLength - 1
            ];
            currentInfo = stakingData[stakingId];
        }
    }

    /// @dev Retrieve staking data for a given set of staking ids
    function _getStakingDataForIds(uint256[] memory _stakingIds)
        internal
        view
        returns (StakingInfo[] memory data)
    {
        data = new StakingInfo[](_stakingIds.length);
        for (uint256 i = 0; i < _stakingIds.length; ++i) {
            data[i] = stakingData[_stakingIds[i]];
        }
    }

    /// @notice Checks wether a specific token is currently staked by any user
    /// @param _token   Address of the ERC721 contract
    /// @param _tokenId TokenId to check for staking
    /// @return bool True if token is,  false otherwise
    function _isTokenStaked(address _token, uint256 _tokenId)
        internal
        view
        returns (bool)
    {
        return currentlyStakedIds[_token].contains(_tokenId);
    }
}
