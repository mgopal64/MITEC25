from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List
from steelpriceforecaster import get_forecaster

import sys
from pathlib import Path
sys.path.append(str(Path(__file__).parent / 'analysis'))
from procurement_analyzer import run_procurement_analysis

app = FastAPI(title="Steel Calculator API", version="1.0.0")

@app.post("/api/procurement-analysis")
async def procurement_analysis(
    scenario: str = 'baseline',
    months: int = 12,
    base_price_2024: float = 700.0,
    sims: int = 10000,
    vol: float = 0.05,
    hedge_ratio: float = 0.70
):
    """
    Run complete procurement strategy analysis:
    1. Generate steel price forecast
    2. Run Monte Carlo simulations
    3. Compare procurement strategies
    
    Returns cost summaries for: Buy Now, Spot, Ladder, Hedge
    """
    try:
        results = run_procurement_analysis(
            scenario=scenario,
            months=months,
            base_price_2024=base_price_2024,
            sims=sims,
            vol=vol,
            hedge_ratio=hedge_ratio
        )
        return results
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Configure CORS for Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:3001",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ForecastRequest(BaseModel):
    scenario: str = 'baseline'
    months: int = 12

class SteelPrice(BaseModel):
    month: int
    year: int
    steel_price_index: float
    is_historical: bool = False

class ForecastResponse(BaseModel):
    scenario: str
    months: int
    data: List[SteelPrice]

@app.get("/health")
async def health_check():
    return {"status": "healthy", "model": "ARIMA(3,1,3)"}

@app.post("/api/steel-forecast", response_model=ForecastResponse)
async def get_steel_forecast(request: ForecastRequest):
    try:
        forecaster = get_forecaster()
        forecast = forecaster.forecast(request.scenario, request.months)
        historical = forecaster.get_historical_data(months=24)  # Get 24 months of history
        
        # Combine historical + forecast (historical first, then forecast)
        data = historical + forecast
        
        return {
            "scenario": request.scenario,
            "months": request.months,
            "data": data
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/steel-scenarios")
async def get_all_scenarios(months: int = 12):
    try:
        forecaster = get_forecaster()
        all_scenarios = forecaster.get_all_scenarios(months)
        
        return {
            "months": months,
            "scenarios": all_scenarios
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class SustainableSourcingRequest(BaseModel):
    totalSteel: float
    totalBudget: float
    projects: List[dict]

class PlantDistribution(BaseModel):
    name: str
    percentage: float
    cost: float
    co2: float

class SourcingOption(BaseModel):
    id: str
    name: str
    totalCost: float
    totalCO2: float
    plants: List[PlantDistribution]
    priority: str  # 'sustainability', 'cost', 'balanced'

@app.post("/api/sustainable-sourcing")
async def get_sustainable_sourcing(request: SustainableSourcingRequest):
    """
    Generate sustainable sourcing options based on total steel and budget.
    Returns up to 3 options prioritizing sustainability, or falls back to
    one sustainability-prioritized and one cost-prioritized option.
    """
    try:
        total_steel = request.totalSteel
        total_budget = request.totalBudget
        avg_budget_per_ton = total_budget / total_steel if total_steel > 0 else 700
        
        # Define available plants with their characteristics
        plants_db = [
            {"name": "Green Steel Plant A", "cost": 350, "co2": 0.5},
            {"name": "Eco Steel Works", "cost": 380, "co2": 0.6},
            {"name": "Sustainable Metals Co", "cost": 400, "co2": 0.7},
            {"name": "Standard Steel Mill B", "cost": 320, "co2": 1.0},
            {"name": "Regional Steel Corp", "cost": 340, "co2": 1.2},
            {"name": "Economy Steel Works", "cost": 300, "co2": 1.8},
            {"name": "Budget Metals Inc", "cost": 310, "co2": 2.0},
        ]
        
        options = []
        
        # Option 1: Most Sustainable (all green plants)
        if avg_budget_per_ton >= 350:
            option1_plants = [
                {"name": plants_db[0]["name"], "percentage": 40, "cost": plants_db[0]["cost"], "co2": plants_db[0]["co2"]},
                {"name": plants_db[1]["name"], "percentage": 35, "cost": plants_db[1]["cost"], "co2": plants_db[1]["co2"]},
                {"name": plants_db[2]["name"], "percentage": 25, "cost": plants_db[2]["cost"], "co2": plants_db[2]["co2"]},
            ]
            option1_cost = sum(p["cost"] * (p["percentage"] / 100) for p in option1_plants) * total_steel
            option1_co2 = sum(p["co2"] * (p["percentage"] / 100) for p in option1_plants) * total_steel
            
            if option1_cost <= total_budget * 1.1:  # Allow 10% buffer
                options.append({
                    "id": "1",
                    "name": "Most Sustainable Option",
                    "totalCost": option1_cost,
                    "totalCO2": option1_co2,
                    "plants": option1_plants,
                    "priority": "sustainability"
                })
        
        # Option 2: Balanced (mix of green and standard)
        option2_plants = [
            {"name": plants_db[3]["name"], "percentage": 50, "cost": plants_db[3]["cost"], "co2": plants_db[3]["co2"]},
            {"name": plants_db[0]["name"], "percentage": 30, "cost": plants_db[0]["cost"], "co2": plants_db[0]["co2"]},
            {"name": plants_db[4]["name"], "percentage": 20, "cost": plants_db[4]["cost"], "co2": plants_db[4]["co2"]},
        ]
        option2_cost = sum(p["cost"] * (p["percentage"] / 100) for p in option2_plants) * total_steel
        option2_co2 = sum(p["co2"] * (p["percentage"] / 100) for p in option2_plants) * total_steel
        
        if option2_cost <= total_budget * 1.1:
            options.append({
                "id": "2",
                "name": "Balanced Option",
                "totalCost": option2_cost,
                "totalCO2": option2_co2,
                "plants": option2_plants,
                "priority": "balanced"
            })
        
        # Option 3: Cost-Optimized
        option3_plants = [
            {"name": plants_db[5]["name"], "percentage": 60, "cost": plants_db[5]["cost"], "co2": plants_db[5]["co2"]},
            {"name": plants_db[3]["name"], "percentage": 25, "cost": plants_db[3]["cost"], "co2": plants_db[3]["co2"]},
            {"name": plants_db[6]["name"], "percentage": 15, "cost": plants_db[6]["cost"], "co2": plants_db[6]["co2"]},
        ]
        option3_cost = sum(p["cost"] * (p["percentage"] / 100) for p in option3_plants) * total_steel
        option3_co2 = sum(p["co2"] * (p["percentage"] / 100) for p in option3_plants) * total_steel
        
        options.append({
            "id": "3",
            "name": "Cost-Optimized Option",
            "totalCost": option3_cost,
            "totalCO2": option3_co2,
            "plants": option3_plants,
            "priority": "cost"
        })
        
        # If we don't have 3 options within constraints, ensure we have at least
        # one sustainability-prioritized and one cost-prioritized
        if len(options) < 2:
            # Add a sustainability-focused option if missing
            has_sustainability = any(opt["priority"] == "sustainability" for opt in options)
            if not has_sustainability and avg_budget_per_ton >= 350:
                option_sus_plants = [
                    {"name": plants_db[0]["name"], "percentage": 45, "cost": plants_db[0]["cost"], "co2": plants_db[0]["co2"]},
                    {"name": plants_db[1]["name"], "percentage": 55, "cost": plants_db[1]["cost"], "co2": plants_db[1]["co2"]},
                ]
                option_sus_cost = sum(p["cost"] * (p["percentage"] / 100) for p in option_sus_plants) * total_steel
                option_sus_co2 = sum(p["co2"] * (p["percentage"] / 100) for p in option_sus_plants) * total_steel
                options.insert(0, {
                    "id": "sus",
                    "name": "Sustainability Priority",
                    "totalCost": option_sus_cost,
                    "totalCO2": option_sus_co2,
                    "plants": option_sus_plants,
                    "priority": "sustainability"
                })
            
            # Ensure cost-optimized exists
            has_cost = any(opt["priority"] == "cost" for opt in options)
            if not has_cost:
                option_cost_plants = [
                    {"name": plants_db[5]["name"], "percentage": 70, "cost": plants_db[5]["cost"], "co2": plants_db[5]["co2"]},
                    {"name": plants_db[6]["name"], "percentage": 30, "cost": plants_db[6]["cost"], "co2": plants_db[6]["co2"]},
                ]
                option_cost_cost = sum(p["cost"] * (p["percentage"] / 100) for p in option_cost_plants) * total_steel
                option_cost_co2 = sum(p["co2"] * (p["percentage"] / 100) for p in option_cost_plants) * total_steel
                options.append({
                    "id": "cost",
                    "name": "Cost Priority",
                    "totalCost": option_cost_cost,
                    "totalCO2": option_cost_co2,
                    "plants": option_cost_plants,
                    "priority": "cost"
                })
        
        # Limit to top 3 options (prioritize sustainability)
        options.sort(key=lambda x: (x["priority"] != "sustainability", x["totalCO2"]))
        options = options[:3]
        
        return {"options": options}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
