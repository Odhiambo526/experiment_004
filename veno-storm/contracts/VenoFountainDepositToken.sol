// SPDX-License-Identifier: MIT
pragma solidity 0.8.15;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title  VenoFountainDepositToken
 * @notice This token will be deposited in Storm by Fountain. A pool exclusive to Fountain
 *         will be added to Storm, result in Fountain owning 100% of allocPoint of that pool. This
 *         token should stay in Storm forever.
 */
contract VenoFountainDepositToken is ERC20 {
    constructor() ERC20("Fountain Deposit Token", "FOUNTAIN_DEPOSIT") {
        _mint(msg.sender, 1);
    }

    function decimals() public pure override returns (uint8) {
        return 0;
    }
}
