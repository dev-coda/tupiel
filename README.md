# TuPiel Reporting System

A full-stack web application for generating comprehensive financial and operational reports from the TuPiel database.

## Features

- 📊 **Interactive Dashboard**: Real-time PPTO control dashboard with charts and KPIs
- 📈 **Multiple Report Types**: 
  - Rentabilidad (Executed)
  - Rentabilidad Estimada (Estimated)
  - Controlador PPTO (Master Budget Controller)
- 🔄 **Database Toggle**: Switch between local and remote databases
- 📥 **Excel Export**: Download reports as formatted Excel files
- 🖨️ **Print Support**: Print-friendly dashboard views

## Tech Stack

### Backend
- Node.js + Express
- TypeScript
- MySQL2 (read-only connections)
- ExcelJS (Excel generation)

### Frontend
- Angular 21 (Standalone components)
- PrimeNG 21 (UI components)
- Chart.js (Data visualization)
- Signals API

## Setup

### Prerequisites
- Node.js 18+
- MySQL (for local database)
- npm or yarn

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd TuPiel
```

2. Install dependencies:
```bash
# Backend
cd backend
npm install

# Frontend
cd ../frontend
npm install
```

3. Configure environment variables:

Create `.env` in the `backend` directory:
```env
# Database Configuration
DB_HOST=your-db-host
DB_PORT=25060
DB_NAME=tupiel
DB_USER=tupiel_u
DB_PASSWORD=your-password

# Local Database (optional)
USE_LOCAL_DB=false
LOCAL_DB_HOST=localhost
LOCAL_DB_PORT=3306
LOCAL_DB_NAME=tupiel
LOCAL_DB_USER=root
LOCAL_DB_PASSWORD=

# Server
PORT=3000
```

4. Start the development servers:

```bash
# Terminal 1: Backend
cd backend
npm run dev

# Terminal 2: Frontend
cd frontend
npm start
```

The application will be available at:
- Frontend: http://localhost:4200
- Backend API: http://localhost:3000

## Database Toggle

You can toggle between local and remote databases using:
1. The UI toggle button in the top-right menu bar
2. Setting `USE_LOCAL_DB=true` in `.env` file

**Note**: After changing the database mode, restart the backend server.

## Deployment

### Option 1: Vercel (Frontend) + Railway/Render (Backend)

#### Frontend (Vercel)
1. Install Vercel CLI: `npm i -g vercel`
2. Deploy: `cd frontend && vercel`
3. Configure proxy in `vercel.json` or use environment variables

#### Backend (Railway/Render)
1. Connect your repository
2. Set environment variables
3. Build command: `cd backend && npm install && npm run build`
4. Start command: `cd backend && npm start`

### Option 2: Docker

```dockerfile
# Dockerfile example
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
```

### Option 3: Traditional Server

1. Build the frontend:
```bash
cd frontend
npm run build
```

2. Build the backend:
```bash
cd backend
npm run build
```

3. Use PM2 or similar to run the backend:
```bash
pm2 start backend/dist/index.js --name tupiel-api
```

4. Serve frontend with nginx or similar

## Project Structure

```
TuPiel/
├── backend/
│   ├── src/
│   │   ├── config/        # Database and app config
│   │   ├── routes/        # API routes
│   │   ├── services/      # Business logic
│   │   └── cli/           # CLI tools
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   ├── components/ # Angular components
│   │   │   ├── services/   # API services
│   │   │   └── models/     # TypeScript models
│   └── package.json
└── README.md
```

## API Endpoints

- `GET /api/health` - Health check
- `GET /api/dashboard?from=YYYY-MM-DD&to=YYYY-MM-DD` - Dashboard data
- `GET /api/reports/rentabilidad?from=...&to=...` - Rentabilidad report
- `GET /api/reports/rentabilidad-estimada?from=...&to=...` - Estimated report
- `GET /api/reports/controlador?from=...&to=...` - Controlador Excel download
- `GET /api/db-toggle` - Get current DB mode
- `POST /api/db-toggle` - Toggle DB mode

## CLI Tools

Generate reports from command line:

```bash
# Rentabilidad report
npx ts-node backend/src/cli/generate-report.ts --type rentabilidad --from 2026-02-01 --to 2026-02-28

# Controlador report
npx ts-node backend/src/cli/generate-report.ts --type controlador --from 2026-02-01 --to 2026-02-28 --output report.xlsx
```

## License

Private - TuPiel Internal Use
