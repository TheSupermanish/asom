// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {AgentNFT} from "../src/identity/AgentNFT.sol";
import {AgentRegistry} from "../src/identity/AgentRegistry.sol";
import {AgentAccount} from "../src/accounts/AgentAccount.sol";
import {ERC6551Registry} from "../src/accounts/ERC6551Registry.sol";
import {IERC6551Account, IERC6551Executable} from "../src/interfaces/IERC6551.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";

contract AgentIdentityTest is Test {
    AgentNFT internal nft;
    ERC6551Registry internal accounts;
    AgentAccount internal accountImpl;
    AgentRegistry internal registry;

    address internal alice = address(0xA11CE);
    address internal bob = address(0xB0B);

    event AgentRegistered(
        string name, bytes32 indexed nameHash, uint256 indexed tokenId, address indexed owner, address account
    );

    function setUp() public {
        nft = new AgentNFT(address(this));
        accounts = new ERC6551Registry();
        accountImpl = new AgentAccount();
        registry = new AgentRegistry(nft, accounts, address(accountImpl));
        nft.setMinter(address(registry));
    }

    // ---------------------------------------------------------------------
    // Core register flow
    // ---------------------------------------------------------------------

    function test_register_mintsNftAndCreatesWallet() public {
        (uint256 tokenId, address account) = registry.register("neo", alice);

        assertEq(tokenId, 1, "first token id");
        assertEq(nft.ownerOf(tokenId), alice, "alice owns the NFT");
        assertEq(nft.nameOf(tokenId), "neo", "name stored on NFT");
        assertTrue(account != address(0), "wallet deployed");
        assertGt(account.code.length, 0, "wallet has code");
    }

    function test_register_walletAddressMatchesPrediction() public {
        // Prediction BEFORE registration must equal the deployed address.
        address predicted = registry.previewAccount(1);
        (, address account) = registry.register("neo", alice);
        assertEq(account, predicted, "previewAccount must match deployed TBA");
    }

    function test_register_walletReportsCorrectTokenBinding() public {
        (uint256 tokenId, address account) = registry.register("neo", alice);

        (uint256 chainId, address tokenContract, uint256 boundTokenId) = AgentAccount(payable(account)).token();
        assertEq(chainId, block.chainid, "chainId binding");
        assertEq(tokenContract, address(nft), "tokenContract binding");
        assertEq(boundTokenId, tokenId, "tokenId binding");
    }

    function test_register_walletOwnerIsNftOwner() public {
        (, address account) = registry.register("neo", alice);
        assertEq(AgentAccount(payable(account)).owner(), alice, "wallet owner = NFT owner");
    }

    function test_register_emitsAgentRegistered() public {
        address predicted = registry.previewAccount(1);
        vm.expectEmit(false, true, true, true, address(registry));
        emit AgentRegistered("neo", keccak256("neo"), 1, alice, predicted);
        registry.register("neo", alice);
    }

    function test_register_seedsWalletWithForwardedValue() public {
        (, address account) = registry.register{value: 0.1 ether}("neo", alice);
        assertEq(account.balance, 0.1 ether, "wallet seeded with msg.value");
    }

    function test_resolve_returnsAgent() public {
        (uint256 tokenId, address account) = registry.register("neo", alice);
        (uint256 rTokenId, address rAccount, address rOwner, uint64 rCreatedAt) = registry.resolve("neo");
        assertEq(rTokenId, tokenId);
        assertEq(rAccount, account);
        assertEq(rOwner, alice);
        assertEq(rCreatedAt, uint64(block.timestamp));
    }

    function test_resolve_revertsForUnknownName() public {
        vm.expectRevert(abi.encodeWithSelector(AgentRegistry.NotFound.selector, "ghost"));
        registry.resolve("ghost");
    }

    // ---------------------------------------------------------------------
    // The whole point: NFT transfer moves wallet control
    // ---------------------------------------------------------------------

    function test_transfer_movesWalletControl() public {
        (uint256 tokenId, address account) = registry.register("neo", alice);
        assertEq(AgentAccount(payable(account)).owner(), alice);

        vm.prank(alice);
        IERC721(address(nft)).transferFrom(alice, bob, tokenId);

        // Wallet control follows the NFT — no migration, no re-deploy.
        assertEq(AgentAccount(payable(account)).owner(), bob, "wallet owner follows NFT");

        // resolve() reflects the new owner live.
        (,, address rOwner,) = registry.resolve("neo");
        assertEq(rOwner, bob, "resolve reflects transfer");
    }

    function test_wallet_executeGatedToOwner() public {
        (uint256 tokenId, address account) = registry.register("neo", alice);
        vm.deal(account, 1 ether);

        // Non-owner cannot execute.
        vm.prank(bob);
        vm.expectRevert(AgentAccount.NotAuthorized.selector);
        AgentAccount(payable(account)).execute(bob, 0.1 ether, "", 0);

        // Owner can execute — send 0.3 ETH from the wallet to bob.
        uint256 before = bob.balance;
        vm.prank(alice);
        AgentAccount(payable(account)).execute(bob, 0.3 ether, "", 0);
        assertEq(bob.balance - before, 0.3 ether, "owner-driven transfer");

        // After transferring the NFT, the new owner controls the wallet.
        vm.prank(alice);
        IERC721(address(nft)).transferFrom(alice, bob, tokenId);
        vm.prank(bob);
        AgentAccount(payable(account)).execute(bob, 0.1 ether, "", 0);
    }

    function test_wallet_executeBumpsState() public {
        (, address account) = registry.register("neo", alice);
        vm.deal(account, 1 ether);
        assertEq(AgentAccount(payable(account)).state(), 0);
        vm.prank(alice);
        AgentAccount(payable(account)).execute(bob, 0, "", 0);
        assertEq(AgentAccount(payable(account)).state(), 1, "state bumps on execute");
    }

    function test_wallet_rejectsNonCallOperation() public {
        (, address account) = registry.register("neo", alice);
        vm.deal(account, 1 ether);
        vm.prank(alice);
        vm.expectRevert(AgentAccount.InvalidOperation.selector);
        AgentAccount(payable(account)).execute(bob, 0, "", 1); // DELEGATECALL not allowed
    }

    // ---------------------------------------------------------------------
    // Name collisions + validation
    // ---------------------------------------------------------------------

    function test_register_revertsOnDuplicateName() public {
        registry.register("neo", alice);
        vm.expectRevert(abi.encodeWithSelector(AgentRegistry.NameTaken.selector, "neo"));
        registry.register("neo", bob);
    }

    function test_isAvailable() public {
        assertTrue(registry.isAvailable("neo"));
        registry.register("neo", alice);
        assertFalse(registry.isAvailable("neo"));
    }

    function test_validate_rejectsEmpty() public {
        vm.expectRevert(AgentRegistry.NameEmpty.selector);
        registry.register("", alice);
    }

    function test_validate_rejectsTooLong() public {
        // 33 chars
        vm.expectRevert(AgentRegistry.NameTooLong.selector);
        registry.register("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", alice);
    }

    function test_validate_rejectsUppercase() public {
        vm.expectRevert(abi.encodeWithSelector(AgentRegistry.NameBadChar.selector, 0));
        registry.register("Neo", alice);
    }

    function test_validate_rejectsSpace() public {
        vm.expectRevert(abi.encodeWithSelector(AgentRegistry.NameBadChar.selector, 3));
        registry.register("neo bot", alice);
    }

    function test_validate_rejectsLeadingHyphen() public {
        vm.expectRevert(AgentRegistry.NameBadHyphen.selector);
        registry.register("-neo", alice);
    }

    function test_validate_rejectsTrailingHyphen() public {
        vm.expectRevert(AgentRegistry.NameBadHyphen.selector);
        registry.register("neo-", alice);
    }

    function test_validate_rejectsDoubleHyphen() public {
        vm.expectRevert(AgentRegistry.NameBadHyphen.selector);
        registry.register("ne--o", alice);
    }

    function test_validate_acceptsValidNames() public {
        registry.register("neo", alice);
        registry.register("agent-007", alice);
        registry.register("x", alice);
        registry.register("trinity99", alice);
        assertEq(nft.totalMinted(), 4);
    }

    // ---------------------------------------------------------------------
    // AgentNFT minter gating
    // ---------------------------------------------------------------------

    function test_nft_mintGatedToMinter() public {
        vm.prank(bob);
        vm.expectRevert(AgentNFT.OnlyMinter.selector);
        nft.mint(bob, "hacker");
    }

    function test_nft_minterSetOnce() public {
        AgentNFT fresh = new AgentNFT(address(this));
        fresh.setMinter(address(0xBEEF));
        vm.expectRevert(AgentNFT.MinterAlreadySet.selector);
        fresh.setMinter(address(0xCAFE));
    }

    // Allow this test contract to receive ETH from wallet execute() calls.
    receive() external payable {}
}
