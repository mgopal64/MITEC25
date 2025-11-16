# analysis/procurement_analyzer.py
import pandas as pd
import sys
from pathlib import Path
import subprocess

# Add parent directory to path to import forecaster
sys.path.append(str(Path(__file__).parent.parent))
from steelpriceforecaster import get_forecaster, get_2024_baseline_value

def generate_forecast_csv(scenario: str = 'baseline', 
                          months: int = 12,
                          output_path: Path = Path('forecast_data.csv')):
    """
    Generate CSV from ARIMA forecast, converting from 1982=100 to 2024=100 basis
    """
    # Get 2024 baseline value (1982=100 basis)
    baseline_1982 = get_2024_baseline_value()
    print(f"Aug 2024 baseline: {baseline_1982:.2f} (1982=100 basis)")
    
    # Get forecast from your model (1982=100 basis)
    forecaster = get_forecaster()
    forecast_data = forecaster.forecast(scenario, months)
    
    # Convert to DataFrame
    df = pd.DataFrame(forecast_data)
    
    # CRITICAL CONVERSION: Re-base from 1982=100 to 2024=100
    df['Steel_Price_Index_(2024=100)'] = (df['steel_price_index'] / baseline_1982) * 100
    
    print(f"Converted index range (2024=100): {df['Steel_Price_Index_(2024=100)'].min():.2f} to {df['Steel_Price_Index_(2024=100)'].max():.2f}")
    
    # Add Month name column
    month_names = {
        1: 'Jan', 2: 'Feb', 3: 'Mar', 4: 'Apr', 5: 'May', 6: 'Jun',
        7: 'Jul', 8: 'Aug', 9: 'Sep', 10: 'Oct', 11: 'Nov', 12: 'Dec'
    }
    df['Month'] = df['month'].map(month_names)
    df['Year'] = df['year']
    
    # Select columns in exact order teammate expects
    output_df = df[['Month', 'Year', 'Steel_Price_Index_(2024=100)']]
    
    # Save CSV
    output_df.to_csv(output_path, index=False)
    print(f"✓ Saved forecast CSV to {output_path}")
    
    return output_path

def run_procurement_analysis(scenario: str = 'baseline',
                             months: int = 12,
                             base_price_2024: float = 700.0,
                             sims: int = 10000,
                             vol: float = 0.05,
                             hedge_ratio: float = 0.70):
    """
    Complete workflow:
    1. Generate forecast CSV from your model (with proper conversion)
    2. Run Monte Carlo analysis
    3. Return results
    """
    # Generate forecast CSV (converts 1982=100 to 2024=100)
    csv_path = Path(__file__).parent / f'forecast_{scenario}.csv'
    generate_forecast_csv(scenario, months, csv_path)
    
    # Run teammate's Monte Carlo script
    script_path = Path(__file__).parent / 'steel_scenarios_from_csv.py'
    outdir = Path(__file__).parent / 'output'
    outdir.mkdir(exist_ok=True)
    
    cmd = [
        'python', str(script_path),
        '--csv', str(csv_path),
        '--base-price-2024', str(base_price_2024),
        '--sims', str(sims),
        '--vol', str(vol),
        '--hedge-ratio', str(hedge_ratio),
        '--outdir', str(outdir),
        '--no-plots'
    ]
    
    result = subprocess.run(cmd, capture_output=True, text=True)
    
    if result.returncode != 0:
        raise Exception(f"Monte Carlo failed: {result.stderr}")
    
    print(result.stdout)  # Show Monte Carlo output
    
    # Read results
    summary_path = outdir / 'strategy_summary.csv'
    summary = pd.read_csv(summary_path, index_col=0)
    
    return {
        'scenario': scenario,
        'summary': summary.to_dict(),
        'forecast_csv': str(csv_path),
        'results_dir': str(outdir)
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
        sims=1000  # Fewer for testing
    )
    
    print("\n" + "="*70)
    print("RESULTS")
    print("="*70)
    print(pd.DataFrame(results['summary']))