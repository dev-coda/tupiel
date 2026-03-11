#!/bin/bash
# Build, push, and deploy frontend to AWS App Runner

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}🚀 Frontend Deployment Script${NC}"
echo ""

# Check prerequisites
if ! command -v aws &> /dev/null; then
    echo -e "${RED}❌ AWS CLI not found${NC}"
    exit 1
fi

if ! command -v docker &> /dev/null; then
    echo -e "${RED}❌ Docker not found${NC}"
    exit 1
fi

# Get AWS account ID and region
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
REGION="us-east-1"
ECR_BASE="${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com"
FRONTEND_REPO="tupiel-frontend"
SERVICE_ARN="arn:aws:apprunner:us-east-1:559954020952:service/tupiel-frontend/338fb871063c4f5c82587ed9fba6e026"

echo -e "${YELLOW}Account: ${ACCOUNT_ID}${NC}"
echo -e "${YELLOW}Region: ${REGION}${NC}"
echo ""

# Login to ECR
echo -e "${YELLOW}🔐 Logging into ECR...${NC}"
aws ecr get-login-password --region $REGION | docker login --username AWS --password-stdin $ECR_BASE
echo -e "${GREEN}✅ Logged in${NC}"
echo ""

# Build frontend image
echo -e "${YELLOW}🏗️  Building frontend image (x86_64 for App Runner)...${NC}"
cd frontend
docker build --platform linux/amd64 -t $FRONTEND_REPO:latest .
echo -e "${GREEN}✅ Build complete${NC}"

# Tag and push
echo -e "${YELLOW}📤 Tagging and pushing to ECR...${NC}"
docker tag $FRONTEND_REPO:latest $ECR_BASE/$FRONTEND_REPO:latest
docker push $ECR_BASE/$FRONTEND_REPO:latest
cd ..
echo -e "${GREEN}✅ Image pushed to ECR${NC}"
echo ""

# Get backend URL for frontend config
echo -e "${YELLOW}🔍 Getting backend URL...${NC}"
BACKEND_SERVICE_ARN=$(aws apprunner list-services --region $REGION \
  --query "ServiceSummaryList[?ServiceName=='tupiel-backend'].ServiceArn" --output text)

if [ -z "$BACKEND_SERVICE_ARN" ]; then
    echo -e "${RED}❌ Backend service not found${NC}"
    exit 1
fi

# Wait for backend to finish any in-progress operations
echo -e "${YELLOW}⏳ Waiting for backend service to be ready...${NC}"
MAX_WAIT=300  # 5 minutes max
WAIT_TIME=0
while [ $WAIT_TIME -lt $MAX_WAIT ]; do
    STATUS=$(aws apprunner describe-service \
      --service-arn "$BACKEND_SERVICE_ARN" \
      --region $REGION \
      --query 'Service.Status' \
      --output text 2>/dev/null || echo "UNKNOWN")
    
    OPERATION_STATUS=$(aws apprunner list-operations \
      --service-arn "$BACKEND_SERVICE_ARN" \
      --region $REGION \
      --query 'OperationSummaryList[0].Status' \
      --output text 2>/dev/null || echo "SUCCEEDED")
    
    if [ "$STATUS" = "RUNNING" ] && [ "$OPERATION_STATUS" != "IN_PROGRESS" ]; then
        echo -e "${GREEN}✅ Backend service is ready${NC}"
        break
    fi
    
    echo -e "${YELLOW}   Backend status: ${STATUS}, Operation: ${OPERATION_STATUS}... waiting 10s${NC}"
    sleep 10
    WAIT_TIME=$((WAIT_TIME + 10))
done

if [ $WAIT_TIME -ge $MAX_WAIT ]; then
    echo -e "${YELLOW}⚠️  Backend still not ready after 5 minutes, proceeding anyway...${NC}"
fi

BACKEND_URL=$(aws apprunner describe-service \
  --service-arn "$BACKEND_SERVICE_ARN" \
  --region $REGION \
  --query 'Service.ServiceUrl' \
  --output text)

echo -e "${GREEN}Backend URL: ${BACKEND_URL}${NC}"
echo ""

# Update frontend service with new image and backend URL
echo -e "${YELLOW}🔄 Updating frontend service...${NC}"
ROLE_ARN=$(aws iam get-role --role-name AppRunnerECRAccessRole --query 'Role.Arn' --output text)

cat > /tmp/frontend-update.json <<EOF
{
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
  }
}
EOF

# Retry logic for service update (in case backend is still updating)
MAX_RETRIES=5
RETRY_COUNT=0
UPDATE_SUCCESS=false

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    if aws apprunner update-service \
      --service-arn "$SERVICE_ARN" \
      --region "$REGION" \
      --cli-input-json file:///tmp/frontend-update.json \
      --query 'Service.[ServiceArn,Status]' \
      --output text 2>&1; then
        UPDATE_SUCCESS=true
        break
    else
        ERROR=$(aws apprunner update-service \
          --service-arn "$SERVICE_ARN" \
          --region "$REGION" \
          --cli-input-json file:///tmp/frontend-update.json \
          --query 'Service.[ServiceArn,Status]' \
          --output text 2>&1)
        
        if echo "$ERROR" | grep -q "OPERATION_IN_PROGRESS"; then
            RETRY_COUNT=$((RETRY_COUNT + 1))
            echo -e "${YELLOW}⚠️  Service update in progress, waiting 30s before retry ($RETRY_COUNT/$MAX_RETRIES)...${NC}"
            sleep 30
        else
            echo -e "${RED}❌ Failed to update frontend service: $ERROR${NC}"
            exit 1
        fi
    fi
done

if [ "$UPDATE_SUCCESS" = true ]; then
    echo ""
    echo -e "${GREEN}✅ Frontend service update initiated${NC}"
    echo -e "${YELLOW}⏳ Service will redeploy automatically (takes ~5 minutes)${NC}"
else
    echo -e "${RED}❌ Failed to update frontend service after $MAX_RETRIES retries${NC}"
    exit 1
fi
echo ""
echo "Check status with:"
echo "aws apprunner describe-service --service-arn $SERVICE_ARN --region $REGION --query 'Service.[Status,ServiceUrl]'"
