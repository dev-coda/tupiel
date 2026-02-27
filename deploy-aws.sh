#!/bin/bash
# AWS App Runner Deployment Script

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}🚀 AWS App Runner Deployment Script${NC}"
echo ""

# Check AWS CLI
if ! command -v aws &> /dev/null; then
    echo -e "${RED}❌ AWS CLI not found. Please install it first.${NC}"
    exit 1
fi

# Check Docker
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

# ECR repositories
BACKEND_REPO="tupiel-backend"
FRONTEND_REPO="tupiel-frontend"
ECR_BASE="${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com"

# Create ECR repositories if they don't exist
echo -e "${GREEN}📦 Creating ECR repositories...${NC}"
aws ecr describe-repositories --repository-names $BACKEND_REPO --region $REGION 2>/dev/null || \
  aws ecr create-repository --repository-name $BACKEND_REPO --region $REGION

aws ecr describe-repositories --repository-names $FRONTEND_REPO --region $REGION 2>/dev/null || \
  aws ecr create-repository --repository-name $FRONTEND_REPO --region $REGION

echo -e "${GREEN}✅ ECR repositories ready${NC}"
echo ""

# Login to ECR
echo -e "${GREEN}🔐 Logging into ECR...${NC}"
aws ecr get-login-password --region $REGION | docker login --username AWS --password-stdin $ECR_BASE
echo ""

# Build and push backend (x86_64 for AWS App Runner)
echo -e "${GREEN}🏗️  Building backend image (x86_64)...${NC}"
cd backend
docker build --platform linux/amd64 -t $BACKEND_REPO:latest .
docker tag $BACKEND_REPO:latest $ECR_BASE/$BACKEND_REPO:latest
echo -e "${GREEN}📤 Pushing backend image...${NC}"
docker push $ECR_BASE/$BACKEND_REPO:latest
cd ..
echo ""

# Build and push frontend (x86_64 for AWS App Runner)
echo -e "${GREEN}🏗️  Building frontend image (x86_64)...${NC}"
cd frontend
docker build --platform linux/amd64 -t $FRONTEND_REPO:latest .
docker tag $FRONTEND_REPO:latest $ECR_BASE/$FRONTEND_REPO:latest
echo -e "${GREEN}📤 Pushing frontend image...${NC}"
docker push $ECR_BASE/$FRONTEND_REPO:latest
cd ..
echo ""

echo -e "${GREEN}✅ Images pushed to ECR${NC}"
echo ""
echo -e "${YELLOW}📋 Next steps:${NC}"
echo "1. Set up RDS MySQL database (see AWS_DEPLOY.md)"
echo "2. Create App Runner service for backend:"
echo "   - Image: $ECR_BASE/$BACKEND_REPO:latest"
echo "   - Port: 3000"
echo "   - Set environment variables (DB_HOST, DB_USER, etc.)"
echo "3. Create App Runner service for frontend:"
echo "   - Image: $ECR_BASE/$FRONTEND_REPO:latest"
echo "   - Port: 80"
echo "   - Set VITE_API_URL to backend App Runner URL"
echo ""
echo -e "${GREEN}🎉 Deployment images ready!${NC}"
