import pickle
import pandas as pd
from pathlib import Path

class SteelForecaster:
    def __init__(self):
        model_path = Path(__file__).parent / 'models' / 'steel_arima_model.pkl'
        with open(model_path, 'rb') as f:
            self.model = pickle.load(f)
        
        self.scenarios = {
            'baseline': 1.0,
            'tariffs': 1.12,
            'recession': 0.85,
            'infrastructure_boom': 1.08,
            'green_steel': 1.15,
            'tariffs_recession': 0.952
        }
    
    def forecast(self, scenario: str = 'baseline', months: int = 12):
        baseline = self.model.forecast(steps=months)
        multiplier = self.scenarios.get(scenario, 1.0)
        forecast = baseline * multiplier
        
        start_date = pd.Timestamp('2025-09-01')
        dates = pd.date_range(start=start_date, periods=months, freq='MS')
        
        result = []
        for date, price in zip(dates, forecast):
            result.append({
                'month': int(date.month),
                'year': int(date.year),
                'steel_price_index': float(price)
            })
        
        return result
    
    def get_all_scenarios(self, months: int = 12):
        return {
            scenario: self.forecast(scenario, months)
            for scenario in self.scenarios.keys()
        }

forecaster = None

def get_forecaster():
    global forecaster
    if forecaster is None:
        forecaster = SteelForecaster()
    return forecaster
