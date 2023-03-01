import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

const mareAddress = "0xd86C8d4279CCaFbec840c782BcC50D201f277419";
const veloAddress = "0xE1da44C0dA55B075aE8E2e4b6986AdC76Ac77d73";
const usdcAddress = "0xfA9343C3897324496A05fC75abeD6bAC29f8A40f";

const func: DeployFunction = async ({
    getNamedAccounts,
    deployments: { deploy },
    ethers,
    network,
}: HardhatRuntimeEnvironment) => {
    const { deployer } = await getNamedAccounts();

    const stakeDeploy = await deploy("uMare", {
        from: deployer,
        log: true,
        contract: "contracts/StakedDistributor.sol:StakedDistributor",
        args: [mareAddress, "Staked Mare", "uMare"],
    });
    const staking = await ethers.getContractAt(
        "StakedDistributor",
        stakeDeploy.address
    );

    await (await staking.addToken(usdcAddress)).wait(1);
    await (await staking.addToken(veloAddress)).wait(1);
};

const tags = ["uMare"];
export { tags };

export default func;
