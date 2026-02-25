// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Script.sol";
import "../src/SigilAccountV11.sol";
import "../src/SigilAccountV11Factory.sol";

contract DeployV11Script is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("GUARDIAN_PRIVATE_KEY");
        address treasury = vm.envAddress("TREASURY_ADDRESS");
        uint256 deployFee = vm.envOr("DEPLOY_FEE", uint256(10 ether)); // 10 POL for Polygon
        IEntryPoint entryPoint = IEntryPoint(0x0000000071727De22E5E9d8BAf0edAc6f37da032); // v0.7

        vm.startBroadcast(deployerPrivateKey);

        // Deploy V11 factory (creates V11 implementation internally)
        SigilAccountV11Factory factory = new SigilAccountV11Factory(entryPoint, treasury, deployFee);

        console.log("=== Sigil V11 Deployment ===");
        console.log("Factory:", address(factory));
        console.log("Implementation:", address(factory.accountImplementation()));
        console.log("Treasury:", treasury);
        console.log("Deploy fee:", deployFee);
        console.log("Owner (transfer to treasury):", factory.owner());

        // Transfer ownership to treasury — treasury must call acceptOwnership()
        factory.transferOwnership(treasury);
        console.log("Ownership transfer initiated -> treasury must acceptOwnership()");

        vm.stopBroadcast();
    }
}
