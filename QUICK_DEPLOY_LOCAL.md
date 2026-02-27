# Quick Deploy with Local Database

## Option 1: Railway (Fastest - 5 minutes) ⚡

Railway is the fastest way to deploy with local DB support.

### Steps:

1. **Go to [railway.app](https://railway.app)** and sign up/login

2. **Create New Project** → Deploy from GitHub
   - Connect your GitHub account
   - Select the TuPiel repository
   - Railway auto-detects Node.js

3. **Configure Backend Service:**
   - Root Directory: `backend`
   - Build Command: `npm install && npm run build`
   - Start Command: `npm start`
   - Port: Railway auto-assigns (use `PORT` env var)

4. **Add Environment Variables:**
   ```
   USE_LOCAL_DB=true
   LOCAL_DB_HOST=your-local-db-host
   LOCAL_DB_PORT=3306
   LOCAL_DB_NAME=tupiel
   LOCAL_DB_USER=root
   LOCAL_DB_PASSWORD=your-local-password
   PORT=3000
   ```

5. **Deploy Frontend (Separate Service):**
   - New Service → Static Site
   - Root Directory: `frontend`
   - Build Command: `npm install && npm run build`
   - Output Directory: `dist/frontend`
   - Add environment variable: `VITE_API_URL=https://your-backend-url.railway.app`

**Time: ~5 minutes | Cost: Free tier available**

---

## Option 2: Render (Also Fast) 🚀

### Backend:
1. Go to [render.com](https://render.com)
2. New → Web Service
3. Connect GitHub repo
4. Settings:
   - Root Directory: `backend`
   - Build: `npm install && npm run build`
   - Start: `npm start`
5. Add environment variables (same as Railway)

### Frontend:
1. New → Static Site
2. Root Directory: `frontend`
3. Build: `npm run build`
4. Publish: `dist/frontend`

**Time: ~10 minutes | Cost: Free tier available**

---

## Option 3: Local + ngrok (Instant, for testing) 🔧

If you just want to test quickly:

1. **Run locally:**
   ```bash
   # Terminal 1: Backend
   cd backend
   npm run dev
   
   # Terminal 2: Frontend  
   cd frontend
   npm start
   ```

2. **Expose with ngrok:**
   ```bash
   # Install ngrok: https://ngrok.com
   ngrok http 4200  # Frontend
   ngrok http 3000  # Backend (separate terminal)
   ```

3. **Update frontend proxy** to use ngrok backend URL

**Time: 2 minutes | Cost: Free**

---

## Option 4: Docker Compose (Best for Local Dev) 🐳

Create `docker-compose.yml`:

```yaml
version: '3.8'
services:
  backend:
    build: ./backend
    ports:
      - "3000:3000"
    environment:
      - USE_LOCAL_DB=true
      - LOCAL_DB_HOST=db
      - LOCAL_DB_PORT=3306
      - LOCAL_DB_NAME=tupiel
      - LOCAL_DB_USER=root
      - LOCAL_DB_PASSWORD=password
    depends_on:
      - db
  
  frontend:
    build: ./frontend
    ports:
      - "4200:80"
    depends_on:
      - backend
  
  db:
    image: mysql:8.0
    environment:
      - MYSQL_ROOT_PASSWORD=password
      - MYSQL_DATABASE=tupiel
    volumes:
      - mysql_data:/var/lib/mysql
    ports:
      - "3306:3306"

volumes:
  mysql_data:
```

Then: `docker-compose up`

---

## Recommended: Railway (Fastest & Easiest)

Railway is the best choice because:
- ✅ Auto-deploys on git push
- ✅ Free tier with 500 hours/month
- ✅ Easy environment variable management
- ✅ Automatic HTTPS
- ✅ Built-in database support (if needed later)
- ✅ Simple local DB connection

### Quick Railway Setup:

```bash
# After pushing to GitHub
1. Go to railway.app
2. New Project → GitHub
3. Select repo
4. Add environment variables
5. Deploy!
```

**Total time: 5 minutes** 🎉
