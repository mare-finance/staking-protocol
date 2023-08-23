//SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.10;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

import "./interfaces/EquilibreInterfaces.sol";
import "./libraries/SafeToken.sol";

import "./StakedDistributor.sol";

contract RewardManager is OwnableUpgradeable {
    using SafeToken for address;

    StakedDistributor public immutable sMare =
        StakedDistributor(0x2c4A1f47c3E15F468399A87c4B41ec0d19297772);
    StakedDistributor public immutable uMare =
        StakedDistributor(0x194AAd54F363D28aDEaE53A7957d63B9BCf8a6b2);

    address public immutable mare = 0xd86C8d4279CCaFbec840c782BcC50D201f277419;
    address public immutable usdt = 0x919C1c267BC06a7039e03fcc2eF738525769109c;
    address public immutable vara = 0xE1da44C0dA55B075aE8E2e4b6986AdC76Ac77d73;
    address public immutable wkava = 0xc86c7C0eFbd6A49B35E8714C5f59D99De09A225b;

    IRouter public immutable router =
        IRouter(0xA7544C409d772944017BB95B99484B6E0d7B6388);

    function initialize() public initializer {
        __Ownable_init();
    }

    function addRewards(
        uint256 usdtAmount,
        uint256 varaAmount,
        uint256 wkavaAmount
    ) public {
        // calculate supplies
        uint256 sMareSupply = sMare.totalSupply();
        uint256 uMareSupply = uMare.totalSupply();
        uint256 totalSupply = sMareSupply + uMareSupply;

        // add vara
        if (varaAmount > 0) {
            pullTokenInternal(vara, varaAmount);
            addTokenRewardInternal(vara, uMareSupply, totalSupply);
        }

        // add wkava
        if (wkavaAmount > 0) {
            pullTokenInternal(wkava, wkavaAmount);
            addTokenRewardInternal(wkava, uMareSupply, totalSupply);
        }

        // add usdt
        if (usdtAmount > 0) {
            pullTokenInternal(usdt, usdtAmount);
            addUSDTRewardInternal(uMareSupply, totalSupply);
        }
    }

    function pullTokenInternal(address token, uint256 amount) internal {
        if (amount == type(uint256).max) {
            amount = token.balanceOf(msg.sender);
        }

        token.safeTransferFrom(msg.sender, address(this), amount);
    }

    function addTokenRewardInternal(
        address token,
        uint256 uMareSupply,
        uint256 totalSupply
    ) internal {
        uint256 amount = token.balanceOf(address(this));
        if (amount == 0) return;

        uint256 uMareAmount = (amount * uMareSupply) / totalSupply;
        uint256 sMareAmount = amount - uMareAmount;

        // add to uMare
        token.safeApprove(address(uMare), uMareAmount);
        uMare.addReward(token, uMareAmount);

        // add to sMare
        token.safeApprove(address(sMare), sMareAmount);
        sMare.addReward(token, sMareAmount);
    }

    function addUSDTRewardInternal(
        uint256 uMareSupply,
        uint256 totalSupply
    ) internal {
        uint256 amount = usdt.balanceOf(address(this));
        if (amount == 0) return;

        uint256 uMareUSDTAmount = (amount * uMareSupply) / totalSupply;
        uint256 sMareUSDTAmount = amount - uMareUSDTAmount;

        // add to uMare
        usdt.safeApprove(address(uMare), uMareUSDTAmount);
        uMare.addReward(usdt, uMareUSDTAmount);

        // swap usdt to mare
        swapUSDTtoMareInternal(sMareUSDTAmount);

        // add to sMare
        uint256 mareAmount = mare.balanceOf(address(this));
        mare.safeApprove(address(sMare), mareAmount);
        sMare.addReward(mare, mareAmount);
    }

    function swapUSDTtoMareInternal(uint256 usdtAmount) internal {
        IRouter.route[] memory path = new IRouter.route[](2);
        path[0] = IRouter.route({from: usdt, to: wkava, stable: false});
        path[1] = IRouter.route({from: wkava, to: mare, stable: false});

        usdt.safeApprove(address(router), usdtAmount);
        router.swapExactTokensForTokensSupportingFeeOnTransferTokens(
            usdtAmount,
            0,
            path,
            address(this),
            block.timestamp
        );
    }
}
