const { assert, expect } = require("chai");
const { network, getNamedAccounts, deployments, ethers } = require("hardhat");
const {
  developmentChains,
  networkConfig,
} = require("../../helper-hardat-config");

!developmentChains.includes(network.name)
  ? describe.skip
  : describe("Raffle", () => {
      let raffle, vrfCoordinatorV2Mock, entranceFee, deployer, interval;
      const chainId = network.config.chainId;

      beforeEach(async () => {
        deployer = (await getNamedAccounts()).deployer;
        await deployments.fixture(["all"]);
        raffle = await ethers.getContract("Raffle", deployer);
        vrfCoordinatorV2Mock = await ethers.getContract(
          "VRFCoordinatorV2Mock",
          deployer
        );
        entranceFee = await raffle.getEntranceFee();
        interval = await raffle.getInterval();
      });

      describe("constructor", () => {
        it("initialize the raffle correctly", async () => {
          const raffleState = await raffle.getRaffleState();
          assert.equal(raffleState.toString(), "0");
          assert.equal(interval, networkConfig[chainId]["interval"]);
        });
      });

      describe("enterRaffle", () => {
        it("revert if not enough ETH is sent", async () => {
          await expect(raffle.enterRaffle()).to.be.revertedWith(
            "Raffle__NotEnoughEthEntered"
          );
        });
        it("record player when it enters", async () => {
          await raffle.enterRaffle({ value: entranceFee });
          const playerFromContract = await raffle.getPlayer(0);
          assert.equal(playerFromContract, deployer);
        });
        it("emits event on enter", async () => {
          expect(raffle.enterRaffle({ value: entranceFee })).to.emit(
            raffle,
            "RaffleEnter"
          );
        });
        it("does not allow entrance when raffle is calculating", async () => {
          await raffle.enterRaffle({ value: entranceFee });
          await network.provider.send("evm_increaseTime", [
            interval.toNumber() + 1,
          ]);
          await network.provider.send("evm_mine", []);
          await raffle.performUpkeep([]);
          await expect(
            raffle.enterRaffle({ value: entranceFee })
          ).to.be.revertedWith("Raffle__NotOpen");
        });
      });

      describe("checkUpkeep", () => {
        it("return false if people has not sent any ETH", async () => {
          await network.provider.send("evm_increaseTime", [
            interval.toNumber() + 1,
          ]);
          await network.provider.send("evm_mine", []);
          const { upkeepNeeded } = await raffle.callStatic.checkUpkeep([]);
          assert(!upkeepNeeded);
        });

        it("returns false if raffle isn't open", async () => {
          await raffle.enterRaffle({ value: entranceFee });
          await network.provider.send("evm_increaseTime", [
            interval.toNumber() + 1,
          ]);
          await network.provider.send("evm_mine", []);
          await raffle.performUpkeep([]);
          const raffleState = await raffle.getRaffleState();
          const { upkeepNeeded } = await raffle.callStatic.checkUpkeep([]);
          assert.equal(raffleState.toString(), "1");
          assert(!upkeepNeeded);
        });

        it("returns false if enough time hasn't passed", async () => {
          await raffle.enterRaffle({ value: entranceFee });
          await network.provider.send("evm_increaseTime", [
            interval.toNumber() - 1,
          ]);
          await network.provider.request({ method: "evm_mine", params: [] });
          const { upkeepNeeded } = await raffle.callStatic.checkUpkeep("0x");
          assert(!upkeepNeeded);
        });

        it("returns true if enough time has passed, has players, eth, and is open", async () => {
          await raffle.enterRaffle({ value: entranceFee });
          await network.provider.send("evm_increaseTime", [
            interval.toNumber() + 1,
          ]);
          await network.provider.request({ method: "evm_mine", params: [] });
          const { upkeepNeeded } = await raffle.callStatic.checkUpkeep("0x");
          assert(upkeepNeeded);
        });
      });

      describe("performUpkeep", () => {
        it("can only run if checkUpkeep is true", async () => {
          await raffle.enterRaffle({ value: entranceFee });
          await network.provider.send("evm_increaseTime", [
            interval.toNumber() + 1,
          ]);
          await network.provider.request({ method: "evm_mine", params: [] });
          const tx = await raffle.performUpkeep([]);
          assert(tx);
        });

        it("reverts when checkUpkeep is false", async () => {
          await expect(raffle.performUpkeep([])).to.be.revertedWith(
            "Raffle__UpkeepNotNeeded"
          );
        });
        it("updates the raffle state, emit an event and call the vrfCoordinator", async () => {
          await raffle.enterRaffle({ value: entranceFee });
          await network.provider.send("evm_increaseTime", [
            interval.toNumber() + 1,
          ]);
          await network.provider.request({ method: "evm_mine", params: [] });
          const txResponse = await raffle.performUpkeep([]);
          const txReceipt = await txResponse.wait(1);
          const requestId = txReceipt.events[1].args.requestId;
          const raffleState = await raffle.getRaffleState();
          assert(requestId.toNumber() > 0);
          assert(raffleState.toString() == 1);
        });
      });

      describe("fulfillRandomWords", () => {
        beforeEach(async () => {
          await raffle.enterRaffle({ value: entranceFee });
          await network.provider.send("evm_increaseTime", [
            interval.toNumber() + 1,
          ]);
          await network.provider.request({ method: "evm_mine", params: [] });
        });

        it("can only be called after performUpkeep", async () => {
          await expect(
            vrfCoordinatorV2Mock.fulfillRandomWords(0, raffle.address)
          ).to.be.revertedWith("nonexistent request");
          await expect(
            vrfCoordinatorV2Mock.fulfillRandomWords(1, raffle.address)
          ).to.be.revertedWith("nonexistent request");
        });

        it("picks a winner, resets the lottery and sends moneys", async () => {
          const additionalEntrances = 3;
          const startingAccountIndex = 1;
          const accounts = await ethers.getSigners();
          for (
            let i = startingAccountIndex;
            i < startingAccountIndex + additionalEntrances;
            i++
          ) {
            const accountConnectedRaffle = raffle.connect(accounts[i]);
            await accountConnectedRaffle.enterRaffle({ value: entranceFee });
          }
          const startingTimestamp = await raffle.getLatestTimeStamp();

          // perform upkeep (mock chainlink keeper calling)
          // requestRandomWords (mock chainlink VRF)
          // wait for fulfillRandomWords in pur contract to be called by chainlink (mock chainlink VRF calling this)
          await new Promise(async (resolve, reject) => {
            raffle.once("WinnerPicked", async () => {
              console.log("WinnerPicked event found!");
              try {
                const recentWinner = await raffle.getRecentWinner();
                const raffleState = await raffle.getRaffleState();
                const endingTimestamp = await raffle.getLatestTimeStamp();
                const numberOfPlayers = await raffle.getNumberOfPlayers();
                const winnerEndingBalance = await accounts[1].getBalance();
                assert.equal(numberOfPlayers.toString(), "0");
                assert.equal(raffleState.toString(), "0");
                assert(endingTimestamp > startingTimestamp);
                assert.equal(
                  winnerEndingBalance.toString(),
                  winnerStartingBalance.add(
                    entranceFee
                      .mul(additionalEntrances)
                      .add(entranceFee)
                      .toString()
                  )
                );
                resolve();
              } catch (e) {
                reject(e);
              }
            });

            // perform upkeep (mock chainlink keeper calling)
            // requestRandomWords (mock chainlink VRF)
            // wait for fulfillRandomWords in pur contract to be called by chainlink (mock chainlink VRF calling this)
            const txResponse = await raffle.performUpkeep([]);
            const txReceipt = await txResponse.wait(1);
            const winnerStartingBalance = await accounts[1].getBalance();
            await vrfCoordinatorV2Mock.fulfillRandomWords(
              txReceipt.events[1].args.requestId,
              raffle.address
            );
          });
        });
      });
    });
