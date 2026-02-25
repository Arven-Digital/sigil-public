// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Script.sol";
import "../src/SigilAccountV12Test.sol";
import "../src/SigilAccountV12TestFactory.sol";
import "../src/MockExchange.sol";

contract DeployV12TestScript is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("GUARDIAN_PRIVATE_KEY");
        address treasury = vm.envAddress("TREASURY_ADDRESS");
        IEntryPoint entryPoint = IEntryPoint(0x0000000071727De22E5E9d8BAf0edAc6f37da032);

        vm.startBroadcast(deployerPrivateKey);

        // Deploy V12 test factory (5min timelock, scoped ERC-1271)
        SigilAccountV12TestFactory factory = new SigilAccountV12TestFactory(
            entryPoint, treasury, 0.2 ether // 0.2 AVAX deploy fee on Fuji
        );

        // Deploy mock exchange for testing ERC-1271
        MockExchange mockExchange = new MockExchange();

        console.log("=== V12 Test Deployment ===");
        console.log("Factory:", address(factory));
        console.log("Implementation:", address(factory.accountImplementation()));
        console.log("MockExchange:", address(mockExchange));
        console.log("Treasury:", treasury);

        vm.stopBroadcast();
    }
}
