const { assert, expect } = require("chai");
const { network, getNamedAccounts, deployments, ethers } = require("hardhat");
const {
  developmentChains,
  networkConfig,
} = require("../../helper-hardat-config");

developmentChains.includes(network.name)
  ? describe.skip
  : describe("Raffle", () => {
      let raffle, entranceFee, deployer;

      beforeEach(async () => {
        deployer = (await getNamedAccounts()).deployer;
        raffle = await ethers.getContract("Raffle", deployer);
        entranceFee = await raffle.getEntranceFee();
      });

      describe("fulfillRandomWords", () => {
        it("works with live chainlink keepers and vrf, we get a random winner", async () => {
          const startingTimestamp = await raffle.getLatestTimeStamp();
          const accounts = await ethers.getSigners();

          await new Promise(async (resolve, reject) => {
            raffle.once("WinnerPicked", async () => {
              console.log("Winner picked! ");
              try {
                const recentWinner = await raffle.getRecentWinner();
                const raffleState = await raffle.getRaffleState();
                const winnerEndingBalance = await accounts[0].getBalance();
                const endingTimestamp = await raffle.getLatestTimeStamp();

                await expect(raffle.getPlayer(0)).to.be.reverted;
                assert.equal(recentWinner.toString(), accounts[0].address);
                assert.equal(raffleState.toString(), "0");
                assert.equal(
                  winnerEndingBalance.toString(),
                  winnerStartingBalance.add(entranceFee).toString()
                );
                assert(endingTimestamp > startingTimestamp);
                resolve();
              } catch (e) {
                reject(e);
              }
            });

            console.log("Entering Raffle...");
            await raffle.enterRaffle({ value: entranceFee });
            console.log("Ok, time to wait...");
            const winnerStartingBalance = await accounts[0].getBalance();
          });
        });
      });
    });
