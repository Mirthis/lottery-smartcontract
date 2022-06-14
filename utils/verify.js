const { run } = require("hardhat");

const verify = async (contractAddress, args) => {
  console.log("Verifying contract...");
  try {
    await run("verify:verify", {
      address: contractAddress,
      constructorArguments: args,
    });
    console.log("Contract verified!");
  } catch (err) {
    if (err.message.toLowerCase().includes("already verified")) {
      console.log("Contract already verified");
    } else {
      console.error(err);
    }
  }
};

module.exports = { verify };
