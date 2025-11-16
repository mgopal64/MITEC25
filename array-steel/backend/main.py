from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List
from steelpriceforecaster import get_forecaster

app = FastAPI(title="Steel Calculator API", version="1.0.0")

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
        data = forecaster.forecast(request.scenario, request.months)
        
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
