#!/bin/bash
# Script to sync DigitalOcean database → AWS RDS
# Auth: uses RDS master password (master user cannot use IAM auth)
# Usage:
#   ./sync-to-rds.sh                    # Full: dump from DO + import to RDS
#   ./sync-to-rds.sh backup/file.sql    # Skip dump, import existing file to RDS

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}🔄 TuPiel DB Sync: DigitalOcean → AWS RDS${NC}"
echo ""

# ─── Source: DigitalOcean ───
DO_HOST="tupiel-privado-do-user-1309890-0.j.db.ondigitalocean.com"
DO_PORT="25060"
DO_DB="tupiel"
DO_USER="tupiel_u"
DO_PASS='kHcdSD0j[Gwk*Sz@'

# ─── Target: AWS RDS ───
RDS_HOST="tupiel-db.culyguuuy7g1.us-east-1.rds.amazonaws.com"
RDS_PORT="3306"
RDS_DB="tupiel"
RDS_USER="admin"

# Get RDS master password
read -sp "Enter AWS RDS master password for user '${RDS_USER}': " RDS_PASS
echo ""

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
    # ═══════════════════════════════════════════
    # Step 1: Dump from DigitalOcean
    # ═══════════════════════════════════════════
    TIMESTAMP=$(date +%Y%m%d_%H%M%S)
    DUMP_FILE="backup/tupiel_sync_${TIMESTAMP}.sql"

    echo ""
    echo -e "${YELLOW}📤 Step 1: Dumping from DigitalOcean...${NC}"
    echo -e "   Host: ${DO_HOST}:${DO_PORT}"
    echo -e "   Database: ${DO_DB}"
    echo ""

    # Use MYSQL_PWD env var to avoid special char issues with password
    export MYSQL_PWD="$DO_PASS"

    # Run mysqldump in background so we can show progress
    mysqldump \
      -h "$DO_HOST" \
      -P "$DO_PORT" \
      -u "$DO_USER" \
      --ssl-mode=REQUIRED \
      --single-transaction \
      --quick \
      --routines \
      --triggers \
      --set-gtid-purged=OFF \
      --column-statistics=0 \
      --no-tablespaces \
      --net-buffer-length=32768 \
      --max-allowed-packet=512M \
      "$DO_DB" > "$DUMP_FILE" &

    DUMP_PID=$!

    # Show progress while dump is running
    while kill -0 $DUMP_PID 2>/dev/null; do
        if [ -f "$DUMP_FILE" ]; then
            CURRENT_SIZE=$(du -h "$DUMP_FILE" 2>/dev/null | cut -f1)
            printf "\r   📊 Dumping... size so far: %-10s" "$CURRENT_SIZE"
        fi
        sleep 2
    done

    # Wait for dump to finish and check exit code
    wait $DUMP_PID
    DUMP_EXIT=$?

    unset MYSQL_PWD

    if [ $DUMP_EXIT -ne 0 ]; then
        echo ""
        echo -e "${RED}❌ mysqldump failed (exit code: $DUMP_EXIT)${NC}"
        exit 1
    fi

    DUMP_SIZE=$(du -h "$DUMP_FILE" | cut -f1)
    echo ""
    echo -e "${GREEN}✅ Dump complete: ${DUMP_FILE} (${DUMP_SIZE})${NC}"
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

# Run import in background with a spinner
MYSQL_PWD="$RDS_PASS" mysql -h "$RDS_HOST" -P "$RDS_PORT" -u "$RDS_USER" \
  --connect-timeout=30 \
  "$RDS_DB" < "$DUMP_FILE" 2>&1 | grep -v "Using a password" > /tmp/import_output.log &
IMPORT_PID=$!

ELAPSED=0
SPINNER="⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏"
while kill -0 $IMPORT_PID 2>/dev/null; do
    i=$(( ELAPSED % ${#SPINNER} ))
    printf "\r   ${SPINNER:$i:1} Importing... %dm %ds elapsed" $((ELAPSED/60)) $((ELAPSED%60))
    sleep 1
    ELAPSED=$((ELAPSED+1))
done

wait $IMPORT_PID
IMPORT_EXIT=$?

if [ $IMPORT_EXIT -ne 0 ] || grep -qi "ERROR" /tmp/import_output.log 2>/dev/null; then
    echo ""
    echo -e "${RED}❌ Import failed${NC}"
    cat /tmp/import_output.log 2>/dev/null | head -20
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
    echo -e "${CYAN}📋 Tables imported:${NC}"
    TABLES_LIST=$(rds_mysql "$RDS_DB" -e "SHOW TABLES;" 2>&1)
    if [ $? -eq 0 ] && ! echo "$TABLES_LIST" | grep -qi "ERROR"; then
        echo "$TABLES_LIST"
    else
        echo -e "${YELLOW}⚠️  Could not list tables${NC}"
    fi
else
    echo -e "${YELLOW}⚠️  Could not verify table count${NC}"
    echo "$TABLE_COUNT_OUTPUT" | head -1
fi

echo ""
echo -e "${GREEN}🎉 Sync complete! DigitalOcean → AWS RDS${NC}"
echo -e "   Dump file saved at: ${DUMP_FILE}"
