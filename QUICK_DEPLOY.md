# Quick Deployment Guide - AWS App Runner

## Prerequisites ✅

- [x] RDS MySQL database created
- [x] Database imported
- [x] Security group configured
- [ ] AWS CLI configured
- [ ] Docker installed

## One-Command Deployment 🚀

Run the complete deployment script:

```bash
./deploy-apprunner.sh
```

This script will:
1. ✅ Build Docker images for backend and frontend
2. ✅ Push images to ECR
3. ✅ Create App Runner services
4. ✅ Configure environment variables
5. ✅ Deploy both services
6. ✅ Give you the URLs

**Time: ~10-15 minutes**

## Manual Steps (if script fails)

### Step 1: Build and Push Images

```bash
./deploy-aws.sh
```

### Step 2: Create Backend Service

Go to **AWS App Runner Console** → **Create service**:

1. **Source**: Container registry (ECR)
2. **Container image**: Select `tupiel-backend:latest`
3. **Service name**: `tupiel-backend`
4. **Port**: `3000`
5. **Environment variables**:
   ```
   NODE_ENV=production
   PORT=3000
   DB_HOST=<RDS_ENDPOINT>
   DB_PORT=3306
   DB_NAME=tupiel
   DB_USER=admin
   DB_PASSWORD=<YOUR_PASSWORD>
   USE_LOCAL_DB=false
   ```
6. **CPU**: 0.5 vCPU
7. **Memory**: 1 GB
8. **Health check**: `/api/health`
9. Click **Create & deploy**

Wait ~5 minutes for deployment.

### Step 3: Get Backend URL

After backend deploys, note the service URL (e.g., `https://xxxxx.us-east-1.awsapprunner.com`)

### Step 4: Create Frontend Service

1. **Source**: Container registry (ECR)
2. **Container image**: Select `tupiel-frontend:latest`
3. **Service name**: `tupiel-frontend`
4. **Port**: `80`
5. **Environment variables**:
   ```
   VITE_API_URL=https://<BACKEND_URL>
   ```
6. **CPU**: 0.25 vCPU
7. **Memory**: 0.5 GB
8. Click **Create & deploy**

## Verify Deployment

```bash
# Test backend
curl https://<BACKEND_URL>/api/health

# Should return:
# {"status":"healthy","database":"connected",...}
```

## Troubleshooting

### Backend can't connect to RDS

1. Check RDS security group allows App Runner
2. Verify environment variables are correct
3. Check App Runner logs in CloudWatch

### Frontend shows errors

1. Verify `VITE_API_URL` is set correctly
2. Check browser console for CORS errors
3. Ensure backend is running

### View Logs

```bash
# Backend logs
aws apprunner list-operations --service-arn <BACKEND_ARN> --region us-east-1

# Or in AWS Console:
# App Runner → Service → Logs
```

## Cost

- Backend: ~$5-10/month
- Frontend: ~$3-5/month
- **Total: ~$8-15/month**

## Update Deployment

After code changes:

```bash
# Rebuild and push
./deploy-aws.sh

# App Runner will auto-deploy if AutoDeploymentsEnabled is true
# Or manually trigger: App Runner → Service → Deploy
```
