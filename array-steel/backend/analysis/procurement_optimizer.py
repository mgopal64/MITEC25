import pandas as pd
import numpy as np
from geopy.distance import geodesic
import requests
import time
import pulp
import os
from pathlib import Path

# Transportation cost and emissions factors (averages)
LAND_TRANSPORT_COST_PER_TON_KM = 0.15  # USD per ton per km (trucking average)
SEA_TRANSPORT_COST_PER_TON_KM = 0.02   # USD per ton per km (shipping average)
LAND_TRANSPORT_EMISSIONS_PER_TON_KM = 0.062  # kg CO2 per ton per km (trucking average)
SEA_TRANSPORT_EMISSIONS_PER_TON_KM = 0.008   # kg CO2 per ton per km (shipping average)

# Major US ports (name, lat, lon)
PORTS = [
    {"name": "Mobile", "coords": (30.7122, -88.0433)},
    {"name": "Houston", "coords": (29.717, -95.250)},
    {"name": "New Orleans", "coords": (29.9355, -90.0572)},
    {"name": "Los Angeles", "coords": (33.73, -118.2625)},
    {"name": "Long Beach", "coords": (33.7549, -118.2143)}
]

# City coordinates cache
CITY_COORDS = {
    ('Phoenix', 'Arizona'): (33.4484, -112.0740),
    ('Los Angeles', 'California'): (34.0522, -118.2437),
    ('San Francisco', 'California'): (37.7749, -122.4194),
    ('San Diego', 'California'): (32.7157, -117.1611),
    ('New York', 'New York'): (40.7128, -74.0060),
    ('Chicago', 'Illinois'): (41.8781, -87.6298),
    ('Houston', 'Texas'): (29.7604, -95.3698),
    ('Dallas', 'Texas'): (32.7767, -96.7970),
    ('Austin', 'Texas'): (30.2672, -97.7431),
    ('Seattle', 'Washington'): (47.6062, -122.3321),
    ('Portland', 'Oregon'): (45.5152, -122.6784),
    ('Denver', 'Colorado'): (39.7392, -104.9903),
    ('Miami', 'Florida'): (25.7617, -80.1918),
    ('Atlanta', 'Georgia'): (33.7490, -84.3880),
    ('Boston', 'Massachusetts'): (42.3601, -71.0589),
    ('Detroit', 'Michigan'): (42.3314, -83.0458),
    ('Ann Arbor', 'Michigan'): (42.2808, -83.7430),
    ('Philadelphia', 'Pennsylvania'): (39.9526, -75.1652),
    ('Minneapolis', 'Minnesota'): (44.9778, -93.2650),
    ('Las Vegas', 'Nevada'): (36.1699, -115.1398),
}

# Global variables for loaded data (loaded once)
_df = None
_ports_calculated = False

def geocode_city_state(city, state):
    """
    Get coordinates for a city/state.
    - On localhost: tries API, falls back to cache
    - On Render: uses cache only
    """
    key = (city, state)
    is_local = os.getenv('RENDER') is None
    
    # Try cache first
    if key in CITY_COORDS:
        return CITY_COORDS[key]
    
    # Only try API on localhost
    if is_local:
        try:
            url = "https://nominatim.openstreetmap.org/search"
            params = {'city': city, 'state': state, 'country': 'USA', 'format': 'json', 'limit': 1}
            headers = {'User-Agent': 'MITEC/1.0'}
            time.sleep(1)  # Rate limit
            r = requests.get(url, params=params, headers=headers, timeout=5)
            if r.status_code == 200 and r.json():
                data = r.json()
                return (float(data[0]['lat']), float(data[0]['lon']))
        except Exception as e:
            print(f"[GEOCODE] API failed: {e}")
    
    # Fallback
    return (39.8283, -98.5795)

def get_driving_distance(origin, destination, api_key=None):
    """
    Calculate driving distance.
    - On localhost: tries OSRM API, falls back to geodesic
    - On Render: uses geodesic approximation (great circle * 1.3)
    """
    is_local = os.getenv('RENDER') is None
    
    # On Render, skip API and use approximation
    if not is_local:
        return geodesic(origin, destination).kilometers * 1.3
    
    # On localhost, try API
    try:
        url = f"https://router.project-osrm.org/route/v1/driving/{origin[1]},{origin[0]};{destination[1]},{destination[0]}"
        response = requests.get(url, params={"overview": "false"}, timeout=10)
        data = response.json()
        
        if data["code"] == "Ok":
            return data["routes"][0]["distance"] / 1000
    except Exception as e:
        print(f"[ROUTING] API failed, using geodesic: {e}")
    
    # Fallback to geodesic approximation
    return geodesic(origin, destination).kilometers * 1.3

def load_manufacturer_data(csv_path=None):
    """Load and preprocess manufacturer data."""
    global _df, _ports_calculated
    
    if _df is not None and _ports_calculated:
        return _df
    
    if csv_path is None:
        # Default to backend directory
        csv_path = Path(__file__).parent.parent / "Data for MITEC.csv"
    
    df = pd.read_csv(csv_path)
    df.columns = df.columns.str.strip()
    
    # Calculate nearest port and sea travel distance (international only)
    df["nearest_port"] = None
    df["sea_distance_km"] = None
    
    for i in range(len(df)):
        if df.iloc[i]["Country"] != "United States of America":
            distances = []
            for port in PORTS:
                dist = geodesic(
                    (df.iloc[i]["Latitude"], df.iloc[i]["Longitude"]),
                    port["coords"]
                ).kilometers
                distances.append(dist)
            
            min_index = distances.index(min(distances))
            df.iloc[i, df.columns.get_loc("sea_distance_km")] = distances[min_index] * 1.15
            df.iloc[i, df.columns.get_loc("nearest_port")] = PORTS[min_index]["name"]
    
    _df = df
    _ports_calculated = True
    return df

def calculate_total_costs(city, state, csv_path=None):
    """
    Calculate total costs and emissions per ton of steel for a project location.
    
    Parameters:
    -----------
    city : str
        City name
    state : str
        State name
    csv_path : str, optional
        Path to CSV file
    
    Returns:
    --------
    pandas.DataFrame
        DataFrame with columns:
        - manufacturer_name: Company name
        - cost_per_ton_usd: Total cost per ton = (Cost of steel per ton) + transport cost per ton
        - carbon_per_ton: Total CO2 per ton = (Carbon Emitted per ton) + transport carbon per ton
    """
    # Load manufacturer data
    df = load_manufacturer_data(csv_path)
    
    # Geocode the project location
    coords = geocode_city_state(city, state)
    if not coords:
        raise ValueError(f"Could not geocode location: {city}, {state}")
    
    proj_lat, proj_lon = coords
    
    # Calculate distances for each manufacturer
    results = []
    
    for mfr_idx in range(len(df)):
        manufacturer = df.iloc[mfr_idx]["Company"]
        country = df.iloc[mfr_idx]["Country"]
        
        if country != "United States of America":
            # INTERNATIONAL: Distance from nearest port to project site
            port_name = df.iloc[mfr_idx]["nearest_port"]
            port_coords = next(p["coords"] for p in PORTS if p["name"] == port_name)
            land_dist = get_driving_distance(port_coords, (proj_lat, proj_lon))
            sea_dist = df.iloc[mfr_idx]["sea_distance_km"]
        else:
            # NATIONAL: Distance from manufacturer to project site
            land_dist = get_driving_distance(
                (df.iloc[mfr_idx]["Latitude"], df.iloc[mfr_idx]["Longitude"]),
                (proj_lat, proj_lon)
            )
            sea_dist = 0
        
        total_distance = land_dist + (sea_dist if pd.notna(sea_dist) else 0)
        
        # STEP 1: Calculate transport cost PER TON
        transport_cost_per_ton = (land_dist * LAND_TRANSPORT_COST_PER_TON_KM) + \
                                 ((sea_dist * SEA_TRANSPORT_COST_PER_TON_KM) if pd.notna(sea_dist) else 0)
        
        # STEP 2: Calculate transport carbon emissions PER TON (in kg CO2, then convert to tons)
        transport_carbon_per_ton = (land_dist * LAND_TRANSPORT_EMISSIONS_PER_TON_KM / 1000) + \
                                   ((sea_dist * SEA_TRANSPORT_EMISSIONS_PER_TON_KM / 1000) if pd.notna(sea_dist) else 0)
        
        # STEP 3: Get steel cost per ton from CSV
        steel_cost_per_ton = df.iloc[mfr_idx]["Cost of steel (USD/ton)"]
        
        # STEP 4: Add steel cost to transport cost = TOTAL COST PER TON
        total_cost_per_ton = steel_cost_per_ton + transport_cost_per_ton
        
        # STEP 5: Get carbon emitted per ton from CSV
        production_carbon_per_ton = df.iloc[mfr_idx]["Carbon Emitted (Ton CO2/ton steel)"]
        
        # STEP 6: Add production carbon to transport carbon = TOTAL CARBON PER TON
        total_carbon_per_ton = production_carbon_per_ton + transport_carbon_per_ton
        
        results.append({
            "manufacturer_name": manufacturer,
            "cost_per_ton_usd": total_cost_per_ton,
            "carbon_per_ton": total_carbon_per_ton
        })
    
    result_df = pd.DataFrame(results)
    # Sort by cost per ton (cheapest first)
    result_df = result_df.sort_values("cost_per_ton_usd")
    
    return result_df

# Pareto optimization functions
def _solve_min_emissions(
    df, demand_tons, budget, max_suppliers,
    supplier_col="supplier", cost_col="cost_per_ton", co2_col="co2_per_ton",
    exact_k=False, solver_msg=False
):
    S = df[supplier_col].astype(str).tolist()
    cost = dict(zip(df[supplier_col], df[cost_col]))
    co2  = dict(zip(df[supplier_col], df[co2_col]))
    M = float(demand_tons)  # Big-M, tight since no capacities
    prob = pulp.LpProblem("MinCO2_NoCap", pulp.LpMinimize)
    x = {s: pulp.LpVariable(f"x_{s}", lowBound=0) for s in S}
    y = {s: pulp.LpVariable(f"y_{s}", cat="Binary") for s in S}
    total_emiss = pulp.lpSum(x[s]*co2[s] for s in S)
    total_cost  = pulp.lpSum(x[s]*cost[s] for s in S)
    prob += total_emiss
    prob += pulp.lpSum(x[s] for s in S) >= demand_tons, "Demand"
    prob += total_cost <= budget, "Budget"
    if exact_k:
        prob += pulp.lpSum(y[s] for s in S) == max_suppliers, "K_exact"
    else:
        prob += pulp.lpSum(y[s] for s in S) <= max_suppliers, "K_at_most"
    for s in S:
        prob += x[s] <= M * y[s], f"Link_{s}"
    status = prob.solve(pulp.PULP_CBC_CMD(msg=solver_msg))
    if pulp.LpStatus[status] not in {"Optimal","Feasible"}:
        return None
    alloc = {s: max(0.0, pulp.value(x[s]) or 0.0) for s in S}
    return {
        "alloc": alloc,
        "total_cost": float(pulp.value(total_cost)),
        "total_emiss": float(pulp.value(total_emiss)),
    }

def _solve_min_cost_given_emissions_cap(
    df, demand_tons, budget, max_suppliers, emiss_cap,
    supplier_col="supplier", cost_col="cost_per_ton", co2_col="co2_per_ton",
    exact_k=False, solver_msg=False
):
    S = df[supplier_col].astype(str).tolist()
    cost = dict(zip(df[supplier_col], df[cost_col]))
    co2  = dict(zip(df[supplier_col], df[co2_col]))
    M = float(demand_tons)
    prob = pulp.LpProblem("MinCost_givenEmissCap_NoCap", pulp.LpMinimize)
    x = {s: pulp.LpVariable(f"x_{s}", lowBound=0) for s in S}
    y = {s: pulp.LpVariable(f"y_{s}", cat="Binary") for s in S}
    total_emiss = pulp.lpSum(x[s]*co2[s] for s in S)
    total_cost  = pulp.lpSum(x[s]*cost[s] for s in S)
    prob += total_cost
    prob += pulp.lpSum(x[s] for s in S) >= demand_tons, "Demand"
    prob += total_cost <= budget, "Budget"
    prob += total_emiss <= emiss_cap, "EmissCap"
    if exact_k:
        prob += pulp.lpSum(y[s] for s in S) == max_suppliers, "K_exact"
    else:
        prob += pulp.lpSum(y[s] for s in S) <= max_suppliers, "K_at_most"
    for s in S:
        prob += x[s] <= M * y[s], f"Link_{s}"
    status = prob.solve(pulp.PULP_CBC_CMD(msg=solver_msg))
    if pulp.LpStatus[status] not in {"Optimal","Feasible"}:
        return None
    alloc = {s: max(0.0, pulp.value(x[s]) or 0.0) for s in S}
    return {
        "alloc": alloc,
        "total_cost": float(pulp.value(total_cost)),
        "total_emiss": float(pulp.value(total_emiss)),
    }

def generate_pareto_menu(
    df, demand_tons, budget, max_suppliers,
    supplier_col="supplier", cost_col="cost_per_ton", co2_col="co2_per_ton",
    exact_k=False, n_points=10, solver_msg=False
):
    min_co2 = _solve_min_emissions(df, demand_tons, budget, max_suppliers,
                                   supplier_col, cost_col, co2_col, exact_k, solver_msg)
    if min_co2 is None:
        raise ValueError("No feasible Min-CO2 plan. Check demand/budget/K.")
    
    min_emiss = min_co2["total_emiss"]
    loose_cap = max(min_emiss*1.5, min_emiss + 1e6)
    min_cost = _solve_min_cost_given_emissions_cap(df, demand_tons, budget, max_suppliers, loose_cap,
                                                   supplier_col, cost_col, co2_col, exact_k, solver_msg)
    if min_cost is None:
        raise ValueError("No feasible Min-Cost plan under budget/K.")
    
    # Try more points to ensure we get enough unique solutions
    # Use a wider range and more points to increase chances of unique solutions
    max_emiss = max(min_co2["total_emiss"]*1.3, min_cost["total_emiss"])
    # Try 3x the requested points to account for duplicates
    caps = np.linspace(min_emiss, max_emiss, num=max(n_points * 3, 25))
    
    def pack(label, res):
        alloc = {k:v for k,v in res["alloc"].items() if v > 1e-6}
        used = sorted([s for s,t in alloc.items()])
        return {
            "label": label,
            "total_cost_$": round(res["total_cost"], 2),
            "total_emissions_tCO2e": round(res["total_emiss"], 6),
            "num_suppliers": len(used),
            "suppliers": ", ".join(used),
            "alloc_tons": alloc
        }
    
    plans, seen = [], set()
    for label, res in [("Min-CO2", min_co2), ("Min-Cost", min_cost)]:
        key = (round(res["total_cost"],2), round(res["total_emiss"],6))
        plans.append(pack(label, res))
        seen.add(key)
    
    for cap in caps:
        res = _solve_min_cost_given_emissions_cap(df, demand_tons, budget, max_suppliers, cap,
                                                  supplier_col, cost_col, co2_col, exact_k, solver_msg)
        if res is None: 
            continue
        key = (round(res["total_cost"],2), round(res["total_emiss"],6))
        if key not in seen:
            plans.append(pack(f"Trade-off (cap={round(cap,2)})", res))
            seen.add(key)
            # Stop if we have enough unique plans (n_points total, including Min-CO2 and Min-Cost)
            if len(plans) >= n_points:
                break
    
    menu = pd.DataFrame(plans).sort_values(["total_emissions_tCO2e","total_cost_$"]).reset_index(drop=True)
    
    # If we have more than requested, select evenly spaced plans
    if len(menu) > n_points:
        # Keep Min-CO2 and Min-Cost, then select evenly spaced trade-offs
        min_co2_mask = menu['label'] == 'Min-CO2'
        min_cost_mask = menu['label'] == 'Min-Cost'
        min_co2_idx = menu[min_co2_mask].index[0] if min_co2_mask.any() else None
        min_cost_idx = menu[min_cost_mask].index[0] if min_cost_mask.any() else None
        
        # Get trade-off plans (exclude Min-CO2 and Min-Cost)
        trade_off_indices = [i for i in range(len(menu)) if i != min_co2_idx and i != min_cost_idx]
        n_trade_offs_needed = n_points - (2 if min_co2_idx is not None and min_cost_idx is not None else 
                                         1 if min_co2_idx is not None or min_cost_idx is not None else 0)
        
        if len(trade_off_indices) > n_trade_offs_needed and n_trade_offs_needed > 0:
            # Select evenly spaced trade-offs
            step = len(trade_off_indices) / n_trade_offs_needed
            selected_trade_offs = [trade_off_indices[int(i * step)] for i in range(n_trade_offs_needed)]
            keep_indices = ([min_co2_idx] if min_co2_idx is not None else []) + \
                          ([min_cost_idx] if min_cost_idx is not None else []) + \
                          selected_trade_offs
            menu = menu.iloc[sorted(keep_indices)].reset_index(drop=True)
    
    return menu

