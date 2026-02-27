#!/bin/bash
# Complete the App Runner deployment

set -e

REGION=${AWS_REGION:-us-east-1}
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
ECR_BASE="${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com"

echo "🚀 Completing App Runner Deployment"
echo ""

# Get backend service
BACKEND_ARN=$(aws apprunner list-services --region $REGION --query "ServiceSummaryList[?ServiceName=='tupiel-backend'].ServiceArn" --output text)

if [ -z "$BACKEND_ARN" ]; then
    echo "❌ Backend service not found. Run ./deploy-apprunner.sh first"
    exit 1
fi

echo "✅ Backend service found: $BACKEND_ARN"

# Get backend URL
BACKEND_URL=$(aws apprunner describe-service \
  --service-arn "$BACKEND_ARN" \
  --region $REGION \
  --query 'Service.ServiceUrl' \
  --output text)

BACKEND_STATUS=$(aws apprunner describe-service \
  --service-arn "$BACKEND_ARN" \
  --region $REGION \
  --query 'Service.Status' \
  --output text)

echo "   Status: $BACKEND_STATUS"
echo "   URL: $BACKEND_URL"
echo ""

# Check if frontend exists
FRONTEND_ARN=$(aws apprunner list-services --region $REGION --query "ServiceSummaryList[?ServiceName=='tupiel-frontend'].ServiceArn" --output text)

if [ ! -z "$FRONTEND_ARN" ]; then
    echo "✅ Frontend service found: $FRONTEND_ARN"
    FRONTEND_URL=$(aws apprunner describe-service \
      --service-arn "$FRONTEND_ARN" \
      --region $REGION \
      --query 'Service.ServiceUrl' \
      --output text)
    FRONTEND_STATUS=$(aws apprunner describe-service \
      --service-arn "$FRONTEND_ARN" \
      --region $REGION \
      --query 'Service.Status' \
      --output text)
    echo "   Status: $FRONTEND_STATUS"
    echo "   URL: $FRONTEND_URL"
else
    echo "📝 Creating frontend service..."
    
    # Get IAM role
    ROLE_ARN=$(aws iam get-role --role-name AppRunnerECRAccessRole --query 'Role.Arn' --output text)
    
    # Create frontend service config
    cat > /tmp/frontend-service.json <<EOF
{
  "ServiceName": "tupiel-frontend",
  "SourceConfiguration": {
    "ImageRepository": {
      "ImageIdentifier": "${ECR_BASE}/tupiel-frontend:latest",
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
    "Path": "/health",
    "Interval": 10,
    "Timeout": 5,
    "HealthyThreshold": 1,
    "UnhealthyThreshold": 5
  }
}
EOF

    FRONTEND_ARN=$(aws apprunner create-service \
      --cli-input-json file:///tmp/frontend-service.json \
      --region $REGION \
      --query 'Service.ServiceArn' \
      --output text 2>&1)
    
    if [ $? -eq 0 ] && [[ ! "$FRONTEND_ARN" =~ "error" ]]; then
        echo "✅ Frontend service created. Deploying..."
        echo "⏳ This takes ~5 minutes. Check status in AWS Console."
    else
        echo "❌ Failed to create frontend service"
        echo "$FRONTEND_ARN"
    fi
fi

echo ""
echo "📋 Summary:"
echo "  Backend:  $BACKEND_URL (Status: $BACKEND_STATUS)"
if [ ! -z "$FRONTEND_URL" ]; then
    echo "  Frontend: $FRONTEND_URL (Status: $FRONTEND_STATUS)"
fi
echo ""
echo "🧪 Test backend:"
echo "  curl $BACKEND_URL/api/health"
