// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

interface IRarityRegistry {
    struct NftTierStruct {
        uint256 id; // nft token id
        uint256 tier; // For more details, see RarityRegistry.sol
    }

    function getRarityLevel(uint256 _id) external view returns (uint256);

    function getTier(uint256 _id) external view returns (uint256);

    function updateTier(uint256 _tier, uint256 _id) external;

    function updateTiers(NftTierStruct[] memory _nftTierStruct) external;

    function nftContractAddress() external view returns (address);

    function maxTier() external view returns (uint256);

    function maxRarityLevel() external view returns (uint256);
}
