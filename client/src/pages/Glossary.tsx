import { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Search, BookOpen, ChevronDown, ChevronUp } from "lucide-react";

// ─── Glossary data ────────────────────────────────────────────────────────────

type GlossaryEntry = {
  term: string;
  symbol?: string;
  category: string;
  short: string;        // one-sentence plain-English definition
  detail: string;       // deeper explanation
  example?: string;     // concrete dollar/trade example
  seeAlso?: string[];   // related terms
};

const ENTRIES: GlossaryEntry[] = [
  // ── Greeks ────────────────────────────────────────────────────────────────
  {
    term: "Delta",
    symbol: "Δ",
    category: "Greeks",
    short: "How much an option's price changes when the underlying stock moves $1.",
    detail:
      "Delta ranges from 0 to 1 for calls and −1 to 0 for puts. An ATM option has a delta near ±0.50. Deep ITM options approach ±1; deep OTM options approach 0. Delta also approximates the probability that the option expires in-the-money.",
    example:
      "You own 1 call with Δ 0.40 on a $100 stock. If the stock rises to $101, the call gains approximately $0.40 in value.",
    seeAlso: ["Gamma", "Moneyness", "Delta Neutral"],
  },
  {
    term: "Gamma",
    symbol: "Γ",
    category: "Greeks",
    short: "The rate at which Delta changes as the stock moves — the 'acceleration' of your position.",
    detail:
      "Gamma is highest for ATM options close to expiration and lowest for deep ITM/OTM options. Long options have positive Gamma (Delta grows in your favour); short options have negative Gamma (Delta works against you on large moves). High Gamma near expiry is why short options become risky in the final week.",
    example:
      "Your short put has Δ −0.30 and Γ −0.04. If the stock drops $1, Delta becomes −0.34, meaning the next $1 drop hurts even more.",
    seeAlso: ["Delta", "Theta", "Pin Risk"],
  },
  {
    term: "Theta",
    symbol: "Θ",
    category: "Greeks",
    short: "The daily dollar amount an option loses (or gains) purely from the passage of time.",
    detail:
      "Theta is negative for long options (you lose value each day) and positive for short options (you collect value each day). Time decay accelerates in the final 30–45 days before expiration — this is why premium sellers prefer 30–45 DTE entries and close at 50% profit.",
    example:
      "You sold a put with Θ +$0.08. If the stock doesn't move overnight, your position gains $8 per contract by tomorrow's open.",
    seeAlso: ["Vega", "DTE", "Theta Decay"],
  },
  {
    term: "Vega",
    symbol: "V",
    category: "Greeks",
    short: "How much the position's value changes when implied volatility moves by 1 percentage point.",
    detail:
      "Long options have positive Vega (you profit if IV rises); short options have negative Vega (you profit if IV falls). Vega is highest for ATM options with more time to expiration. Premium sellers want to sell high Vega (high IV) and buy it back cheaper after IV contracts.",
    example:
      "You sold a strangle with V −$0.15. If IV rises by 5%, your position loses approximately $75 per contract (5 × $15).",
    seeAlso: ["IV", "IVR", "Theta"],
  },
  {
    term: "Rho",
    symbol: "ρ",
    category: "Greeks",
    short: "How much the position's value changes when interest rates move by 1 percentage point.",
    detail:
      "Rho is usually the smallest Greek and matters most for long-dated options (LEAPS). Calls have positive Rho (benefit from rising rates); puts have negative Rho. In a low-rate environment Rho is often ignored, but it becomes relevant when rates are volatile.",
    example:
      "Your long call has ρ +$0.05. If the Fed raises rates by 1%, the call gains approximately $5 per contract.",
    seeAlso: ["Delta", "Vega"],
  },
  {
    term: "Theta/Vega Ratio",
    symbol: "Θ/V",
    category: "Greeks",
    short: "Daily time decay collected per dollar of volatility risk — a measure of premium-selling efficiency.",
    detail:
      "A higher Θ/V ratio means you earn more daily income relative to the volatility exposure you're taking on. Iron Condors and short strangles typically have high ratios. Long straddles have very low (or negative) ratios. Tastytrade targets Θ/V > 0.5 for premium-selling setups.",
    example:
      "Strategy A: Θ $0.10, V $0.20 → ratio 0.50. Strategy B: Θ $0.05, V $0.30 → ratio 0.17. Strategy A is more efficient.",
    seeAlso: ["Theta", "Vega"],
  },

  // ── Volatility ────────────────────────────────────────────────────────────
  {
    term: "Implied Volatility",
    symbol: "IV",
    category: "Volatility",
    short: "The market's forward-looking expectation of how much a stock will move, expressed as an annualised percentage.",
    detail:
      "IV is derived by back-solving the Black-Scholes formula from the market price of an option. High IV means options are expensive (the market expects large moves); low IV means options are cheap. IV is not directional — it only measures expected magnitude.",
    example:
      "AAPL IV = 30% means the market expects AAPL to move roughly ±30% over the next year, or about ±8.7% over the next month.",
    seeAlso: ["IVR", "Realized Volatility", "Vega"],
  },
  {
    term: "IV Percentile Rank",
    symbol: "IVR",
    category: "Volatility",
    short: "Where current IV sits relative to its own 52-week range, expressed as a percentage from 0 to 100.",
    detail:
      "IVR = (Current IV − 52-week Low IV) / (52-week High IV − 52-week Low IV) × 100. IVR > 50 means IV is in the upper half of its annual range — a classic signal that options are expensive and premium selling is favoured. IVR < 30 means options are cheap and buying strategies (straddles, spreads) may be preferred.",
    example:
      "Stock IV 52-week range: 20%–60%. Current IV = 50%. IVR = (50−20)/(60−20) × 100 = 75. Options are expensive — good time to sell.",
    seeAlso: ["IV", "Realized Volatility", "Vega"],
  },
  {
    term: "Realized Volatility",
    symbol: "RV",
    category: "Volatility",
    short: "The actual historical volatility a stock has exhibited over a recent period, based on daily price returns.",
    detail:
      "RV is calculated from the standard deviation of daily log-returns, annualised. Comparing IV to RV (the IV/RV ratio) tells you whether options are priced fairly. IV > RV means options are expensive relative to recent moves — premium sellers have an edge. IV < RV means options are cheap.",
    example:
      "Stock RV-20 = 18%, IV = 35%. IV/RV = 1.94 — options are pricing in nearly twice the recent actual movement. Favourable for selling.",
    seeAlso: ["IV", "IVR"],
  },
  {
    term: "IV/RV Ratio",
    category: "Volatility",
    short: "The ratio of implied volatility to realized volatility — measures whether options are expensive or cheap.",
    detail:
      "IV/RV > 1.2 is generally considered elevated and favours premium selling. IV/RV < 0.8 favours buying options. The ratio is a key input in the strategy scoring model.",
    example: "IV = 40%, RV = 25%. IV/RV = 1.6 — options are 60% more expensive than recent moves justify.",
    seeAlso: ["IV", "Realized Volatility", "IVR"],
  },
  {
    term: "Expected Move",
    category: "Volatility",
    short: "The one-standard-deviation price range the market expects the stock to stay within by expiration.",
    detail:
      "Calculated as: Stock Price × IV × √(DTE / 365). Approximately 68% of the time the stock will finish within ±1 expected move. Iron Condors and short strangles are typically placed just outside the expected move to collect premium while staying within the high-probability zone.",
    example:
      "Stock = $100, IV = 30%, DTE = 30. Expected move = $100 × 0.30 × √(30/365) ≈ $8.60. The market expects the stock to stay between $91.40 and $108.60.",
    seeAlso: ["IV", "DTE", "Probability Cone"],
  },
  {
    term: "Probability Cone",
    category: "Volatility",
    short: "A visual projection of ±1σ and ±2σ price bands forward to expiration, based on current IV.",
    detail:
      "The ±1σ cone contains ~68% of expected outcomes; ±2σ contains ~95%. Overlaying the cone on a price chart shows where short strikes are relative to the expected distribution. Strikes placed outside the ±2σ cone have less than 2.5% probability of being breached.",
    example:
      "Stock = $500, IV = 25%, DTE = 45. ±1σ band: $466–$534. ±2σ band: $432–$568. An Iron Condor with strikes at $460/$540 sits just inside the ±1σ band.",
    seeAlso: ["Expected Move", "IV", "Iron Condor"],
  },

  // ── Options Basics ────────────────────────────────────────────────────────
  {
    term: "Call Option",
    category: "Options Basics",
    short: "A contract giving the buyer the right (not obligation) to buy 100 shares at the strike price before expiration.",
    detail:
      "The buyer pays a premium for this right. The seller (writer) collects the premium and is obligated to sell shares if assigned. Calls gain value when the stock rises. Selling calls generates income but caps upside.",
    example:
      "Buy 1 AAPL $180 call for $3.50. If AAPL rises to $190, the call is worth at least $10 — a profit of $6.50 per share ($650 per contract).",
    seeAlso: ["Put Option", "Strike Price", "Premium"],
  },
  {
    term: "Put Option",
    category: "Options Basics",
    short: "A contract giving the buyer the right (not obligation) to sell 100 shares at the strike price before expiration.",
    detail:
      "Puts gain value when the stock falls. Buying puts is a bearish or hedging strategy. Selling puts is a bullish income strategy — you collect premium and may be obligated to buy shares at the strike if assigned.",
    example:
      "Sell 1 SPY $400 put for $4.00. If SPY stays above $400 at expiration, you keep the $400 premium. If SPY falls to $390, you're assigned and must buy 100 shares at $400.",
    seeAlso: ["Call Option", "Naked Put", "Cash-Secured Put"],
  },
  {
    term: "Strike Price",
    category: "Options Basics",
    short: "The fixed price at which an option contract can be exercised.",
    detail:
      "For a call, the strike is the price at which you can buy shares. For a put, it's the price at which you can sell shares. The relationship between the strike and current stock price determines moneyness (ITM/ATM/OTM).",
    example: "A $150 call on a $145 stock has a $150 strike — it's OTM by $5.",
    seeAlso: ["Moneyness", "Expiration Date", "Premium"],
  },
  {
    term: "Premium",
    category: "Options Basics",
    short: "The price paid (or received) for an options contract, quoted per share (multiply by 100 for total cost).",
    detail:
      "Premium has two components: intrinsic value (how far ITM the option is) and extrinsic value (time value + IV). Sellers collect premium upfront; buyers pay it. All else equal, premium decays to zero at expiration (theta decay).",
    example:
      "An option quoted at $2.50 costs $250 per contract (100 shares × $2.50). If you sell it, you receive $250 immediately.",
    seeAlso: ["Intrinsic Value", "Extrinsic Value", "Theta"],
  },
  {
    term: "Intrinsic Value",
    category: "Options Basics",
    short: "The amount an option is in-the-money — the value it would have if exercised immediately.",
    detail:
      "Call intrinsic value = max(0, Stock Price − Strike). Put intrinsic value = max(0, Strike − Stock Price). OTM options have zero intrinsic value. Intrinsic value cannot be negative.",
    example:
      "Stock = $155, Call Strike = $150. Intrinsic value = $155 − $150 = $5. If the call is priced at $6, the remaining $1 is extrinsic value.",
    seeAlso: ["Extrinsic Value", "Moneyness", "Premium"],
  },
  {
    term: "Extrinsic Value",
    category: "Options Basics",
    short: "The portion of an option's premium above its intrinsic value — driven by time remaining and implied volatility.",
    detail:
      "Also called 'time value'. Extrinsic value decays to zero at expiration (theta decay). ATM options have the most extrinsic value. Premium sellers profit by capturing extrinsic value as it decays.",
    example:
      "Option price = $6.00, Intrinsic value = $5.00. Extrinsic value = $1.00. This $1 will decay to $0 by expiration if the stock stays at $155.",
    seeAlso: ["Intrinsic Value", "Theta", "Premium"],
  },
  {
    term: "Moneyness",
    category: "Options Basics",
    short: "The relationship between the current stock price and an option's strike price.",
    detail:
      "In-the-Money (ITM): has intrinsic value (call: stock > strike; put: stock < strike). At-the-Money (ATM): strike ≈ stock price. Out-of-the-Money (OTM): no intrinsic value (call: stock < strike; put: stock > strike). Most premium-selling strategies use OTM options.",
    example:
      "Stock = $100. $95 put = ITM (worth $5 intrinsically). $100 put = ATM. $105 put = OTM (worth $0 intrinsically).",
    seeAlso: ["Strike Price", "Intrinsic Value", "Delta"],
  },
  {
    term: "Expiration Date",
    category: "Options Basics",
    short: "The date on which an options contract expires and becomes worthless or is exercised.",
    detail:
      "Standard US equity options expire on the third Friday of each month. Weekly options expire every Friday. At expiration, OTM options expire worthless (seller keeps full premium); ITM options are exercised or assigned.",
    example:
      "A June 20 expiration means the option expires on the third Friday of June. If you sold a put and it's OTM at close on June 20, you keep 100% of the premium.",
    seeAlso: ["DTE", "Assignment", "Premium"],
  },
  {
    term: "DTE",
    category: "Options Basics",
    short: "Days to Expiration — the number of calendar days remaining until the option expires.",
    detail:
      "DTE is a key input for all options strategies. Theta decay accelerates as DTE approaches zero. Premium sellers typically enter at 30–45 DTE and close at 50% profit or 21 DTE. Weekly options (7 DTE) have faster decay but higher gamma risk.",
    example:
      "Entering a trade on May 1 with a June 20 expiration = 50 DTE. Closing at 21 DTE means exiting around May 30.",
    seeAlso: ["Theta", "Expiration Date", "Theta Decay"],
  },
  {
    term: "Assignment",
    category: "Options Basics",
    short: "When an option seller is required to fulfil the contract obligation — buying or selling 100 shares.",
    detail:
      "Assignment happens when the option buyer exercises their right. Short puts are assigned when the stock falls below the strike (you must buy 100 shares at the strike). Short calls are assigned when the stock rises above the strike (you must sell 100 shares). Early assignment is rare but possible for American-style options.",
    example:
      "You sold a $50 put. The stock drops to $45 and you're assigned. You must buy 100 shares at $50 (a $500 loss offset by the premium collected).",
    seeAlso: ["Put Option", "Call Option", "Naked Put"],
  },
  {
    term: "Exercise",
    category: "Options Basics",
    short: "When an option buyer chooses to use their right to buy or sell shares at the strike price.",
    detail:
      "Buyers exercise options when it's profitable to do so (ITM at expiration). Most retail traders close options before expiration rather than exercising. American-style options can be exercised any time before expiration; European-style only at expiration.",
    seeAlso: ["Assignment", "Expiration Date"],
  },
  {
    term: "Open Interest",
    category: "Options Basics",
    short: "The total number of outstanding option contracts that have not been closed or exercised.",
    detail:
      "High open interest indicates a liquid, actively traded strike. Low open interest means wide bid-ask spreads and difficulty exiting positions. Always check open interest before entering a trade — prefer strikes with OI > 100 for retail size.",
    example:
      "A strike with OI = 5,000 has 5,000 contracts outstanding. You can likely fill a 10-contract order without moving the market.",
    seeAlso: ["Volume", "Bid-Ask Spread", "Liquidity"],
  },
  {
    term: "Bid-Ask Spread",
    category: "Options Basics",
    short: "The difference between the highest price a buyer will pay (bid) and the lowest price a seller will accept (ask).",
    detail:
      "A tight spread (e.g. $0.05) means the market is liquid and you can enter/exit efficiently. A wide spread (e.g. $1.00) means you lose money to the market maker on every trade. Always use limit orders at the mid-price or better.",
    example:
      "Option bid = $2.00, ask = $2.40. Spread = $0.40. Entering at the mid ($2.20) saves $0.20 per share vs paying the ask.",
    seeAlso: ["Open Interest", "Liquidity", "Mid Price"],
  },
  {
    term: "Mid Price",
    category: "Options Basics",
    short: "The average of the bid and ask prices — the fair value estimate used for limit orders.",
    detail:
      "Always place limit orders at the mid-price or better, never market orders on options. The mid is not guaranteed to fill but is the best starting point. For illiquid options, you may need to move toward the ask (to buy) or bid (to sell).",
    example: "Bid = $1.80, Ask = $2.20. Mid = $2.00. Place a limit order to buy at $2.00.",
    seeAlso: ["Bid-Ask Spread", "Liquidity"],
  },

  // ── Strategy Terms ────────────────────────────────────────────────────────
  {
    term: "Naked Put",
    category: "Strategies",
    short: "Selling a put option without owning the underlying stock — a bullish, income-generating strategy.",
    detail:
      "You collect premium upfront. If the stock stays above the strike at expiration, you keep 100% of the premium. If the stock falls below the strike, you're assigned and must buy 100 shares at the strike price. Maximum profit = premium collected. Maximum loss = strike price − premium (stock goes to zero).",
    example:
      "Sell 1 AAPL $170 put for $3.00. Stock stays above $170 → keep $300. Stock falls to $160 → assigned, buy 100 shares at $170 (net cost $167 after premium).",
    seeAlso: ["Cash-Secured Put", "Put Option", "Assignment"],
  },
  {
    term: "Cash-Secured Put",
    category: "Strategies",
    short: "A naked put where you hold enough cash to buy the shares if assigned — a conservative income strategy.",
    detail:
      "Functionally identical to a naked put but with the full purchase price held in cash as collateral. Often used as a way to get paid to wait for a stock you want to buy at a lower price. Margin requirement = strike × 100.",
    example:
      "You want to buy MSFT at $300. Sell a $300 put for $5, hold $30,000 cash. If assigned, you buy MSFT at an effective cost of $295.",
    seeAlso: ["Naked Put", "Covered Call", "Assignment"],
  },
  {
    term: "Covered Call",
    category: "Strategies",
    short: "Selling a call option against 100 shares you already own — generates income but caps your upside.",
    detail:
      "You collect premium immediately. If the stock stays below the strike, you keep the premium and your shares. If the stock rises above the strike, your shares are called away at the strike price. Often used to generate income on a stock you're willing to sell.",
    example:
      "Own 100 AAPL shares at $175. Sell 1 $185 call for $2.50. If AAPL stays below $185, keep $250 premium. If AAPL rises to $195, shares are sold at $185 (effective sale price $187.50).",
    seeAlso: ["Naked Call", "Cash-Secured Put", "Assignment"],
  },
  {
    term: "Iron Condor",
    category: "Strategies",
    short: "A four-leg strategy combining a bull put spread and a bear call spread — profits when the stock stays in a range.",
    detail:
      "Sell an OTM put, buy a further OTM put (bull put spread) + sell an OTM call, buy a further OTM call (bear call spread). Defined risk on both sides. Maximum profit = net credit collected. Maximum loss = spread width − net credit. Best in high-IV, low-directional-bias environments.",
    example:
      "Stock = $100. Sell $90 put / buy $85 put + sell $110 call / buy $115 call for $1.50 credit. Max profit = $150. Max loss = $350 (spread $5 − $1.50 credit).",
    seeAlso: ["Bull Put Spread", "Bear Call Spread", "Short Strangle"],
  },
  {
    term: "Short Strangle",
    category: "Strategies",
    short: "Selling an OTM call and an OTM put simultaneously — collects premium from both sides but has undefined risk.",
    detail:
      "Maximum profit = total premium collected (if stock stays between the two strikes). Undefined risk on the upside (naked call) and large risk on the downside (naked put). Requires significant margin. Best in high-IV environments with neutral directional bias.",
    example:
      "Stock = $100. Sell $90 put for $2 + sell $110 call for $2 = $4 total credit. Profit if stock stays between $86 and $114 at expiration.",
    seeAlso: ["Iron Condor", "Naked Put", "Naked Call"],
  },
  {
    term: "Bull Put Spread",
    category: "Strategies",
    short: "Sell a higher-strike put and buy a lower-strike put — a bullish, defined-risk credit spread.",
    detail:
      "Net credit received upfront. Maximum profit = net credit (stock stays above short put strike). Maximum loss = spread width − net credit (stock falls below long put strike). Defined risk makes it suitable for smaller accounts.",
    example:
      "Stock = $100. Sell $95 put for $3, buy $90 put for $1 = $2 net credit. Max profit = $200. Max loss = $300 (spread $5 − $2 credit).",
    seeAlso: ["Bear Put Spread", "Iron Condor", "Naked Put"],
  },
  {
    term: "Bear Call Spread",
    category: "Strategies",
    short: "Sell a lower-strike call and buy a higher-strike call — a bearish, defined-risk credit spread.",
    detail:
      "Net credit received upfront. Maximum profit = net credit (stock stays below short call strike). Maximum loss = spread width − net credit (stock rises above long call strike).",
    example:
      "Stock = $100. Sell $105 call for $3, buy $110 call for $1 = $2 net credit. Max profit = $200. Max loss = $300.",
    seeAlso: ["Bull Put Spread", "Iron Condor", "Naked Call"],
  },
  {
    term: "Bull Call Spread",
    category: "Strategies",
    short: "Buy a lower-strike call and sell a higher-strike call — a bullish, defined-risk debit spread.",
    detail:
      "Net debit paid upfront. Maximum profit = spread width − net debit (stock rises above long call strike). Maximum loss = net debit paid. Lower cost than buying a naked call but caps the upside.",
    example:
      "Stock = $100. Buy $100 call for $5, sell $110 call for $2 = $3 net debit. Max profit = $700 (spread $10 − $3). Max loss = $300.",
    seeAlso: ["Bear Put Spread", "Bull Put Spread"],
  },
  {
    term: "Bear Put Spread",
    category: "Strategies",
    short: "Buy a higher-strike put and sell a lower-strike put — a bearish, defined-risk debit spread.",
    detail:
      "Net debit paid upfront. Maximum profit = spread width − net debit (stock falls below short put strike). Maximum loss = net debit paid.",
    example:
      "Stock = $100. Buy $100 put for $5, sell $90 put for $2 = $3 net debit. Max profit = $700. Max loss = $300.",
    seeAlso: ["Bull Call Spread", "Bear Call Spread"],
  },
  {
    term: "Long Straddle",
    category: "Strategies",
    short: "Buy a call and a put at the same strike and expiration — profits from a large move in either direction.",
    detail:
      "Maximum loss = total premium paid (if stock stays exactly at the strike). Unlimited profit potential on both sides. Best entered when IV is low (cheap options) before an expected catalyst like earnings. Loses money if the stock doesn't move enough to cover the premium paid.",
    example:
      "Stock = $100. Buy $100 call for $4 + buy $100 put for $3 = $7 total debit. Breakeven: $93 or $107. Profit if stock moves more than $7 in either direction.",
    seeAlso: ["Long Strangle", "Short Strangle", "Vega"],
  },
  {
    term: "Long Strangle",
    category: "Strategies",
    short: "Buy an OTM call and an OTM put — a cheaper version of the straddle that needs a bigger move to profit.",
    detail:
      "Lower cost than a straddle but requires a larger move to profit. Maximum loss = total premium paid. Unlimited upside on the call side, large downside on the put side. Best before high-volatility events when options are still relatively cheap.",
    example:
      "Stock = $100. Buy $105 call for $2 + buy $95 put for $2 = $4 total debit. Breakeven: $91 or $109.",
    seeAlso: ["Long Straddle", "Short Strangle"],
  },
  {
    term: "Butterfly Spread",
    category: "Strategies",
    short: "A three-strike strategy that profits when the stock pins near the middle strike at expiration.",
    detail:
      "Buy 1 lower-strike option, sell 2 middle-strike options, buy 1 higher-strike option (all same type and expiry). Maximum profit at the middle strike. Defined risk on both sides. Low cost, high reward-to-risk ratio if the stock lands exactly on the short strike.",
    example:
      "Stock = $100. Buy $95 call, sell 2× $100 calls, buy $105 call. Net debit = $1. Max profit = $4 if stock = $100 at expiry.",
    seeAlso: ["Iron Condor", "Long Straddle"],
  },

  // ── Risk & Position Management ────────────────────────────────────────────
  {
    term: "Probability of Profit",
    symbol: "POP",
    category: "Risk Management",
    short: "The estimated probability that a trade will be profitable at expiration.",
    detail:
      "Calculated from the delta of the short strike(s). For a short put at 0.30 delta, POP ≈ 70%. Higher POP means lower premium collected per trade. Tastytrade targets 60–70% POP for most premium-selling strategies. POP does not account for early management.",
    example:
      "Selling a 0.20-delta put has POP ≈ 80% — it will expire worthless 80% of the time in theory.",
    seeAlso: ["Delta", "Expected Value", "Max Loss"],
  },
  {
    term: "Max Profit",
    category: "Risk Management",
    short: "The maximum dollar amount a trade can make — achieved when all options expire worthless (for credit strategies).",
    detail:
      "For credit strategies (short puts, iron condors), max profit = net premium collected. For debit strategies (long straddles), max profit is theoretically unlimited on the call side. Tastytrade recommends closing at 50% of max profit to improve win rate.",
    seeAlso: ["Max Loss", "Net Credit", "Breakeven"],
  },
  {
    term: "Max Loss",
    category: "Risk Management",
    short: "The maximum dollar amount a trade can lose — the worst-case scenario.",
    detail:
      "Defined-risk strategies (spreads, iron condors) have a known max loss = spread width − premium collected. Undefined-risk strategies (naked puts/calls, strangles) have theoretically unlimited max loss. Always size positions so max loss is within your risk tolerance.",
    example:
      "Bull put spread: $5 wide, $2 credit. Max loss = ($5 − $2) × 100 = $300 per contract.",
    seeAlso: ["Max Profit", "Defined Risk", "Breakeven"],
  },
  {
    term: "Breakeven",
    category: "Risk Management",
    short: "The stock price at which a trade neither makes nor loses money at expiration.",
    detail:
      "For a short put: Breakeven = Strike − Premium. For a short call: Breakeven = Strike + Premium. For an iron condor: two breakevens (one on each side). Knowing your breakeven helps you assess whether the stock needs to move significantly against you before you lose money.",
    example:
      "Sell $100 put for $3. Breakeven = $100 − $3 = $97. You lose money only if the stock falls below $97.",
    seeAlso: ["Max Loss", "Premium", "Probability of Profit"],
  },
  {
    term: "Defined Risk",
    category: "Risk Management",
    short: "A strategy where the maximum possible loss is known and capped at entry.",
    detail:
      "Spreads (bull put, bear call, iron condor, butterfly) are defined-risk because the long leg caps the loss. Naked options are undefined-risk. Defined-risk strategies require less margin and are safer for smaller accounts.",
    seeAlso: ["Max Loss", "Iron Condor", "Bull Put Spread"],
  },
  {
    term: "Buying Power / Margin",
    symbol: "BP",
    category: "Risk Management",
    short: "The amount of capital required by your broker to hold an options position.",
    detail:
      "Defined-risk strategies require margin = max loss (spread width − credit). Undefined-risk strategies (naked options) require much more margin — typically 20% of the stock price. Tastytrade uses portfolio margin which can reduce requirements significantly.",
    example:
      "Iron condor with $5 spread, $1.50 credit. BP required = ($5 − $1.50) × 100 = $350 per contract.",
    seeAlso: ["Defined Risk", "Max Loss"],
  },
  {
    term: "Net Credit",
    category: "Risk Management",
    short: "The total premium received when entering a credit strategy — your maximum profit.",
    detail:
      "Net credit = sum of all premiums received minus premiums paid. For an iron condor: (short put premium + short call premium) − (long put premium + long call premium). This is the amount you receive in your account immediately upon entering the trade.",
    seeAlso: ["Premium", "Max Profit", "Breakeven"],
  },

  // ── Technical Analysis ────────────────────────────────────────────────────
  {
    term: "RSI",
    symbol: "RSI-14",
    category: "Technical Analysis",
    short: "Relative Strength Index — a momentum oscillator measuring whether a stock is overbought or oversold.",
    detail:
      "RSI ranges from 0 to 100. RSI > 70 is traditionally considered overbought (potential pullback); RSI < 30 is oversold (potential bounce). Calculated over 14 periods by default. For options traders, RSI helps assess directional bias — a bearish RSI reading may favour put spreads over call spreads.",
    example:
      "Stock RSI = 78. Overbought signal — consider bearish strategies (bear call spread) or wait for a pullback before selling puts.",
    seeAlso: ["MACD", "Directional Bias"],
  },
  {
    term: "MACD",
    category: "Technical Analysis",
    short: "Moving Average Convergence Divergence — a trend-following momentum indicator.",
    detail:
      "MACD Line = 12-period EMA − 26-period EMA. Signal Line = 9-period EMA of MACD. Histogram = MACD − Signal. A bullish crossover (MACD crosses above Signal) suggests upward momentum; bearish crossover suggests downward. Used in this app to determine directional bias for strategy scoring.",
    example:
      "MACD crosses above Signal line → bullish bias → bull put spreads and covered calls score higher.",
    seeAlso: ["RSI", "Directional Bias", "EMA"],
  },
  {
    term: "EMA",
    category: "Technical Analysis",
    short: "Exponential Moving Average — a moving average that gives more weight to recent prices.",
    detail:
      "Unlike a simple moving average (SMA), EMA reacts faster to recent price changes. Used in MACD calculation (12-period and 26-period EMAs). Also used to determine trend direction — price above the 50-day EMA is generally bullish.",
    seeAlso: ["MACD", "SMA"],
  },
  {
    term: "SMA",
    category: "Technical Analysis",
    short: "Simple Moving Average — the arithmetic mean of closing prices over a specified number of periods.",
    detail:
      "SMA is slower to react than EMA but less noisy. Common periods: 20-day (short-term trend), 50-day (medium-term), 200-day (long-term). Price above the 200-day SMA is a classic bull market signal.",
    seeAlso: ["EMA", "MACD"],
  },
  {
    term: "Directional Bias",
    category: "Technical Analysis",
    short: "Whether the current technical signals suggest the stock is more likely to move up, down, or sideways.",
    detail:
      "Determined by combining MACD crossover direction, RSI level, and price vs moving averages. Bullish bias favours bull put spreads, cash-secured puts, covered calls. Bearish bias favours bear call spreads, bear put spreads. Neutral bias favours iron condors and strangles.",
    seeAlso: ["RSI", "MACD", "Iron Condor"],
  },

  // ── Market Concepts ───────────────────────────────────────────────────────
  {
    term: "Theta Decay",
    category: "Market Concepts",
    short: "The daily erosion of an option's extrinsic value as it approaches expiration.",
    detail:
      "Theta decay is non-linear — it accelerates dramatically in the final 30 days. This is why premium sellers prefer to enter at 30–45 DTE and close at 21 DTE (before the gamma risk of the final weeks). The 'sweet spot' for theta collection is between 30 and 45 DTE.",
    seeAlso: ["Theta", "DTE", "Extrinsic Value"],
  },
  {
    term: "Delta Neutral",
    category: "Market Concepts",
    short: "A position where the aggregate delta is near zero — profits from time decay or volatility changes rather than direction.",
    detail:
      "Iron condors and short strangles are approximately delta-neutral at entry. As the stock moves, delta drifts and the position becomes directional. Traders may adjust (roll) to restore delta neutrality.",
    seeAlso: ["Delta", "Iron Condor", "Short Strangle"],
  },
  {
    term: "Pin Risk",
    category: "Market Concepts",
    short: "The risk that a stock closes exactly at a short strike at expiration, creating uncertainty about assignment.",
    detail:
      "If the stock closes at your short strike at expiration, you don't know whether you'll be assigned until after the market closes. This can result in unexpected overnight stock positions. Avoid holding short options into expiration when the stock is near your strike.",
    seeAlso: ["Assignment", "Gamma", "Expiration Date"],
  },
  {
    term: "Roll",
    category: "Market Concepts",
    short: "Closing an existing options position and opening a new one at a different strike or expiration.",
    detail:
      "Rolling out (to a later expiration) collects more premium and gives the trade more time to work. Rolling down (to a lower strike for puts) reduces the breakeven but may collect less credit. Rolling is a key adjustment technique for managing losing trades.",
    example:
      "Your short put is tested. Roll it out 30 days and down $5 to collect an additional $0.50 credit and lower your breakeven.",
    seeAlso: ["Breakeven", "DTE", "Assignment"],
  },
  {
    term: "Liquidity",
    category: "Market Concepts",
    short: "How easily an options contract can be bought or sold without significantly moving its price.",
    detail:
      "Liquid options have tight bid-ask spreads, high open interest (>500), and high daily volume. Illiquid options have wide spreads and are difficult to exit at a fair price. Always check liquidity before entering a trade — illiquidity is a hidden cost.",
    seeAlso: ["Bid-Ask Spread", "Open Interest", "Volume"],
  },
  {
    term: "Volume",
    category: "Market Concepts",
    short: "The number of option contracts traded on a given day.",
    detail:
      "High volume indicates active interest in a strike. Unlike open interest (cumulative), volume resets daily. A sudden spike in volume at a specific strike can signal institutional positioning or informed trading.",
    seeAlso: ["Open Interest", "Liquidity"],
  },
  {
    term: "Expected Value",
    category: "Market Concepts",
    short: "The probability-weighted average outcome of a trade — the theoretical edge over many repetitions.",
    detail:
      "EV = (POP × Max Profit) − ((1 − POP) × Max Loss). A positive EV trade is theoretically profitable over many repetitions. Premium selling strategies often have positive EV because IV consistently overestimates actual moves (IV > RV on average).",
    example:
      "POP = 70%, Max Profit = $200, Max Loss = $300. EV = (0.70 × $200) − (0.30 × $300) = $140 − $90 = +$50 per trade.",
    seeAlso: ["Probability of Profit", "Max Loss", "Max Profit"],
  },
];

// ─── Categories ───────────────────────────────────────────────────────────────
const ALL_CATEGORIES = Array.from(new Set(ENTRIES.map(e => e.category)));

// ─── Glossary page ────────────────────────────────────────────────────────────
export default function Glossary() {
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    return ENTRIES.filter(e => {
      const matchesSearch =
        !q ||
        e.term.toLowerCase().includes(q) ||
        e.short.toLowerCase().includes(q) ||
        e.detail.toLowerCase().includes(q) ||
        (e.symbol?.toLowerCase().includes(q) ?? false) ||
        (e.example?.toLowerCase().includes(q) ?? false);
      const matchesCategory = !activeCategory || e.category === activeCategory;
      return matchesSearch && matchesCategory;
    });
  }, [query, activeCategory]);

  // Group by category
  const grouped = useMemo(() => {
    const map: Record<string, GlossaryEntry[]> = {};
    for (const e of filtered) {
      if (!map[e.category]) map[e.category] = [];
      map[e.category].push(e);
    }
    return map;
  }, [filtered]);

  function toggleExpand(term: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(term)) next.delete(term);
      else next.add(term);
      return next;
    });
  }

  const CATEGORY_COLORS: Record<string, string> = {
    "Greeks": "bg-violet-100 text-violet-700 border-violet-200",
    "Volatility": "bg-amber-100 text-amber-700 border-amber-200",
    "Options Basics": "bg-blue-100 text-blue-700 border-blue-200",
    "Strategies": "bg-emerald-100 text-emerald-700 border-emerald-200",
    "Risk Management": "bg-rose-100 text-rose-700 border-rose-200",
    "Technical Analysis": "bg-cyan-100 text-cyan-700 border-cyan-200",
    "Market Concepts": "bg-orange-100 text-orange-700 border-orange-200",
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-primary" />
          <h1 className="text-2xl font-bold tracking-tight">Trading Glossary</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          {ENTRIES.length} terms across {ALL_CATEGORIES.length} categories — from Greeks to strategies to risk management.
        </p>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          placeholder="Search terms, definitions, examples…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          className="pl-9 h-10"
          autoFocus
        />
        {query && (
          <button
            onClick={() => setQuery("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Clear
          </button>
        )}
      </div>

      {/* Category filter pills */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setActiveCategory(null)}
          className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
            !activeCategory
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-muted text-muted-foreground border-border hover:border-primary/40"
          }`}
        >
          All ({ENTRIES.length})
        </button>
        {ALL_CATEGORIES.map(cat => {
          const count = ENTRIES.filter(e => e.category === cat).length;
          const isActive = activeCategory === cat;
          return (
            <button
              key={cat}
              onClick={() => setActiveCategory(isActive ? null : cat)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                isActive
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-muted text-muted-foreground border-border hover:border-primary/40"
              }`}
            >
              {cat} ({count})
            </button>
          );
        })}
      </div>

      {/* Results count */}
      {query && (
        <p className="text-xs text-muted-foreground">
          {filtered.length === 0
            ? "No terms match your search."
            : `${filtered.length} term${filtered.length !== 1 ? "s" : ""} found`}
        </p>
      )}

      {/* Grouped entries */}
      {Object.entries(grouped).map(([category, entries]) => (
        <div key={category} className="space-y-2">
          <div className="flex items-center gap-2 sticky top-0 bg-background/95 backdrop-blur-sm py-1 z-10">
            <Badge variant="outline" className={`text-xs font-semibold ${CATEGORY_COLORS[category] ?? ""}`}>
              {category}
            </Badge>
            <span className="text-xs text-muted-foreground">{entries.length} term{entries.length !== 1 ? "s" : ""}</span>
          </div>

          <div className="space-y-1.5">
            {entries.map(entry => {
              const isOpen = expanded.has(entry.term);
              return (
                <Card
                  key={entry.term}
                  className={`border-border/50 transition-all duration-200 ${isOpen ? "shadow-sm" : "hover:border-primary/30"}`}
                >
                  <button
                    className="w-full text-left"
                    onClick={() => toggleExpand(entry.term)}
                    aria-expanded={isOpen}
                  >
                    <div className="flex items-start justify-between gap-3 px-4 py-3">
                      <div className="flex items-center gap-2 min-w-0">
                        {entry.symbol && (
                          <span className="text-sm font-bold text-primary shrink-0 w-6 text-center">
                            {entry.symbol}
                          </span>
                        )}
                        <div className="min-w-0">
                          <span className="font-semibold text-sm text-foreground">{entry.term}</span>
                          {!isOpen && (
                            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{entry.short}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge variant="outline" className={`text-[10px] hidden sm:inline-flex ${CATEGORY_COLORS[category] ?? ""}`}>
                          {category}
                        </Badge>
                        {isOpen
                          ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
                          : <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        }
                      </div>
                    </div>
                  </button>

                  {isOpen && (
                    <CardContent className="px-4 pb-4 pt-0 space-y-3 border-t border-border/30">
                      {/* Short definition */}
                      <p className="text-sm font-medium text-foreground pt-3">{entry.short}</p>

                      {/* Detailed explanation */}
                      <p className="text-sm text-muted-foreground leading-relaxed">{entry.detail}</p>

                      {/* Example */}
                      {entry.example && (
                        <div className="rounded-md bg-primary/5 border border-primary/10 px-3 py-2">
                          <p className="text-[11px] font-semibold text-primary uppercase tracking-wider mb-1">Example</p>
                          <p className="text-xs text-foreground/80 leading-relaxed">{entry.example}</p>
                        </div>
                      )}

                      {/* See also */}
                      {entry.seeAlso && entry.seeAlso.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-[11px] text-muted-foreground font-medium">See also:</span>
                          {entry.seeAlso.map(related => (
                            <button
                              key={related}
                              onClick={e => {
                                e.stopPropagation();
                                setQuery(related);
                                setActiveCategory(null);
                                setExpanded(prev => {
                                  const next = new Set(prev);
                                  next.add(related);
                                  return next;
                                });
                                // Scroll to top
                                window.scrollTo({ top: 0, behavior: "smooth" });
                              }}
                              className="text-[11px] px-2 py-0.5 rounded-full bg-muted hover:bg-primary/10 hover:text-primary border border-border/50 transition-colors"
                            >
                              {related}
                            </button>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  )}
                </Card>
              );
            })}
          </div>
        </div>
      ))}

      {filtered.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <BookOpen className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No terms found</p>
          <p className="text-sm mt-1">Try a different search term or clear the category filter.</p>
        </div>
      )}
    </div>
  );
}
