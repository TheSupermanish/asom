// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import {IERC1155Receiver} from "@openzeppelin/contracts/token/ERC1155/IERC1155Receiver.sol";
import {IERC6551Account, IERC6551Executable} from "../interfaces/IERC6551.sol";

/// @title  AgentAccount — tsugu's ERC-6551 token-bound account (the agent wallet)
/// @notice One of these is deployed per AgentNFT token. It is controlled by
///         whoever holds the bound NFT: transfer the NFT, transfer the wallet.
/// @dev    The (chainId, tokenContract, tokenId) binding is read from the
///         contract's own immutable bytecode footer (EIP-6551), so it cannot be
///         spoofed or re-pointed. Deployed behind an ERC-1167 proxy by
///         ERC6551Registry.
///
///         ERC-1271 (smart-account signature validation) is intentionally NOT
///         implemented yet: OZ 5.6's SignatureChecker uses the `mcopy` opcode
///         (Cancun), which Shannon's pre-Shanghai EVM does not support. It will
///         be added when Shannon ships Cancun or via an mcopy-free path.
contract AgentAccount is IERC165, IERC6551Account, IERC6551Executable, IERC721Receiver, IERC1155Receiver {
    /// @dev Bumped on every successful execute() — lets off-chain consumers detect activity.
    uint256 internal _state;

    error NotAuthorized();
    error InvalidOperation();

    receive() external payable {}

    /// @notice Execute a call from this account. Only the NFT owner may call.
    /// @param  operation must be 0 (CALL); other operations are rejected.
    function execute(address to, uint256 value, bytes calldata data, uint8 operation)
        external
        payable
        returns (bytes memory result)
    {
        if (!_isValidSigner(msg.sender)) revert NotAuthorized();
        if (operation != 0) revert InvalidOperation();

        ++_state;

        bool success;
        (success, result) = to.call{value: value}(data);
        if (!success) {
            assembly {
                revert(add(result, 0x20), mload(result))
            }
        }
    }

    /// @notice The ERC-721 token that owns this account, parsed from the bytecode footer.
    function token() public view returns (uint256 chainId, address tokenContract, uint256 tokenId) {
        bytes memory footer = new bytes(0x60);
        assembly {
            // Footer layout (after the 45-byte ERC-1167 proxy + 32-byte salt):
            // offset 0x4d, length 0x60 = abi.encode(chainId, tokenContract, tokenId)
            extcodecopy(address(), add(footer, 0x20), 0x4d, 0x60)
        }
        return abi.decode(footer, (uint256, address, uint256));
    }

    /// @notice The current owner of this account = owner of the bound NFT.
    function owner() public view returns (address) {
        (uint256 chainId, address tokenContract, uint256 tokenId) = token();
        if (chainId != block.chainid) return address(0);
        return IERC721(tokenContract).ownerOf(tokenId);
    }

    function state() external view returns (uint256) {
        return _state;
    }

    function isValidSigner(address signer, bytes calldata) external view returns (bytes4) {
        if (_isValidSigner(signer)) return IERC6551Account.isValidSigner.selector;
        return bytes4(0);
    }

    function _isValidSigner(address signer) internal view returns (bool) {
        return signer == owner();
    }

    // --- Receiver hooks so the wallet can custody tokens ---------------------

    function onERC721Received(address, address, uint256, bytes calldata) external pure returns (bytes4) {
        return IERC721Receiver.onERC721Received.selector;
    }

    function onERC1155Received(address, address, uint256, uint256, bytes calldata) external pure returns (bytes4) {
        return IERC1155Receiver.onERC1155Received.selector;
    }

    function onERC1155BatchReceived(address, address, uint256[] calldata, uint256[] calldata, bytes calldata)
        external
        pure
        returns (bytes4)
    {
        return IERC1155Receiver.onERC1155BatchReceived.selector;
    }

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == type(IERC165).interfaceId || interfaceId == type(IERC6551Account).interfaceId
            || interfaceId == type(IERC6551Executable).interfaceId || interfaceId == type(IERC721Receiver).interfaceId
            || interfaceId == type(IERC1155Receiver).interfaceId;
    }
}
