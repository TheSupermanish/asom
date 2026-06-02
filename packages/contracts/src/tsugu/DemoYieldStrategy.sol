// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IYieldStrategy} from "./IYieldStrategy.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title  DemoYieldStrategy — testnet yield stand-in for Tsugu
/// @notice Somnia Shannon has no production lending/staking market and STT is a
///         faucet token, so there is no *real* yield to earn on testnet. This is an
///         HONEST stand-in: a single-client share vault whose yield comes from an
///         externally-funded reserve ({fund} / `receive`). Topping up the reserve
///         raises the share price for every holder — exactly how a real venue's
///         accrual would look to the Vault — so the end-to-end "principal + yield to
///         the beneficiary" flow is demonstrable without faking a return inside the
///         contract. On mainnet, replace this with an adapter over a liquid lending
///         or staking venue behind the same {IYieldStrategy} interface.
/// @dev    The Tsugu Vault is the ONLY client: {deposit}/{redeem} are `onlyVault`.
///         The Vault does per-pact share accounting; this contract only tracks the
///         aggregate share supply. Share price = balance / totalShares.
contract DemoYieldStrategy is IYieldStrategy, ReentrancyGuard {
    address public immutable vault;
    uint256 public totalShares;

    event Deposited(uint256 value, uint256 shares);
    event Redeemed(uint256 shares, uint256 amount, address indexed to);
    event Funded(address indexed from, uint256 amount);

    error NotVault();
    error RedeemTransferFailed();

    constructor(address vault_) {
        vault = vault_;
    }

    modifier onlyVault() {
        if (msg.sender != vault) revert NotVault();
        _;
    }

    /// @inheritdoc IYieldStrategy
    function deposit() external payable onlyVault returns (uint256 shares) {
        uint256 assetsBefore = address(this).balance - msg.value;
        shares = (totalShares == 0 || assetsBefore == 0) ? msg.value : (msg.value * totalShares) / assetsBefore;
        totalShares += shares;
        emit Deposited(msg.value, shares);
    }

    /// @inheritdoc IYieldStrategy
    /// @dev nonReentrant; `to` cannot re-enter (redeem is onlyVault and `to` != vault),
    ///      but we guard anyway. Effects (burn) precede the transfer.
    function redeem(uint256 shares, address to) external onlyVault nonReentrant returns (uint256 amount) {
        amount = (shares * address(this).balance) / totalShares;
        totalShares -= shares;
        (bool ok,) = to.call{value: amount}("");
        if (!ok) revert RedeemTransferFailed();
        emit Redeemed(shares, amount, to);
    }

    /// @inheritdoc IYieldStrategy
    function valueOf(uint256 shares) external view returns (uint256) {
        return totalShares == 0 ? 0 : (shares * address(this).balance) / totalShares;
    }

    /// @notice Current share price scaled by 1e18 (1e18 = par; > par means yield accrued).
    function sharePrice() external view returns (uint256) {
        return totalShares == 0 ? 1e18 : (address(this).balance * 1e18) / totalShares;
    }

    /// @notice Fund the yield reserve. On testnet the operator calls this to simulate
    ///         accrual; the top-up raises the share price for all current holders.
    function fund() external payable {
        emit Funded(msg.sender, msg.value);
    }

    receive() external payable {
        emit Funded(msg.sender, msg.value);
    }
}
