import { expect } from "chai";
import { BigNumber, Contract } from "ethers";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "hardhat-deploy-ethers/signers";
import fetch from "node-fetch";
import { managerFixture } from "./_fixtures";
import { getImpersonatedSigner } from "./_utils";

describe.only("ReserveManager", () => {
    let deployer: SignerWithAddress;
    let rewardManager: Contract;
    let reserveManager: Contract;

    let comptroller: Contract;

    beforeEach(async () => {
        [deployer] = await ethers.getSigners();
        [rewardManager, reserveManager] = await managerFixture();

        const comptrollerAddress = "0xFcD7D41D5cfF03C7f6D573c9732B0506C72f5C72";
        comptroller = await ethers.getContractAt(
            "IComptroller",
            comptrollerAddress
        );
    });

    it("Should deploy RewardManager properly", async () => {
        expect(rewardManager.address).to.properAddress;
        expect(reserveManager.address).to.properAddress;
    });

    it("Should distribute reserves", async () => {
        const usdt = await reserveManager.usdt();

        const marketAddresses: string[] = await comptroller.getAllMarkets();
        const markets = await Promise.all(
            marketAddresses.map(addr => ethers.getContractAt("IMarket", addr))
        );
        const marketInfo = await Promise.all(
            markets.map(async m => {
                console.log("market", m.address);
                const underlyingAddress = await m.underlying();
                const underlying = await ethers.getContractAt(
                    "ERC20",
                    underlyingAddress
                );
                console.log("underlying", underlying.address);
                const underlyingDecimals = await underlying.decimals();
                const reserve = await m.totalReserves();
                const cash = await m.getCash();
                const amount = reserve.gt(cash) ? cash : reserve;
                const data = (
                    await fetchSwapDataV3(
                        underlying.address,
                        underlyingDecimals,
                        amount,
                        reserveManager.address
                    )
                ).data;

                return {
                    market: m,
                    underlying,
                    underlyingDecimals,
                    reserve,
                    cash,
                    amount,
                    data,
                };
            })
        );
        const usdtMarketInfo = marketInfo.find(
            m => m.underlying.address.toLowerCase() === usdt.toLowerCase()
        );
        const otherMarketInfo = marketInfo.filter(m => m != usdtMarketInfo);

        await expect(
            reserveManager.distributeReserves(
                usdtMarketInfo?.market.address,
                usdtMarketInfo?.amount,
                otherMarketInfo.map(om => om.market.address),
                otherMarketInfo.map(om => om.amount),
                otherMarketInfo.map(om => om.data.data)
            )
        ).not.reverted;
    });

    it.only("Should distribute vara", async () => {
        const [deployer] = await ethers.getSigners();

        const pairAddress = "0x5d65fa1eB5eeb5da4a384F08B8739036E8aF0304";
        const lpStaker = await getImpersonatedSigner(
            "0x1Ed1b93377B6b4Fa4cC7146a06C8912185C9EAb0"
        );

        // withdraw lp and send to deployer
        const gaugeAddress = "0xbdcd19cd1d54b87afb2ef3ca6570045eaf2e4a10";
        const gauge = await ethers.getContractAt("IGauge", gaugeAddress);
        await gauge.connect(lpStaker).withdrawAll();

        // send some lp to deployer
        const pair = await ethers.getContractAt("IERC20", pairAddress);
        const pairAmount = await pair.balanceOf(lpStaker.address);

        await expect(
            pair.connect(lpStaker).transfer(deployer.address, pairAmount)
        ).not.to.reverted;

        // stake lp
        await expect(pair.approve(reserveManager.address, pairAmount)).not
            .reverted;
        await expect(reserveManager._stakeLP(pairAddress, pairAmount)).not
            .reverted;

        expect(await pair.balanceOf(deployer.address)).eq(0);

        await expect(reserveManager.distributeVara(pairAddress)).not.reverted;

        // unstake lp
        await expect(reserveManager._unstakeLP(pairAddress, deployer.address))
            .not.reverted;

        expect(await pair.balanceOf(deployer.address)).eq(pairAmount);
    });
});

const fetchSwapDataV2 = async (
    underlying: string,
    underlyingDecimals: number,
    amount: BigNumber,
    account: string
) => {
    const url = "https://ethapi.openocean.finance/v2/2222/swap";

    const queryParams = new URLSearchParams();
    queryParams.append("chainId", "2222");
    queryParams.append("inTokenAddress", underlying);
    queryParams.append(
        "outTokenAddress",
        "0x919C1c267BC06a7039e03fcc2eF738525769109c"
    );
    queryParams.append("amount", amount.toString());
    queryParams.append("gasPrice", ethers.utils.parseUnits("1", 9).toString());
    queryParams.append("slippage", "50");
    queryParams.append("account", account);

    const response = await fetch(`${url}?${queryParams}`, {
        method: "GET",
    });
    const data = await response.json();
    return data;
};

const fetchSwapDataV3 = async (
    underlying: string,
    underlyingDecimals: number,
    amount: BigNumber,
    account: string
) => {
    const url = "https://open-api.openocean.finance/v3/kava/swap_quote";
    const queryParams = new URLSearchParams();
    queryParams.append("chain", "kava");
    queryParams.append("inTokenAddress", underlying);
    queryParams.append(
        "outTokenAddress",
        "0x919C1c267BC06a7039e03fcc2eF738525769109c"
    );
    queryParams.append(
        "amount",
        ethers.utils.formatUnits(amount, underlyingDecimals)
    );
    queryParams.append("gasPrice", "1");
    queryParams.append("slippage", "1");
    queryParams.append("account", account);

    console.log(`${url}?${queryParams}`);
    const response = await fetch(`${url}?${queryParams}`, {
        method: "GET",
    });
    const data = await response.json();
    return data;
};
