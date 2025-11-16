# analysis/procurement_analyzer.py
import pandas as pd
import numpy as np
import sys
import time
from pathlib import Path
from typing import List, Optional

# Add parent directory to path to import forecaster
sys.path.append(str(Path(__file__).parent.parent))
from steelpriceforecaster import get_forecaster


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
    Lock hedge_ratio of each month's demand at hedge_curve[m] (+ basis noise if provided);
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
        "p95_$M": np.percentile(arr, 95) / 1e6,
        "p05_$M": np.percentile(arr, 5) / 1e6,
        "std_$M": arr.std() / 1e6,
    }


def create_demand_profile(total_steel: float, months: int, demand_distribution: Optional[List[float]] = None) -> np.ndarray:
    """
    Create demand profile across months.
    
    Args:
        total_steel: Total steel required in tons
        months: Number of months (H)
        demand_distribution: Optional list of weights for each month (must sum to 1.0)
                           If None, distributes evenly across last 3 months
    
    Returns:
        numpy array of demand per month
    """
    demand = np.zeros(months)
    
    if demand_distribution is not None:
        # Use provided distribution
        if len(demand_distribution) != months:
            raise ValueError(f"demand_distribution must have length {months}")
        if abs(sum(demand_distribution) - 1.0) > 0.01:
            raise ValueError("demand_distribution must sum to 1.0")
        demand = np.array(demand_distribution) * total_steel
    else:
        # Default: distribute evenly across last 3 months
        if months >= 3:
            demand[-3:] = [total_steel / 3.0] * 3
            # Adjust for rounding
            remainder = total_steel - demand.sum()
            if remainder != 0:
                demand[-1] += remainder
        else:
            # If fewer than 3 months, put all in last month
            demand[-1] = total_steel
    
    return demand


def run_procurement_analysis(
    scenario: str = 'baseline',
                             months: int = 12,
                             base_price_2024: float = 700.0,
    total_steel: float = 10000.0,
    demand_distribution: Optional[List[float]] = None,
                             sims: int = 10000,
                             vol: float = 0.05,
    hedge_ratio: float = 0.70,
    basis_mu: float = 0.0,
    basis_sigma: float = 0.0,
    seed: int = 7
):
    """
    Complete Monte Carlo procurement analysis workflow:
    1. Get forecast from ARIMA model
    2. Convert to $/ton prices
    3. Run Monte Carlo simulations
    4. Calculate costs for each strategy
    5. Return summary statistics
    
    Args:
        scenario: Forecast scenario ('baseline', 'optimistic', 'pessimistic')
        months: Number of forecast months
        base_price_2024: Base price in $/ton when index=100 (2024 base)
        total_steel: Total steel required in tons
        demand_distribution: Optional list of weights for each month (must sum to 1.0)
        sims: Number of Monte Carlo simulations
        vol: Monthly volatility (e.g., 0.05 = 5%)
        hedge_ratio: Hedge ratio for hedge strategy (0..1)
        basis_mu: Basis mean ($/ton) for hedge
        basis_sigma: Basis stdev ($/ton) for hedge
        seed: Random seed
    
    Returns:
        Dictionary with summary statistics for each strategy
    """
    start_time = time.time()
    # 1) Get forecast from ARIMA model (cached, should be fast)
    forecaster = get_forecaster()
    t1 = time.time()
    forecast_data = forecaster.forecast(scenario, months)
    t2 = time.time()
    print(f"[TIMING] Forecast: {t2-t1:.3f}s")
    
    # Convert forecast indices directly to prices ($/ton)
    # The forecast returns steel_price_index (1982=100 base)
    # Convert to $/ton: price = (index / 100.0) * base_price_2024
    baseline = np.array([
        (f['steel_price_index'] / 100.0) * base_price_2024
        for f in forecast_data
    ], dtype=np.float64)
    
    H = len(baseline)
    today_price = float(baseline[0])
    hedge_curve = baseline.copy()
    
    # 2) Create demand profile
    demand = create_demand_profile(total_steel, H, demand_distribution)
    
    # 3) Ladder schedule: four tranches (T-9, T-6, T-3, T-0 relative to end)
    ladder_months = [max(0, m) for m in [H-9, H-6, H-3, H-1]]
    
    # 4) Simulate prices around the baseline
    t3 = time.time()
    prices = simulate_price_paths(baseline, vol, sims, seed=seed)  # shape: (sims, H)
    t4 = time.time()
    print(f"[TIMING] Price simulation: {t4-t3:.3f}s")
    
    # 5) Run strategies across simulations (vectorized where possible)
    rng = np.random.default_rng(seed + 1)
    
    # Spot Now: same for all simulations (buy at today's price)
    buy_now_costs = np.full(sims, cost_buy_now(today_price, demand), dtype=float)
    
    # Spot Later: vectorized - prices[s] * demand for each simulation
    spot_costs = np.sum(prices * demand, axis=1).astype(float)
    
    # Pre-compute basis for hedge (if needed)
    if basis_sigma > 0:
        basis_all = rng.normal(basis_mu, basis_sigma, size=(sims, H))
    else:
        basis_all = np.zeros((sims, H))
    
    # Vectorized hedge calculation
    hedged_tons = demand * hedge_ratio
    unhedged_tons = demand - hedged_tons
    hedge_curve_expanded = np.tile(hedge_curve, (sims, 1))
    hedged_costs_all = np.sum(hedged_tons * (hedge_curve_expanded + basis_all), axis=1)
    unhedged_costs_all = np.sum(unhedged_tons * prices, axis=1)
    hedge_costs = (hedged_costs_all + unhedged_costs_all).astype(float)
    
    # Vectorized ladder calculation
    ladder_fracs = np.array([0.25, 0.25, 0.25, 0.25])
    # Create a matrix: for each delivery month m, which buy month to use for each ladder tranche
    # Shape: (H, 4) where [m, i] = buy month for delivery month m, ladder tranche i
    buy_month_matrix = np.zeros((H, 4), dtype=int)
    for m in range(H):
        for i, t in enumerate(ladder_months):
            buy_month = t if t <= m else m
            buy_month = min(max(buy_month, 0), H-1)
            buy_month_matrix[m, i] = buy_month
    
    # For each simulation, calculate ladder cost
    # prices shape: (sims, H)
    # demand shape: (H,)
    # buy_month_matrix shape: (H, 4)
    # We need: for each sim s, for each delivery month m, for each ladder tranche i:
    #   cost += demand[m] * ladder_fracs[i] * prices[s, buy_month_matrix[m, i]]
    
    ladder_costs = np.zeros(sims, dtype=float)
    for i, frac in enumerate(ladder_fracs):
        # Get prices at buy months for this ladder tranche
        # prices[:, buy_month_matrix[:, i]] gives us (sims, H) array
        buy_prices = prices[:, buy_month_matrix[:, i]]  # (sims, H)
        # Multiply by demand and fraction, sum over months
        ladder_costs += np.sum(buy_prices * demand * frac, axis=1)
    
    t5 = time.time()
    print(f"[TIMING] Strategy calculations: {t5-t4:.3f}s")
    
    # 6) Summaries
    summary = pd.DataFrame.from_dict({
        "Spot Now": summarize(buy_now_costs),
        "Spot Later": summarize(spot_costs),
        "Ladder": summarize(ladder_costs),
        "Hedge": summarize(hedge_costs),
    }, orient="index").round(3)
    
    # Convert to dictionary format for JSON serialization
    summary_dict = {}
    for strategy in summary.index:
        summary_dict[strategy] = {
            "mean_$M": float(summary.loc[strategy, "mean_$M"]),
            "p95_$M": float(summary.loc[strategy, "p95_$M"]),
            "p05_$M": float(summary.loc[strategy, "p05_$M"]),
            "std_$M": float(summary.loc[strategy, "std_$M"]),
        }
    
    total_time = time.time() - start_time
    print(f"[TIMING] Total time: {total_time:.3f}s")
    
    return {
        'scenario': scenario,
        'summary': summary_dict,
        'total_steel': total_steel,
        'months': months
    }


# Test function
if __name__ == '__main__':
    print("="*70)
    print("TESTING PROCUREMENT ANALYSIS")
    print("="*70)
    
    # Test with baseline scenario
    results = run_procurement_analysis(
        scenario='baseline',
        months=12,
        base_price_2024=700.0,
        total_steel=10000.0,
        sims=1000  # Fewer for testing
    )
    
    print("\n" + "="*70)
    print("RESULTS")
    print("="*70)
    print(pd.DataFrame(results['summary']))
