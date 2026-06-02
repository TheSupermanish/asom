// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {Vault} from "../src/tsugu/Vault.sol";
import {AgentCompute} from "../src/agents/AgentCompute.sol";
import {SomniaAgentIds, ResponseStatus, IParseAgent, IJsonApiAgent} from "../src/agents/lib/SomniaAgents.sol";
import {MockAgentPlatform} from "./helpers/MockAgentPlatform.sol";

contract VaultTest is Test {
    MockAgentPlatform platform;
    Vault vault;

    uint256 constant SUB = 3;
    uint256 constant REWARD = 0.1 ether;

    address creator = address(0xC0FFEE);
    address alice = address(0xA11CE);
    address bob = address(0xB0B);
    address beneficiary = address(0xBEEF);

    // Cached so deposit() makes no external call — calling platform.FLOOR() inside a
    // `{value: deposit()}` expression would consume the preceding vm.prank/expectRevert.
    uint256 internal _floor;

    function setUp() public {
        platform = new MockAgentPlatform();
        // Owner of the Vault is this test contract (it deploys).
        vault = new Vault(address(platform), 0, 0, SUB, REWARD);
        _floor = platform.FLOOR();
        vm.deal(creator, 100 ether);
        vm.deal(alice, 100 ether);
        vm.deal(bob, 100 ether);
        vm.deal(address(this), 100 ether);
    }

    function deposit() internal view returns (uint256) {
        return _floor + REWARD * SUB;
    }

    function _newWeb() internal view returns (Vault.NewPact memory n) {
        n.kind = Vault.PactKind.Relief;
        n.claimType = Vault.ClaimType.Web;
        n.beneficiary = beneficiary;
        n.deadline = uint64(block.timestamp + 30 days);
        n.disputeWindow = 1 hours;
        n.resolveUrl = false;
        n.claim = "The relief milestone was reached";
        n.evidenceUrl = "https://example.org/relief";
        n.jsonPath = "";
    }

    function _newData() internal view returns (Vault.NewPact memory n) {
        n.kind = Vault.PactKind.Insurance;
        n.claimType = Vault.ClaimType.Data;
        n.beneficiary = beneficiary;
        n.deadline = uint64(block.timestamp + 30 days);
        n.disputeWindow = 0;
        n.resolveUrl = false;
        n.claim = "Flight was delayed > 3h";
        n.evidenceUrl = "https://api.example.org/flight";
        n.jsonPath = "data.delayed";
    }

    function _createWeb() internal returns (uint256 pactId) {
        vm.prank(creator);
        pactId = vault.createPact(_newWeb());
    }

    // --- Create -------------------------------------------------------------

    function test_createPact_storesFields() public {
        uint256 id = _createWeb();
        assertEq(id, 0);
        assertEq(vault.pactCount(), 1);
        Vault.Pact memory p = vault.getPact(id);
        assertEq(p.creator, creator);
        assertEq(p.beneficiary, beneficiary);
        assertEq(uint8(p.status), uint8(Vault.PactStatus.Open));
        assertEq(uint8(p.claimType), uint8(Vault.ClaimType.Web));
        assertEq(p.claim, "The relief milestone was reached");
        assertEq(p.escrow, 0);
    }

    function test_createPact_seedsContribution() public {
        Vault.NewPact memory n = _newWeb();
        vm.prank(creator);
        uint256 id = vault.createPact{value: 5 ether}(n);
        assertEq(vault.getPact(id).escrow, 5 ether);
        assertEq(vault.contributionOf(id, creator), 5 ether);
        assertEq(vault.totalEscrow(), 5 ether);
    }

    function test_createPact_revertsBadBeneficiary() public {
        Vault.NewPact memory n = _newWeb();
        n.beneficiary = address(0);
        vm.prank(creator);
        vm.expectRevert(Vault.BadBeneficiary.selector);
        vault.createPact(n);
    }

    function test_createPact_revertsBadDeadline() public {
        Vault.NewPact memory n = _newWeb();
        n.deadline = uint64(block.timestamp);
        vm.prank(creator);
        vm.expectRevert(Vault.BadDeadline.selector);
        vault.createPact(n);
    }

    function test_createPact_revertsEmptyClaim() public {
        Vault.NewPact memory n = _newWeb();
        n.claim = "";
        vm.prank(creator);
        vm.expectRevert(Vault.EmptyClaim.selector);
        vault.createPact(n);
    }

    function test_createPact_revertsEmptyEvidence() public {
        Vault.NewPact memory n = _newWeb();
        n.evidenceUrl = "";
        vm.prank(creator);
        vm.expectRevert(Vault.EmptyEvidence.selector);
        vault.createPact(n);
    }

    function test_createPact_dataRequiresJsonPath() public {
        Vault.NewPact memory n = _newData();
        n.jsonPath = "";
        vm.prank(creator);
        vm.expectRevert(Vault.EmptyJsonPath.selector);
        vault.createPact(n);
    }

    // --- Contribute ---------------------------------------------------------

    function test_contribute_incrementsEscrowAndLedger() public {
        uint256 id = _createWeb();
        vm.prank(alice);
        vault.contribute{value: 2 ether}(id);
        vm.prank(bob);
        vault.contribute{value: 3 ether}(id);
        assertEq(vault.getPact(id).escrow, 5 ether);
        assertEq(vault.contributionOf(id, alice), 2 ether);
        assertEq(vault.contributionOf(id, bob), 3 ether);
        assertEq(vault.totalEscrow(), 5 ether);
    }

    function test_contribute_revertsZeroValue() public {
        uint256 id = _createWeb();
        vm.prank(alice);
        vm.expectRevert(Vault.NothingContributed.selector);
        vault.contribute{value: 0}(id);
    }

    function test_contribute_revertsAfterDeadline() public {
        uint256 id = _createWeb();
        vm.warp(block.timestamp + 31 days);
        vm.prank(alice);
        vm.expectRevert(Vault.DeadlinePassed.selector);
        vault.contribute{value: 1 ether}(id);
    }

    function test_contribute_revertsUnknownPact() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Vault.UnknownPact.selector, uint256(99)));
        vault.contribute{value: 1 ether}(99);
    }

    // --- Resolve routing ----------------------------------------------------

    function test_requestResolution_web_routesToParseAgent() public {
        uint256 id = _createWeb();
        vm.prank(alice);
        vault.contribute{value: 1 ether}(id);

        vm.prank(bob);
        uint256 rid = vault.requestResolution{value: deposit()}(id);

        assertEq(platform.lastAgentId(), SomniaAgentIds.PARSE_WEBSITE);
        assertEq(uint8(vault.getPact(id).status), uint8(Vault.PactStatus.Resolving));
        assertEq(vault.requestToPact(rid), id);
        assertEq(vault.resolutionRequest(id), rid);

        bytes memory pl = platform.lastPayload();
        bytes4 sel;
        assembly {
            sel := mload(add(pl, 0x20))
        }
        assertEq(sel, IParseAgent.ExtractString.selector);
    }

    function test_requestResolution_data_routesToJsonAgent() public {
        vm.prank(creator);
        uint256 id = vault.createPact(_newData());
        vm.prank(bob);
        uint256 rid = vault.requestResolution{value: deposit()}(id);

        assertEq(platform.lastAgentId(), SomniaAgentIds.JSON_API);
        assertEq(vault.requestToPact(rid), id);

        bytes memory pl = platform.lastPayload();
        bytes4 sel;
        assembly {
            sel := mload(add(pl, 0x20))
        }
        assertEq(sel, IJsonApiAgent.fetchBool.selector);
    }

    function test_requestResolution_revertsFeeTooLow() public {
        uint256 id = _createWeb();
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(Vault.ResolutionFeeTooLow.selector, deposit() - 1, deposit()));
        vault.requestResolution{value: deposit() - 1}(id);
    }

    function test_requestResolution_overpaymentRefunded() public {
        uint256 id = _createWeb();
        uint256 before = bob.balance;
        vm.prank(bob);
        vault.requestResolution{value: deposit() + 1 ether}(id);
        // Only the deposit is consumed; the extra 1 ether is refunded by the base.
        assertEq(bob.balance, before - deposit());
    }

    function test_requestResolution_revertsWhenNotOpen() public {
        uint256 id = _createWeb();
        vm.prank(bob);
        vault.requestResolution{value: deposit()}(id);
        // now Resolving — a second request must revert
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(Vault.NotOpen.selector, Vault.PactStatus.Resolving));
        vault.requestResolution{value: deposit()}(id);
    }

    // --- Confirmed → release ------------------------------------------------

    function test_confirmed_thenRelease_paysBeneficiary() public {
        uint256 id = _createWeb();
        vm.prank(alice);
        vault.contribute{value: 4 ether}(id);
        vm.prank(creator);
        uint256 rid = vault.requestResolution{value: deposit()}(id);

        platform.fireString(address(vault), rid, "confirmed");
        assertEq(uint8(vault.getPact(id).status), uint8(Vault.PactStatus.Confirmed));
        assertEq(vault.getPact(id).verdict, "confirmed");

        // dispute window still active
        vm.expectRevert(abi.encodeWithSelector(Vault.DisputeWindowActive.selector, vault.releasableAt(id)));
        vault.release(id);

        vm.warp(block.timestamp + 1 hours + 1);
        uint256 before = beneficiary.balance;
        vault.release(id);
        assertEq(beneficiary.balance, before + 4 ether);
        assertEq(uint8(vault.getPact(id).status), uint8(Vault.PactStatus.Released));
        assertEq(vault.getPact(id).escrow, 0);
        assertEq(vault.totalEscrow(), 0);
    }

    function test_confirmed_caseInsensitive() public {
        uint256 id = _createWeb();
        vm.prank(creator);
        uint256 rid = vault.requestResolution{value: deposit()}(id);
        platform.fireString(address(vault), rid, "Confirmed");
        assertEq(uint8(vault.getPact(id).status), uint8(Vault.PactStatus.Confirmed));
    }

    function test_release_revertsIfNotConfirmed() public {
        uint256 id = _createWeb();
        vm.expectRevert(abi.encodeWithSelector(Vault.NotConfirmed.selector, Vault.PactStatus.Open));
        vault.release(id);
    }

    function test_release_instantWhenZeroWindow() public {
        Vault.NewPact memory n = _newWeb();
        n.disputeWindow = 0;
        vm.prank(creator);
        uint256 id = vault.createPact{value: 1 ether}(n);
        vm.prank(bob);
        uint256 rid = vault.requestResolution{value: deposit()}(id);
        platform.fireString(address(vault), rid, "confirmed");
        uint256 before = beneficiary.balance;
        vault.release(id); // no warp needed
        assertEq(beneficiary.balance, before + 1 ether);
    }

    // --- Denied → refund ----------------------------------------------------

    function test_denied_thenRefund_splitsByContributor() public {
        uint256 id = _createWeb();
        vm.prank(alice);
        vault.contribute{value: 2 ether}(id);
        vm.prank(bob);
        vault.contribute{value: 3 ether}(id);
        vm.prank(creator);
        uint256 rid = vault.requestResolution{value: deposit()}(id);

        platform.fireString(address(vault), rid, "denied");
        assertEq(uint8(vault.getPact(id).status), uint8(Vault.PactStatus.Denied));

        uint256 a0 = alice.balance;
        vm.prank(alice);
        vault.refund(id);
        assertEq(alice.balance, a0 + 2 ether);
        assertEq(vault.contributionOf(id, alice), 0);

        // double refund blocked
        vm.prank(alice);
        vm.expectRevert(Vault.NothingToRefund.selector);
        vault.refund(id);

        uint256 b0 = bob.balance;
        vm.prank(bob);
        vault.refund(id);
        assertEq(bob.balance, b0 + 3 ether);
        assertEq(vault.totalEscrow(), 0);
        assertEq(vault.getPact(id).escrow, 0);
    }

    function test_refund_revertsWhenNotRefundable() public {
        uint256 id = _createWeb();
        vm.prank(alice);
        vault.contribute{value: 1 ether}(id);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Vault.NotRefundable.selector, Vault.PactStatus.Open));
        vault.refund(id);
    }

    // --- Inconclusive / failure re-open -------------------------------------

    function test_inconclusive_reopens() public {
        uint256 id = _createWeb();
        vm.prank(creator);
        uint256 rid = vault.requestResolution{value: deposit()}(id);
        platform.fireString(address(vault), rid, "maybe");
        assertEq(uint8(vault.getPact(id).status), uint8(Vault.PactStatus.Open));
        assertEq(vault.getPact(id).verdict, "maybe");
        // can be re-resolved
        vm.prank(creator);
        vault.requestResolution{value: deposit()}(id);
        assertEq(uint8(vault.getPact(id).status), uint8(Vault.PactStatus.Resolving));
    }

    function test_failedRequest_reopens() public {
        uint256 id = _createWeb();
        vm.prank(creator);
        uint256 rid = vault.requestResolution{value: deposit()}(id);
        platform.fireFailure(address(vault), rid, ResponseStatus.TimedOut);
        assertEq(uint8(vault.getPact(id).status), uint8(Vault.PactStatus.Open));
    }

    // --- DATA verdicts ------------------------------------------------------

    function test_data_true_confirms() public {
        vm.prank(creator);
        uint256 id = vault.createPact{value: 1 ether}(_newData());
        vm.prank(bob);
        uint256 rid = vault.requestResolution{value: deposit()}(id);
        platform.fireBool(address(vault), rid, true);
        assertEq(uint8(vault.getPact(id).status), uint8(Vault.PactStatus.Confirmed));
        assertEq(vault.getPact(id).verdict, "true");
    }

    function test_data_false_denies() public {
        vm.prank(creator);
        uint256 id = vault.createPact{value: 1 ether}(_newData());
        vm.prank(bob);
        uint256 rid = vault.requestResolution{value: deposit()}(id);
        platform.fireBool(address(vault), rid, false);
        assertEq(uint8(vault.getPact(id).status), uint8(Vault.PactStatus.Denied));
    }

    // --- Expiry -------------------------------------------------------------

    function test_markExpired_thenRefund() public {
        uint256 id = _createWeb();
        vm.prank(alice);
        vault.contribute{value: 2 ether}(id);

        vm.expectRevert(Vault.NotExpirable.selector); // not yet past deadline
        vault.markExpired(id);

        vm.warp(block.timestamp + 31 days);
        vault.markExpired(id);
        assertEq(uint8(vault.getPact(id).status), uint8(Vault.PactStatus.Expired));

        uint256 a0 = alice.balance;
        vm.prank(alice);
        vault.refund(id);
        assertEq(alice.balance, a0 + 2 ether);
        assertEq(vault.totalEscrow(), 0);
    }

    // --- Consensus receipt --------------------------------------------------

    function test_consensusReceipt_recorded() public {
        uint256 id = _createWeb();
        vm.prank(creator);
        uint256 rid = vault.requestResolution{value: deposit()}(id);

        uint256[] memory costs = new uint256[](3);
        costs[0] = 3e16;
        costs[1] = 1e16;
        costs[2] = 2e16;
        platform.fireStringConsensus(address(vault), rid, "confirmed", costs, 42);

        (uint64 validators, uint64 finalizedAt, uint256 receiptId, uint256 medianCost) = vault.receipts(rid);
        assertEq(validators, 3);
        assertEq(receiptId, 42);
        assertEq(medianCost, 2e16); // median of {1,2,3}e16
        assertGt(finalizedAt, 0);
        assertEq(uint8(vault.getPact(id).status), uint8(Vault.PactStatus.Confirmed));
    }

    // --- Escrow ring-fence (owner cannot touch contributor money) -----------

    function test_owner_cannotWithdrawEscrow() public {
        uint256 id = _createWeb();
        vm.prank(alice);
        vault.contribute{value: 6 ether}(id); // escrow = 6

        // simulate a platform rebate landing on the contract (free balance)
        (bool ok,) = address(vault).call{value: 1 ether}("");
        assertTrue(ok);
        assertEq(vault.totalEscrow(), 6 ether);
        assertEq(vault.freeBalance(), 1 ether);

        address sink = address(0x5151);

        // cannot pull more than the free balance
        vm.expectRevert(abi.encodeWithSelector(Vault.EscrowLocked.selector, uint256(1 ether + 1), uint256(1 ether)));
        vault.withdraw(payable(sink), 1 ether + 1);

        // can pull exactly the free balance
        vault.withdraw(payable(sink), 1 ether);
        assertEq(sink.balance, 1 ether);
        assertEq(vault.freeBalance(), 0);

        // withdrawAll now sweeps nothing — escrow stays put
        vault.withdrawAll(payable(sink));
        assertEq(sink.balance, 1 ether);
        assertEq(address(vault).balance, 6 ether);
        assertEq(vault.totalEscrow(), 6 ether);
    }

    function test_withdraw_revertsForNonOwner() public {
        vm.prank(alice);
        vm.expectRevert(AgentCompute.NotOwner.selector);
        vault.withdraw(payable(alice), 0);
    }

    // --- Reentrancy ---------------------------------------------------------

    function test_refund_reentrancyBlocked() public {
        Reentrant attacker = new Reentrant(vault);
        vm.deal(address(attacker), 10 ether);

        uint256 id = _createWeb();
        attacker.contribute{value: 3 ether}(id);

        vm.prank(creator);
        uint256 rid = vault.requestResolution{value: deposit()}(id);
        platform.fireString(address(vault), rid, "denied");

        attacker.armRefund(id);
        uint256 before = address(attacker).balance;
        attacker.triggerRefund(id); // re-enters refund on receive(); guard blocks the inner call
        // attacker is refunded exactly once; the contract is fully drained of this pact's escrow
        assertEq(address(attacker).balance, before + 3 ether);
        assertEq(vault.getPact(id).escrow, 0);
        assertEq(vault.totalEscrow(), 0);
    }

    function test_requiredDeposit() public view {
        assertEq(vault.requiredDeposit(), platform.FLOOR() + REWARD * SUB);
    }

    // allow this test contract (Vault owner) to receive rebates/value
    receive() external payable {}
}

/// @dev Contributor that tries to re-enter {refund} from its receive() hook.
contract Reentrant {
    Vault public immutable vault;
    uint256 public armedPact;
    bool public armed;

    constructor(Vault v) {
        vault = v;
    }

    function contribute(uint256 pactId) external payable {
        vault.contribute{value: msg.value}(pactId);
    }

    function armRefund(uint256 pactId) external {
        armedPact = pactId;
        armed = true;
    }

    function triggerRefund(uint256 pactId) external {
        vault.refund(pactId);
    }

    receive() external payable {
        if (armed) {
            armed = false; // single shot
            // attempt the re-entrant refund; the nonReentrant guard reverts it.
            try vault.refund(armedPact) {} catch {}
        }
    }
}
