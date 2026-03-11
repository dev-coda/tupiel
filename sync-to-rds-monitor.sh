#!/bin/bash
# Non-interactive version of sync-to-rds.sh for monitoring
# Usage: RDS_PASSWORD=yourpass ./sync-to-rds-monitor.sh backup/file.sql

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}🔄 TuPiel DB Sync: DigitalOcean → AWS RDS${NC}"
echo ""

# ─── Target: AWS RDS ───
RDS_HOST="tupiel-db.culyguuuy7g1.us-east-1.rds.amazonaws.com"
RDS_PORT="3306"
RDS_DB="tupiel"
RDS_USER="admin"

# Get RDS password from environment or prompt
if [ -z "$RDS_PASSWORD" ]; then
    read -sp "Enter AWS RDS master password for user '${RDS_USER}': " RDS_PASS
    echo ""
else
    RDS_PASS="$RDS_PASSWORD"
fi

if [ -z "$RDS_PASS" ]; then
    echo -e "${RED}❌ Password is required${NC}"
    exit 1
fi

mkdir -p backup

# Helper: run mysql command against RDS using MYSQL_PWD to avoid shell escaping issues
# Returns output and exit code properly
rds_mysql() {
    local output
    output=$(MYSQL_PWD="$RDS_PASS" mysql -h "$RDS_HOST" -P "$RDS_PORT" -u "$RDS_USER" \
      --connect-timeout=30 \
      "$@" 2>&1)
    local exit_code=$?
    
    # Filter out password warning but keep errors
    echo "$output" | grep -v "Using a password on the command line"
    return $exit_code
}

# Check if using an existing dump file
EXISTING_DUMP="$1"

if [ -n "$EXISTING_DUMP" ]; then
    # ─── Use existing dump file ───
    if [ ! -f "$EXISTING_DUMP" ]; then
        echo -e "${RED}❌ File not found: $EXISTING_DUMP${NC}"
        exit 1
    fi
    DUMP_FILE="$EXISTING_DUMP"
    DUMP_SIZE=$(du -h "$DUMP_FILE" | cut -f1)
    echo -e "${GREEN}📄 Using existing dump: ${DUMP_FILE} (${DUMP_SIZE})${NC}"
else
    echo -e "${RED}❌ Dump file required as argument${NC}"
    exit 1
fi

# ═══════════════════════════════════════════
# Step 2: Test RDS connection
# ═══════════════════════════════════════════
echo ""
echo -e "${YELLOW}🔍 Step 2: Testing AWS RDS connection...${NC}"
echo -e "   Host: ${RDS_HOST}:${RDS_PORT}"

TEST_OUTPUT=$(rds_mysql -e "SELECT 1;" 2>&1)
if [ $? -eq 0 ] && echo "$TEST_OUTPUT" | grep -q "1"; then
    echo -e "${GREEN}✅ RDS connection OK${NC}"
else
    echo -e "${RED}❌ Cannot connect to RDS!${NC}"
    echo "$TEST_OUTPUT"
    echo ""
    echo "Check:"
    echo "  1. Security group allows your IP on port 3306"
    echo "  2. RDS is publicly accessible"
    echo "  3. Password is correct"
    exit 1
fi

# ═══════════════════════════════════════════
# Step 3: Create DB if needed
# ═══════════════════════════════════════════
echo ""
echo -e "${YELLOW}📦 Step 3: Creating database if needed...${NC}"
DB_OUTPUT=$(rds_mysql -e "CREATE DATABASE IF NOT EXISTS \`$RDS_DB\`;" 2>&1)
if [ $? -ne 0 ] || echo "$DB_OUTPUT" | grep -qi "ERROR"; then
    echo -e "${RED}❌ Failed to create database${NC}"
    echo "$DB_OUTPUT"
    exit 1
fi

# ═══════════════════════════════════════════
# Step 4: Drop existing tables for clean import
# ═══════════════════════════════════════════
echo ""
echo -e "${YELLOW}🗑️  Step 4: Dropping existing tables in RDS for clean import...${NC}"

TABLES_OUTPUT=$(rds_mysql "$RDS_DB" -N -e "SHOW TABLES;" 2>&1)
if [ $? -ne 0 ] || echo "$TABLES_OUTPUT" | grep -qi "ERROR"; then
    echo -e "${YELLOW}⚠️  Cannot list tables (may not exist yet):${NC}"
    echo "$TABLES_OUTPUT" | head -1
    echo -e "   Continuing anyway..."
else
    TABLES=$(echo "$TABLES_OUTPUT" | grep -v "^$")
    if [ -n "$TABLES" ]; then
        DROP_SQL="SET FOREIGN_KEY_CHECKS = 0;"
        for TABLE in $TABLES; do
            DROP_SQL="${DROP_SQL} DROP TABLE IF EXISTS \`$TABLE\`;"
            echo -e "   Will drop: $TABLE"
        done
        DROP_SQL="${DROP_SQL} SET FOREIGN_KEY_CHECKS = 1;"

        DROP_OUTPUT=$(rds_mysql "$RDS_DB" -e "$DROP_SQL" 2>&1)
        if [ $? -ne 0 ] || echo "$DROP_OUTPUT" | grep -qi "ERROR"; then
            echo -e "${RED}❌ Failed to drop tables${NC}"
            echo "$DROP_OUTPUT"
            exit 1
        fi
        echo -e "${GREEN}✅ Existing tables dropped${NC}"
    else
        echo -e "   No existing tables to drop"
    fi
fi

# ═══════════════════════════════════════════
# Step 5: Import dump to RDS
# ═══════════════════════════════════════════
echo ""
echo -e "${YELLOW}📥 Step 5: Importing dump to AWS RDS...${NC}"
echo "   This may take several minutes for a ${DUMP_SIZE} file..."

# Run import in background with progress monitoring
MYSQL_PWD="$RDS_PASS" mysql -h "$RDS_HOST" -P "$RDS_PORT" -u "$RDS_USER" \
  --connect-timeout=30 \
  "$RDS_DB" < "$DUMP_FILE" 2>&1 | grep -v "Using a password" > /tmp/import_output.log &
IMPORT_PID=$!

ELAPSED=0
SPINNER="⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏"
LAST_SIZE=0

while kill -0 $IMPORT_PID 2>/dev/null; do
    i=$(( ELAPSED % ${#SPINNER} ))
    
    # Check for errors in output
    if [ -f /tmp/import_output.log ]; then
        ERROR_COUNT=$(grep -ci "ERROR" /tmp/import_output.log 2>/dev/null || echo "0")
        if [ "$ERROR_COUNT" -gt 0 ] && [ "$ELAPSED" -gt 10 ]; then
            echo ""
            echo -e "${RED}❌ Import errors detected:${NC}"
            tail -20 /tmp/import_output.log
            kill $IMPORT_PID 2>/dev/null
            exit 1
        fi
    fi
    
    printf "\r   ${SPINNER:$i:1} Importing... %dm %ds elapsed" $((ELAPSED/60)) $((ELAPSED%60))
    sleep 1
    ELAPSED=$((ELAPSED+1))
done

wait $IMPORT_PID
IMPORT_EXIT=$?

if [ $IMPORT_EXIT -ne 0 ] || grep -qi "ERROR" /tmp/import_output.log 2>/dev/null; then
    echo ""
    echo -e "${RED}❌ Import failed${NC}"
    if [ -f /tmp/import_output.log ]; then
        echo "Last 50 lines of output:"
        tail -50 /tmp/import_output.log
    fi
    exit 1
fi

echo ""
echo -e "${GREEN}✅ Import complete! (took ${ELAPSED}s)${NC}"

# ═══════════════════════════════════════════
# Step 6: Verify
# ═══════════════════════════════════════════
echo ""
echo -e "${YELLOW}🔍 Step 6: Verifying import...${NC}"

TABLE_COUNT_OUTPUT=$(rds_mysql "$RDS_DB" \
  -N -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='$RDS_DB';" 2>&1)

if [ $? -eq 0 ] && ! echo "$TABLE_COUNT_OUTPUT" | grep -qi "ERROR"; then
    TABLE_COUNT=$(echo "$TABLE_COUNT_OUTPUT" | grep -v "^$" | head -1)
    echo -e "${GREEN}✅ Tables in RDS: ${TABLE_COUNT}${NC}"
    
    echo ""
    echo -e "${CYAN}📋 Checking for key tables:${NC}"
    
    # Check for critical tables
    KEY_TABLES=("personal" "consulta_cups" "consulta" "paciente" "cups" "factura")
    for TABLE in "${KEY_TABLES[@]}"; do
        EXISTS=$(rds_mysql "$RDS_DB" -N -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='$RDS_DB' AND table_name='$TABLE';" 2>&1 | grep -v "^$" | head -1)
        if [ "$EXISTS" = "1" ]; then
            ROW_COUNT=$(rds_mysql "$RDS_DB" -N -e "SELECT COUNT(*) FROM \`$TABLE\`;" 2>&1 | grep -v "^$" | head -1)
            echo -e "   ✅ $TABLE: $ROW_COUNT rows"
        else
            echo -e "   ${RED}❌ $TABLE: MISSING${NC}"
        fi
    done
    
    echo ""
    echo -e "${CYAN}📋 All tables imported:${NC}"
    TABLES_LIST=$(rds_mysql "$RDS_DB" -e "SHOW TABLES;" 2>&1)
    if [ $? -eq 0 ] && ! echo "$TABLES_LIST" | grep -qi "ERROR"; then
        echo "$TABLES_LIST" | head -30
        TOTAL=$(echo "$TABLES_LIST" | wc -l | tr -d ' ')
        if [ "$TOTAL" -gt 30 ]; then
            echo "... and $((TOTAL - 30)) more tables"
        fi
    else
        echo -e "${YELLOW}⚠️  Could not list tables${NC}"
    fi
else
    echo -e "${YELLOW}⚠️  Could not verify table count${NC}"
    echo "$TABLE_COUNT_OUTPUT" | head -1
fi

echo ""
echo -e "${GREEN}🎉 Sync complete! DigitalOcean → AWS RDS${NC}"
echo -e "   Dump file: ${DUMP_FILE}"
