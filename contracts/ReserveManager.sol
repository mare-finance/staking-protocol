//SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.10;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

import "./interfaces/LendingInterfaces.sol";
import "./libraries/SafeToken.sol";

import "./RewardManager.sol";

import "hardhat/console.sol";

contract ReserveManager is OwnableUpgradeable {
    using SafeToken for address;

    address public immutable usdt = 0x919C1c267BC06a7039e03fcc2eF738525769109c;
    // OpenOcean Router
    address public immutable OORouter =
        0x6352a56caadC4F1E25CD6c75970Fa768A3304e64;

    address public immutable rewardManager =
        0x8CbD01ec0C424B7E9B174225626a59c8DEC09494;

    function initialize() public initializer {
        __Ownable_init();
    }

    function distributeReserves(
        IMarket usdtMarket,
        uint56 usdtAmount,
        IMarket[] calldata markets,
        uint256[] calldata amounts,
        bytes[] calldata swapQuoteData
    ) external onlyOwner {
        require(
            markets.length == amounts.length &&
                markets.length == swapQuoteData.length,
            "ReserveManager: INVALID_INPUT"
        );

        reduceReserveInternal(usdtMarket, usdtAmount);

        for (uint256 i = 0; i < markets.length; i++) {
            reduceReserveInternal(markets[i], amounts[i]);
            address underlying = markets[i].underlying();
            swapToBaseInternal(underlying, amounts[i], swapQuoteData[i]);
        }

        uint256 distAmount = usdt.balanceOf(address(this));

        usdt.safeApprove(rewardManager, distAmount);
        RewardManager(rewardManager).addRewards(distAmount, 0, 0);
    }

    function reduceReserveInternal(IMarket market, uint256 amount) internal {
        market.accrueInterest();

        require(market.getCash() >= amount, "ReserveManager: NOT_ENOUGH_CASH");
        require(
            market.totalReserves() >= amount,
            "ReserveManager: NOT_ENOUGH_RESERVE"
        );

        market._reduceReserves(amount);
    }

    function swapToBaseInternal(
        address underlying,
        uint256 amount,
        bytes memory swapQuoteDatum
    ) internal {
        underlying.safeApprove(OORouter, amount);

        (bool success, bytes memory result) = OORouter.call{value: 0}(
            swapQuoteDatum
        );
        if (success == false) {
            assembly {
                revert(add(result, 32), mload(result))
            }
        }
        require(success, "ReserveManager: OO_API_SWAP_FAILED");
    }
}