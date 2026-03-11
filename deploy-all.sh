#!/bin/bash
# Complete deployment: Setup RDS, deploy backend, deploy frontend

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}🚀 Complete Deployment Script${NC}"
echo -e "${CYAN}==============================${NC}"
echo ""

# Step 1: Setup RDS database
echo -e "${YELLOW}Step 1: Setting up RDS database...${NC}"
./setup-rds-app-db.sh
if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Database setup failed${NC}"
    exit 1
fi
echo ""

# Step 2: Deploy backend
echo -e "${YELLOW}Step 2: Deploying backend...${NC}"
./deploy-backend.sh
if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Backend deployment failed${NC}"
    exit 1
fi
echo ""

# Step 3: Deploy frontend
echo -e "${YELLOW}Step 3: Deploying frontend...${NC}"
./deploy-frontend.sh
if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Frontend deployment failed${NC}"
    exit 1
fi
echo ""

echo -e "${GREEN}✅ All deployments completed successfully!${NC}"
echo ""
echo -e "${YELLOW}⏳ Services will be available in ~5 minutes${NC}"
echo "Check status with:"
echo "  Backend: aws apprunner describe-service --service-arn arn:aws:apprunner:us-east-1:559954020952:service/tupiel-backend/3442fcc9aed44ef7bec36d8978cb4cba --region us-east-1 --query 'Service.[Status,ServiceUrl]'"
echo "  Frontend: aws apprunner describe-service --service-arn arn:aws:apprunner:us-east-1:559954020952:service/tupiel-frontend/338fb871063c4f5c82587ed9fba6e026 --region us-east-1 --query 'Service.[Status,ServiceUrl]'"
