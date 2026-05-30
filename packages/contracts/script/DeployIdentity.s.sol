// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console2} from "forge-std/Script.sol";
import {AgentNFT} from "../src/identity/AgentNFT.sol";
import {AgentRegistry} from "../src/identity/AgentRegistry.sol";
import {AgentAccount} from "../src/accounts/AgentAccount.sol";
import {ERC6551Registry} from "../src/accounts/ERC6551Registry.sol";

/// @notice Deploys the tsugu identity layer to Shannon:
///         AgentNFT, AgentAccount (TBA impl), ERC6551Registry, AgentRegistry,
///         then wires the registry as the NFT minter.
/// @dev    Shannon notes (see contracts README): build with evm_version="paris",
///         and prefer `cast send --gas-limit 30000000` for the actual broadcast —
///         forge's gas estimator undercounts Shannon by ~8x. This script is the
///         source of the constructor wiring; the bash deploy in DEPLOYMENTS uses
///         the compiled bytecode directly to control gas.
contract DeployIdentity is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(pk);

        console2.log("== tsugu :: DeployIdentity ==");
        console2.log("deployer", deployer);

        vm.startBroadcast(pk);

        AgentNFT nft = new AgentNFT(deployer);
        AgentAccount accountImpl = new AgentAccount();
        ERC6551Registry accountRegistry = new ERC6551Registry();
        AgentRegistry registry = new AgentRegistry(nft, accountRegistry, address(accountImpl));
        nft.setMinter(address(registry));

        vm.stopBroadcast();

        console2.log("AgentNFT        ", address(nft));
        console2.log("AgentAccount    ", address(accountImpl));
        console2.log("ERC6551Registry ", address(accountRegistry));
        console2.log("AgentRegistry   ", address(registry));
    }
}
