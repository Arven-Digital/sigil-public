// Hardcoded policy bundles — no API needed
// All addresses verified from official docs/explorers

export interface BundleTarget {
  address: string;
  label: string;
}

export interface BundleFunction {
  selector: string; // 0x + 4 bytes
  label: string;
}

export interface PolicyBundle {
  id: string;
  name: string;
  icon: string;
  description: string;
  chainId: number;
  targets: BundleTarget[];
  functions: BundleFunction[];
}

// ─── Common function selectors ───
// ERC-20
const FN_APPROVE = { selector: "0x095ea7b3", label: "approve" };
const FN_TRANSFER = { selector: "0xa9059cbb", label: "transfer" };
const FN_TRANSFER_FROM = { selector: "0x23b872dd", label: "transferFrom" };

// Wrapped native tokens (WMATIC, WETH, WAVAX)
const FN_DEPOSIT = { selector: "0xd0e30db0", label: "deposit (wrap native)" };
const FN_WITHDRAW_NATIVE = { selector: "0x2e1a7d4d", label: "withdraw (unwrap native)" };

// Uniswap V3 SwapRouter (0xE592...) — original selectors
const FN_EXACT_INPUT_V1 = { selector: "0xc04b8d59", label: "exactInput (V3 Router)" };
const FN_EXACT_INPUT_SINGLE_V1 = { selector: "0x414bf389", label: "exactInputSingle (V3 Router)" };
const FN_EXACT_OUTPUT_SINGLE_V1 = { selector: "0xdb3e2198", label: "exactOutputSingle (V3 Router)" };

// Uniswap V3 SwapRouter02 (0x68b3...) — different struct, different selectors
const FN_EXACT_INPUT_SINGLE_V2 = { selector: "0x04e45aaf", label: "exactInputSingle (Router02)" };
const FN_EXACT_OUTPUT_SINGLE_V2 = { selector: "0x5023b4df", label: "exactOutputSingle (Router02)" };
const FN_EXACT_INPUT_V2 = { selector: "0xb858183f", label: "exactInput (Router02)" };
const FN_EXACT_OUTPUT_V2 = { selector: "0x09b81346", label: "exactOutput (Router02)" };

// Universal & general swap
const FN_SWAP_EXACT_TOKENS = { selector: "0x472b43f3", label: "swapExactTokensForTokens (Router02)" };
const FN_MULTICALL = { selector: "0x5ae401dc", label: "multicall (deadline)" };
const FN_MULTICALL_NO_DEADLINE = { selector: "0xac9650d8", label: "multicall (no deadline)" };
const FN_EXECUTE = { selector: "0x3593564c", label: "execute (UniversalRouter)" };

// Router02 helpers (wrapping inside router)
const FN_WRAP_ETH = { selector: "0x1c58db4f", label: "wrapETH (Router02)" };
const FN_UNWRAP_WETH9 = { selector: "0x49404b7c", label: "unwrapWETH9 (Router02)" };
const FN_REFUND_ETH = { selector: "0x12210e8a", label: "refundETH" };
const FN_SWEEP_TOKEN = { selector: "0xdf2ab5bb", label: "sweepToken" };

// V2-style AMMs (QuickSwap, SushiSwap, Trader Joe)
const FN_SWAP_EXACT_TOKENS_V2 = { selector: "0x38ed1739", label: "swapExactTokensForTokens (V2)" };
const FN_SWAP_TOKENS_FOR_EXACT = { selector: "0x8803dbee", label: "swapTokensForExactTokens" };
const FN_SWAP_EXACT_ETH = { selector: "0x7ff36ab5", label: "swapExactETHForTokens" };
const FN_SWAP_TOKENS_FOR_ETH = { selector: "0x18cbafe5", label: "swapExactTokensForETH" };
const FN_SWAP_TOKENS_FOR_EXACT_ETH = { selector: "0x4a25d94a", label: "swapTokensForExactETH" };
const FN_SWAP_FEE_ON_TRANSFER = { selector: "0x5c11d795", label: "swapExactTokensForTokens (fee)" };
const FN_ADD_LIQUIDITY = { selector: "0xe8e33700", label: "addLiquidity" };
const FN_ADD_LIQUIDITY_ETH = { selector: "0xf305d719", label: "addLiquidityETH" };
const FN_REMOVE_LIQUIDITY = { selector: "0xbaa2abde", label: "removeLiquidity" };
const FN_REMOVE_LIQUIDITY_ETH = { selector: "0x02751cec", label: "removeLiquidityETH" };

// ERC-20 extended
const FN_INCREASE_ALLOWANCE = { selector: "0x39509351", label: "increaseAllowance" };
const FN_DECREASE_ALLOWANCE = { selector: "0xa457c2d7", label: "decreaseAllowance" };
const FN_PERMIT = { selector: "0xd505accf", label: "permit (EIP-2612)" };

// UniversalRouter (no deadline variant)
const FN_EXECUTE_NO_DEADLINE = { selector: "0x24856bc3", label: "execute (no deadline)" };

// Router02 permit shortcut
const FN_SELF_PERMIT = { selector: "0xf3995c67", label: "selfPermit" };

// Uniswap V3 LP (NonfungiblePositionManager)
const FN_MINT_LP = { selector: "0x88316456", label: "mint (V3 LP position)" };
const FN_INCREASE_LP = { selector: "0x219f5d17", label: "increaseLiquidity" };
const FN_DECREASE_LP = { selector: "0x0c49ccbe", label: "decreaseLiquidity" };
const FN_COLLECT_LP = { selector: "0xfc6f7865", label: "collect (LP fees)" };

// Permit2 (selectors verified against on-chain bytecode)
const FN_PERMIT_TRANSFER = { selector: "0x30f28b7a", label: "permitTransferFrom" };
const FN_PERMIT_BATCH = { selector: "0xedd9444b", label: "permitBatchTransferFrom" };
const FN_PERMIT_WITNESS = { selector: "0x137c29fe", label: "permitWitnessTransferFrom" };

// Staking / Rewards
const FN_STAKE = { selector: "0xa694fc3a", label: "stake" };
const FN_UNSTAKE = { selector: "0x2e17de78", label: "unstake" };
const FN_CLAIM_REWARDS = { selector: "0x372500ab", label: "claimRewards" };
const FN_GET_REWARD = { selector: "0x3d18b912", label: "getReward" };
const FN_EXIT = { selector: "0xe9fad8ee", label: "exit (unstake + claim)" };

// Aave V3 extended
const FN_SET_COLLATERAL = { selector: "0x5a3b74b9", label: "setUserUseReserveAsCollateral" };
const FN_REPAY_WITH_ATOKENS = { selector: "0x2dad97d4", label: "repayWithATokens" };

// 1inch V6 — uses assembly dispatch, standard swap() selector NOT in bytecode
// 1inch txs go through internal routing; whitelisting the target address is sufficient
// No selector needed — 1inch handles all routing internally

// Curve
const FN_CURVE_EXCHANGE = { selector: "0x3df02124", label: "exchange (Curve)" };
const FN_CURVE_EXCHANGE_UNDERLYING = { selector: "0xa6417ed6", label: "exchange_underlying (Curve)" };

// Aerodrome (Base) — Velodrome V2 fork, different sigs from Uniswap V2
const FN_AERO_ADD_LIQ = { selector: "0x5a47ddc3", label: "addLiquidity (Aerodrome)" };
const FN_AERO_REMOVE_LIQ = { selector: "0x0dede6c4", label: "removeLiquidity (Aerodrome)" };
const FN_AERO_ADD_LIQ_ETH = { selector: "0xb7e0d4c0", label: "addLiquidityETH (Aerodrome)" };
const FN_AERO_REMOVE_LIQ_ETH = { selector: "0xd7b0e0a5", label: "removeLiquidityETH (Aerodrome)" };
const FN_AERO_SWAP = { selector: "0xcac88ea9", label: "swapExactTokensForTokens (Aerodrome)" };

// Lending — Aave V3
const FN_SUPPLY = { selector: "0x617ba037", label: "supply" };
const FN_WITHDRAW = { selector: "0x69328dec", label: "withdraw" };
const FN_BORROW = { selector: "0xa415bcad", label: "borrow" };
const FN_REPAY = { selector: "0x573ade81", label: "repay" };
// Compound V3
const FN_COMPOUND_SUPPLY = { selector: "0xf2b9fdb8", label: "supply (Compound)" };
const FN_COMPOUND_WITHDRAW = { selector: "0xf3fef3a3", label: "withdraw (Compound)" };
// GMX V2 ExchangeRouter — all operations go through multicall (0xac9650d8)
// createOrder, sendWnt etc. are internal calls within multicall batches
const FN_SEND_WNT = { selector: "0x7d39aaf1", label: "sendWnt" };
const FN_MULTICALL_GMX = { selector: "0xac9650d8", label: "multicall (GMX)" };

// Polymarket CTF Exchange (selectors verified against on-chain bytecode + SDK ABI)
const FN_FILL_ORDER = { selector: "0xfe729aaf", label: "fillOrder" };
const FN_FILL_ORDERS = { selector: "0xd798eff6", label: "fillOrders" };
const FN_MATCH_ORDERS = { selector: "0xe60f0c05", label: "matchOrders" };

// ─── Grouped function sets ───
const SWAP_FUNCTIONS = [
  // Core ERC-20
  FN_APPROVE, FN_TRANSFER, FN_INCREASE_ALLOWANCE, FN_PERMIT,
  // Wrap/unwrap native
  FN_DEPOSIT, FN_WITHDRAW_NATIVE,
  // V3 Router (original)
  FN_EXACT_INPUT_V1, FN_EXACT_INPUT_SINGLE_V1, FN_EXACT_OUTPUT_SINGLE_V1,
  // Router02
  FN_EXACT_INPUT_SINGLE_V2, FN_EXACT_OUTPUT_SINGLE_V2, FN_EXACT_INPUT_V2, FN_EXACT_OUTPUT_V2,
  FN_SWAP_EXACT_TOKENS, FN_SELF_PERMIT,
  // V2 AMMs
  FN_SWAP_EXACT_TOKENS_V2, FN_SWAP_TOKENS_FOR_EXACT, FN_SWAP_EXACT_ETH, FN_SWAP_TOKENS_FOR_ETH,
  FN_SWAP_TOKENS_FOR_EXACT_ETH, FN_SWAP_FEE_ON_TRANSFER,
  // Multicall
  FN_MULTICALL, FN_MULTICALL_NO_DEADLINE,
  // UniversalRouter
  FN_EXECUTE, FN_EXECUTE_NO_DEADLINE,
  // Router02 helpers
  FN_WRAP_ETH, FN_UNWRAP_WETH9, FN_REFUND_ETH, FN_SWEEP_TOKEN,
  // Curve
  FN_CURVE_EXCHANGE, FN_CURVE_EXCHANGE_UNDERLYING,
];
const LP_FUNCTIONS = [
  FN_APPROVE, FN_TRANSFER,
  // V2 LP
  FN_ADD_LIQUIDITY, FN_ADD_LIQUIDITY_ETH, FN_REMOVE_LIQUIDITY, FN_REMOVE_LIQUIDITY_ETH,
  // V3 LP (NonfungiblePositionManager)
  FN_MINT_LP, FN_INCREASE_LP, FN_DECREASE_LP, FN_COLLECT_LP,
  FN_MULTICALL_NO_DEADLINE, FN_REFUND_ETH, FN_SWEEP_TOKEN,
  FN_DEPOSIT, FN_WITHDRAW_NATIVE,
];
const LENDING_FUNCTIONS = [
  FN_APPROVE, FN_TRANSFER,
  FN_SUPPLY, FN_WITHDRAW, FN_BORROW, FN_REPAY,
  FN_SET_COLLATERAL, FN_REPAY_WITH_ATOKENS,
];
const STAKING_FUNCTIONS = [
  FN_APPROVE, FN_TRANSFER,
  FN_STAKE, FN_UNSTAKE, FN_CLAIM_REWARDS, FN_GET_REWARD, FN_EXIT,
  FN_DEPOSIT, FN_WITHDRAW_NATIVE,
];
const STABLECOIN_FUNCTIONS = [FN_APPROVE, FN_TRANSFER, FN_TRANSFER_FROM, FN_INCREASE_ALLOWANCE, FN_PERMIT, FN_DEPOSIT, FN_WITHDRAW_NATIVE];
const PERMIT2_FUNCTIONS = [FN_PERMIT_TRANSFER, FN_PERMIT_BATCH, FN_PERMIT_WITNESS];

export const POLICY_BUNDLES: PolicyBundle[] = [
  // ═══════════════════════════════════════
  //              POLYGON (137)
  // ═══════════════════════════════════════
  {
    id: "polygon-dex",
    name: "DEX Trading",
    icon: "🔄",
    description: "Uniswap V3, QuickSwap, SushiSwap, 1inch, ParaSwap",
    chainId: 137,
    targets: [
      { address: "0xE592427A0AEce92De3Edee1F18E0157C05861564", label: "Uniswap V3 Router" },
      { address: "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45", label: "Uniswap V3 Router02" },
      { address: "0x1095692A6237d83C6a72F3F5eFEdb9A670C49223", label: "Uniswap UniversalRouter V2" },
      { address: "0xf5b509bB0909a69B1c207E495f687a596C168E12", label: "QuickSwap V3 Router" },
      { address: "0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506", label: "SushiSwap Router" },
      { address: "0x111111125421cA6dc452d289314280a0f8842A65", label: "1inch V6 Router" },
      { address: "0xDEF171Fe48CF0115B1d80b88dc8eAB59176FEe57", label: "ParaSwap V5" },
    ],
    functions: SWAP_FUNCTIONS,
  },
  {
    id: "polygon-polymarket",
    name: "Polymarket Predictions",
    icon: "🎯",
    description: "Trade prediction markets — CTF Exchange + USDC",
    chainId: 137,
    targets: [
      { address: "0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E", label: "Polymarket CTF Exchange" },
      { address: "0xC5d563A36AE78145C45a50134d48A1215220f80a", label: "NegRisk Exchange" },
      { address: "0xd91E80cF2E7be2e162c6513ceD06f1dD0dA35296", label: "NegRisk Adapter" },
      { address: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174", label: "USDC.e" },
      { address: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", label: "USDC (native)" },
    ],
    functions: [
      FN_APPROVE, FN_TRANSFER, FN_TRANSFER_FROM,
      FN_FILL_ORDER, FN_FILL_ORDERS, FN_MATCH_ORDERS,
    ],
  },
  {
    id: "polygon-lending",
    name: "Lending & Borrowing",
    icon: "🏦",
    description: "Aave V3, Compound V3 — supply, borrow, repay",
    chainId: 137,
    targets: [
      { address: "0x794a61358D6845594F94dc1DB02A252b5b4814aD", label: "Aave V3 Pool" },
      { address: "0xF25212E676D1F7F89Cd72fFEe66158f541246445", label: "Compound V3 cUSDCv3" },
    ],
    functions: [...LENDING_FUNCTIONS, FN_COMPOUND_SUPPLY, FN_COMPOUND_WITHDRAW],
  },
  {
    id: "polygon-stablecoins",
    name: "Stablecoin & Token Operations",
    icon: "💰",
    description: "USDC, USDC.e, USDT, DAI, WMATIC, Permit2",
    chainId: 137,
    targets: [
      { address: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", label: "USDC (native)" },
      { address: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174", label: "USDC.e (bridged)" },
      { address: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F", label: "USDT" },
      { address: "0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063", label: "DAI" },
      { address: "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270", label: "WMATIC" },
      { address: "0x000000000022D473030F116dDEE9F6B43aC78BA3", label: "Permit2 (Uniswap)" },
    ],
    functions: STABLECOIN_FUNCTIONS,
  },

  {
    id: "polygon-lp",
    name: "Liquidity Provision",
    icon: "💧",
    description: "Uniswap V3 LP positions, QuickSwap/SushiSwap V2 LP",
    chainId: 137,
    targets: [
      { address: "0xC36442b4a4522E871399CD717aBDD847Ab11FE88", label: "Uniswap V3 NonfungiblePositionManager" },
      { address: "0xE592427A0AEce92De3Edee1F18E0157C05861564", label: "Uniswap V3 Router" },
      { address: "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45", label: "Uniswap V3 Router02" },
      { address: "0xf5b509bB0909a69B1c207E495f687a596C168E12", label: "QuickSwap V3 Router" },
      { address: "0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506", label: "SushiSwap Router" },
      { address: "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270", label: "WMATIC" },
    ],
    functions: LP_FUNCTIONS,
  },
  {
    id: "polygon-staking",
    name: "Staking & Rewards",
    icon: "🎯",
    description: "Stake tokens and claim rewards",
    chainId: 137,
    targets: [
      { address: "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270", label: "WMATIC" },
    ],
    functions: STAKING_FUNCTIONS,
  },

  // ═══════════════════════════════════════
  //            AVALANCHE (43114)
  // ═══════════════════════════════════════
  {
    id: "avalanche-dex",
    name: "DEX Trading",
    icon: "🔄",
    description: "Uniswap V3, Trader Joe, SushiSwap, 1inch, ParaSwap",
    chainId: 43114,
    targets: [
      { address: "0xbb00FF08d01D300023C629E8fFfFcb65A5a578cE", label: "Uniswap V3 Router02" },
      { address: "0x4Dae2f939ACf50408e13d58534Ff8c2776d45265", label: "Uniswap UniversalRouter" },
      { address: "0xb4315e873dBcf96Ffd0acd8EA43f689D8c20fB30", label: "Trader Joe LBRouter v2.1" },
      { address: "0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506", label: "SushiSwap Router" },
      { address: "0x111111125421cA6dc452d289314280a0f8842A65", label: "1inch V6 Router" },
      { address: "0xDEF171Fe48CF0115B1d80b88dc8eAB59176FEe57", label: "ParaSwap V5" },
    ],
    functions: SWAP_FUNCTIONS,
  },
  {
    id: "avalanche-lending",
    name: "Lending & Borrowing",
    icon: "🏦",
    description: "Aave V3 — supply, borrow, repay, withdraw",
    chainId: 43114,
    targets: [
      { address: "0x794a61358D6845594F94dc1DB02A252b5b4814aD", label: "Aave V3 Pool" },
    ],
    functions: LENDING_FUNCTIONS,
  },
  {
    id: "avalanche-stablecoins",
    name: "Stablecoin & Token Operations",
    icon: "💰",
    description: "USDC, USDT, WAVAX, Permit2",
    chainId: 43114,
    targets: [
      { address: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E", label: "USDC" },
      { address: "0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7", label: "USDT" },
      { address: "0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7", label: "WAVAX" },
      { address: "0x000000000022D473030F116dDEE9F6B43aC78BA3", label: "Permit2 (Uniswap)" },
    ],
    functions: STABLECOIN_FUNCTIONS,
  },
  {
    id: "avalanche-lp",
    name: "Liquidity Provision",
    icon: "💧",
    description: "Uniswap V3 LP positions, Trader Joe V2 LP",
    chainId: 43114,
    targets: [
      { address: "0x655C406EBFa14EE2006250925e54ec43AD184f8B", label: "Uniswap V3 NonfungiblePositionManager" },
      { address: "0xbb00FF08d01D300023C629E8fFfFcb65A5a578cE", label: "Uniswap V3 Router02" },
      { address: "0xb4315e873dBcf96Ffd0acd8EA43f689D8c20fB30", label: "Trader Joe LBRouter v2.1" },
      { address: "0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7", label: "WAVAX" },
    ],
    functions: LP_FUNCTIONS,
  },
  {
    id: "avalanche-staking",
    name: "Staking & Rewards",
    icon: "🎯",
    description: "Stake tokens and claim rewards",
    chainId: 43114,
    targets: [
      { address: "0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7", label: "WAVAX" },
    ],
    functions: STAKING_FUNCTIONS,
  },
  {
    id: "avalanche-perps",
    name: "Perpetual Trading",
    icon: "📈",
    description: "GMX V2 — leveraged perpetual trading",
    chainId: 43114,
    targets: [
      { address: "0x602b805EedddBbD9ddff44A7dcBD46cb07849685", label: "GMX V2 ExchangeRouter" },
    ],
    functions: [FN_APPROVE, FN_MULTICALL_GMX, FN_SEND_WNT],
  },

  // ═══════════════════════════════════════
  //               BASE (8453)
  // ═══════════════════════════════════════
  {
    id: "base-dex",
    name: "DEX Trading",
    icon: "🔄",
    description: "Uniswap, Aerodrome, SushiSwap, 1inch",
    chainId: 8453,
    targets: [
      { address: "0x198EF79F1F515F02dFE9e3115eD9fC07183f02fC", label: "Uniswap UniversalRouter" },
      { address: "0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43", label: "Aerodrome Router" },
      { address: "0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506", label: "SushiSwap Router" },
      { address: "0x111111125421cA6dc452d289314280a0f8842A65", label: "1inch V6 Router" },
    ],
    functions: [...SWAP_FUNCTIONS, FN_AERO_SWAP],
  },
  {
    id: "base-lp",
    name: "Liquidity Provision",
    icon: "💧",
    description: "Uniswap V3 LP, Aerodrome LP",
    chainId: 8453,
    targets: [
      { address: "0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1", label: "Uniswap V3 NonfungiblePositionManager" },
      { address: "0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43", label: "Aerodrome Router" },
      { address: "0x4200000000000000000000000000000000000006", label: "WETH" },
    ],
    functions: [...LP_FUNCTIONS, FN_AERO_ADD_LIQ, FN_AERO_REMOVE_LIQ, FN_AERO_ADD_LIQ_ETH, FN_AERO_REMOVE_LIQ_ETH],
  },
  {
    id: "base-lending",
    name: "Lending & Borrowing",
    icon: "🏦",
    description: "Aave V3, Compound V3 — supply, borrow, repay",
    chainId: 8453,
    targets: [
      { address: "0xA238Dd80C259a72e81d7e4664a9801593F98d1c5", label: "Aave V3 Pool" },
      { address: "0xb125E6687d4313864e53df431d5425969c15Eb2F", label: "Compound V3 cUSDCv3" },
    ],
    functions: [...LENDING_FUNCTIONS, FN_COMPOUND_SUPPLY, FN_COMPOUND_WITHDRAW],
  },
  {
    id: "base-stablecoins",
    name: "Stablecoin & Token Operations",
    icon: "💰",
    description: "USDC, WETH, Permit2",
    chainId: 8453,
    targets: [
      { address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", label: "USDC" },
      { address: "0x4200000000000000000000000000000000000006", label: "WETH" },
      { address: "0x000000000022D473030F116dDEE9F6B43aC78BA3", label: "Permit2 (Uniswap)" },
    ],
    functions: STABLECOIN_FUNCTIONS,
  },

  // ═══════════════════════════════════════
  //            ARBITRUM (42161)
  // ═══════════════════════════════════════
  {
    id: "arbitrum-dex",
    name: "DEX Trading",
    icon: "🔄",
    description: "Uniswap V3, Trader Joe, SushiSwap, 1inch",
    chainId: 42161,
    targets: [
      { address: "0xE592427A0AEce92De3Edee1F18E0157C05861564", label: "Uniswap V3 Router" },
      { address: "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45", label: "Uniswap V3 Router02" },
      { address: "0x4C60051384bd2d3C01bfc845Cf5F4b44bcbE9de5", label: "Uniswap UniversalRouter V2" },
      { address: "0xb4315e873dBcf96Ffd0acd8EA43f689D8c20fB30", label: "Trader Joe LBRouter v2.1" },
      { address: "0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506", label: "SushiSwap Router" },
      { address: "0x111111125421cA6dc452d289314280a0f8842A65", label: "1inch V6 Router" },
    ],
    functions: SWAP_FUNCTIONS,
  },
  {
    id: "arbitrum-lending",
    name: "Lending & Borrowing",
    icon: "🏦",
    description: "Aave V3, Compound V3 — supply, borrow, repay",
    chainId: 42161,
    targets: [
      { address: "0x794a61358D6845594F94dc1DB02A252b5b4814aD", label: "Aave V3 Pool" },
      { address: "0x9c4ec768c28520B50860ea7a15bd7213a9fF58bf", label: "Compound V3 cUSDCv3" },
    ],
    functions: [...LENDING_FUNCTIONS, FN_COMPOUND_SUPPLY, FN_COMPOUND_WITHDRAW],
  },
  {
    id: "arbitrum-stablecoins",
    name: "Stablecoin & Token Operations",
    icon: "💰",
    description: "USDC, USDT, WETH, Permit2",
    chainId: 42161,
    targets: [
      { address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", label: "USDC" },
      { address: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9", label: "USDT" },
      { address: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1", label: "WETH" },
      { address: "0x000000000022D473030F116dDEE9F6B43aC78BA3", label: "Permit2 (Uniswap)" },
    ],
    functions: STABLECOIN_FUNCTIONS,
  },
  {
    id: "arbitrum-lp",
    name: "Liquidity Provision",
    icon: "💧",
    description: "Uniswap V3 LP positions",
    chainId: 42161,
    targets: [
      { address: "0xC36442b4a4522E871399CD717aBDD847Ab11FE88", label: "Uniswap V3 NonfungiblePositionManager" },
      { address: "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45", label: "Uniswap V3 Router02" },
      { address: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1", label: "WETH" },
    ],
    functions: LP_FUNCTIONS,
  },
  {
    id: "arbitrum-staking",
    name: "Staking & Rewards",
    icon: "🎯",
    description: "Stake tokens and claim rewards",
    chainId: 42161,
    targets: [
      { address: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1", label: "WETH" },
    ],
    functions: STAKING_FUNCTIONS,
  },
  {
    id: "arbitrum-perps",
    name: "Perpetual Trading",
    icon: "📈",
    description: "GMX V2 — leveraged perpetual trading",
    chainId: 42161,
    targets: [
      { address: "0x602b805EedddBbD9ddff44A7dcBD46cb07849685", label: "GMX V2 ExchangeRouter" },
    ],
    functions: [FN_APPROVE, FN_MULTICALL_GMX, FN_SEND_WNT],
  },
];

export function getBundlesForChain(chainId: number): PolicyBundle[] {
  return POLICY_BUNDLES.filter(b => b.chainId === chainId);
}

// Map template IDs to bundle IDs for onboarding (uses chain-prefixed IDs at runtime)
export const TEMPLATE_BUNDLE_MAP: Record<string, string[]> = {
  "defi-agent": ["dex", "lending", "lp", "stablecoins"],
  "yield-farmer": ["dex", "lending", "lp", "staking", "stablecoins"],
  "prediction": ["polymarket", "stablecoins"],
  "sniper": ["dex", "stablecoins"],
  "aggressive": ["dex", "lp", "stablecoins"],
  "moderate": ["dex", "stablecoins"],
};

// Resolve template bundles for a specific chain
export function getTemplateBundles(templateId: string, chainId: number): PolicyBundle[] {
  const suffixes = TEMPLATE_BUNDLE_MAP[templateId] || [];
  const chainPrefix = getChainPrefix(chainId);
  return suffixes
    .map(suffix => POLICY_BUNDLES.find(b => b.id === `${chainPrefix}-${suffix}`))
    .filter((b): b is PolicyBundle => !!b);
}

function getChainPrefix(chainId: number): string {
  switch (chainId) {
    case 137: return "polygon";
    case 43114: return "avalanche";
    case 8453: return "base";
    case 42161: return "arbitrum";
    default: return "unknown";
  }
}
