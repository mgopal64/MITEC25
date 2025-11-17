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
  ScatterChart,
  Scatter,
  Cell,
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

interface ProcurementPlan {
  id: string;
  label: string;
  total_cost: number;
  total_emissions: number;
  num_suppliers: number;
  suppliers: string;
  alloc_tons: { [key: string]: number };
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
  const [purchasingLoading, setPurchasingLoading] = useState(false);
  const [selectedScenario, setSelectedScenario] = useState<string>('baseline');
  
  // New state for optimization
  const [procurementPlans, setProcurementPlans] = useState<ProcurementPlan[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<ProcurementPlan | null>(null);
  const [optimizationLoading, setOptimizationLoading] = useState(false);
  const [optimizationInputs, setOptimizationInputs] = useState<{
    city: string;
    state: string;
    budget: string;
    demandTons: string;
    maxSuppliers: string;
  }>({
    city: '',
    state: '',
    budget: '',
    demandTons: '',
    maxSuppliers: '10',
  });

  useEffect(() => {
    const storedProjects = localStorage.getItem('projects');
    if (!storedProjects) {
      router.push('/');
      return;
    }

    const parsedProjects = JSON.parse(storedProjects);
    setProjects(parsedProjects);
    fetchResults(parsedProjects, selectedScenario);
    
    // Initialize optimization inputs from projects and auto-fetch if on "where" tab
    if (parsedProjects.length > 0) {
      const firstProject = parsedProjects[0];
      const locationParts = firstProject.location.split(',').map((s: string) => s.trim());
      const totalBudget = parsedProjects.reduce((sum: number, p: Project) => 
        sum + parseFloat(p.budget || '0'), 0);
      const totalSteel = parsedProjects.reduce((sum: number, p: Project) => 
        sum + parseFloat(p.steelRequired || '0'), 0);
      
      const inputs = {
        city: locationParts[0] || '',
        state: locationParts[1] || '',
        budget: totalBudget.toString(),
        demandTons: totalSteel.toString(),
        maxSuppliers: '10',
      };
      
      setOptimizationInputs(inputs);
      
      // Auto-fetch optimization results if we have valid inputs
      if (inputs.city && inputs.state && inputs.budget && inputs.demandTons) {
        // Small delay to ensure state is set
        setTimeout(() => {
          fetchOptimizationResultsAuto(inputs);
        }, 100);
      }
    }
  }, [router]);
  
  // Auto-fetch when switching to "where" tab if we have projects but no plans yet
  useEffect(() => {
    if (activeTab === 'where' && projects.length > 0 && procurementPlans.length === 0 && !optimizationLoading) {
      const firstProject = projects[0];
      const locationParts = firstProject.location.split(',').map((s: string) => s.trim());
      const totalBudget = projects.reduce((sum: number, p: Project) => 
        sum + parseFloat(p.budget || '0'), 0);
      const totalSteel = projects.reduce((sum: number, p: Project) => 
        sum + parseFloat(p.steelRequired || '0'), 0);
      
      if (locationParts[0] && locationParts[1] && totalBudget > 0 && totalSteel > 0) {
        fetchOptimizationResultsAuto({
          city: locationParts[0],
          state: locationParts[1],
          budget: totalBudget.toString(),
          demandTons: totalSteel.toString(),
          maxSuppliers: '10',
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  // Refetch forecast when scenario changes
  useEffect(() => {
    // Get projects from localStorage if state is empty
    const storedProjects = localStorage.getItem('projects');
    const projectsToUse = projects.length > 0 ? projects : (storedProjects ? JSON.parse(storedProjects) : []);
    
    if (projectsToUse.length > 0) {
      fetchForecastData(selectedScenario);
      // Pass projects data directly to avoid state timing issues
      fetchPurchasingOptionsWithData(selectedScenario, projectsToUse);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedScenario, projects]);

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

  const fetchPurchasingOptionsWithData = async (scenario: string, projectsData: Project[]) => {
    setPurchasingLoading(true);
    try {
      console.log('Projects data:', projectsData);
      console.log('Projects length:', projectsData.length);
      
      const totalSteel = projectsData.reduce(
        (sum, p) => {
          //const steel = parseFloat(p.steelRequired || p.steel_required || '0');
          const steel = parseFloat(p.steelRequired || '0');
          console.log(`Project ${p.id || 'unknown'}: steelRequired="${p.steelRequired}", parsed=${steel}`);
          return sum + steel;
        },
        0
      );
      
      console.log('Total steel calculated:', totalSteel);
      
      if (totalSteel <= 0) {
        console.warn('No steel required, skipping procurement analysis. Projects:', projectsData);
        setPurchasingLoading(false);
        return;
      }
      
      console.log(`[FRONTEND] Starting procurement analysis request: sims=1000, total_steel=${totalSteel}`);
      const startTime = Date.now();
      console.log(`[FRONTEND] Making API call to http://localhost:8000/api/procurement-analysis`);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        console.warn('[FRONTEND] Request timeout after 60 seconds, aborting...');
        controller.abort();
      }, 60000); // 60 second timeout
      
      try {
        const purchasingResponse = await fetch(
          'http://localhost:8000/api/procurement-analysis',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              scenario,
              months: 12,
              base_price_2024: 700.0,
              total_steel: totalSteel,
              sims: 1000,  // More simulations for better statistical accuracy
              vol: 0.05,
              hedge_ratio: 0.70,
            }),
            signal: controller.signal,
          }
        );
        
        clearTimeout(timeoutId);
        const elapsed = Date.now() - startTime;
        console.log(`[FRONTEND] API response received in ${elapsed}ms`);
        
        if (!purchasingResponse.ok) {
          const errorText = await purchasingResponse.text();
          throw new Error(`API error: ${purchasingResponse.status} - ${errorText}`);
        }
        
        const purchasingResult = await purchasingResponse.json();
        console.log('Procurement analysis result:', purchasingResult);
        processPurchasingOptions(purchasingResult, totalSteel);
      } catch (fetchError: any) {
        clearTimeout(timeoutId);
        if (fetchError.name === 'AbortError') {
          console.error('Request was aborted (likely timeout). This may take longer than expected.');
          throw new Error('Request timed out. The analysis is taking longer than expected. Please try again or reduce the number of simulations.');
        }
        throw fetchError;
      }
    } catch (error) {
      console.error('Error fetching purchasing options:', error);
      // Use mock data if API fails
      if (projectsData.length > 0) {
        const totalSteel = projectsData.reduce(
          (sum, p) => sum + parseFloat(p.steelRequired || '0'),
          0
        );
        setPurchasingOptions(getMockPurchasingOptions(projectsData));
      }
    } finally {
      setPurchasingLoading(false);
    }
  };

  // Wrapper to use projects state
  const fetchPurchasingOptions = async (scenario: string) => {
    const projectsToUse = projects.length > 0 ? projects : 
      (localStorage.getItem('projects') ? JSON.parse(localStorage.getItem('projects')!) : []);
    return fetchPurchasingOptionsWithData(scenario, projectsToUse);
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

      // Fetch forecast data (fast - don't block)
      fetchForecastData(scenario).catch(() => {
        setForecastData(getMockForecastData());
      });

      // Skip sustainable sourcing (we use new optimization instead)
      setSourcingOptions([]);

      // Fetch purchasing options (slow - do in background, don't block)
      fetchPurchasingOptionsWithData(scenario, projectsData).catch(() => {
        if (projectsData && projectsData.length > 0) {
          const totalSteel = projectsData.reduce(
            (sum, p) => sum + parseFloat(p.steelRequired || '0'),
            0
          );
          setPurchasingOptions(getMockPurchasingOptions(projectsData));
        }
      });
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

  const fetchOptimizationResultsAuto = async (inputs: {
    city: string;
    state: string;
    budget: string;
    demandTons: string;
    maxSuppliers: string;
  }) => {
    if (!inputs.city || !inputs.state || !inputs.budget || !inputs.demandTons) {
      return;
    }

    setOptimizationLoading(true);
    setSelectedPlan(null);
    
    try {
      const response = await fetch('http://localhost:8000/api/optimize-procurement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          city: inputs.city,
          state: inputs.state,
          budget: parseFloat(inputs.budget),
          demand_tons: parseFloat(inputs.demandTons),
          max_suppliers: parseInt(inputs.maxSuppliers) || 10,
          n_points: 10,
        }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch optimization results');
      }
      
      const result = await response.json();
      setProcurementPlans(result.plans || []);
    } catch (error) {
      console.error('Error fetching optimization results:', error);
      // Don't show alert for auto-fetch, just log
    } finally {
      setOptimizationLoading(false);
    }
  };

  const fetchOptimizationResults = async () => {
    fetchOptimizationResultsAuto(optimizationInputs);
  };

  const processPurchasingOptions = (data: any, totalSteel: number) => {
    console.log('Processing purchasing options, data:', data);
    const summary = data.summary || {};
    console.log('Summary:', summary);
    
    // Helper to convert millions to dollars
    // Backend returns values in millions (e.g., 71.4 = $71.4 million)
    const millionsToDollars = (value: number | undefined) => {
      if (value !== undefined && value !== null && !isNaN(value)) {
        return value * 1e6; // Convert millions to dollars
      }
      return 0;
    };
    
    // Get strategy data from backend (new names: "Spot Now", "Spot Later", "Ladder", "Hedge")
    const spotNowData = summary['Spot Now'] || summary['BuyNow'] || summary['Buy Now'] || {};
    const spotLaterData = summary['Spot Later'] || summary['Spot'] || {};
    const ladderData = summary['Ladder'] || {};
    const hedgeData = summary['Hedge'] || {};
    
    console.log('Strategy data:', { spotNowData, spotLaterData, ladderData, hedgeData });
    
    // Convert mean costs from millions to dollars
    const spotNowMean = spotNowData.mean_$M ?? spotNowData.mean;
    const spotLaterMean = spotLaterData.mean_$M ?? spotLaterData.mean;
    const ladderMean = ladderData.mean_$M ?? ladderData.mean;
    const hedgeMean = hedgeData.mean_$M ?? hedgeData.mean;
    
    console.log('Means:', { spotNowMean, spotLaterMean, ladderMean, hedgeMean });
    console.log('Converting to dollars:', {
      spotNow: millionsToDollars(spotNowMean),
      spotLater: millionsToDollars(spotLaterMean),
      ladder: millionsToDollars(ladderMean),
      hedge: millionsToDollars(hedgeMean)
    });
    
    const options: PurchasingOption[] = [
      {
        name: 'Spot Now',
        description: 'Purchase all steel at today\'s market price',
        totalCost: millionsToDollars(spotNowMean),
        breakdown: [
          { category: 'Mean Cost', amount: millionsToDollars(spotNowMean) },
          { category: 'P95 (High)', amount: millionsToDollars(spotNowData.p95_$M) },
          { category: 'P05 (Low)', amount: millionsToDollars(spotNowData.p05_$M) },
        ],
      },
      {
        name: 'Spot Later',
        description: 'Purchase steel at spot prices as needed each month',
        totalCost: millionsToDollars(spotLaterMean),
        breakdown: [
          { category: 'Mean Cost', amount: millionsToDollars(spotLaterMean) },
          { category: 'P95 (High)', amount: millionsToDollars(spotLaterData.p95_$M) },
          { category: 'P05 (Low)', amount: millionsToDollars(spotLaterData.p05_$M) },
        ],
      },
      {
        name: 'Ladder',
        description: 'Pre-buy in 4 tranches (25% each at T-9, T-6, T-3, T-0 months)',
        totalCost: millionsToDollars(ladderMean),
        breakdown: [
          { category: 'Mean Cost', amount: millionsToDollars(ladderMean) },
          { category: 'P95 (High)', amount: millionsToDollars(ladderData.p95_$M) },
          { category: 'P05 (Low)', amount: millionsToDollars(ladderData.p05_$M) },
        ],
      },
      {
        name: 'Hedge',
        description: 'Lock in 70% at forward prices, buy remaining 30% at spot',
        totalCost: millionsToDollars(hedgeMean),
        breakdown: [
          { category: 'Mean Cost', amount: millionsToDollars(hedgeMean) },
          { category: 'P95 (High)', amount: millionsToDollars(hedgeData.p95_$M) },
          { category: 'P05 (Low)', amount: millionsToDollars(hedgeData.p05_$M) },
        ],
      },
    ];
    console.log('Setting purchasing options:', options);
    console.log('Options length:', options.length);
    console.log('First option:', options[0]);
    setPurchasingOptions(options);
    console.log('Purchasing options state updated');
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
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-2">
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

      <main className="mx-auto max-w-7xl px-6 py-3">
        {/* Summary Section */}
        <div className="mb-3 rounded-lg bg-white p-3 shadow-sm">
          <h2 className="mb-2 text-lg font-bold text-gray-900">
            Project Summary
          </h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div>
              <p className="text-xs font-medium text-gray-500">
                Total Budget (USD)
              </p>
              <p className="mt-0.5 text-xl font-bold text-gray-900">
                ${totalBudget.toLocaleString()}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500">
                Total Steel Required
              </p>
              <p className="mt-0.5 text-xl font-bold text-gray-900">
                {totalSteel.toLocaleString()} tons
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500">
                Number of Projects
              </p>
              <p className="mt-0.5 text-xl font-bold text-gray-900">
                {projects.length}
              </p>
            </div>
          </div>
          <div className="mt-3 space-y-1">
            {projects.map((project, index) => (
              <div
                key={project.id}
                className="flex items-center justify-between rounded border border-gray-200 bg-gray-50 px-3 py-1.5"
              >
                <div>
                  <span className="text-sm font-medium text-gray-900">
                    Project {index + 1}: {project.location}
                  </span>
                </div>
                <div className="flex gap-4 text-xs text-gray-600">
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
        <div className="mb-3 border-b border-gray-200">
          <nav className="-mb-px flex space-x-6">
            <button
              onClick={() => setActiveTab('where')}
              className={`border-b-2 py-2 px-1 text-sm font-medium transition-colors ${
                activeTab === 'where'
                  ? 'border-gray-900 text-gray-900'
                  : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
              }`}
            >
              Where To Buy
            </button>
            <button
              onClick={() => setActiveTab('how')}
              className={`border-b-2 py-2 px-1 text-sm font-medium transition-colors ${
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
          <div className="space-y-3">
            {/* Summary and Regenerate Button */}
            <div className="rounded-lg bg-white p-3 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="mb-1 text-base font-semibold text-gray-900">
                    Procurement Optimization
              </h3>
                  <p className="text-xs text-gray-600">
                    Optimized procurement plans based on your project details, balancing cost and carbon emissions.
                  </p>
                  {projects.length > 0 && (
                    <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-4">
                      <div>
                        <p className="text-xs text-gray-500">Location</p>
                        <p className="text-sm font-medium text-gray-900">
                          {projects[0].location || 'N/A'}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Total Budget</p>
                        <p className="text-sm font-medium text-gray-900">
                          ${projects.reduce((sum: number, p: Project) => 
                            sum + parseFloat(p.budget || '0'), 0).toLocaleString()}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Steel Required</p>
                        <p className="text-sm font-medium text-gray-900">
                          {projects.reduce((sum: number, p: Project) => 
                            sum + parseFloat(p.steelRequired || '0'), 0).toLocaleString()} tons
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Max Suppliers</p>
                        <p className="text-sm font-medium text-gray-900">
                          {optimizationInputs.maxSuppliers || '10'}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
                <button
                  onClick={fetchOptimizationResults}
                  disabled={optimizationLoading}
                  className="ml-4 rounded-lg bg-gray-800 px-6 py-2 font-semibold text-white transition-colors hover:bg-gray-900 disabled:bg-gray-400"
                >
                  {optimizationLoading ? 'Calculating...' : 'Regenerate Plans'}
                </button>
                      </div>
                    </div>

            {/* Loading State */}
            {optimizationLoading && procurementPlans.length === 0 && (
              <div className="rounded-lg bg-white p-6 shadow-sm text-center">
                <div className="mb-2">
                  <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-gray-900"></div>
                              </div>
                <h3 className="mb-1 text-sm font-semibold text-gray-900">
                  Generating Procurement Plans
                </h3>
                <p className="text-xs text-gray-600">
                  Calculating optimal supplier combinations... This may take 10-30 seconds.
                </p>
              </div>
            )}

            {/* Scatter Plot */}
            {procurementPlans.length > 0 && (
              <div className="rounded-lg bg-white p-3 shadow-sm">
                <h3 className="mb-1 text-base font-semibold text-gray-900">
                  Cost vs. Emissions Trade-off
                </h3>
                <p className="mb-2 text-xs text-gray-600">
                  Click on any point to see detailed supplier allocations. Lower left is better (lower cost and emissions).
                </p>
                <div className="h-[350px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <ScatterChart
                      margin={{ top: 10, right: 20, left: 50, bottom: 40 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis
                        type="number"
                        dataKey="total_emissions"
                        name="Emissions"
                        label={{ value: 'Total CO₂ Emissions (tons)', position: 'insideBottom', offset: -10 }}
                        domain={['auto', 'auto']}
                      />
                      <YAxis
                        type="number"
                        dataKey="total_cost"
                        name="Cost"
                        label={{ value: 'Total Cost (USD)', angle: -90, position: 'insideLeft' }}
                        domain={['auto', 'auto']}
                      />
                      <Tooltip
                        cursor={{ strokeDasharray: '3 3' }}
                        content={({ active, payload }) => {
                          if (active && payload && payload[0]) {
                            const data = payload[0].payload;
                            return (
                              <div className="rounded-lg border border-gray-300 bg-white p-3 shadow-lg">
                                <p className="font-semibold text-gray-900">{data.label}</p>
                                <p className="text-sm text-gray-600">
                                  Cost: ${data.total_cost.toLocaleString()}
                                </p>
                                <p className="text-sm text-gray-600">
                                  Emissions: {data.total_emissions.toFixed(2)} tons CO₂
                                </p>
                                <p className="text-sm text-gray-600">
                                  Suppliers: {data.num_suppliers}
                                </p>
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                      <Scatter
                        name="Procurement Plans"
                        data={procurementPlans.map((plan) => ({
                          ...plan,
                          total_cost: plan.total_cost,
                          total_emissions: plan.total_emissions,
                        }))}
                        fill="#8884d8"
                        onClick={(data: any) => {
                          const plan = procurementPlans.find((p) => p.id === data.id);
                          if (plan) {
                            setSelectedPlan(plan);
                          }
                        }}
                        shape={(props: any) => {
                          const { cx, cy, payload } = props;
                          const isSelected = selectedPlan?.id === payload.id;
                          const plan = procurementPlans.find((p: ProcurementPlan) => p.id === payload.id);
                          const fillColor = isSelected
                            ? '#DC2626'
                            : plan?.label.includes('Min-CO2')
                            ? '#10B981'
                            : plan?.label.includes('Min-Cost')
                            ? '#3B82F6'
                            : '#8884d8';
                          
                          const baseRadius = isSelected ? 10 : 7;
                          const strokeWidth = isSelected ? 3 : 0;
                          const strokeColor = '#000000';
                          
                          return (
                            <g>
                              {/* Outer ring for selected point */}
                              {isSelected && (
                                <circle
                                  cx={cx}
                                  cy={cy}
                                  r={baseRadius + 4}
                                  fill="none"
                                  stroke={strokeColor}
                                  strokeWidth={2}
                                  opacity={0.5}
                                />
                              )}
                              {/* Main dot */}
                              <circle
                                cx={cx}
                                cy={cy}
                                r={baseRadius}
                                fill={fillColor}
                                stroke={strokeColor}
                                strokeWidth={strokeWidth}
                                style={{ cursor: 'pointer' }}
                              />
                              {/* Inner highlight for selected */}
                              {isSelected && (
                                <circle
                                  cx={cx}
                                  cy={cy}
                                  r={baseRadius - 2}
                                  fill={fillColor}
                                  opacity={0.8}
                                />
                              )}
                            </g>
                          );
                        }}
                      >
                        {procurementPlans.map((plan, index) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={
                              selectedPlan?.id === plan.id
                                ? '#DC2626'
                                : plan.label.includes('Min-CO2')
                                ? '#10B981'
                                : plan.label.includes('Min-Cost')
                                ? '#3B82F6'
                                : '#8884d8'
                            }
                          />
                        ))}
                      </Scatter>
                    </ScatterChart>
                  </ResponsiveContainer>
                            </div>
                            </div>
            )}

            {/* Selected Plan Details */}
            {selectedPlan && (
              <div className="rounded-lg bg-white p-3 shadow-sm">
                <h3 className="mb-2 text-base font-semibold text-gray-900">
                  Selected Plan: {selectedPlan.label}
                </h3>
                <div className="mb-3 grid grid-cols-1 gap-2 md:grid-cols-3">
                  <div>
                    <p className="text-xs font-medium text-gray-500">Total Cost</p>
                    <p className="mt-0.5 text-lg font-bold text-gray-900">
                      ${selectedPlan.total_cost.toLocaleString()}
                    </p>
                          </div>
                  <div>
                    <p className="text-xs font-medium text-gray-500">Total Emissions</p>
                    <p className="mt-0.5 text-lg font-bold text-gray-900">
                      {selectedPlan.total_emissions.toFixed(2)} tons CO₂
                    </p>
                      </div>
                  <div>
                    <p className="text-xs font-medium text-gray-500">Number of Suppliers</p>
                    <p className="mt-0.5 text-lg font-bold text-gray-900">
                      {selectedPlan.num_suppliers}
                    </p>
                    </div>
                  </div>

                <div>
                  <h4 className="mb-2 text-sm font-semibold text-gray-900">
                    Supplier Allocations
                  </h4>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-gray-200">
                          <th className="px-2 py-1.5 text-left text-xs font-semibold text-gray-900">
                            Supplier
                          </th>
                          <th className="px-2 py-1.5 text-right text-xs font-semibold text-gray-900">
                            Tons
                          </th>
                          <th className="px-2 py-1.5 text-right text-xs font-semibold text-gray-900">
                            Percentage
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(selectedPlan.alloc_tons)
                          .sort(([, a], [, b]) => (b as number) - (a as number))
                          .map(([supplier, tons]) => {
                            const totalTons = Object.values(selectedPlan.alloc_tons).reduce(
                              (sum, t) => sum + (t as number),
                              0
                            );
                            const percentage = ((tons as number) / totalTons) * 100;
                            return (
                              <tr
                                key={supplier}
                                className="border-b border-gray-100 hover:bg-gray-50"
                              >
                                <td className="px-2 py-1.5 text-sm font-medium text-gray-900">
                                  {supplier}
                                </td>
                                <td className="px-2 py-1.5 text-sm text-right text-gray-900">
                                  {(tons as number).toLocaleString(undefined, {
                                    maximumFractionDigits: 2,
                                  })}{' '}
                                  tons
                                </td>
                                <td className="px-2 py-1.5 text-sm text-right text-gray-600">
                                  {percentage.toFixed(1)}%
                                </td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
              </div>
            </div>
              </div>
            )}
          </div>
        )}

        {/* How To Buy Tab */}
        {activeTab === 'how' && (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {/* Purchasing Options Table - Left Side */}
            <div className="rounded-lg bg-white p-3 shadow-sm">
              <h3 className="mb-2 text-base font-semibold text-gray-900">
                Purchasing Strategy Options
              </h3>
              <p className="mb-3 text-xs text-gray-600">
                Compare different purchasing strategies and their associated
                costs.
              </p>

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="px-2 py-1.5 text-left text-xs font-semibold text-gray-900">
                        Strategy
                      </th>
                      <th className="px-2 py-1.5 text-left text-xs font-semibold text-gray-900">
                        Description
                      </th>
                      <th className="px-2 py-1.5 text-right text-xs font-semibold text-gray-900">
                        Cost Breakdown
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {purchasingLoading || purchasingOptions.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="px-2 py-4 text-center">
                          <div className="flex flex-col items-center gap-2">
                            <div className="h-6 w-6 animate-spin rounded-full border-4 border-gray-200 border-t-gray-900"></div>
                            <span className="text-xs text-gray-500">
                              {purchasingLoading ? 'Calling API...' : 'Waiting for data...'}
                            </span>
                            <span className="text-xs text-gray-400">
                              (This should only take a few seconds)
                            </span>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      purchasingOptions.map((option, idx) => (
                      <tr
                        key={idx}
                        className="border-b border-gray-100 hover:bg-gray-50"
                      >
                        <td className="px-2 py-2">
                          <div className="text-sm font-medium text-gray-900">
                            {option.name}
                          </div>
                        </td>
                        <td className="px-2 py-2 text-xs text-gray-600">
                          {option.description}
                        </td>
                        <td className="px-2 py-2 text-right">
                          <div className="space-y-0.5 text-xs text-gray-700">
                            {option.breakdown.map((item, bIdx) => (
                              <div key={bIdx}>
                                {item.category}: ${item.amount.toLocaleString()}
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Forecast Graph - Right Side */}
            <div className="rounded-lg bg-white p-3 shadow-sm">
              <div className="mb-2 flex items-center justify-between">
                <div>
                  <h3 className="text-base font-semibold text-gray-900">
                    12-Month Steel Price Forecast
                  </h3>
                  <p className="mt-0.5 text-xs text-gray-600">
                    Historical and forecasted steel price index (1982 = 100)
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <label htmlFor="scenario-select" className="text-xs font-medium text-gray-700">
                    Scenario:
                  </label>
                  <select
                    id="scenario-select"
                    value={selectedScenario}
                    onChange={(e) => setSelectedScenario(e.target.value)}
                    className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs text-gray-900 shadow-sm focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
                  >
                    {Object.entries(SCENARIO_LABELS).map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="h-[350px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart 
                    data={formatChartData()}
                    margin={{ top: 10, right: 20, left: 50, bottom: 40 }}
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
          </div>
        )}
      </main>
    </div>
  );
}
