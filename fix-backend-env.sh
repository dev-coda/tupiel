#!/bin/bash
# Fix backend App Runner environment variables

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${YELLOW}🔧 Fixing Backend App Runner Environment Variables${NC}"
echo ""

# Get RDS endpoint
RDS_ENDPOINT="tupiel-db.culyguuuy7g1.us-east-1.rds.amazonaws.com"
echo -e "${GREEN}RDS Endpoint: ${RDS_ENDPOINT}${NC}"

# Get database password
echo -n "Enter RDS database password: "
read -s DB_PASSWORD
echo ""

if [ -z "$DB_PASSWORD" ]; then
    echo -e "${RED}❌ Password is required${NC}"
    exit 1
fi

# Get AWS account info
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
REGION="us-east-1"
ECR_BASE="${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com"
ROLE_ARN=$(aws iam get-role --role-name AppRunnerECRAccessRole --query 'Role.Arn' --output text)

echo -e "${GREEN}Account ID: ${ACCOUNT_ID}${NC}"
echo -e "${GREEN}Role ARN: ${ROLE_ARN}${NC}"
echo ""

# Create service update JSON
cat > /tmp/backend-update-env.json <<EOF
{
  "SourceConfiguration": {
    "ImageRepository": {
      "ImageIdentifier": "${ECR_BASE}/tupiel-backend:latest",
      "ImageRepositoryType": "ECR",
      "ImageConfiguration": {
        "Port": "3000",
        "RuntimeEnvironmentVariables": {
          "NODE_ENV": "production",
          "PORT": "3000",
          "DB_HOST": "${RDS_ENDPOINT}",
          "DB_PORT": "3306",
          "DB_NAME": "tupiel",
          "DB_USER": "admin",
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

echo -e "${YELLOW}📤 Updating backend service...${NC}"
SERVICE_ARN="arn:aws:apprunner:us-east-1:559954020952:service/tupiel-backend/3442fcc9aed44ef7bec36d8978cb4cba"

aws apprunner update-service \
  --service-arn "$SERVICE_ARN" \
  --region "$REGION" \
  --cli-input-json file:///tmp/backend-update-env.json \
  --query 'Service.[ServiceArn,Status]' \
  --output text

echo ""
echo -e "${GREEN}✅ Backend service update initiated${NC}"
echo -e "${YELLOW}⏳ Service will redeploy with new environment variables${NC}"
echo ""
echo "Check status with:"
echo "aws apprunner describe-service --service-arn $SERVICE_ARN --region $REGION --query 'Service.Status'"
