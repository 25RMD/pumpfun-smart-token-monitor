# Pump.fun Migration Monitor

Real-time monitoring and scam detection for Pump.fun migrated tokens on Solana. This application connects to PumpPortal's WebSocket feed to track token migrations and analyzes them using multiple data sources to calculate a risk score.

## Features

- 🔄 **Real-time Monitoring**: Live WebSocket connection to PumpPortal for instant migration alerts
- 🔍 **Scam Detection**: Multi-factor analysis including wash trading, holder distribution, developer holdings, and more
- 📊 **Risk Scoring**: 0-100 score based on multiple indicators
- 🎯 **Smart Filtering**: Customizable filters to show only tokens that meet your criteria
- 📈 **Detailed Analytics**: View score breakdowns, holder stats, and warning flags
- 🔗 **Quick Actions**: Direct links to Jupiter, DexScreener, and more

## Architecture

```
┌─────────────────┐
│  PumpPortal WS  │ ──→ Migration Events
└─────────────────┘
         │
         ↓
┌─────────────────┐
│  Backend Server │ ──→ Data Fetching & Analysis
│  (Node.js/WS)   │     (Moralis, Bitquery, Helius)
└─────────────────┘
         │
         ↓
┌─────────────────┐
│  Next.js App    │ ──→ React Dashboard
│  (Frontend)     │
└─────────────────┘
```

## Scam Detection Criteria

| Check | Description | Max Penalty |
|-------|-------------|-------------|
| Wash Trading | Detects same wallet buying/selling frequently | -30 |
| Holder Distribution | Checks for concentration and low holder count | -35 |
| Developer Holdings | Flags high dev token ownership | -20 |
| Volume Manipulation | Identifies fake volume patterns | -35 |
| Airdrop Schemes | Detects airdrop dump patterns | -25 |
| Social Signals | Checks for missing socials/low-effort description | -15 |

## Tech Stack

- **Frontend**: Next.js 14, React, TypeScript, Tailwind CSS
- **State Management**: Zustand
- **Backend**: Node.js, WebSocket (ws), Socket.IO
- **APIs**: Moralis, Bitquery, Helius

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn
- API keys for Moralis, Bitquery, and Helius

### Installation

1. Clone the repository:
```bash
git clone <your-repo-url>
cd pumpmonitor
```

2. Install dependencies:
```bash
npm install
```

3. Configure environment variables in `.env.local`:
```env
PORT=3001
NEXT_PUBLIC_WS_URL=http://localhost:3001

MORALIS_API_KEY=your_moralis_key
BITQUERY_API_KEY=your_bitquery_key
HELIUS_API_KEY=your_helius_key

PUMPPORTAL_WS_URL=wss://pumpportal.fun/api/data

MIN_SCORE_THRESHOLD=60
MAX_DEV_HOLDINGS=0.15
MIN_HOLDERS=50
```

### Development

Run both the frontend and WebSocket server:
```bash
npm run dev:all
```

Or run them separately:
```bash
# Terminal 1 - Next.js frontend
npm run dev

# Terminal 2 - WebSocket server
npm run dev:server
```

The app will be available at [http://localhost:3000](http://localhost:3000).

### Production

Build and start:
```bash
npm run build
npm run start
```

## Project Structure

```
src/
├── app/                    # Next.js app router
│   ├── api/               # API routes
│   │   ├── tokens/        # Token endpoints
│   │   ├── analyze/       # Manual analysis
│   │   └── stats/         # Statistics
│   ├── page.tsx           # Main dashboard
│   └── layout.tsx         # Root layout
├── components/            # React components
│   ├── Dashboard/         # Dashboard components
│   ├── TokenCard/         # Token card components
│   ├── TokenDetail/       # Token detail modal
│   └── common/            # Shared UI components
├── hooks/                 # Custom React hooks
├── services/              # Backend services
│   ├── moralis.service.ts # Moralis API
│   ├── bitquery.service.ts# Bitquery GraphQL
│   ├── helius.service.ts  # Helius RPC
│   ├── scam-filter.engine.ts # Detection logic
│   └── token-processor.ts # Main processor
├── store/                 # Zustand store
├── types/                 # TypeScript types
└── server.ts             # WebSocket server
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/tokens` | GET | Get all processed tokens |
| `/api/tokens?passed=true` | GET | Get only passed tokens |
| `/api/tokens/[address]` | GET | Get specific token |
| `/api/analyze` | POST | Analyze token manually |
| `/api/stats` | GET | Get monitoring statistics |

## Filter Settings

| Setting | Default | Description |
|---------|---------|-------------|
| Minimum Score | 60 | Only show tokens above this score |
| Max Dev Holdings | 15% | Maximum developer token ownership |
| Min Holders | 50 | Minimum unique holders required |
| Hide Wash Trading | ✓ | Filter out wash trading tokens |
| Hide Airdrops | ✓ | Filter out airdrop schemes |
| Hide Volume Bots | ✓ | Filter out volume manipulation |

## Disclaimer

⚠️ **This tool is for informational purposes only.** Always do your own research (DYOR) before trading any tokens. The scam detection is based on heuristics and patterns and may produce false positives or negatives. Trading cryptocurrencies involves significant risk of loss.

## License

MIT

## Contributing

Contributions are welcome! Please open an issue or submit a pull request.
