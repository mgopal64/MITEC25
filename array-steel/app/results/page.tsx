'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

interface Project {
  id: string;
  location: string;
  budget: string;
  steelRequired: string;
  dueDate: string;
}

interface SteelPrice {
  month: number;
  year: number;
  steel_price_index: number;
  is_historical?: boolean;
}

interface SourcingOption {
  id: string;
  name: string;
  totalCost: number;
  totalCO2: number;
  plants: { name: string; percentage: number; cost: number; co2: number }[];
  priority: 'sustainability' | 'cost' | 'balanced';
}

interface PurchasingOption {
  name: string;
  description: string;
  totalCost: number;
  breakdown: { category: string; amount: number }[];
}

// Scenario labels for display
const SCENARIO_LABELS: { [key: string]: string } = {
  baseline: 'Baseline',
  tariffs: 'Tariffs',
  recession: 'Recession',
  infrastructure_boom: 'Infrastructure Boom',
  green_steel: 'Green Steel Boom',
  tariffs_recession: 'Tariffs + Recession',
};

export default function ResultsPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeTab, setActiveTab] = useState<'where' | 'how'>('where');
  const [forecastData, setForecastData] = useState<SteelPrice[]>([]);
  const [sourcingOptions, setSourcingOptions] = useState<SourcingOption[]>([]);
  const [purchasingOptions, setPurchasingOptions] = useState<
    PurchasingOption[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [selectedScenario, setSelectedScenario] = useState<string>('baseline');

  useEffect(() => {
    const storedProjects = localStorage.getItem('projects');
    if (!storedProjects) {
      router.push('/');
      return;
    }

    const parsedProjects = JSON.parse(storedProjects);
    setProjects(parsedProjects);
    fetchResults(parsedProjects, selectedScenario);
  }, [router]);

  // Refetch forecast when scenario changes
  useEffect(() => {
    if (projects.length > 0) {
      fetchForecastData(selectedScenario);
      fetchPurchasingOptions(selectedScenario);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedScenario]);

  const fetchForecastData = async (scenario: string) => {
    try {
      const forecastResponse = await fetch('http://localhost:8000/api/steel-forecast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenario, months: 12 }),
      });
      const forecastResult = await forecastResponse.json();
      const data = forecastResult.data || [];
      console.log('Forecast data received:', data.slice(0, 3), '...', data.slice(-3));
      console.log('Historical count:', data.filter((d: SteelPrice) => d.is_historical).length);
      console.log('Forecast count:', data.filter((d: SteelPrice) => !d.is_historical).length);
      setForecastData(data);
    } catch (error) {
      console.error('Error fetching forecast data:', error);
      // Use mock data as fallback
      setForecastData(getMockForecastData());
    }
  };

  const fetchPurchasingOptions = async (scenario: string) => {
    try {
      const totalSteel = projects.reduce(
        (sum, p) => sum + parseFloat(p.steelRequired || '0'),
        0
      );
      const purchasingResponse = await fetch(
        'http://localhost:8000/api/procurement-analysis',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            scenario,
            months: 12,
            base_price_2024: 700.0,
            sims: 10000,
            vol: 0.05,
            hedge_ratio: 0.70,
          }),
        }
      );
      const purchasingResult = await purchasingResponse.json();
      processPurchasingOptions(purchasingResult, totalSteel);
    } catch (error) {
      console.error('Error fetching purchasing options:', error);
      // Use mock data if API fails
      if (projects.length > 0) {
        const totalSteel = projects.reduce(
          (sum, p) => sum + parseFloat(p.steelRequired || '0'),
          0
        );
        setPurchasingOptions(getMockPurchasingOptions(projects));
      }
    }
  };

  const fetchResults = async (projectsData: Project[], scenario: string = 'baseline') => {
    setLoading(true);
    try {
      // Calculate total steel and budget
      const totalSteel = projectsData.reduce(
        (sum, p) => sum + parseFloat(p.steelRequired || '0'),
        0
      );
      const totalBudget = projectsData.reduce(
        (sum, p) => sum + parseFloat(p.budget || '0'),
        0
      );

      // Fetch forecast data
      await fetchForecastData(scenario);

      // Fetch sustainable sourcing options
      const sourcingResponse = await fetch(
        'http://localhost:8000/api/sustainable-sourcing',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            totalSteel,
            totalBudget,
            projects: projectsData,
          }),
        }
      );
      const sourcingResult = await sourcingResponse.json();
      setSourcingOptions(sourcingResult.options || []);

      // Fetch purchasing options
      await fetchPurchasingOptions(scenario);
    } catch (error) {
      console.error('Error fetching results:', error);
      // Use mock data if API fails
      if (projectsData && projectsData.length > 0) {
        setForecastData(getMockForecastData());
        setSourcingOptions(getMockSourcingOptions(projectsData));
        setPurchasingOptions(getMockPurchasingOptions(projectsData));
      }
    } finally {
      setLoading(false);
    }
  };

  const processPurchasingOptions = (data: any, totalSteel: number) => {
    const summary = data.summary || {};
    
    // Helper to convert millions to dollars
    // Backend returns values in millions (e.g., 71.4 = $71.4 million)
    const millionsToDollars = (value: number | undefined, fallbackPerTon: number) => {
      if (value !== undefined && value !== null && !isNaN(value)) {
        return value * 1e6; // Convert millions to dollars
      }
      return fallbackPerTon * totalSteel; // Fallback: per-ton cost
    };
    
    // Try both key formats (mean_$M from backend, or mean as fallback)
    const buyNowMean = summary['Buy Now']?.mean_$M ?? summary['Buy Now']?.mean;
    const ladderMean = summary['Ladder']?.mean_$M ?? summary['Ladder']?.mean;
    const hedgeMean = summary['Hedge']?.mean_$M ?? summary['Hedge']?.mean;
    
    const spotTotal = millionsToDollars(buyNowMean, 700);
    const ladderTotal = millionsToDollars(ladderMean, 680);
    const hedgeTotal = millionsToDollars(hedgeMean, 690);
    
    const options: PurchasingOption[] = [
      {
        name: 'Spot Purchasing',
        description: 'Purchase steel at current market prices as needed',
        totalCost: spotTotal,
        breakdown: [
          { category: 'Base Cost', amount: spotTotal * 0.93 }, // ~93% base cost
          { category: 'Market Risk', amount: spotTotal * 0.07 }, // ~7% market risk
        ],
      },
      {
        name: 'Volume-Commit / Fixed-Spread Physical Steel Contracts',
        description: 'Lock in prices through forward contracts with suppliers',
        totalCost: ladderTotal,
        breakdown: [
          { category: 'Contract Cost', amount: ladderTotal * 0.97 },
          { category: 'Contract Premium', amount: ladderTotal * 0.03 },
        ],
      },
      {
        name: 'Financial Hedging (HRC Futures / Swaps)',
        description: 'Hedge price risk using financial derivatives',
        totalCost: hedgeTotal,
        breakdown: [
          { category: 'Spot Cost', amount: hedgeTotal * 0.98 },
          { category: 'Hedge Premium', amount: hedgeTotal * 0.015 },
          { category: 'Hedge Cost', amount: hedgeTotal * 0.005 },
        ],
      },
    ];
    setPurchasingOptions(options);
  };

  const getMockForecastData = (): SteelPrice[] => {
    // Generate 24 months of historical data ending at August 2025
    // Start from September 2023, go through August 2025 (24 months total)
    const historical = Array.from({ length: 24 }, (_, i) => {
      const date = new Date(2023, 8 + i, 1); // September 2023 + i months
      return {
        month: date.getMonth() + 1,
        year: date.getFullYear(),
        steel_price_index: 100 + Math.random() * 10 - 5, // Fluctuating around 100
        is_historical: true,
      };
    });
    
    // Generate 12 months of forecast data starting from September 2025
    // This should be continuous with historical (no gap)
    const forecast = Array.from({ length: 12 }, (_, i) => {
      const date = new Date(2025, 8 + i, 1); // September 2025 + i months
      return {
        month: date.getMonth() + 1,
        year: date.getFullYear(),
        steel_price_index: 100 + Math.random() * 10 - 5, // Fluctuating around 100
        is_historical: false,
      };
    });
    
    return [...historical, ...forecast];
  };

  const getMockSourcingOptions = (projectsData: Project[]): SourcingOption[] => {
    return [
      {
        id: '1',
        name: 'Most Sustainable Option',
        totalCost: projectsData.reduce((sum, p) => sum + parseFloat(p.budget || '0') * 0.95, 0),
        totalCO2: projectsData.reduce((sum, p) => sum + parseFloat(p.steelRequired || '0') * 1.2, 0),
        priority: 'sustainability',
        plants: [
          { name: 'Green Steel Plant A', percentage: 40, cost: 350, co2: 0.5 },
          { name: 'Eco Steel Works', percentage: 35, cost: 380, co2: 0.6 },
          { name: 'Sustainable Metals Co', percentage: 25, cost: 400, co2: 0.7 },
        ],
      },
      {
        id: '2',
        name: 'Balanced Option',
        totalCost: projectsData.reduce((sum, p) => sum + parseFloat(p.budget || '0') * 0.98, 0),
        totalCO2: projectsData.reduce((sum, p) => sum + parseFloat(p.steelRequired || '0') * 1.5, 0),
        priority: 'balanced',
        plants: [
          { name: 'Standard Steel Mill B', percentage: 50, cost: 320, co2: 1.0 },
          { name: 'Green Steel Plant A', percentage: 30, cost: 350, co2: 0.5 },
          { name: 'Regional Steel Corp', percentage: 20, cost: 340, co2: 1.2 },
        ],
      },
      {
        id: '3',
        name: 'Cost-Optimized Option',
        totalCost: projectsData.reduce((sum, p) => sum + parseFloat(p.budget || '0') * 0.92, 0),
        totalCO2: projectsData.reduce((sum, p) => sum + parseFloat(p.steelRequired || '0') * 2.1, 0),
        priority: 'cost',
        plants: [
          { name: 'Economy Steel Works', percentage: 60, cost: 300, co2: 1.8 },
          { name: 'Standard Steel Mill B', percentage: 25, cost: 320, co2: 1.0 },
          { name: 'Budget Metals Inc', percentage: 15, cost: 310, co2: 2.0 },
        ],
      },
    ];
  };

  const getMockPurchasingOptions = (projectsData: Project[]): PurchasingOption[] => {
    const totalSteel = projectsData.reduce(
      (sum, p) => sum + parseFloat(p.steelRequired || '0'),
      0
    );
    return [
      {
        name: 'Spot Purchasing',
        description: 'Purchase steel at current market prices as needed',
        totalCost: 700 * totalSteel,
        breakdown: [
          { category: 'Base Cost', amount: 700 * totalSteel },
          { category: 'Market Risk', amount: 50 * totalSteel },
        ],
      },
      {
        name: 'Volume-Commit / Fixed-Spread Physical Steel Contracts',
        description: 'Lock in prices through forward contracts with suppliers',
        totalCost: 680 * totalSteel,
        breakdown: [
          { category: 'Contract Cost', amount: 680 * totalSteel },
          { category: 'Contract Premium', amount: 20 * totalSteel },
        ],
      },
      {
        name: 'Financial Hedging (HRC Futures / Swaps)',
        description: 'Hedge price risk using financial derivatives',
        totalCost: 690 * totalSteel,
        breakdown: [
          { category: 'Spot Cost', amount: 690 * totalSteel },
          { category: 'Hedge Premium', amount: 15 * totalSteel },
          { category: 'Hedge Cost', amount: 5 * totalSteel },
        ],
      },
    ];
  };

  const totalSteel = projects.reduce(
    (sum, p) => sum + parseFloat(p.steelRequired || '0'),
    0
  );
  const totalBudget = projects.reduce(
    (sum, p) => sum + parseFloat(p.budget || '0'),
    0
  );

  const formatChartData = () => {
    const allData = forecastData.map((item, index) => {
      const isHistorical = item.is_historical || false;
      const value = parseFloat(item.steel_price_index.toFixed(1));
      
      // Check if this is the first forecast point (to connect historical line to it)
      const isFirstForecast = !isHistorical && index > 0 && forecastData[index - 1].is_historical;
      
      return {
        month: `${item.month}/${item.year}`,
        index: value,
        // Historical line: all historical points + first forecast point for connection
        historical: isHistorical || isFirstForecast ? value : null,
        // Forecast line: only forecast data points (starts at first forecast point)
        forecast: !isHistorical ? value : null,
        full: item,
        isHistorical: isHistorical,
      };
    });
    return allData;
  };

  const monthNames: { [key: number]: string } = {
    1: 'Jan',
    2: 'Feb',
    3: 'Mar',
    4: 'Apr',
    5: 'May',
    6: 'Jun',
    7: 'Jul',
    8: 'Aug',
    9: 'Sep',
    10: 'Oct',
    11: 'Nov',
    12: 'Dec',
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-lg text-gray-600">Loading recommendations...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded bg-zinc-900 text-white font-bold">
              S
            </div>
            <span className="text-xl font-semibold text-gray-900">
              SteelAdvisory
            </span>
          </div>
          <button
            onClick={() => router.push('/')}
            className="text-gray-600 hover:text-gray-900"
          >
            ← Back to Projects
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-8">
        {/* Summary Section */}
        <div className="mb-8 rounded-lg bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-2xl font-bold text-gray-900">
            Project Summary
          </h2>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            <div>
              <p className="text-sm font-medium text-gray-500">
                Total Budget (USD)
              </p>
              <p className="mt-1 text-3xl font-bold text-gray-900">
                ${totalBudget.toLocaleString()}
              </p>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500">
                Total Steel Required
              </p>
              <p className="mt-1 text-3xl font-bold text-gray-900">
                {totalSteel.toLocaleString()} tons
              </p>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500">
                Number of Projects
              </p>
              <p className="mt-1 text-3xl font-bold text-gray-900">
                {projects.length}
              </p>
            </div>
          </div>
          <div className="mt-6 space-y-2">
            {projects.map((project, index) => (
              <div
                key={project.id}
                className="flex items-center justify-between rounded border border-gray-200 bg-gray-50 px-4 py-2"
              >
                <div>
                  <span className="font-medium text-gray-900">
                    Project {index + 1}: {project.location}
                  </span>
                </div>
                <div className="flex gap-6 text-sm text-gray-600">
                  <span>
                    ${parseFloat(project.budget || '0').toLocaleString()}
                  </span>
                  <span>
                    {parseFloat(project.steelRequired || '0').toLocaleString()}{' '}
                    tons
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Tabs */}
        <div className="mb-6 border-b border-gray-200">
          <nav className="-mb-px flex space-x-8">
            <button
              onClick={() => setActiveTab('where')}
              className={`border-b-2 py-4 px-1 text-sm font-medium transition-colors ${
                activeTab === 'where'
                  ? 'border-gray-900 text-gray-900'
                  : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
              }`}
            >
              Where To Buy
            </button>
            <button
              onClick={() => setActiveTab('how')}
              className={`border-b-2 py-4 px-1 text-sm font-medium transition-colors ${
                activeTab === 'how'
                  ? 'border-gray-900 text-gray-900'
                  : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
              }`}
            >
              How To Buy
            </button>
          </nav>
        </div>

        {/* Where To Buy Tab */}
        {activeTab === 'where' && (
          <div className="space-y-6">
            <div className="rounded-lg bg-white p-6 shadow-sm">
              <h3 className="mb-4 text-xl font-semibold text-gray-900">
                Sustainable Manufacturing Options
              </h3>
              <p className="mb-6 text-sm text-gray-600">
                The following options prioritize sustainability within your
                constraints. Each option shows the distribution of steel
                sourcing across different plants, total cost, and estimated CO2
                emissions.
              </p>

              <div className="space-y-6">
                {sourcingOptions.map((option, idx) => (
                  <div
                    key={option.id}
                    className="rounded-lg border-2 border-gray-200 p-6"
                  >
                    <div className="mb-4 flex items-center justify-between">
                      <div>
                        <h4 className="text-lg font-semibold text-gray-900">
                          Option {idx + 1}: {option.name}
                        </h4>
                        <span
                          className={`mt-1 inline-block rounded px-2 py-1 text-xs font-medium ${
                            option.priority === 'sustainability'
                              ? 'bg-green-100 text-green-800'
                              : option.priority === 'cost'
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-purple-100 text-purple-800'
                          }`}
                        >
                          {option.priority === 'sustainability'
                            ? 'Sustainability Priority'
                            : option.priority === 'cost'
                            ? 'Cost Priority'
                            : 'Balanced'}
                        </span>
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-gray-500">Total Cost</p>
                        <p className="text-2xl font-bold text-gray-900">
                          ${option.totalCost.toLocaleString()}
                        </p>
                        <p className="mt-2 text-sm text-gray-500">
                          Total CO2 Emissions
                        </p>
                        <p className="text-xl font-semibold text-gray-700">
                          {option.totalCO2.toFixed(2)} tons CO₂
                        </p>
                      </div>
                    </div>

                    <div className="mt-4">
                      <h5 className="mb-3 text-sm font-medium text-gray-700">
                        Plant Distribution:
                      </h5>
                      <div className="space-y-3">
                        {option.plants.map((plant, pIdx) => (
                          <div key={pIdx} className="flex items-center gap-4">
                            <div className="flex-1">
                              <div className="flex items-center justify-between">
                                <span className="font-medium text-gray-900">
                                  {plant.name}
                                </span>
                                <span className="text-sm text-gray-600">
                                  {plant.percentage}%
                                </span>
                              </div>
                              <div className="mt-1 h-2 w-full rounded-full bg-gray-200">
                                <div
                                  className="h-2 rounded-full bg-gray-600"
                                  style={{ width: `${plant.percentage}%` }}
                                />
                              </div>
                            </div>
                            <div className="flex gap-4 text-sm text-gray-600">
                              <span>Cost: ${plant.cost}/ton</span>
                              <span>CO₂: {plant.co2} tons/ton</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* How To Buy Tab */}
        {activeTab === 'how' && (
          <div className="space-y-6">
            {/* Forecast Graph */}
            <div className="rounded-lg bg-white p-6 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-semibold text-gray-900">
                    12-Month Steel Price Forecast
                  </h3>
                  <p className="mt-1 text-sm text-gray-600">
                    Historical and forecasted steel price index (1982 = 100) based on time series
                    analysis.
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <label htmlFor="scenario-select" className="text-sm font-medium text-gray-700">
                    Scenario:
                  </label>
                  <select
                    id="scenario-select"
                    value={selectedScenario}
                    onChange={(e) => setSelectedScenario(e.target.value)}
                    className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
                  >
                    {Object.entries(SCENARIO_LABELS).map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="h-[600px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart 
                    data={formatChartData()}
                    margin={{ top: 20, right: 30, left: 60, bottom: 60 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="month"
                      tick={{ fontSize: 11 }}
                      interval={Math.max(0, Math.floor(formatChartData().length / 12))}
                      angle={-45}
                      textAnchor="end"
                      height={60}
                      label={{ value: 'Time Period', position: 'insideBottom', offset: -10 }}
                    />
                    <YAxis
                      width={80}
                      label={{
                        value: 'Price Index (1982 = 100)',
                        angle: -90,
                        position: 'insideLeft',
                        style: { textAnchor: 'middle' }
                      }}
                      domain={['auto', 'auto']}
                    />
                    <Tooltip
                      formatter={(value: any) => [
                        `${value} (1982 = 100)`,
                        'Steel Price Index',
                      ]}
                      labelFormatter={(label) => `Month: ${label}`}
                    />
                    <Legend 
                      verticalAlign="top" 
                      height={36}
                      iconType="line"
                    />
                    <Line
                      type="monotone"
                      dataKey="historical"
                      stroke="#000000"
                      strokeWidth={2.5}
                      name="Historical Data"
                      dot={false}
                      connectNulls={false}
                      activeDot={{ r: 6, fill: '#000000' }}
                    />
                    <Line
                      type="monotone"
                      dataKey="forecast"
                      stroke="#DC2626"
                      strokeWidth={2.5}
                      name="Future Forecast (Next 12 Months)"
                      dot={{ fill: '#DC2626', r: 4 }}
                      connectNulls={false}
                      activeDot={{ r: 6, fill: '#DC2626' }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Purchasing Options Table */}
            <div className="rounded-lg bg-white p-6 shadow-sm">
              <h3 className="mb-4 text-xl font-semibold text-gray-900">
                Purchasing Strategy Options
              </h3>
              <p className="mb-6 text-sm text-gray-600">
                Compare different purchasing strategies and their associated
                costs.
              </p>

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">
                        Strategy
                      </th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">
                        Description
                      </th>
                      <th className="px-4 py-3 text-right text-sm font-semibold text-gray-900">
                        Total Cost (USD)
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {purchasingOptions.map((option, idx) => (
                      <tr
                        key={idx}
                        className="border-b border-gray-100 hover:bg-gray-50"
                      >
                        <td className="px-4 py-4">
                          <div className="font-medium text-gray-900">
                            {option.name}
                          </div>
                        </td>
                        <td className="px-4 py-4 text-sm text-gray-600">
                          {option.description}
                        </td>
                        <td className="px-4 py-4 text-right">
                          <div className="text-lg font-semibold text-gray-900">
                            ${option.totalCost.toLocaleString()}
                          </div>
                          <div className="mt-1 space-y-1 text-xs text-gray-500">
                            {option.breakdown.map((item, bIdx) => (
                              <div key={bIdx}>
                                {item.category}: $
                                {item.amount.toLocaleString()}
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
