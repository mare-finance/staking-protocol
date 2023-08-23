import { Contract } from "ethers";
import { deployments, ethers } from "hardhat";
import { getImpersonatedSigner } from "./_utils";

type ManagerFixtureOutput = [Contract, Contract];
const managerFixture = deployments.createFixture<any, ManagerFixtureOutput>(
    async ({ deployments, companionNetworks }, options) => {
        await deployments.fixture(undefined, {
            keepExistingDeployments: true,
        });

        const rewardManager = await ethers.getContract("RewardManager");
        const reserveManager = await ethers.getContract("ReserveManager");

        // set reserveManager as markets reserve guardian
        const comptrollerAddress = "0xFcD7D41D5cfF03C7f6D573c9732B0506C72f5C72";
        const comptroller = await ethers.getContractAt(
            "IComptroller",
            comptrollerAddress
        );
        const marketAddresses: string[] = await comptroller.getAllMarkets();
        await Promise.all(
            marketAddresses.map(async addr => {
                const market = await ethers.getContractAt("IMarket", addr);
                const admin = await market.admin();
                const adminSigner = await getImpersonatedSigner(admin);
                await market
                    .connect(adminSigner)
                    ._setReserveGuardian(reserveManager.address);
            })
        );

        return [rewardManager, reserveManager];
    }
);

export { managerFixture };
