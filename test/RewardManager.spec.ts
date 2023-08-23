import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { Contract } from "ethers";
import { ethers } from "hardhat";
import { SignerWithAddress } from "hardhat-deploy-ethers/signers";
import { anyValue, getImpersonatedSigner } from "./_utils";

describe("RewardManager", () => {
    let deployment: IDeployment;

    beforeEach(async () => {
        deployment = await loadFixture(setupFixture);
    });

    it("Should deploy RewardManager properly", async () => {
        const { rewardManager } = deployment;
        expect(rewardManager.address).to.properAddress;
    });

    it("Should add vara and wkava rewards", async () => {
        const { owner, rewardManager, sMare, uMare, vara, usdt, wkava, mare } =
            deployment;

        const sMareSupply = await sMare.totalSupply();
        const uMareSupply = await uMare.totalSupply();
        const totalStaked = sMareSupply.add(uMareSupply);

        const usdtBalance = await usdt.balanceOf(owner.address);
        const uMareUsdc = usdtBalance.mul(uMareSupply).div(totalStaked);
        const sMareUsdc = usdtBalance.sub(uMareUsdc);
        const varaBalance = await vara.balanceOf(owner.address);
        const uMareVara = varaBalance.mul(uMareSupply).div(totalStaked);
        const sMareVara = varaBalance.sub(uMareVara);
        const wkavaBalance = await wkava.balanceOf(owner.address);
        const uMareWkava = wkavaBalance.mul(uMareSupply).div(totalStaked);
        const sMareWkava = wkavaBalance.sub(uMareWkava);

        await expect(
            vara
                .connect(owner)
                .approve(rewardManager.address, ethers.constants.MaxUint256)
        ).not.to.reverted;
        await expect(
            usdt
                .connect(owner)
                .approve(rewardManager.address, ethers.constants.MaxUint256)
        ).not.to.reverted;
        await expect(
            wkava
                .connect(owner)
                .approve(rewardManager.address, ethers.constants.MaxUint256)
        ).not.to.reverted;

        await expect(
            rewardManager
                .connect(owner)
                .addRewards(
                    ethers.constants.MaxUint256,
                    ethers.constants.MaxUint256,
                    ethers.constants.MaxUint256
                )
        )
            .to.emit(sMare, "AddReward")
            .withArgs(vara.address, sMareVara, anyValue)
            .to.emit(uMare, "AddReward")
            .withArgs(vara.address, uMareVara, anyValue)
            .to.emit(sMare, "AddReward")
            .withArgs(wkava.address, sMareWkava, anyValue)
            .to.emit(uMare, "AddReward")
            .withArgs(wkava.address, uMareWkava, anyValue)
            .to.emit(uMare, "AddReward")
            .withArgs(usdt.address, uMareUsdc, anyValue);

        expect(await vara.balanceOf(rewardManager.address)).to.equal(0);
        expect(await usdt.balanceOf(rewardManager.address)).to.equal(0);
        expect(await wkava.balanceOf(rewardManager.address)).to.equal(0);
        expect(await mare.balanceOf(rewardManager.address)).to.equal(0);
    });
});

interface IDeployment {
    owner: SignerWithAddress;
    rewardManager: Contract;
    sMare: Contract;
    uMare: Contract;
    mare: Contract;
    usdt: Contract;
    vara: Contract;
    wkava: Contract;
}

const setupFixture = async () => {
    const [owner] = await ethers.getSigners();

    const RewardManager = await ethers.getContractFactory("RewardManager");
    const rewardManager = await RewardManager.deploy();
    await rewardManager.deployed();

    const sMareAddress = await rewardManager.sMare();
    const sMare = await ethers.getContractAt("StakedDistributor", sMareAddress);

    const uMareAddress = await rewardManager.uMare();
    const uMare = await ethers.getContractAt("StakedDistributor", uMareAddress);

    const mareAddress = await rewardManager.mare();
    const mare = await ethers.getContractAt("IERC20", mareAddress);

    const usdtAddress = await rewardManager.usdt();
    const usdt = await ethers.getContractAt("IERC20", usdtAddress);

    const varaAddress = await rewardManager.vara();
    const vara = await ethers.getContractAt("IERC20", varaAddress);

    const wkavaAddress = await rewardManager.wkava();
    const wkava = await ethers.getContractAt("IERC20", wkavaAddress);

    // impersonate whale and transfer tokens to owner
    const usdtWhaleAddress = "0x77134cbC06cB00b66F4c7e623D5fdBF6777635EC";
    const varaWhaleAddress = "0x3a724E0082b0E833670cF762Ea6bd711bcBdFf37";
    const wkavaWhaleAddress = "0xfCE8AfC815BC9B1d2007FC50d0FeDB9E135470b0";
    const [usdtWhale, varaWhale, wkavaWhale] = await Promise.all([
        getImpersonatedSigner(usdtWhaleAddress),
        getImpersonatedSigner(varaWhaleAddress),
        getImpersonatedSigner(wkavaWhaleAddress),
    ]);

    // transfer tokens to owner
    await Promise.all([
        usdt
            .connect(usdtWhale)
            .transfer(owner.address, await usdt.balanceOf(usdtWhaleAddress)),
        vara
            .connect(varaWhale)
            .transfer(owner.address, await vara.balanceOf(varaWhaleAddress)),
        wkava
            .connect(wkavaWhale)
            .transfer(owner.address, await wkava.balanceOf(wkavaWhaleAddress)),
    ]);

    return {
        owner,
        rewardManager,
        sMare,
        uMare,
        mare,
        usdt,
        vara,
        wkava,
    };
};
