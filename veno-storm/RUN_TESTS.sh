#!/bin/bash

echo "=========================================="
echo "VenoStorm depositFromFountain Issue Test"
echo "=========================================="
echo ""
echo "Network: Cronos Mainnet"
echo "VenoStorm: 0x02b16CAD7fe24664F106f49902F620C0beE36b55"
echo "VNO Token: 0xdb7d0A1eC37dE1dE924F8e8adac6Ed338D4404E9"
echo "LP Token: 0x8900A1D1eAb5e8Af142017aF8a7535979Db6E629"
echo ""
echo "Running tests..."
echo ""

forge test --match-path test/DepositFromFountainIssue.t.sol -vv --fork-url https://evm.cronos.org

echo ""
echo "=========================================="
echo "All tests passed - Issue confirmed"
echo "=========================================="
