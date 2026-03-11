#!/bin/bash
# Create dias_no_laborales table in RDS

set -e

RDS_HOST="tupiel-db.culyguuuy7g1.us-east-1.rds.amazonaws.com"
RDS_PORT="3306"
RDS_DB="tupiel"
RDS_USER="admin"

read -sp "Enter RDS password: " RDS_PASS
echo ""

MYSQL_PWD="$RDS_PASS" mysql -h "$RDS_HOST" -P "$RDS_PORT" -u "$RDS_USER" "$RDS_DB" <<EOF
CREATE TABLE IF NOT EXISTS dias_no_laborales (
  id INT AUTO_INCREMENT PRIMARY KEY,
  fecha DATE NOT NULL UNIQUE,
  descripcion VARCHAR(255) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_fecha (fecha)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
EOF

echo "✅ Table created successfully"
