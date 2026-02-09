// SPDX-License-Identifier: MIT
pragma solidity 0.8.15;

interface IVenoVault {
    /**
     * @notice on behalf of user into the pid
     */
    function depositFor(
        uint256 _pid,
        uint256 _amount,
        address _user
    ) external;

    /**
     * @return poolInfo of struct (uint256 multiplier, uint256 lockPeriod, uint256 totalStaked)
     */
    function poolInfo(uint256 _pid)
        external
        returns (
            uint256,
            uint256,
            uint256
        );

    function balanceOf(address _user) external view returns (uint256);
}
