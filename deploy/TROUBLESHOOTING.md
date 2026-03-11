# Troubleshooting Guide

## Common Issues

### 1. HTTP 301 Redirect to HTTPS (Before SSL Setup)

**Symptom**: All HTTP requests redirect to HTTPS, but HTTPS doesn't work yet.

**Fix**:
```bash
cd deploy/
./fix-http-redirect.sh
```

This restores the HTTP config to serve content over HTTP until SSL is properly configured.

### 2. Database Access Denied

**Symptom**: Backend logs show `Access denied for user 'tupiel_u'@'YOUR_IP'`

**Causes**:
- Vultr server IP not in DigitalOcean trusted sources
- Wrong database password in `.env`

**Fix**:
1. Add Vultr server IP to DigitalOcean database trusted sources:
   - Go to DigitalOcean Dashboard → Databases → Your Database
   - Click "Trusted Sources" or "Firewall"
   - Add your Vultr server IP (e.g., `45.77.160.31`)
   - Save

2. Verify database credentials in `deploy/.env`:
   ```
   DB_HOST=your-digitalocean-db-host
   DB_PORT=25060
   DB_NAME=tupiel
   DB_USER=tupiel_u
   DB_PASSWORD=your-actual-password
   ```

### 3. Exec Format Error

**Symptom**: Containers restart with "exec format error"

**Cause**: Images built for wrong architecture (Mac ARM64 vs Linux AMD64)

**Fix**:
```bash
cd deploy/
./rebuild-images.sh
```

This rebuilds images for `linux/amd64` architecture.

### 4. 502 Bad Gateway

**Symptom**: Nginx returns 502, containers are restarting

**Check**:
```bash
ssh root@YOUR_IP 'cd /opt/tupiel/deploy && docker compose ps'
```

**Common causes**:
- Containers not running (check logs)
- Wrong architecture (see #3)
- Network issues (containers not on same network)

### 5. Frontend Unhealthy

**Symptom**: Frontend container shows "unhealthy" status

**Check logs**:
```bash
ssh root@YOUR_IP 'cd /opt/tupiel/deploy && docker compose logs frontend'
```

**Common causes**:
- Frontend build failed
- Health check endpoint not working
- Container crashing on startup

## Useful Commands

### Check all container statuses
```bash
cd deploy/
./check-containers.sh
```

### Check backend errors
```bash
cd deploy/
./check-errors.sh
```

### View logs
```bash
ssh root@YOUR_IP 'cd /opt/tupiel/deploy && docker compose logs -f'
```

### Restart all services
```bash
ssh root@YOUR_IP 'cd /opt/tupiel/deploy && docker compose restart'
```

### Rebuild and redeploy
```bash
cd deploy/
./rebuild-images.sh
```
