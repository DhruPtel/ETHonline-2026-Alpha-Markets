// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/**
 * AlphaMarket — a parimutuel market on one question, settled from The Graph.
 *
 * PLAN-v4 §5.2's interface, unchanged. An analyst publishes a report, commits a side backed by its
 * own USDC, humans stake alongside, and settlement re-reads the subgraph and scores it.
 *
 * ⚠️ ON ARC, USDC **IS** THE NATIVE TOKEN. `msg.value` is USDC at 18 decimals; the ERC-20 view at
 * 0x3600…0000 reports 6 on the same balance (SM-08, measured twice — from the emitted event and from
 * the bytes Circle signed). Every amount in this file is 18-dp native, stored exactly as received.
 * The factor of 10^12 is applied at exactly one off-chain site and never here.
 *
 * ⚠️ NO TAKEOUT, NO FEE, NO OWNER WITHDRAWAL. The pool is conserved exactly. Takeout is the reason
 * traditional parimutuel has "breakage"; with no fee the only leakage is truncation dust, which is
 * left where it falls (see `payoutOf`).
 *
 * ⚠️ NO `receive()` AND NO `fallback()`. Value enters only through `commitPrediction` and `stake`,
 * both of which record who it came from. A plain transfer to this address reverts, which is correct:
 * money with no staker attached could never be claimed and would be stuck forever.
 *
 * ⚠️ WHAT THIS CONTRACT CANNOT KNOW, stated rather than left to be discovered. `reportHash` and
 * `specHash` are 32 arbitrary bytes to it. It cannot tell that a report exists, that a token was
 * minted carrying that hash, or that the observed day is in the future. Those are checked off-chain
 * before a commit is submitted, and every one of them is independently readable from two public
 * chains afterwards. **Detectable by anyone, enforced by no one.**
 */
contract AlphaMarket {
    // ─── Types ───────────────────────────────────────────────────────────────────────────────────

    /// The question, hashed WITH chainId and this address for domain separation.
    struct QuestionCore {
        bytes32 specHash;         // the canonical off-chain spec — src/arc/spec.ts
        uint64 closeTime;         // staking closes; must precede the observed day, enforced off-chain
        uint64 observationEnd;    // the instant the observed day ends
        uint64 resolveDeadline;   // after this, anyone may void
    }

    struct Market {
        bytes32 questionId;
        bytes32 specHash;
        uint64 closeTime;
        uint64 observationEnd;
        uint64 resolveDeadline;
        bool resolved;
        bool outcome;
        bool voided;
        bytes32 evidenceHash;
        uint256 poolTrue;
        uint256 poolFalse;
    }

    struct Claim {
        uint256 marketId;
        address author;
        bytes32 reportHash;
        bool side;
    }

    // ─── Configuration ───────────────────────────────────────────────────────────────────────────

    /**
     * ⚠️ THE ONE ACCESS CONTROL IN THIS CONTRACT, AND IT IS IMMUTABLE.
     *
     * §5.2 shows `resolve` with a `!resolved` guard and a timestamp check and no caller restriction.
     * Taken literally that lets anyone settle any market with any outcome and take the pool, so it
     * had to be decided here — it cannot be changed after deployment.
     *
     * **Only this address may resolve.** It is the analyst's Circle wallet: the only party that runs
     * the Graph read and can produce a matching `evidenceHash`. Anyone may create a market, anyone
     * may stake, anyone may void once the deadline passes, anyone may claim.
     *
     * ⚠️ `immutable`, with no setter, deliberately. A mutable resolver is a key worth stealing and an
     * admin function worth abusing; if the analyst's wallet ever changes, deploy a new contract. That
     * matches how this project treats analyst identity everywhere else — a lost key means a new
     * analyst, not a restored one.
     *
     * ⚠️ WHY A RESTRICTED RESOLVE CANNOT LOCK FUNDS UP: `voidMarket` is permissionless after
     * `resolveDeadline` and `claim` is pull-based. If the resolver never fires, refuses, or
     * disappears, anyone can void the market and every staker takes their own stake back. The worst a
     * silent resolver can do is delay settlement to the deadline.
     *
     * ⚠️ THE RESIDUAL RISK, SAID OUT LOUD: a DISHONEST resolver can settle wrongly before the
     * deadline and direct the pool to the wrong side. Nothing on chain contradicts it. What exists
     * instead is `evidenceHash` over a reproducible read — a named deployment, a named document, a
     * named day — so a wrong resolution is detectable by anyone even though it is correctable by
     * no one. That is the honest limit of a market with no oracle and no dispute layer.
     */
    address public immutable resolver;

    /// 18-dp native per 6-dp USDC unit. `msg.value` must be a whole number of these (§5.2).
    uint256 public constant UNIT_SCALE = 1e12;

    /// ⚠️ A stake cap per §5.2 — it bounds a fat-fingered amount, not an attack. 1,000 USDC at 18-dp.
    uint256 public constant MAX_STAKE = 1_000e18;

    // ─── State ───────────────────────────────────────────────────────────────────────────────────

    uint256 public marketCount;
    uint256 public claimCount;

    mapping(uint256 => Market) public markets;
    mapping(uint256 => Claim) public claims;

    /// marketId => author => claimId. Zero means no claim; ids start at 1. Enforces one per author.
    mapping(uint256 => mapping(address => uint256)) public claimIdOf;

    /**
     * marketId => side => account => amount staked.
     *
     * ⚠️ Keyed by SIDE rather than by claim, because payout depends only on which side won.
     * Attribution to a specific claim is carried by events and scored off-chain on `(marketId,
     * claimId)` per §5.12 — putting it in storage would cost gas to record a fact no payout reads.
     */
    mapping(uint256 => mapping(bool => mapping(address => uint256))) public staked;

    /// ⚠️ The double-claim guard. Set BEFORE any value leaves — see `claim`.
    mapping(uint256 => mapping(address => bool)) public claimed;

    // ─── Events ──────────────────────────────────────────────────────────────────────────────────

    event MarketCreated(
        uint256 indexed marketId,
        bytes32 indexed questionId,
        address indexed creator,
        bytes32 specHash,
        uint64 closeTime,
        uint64 observationEnd,
        uint64 resolveDeadline
    );

    /**
     * ⚠️ `claimId` IS EMITTED, NOT ONLY RETURNED, AND THAT IS LOAD-BEARING.
     * A return value from a state-changing call is not readable from a transaction receipt, and the
     * analyst submits through Circle, whose API returns no logs at all. An event is the only way the
     * off-chain side can learn the id of the claim it just made.
     */
    event PredictionCommitted(
        uint256 indexed marketId,
        uint256 indexed claimId,
        address indexed author,
        bytes32 reportHash,
        bool side,
        uint256 amount
    );

    event Staked(uint256 indexed marketId, uint256 indexed claimId, address indexed staker, bool side, uint256 amount);
    event Resolved(uint256 indexed marketId, bool outcome, bytes32 evidenceHash, address resolver);
    event Voided(uint256 indexed marketId, address caller);
    event Claimed(uint256 indexed marketId, address indexed account, address indexed recipient, uint256 amount);

    // ─── Errors ──────────────────────────────────────────────────────────────────────────────────

    error NoSuchMarket(uint256 marketId);
    error NoSpecHash();
    error BadTimes();
    error StakingClosed(uint64 closeTime);
    error AlreadyCommitted(uint256 claimId);
    error ClaimNotInMarket(uint256 claimId, uint256 marketId);
    error ZeroStake();
    error NotAUsdcUnit(uint256 amount);
    error OverStakeCap(uint256 amount, uint256 cap);
    error NotResolver(address caller);
    error AlreadySettled();
    error TooEarlyToResolve(uint64 observationEnd);
    error NoEvidence();
    error TooEarlyToVoid(uint64 resolveDeadline);
    error NotSettled();
    error AlreadyClaimed();
    error NothingToClaim();
    error BadRecipient();
    error TransferFailed();

    // ─── Construction ────────────────────────────────────────────────────────────────────────────

    constructor(address resolver_) {
        if (resolver_ == address(0)) revert BadRecipient();
        resolver = resolver_;
    }

    // ─── Creating and taking positions ───────────────────────────────────────────────────────────

    /**
     * Anyone may create a market. The creator types the threshold; the spec it hashes is validated
     * off-chain by `src/arc/spec.ts`.
     *
     * ⚠️ ONLY THE ORDERING OF THE TIMESTAMPS IS ENFORCED HERE, NOT THEIR RELATION TO NOW. Requiring
     * `observationEnd > block.timestamp` would be the obvious guard and it is deliberately absent:
     * it would make a rehearsal market over an already-closed day impossible, and that is how the
     * resolve, void and empty-pool paths get exercised without waiting a calendar day. The cost is
     * real and is stated rather than hidden — **a market can be created about a day already
     * observed, and this contract cannot tell.** A market like that is a machinery test and must
     * never be presented as a forecast. Policy about `closeTime` versus the observed day lives in
     * `spec.ts`, which is where it can be checked against the day the question actually names.
     */
    function createMarket(QuestionCore calldata q) external returns (uint256 marketId) {
        if (q.specHash == bytes32(0)) revert NoSpecHash();
        if (q.closeTime >= q.observationEnd || q.observationEnd > q.resolveDeadline) revert BadTimes();

        marketId = ++marketCount;
        // ⚠️ Domain separation (§5.2): the same question on another chain, or against another
        // deployment of this contract, is a different market and cannot be replayed as this one.
        bytes32 questionId = keccak256(abi.encode(block.chainid, address(this), q));

        Market storage m = markets[marketId];
        m.questionId = questionId;
        m.specHash = q.specHash;
        m.closeTime = q.closeTime;
        m.observationEnd = q.observationEnd;
        m.resolveDeadline = q.resolveDeadline;

        emit MarketCreated(marketId, questionId, msg.sender, q.specHash, q.closeTime, q.observationEnd, q.resolveDeadline);
    }

    /// The analyst's own commitment, backed by its own USDC. One per author per market.
    function commitPrediction(uint256 marketId, bytes32 reportHash, bool side)
        external
        payable
        returns (uint256 claimId)
    {
        Market storage m = _open(marketId);
        if (claimIdOf[marketId][msg.sender] != 0) revert AlreadyCommitted(claimIdOf[marketId][msg.sender]);
        _checkAmount(msg.value);

        claimId = ++claimCount;
        claims[claimId] = Claim({marketId: marketId, author: msg.sender, reportHash: reportHash, side: side});
        claimIdOf[marketId][msg.sender] = claimId;

        _add(m, marketId, side, msg.value);
        emit PredictionCommitted(marketId, claimId, msg.sender, reportHash, side, msg.value);
    }

    /**
     * Stake alongside a claim.
     *
     * ⚠️ THE SIDE IS DERIVED FROM THE CLAIM AND IS NOT A PARAMETER. That is what closes the hole the
     * v3 interface had: a staker cannot attach someone's report to the side it did not predict.
     * Attribution is structural rather than a scoring convention.
     */
    function stake(uint256 marketId, uint256 claimId) external payable {
        Market storage m = _open(marketId);
        Claim storage c = claims[claimId];
        // Also rejects claimId 0 and any claim belonging to a different market, since an unset
        // claim has marketId 0 and market ids start at 1.
        if (c.marketId != marketId) revert ClaimNotInMarket(claimId, marketId);
        _checkAmount(msg.value);

        _add(m, marketId, c.side, msg.value);
        emit Staked(marketId, claimId, msg.sender, c.side, msg.value);
    }

    // ─── Settlement ──────────────────────────────────────────────────────────────────────────────

    /// ⚠️ Resolver only — see the note on `resolver`. Requires evidence; a resolution without it
    /// would be a number with nothing behind it, which is the one thing this design promises not to do.
    function resolve(uint256 marketId, bool outcome, bytes32 evidenceHash) external {
        if (msg.sender != resolver) revert NotResolver(msg.sender);
        Market storage m = _market(marketId);
        if (m.resolved || m.voided) revert AlreadySettled();
        if (block.timestamp < m.observationEnd) revert TooEarlyToResolve(m.observationEnd);
        if (evidenceHash == bytes32(0)) revert NoEvidence();

        m.resolved = true;
        m.outcome = outcome;
        m.evidenceHash = evidenceHash;
        emit Resolved(marketId, outcome, evidenceHash, msg.sender);
    }

    /// ⚠️ PERMISSIONLESS after `resolveDeadline`, by design. It is what makes funds unstrandable:
    /// with no resolver and no owner able to stop it, every staker can always get their own stake back.
    function voidMarket(uint256 marketId) external {
        Market storage m = _market(marketId);
        if (m.resolved || m.voided) revert AlreadySettled();
        if (block.timestamp < m.resolveDeadline) revert TooEarlyToVoid(m.resolveDeadline);

        m.voided = true;
        emit Voided(marketId, msg.sender);
    }

    // ─── Payout ──────────────────────────────────────────────────────────────────────────────────

    /**
     * What `account` is owed. View, so a page can show it before anyone spends gas.
     *
     * ⚠️ `winningPool == 0` IS A FIRST-CLASS BRANCH, NOT A GUARD. With one analyst and a handful of
     * stakers, a side with nothing on it is the EXPECTED case. Left unhandled this is a division by
     * zero and the pool is stuck forever; handled carelessly — as a shipped protocol was found to do
     * in audit — the contract keeps everything and everyone who staked honestly is burned. Here it
     * refunds every staker their own stake, which is what Augur's Invalid and Polymarket's 50/50
     * both amount to for a one-pot binary market.
     *
     * ⚠️ TRUNCATING DIVISION, AND NEVER ROUNDING UP. Integer division already truncates, so the sum
     * of all payouts is ≤ the pool and the last claimer cannot find the money gone. **The danger is
     * "fixing" this** — a rounding-up helper, a per-unit rate computed first, or a remainder handed
     * to someone. Do not.
     *
     * ⚠️ THE DUST STAYS HERE AND BELONGS TO NOBODY. There is no sweep function. A "last claimer takes
     * the remainder" rule is a claim-order race an audit found in the wild, and the amount at stake
     * is a few wei of USDC.
     *
     * A single staker on the winning side takes their own stake back and nothing else, because
     * `losingPool` is zero — correct by construction rather than by a branch.
     */
    function payoutOf(uint256 marketId, address account) public view returns (uint256) {
        Market storage m = _market(marketId);
        uint256 onTrue = staked[marketId][true][account];
        uint256 onFalse = staked[marketId][false][account];

        if (m.voided) return onTrue + onFalse;
        if (!m.resolved) return 0;

        uint256 winningPool = m.outcome ? m.poolTrue : m.poolFalse;
        if (winningPool == 0) return onTrue + onFalse;

        uint256 mine = m.outcome ? onTrue : onFalse;
        if (mine == 0) return 0;

        uint256 losingPool = m.outcome ? m.poolFalse : m.poolTrue;
        return mine + (mine * losingPool) / winningPool;
    }

    /**
     * Pull-based, per §5.2. `recipient` is explicit so a staker can direct the payout.
     *
     * ⚠️ Checks-effects-interactions, and `claimed` is set BEFORE the transfer. That is the whole
     * reentrancy defence and it is sufficient here: a recipient that calls back in finds its own
     * flag already set, and every other entry point is closed by then — staking requires
     * `block.timestamp < closeTime`, which cannot be true once a market is settled. No guard
     * contract, and therefore no dependency, is needed to say that.
     */
    function claim(uint256 marketId, address recipient) external {
        if (recipient == address(0)) revert BadRecipient();
        Market storage m = _market(marketId);
        if (!m.resolved && !m.voided) revert NotSettled();
        if (claimed[marketId][msg.sender]) revert AlreadyClaimed();

        uint256 amount = payoutOf(marketId, msg.sender);
        if (amount == 0) revert NothingToClaim();

        claimed[marketId][msg.sender] = true;

        // ⚠️ `call`, not `transfer`: the 2300-gas stipend breaks recipients that are contracts, and
        // a staker may well be one.
        (bool ok, ) = recipient.call{value: amount}("");
        if (!ok) revert TransferFailed();

        emit Claimed(marketId, msg.sender, recipient, amount);
    }

    // ─── Internals ───────────────────────────────────────────────────────────────────────────────

    function _market(uint256 marketId) private view returns (Market storage m) {
        m = markets[marketId];
        if (m.specHash == bytes32(0)) revert NoSuchMarket(marketId);
    }

    /// A market that exists and is still taking stakes. ⚠️ `closeTime < observationEnd <=
    /// resolveDeadline` is enforced at creation, so a market open for staking cannot yet be resolved
    /// or voided and no separate check for that is reachable.
    function _open(uint256 marketId) private view returns (Market storage m) {
        m = _market(marketId);
        if (block.timestamp >= m.closeTime) revert StakingClosed(m.closeTime);
    }

    function _checkAmount(uint256 amount) private pure {
        if (amount == 0) revert ZeroStake();
        // ⚠️ §5.2: a whole number of 6-dp USDC units, so the two presentations interconvert without loss.
        if (amount % UNIT_SCALE != 0) revert NotAUsdcUnit(amount);
        if (amount > MAX_STAKE) revert OverStakeCap(amount, MAX_STAKE);
    }

    function _add(Market storage m, uint256 marketId, bool side, uint256 amount) private {
        staked[marketId][side][msg.sender] += amount;
        if (side) {
            m.poolTrue += amount;
        } else {
            m.poolFalse += amount;
        }
    }
}
