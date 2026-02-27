#!/bin/bash
# Script to import database dump to RDS

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}📥 RDS Database Import Script${NC}"
echo ""

# Check if dump file exists
DUMP_FILE=${1:-"backup/tupiel_backup_20260226_091116.sql"}

if [ ! -f "$DUMP_FILE" ]; then
    echo -e "${RED}❌ Dump file not found: $DUMP_FILE${NC}"
    echo "Usage: ./import-rds.sh [path-to-dump.sql]"
    exit 1
fi

# Get RDS endpoint
read -p "Enter RDS endpoint (e.g., tupiel-db.xxxxx.us-east-1.rds.amazonaws.com): " RDS_ENDPOINT

if [ -z "$RDS_ENDPOINT" ]; then
    echo -e "${RED}❌ RDS endpoint is required${NC}"
    exit 1
fi

# Get username
read -p "Enter database username [admin]: " DB_USER
DB_USER=${DB_USER:-admin}

# Get password
read -sp "Enter database password: " DB_PASSWORD
echo ""

# Test connection first
echo -e "${YELLOW}🔍 Testing connection to RDS...${NC}"
if mysql -h "$RDS_ENDPOINT" -P 3306 -u "$DB_USER" -p"$DB_PASSWORD" -e "SELECT 1;" 2>/dev/null; then
    echo -e "${GREEN}✅ Connection successful!${NC}"
else
    echo -e "${RED}❌ Connection failed!${NC}"
    echo ""
    echo "Common issues:"
    echo "1. Security group doesn't allow your IP"
    echo "2. RDS instance is not publicly accessible"
    echo "3. Wrong credentials"
    echo ""
    echo "To fix security group:"
    echo "1. Go to EC2 Console → Security Groups"
    echo "2. Find your RDS security group"
    echo "3. Edit Inbound Rules → Add:"
    echo "   - Type: MySQL/Aurora"
    echo "   - Port: 3306"
    echo "   - Source: Your IP or 0.0.0.0/0 (for testing)"
    exit 1
fi

# Get database name
read -p "Enter database name [tupiel]: " DB_NAME
DB_NAME=${DB_NAME:-tupiel}

# Create database if it doesn't exist
echo -e "${YELLOW}📦 Creating database if it doesn't exist...${NC}"
mysql -h "$RDS_ENDPOINT" -P 3306 -u "$DB_USER" -p"$DB_PASSWORD" -e "CREATE DATABASE IF NOT EXISTS $DB_NAME;" 2>/dev/null || true

# Clean dump file (remove mysqldump warnings)
CLEANED_DUMP="${DUMP_FILE%.sql}_cleaned.sql"
echo -e "${YELLOW}🧹 Cleaning dump file (removing warnings)...${NC}"
sed '/^mysqldump:/d' "$DUMP_FILE" > "$CLEANED_DUMP" || cp "$DUMP_FILE" "$CLEANED_DUMP"

# Import dump
echo -e "${YELLOW}📥 Importing database dump...${NC}"
echo "This may take several minutes..."
mysql -h "$RDS_ENDPOINT" -P 3306 -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" < "$CLEANED_DUMP"

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Database imported successfully!${NC}"
    echo ""
    echo "Verify import:"
    echo "mysql -h $RDS_ENDPOINT -P 3306 -u $DB_USER -p$DB_PASSWORD $DB_NAME -e 'SHOW TABLES;'"
else
    echo -e "${RED}❌ Import failed${NC}"
    exit 1
fi
