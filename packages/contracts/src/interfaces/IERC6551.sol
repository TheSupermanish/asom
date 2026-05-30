// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice ERC-6551 interfaces, pinned locally so every asom contract compiles
///         against one source of truth. Mirrors https://eips.ethereum.org/EIPS/eip-6551

/// @dev The singleton registry that deploys token-bound accounts (TBAs).
interface IERC6551Registry {
    /// @notice Emitted when a token-bound account is created.
    event ERC6551AccountCreated(
        address account,
        address indexed implementation,
        bytes32 salt,
        uint256 chainId,
        address indexed tokenContract,
        uint256 indexed tokenId
    );

    /// @notice Thrown when account creation via CREATE2 fails.
    error AccountCreationFailed();

    /// @notice Deploys a token-bound account for an ERC-721 token (idempotent).
    function createAccount(
        address implementation,
        bytes32 salt,
        uint256 chainId,
        address tokenContract,
        uint256 tokenId
    ) external returns (address account);

    /// @notice Computes the counterfactual TBA address without deploying.
    function account(address implementation, bytes32 salt, uint256 chainId, address tokenContract, uint256 tokenId)
        external
        view
        returns (address account);
}

/// @dev Minimal interface every TBA must expose (EIP-6551).
interface IERC6551Account {
    receive() external payable;

    /// @notice Returns the ERC-721 token that owns this account.
    function token() external view returns (uint256 chainId, address tokenContract, uint256 tokenId);

    /// @notice A nonce that changes whenever the account makes a state-changing call.
    function state() external view returns (uint256);

    /// @notice Returns the ERC-1271 magic value if `signer` may act for this account.
    function isValidSigner(address signer, bytes calldata context) external view returns (bytes4 magicValue);
}

/// @dev Optional execution interface (EIP-6551).
interface IERC6551Executable {
    /// @notice Executes a call from the account. `operation` must be 0 (CALL).
    function execute(address to, uint256 value, bytes calldata data, uint8 operation)
        external
        payable
        returns (bytes memory);
}
