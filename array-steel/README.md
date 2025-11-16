# SteelAdvisory - Steel Procurement Optimization Tool

A web application for optimizing steel procurement decisions, balancing cost and sustainability through data-driven recommendations.

## Features

- **Project Input**: Enter multiple project details (location, budget, steel requirements, due dates)
- **Where To Buy**: Sustainable sourcing recommendations with CO2 emissions analysis
- **How To Buy**: 12-month steel price forecasts and purchasing strategy comparisons

## Setup Instructions

### Prerequisites

- Node.js 18+ and npm
- Python 3.12+
- pip (Python package manager)

### Frontend Setup

1. Install dependencies:
```bash
npm install
```

2. Run the development server:
```bash
npm run dev
```

The frontend will be available at [http://localhost:3000](http://localhost:3000)

### Backend Setup

1. Navigate to the backend directory:
```bash
cd backend
```

2. Create a virtual environment (recommended):
```bash
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

3. Install Python dependencies:
```bash
pip install --upgrade pip setuptools wheel
pip install -r requirements.txt
```

4. Start the FastAPI server:
```bash
uvicorn main:app --reload --port 8000
```

The backend API will be available at [http://localhost:8000](http://localhost:8000)

### Running the Application

1. Start the backend server (in one terminal):
```bash
cd backend
source venv/bin/activate
uvicorn main:app --reload --port 8000
```

2. Start the frontend server (in another terminal):
```bash
npm run dev
```

3. Open [http://localhost:3000](http://localhost:3000) in your browser

## Project Structure

```
array-steel/
├── app/                    # Next.js frontend application
│   ├── page.tsx           # Input page for project details
│   └── results/           # Results page with recommendations
├── backend/               # FastAPI backend
│   ├── main.py           # API endpoints
│   ├── analysis/         # Procurement analysis scripts
│   ├── models/           # ML model files
│   └── requirements.txt  # Python dependencies
└── package.json          # Node.js dependencies
```

## API Endpoints

- `GET /health` - Health check
- `POST /api/steel-forecast` - Get steel price forecast (12 months)
- `POST /api/sustainable-sourcing` - Get sustainable sourcing options
- `POST /api/procurement-analysis` - Get purchasing strategy analysis

## Notes

- The backend uses an ARIMA model for steel price forecasting
- Historical data is shown for context (24 months)
- Forecast data uses 1982 = 100 as the base index
- The frontend will use mock data if the backend is not running
