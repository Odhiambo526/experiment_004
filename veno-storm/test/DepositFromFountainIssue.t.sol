// SPDX-License-Identifier: MIT
pragma solidity 0.8.15;

import "forge-std/Test.sol";
import "../contracts/VenoStorm.sol";
import "../contracts/VenoFountainDepositToken.sol";
import "../contracts/interfaces/IVenoToken.sol";
import "../contracts/interfaces/IVenoVault.sol";
import "@openzeppelin/contracts-upgradeable/proxy/ERC1967/ERC1967Proxy.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract DepositFromFountainIssueTest is Test {
    VenoStorm public venoStorm;
    IVenoToken public vno;
    IVenoVault public reservoir;
    IVenoVault public fountain;
    IERC20 public fountainDepositToken;
    IERC20 public lpToken;
    address public endUser;

    // Mainnet addresses
    address constant VENO_TOKEN = 0xdb7d0A1eC37dE1dE924F8e8adac6Ed338D4404E9;
    address constant VAULT = 0xA6fF77fC8E839679D4F7408E8988B564dE1A2dcD;
    address constant LP_TOKEN = 0x8900A1D1eAb5e8Af142017aF8a7535979Db6E629;
    address constant FOUNTAIN_DEPOSIT_TOKEN = 0xb4be51216f4926Ab09dDf4E64bc20F499FD6Ca95;

    function setUp() public {
        // Fork mainnet - use createSelectFork with explicit URL
        vm.createSelectFork("https://evm.cronos.org");
        
        endUser = makeAddr("endUser");

        // Use mainnet contract addresses
        vno = IVenoToken(VENO_TOKEN);
        reservoir = IVenoVault(VAULT);
        fountain = IVenoVault(VAULT); // Using same vault address for fountain
        fountainDepositToken = IERC20(FOUNTAIN_DEPOSIT_TOKEN);
        lpToken = IERC20(LP_TOKEN);

        address implementation = address(new VenoStorm());
        
        bytes memory initData = abi.encodeWithSelector(
            VenoStorm.initialize.selector,
            address(vno),
            address(reservoir),
            address(fountain),
            address(fountainDepositToken),
            block.number + 10,
            100 * 1e18,
            200 * 1e18,
            7 days
        );
        
        ERC1967Proxy proxy = new ERC1967Proxy(implementation, initData);
        venoStorm = VenoStorm(address(proxy));

        venoStorm.updatePidZeroRatio(20);
        venoStorm.add(1000, IERC20Upgradeable(address(lpToken)), false, false);
        
        vm.roll(block.number + 20);
    }

    function testDepositFromFountainCreditsWrongUser() public {
        uint256 testPid = 1;
        uint256 depositAmount = 1000 * 1e18;
        
        uint256 poolLen = venoStorm.poolLength();
        require(poolLen > testPid, "Test pid not available");
        
        (, uint256 allocPoint, uint256 lastRewardBlock,,, uint256 totalBoostedBefore) = venoStorm.poolInfo(testPid);
        require(allocPoint > 0, "Pool allocPoint is zero");
        require(venoStorm.vnoPerBlock() > 0, "Emissions are zero");
        require(block.number >= venoStorm.startBlock(), "Emissions not started");
        require(lastRewardBlock <= block.number, "Pool not active");
        
        // Use deal() to give LP tokens to the fountain address (works with forked mainnet)
        deal(address(lpToken), address(fountain), depositAmount);
        
        vm.prank(address(fountain));
        lpToken.approve(address(venoStorm), type(uint256).max);
        
        (uint256 endUserAmountBefore,,,,, ) = venoStorm.userInfo(testPid, endUser);
        (uint256 fountainAmountBefore,,,,, ) = venoStorm.userInfo(testPid, address(fountain));
        
        vm.prank(address(fountain));
        venoStorm.depositFromFountain(testPid, depositAmount, IVenoVault(address(reservoir)));
        
        (uint256 endUserAmountAfter,,,,, ) = venoStorm.userInfo(testPid, endUser);
        (uint256 fountainAmountAfter,,,,, ) = venoStorm.userInfo(testPid, address(fountain));
        (,,,,, uint256 totalBoostedAfter) = venoStorm.poolInfo(testPid);
        
        assertEq(endUserAmountAfter, endUserAmountBefore, "End-user stake changed");
        assertEq(fountainAmountAfter, fountainAmountBefore + depositAmount, "Fountain stake incorrect");
        assertGt(totalBoostedAfter, totalBoostedBefore, "Pool totalBoostedAmount unchanged");
        
        vm.roll(block.number + 1000);
        
        uint256 endUserPendingRewards = venoStorm.pendingVno(testPid, endUser);
        uint256 fountainPendingRewards = venoStorm.pendingVno(testPid, address(fountain));
        
        assertEq(endUserPendingRewards, 0, "End-user has rewards");
        assertGt(fountainPendingRewards, 0, "Fountain has no rewards");
    }
}
