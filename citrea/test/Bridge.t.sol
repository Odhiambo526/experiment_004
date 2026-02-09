// SPDX-License-Identifier: GPL-3.0-only
pragma solidity ^0.8.26;

import "forge-std/Test.sol";
import "../src/Bridge.sol";
import "../src/BitcoinLightClient.sol";

contract BridgeTest is Test {
    Bridge public bridge;
    BitcoinLightClient public lightClient;
    
    address constant SYSTEM_CALLER = address(0xdeaDDeADDEaDdeaDdEAddEADDEAdDeadDEADDEaD);
    address constant LIGHT_CLIENT_ADDRESS = address(0x3100000000000000000000000000000000000001);
    
    uint256 public constant SAT_TO_WEI = 10**10;
    uint256 public constant DEPOSIT_AMOUNT = 100000 * SAT_TO_WEI; // 100000 sats = 0.001 BTC
    
    function setUp() public {
        // Deploy BitcoinLightClient
        lightClient = new BitcoinLightClient();
        
        // Deploy Bridge
        bridge = new Bridge();
        
        // Initialize BitcoinLightClient
        vm.prank(SYSTEM_CALLER);
        lightClient.initializeBlockNumber(100);
        
        // Prepare deposit prefix and suffix (minimum 34 bytes for prefix)
        bytes memory depositPrefix = new bytes(54); // 34 bytes minimum + 20 bytes for address placeholder
        depositPrefix[0] = 0x51; // OP_1
        depositPrefix[1] = 0x20; // OP_PUSHBYTES32
        // Fill with some dummy data
        for (uint i = 2; i < 34; i++) {
            depositPrefix[i] = bytes1(uint8(i));
        }
        // Add 20 bytes for address (will be replaced in actual usage)
        for (uint i = 34; i < 54; i++) {
            depositPrefix[i] = bytes1(uint8(i));
        }
        
        bytes memory depositSuffix = hex"51"; // OP_1 as suffix
        
        // Initialize Bridge
        vm.prank(SYSTEM_CALLER);
        bridge.initialize(depositPrefix, depositSuffix, DEPOSIT_AMOUNT);
    }
    
    function test_Initialize() public view {
        assertTrue(bridge.initialized());
        assertEq(bridge.depositAmount(), DEPOSIT_AMOUNT);
        assertEq(bridge.operator(), SYSTEM_CALLER);
        assertEq(bridge.failedDepositVault(), address(0x3100000000000000000000000000000000000007));
    }
    
    function test_GetWithdrawalCount() public view {
        assertEq(bridge.getWithdrawalCount(), 0);
    }
    
    function test_SetOperator() public {
        address newOperator = address(0x1234);
        vm.prank(bridge.owner());
        bridge.setOperator(newOperator);
        assertEq(bridge.operator(), newOperator);
    }
    
    function test_SetOperator_RevertIfNotOwner() public {
        address newOperator = address(0x1234);
        vm.prank(address(0x9999)); // Not owner
        vm.expectRevert();
        bridge.setOperator(newOperator);
    }
    
    function test_SetOperator_RevertIfZeroAddress() public {
        vm.prank(bridge.owner());
        vm.expectRevert("Operator cannot be zero address");
        bridge.setOperator(address(0));
    }

    /// @dev F-002: Observes whether withdraw(txId, outputId) reservation is global (keyed only by UTXO)
    ///       or caller-bound. Two distinct addresses attempt the same (txId, outputId); we assert
    ///       the second attempt reverts with "UTXO already used" regardless of caller.
    function test_Withdraw_UTXOReservationIsGlobalNotCallerBound() public {
        bytes32 txId = keccak256("tx");
        bytes4 outputId = 0x00000001;

        address alice = address(0xA11CE);
        address bob = address(0xB0B);
        vm.deal(alice, DEPOSIT_AMOUNT);
        vm.deal(bob, DEPOSIT_AMOUNT);

        // Alice withdraws first with (txId, outputId).
        vm.prank(alice);
        bridge.withdraw{value: DEPOSIT_AMOUNT}(txId, outputId);

        assertEq(bridge.getWithdrawalCount(), 1);
        assertTrue(bridge.usedWithdrawalUTXO(sha256(abi.encodePacked(txId, outputId))));

        // Bob attempts the same (txId, outputId) with correct value. Reservation is global:
        // same UTXO key is already marked used, so call reverts.
        vm.prank(bob);
        vm.expectRevert("UTXO already used");
        bridge.withdraw{value: DEPOSIT_AMOUNT}(txId, outputId);

        assertEq(bridge.getWithdrawalCount(), 1);
    }

    /// @dev F-002 (symmetric): Whoever calls first with (txId, outputId) succeeds; the other fails.
    ///       Confirms reservation is first-come by UTXO key, not by intended withdrawer.
    function test_Withdraw_FirstCallerReservesUTXOSecondReverts() public {
        bytes32 txId = keccak256("other");
        bytes4 outputId = 0x00000002;

        address first = address(0xF1);
        address second = address(0xF2);
        vm.deal(first, DEPOSIT_AMOUNT);
        vm.deal(second, DEPOSIT_AMOUNT);

        vm.prank(first);
        bridge.withdraw{value: DEPOSIT_AMOUNT}(txId, outputId);

        vm.prank(second);
        vm.expectRevert("UTXO already used");
        bridge.withdraw{value: DEPOSIT_AMOUNT}(txId, outputId);
    }
}
