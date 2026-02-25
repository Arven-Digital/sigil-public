// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Script.sol";
import "../src/SigilAccountV11Test.sol";
import "../src/MockExchange.sol";

contract DeployV11DirectScript is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("GUARDIAN_PRIVATE_KEY");
        IEntryPoint entryPoint = IEntryPoint(0x0000000071727De22E5E9d8BAf0edAc6f37da032);

        vm.startBroadcast(deployerPrivateKey);

        // Deploy implementation directly
        SigilAccountV11Test impl = new SigilAccountV11Test(entryPoint, msg.sender);

        // Deploy mock exchange
        MockExchange mockExchange = new MockExchange();

        console.log("=== V11 Test Direct Deploy ===");
        console.log("Implementation:", address(impl));
        console.log("MockExchange:", address(mockExchange));

        vm.stopBroadcast();
    }
}
