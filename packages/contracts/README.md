# @asom/contracts

Solidity contracts for [asom](../../README.md) — the agentic layer on Somnia.

## Day 1 status

`OracleAgent.sol` is live on Shannon. See [`DEPLOYMENTS.md`](./DEPLOYMENTS.md) for addresses and tx hashes.

## Layout

```
src/
├── agents/
│   ├── OracleAgent.sol       # Tier-5 consensus-verified BTC price oracle (live on Shannon)
│   └── lib/SomniaAgents.sol  # canonical Somnia Agents types & interfaces
test/
└── OracleAgent.t.sol         # 15 tests, all 4 Somnia Agents pitfalls covered
script/
├── DeployOracleAgent.s.sol
└── RequestBtcPrice.s.sol
```

## Commands

```bash
pnpm build         # forge build
pnpm test          # forge test -vvv
pnpm fmt           # forge fmt
```

## Deploying to Shannon

```bash
cp ../../.env.example .env  # then fill in PRIVATE_KEY
source .env
forge script script/DeployOracleAgent.s.sol:DeployOracleAgent \
  --rpc-url shannon --broadcast --gas-estimate-multiplier 800
```

**If forge's gas estimator under-budgets** (it will — see Shannon notes below), use cast directly:
```bash
INIT=$(jq -r '.bytecode.object' out/OracleAgent.sol/OracleAgent.json)
ARGS=$(cast abi-encode "constructor(address,uint256,uint256,uint256)" \
  $SOMNIA_AGENTS_PLATFORM $JSON_API_AGENT_ID $SUBCOMMITTEE_SIZE $PER_AGENT_REWARD_WEI)
cast send --rpc-url $SHANNON_RPC_URL --private-key $PRIVATE_KEY \
  --gas-limit 30000000 --create "${INIT}${ARGS#0x}"
```

## Shannon EVM gotchas (learned the hard way Day 1)

1. **No PUSH0.** Build with `evm_version = "paris"` in `foundry.toml`. Solc 0.8.20+ emits PUSH0 by default and Shannon rejects it.
2. **CREATE costs ~20× standard EVM gas.** Forge's `eth_estimateGas` undercounts by ~8×. Always pass `--gas-limit 30000000` or `--gas-estimate-multiplier 800` for deploys.
3. **Don't read from the Somnia Agents platform inside `forge script`.** It's precompile-backed (`0x0100`), so any staticcall to it reverts in forge's local simulator and aborts the whole broadcast. Move platform reads to off-chain `cast call`.

## Somnia Agents pitfalls baked into every agent contract

1. Deposit = `getRequestDeposit() + (pricePerAgent × subcommitteeSize)`. Floor alone won't get picked up.
2. Implement `receive() external payable` — rebates are pushed.
3. Gate the callback: `require(msg.sender == address(platform))` + check `pendingRequests[requestId]`.
4. Check `ResponseStatus` before decoding `responses[0].result` — non-Success panics on decode.

All four are covered by tests in `test/OracleAgent.t.sol`.
