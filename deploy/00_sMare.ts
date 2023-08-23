import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

const mareAddress = "0xd86C8d4279CCaFbec840c782BcC50D201f277419";
const veloAddress = "0xE1da44C0dA55B075aE8E2e4b6986AdC76Ac77d73";

const func: DeployFunction = async ({
    getNamedAccounts,
    deployments: { deploy },
    ethers,
    network,
}: HardhatRuntimeEnvironment) => {
    const { deployer } = await getNamedAccounts();

    if (await ethers.getContractOrNull("sMare")) {
        console.log("sMare already deployed");
        return;
    }

    const stakeDeploy = await deploy("sMare", {
        from: deployer,
        log: true,
        contract: "contracts/StakedDistributor.sol:StakedDistributor",
        args: [mareAddress, "Staked Mare", "sMare"],
    });
    const staking = await ethers.getContractAt(
        "StakedDistributor",
        stakeDeploy.address
    );

    await (await staking.addToken(mareAddress)).wait(1);
    await (await staking.addToken(veloAddress)).wait(1);
};

const tags = ["sMare"];
export { tags };

export default func;
