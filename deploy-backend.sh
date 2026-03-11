#!/bin/bash
# Build, push, and deploy backend to AWS App Runner with all environment variables

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}🚀 Backend Deployment Script${NC}"
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
BACKEND_REPO="tupiel-backend"
SERVICE_ARN="arn:aws:apprunner:us-east-1:559954020952:service/tupiel-backend/3442fcc9aed44ef7bec36d8978cb4cba"
RDS_ENDPOINT="tupiel-db.culyguuuy7g1.us-east-1.rds.amazonaws.com"

# NOTE: DigitalOcean DB is NOT reachable from AWS App Runner (firewall blocks it).
# Use RDS (which has synced data) for production reports on App Runner.
# For local development, the .env file can point to DigitalOcean directly.

echo -e "${YELLOW}Account: ${ACCOUNT_ID}${NC}"
echo -e "${YELLOW}Region: ${REGION}${NC}"
echo ""

# Get RDS password from environment variable or prompt
if [ -z "$RDS_PASSWORD" ]; then
    read -sp "Enter AWS RDS master password: " DB_PASSWORD
    echo ""
else
    DB_PASSWORD="$RDS_PASSWORD"
fi

if [ -z "$DB_PASSWORD" ]; then
    echo -e "${RED}❌ Password is required${NC}"
    exit 1
fi

# Login to ECR
echo -e "${YELLOW}🔐 Logging into ECR...${NC}"
aws ecr get-login-password --region $REGION | docker login --username AWS --password-stdin $ECR_BASE
echo -e "${GREEN}✅ Logged in${NC}"
echo ""

# Build backend image
echo -e "${YELLOW}🏗️  Building backend image (x86_64 for App Runner)...${NC}"
cd backend
docker build --platform linux/amd64 -t $BACKEND_REPO:latest .
echo -e "${GREEN}✅ Build complete${NC}"

# Tag and push
echo -e "${YELLOW}📤 Tagging and pushing to ECR...${NC}"
docker tag $BACKEND_REPO:latest $ECR_BASE/$BACKEND_REPO:latest
docker push $ECR_BASE/$BACKEND_REPO:latest
cd ..
echo -e "${GREEN}✅ Image pushed to ECR${NC}"
echo ""

# Wait for any in-progress operations to complete
echo -e "${YELLOW}⏳ Checking service status...${NC}"
MAX_WAIT=300
WAIT_TIME=0
while [ $WAIT_TIME -lt $MAX_WAIT ]; do
    STATUS=$(aws apprunner describe-service \
      --service-arn "$SERVICE_ARN" \
      --region "$REGION" \
      --query 'Service.Status' \
      --output text 2>/dev/null || echo "UNKNOWN")
    
    OPERATIONS=$(aws apprunner list-operations \
      --service-arn "$SERVICE_ARN" \
      --region "$REGION" \
      --query 'OperationSummaryList[?Status==`IN_PROGRESS`]' \
      --output json 2>/dev/null || echo "[]")
    
    IN_PROGRESS_COUNT=$(echo "$OPERATIONS" | grep -c "IN_PROGRESS" || echo "0")
    
    if [ "$STATUS" = "RUNNING" ] && [ "$IN_PROGRESS_COUNT" = "0" ]; then
        echo -e "${GREEN}✅ Service is ready for update${NC}"
        break
    fi
    
    if [ "$STATUS" = "CREATE_FAILED" ] || [ "$STATUS" = "UPDATE_FAILED" ]; then
        echo -e "${YELLOW}⚠️  Service is in ${STATUS} state, will attempt update anyway...${NC}"
        break
    fi
    
    echo -e "${YELLOW}   Service status: ${STATUS}, Operations in progress: ${IN_PROGRESS_COUNT}... waiting 10s${NC}"
    sleep 10
    WAIT_TIME=$((WAIT_TIME + 10))
done

# Update backend service with all environment variables
echo -e "${YELLOW}🔄 Updating backend service with environment variables...${NC}"
cat > /tmp/backend-update.json <<EOF
{
  "SourceConfiguration": {
    "ImageRepository": {
      "ImageIdentifier": "${ECR_BASE}/${BACKEND_REPO}:latest",
      "ImageRepositoryType": "ECR",
      "ImageConfiguration": {
        "Port": "3000",
        "RuntimeEnvironmentVariables": {
          "NODE_ENV": "production",
          "PORT": "3000",
          "DB_HOST": "${PROD_DB_HOST}",
          "DB_PORT": "${PROD_DB_PORT}",
          "DB_NAME": "${PROD_DB_NAME}",
          "DB_USER": "${PROD_DB_USER}",
          "DB_PASSWORD": "${PROD_DB_PASSWORD}",
          "USE_LOCAL_DB": "false",
          "APP_DB_HOST": "${RDS_ENDPOINT}",
          "APP_DB_PORT": "3306",
          "APP_DB_NAME": "tupiel_app",
          "APP_DB_USER": "admin",
          "APP_DB_PASSWORD": "${DB_PASSWORD}"
        }
      }
    },
    "AutoDeploymentsEnabled": true,
    "AuthenticationConfiguration": {
      "AccessRoleArn": "${ROLE_ARN}"
    }
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

# Try to update the service with retry logic
MAX_RETRIES=3
RETRY_COUNT=0
UPDATE_SUCCESS=false

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    if aws apprunner update-service \
      --service-arn "$SERVICE_ARN" \
      --region "$REGION" \
      --cli-input-json file:///tmp/backend-update.json \
      --query 'Service.[ServiceArn,Status]' \
      --output text 2>&1; then
        UPDATE_SUCCESS=true
        break
    else
        ERROR_OUTPUT=$(aws apprunner update-service \
          --service-arn "$SERVICE_ARN" \
          --region "$REGION" \
          --cli-input-json file:///tmp/backend-update.json \
          --query 'Service.[ServiceArn,Status]' \
          --output text 2>&1)
        
        if echo "$ERROR_OUTPUT" | grep -q "OPERATION_IN_PROGRESS\|InvalidStateException"; then
            RETRY_COUNT=$((RETRY_COUNT + 1))
            echo -e "${YELLOW}⚠️  Service update blocked, waiting 30s before retry ($RETRY_COUNT/$MAX_RETRIES)...${NC}"
            sleep 30
        else
            echo -e "${RED}❌ Failed to update backend service: $ERROR_OUTPUT${NC}"
            echo ""
            echo -e "${YELLOW}Debug info:${NC}"
            echo "  Service ARN: $SERVICE_ARN"
            echo "  Role ARN: $ROLE_ARN"
            echo "  ECR Base: $ECR_BASE"
            exit 1
        fi
    fi
done

if [ "$UPDATE_SUCCESS" = true ]; then
    echo ""
    echo -e "${GREEN}✅ Backend service update initiated${NC}"
    echo -e "${YELLOW}⏳ Service will redeploy automatically (takes ~5 minutes)${NC}"
else
    echo -e "${RED}❌ Failed to update backend service after $MAX_RETRIES retries${NC}"
    exit 1
fi
echo ""
echo "Check status with:"
echo "aws apprunner describe-service --service-arn $SERVICE_ARN --region $REGION --query 'Service.[Status,ServiceUrl]'"
