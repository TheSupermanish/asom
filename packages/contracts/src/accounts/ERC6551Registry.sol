// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC6551Registry} from "../interfaces/IERC6551.sol";

/// @title  ERC6551Registry
/// @notice Canonical EIP-6551 registry reference implementation, deployed by asom
///         because the canonical singleton (0x0000...775758) is not present on
///         Shannon. Verbatim from the ERC-6551 reference repo:
///         https://github.com/erc6551/reference/blob/main/src/ERC6551Registry.sol
/// @dev    Deploys each token-bound account as an ERC-1167 minimal proxy with the
///         (salt, chainId, tokenContract, tokenId) appended as an immutable footer.
///         `account()` predicts the CREATE2 address; `createAccount()` deploys it.
///         Correctness is asserted on-chain by the test suite (prediction == deploy,
///         and the deployed account reports the right token() binding).
contract ERC6551Registry is IERC6551Registry {
    function createAccount(
        address implementation,
        bytes32 salt,
        uint256 chainId,
        address tokenContract,
        uint256 tokenId
    ) external returns (address) {
        assembly {
            // Memory Layout:
            // ----
            // 0x00   0xff                           (1 byte)
            // 0x01   registry (address)             (20 bytes)
            // 0x15   salt (bytes32)                 (32 bytes)
            // 0x35   Bytecode Hash (bytes32)        (32 bytes)
            // ----
            // 0x55   ERC-1167 Constructor + Header  (20 bytes)
            // 0x69   implementation (address)       (20 bytes)
            // 0x7D   ERC-1167 Footer                (15 bytes)
            // 0x8C   salt (uint256)                 (32 bytes)
            // 0xAC   chainId (uint256)              (32 bytes)
            // 0xCC   tokenContract (address)        (32 bytes)
            // 0xEC   tokenId (uint256)              (32 bytes)

            // Silence unused variable warnings
            pop(chainId)

            // Copy bytecode + constant data to memory
            calldatacopy(0x8c, 0x24, 0x80)
            mstore(0x6c, 0x5af43d82803e903d91602b57fd5bf3)
            mstore(0x5d, implementation)
            mstore(0x49, 0x3d60ad80600a3d3981f3363d3d373d3d3d363d73)

            // Copy create2 computation data to memory
            mstore8(0x00, 0xff)
            mstore(0x35, keccak256(0x55, 0xb7))
            mstore(0x01, shl(96, address()))
            mstore(0x15, salt)

            // Compute account address
            let computed := keccak256(0x00, 0x55)

            // If the account has not yet been deployed
            if iszero(extcodesize(computed)) {
                // Deploy account contract
                let deployed := create2(0, 0x55, 0xb7, salt)

                // Revert if the deployment fails
                if iszero(deployed) {
                    mstore(0x00, 0x20188a59) // `AccountCreationFailed()`
                    revert(0x1c, 0x04)
                }

                // Store account address in memory before salt and chainId
                mstore(0x6c, deployed)

                // Emit the ERC6551AccountCreated event
                log4(
                    0x6c,
                    0x60,
                    // `ERC6551AccountCreated(address,address,bytes32,uint256,address,uint256)`
                    0x79f19b3655ee38b1ce526556b7731a20c8f218fbda4a3990b6cc4172fdf88722,
                    implementation,
                    tokenContract,
                    tokenId
                )

                // Return the account address
                return(0x6c, 0x20)
            }

            // Otherwise, return the computed account address
            mstore(0x00, shr(96, shl(96, computed)))
            return(0x00, 0x20)
        }
    }

    function account(address implementation, bytes32 salt, uint256 chainId, address tokenContract, uint256 tokenId)
        external
        view
        returns (address)
    {
        assembly {
            // Silence unused variable warnings
            pop(chainId)
            pop(tokenId)
            pop(tokenContract)

            // Copy bytecode + constant data to memory
            calldatacopy(0x8c, 0x24, 0x80)
            mstore(0x6c, 0x5af43d82803e903d91602b57fd5bf3)
            mstore(0x5d, implementation)
            mstore(0x49, 0x3d60ad80600a3d3981f3363d3d373d3d3d363d73)

            // Copy create2 computation data to memory
            mstore8(0x00, 0xff)
            mstore(0x35, keccak256(0x55, 0xb7))
            mstore(0x01, shl(96, address()))
            mstore(0x15, salt)

            // Store computed account address in memory
            mstore(0x00, shr(96, shl(96, keccak256(0x00, 0x55))))

            // Return computed account address
            return(0x00, 0x20)
        }
    }
}
