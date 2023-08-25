//SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.10;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";

import "./interfaces/LendingInterfaces.sol";
import "./interfaces/EquilibreInterfaces.sol";
import "./libraries/SafeToken.sol";

import "./RewardManager.sol";

contract ReserveManager is AccessControlUpgradeable {
    using SafeToken for address;

    bytes32 public constant DISTRIBUTOR_ROLE = keccak256("DISTRIBUTOR_ROLE");

    /* Tokens */
    address public constant usdt = 0x919C1c267BC06a7039e03fcc2eF738525769109c;
    address public constant vara = 0xE1da44C0dA55B075aE8E2e4b6986AdC76Ac77d73;

    /* OpenOcean */
    address public constant OORouter =
        0x6352a56caadC4F1E25CD6c75970Fa768A3304e64;

    /* Equilibre */
    address public constant voter = 0x4eB2B9768da9Ea26E3aBe605c9040bC12F236a59;

    /* Distribution */
    address public constant rewardManager =
        0x8CbD01ec0C424B7E9B174225626a59c8DEC09494;

    function initialize() public initializer {
        __AccessControl_init();

        _grantRole(DEFAULT_ADMIN_ROLE, _msgSender());
    }

    /* Guarded Distribution Functions */
    function distributeReserves(
        IMarket usdtMarket,
        uint56 usdtAmount,
        IMarket[] calldata markets,
        uint256[] calldata amounts,
        bytes[] calldata swapQuoteData
    ) external onlyRole(DISTRIBUTOR_ROLE) {
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

        uint256 distAmount = usdt.myBalance();

        usdt.safeApprove(rewardManager, distAmount);
        RewardManager(rewardManager).addRewards(distAmount, 0, 0);
    }

    function distributeVara(address pair) external onlyRole(DISTRIBUTOR_ROLE) {
        claimVaraInternal(pair);

        uint256 distAmount = vara.myBalance();

        vara.safeApprove(rewardManager, distAmount);
        RewardManager(rewardManager).addRewards(0, distAmount, 0);
    }

    /* Guarded Equilibre Management Function */
    function _stakeLP(
        address pair,
        uint256 amount
    ) public onlyRole(DEFAULT_ADMIN_ROLE) {
        if (amount == type(uint256).max) {
            amount = pair.balanceOf(msg.sender);
        }

        pair.safeTransferFrom(msg.sender, address(this), amount);

        stakeLPInternal(pair);
    }

    function _unstakeLP(
        address pair,
        address to
    ) public onlyRole(DEFAULT_ADMIN_ROLE) {
        unstakeLPInternal(pair);

        uint256 amount = pair.myBalance();
        pair.safeTransfer(to, amount);
    }

    /* Internal Market Management Functions */
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
        require(success, "ReserveManager: OO_API_SWAP_FAILED");
    }

    /* Internal Equilibre Management Functions */
    function stakeLPInternal(address pair) internal {
        address gauge = IVoter(voter).gauges(pair);

        uint256 amountPair = pair.myBalance();
        pair.safeApprove(gauge, amountPair);
        IGauge(gauge).deposit(amountPair, 0);
    }

    function unstakeLPInternal(address pair) internal {
        address gauge = IVoter(voter).gauges(pair);
        IGauge(gauge).withdrawAll();
    }

    function claimVaraInternal(address pair) internal {
        address[] memory tokens = new address[](1);
        tokens[0] = vara;

        address gauge = IVoter(voter).gauges(pair);
        IGauge(gauge).getReward(address(this), tokens);
    }
}
