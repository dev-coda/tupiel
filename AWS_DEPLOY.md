# AWS App Runner Deployment Guide

## Overview

This guide covers deploying TuPiel to AWS App Runner with RDS MySQL database.

## Architecture

- **Backend**: AWS App Runner (containerized Node.js)
- **Frontend**: AWS App Runner (containerized Nginx)
- **Database**: AWS RDS MySQL (managed)

## Prerequisites

1. AWS Account
2. AWS CLI installed and configured
3. Docker (for local testing)
4. ECR (Elastic Container Registry) access

## Step 1: Set Up RDS MySQL Database

### Option A: AWS Console

1. Go to **RDS Console** → **Create database**
2. Choose **MySQL**
3. Configuration:
   - **Template**: Free tier (or Production)
   - **DB Instance Identifier**: `tupiel-db`
   - **Master Username**: `admin` (or your choice)
   - **Master Password**: (strong password)
   - **DB Instance Class**: `db.t3.micro` (free tier) or larger
   - **Storage**: 20 GB (free tier) or more
   - **VPC**: Default or create new
   - **Public Access**: **Yes** (for App Runner access)
   - **Security Group**: Create new or use existing
4. Click **Create database**
5. Wait for database to be available (~5 minutes)
6. Note the **Endpoint** (e.g., `tupiel-db.xxxxx.us-east-1.rds.amazonaws.com`)

### Option B: AWS CLI

```bash
aws rds create-db-instance \
  --db-instance-identifier tupiel-db \
  --db-instance-class db.t3.micro \
  --engine mysql \
  --master-username admin \
  --master-user-password YourStrongPassword123! \
  --allocated-storage 20 \
  --publicly-accessible \
  --backup-retention-period 7
```

### Configure Security Group

1. Go to **EC2 Console** → **Security Groups**
2. Find the security group for your RDS instance
3. **Edit Inbound Rules**:
   - Type: MySQL/Aurora
   - Port: 3306
   - Source: Your App Runner security group or `0.0.0.0/0` (for testing, restrict later)

## Step 2: Import Database

### Option A: From Local Dump

```bash
# If you have a local dump
mysql -h <RDS_ENDPOINT> -u admin -p tupiel < dump.sql
```

### Option B: From Production

```bash
# Export from production
mysqldump -h <PROD_HOST> -u <USER> -p tupiel > dump.sql

# Import to RDS
mysql -h <RDS_ENDPOINT> -u admin -p tupiel < dump.sql
```

## Step 3: Build and Push Docker Images to ECR

### Create ECR Repositories

```bash
# Backend repository
aws ecr create-repository --repository-name tupiel-backend --region us-east-1

# Frontend repository
aws ecr create-repository --repository-name tupiel-frontend --region us-east-1
```

### Login to ECR

```bash
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin <ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com
```

### Build and Push Backend

```bash
cd backend
docker build -t tupiel-backend .
docker tag tupiel-backend:latest <ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/tupiel-backend:latest
docker push <ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/tupiel-backend:latest
```

### Build and Push Frontend

```bash
cd frontend
docker build -t tupiel-frontend .
docker tag tupiel-frontend:latest <ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/tupiel-frontend:latest
docker push <ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/tupiel-frontend:latest
```

## Step 4: Deploy Backend to App Runner

### Option A: AWS Console

1. Go to **App Runner Console** → **Create service**
2. **Source**: Container registry (ECR)
3. **Container image URI**: Select `tupiel-backend:latest`
4. **Deployment trigger**: Manual or Automatic
5. **Service settings**:
   - **Service name**: `tupiel-backend`
   - **Virtual CPU**: 0.5 vCPU (or 1 vCPU)
   - **Memory**: 1 GB (or 2 GB)
   - **Port**: 3000
   - **Start command**: (leave default)
6. **Environment variables**:
   ```
   NODE_ENV=production
   PORT=3000
   DB_HOST=<RDS_ENDPOINT>
   DB_PORT=3306
   DB_NAME=tupiel
   DB_USER=admin
   DB_PASSWORD=<YOUR_RDS_PASSWORD>
   USE_LOCAL_DB=false
   ```
7. Click **Create & deploy**

### Option B: AWS CLI

```bash
aws apprunner create-service \
  --service-name tupiel-backend \
  --source-configuration '{
    "ImageRepository": {
      "ImageIdentifier": "<ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/tupiel-backend:latest",
      "ImageRepositoryType": "ECR",
      "ImageConfiguration": {
        "Port": "3000"
      }
    },
    "AutoDeploymentsEnabled": true
  }' \
  --instance-configuration '{
    "Cpu": "0.5 vCPU",
    "Memory": "1 GB"
  }' \
  --environment-variables \
    NODE_ENV=production \
    PORT=3000 \
    DB_HOST=<RDS_ENDPOINT> \
    DB_PORT=3306 \
    DB_NAME=tupiel \
    DB_USER=admin \
    DB_PASSWORD=<YOUR_PASSWORD> \
    USE_LOCAL_DB=false
```

## Step 5: Deploy Frontend to App Runner

1. **Create service** → **Container registry**
2. **Container image URI**: `tupiel-frontend:latest`
3. **Service name**: `tupiel-frontend`
4. **Port**: 80
5. **Environment variables**:
   ```
   VITE_API_URL=https://<BACKEND_APP_RUNNER_URL>
   ```
6. **Create & deploy**

## Step 6: Update Frontend API URL

After backend is deployed, update frontend environment variable with the actual backend URL:

1. Go to **App Runner** → `tupiel-frontend` → **Configuration**
2. Edit environment variables
3. Set `VITE_API_URL` to your backend App Runner URL
4. Redeploy

## Step 7: Custom Domain (Optional)

1. Go to **App Runner** → Your service → **Custom domains**
2. Add your domain
3. Follow DNS configuration instructions

## Cost Estimation

- **App Runner**: ~$0.007/vCPU-hour + $0.0008/GB-hour
  - Backend (0.5 vCPU, 1GB): ~$5-10/month
  - Frontend (0.25 vCPU, 0.5GB): ~$3-5/month
- **RDS MySQL (db.t3.micro)**: ~$15/month (free tier: 750 hours/month for 12 months)
- **ECR**: ~$0.10/GB/month (first 500MB free)
- **Total**: ~$20-30/month (or free for first year with free tier)

## Troubleshooting

### Backend can't connect to RDS

1. Check security group allows MySQL (port 3306) from App Runner
2. Verify RDS is publicly accessible
3. Check environment variables are correct
4. Check App Runner logs: **App Runner** → Service → **Logs**

### Frontend can't reach backend

1. Verify `VITE_API_URL` is set correctly
2. Check CORS settings in backend
3. Verify backend health endpoint: `https://<backend-url>/api/health`

### Database connection timeout

1. Ensure RDS security group allows App Runner IPs
2. Check RDS is in same region as App Runner (recommended)
3. Verify database credentials

## Quick Deploy Script

See `deploy-aws.sh` for automated deployment.

## Monitoring

- **App Runner**: Built-in metrics in CloudWatch
- **RDS**: CloudWatch metrics for database performance
- **Logs**: App Runner logs in CloudWatch Logs

## Security Best Practices

1. Use AWS Secrets Manager for database passwords
2. Restrict RDS security group to App Runner only
3. Enable RDS encryption at rest
4. Use HTTPS (App Runner provides by default)
5. Regular database backups (RDS automated backups)
