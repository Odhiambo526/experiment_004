// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import {IERC721Receiver} from "@openzeppelin/contracts/interfaces/IERC721Receiver.sol";

contract ERC721Receiver is IERC721Receiver {
    /// @notice Callback method necessary to enable the contract to receive ERC721 tokens
    /// @dev This method is called by the ERC721 contract when a token is transfered to this contract
    function onERC721Received(
        address, /* operator */
        address, /* from */
        uint256, /* tokenId */
        bytes calldata /* data */
    ) external pure returns (bytes4) {
        return IERC721Receiver.onERC721Received.selector;
    }
}
