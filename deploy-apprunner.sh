#!/bin/bash
# Complete AWS App Runner Deployment Script

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}🚀 AWS App Runner Complete Deployment${NC}"
echo ""

# Check prerequisites
if ! command -v aws &> /dev/null; then
    echo -e "${RED}❌ AWS CLI not found. Please install it first.${NC}"
    exit 1
fi

if ! command -v docker &> /dev/null; then
    echo -e "${RED}❌ Docker not found. Please install it first.${NC}"
    exit 1
fi

# Get AWS account ID and region
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
REGION=${AWS_REGION:-us-east-1}

echo -e "${YELLOW}Using AWS Account: ${ACCOUNT_ID}${NC}"
echo -e "${YELLOW}Region: ${REGION}${NC}"
echo ""

# Get RDS endpoint
read -p "Enter RDS endpoint (e.g., tupiel-db.xxxxx.us-east-1.rds.amazonaws.com): " RDS_ENDPOINT
if [ -z "$RDS_ENDPOINT" ]; then
    echo -e "${RED}❌ RDS endpoint is required${NC}"
    exit 1
fi

# Get database credentials
read -p "Enter database username [admin]: " DB_USER
DB_USER=${DB_USER:-admin}
read -sp "Enter database password: " DB_PASSWORD
echo ""
read -p "Enter database name [tupiel]: " DB_NAME
DB_NAME=${DB_NAME:-tupiel}

# ECR repositories
BACKEND_REPO="tupiel-backend"
FRONTEND_REPO="tupiel-frontend"
ECR_BASE="${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com"

echo ""
echo -e "${GREEN}📦 Step 1: Setting up ECR repositories...${NC}"

# Create ECR repositories if they don't exist
aws ecr describe-repositories --repository-names $BACKEND_REPO --region $REGION 2>/dev/null || \
  aws ecr create-repository --repository-name $BACKEND_REPO --region $REGION > /dev/null

aws ecr describe-repositories --repository-names $FRONTEND_REPO --region $REGION 2>/dev/null || \
  aws ecr create-repository --repository-name $FRONTEND_REPO --region $REGION > /dev/null

echo -e "${GREEN}✅ ECR repositories ready${NC}"
echo ""

# Login to ECR
echo -e "${GREEN}🔐 Logging into ECR...${NC}"
aws ecr get-login-password --region $REGION | docker login --username AWS --password-stdin $ECR_BASE > /dev/null
echo -e "${GREEN}✅ Logged in${NC}"
echo ""

# Build and push backend
echo -e "${GREEN}🏗️  Building backend image...${NC}"
cd backend
docker build -t $BACKEND_REPO:latest . > /dev/null
docker tag $BACKEND_REPO:latest $ECR_BASE/$BACKEND_REPO:latest
echo -e "${GREEN}📤 Pushing backend image...${NC}"
docker push $ECR_BASE/$BACKEND_REPO:latest > /dev/null
cd ..
echo -e "${GREEN}✅ Backend image pushed${NC}"
echo ""

# Build and push frontend
echo -e "${GREEN}🏗️  Building frontend image...${NC}"
cd frontend
docker build -t $FRONTEND_REPO:latest . > /dev/null
docker tag $FRONTEND_REPO:latest $ECR_BASE/$FRONTEND_REPO:latest
echo -e "${GREEN}📤 Pushing frontend image...${NC}"
docker push $ECR_BASE/$FRONTEND_REPO:latest > /dev/null
cd ..
echo -e "${GREEN}✅ Frontend image pushed${NC}"
echo ""

# Get or create IAM role for App Runner
echo -e "${GREEN}🔐 Setting up IAM role for App Runner...${NC}"
ROLE_NAME="AppRunnerECRAccessRole"
ROLE_ARN=$(aws iam get-role --role-name $ROLE_NAME --query 'Role.Arn' --output text 2>/dev/null || echo "")

if [ -z "$ROLE_ARN" ]; then
    echo -e "${YELLOW}Creating IAM role...${NC}"
    ./setup-apprunner-role.sh > /dev/null 2>&1
    ROLE_ARN=$(aws iam get-role --role-name $ROLE_NAME --query 'Role.Arn' --output text)
fi

if [ -z "$ROLE_ARN" ]; then
    echo -e "${RED}❌ Failed to get IAM role ARN${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Using IAM role: ${ROLE_ARN}${NC}"
echo ""

# Create App Runner service configuration
echo -e "${GREEN}📝 Creating App Runner service configurations...${NC}"

# Backend service config
cat > /tmp/backend-service.json <<EOF
{
  "ServiceName": "tupiel-backend",
  "SourceConfiguration": {
    "ImageRepository": {
      "ImageIdentifier": "${ECR_BASE}/${BACKEND_REPO}:latest",
      "ImageRepositoryType": "ECR",
      "ImageConfiguration": {
        "Port": "3000",
        "RuntimeEnvironmentVariables": {
          "NODE_ENV": "production",
          "PORT": "3000",
          "DB_HOST": "${RDS_ENDPOINT}",
          "DB_PORT": "3306",
          "DB_NAME": "${DB_NAME}",
          "DB_USER": "${DB_USER}",
          "DB_PASSWORD": "${DB_PASSWORD}",
          "USE_LOCAL_DB": "false"
        }
      }
    },
    "AutoDeploymentsEnabled": true,
    "AuthenticationConfiguration": {
      "AccessRoleArn": "${ROLE_ARN}"
    }
  },
  "InstanceConfiguration": {
    "Cpu": "0.5 vCPU",
    "Memory": "1 GB"
  },
  "HealthCheckConfiguration": {
    "Protocol": "HTTP",
    "Path": "/api/health",
    "Interval": 10,
    "Timeout": 5,
    "HealthyThreshold": 1,
    "UnhealthyThreshold": 5
  }
}
EOF

echo -e "${GREEN}✅ Configuration files created${NC}"
echo ""

# Deploy backend
echo -e "${YELLOW}🚀 Deploying backend to App Runner...${NC}"
echo "This may take 5-10 minutes..."

BACKEND_SERVICE_ARN=$(aws apprunner create-service \
  --cli-input-json file:///tmp/backend-service.json \
  --region $REGION \
  --query 'Service.ServiceArn' \
  --output text 2>&1)

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Backend service created: ${BACKEND_SERVICE_ARN}${NC}"
    echo -e "${YELLOW}⏳ Waiting for backend to deploy (this takes ~5 minutes)...${NC}"
    
    # Wait for service to be running
    aws apprunner wait service-running \
      --service-arn "$BACKEND_SERVICE_ARN" \
      --region $REGION
    
    # Get service URL
    BACKEND_URL=$(aws apprunner describe-service \
      --service-arn "$BACKEND_SERVICE_ARN" \
      --region $REGION \
      --query 'Service.ServiceUrl' \
      --output text)
    
    echo -e "${GREEN}✅ Backend deployed! URL: ${BACKEND_URL}${NC}"
else
    echo -e "${YELLOW}⚠️  Backend service may already exist. Checking...${NC}"
    BACKEND_SERVICE_ARN=$(aws apprunner list-services --region $REGION --query "ServiceSummaryList[?ServiceName=='tupiel-backend'].ServiceArn" --output text)
    if [ ! -z "$BACKEND_SERVICE_ARN" ]; then
        echo -e "${GREEN}✅ Found existing backend service${NC}"
        BACKEND_URL=$(aws apprunner describe-service \
          --service-arn "$BACKEND_SERVICE_ARN" \
          --region $REGION \
          --query 'Service.ServiceUrl' \
          --output text)
        echo -e "${GREEN}Backend URL: ${BACKEND_URL}${NC}"
    else
        echo -e "${RED}❌ Failed to create backend service. Please check the error above.${NC}"
        exit 1
    fi
fi

echo ""

# Frontend service config
echo -e "${GREEN}📝 Creating frontend service configuration...${NC}"
cat > /tmp/frontend-service.json <<EOF
{
  "ServiceName": "tupiel-frontend",
  "SourceConfiguration": {
    "ImageRepository": {
      "ImageIdentifier": "${ECR_BASE}/${FRONTEND_REPO}:latest",
      "ImageRepositoryType": "ECR",
      "ImageConfiguration": {
        "Port": "80",
        "RuntimeEnvironmentVariables": {
          "VITE_API_URL": "${BACKEND_URL}"
        }
      }
    },
    "AutoDeploymentsEnabled": true,
    "AuthenticationConfiguration": {
      "AccessRoleArn": "${ROLE_ARN}"
    }
  },
  "InstanceConfiguration": {
    "Cpu": "0.25 vCPU",
    "Memory": "0.5 GB"
  },
  "HealthCheckConfiguration": {
    "Protocol": "HTTP",
    "Path": "/",
    "Interval": 10,
    "Timeout": 5,
    "HealthyThreshold": 1,
    "UnhealthyThreshold": 5
  }
}
EOF

# Deploy frontend
echo -e "${YELLOW}🚀 Deploying frontend to App Runner...${NC}"
FRONTEND_SERVICE_ARN=$(aws apprunner create-service \
  --cli-input-json file:///tmp/frontend-service.json \
  --region $REGION \
  --query 'Service.ServiceArn' \
  --output text 2>&1)

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Frontend service created${NC}"
    echo -e "${YELLOW}⏳ Waiting for frontend to deploy...${NC}"
    
    aws apprunner wait service-running \
      --service-arn "$FRONTEND_SERVICE_ARN" \
      --region $REGION
    
    FRONTEND_URL=$(aws apprunner describe-service \
      --service-arn "$FRONTEND_SERVICE_ARN" \
      --region $REGION \
      --query 'Service.ServiceUrl' \
      --output text)
    
    echo -e "${GREEN}✅ Frontend deployed! URL: ${FRONTEND_URL}${NC}"
else
    echo -e "${YELLOW}⚠️  Frontend service may already exist. Checking...${NC}"
    FRONTEND_SERVICE_ARN=$(aws apprunner list-services --region $REGION --query "ServiceSummaryList[?ServiceName=='tupiel-frontend'].ServiceArn" --output text)
    if [ ! -z "$FRONTEND_SERVICE_ARN" ]; then
        FRONTEND_URL=$(aws apprunner describe-service \
          --service-arn "$FRONTEND_SERVICE_ARN" \
          --region $REGION \
          --query 'Service.ServiceUrl' \
          --output text)
        echo -e "${GREEN}Frontend URL: ${FRONTEND_URL}${NC}"
    fi
fi

echo ""
echo -e "${GREEN}🎉 Deployment Complete!${NC}"
echo ""
echo -e "${BLUE}📋 Service URLs:${NC}"
echo -e "  Backend:  ${BACKEND_URL}"
echo -e "  Frontend: ${FRONTEND_URL}"
echo ""
echo -e "${YELLOW}📝 Next steps:${NC}"
echo "1. Test backend: curl ${BACKEND_URL}/api/health"
echo "2. Open frontend: ${FRONTEND_URL}"
echo "3. Monitor services in AWS App Runner console"
echo ""
