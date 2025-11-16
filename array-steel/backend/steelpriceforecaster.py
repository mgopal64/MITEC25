import pickle
import pandas as pd
from pathlib import Path
from fredapi import Fred

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
    
    def get_historical_data(self, months: int = 24):
        """
        Get historical data from the model (last N months before forecast).
        Returns data in the same format as forecast.
        """
        # Get fitted values from the model (historical predictions)
        if hasattr(self.model, 'fittedvalues'):
            fitted = self.model.fittedvalues
        elif hasattr(self.model, 'predict'):
            # If model has predict, get historical predictions
            try:
                fitted = self.model.predict()
            except:
                # Fallback: generate some historical data
                fitted = pd.Series([100.0] * months)
        else:
            # Fallback: generate some historical data
            fitted = pd.Series([100.0] * months)
        
        # Get the last N months
        if len(fitted) > months:
            historical = fitted.tail(months)
        else:
            historical = fitted
        
        # Generate dates (going backwards from forecast start)
        # Historical should end at August 2025, forecast starts at September 2025
        # Calculate start date to ensure we end exactly at August 2025
        forecast_start = pd.Timestamp('2025-09-01')
        last_historical_date = forecast_start - pd.DateOffset(months=1)  # August 2025
        start_date = last_historical_date - pd.DateOffset(months=len(historical) - 1)
        dates = pd.date_range(start=start_date, end=last_historical_date, freq='MS')
        
        result = []
        for date, price in zip(dates, historical):
            result.append({
                'month': int(date.month),
                'year': int(date.year),
                'steel_price_index': float(price),
                'is_historical': True
            })
        
        return result
    
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
                'steel_price_index': float(price),
                'is_historical': False
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

def get_2024_baseline_value():
    """
    Get the steel price index for August 2024 (1982=100 basis)
    This is used to convert to 2024=100 basis for teammate's script
    """
    
    fred = Fred(api_key='7f3a974235e50830cbadfb41f108ae7f')
    steel = fred.get_series('WPU101706')
    
    # Get August 2024 value
    try:
        aug_2024 = steel.loc['2024-08-01']
        return float(aug_2024)
    except KeyError:
        # If exact date not found, get closest
        steel_2024 = steel['2024']
        return float(steel_2024.iloc[-1])  # Last value in 2024
