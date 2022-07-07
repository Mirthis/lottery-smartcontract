const { ethers } = require("hardhat");
const fs = require("fs");

require("dotenv").config();

const FRONT_END_ADDRESSES_FILE =
  "../lottery-frontend/constants/contractAddresses.json";
const FRONT_END_ABI_FILE = "../lottery-frontend/constants/abi.json";

module.exports = async () => {
  if (!process.env.UPDATE_FRONT_END) return;
  console.log("Updating front-end...");
  updateContractAddress();
  updateABI();
  console.log("Front-end update completed!");
};

const updateContractAddress = async () => {
  const raffle = await ethers.getContract("Raffle");
  const chainId = network.config.chainId.toString();
  const contractAddresses = JSON.parse(
    fs.readFileSync(FRONT_END_ADDRESSES_FILE, "utf-8")
  );

  if (chainId in contractAddresses) {
    if (!contractAddresses[chainId].includes(raffle.address)) {
      contractAddresses[chainId].push(raffle.address);
    }
  } else {
    contractAddresses[chainId] = [raffle.address];
  }
  fs.writeFileSync(
    FRONT_END_ADDRESSES_FILE,
    JSON.stringify(contractAddresses),
    "utf-8"
  );
};

const updateABI = async () => {
  const raffle = await ethers.getContract("Raffle");
  fs.writeFileSync(
    FRONT_END_ABI_FILE,
    raffle.interface.format(ethers.utils.FormatTypes.json)
  );
};

module.exports.tags = ["all", "frontend"];
