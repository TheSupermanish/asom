// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title  AgentNFT — the ownership token for an tsugu agent
/// @notice Holding token #N means controlling agent #N: its name, its ERC-6551
///         wallet, and its reputation. Transferable — selling the NFT hands over
///         the whole agent (name + wallet).
/// @dev    Minting is gated to a single `minter` (the AgentRegistry), so names and
///         token IDs stay consistent with the registry's records. tokenId is
///         sequential starting at 1 (0 is reserved as "no token").
contract AgentNFT is ERC721, Ownable {
    uint256 public nextTokenId = 1;
    address public minter;

    mapping(uint256 => string) public nameOf;

    event MinterUpdated(address indexed minter);
    event AgentMinted(uint256 indexed tokenId, address indexed to, string name);

    error OnlyMinter();
    error MinterAlreadySet();

    constructor(address initialOwner) ERC721("tsugu Agent", "TSUGU") Ownable(initialOwner) {}

    /// @notice Wire the AgentRegistry as the sole minter. Settable once by owner.
    function setMinter(address minter_) external onlyOwner {
        if (minter != address(0)) revert MinterAlreadySet();
        minter = minter_;
        emit MinterUpdated(minter_);
    }

    /// @notice Mint a new agent token. Only the registry may call.
    function mint(address to, string calldata name_) external returns (uint256 tokenId) {
        if (msg.sender != minter) revert OnlyMinter();
        tokenId = nextTokenId++;
        nameOf[tokenId] = name_;
        _safeMint(to, tokenId);
        emit AgentMinted(tokenId, to, name_);
    }

    /// @notice Total agents minted so far.
    function totalMinted() external view returns (uint256) {
        return nextTokenId - 1;
    }
}
