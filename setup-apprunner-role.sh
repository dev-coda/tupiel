#!/bin/bash
# Setup IAM role for App Runner to access ECR

set -e

REGION=${AWS_REGION:-us-east-1}
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

echo "🔐 Setting up App Runner IAM role..."

# Trust policy for App Runner
cat > /tmp/trust-policy.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": "build.apprunner.amazonaws.com"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
EOF

# Policy for ECR access
cat > /tmp/ecr-policy.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ecr:GetAuthorizationToken",
        "ecr:BatchCheckLayerAvailability",
        "ecr:GetDownloadUrlForLayer",
        "ecr:BatchGetImage"
      ],
      "Resource": "*"
    }
  ]
}
EOF

# Create role if it doesn't exist
ROLE_NAME="AppRunnerECRAccessRole"

# Check if role exists (could be in service-role path)
EXISTING_ROLE=$(aws iam get-role --role-name $ROLE_NAME --query 'Role.Arn' --output text 2>/dev/null || echo "")

if [ ! -z "$EXISTING_ROLE" ]; then
    echo "✅ Role already exists: $EXISTING_ROLE"
    ROLE_ARN="$EXISTING_ROLE"
else
    echo "📝 Creating IAM role..."
    aws iam create-role \
      --role-name $ROLE_NAME \
      --assume-role-policy-document file:///tmp/trust-policy.json \
      --region $REGION > /dev/null
    
    echo "📝 Attaching ECR access policy..."
    aws iam put-role-policy \
      --role-name $ROLE_NAME \
      --policy-name ECRAccessPolicy \
      --policy-document file:///tmp/ecr-policy.json \
      --region $REGION > /dev/null
    
    ROLE_ARN=$(aws iam get-role --role-name $ROLE_NAME --query 'Role.Arn' --output text)
    echo "✅ Role created: $ROLE_ARN"
fi

echo ""
echo "✅ IAM role ready: $ROLE_ARN"
echo "Use this ARN in your App Runner service configuration"
