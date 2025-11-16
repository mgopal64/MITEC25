import random
import os
import sys
import time
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import seaborn as sns
import argparse
from pathlib import Path


MONTH_MAP = {"Jan":1,"Feb":2,"Mar":3,"Apr":4,"May":5,"Jun":6,
             "Jul":7,"Aug":8,"Sep":9,"Oct":10,"Nov":11,"Dec":12}

def read_baseline_prices(csv_path: Path, base_price_2024: float) -> pd.Series:
    """
    Read a CSV with columns:
      - Month (e.g., Jan, Feb, ...)
      - Year  (int)
      - Steel_Price_Index_(1982=100)  (float)
    Convert the index to $/ton using base_price_2024 (i.e., when index=100).
    Returns the last 12 months as a pandas Series of $/ton (baseline path).
    """
    df = pd.read_csv(csv_path)
    if not {"Month","Year","Steel_Price_Index_(1982=100)"} <= set(df.columns):
        raise ValueError("CSV must contain Month, Year, Steel_Price_Index_(1982=100) columns")

    df["MonthNum"] = df["Month"].map(MONTH_MAP)
    df["Date"] = pd.to_datetime(dict(year=df["Year"], month=df["MonthNum"], day=1))
    df = df.sort_values("Date").reset_index(drop=True)

    idx_col = "Steel_Price_Index_(1982=100)"
    df["Price_per_ton"] = (df[idx_col] / 100.0) * base_price_2024

    last12 = df.tail(12).copy()
    return last12["Price_per_ton"].reset_index(drop=True)

def simulate_price_paths(base_price: np.ndarray, vol_monthly: float, n_sims: int, seed: int = 7) -> np.ndarray:
    """
    Zero-mean Monte Carlo noise around the provided baseline path (shape: H).
    Returns an array of shape (n_sims, H).
    """
    rng = np.random.default_rng(seed)
    H = len(base_price)
    shocks = rng.normal(0.0, 1.0, size=(n_sims, H))
    rets = vol_monthly * shocks
    prices = base_price * (1.0 + rets)
    return np.clip(prices, 1e-6, None)

# --- Strategies (costs per simulation path) ---

def cost_buy_now(today_price: float, demand: np.ndarray) -> float:
    return float(today_price * demand.sum())

def cost_spot(prices_s: np.ndarray, demand: np.ndarray) -> float:
    return float((prices_s * demand).sum())

def cost_ladder(prices_s: np.ndarray, demand: np.ndarray, ladder_months: list[int]) -> float:
    """
    For each delivery month m with demand D_m, buy 25% at each ladder month t in ladder_months
    if t <= m (pre-buy), otherwise buy at m (can't pre-buy after the fact).
    """
    ladder_fracs = np.array([0.25, 0.25, 0.25, 0.25])
    H = len(prices_s)
    cost = 0.0
    for m in range(H):
        Dm = demand[m]
        if Dm <= 0:
            continue
        for frac, t in zip(ladder_fracs, ladder_months):
            buy_month = t if t <= m else m
            buy_month = min(max(buy_month, 0), H-1)
            cost += Dm * frac * prices_s[buy_month]
    return float(cost)

def cost_hedge(prices_s: np.ndarray, demand: np.ndarray, hedge_curve: np.ndarray,
               hedge_ratio: float, basis_mu: float = 0.0, basis_sigma: float = 0.0,
               rng: np.random.Generator | None = None) -> float:
    """
    Lock hedge_ratio of each month’s demand at hedge_curve[m] (+ basis noise if provided);
    remaining (1-hedge_ratio) is bought at spot.
    """
    if rng is None:
        rng = np.random.default_rng(123)
    H = len(prices_s)
    hedged_tons = demand * hedge_ratio
    unhedged_tons = demand - hedged_tons
    basis = rng.normal(basis_mu, basis_sigma, size=H) if basis_sigma > 0 else np.zeros(H)
    hedged_cost = float((hedged_tons * (hedge_curve + basis)).sum())
    unhedged_cost = float((unhedged_tons * prices_s).sum())
    return hedged_cost + unhedged_cost

def summarize(arr: np.ndarray) -> dict:
    return {
        "mean_$M": arr.mean() / 1e6,
        "p95_$M":  np.percentile(arr, 95) / 1e6,
        "p05_$M":  np.percentile(arr, 5)  / 1e6,
        "std_$M":  arr.std() / 1e6,
    }

# -----------------------------
# Main
# -----------------------------
def main():
    ap = argparse.ArgumentParser(description="Steel procurement scenarios from CSV index.")
    ap.add_argument("--csv", required=True, type=Path, help="Path to CSV with Month, Year, Steel_Price_Index_(1982=100)")
    ap.add_argument("--base-price-2024", type=float, default=700.0, help="$/ton when index=100 (1982 base)")
    ap.add_argument("--sims", type=int, default=10_000, help="Number of Monte Carlo simulations")
    ap.add_argument("--vol", type=float, default=0.05, help="Monthly volatility (e.g., 0.05 = 5%)")
    ap.add_argument("--hedge-ratio", type=float, default=0.70, help="Hedge ratio for hedge strategy (0..1)")
    ap.add_argument("--basis-mu", type=float, default=0.0, help="Basis mean ($/ton) for hedge")
    ap.add_argument("--basis-sigma", type=float, default=0.0, help="Basis stdev ($/ton) for hedge")
    ap.add_argument("--seed", type=int, default=7, help="Random seed")
    ap.add_argument("--no-plots", action="store_true", help="Skip plotting")
    ap.add_argument("--outdir", type=Path, default=Path("."), help="Output directory for CSVs/plots")
    args = ap.parse_args()

    # 1) Baseline $/ton for the last 12 months of the CSV
    baseline = read_baseline_prices(args.csv, args.base_price_2024).to_numpy()  # shape: (H,)
    H = len(baseline)
    today_price = float(baseline[0])
    hedge_curve = baseline.copy()  # you can replace with a true forward curve if you have one

    # 2) Demand profile (edit as needed)
    demand = np.zeros(H)
    # Example: all demand in the final 3 months; totals 10,000 tons
    demand[-3:] = [3333, 3333, 3334]

    # Ladder schedule: four tranches (T-9, T-6, T-3, T-0 relative to end)
    ladder_months = [max(0, m) for m in [H-9, H-6, H-3, H-1]]

    # 3) Simulate prices around the baseline
    prices = simulate_price_paths(baseline, args.vol, args.sims, seed=args.seed)

    # 4) Run strategies across simulations
    rng = np.random.default_rng(args.seed + 1)

    buy_now_costs = np.full(args.sims, cost_buy_now(today_price, demand), dtype=float)
    spot_costs    = np.empty(args.sims, dtype=float)
    ladder_costs  = np.empty(args.sims, dtype=float)
    hedge_costs   = np.empty(args.sims, dtype=float)

    for s in range(args.sims):
        ps = prices[s]
        spot_costs[s]   = cost_spot(ps, demand)
        ladder_costs[s] = cost_ladder(ps, demand, ladder_months)
        hedge_costs[s]  = cost_hedge(ps, demand, hedge_curve, args.hedge_ratio,
                                     basis_mu=args.basis_mu, basis_sigma=args.basis_sigma,
                                     rng=rng)

    # 5) Summaries
    summary = pd.DataFrame.from_dict({
        "Spot Now": summarize(buy_now_costs),
        "Spot Later":   summarize(spot_costs),
        "Ladder": summarize(ladder_costs),
        "Hedge":  summarize(hedge_costs),
    }, orient="index").round(3)

    # 6) Save outputs
    args.outdir.mkdir(parents=True, exist_ok=True)
    summary_path = args.outdir / "strategy_summary.csv"
    raw_path = args.outdir / "strategy_raw_costs.csv"
    baseline_path = args.outdir / "baseline_prices.csv"

    summary.to_csv(summary_path, index=True)
    pd.DataFrame({
        "buy_now": buy_now_costs,
        "spot": spot_costs,
        "ladder": ladder_costs,
        "hedge": hedge_costs
    }).to_csv(raw_path, index=False)
    pd.DataFrame({"baseline_$per_ton": baseline}).to_csv(baseline_path, index=False)

    print("\nStrategy Cost Summary ($ millions)")
    print(summary)
    print(f"\nSaved: {summary_path}")
    print(f"Saved: {raw_path}")
    print(f"Saved: {baseline_path}")

    # 7) Optional plots
    if not args.no_plots:
        plt.figure(figsize=(6,4))
        plt.title("Baseline Price ($/ton)")
        plt.plot(baseline)
        plt.xlabel("Month (1..12)")
        plt.ylabel("$/ton")
        plt.tight_layout()
        plt.show()

        plt.figure(figsize=(6,4))
        plt.title("Cost Distributions (Spot vs Hedge)")
        plt.hist(spot_costs/1e6, bins=40, alpha=0.6, label="Spot")
        plt.hist(hedge_costs/1e6, bins=40, alpha=0.6, label="Hedge")
        plt.xlabel("$ millions")
        plt.ylabel("Frequency")
        plt.legend()
        plt.tight_layout()
        plt.show()



if __name__ == "__main__":
    main()
