// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Script.sol";
import "../src/SigilAccount.sol";
import "../src/SigilAccountFactory.sol";

contract DeployScript is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("GUARDIAN_PRIVATE_KEY");
        address treasury = vm.envAddress("TREASURY_ADDRESS");
        uint256 deployFee = vm.envOr("DEPLOY_FEE", uint256(0.2 ether)); // Default 0.2 AVAX
        IEntryPoint entryPoint = IEntryPoint(0x0000000071727De22E5E9d8BAf0edAc6f37da032); // v0.7

        vm.startBroadcast(deployerPrivateKey);

        // Deploy factory (which also deploys the implementation)
        SigilAccountFactory factory = new SigilAccountFactory(entryPoint, treasury, deployFee);

        console.log("Factory deployed at:", address(factory));
        console.log("Implementation at:", address(factory.accountImplementation()));
        console.log("Treasury:", treasury);
        console.log("Deploy fee:", deployFee);

        vm.stopBroadcast();
    }
}
