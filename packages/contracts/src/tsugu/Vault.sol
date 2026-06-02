// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {AgentCompute} from "../agents/AgentCompute.sol";
import {SomniaAI} from "../agents/lib/SomniaAI.sol";
import {SomniaAgentIds, ResponseStatus} from "../agents/lib/SomniaAgents.sol";

/// @title  Vault — Tsugu's AI-verified conditional escrow
/// @notice Money that moves on proof, not promises. A **Pact** is a permissionless
///         escrow whose funds release to a beneficiary ONLY when a claim is proven
///         true by Somnia's consensus AI — and refund to contributors when it is
///         proven false. No middleman decides: the validator subcommittee fetches the
///         real evidence, classifies it, and the verdict (plus its consensus receipt)
///         is recorded on-chain for anyone to audit.
///
///         The kintsugi soul: something breaks (trust in online giving), Tsugu mends
///         it, and the proof is the gold in the seam.
///
/// @dev    `Vault is AgentCompute`: it inherits the hardened request/callback/funding
///         pattern (deposit math, platform-gated callback, status-checked decode,
///         consensus receipts) and adds the escrow state machine on top. One resolver
///         serves every PactKind — `kind` is framing for humans, not a code path:
///           - WEB  claim → parse-website agent `ExtractString(options=["confirmed",
///                          "denied"])`: one consensus call that fetches the real page
///                          AND classifies it against the claim.
///           - DATA claim → JSON-API agent `fetchBool(url, jsonPath)`: a structured
///                          boolean from a live endpoint.
///
///         MONEY SAFETY (this contract custodies third-party funds — reviewed
///         adversarially):
///           1. Escrow is ring-fenced. `totalEscrow` tracks every wei owed to pacts;
///              the owner's inherited {withdraw}/{withdrawAll} are overridden to sweep
///              only the free (rebate/top-up) balance — never escrow.
///           2. Resolution is caller-paid. `requestResolution` requires
///              `msg.value >= requiredDeposit()` from everyone (no owner exemption), so
///              the AI deposit forwarded to the platform is always covered by new money
///              and the escrow balance is never tapped to pay for compute.
///           3. Every value-moving path (release, refund) is `nonReentrant` and follows
///              checks-effects-interactions: state is finalised before the transfer.
///              `requestResolution` does NOT add its own guard — it calls the base
///              `_dispatch`, which is already `nonReentrant`.
contract Vault is AgentCompute {
    /// @notice Human-facing framing for a pact. Does NOT change the resolver — every
    ///         kind is verified by the same consensus call.
    enum PactKind {
        Relief, // disaster donations released when the event is AI-confirmed
        Medical, // a patient's fund released against verified hospital reports
        Fundraise, // a founder raises against milestones, released when each is verified
        Insurance, // a premium pays out when the parametric event is AI-confirmed
        Custom // any claim backed by evidence

    }

    /// @notice How the claim is proven. Selects the Somnia agent + payload.
    enum ClaimType {
        Web, // parse-website agent: read `evidenceUrl`, classify against the claim
        Data // JSON-API agent: fetch a boolean at `jsonPath` from `evidenceUrl`

    }

    /// @notice Pact lifecycle.
    /// @dev    Open ──contribute──▶ Open
    ///         Open ──requestResolution──▶ Resolving
    ///         Resolving ──confirmed──▶ Confirmed ──(dispute window)──▶ release ──▶ Released
    ///         Resolving ──denied──▶ Denied ──contributors refund──▶ (escrow drains)
    ///         Resolving ──inconclusive/failed──▶ Open (retryable)
    ///         Open ──deadline passes──▶ Expired ──contributors refund──▶ (escrow drains)
    enum PactStatus {
        Open,
        Resolving,
        Confirmed,
        Denied,
        Released,
        Expired
    }

    /// @notice A unit of trust-minimised funding.
    /// @dev    `escrow` is the live balance still held for this pact (drops to 0 once
    ///         released or fully refunded). Strings live in the struct so a single
    ///         `getPact` read returns everything a UI needs.
    struct Pact {
        address creator;
        address beneficiary;
        PactKind kind;
        ClaimType claimType;
        PactStatus status;
        bool resolveUrl; // WEB: true = domain-search the page first; false = direct scrape
        uint64 deadline; // claim must be proven by here; after, contributors can refund
        uint64 confirmedAt; // when the "confirmed" verdict landed (starts the dispute window)
        uint64 disputeWindow; // seconds after confirmedAt before release is allowed (0 = instant)
        uint256 escrow; // wei currently held for this pact
        string claim; // the human claim / extraction prompt the AI must verify
        string evidenceUrl; // WEB: page to read; DATA: JSON endpoint
        string jsonPath; // DATA: dot-path to the boolean (ignored for WEB)
        string verdict; // raw AI answer once resolved ("confirmed"/"denied"/"true"/"false")
    }

    /// @notice Parameters for {createPact}, bundled to dodge stack-too-deep (via_ir off).
    struct NewPact {
        PactKind kind;
        ClaimType claimType;
        address beneficiary;
        uint64 deadline;
        uint64 disputeWindow;
        bool resolveUrl;
        string claim;
        string evidenceUrl;
        string jsonPath;
    }

    /// @notice Somnia agent ids for the two resolver paths (defaulted to the canonical
    ///         ids when constructed with 0).
    uint256 public immutable parseAgentId;
    uint256 public immutable jsonAgentId;

    /// @notice Confidence gate (0–100) handed to the parse agent; extraction below this
    ///         fails rather than guessing. Pages backing a clear claim score well above.
    uint8 public constant PARSE_CONFIDENCE = 50;

    /// @notice All pacts, indexed by id (= array position).
    Pact[] internal pacts;

    /// @notice Sum of every pact's live escrow. The owner can never withdraw below this.
    uint256 public totalEscrow;

    /// @notice pactId → contributor → wei contributed (the refundable ledger).
    mapping(uint256 => mapping(address => uint256)) public contributions;

    /// @notice requestId → pactId, set when a resolution is dispatched so the platform
    ///         callback (`_onResult`) knows which pact a verdict belongs to.
    mapping(uint256 => uint256) public requestToPact;

    /// @notice pactId → its latest resolution requestId (look up `consensusOf` with it).
    mapping(uint256 => uint256) public resolutionRequest;

    event PactCreated(
        uint256 indexed pactId,
        address indexed creator,
        address indexed beneficiary,
        PactKind kind,
        ClaimType claimType,
        uint64 deadline
    );
    event PactContributed(uint256 indexed pactId, address indexed contributor, uint256 amount, uint256 newEscrow);
    event PactResolutionRequested(uint256 indexed pactId, uint256 indexed requestId, ClaimType claimType);
    event PactConfirmed(uint256 indexed pactId, uint256 indexed requestId, string verdict, uint64 releasableAt);
    event PactDenied(uint256 indexed pactId, uint256 indexed requestId, string verdict);
    event PactInconclusive(uint256 indexed pactId, uint256 indexed requestId, string rawVerdict);
    event PactResolutionFailed(uint256 indexed pactId, uint256 indexed requestId, ResponseStatus status);
    event PactReleased(uint256 indexed pactId, address indexed beneficiary, uint256 amount);
    event PactRefunded(uint256 indexed pactId, address indexed contributor, uint256 amount);
    event PactExpired(uint256 indexed pactId);

    error BadBeneficiary();
    error BadDeadline();
    error EmptyClaim();
    error EmptyEvidence();
    error EmptyJsonPath();
    error UnknownPact(uint256 pactId);
    error NotOpen(PactStatus status);
    error DeadlinePassed();
    error NothingContributed();
    error ResolutionFeeTooLow(uint256 sent, uint256 required);
    error NotConfirmed(PactStatus status);
    error DisputeWindowActive(uint64 releasableAt);
    error EmptyEscrow();
    error NotRefundable(PactStatus status);
    error NothingToRefund();
    error NotExpirable();
    error ReleaseFailed();
    error RefundFailedTo(address to);
    error EscrowLocked(uint256 requested, uint256 free);

    /// @param platform_         Somnia Agents platform (createRequest/handleResponse).
    /// @param parseAgentId_     parse-website agent id (0 → canonical PARSE_WEBSITE).
    /// @param jsonAgentId_      JSON-API agent id (0 → canonical JSON_API).
    /// @param subcommitteeSize_ validators per request (deposit = floor + reward × size).
    /// @param perAgentReward_   per-validator reward in wei.
    constructor(
        address platform_,
        uint256 parseAgentId_,
        uint256 jsonAgentId_,
        uint256 subcommitteeSize_,
        uint256 perAgentReward_
    ) AgentCompute(platform_, subcommitteeSize_, perAgentReward_) {
        parseAgentId = parseAgentId_ == 0 ? SomniaAgentIds.PARSE_WEBSITE : parseAgentId_;
        jsonAgentId = jsonAgentId_ == 0 ? SomniaAgentIds.JSON_API : jsonAgentId_;
    }

    // --- Create & fund ------------------------------------------------------

    /// @notice Open a pact. Permissionless. Optionally seed it by sending value (counts
    ///         as the creator's first contribution).
    /// @return pactId index of the new pact.
    function createPact(NewPact calldata n) external payable returns (uint256 pactId) {
        if (n.beneficiary == address(0)) revert BadBeneficiary();
        if (n.deadline <= block.timestamp) revert BadDeadline();
        if (bytes(n.claim).length == 0) revert EmptyClaim();
        if (bytes(n.evidenceUrl).length == 0) revert EmptyEvidence();
        if (n.claimType == ClaimType.Data && bytes(n.jsonPath).length == 0) revert EmptyJsonPath();

        pactId = pacts.length;
        Pact storage p = pacts.push();
        p.creator = msg.sender;
        p.beneficiary = n.beneficiary;
        p.kind = n.kind;
        p.claimType = n.claimType;
        p.status = PactStatus.Open;
        p.resolveUrl = n.resolveUrl;
        p.deadline = n.deadline;
        p.disputeWindow = n.disputeWindow;
        p.claim = n.claim;
        p.evidenceUrl = n.evidenceUrl;
        p.jsonPath = n.jsonPath;

        emit PactCreated(pactId, msg.sender, n.beneficiary, n.kind, n.claimType, n.deadline);

        if (msg.value > 0) _contribute(p, pactId, msg.value);
    }

    /// @notice Add funds to a pact's escrow while it is Open and before its deadline.
    function contribute(uint256 pactId) external payable {
        Pact storage p = _pact(pactId);
        if (p.status != PactStatus.Open) revert NotOpen(p.status);
        if (block.timestamp > p.deadline) revert DeadlinePassed();
        if (msg.value == 0) revert NothingContributed();
        _contribute(p, pactId, msg.value);
    }

    function _contribute(Pact storage p, uint256 pactId, uint256 amount) private {
        p.escrow += amount;
        totalEscrow += amount;
        contributions[pactId][msg.sender] += amount;
        emit PactContributed(pactId, msg.sender, amount, p.escrow);
    }

    // --- Resolve ------------------------------------------------------------

    /// @notice Pay the consensus AI to verify the claim. Permissionless and caller-paid:
    ///         forward `msg.value >= requiredDeposit()`. The verdict arrives later via
    ///         the platform callback. Overpayment is refunded by the base `_dispatch`.
    /// @dev    Not `nonReentrant` here — `_dispatch` already holds the guard.
    /// @return requestId the dispatched platform request (also stored in resolutionRequest).
    function requestResolution(uint256 pactId) external payable returns (uint256 requestId) {
        Pact storage p = _pact(pactId);
        if (p.status != PactStatus.Open) revert NotOpen(p.status);
        if (block.timestamp > p.deadline) revert DeadlinePassed();

        uint256 dep = requiredDeposit();
        if (msg.value < dep) revert ResolutionFeeTooLow(msg.value, dep);

        if (p.claimType == ClaimType.Web) {
            string[] memory options = new string[](2);
            options[0] = "confirmed";
            options[1] = "denied";
            bytes memory payload = SomniaAI.encodeExtractString(
                "verdict",
                "whether the claim is confirmed or denied by the evidence on this page",
                options,
                p.claim,
                p.evidenceUrl,
                p.resolveUrl,
                p.resolveUrl ? uint8(3) : uint8(1),
                PARSE_CONFIDENCE
            );
            requestId = _dispatch(parseAgentId, payload);
        } else {
            bytes memory payload = SomniaAI.encodeFetchBool(p.evidenceUrl, p.jsonPath);
            requestId = _dispatch(jsonAgentId, payload);
        }

        requestToPact[requestId] = pactId;
        resolutionRequest[pactId] = requestId;
        p.status = PactStatus.Resolving;
        emit PactResolutionRequested(pactId, requestId, p.claimType);
    }

    /// @notice Decode the consensus verdict and move the pact. Called by the base from
    ///         `handleResponse` after the consensus receipt is already recorded — so by
    ///         the time this runs, `consensusOf(requestId)` is populated.
    function _onResult(uint256 requestId, bytes memory result) internal override {
        uint256 pactId = requestToPact[requestId];
        Pact storage p = pacts[pactId];
        if (p.status != PactStatus.Resolving) return; // defensive: ignore stray callbacks

        bool confirmed;
        bool inconclusive;
        string memory verdict;

        if (p.claimType == ClaimType.Web) {
            verdict = abi.decode(result, (string));
            bytes32 h = keccak256(bytes(_toLower(verdict)));
            if (h == keccak256("confirmed")) confirmed = true;
            else if (h == keccak256("denied")) confirmed = false;
            else inconclusive = true; // a fuzzy answer must never release funds
        } else {
            bool v = abi.decode(result, (bool));
            confirmed = v;
            verdict = v ? "true" : "false";
        }

        p.verdict = verdict;

        if (inconclusive) {
            p.status = PactStatus.Open; // back to Open: a clearer re-resolution can be paid for
            emit PactInconclusive(pactId, requestId, verdict);
        } else if (confirmed) {
            p.status = PactStatus.Confirmed;
            p.confirmedAt = uint64(block.timestamp);
            uint64 releaseAt = uint64(block.timestamp + p.disputeWindow);
            emit PactConfirmed(pactId, requestId, verdict, releaseAt);
        } else {
            p.status = PactStatus.Denied;
            emit PactDenied(pactId, requestId, verdict);
        }
    }

    /// @notice A Failed/TimedOut request re-opens the pact so resolution can be retried.
    function _onFailed(uint256 requestId, ResponseStatus status) internal override {
        uint256 pactId = requestToPact[requestId];
        Pact storage p = pacts[pactId];
        if (p.status == PactStatus.Resolving) p.status = PactStatus.Open;
        emit PactResolutionFailed(pactId, requestId, status);
    }

    // --- Settle -------------------------------------------------------------

    /// @notice Release a confirmed pact's escrow to its beneficiary (NO skim). Callable
    ///         by anyone once the dispute window has elapsed. CEI + nonReentrant.
    function release(uint256 pactId) external nonReentrant {
        Pact storage p = _pact(pactId);
        if (p.status != PactStatus.Confirmed) revert NotConfirmed(p.status);
        uint64 releasableAt = uint64(uint256(p.confirmedAt) + uint256(p.disputeWindow));
        if (block.timestamp < releasableAt) revert DisputeWindowActive(releasableAt);

        uint256 amount = p.escrow;
        if (amount == 0) revert EmptyEscrow();

        // Effects before interaction.
        p.escrow = 0;
        totalEscrow -= amount;
        p.status = PactStatus.Released;
        address beneficiary = p.beneficiary;

        (bool ok,) = beneficiary.call{value: amount}("");
        if (!ok) revert ReleaseFailed();
        emit PactReleased(pactId, beneficiary, amount);
    }

    /// @notice Refund the caller's contribution from a Denied or Expired pact. Each
    ///         contributor pulls their own funds. CEI + nonReentrant.
    function refund(uint256 pactId) external nonReentrant {
        Pact storage p = _pact(pactId);
        if (p.status != PactStatus.Denied && p.status != PactStatus.Expired) revert NotRefundable(p.status);

        uint256 amount = contributions[pactId][msg.sender];
        if (amount == 0) revert NothingToRefund();

        // Effects before interaction.
        contributions[pactId][msg.sender] = 0;
        p.escrow -= amount;
        totalEscrow -= amount;

        (bool ok,) = msg.sender.call{value: amount}("");
        if (!ok) revert RefundFailedTo(msg.sender);
        emit PactRefunded(pactId, msg.sender, amount);
    }

    /// @notice Mark an Open pact Expired once its deadline has passed without a
    ///         confirmed verdict, unlocking refunds. Permissionless.
    function markExpired(uint256 pactId) external {
        Pact storage p = _pact(pactId);
        if (p.status != PactStatus.Open) revert NotExpirable();
        if (block.timestamp <= p.deadline) revert NotExpirable();
        p.status = PactStatus.Expired;
        emit PactExpired(pactId);
    }

    // --- Owner withdrawal (escrow-protected) --------------------------------

    /// @notice Free balance the owner may withdraw: total balance minus ring-fenced
    ///         escrow. This is rebate dust and any owner top-ups — never contributor money.
    function freeBalance() public view returns (uint256) {
        uint256 bal = address(this).balance;
        return bal > totalEscrow ? bal - totalEscrow : 0;
    }

    /// @inheritdoc AgentCompute
    /// @dev Overridden to cap withdrawals at {freeBalance} so escrow can never be swept.
    function withdraw(address payable to, uint256 amount) external override nonReentrant {
        if (msg.sender != owner) revert NotOwner();
        uint256 free = freeBalance();
        if (amount > free) revert EscrowLocked(amount, free);
        (bool ok,) = to.call{value: amount}("");
        if (!ok) revert WithdrawFailed();
        emit Withdrawn(to, amount);
    }

    /// @inheritdoc AgentCompute
    /// @dev Overridden to sweep only {freeBalance}, leaving every pact's escrow intact.
    function withdrawAll(address payable to) external override nonReentrant {
        if (msg.sender != owner) revert NotOwner();
        uint256 amount = freeBalance();
        (bool ok,) = to.call{value: amount}("");
        if (!ok) revert WithdrawFailed();
        emit Withdrawn(to, amount);
    }

    // --- Views --------------------------------------------------------------

    /// @notice Number of pacts ever created.
    function pactCount() external view returns (uint256) {
        return pacts.length;
    }

    /// @notice Full pact record (strings included) for a UI/indexer.
    function getPact(uint256 pactId) external view returns (Pact memory) {
        return _pact(pactId);
    }

    /// @notice The caller-or-other's refundable contribution to a pact.
    function contributionOf(uint256 pactId, address who) external view returns (uint256) {
        return contributions[pactId][who];
    }

    /// @notice Timestamp from which a Confirmed pact may be released (0 if not confirmed).
    function releasableAt(uint256 pactId) external view returns (uint256) {
        Pact storage p = _pact(pactId);
        if (p.status != PactStatus.Confirmed) return 0;
        return uint256(p.confirmedAt) + uint256(p.disputeWindow);
    }

    // --- Internal -----------------------------------------------------------

    function _pact(uint256 pactId) internal view returns (Pact storage) {
        if (pactId >= pacts.length) revert UnknownPact(pactId);
        return pacts[pactId];
    }

    /// @dev ASCII lower-case, so a "Confirmed"/"DENIED" answer is read the same as the
    ///      lower-case options the agent was constrained to.
    function _toLower(string memory s) internal pure returns (string memory) {
        bytes memory b = bytes(s);
        for (uint256 i = 0; i < b.length; i++) {
            if (b[i] >= 0x41 && b[i] <= 0x5A) b[i] = bytes1(uint8(b[i]) + 32);
        }
        return string(b);
    }
}
