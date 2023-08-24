import { expect } from "chai";
import { BigNumber, Contract } from "ethers";
import { ethers } from "hardhat";
import { SignerWithAddress } from "hardhat-deploy-ethers/signers";
import fetch from "node-fetch";
import { managerFixture } from "./_fixtures";

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
                const underlyingAddress = await m.underlying();
                const underlying = await ethers.getContractAt(
                    "ERC20",
                    underlyingAddress
                );
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

    const response = await fetch(`${url}?${queryParams}`, {
        method: "GET",
    });
    const data = await response.json();
    return data;
};
