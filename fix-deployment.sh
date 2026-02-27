#!/bin/bash
# Fix and complete deployment

set -e

REGION=${AWS_REGION:-us-east-1}
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
ECR_BASE="${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com"
RDS_ENDPOINT="tupiel-db.culyguuuy7g1.us-east-1.rds.amazonaws.com"

echo "🔧 Fixing App Runner Deployment"
echo ""

# Verify database
echo "📊 Verifying database import..."
DB_TABLES=$(mysql -h $RDS_ENDPOINT -P 3306 -u admin -p'DidierTuPiel2025' tupiel -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'tupiel';" -s -N 2>/dev/null)
echo "✅ Database has $DB_TABLES tables"
echo ""

# Get IAM role
ROLE_ARN=$(aws iam get-role --role-name AppRunnerECRAccessRole --query 'Role.Arn' --output text)
echo "✅ Using IAM role: $ROLE_ARN"
echo ""

# Create backend service config
cat > /tmp/backend-service-fixed.json <<EOF
{
  "ServiceName": "tupiel-backend",
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
          "DB_PASSWORD": "DidierTuPiel2025",
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
    "Cpu": "1 vCPU",
    "Memory": "2 GB"
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

echo "🚀 Creating backend service..."
BACKEND_ARN=$(aws apprunner create-service \
  --cli-input-json file:///tmp/backend-service-fixed.json \
  --region $REGION \
  --query 'Service.ServiceArn' \
  --output text 2>&1)

if [[ "$BACKEND_ARN" =~ "arn:aws:apprunner" ]]; then
    echo "✅ Backend service created: $BACKEND_ARN"
    echo "⏳ Deployment in progress. Check AWS Console for status."
    echo ""
    echo "To check status:"
    echo "  aws apprunner describe-service --service-arn $BACKEND_ARN --region $REGION --query 'Service.Status'"
else
    echo "❌ Error: $BACKEND_ARN"
    exit 1
fi
