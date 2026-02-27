# Deployment Guide

## Quick Deploy Options

### 1. Vercel (Frontend) + Railway (Backend) - Recommended

#### Frontend on Vercel
1. Push code to GitHub
2. Go to [vercel.com](https://vercel.com)
3. Import your repository
4. Set root directory to `frontend`
5. Build command: `npm run build`
6. Output directory: `dist/frontend`
7. Add environment variable: `VITE_API_URL` (if using)

#### Backend on Railway
1. Go to [railway.app](https://railway.app)
2. New Project → Deploy from GitHub
3. Select repository
4. Set root directory to `backend`
5. Add environment variables from `.env`
6. Railway auto-detects Node.js and runs `npm start`

### 2. Render (Full Stack)

#### Frontend
1. Go to [render.com](https://render.com)
2. New Static Site
3. Connect GitHub repo
4. Root directory: `frontend`
5. Build: `npm run build`
6. Publish: `dist/frontend`

#### Backend
1. New Web Service
2. Root directory: `backend`
3. Build: `npm install && npm run build`
4. Start: `npm start`
5. Add environment variables

### 3. DigitalOcean App Platform

1. Create new app
2. Connect GitHub
3. Add services:
   - Frontend (static site, root: `frontend`)
   - Backend (web service, root: `backend`)
4. Configure environment variables
5. Deploy

## Environment Variables

### Backend (.env)
```env
DB_HOST=your-production-db-host
DB_PORT=25060
DB_NAME=tupiel
DB_USER=tupiel_u
DB_PASSWORD=your-password
USE_LOCAL_DB=false
PORT=3000
```

### Frontend
If using separate deployments, configure API proxy or set:
```env
VITE_API_URL=https://your-backend-url.com
```

## Build Commands

### Backend
```bash
cd backend
npm install
npm run build
npm start
```

### Frontend
```bash
cd frontend
npm install
npm run build
# Output in dist/frontend/
```

## Production Checklist

- [ ] Set all environment variables
- [ ] Enable CORS for frontend domain
- [ ] Configure database connection pooling
- [ ] Set up error logging (e.g., Sentry)
- [ ] Configure SSL/HTTPS
- [ ] Set up monitoring (health checks)
- [ ] Test database toggle functionality
- [ ] Verify Excel downloads work
- [ ] Test all report types

## Database Security

- Use read-only database user
- Whitelist deployment server IPs
- Use connection pooling (already configured)
- Set appropriate connection limits
- Monitor query performance

## Troubleshooting

### Backend won't start
- Check environment variables
- Verify database connection
- Check port availability

### Frontend can't reach backend
- Verify CORS settings
- Check API URL configuration
- Ensure backend is running

### Excel downloads fail
- Check file size limits
- Verify ExcelJS is installed
- Check write permissions
