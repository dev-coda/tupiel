#!/bin/bash
# Create tupiel_app database in RDS and initialize schema

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${YELLOW}🗄️  Setting up tupiel_app database in RDS${NC}"
echo ""

RDS_ENDPOINT="tupiel-db.culyguuuy7g1.us-east-1.rds.amazonaws.com"
RDS_USER="admin"

# Get password from environment variable or prompt
if [ -z "$RDS_PASSWORD" ]; then
    echo -n "Enter RDS database password: "
    read -s DB_PASSWORD
    echo ""
else
    DB_PASSWORD="$RDS_PASSWORD"
fi

if [ -z "$DB_PASSWORD" ]; then
    echo -e "${RED}❌ Password is required${NC}"
    exit 1
fi

echo -e "${YELLOW}📡 Connecting to RDS...${NC}"

# Create database if it doesn't exist
mysql -h "$RDS_ENDPOINT" -u "$RDS_USER" -p"$DB_PASSWORD" <<EOF
CREATE DATABASE IF NOT EXISTS tupiel_app CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE tupiel_app;

-- Create dias_no_laborales table
CREATE TABLE IF NOT EXISTS dias_no_laborales (
  id INT AUTO_INCREMENT PRIMARY KEY,
  fecha DATE NOT NULL UNIQUE,
  descripcion VARCHAR(255) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_fecha (fecha)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create monthly_configs table
CREATE TABLE IF NOT EXISTS monthly_configs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  year INT NOT NULL,
  month INT NOT NULL,
  version INT NOT NULL DEFAULT 1,
  meta_global DECIMAL(15, 2) NOT NULL,
  meta_productos DECIMAL(15, 2) NOT NULL,
  facturado_productos DECIMAL(15, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_year_month_version (year, month, version),
  INDEX idx_year_month (year, month),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create employee_presupuestos table
CREATE TABLE IF NOT EXISTS employee_presupuestos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  config_id INT NOT NULL,
  nombre VARCHAR(255) NOT NULL,
  categoria ENUM('DERMATOLOGÍA', 'MED ESTÉTICA', 'TP LOUNGE') NOT NULL,
  presupuesto DECIMAL(15, 2) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (config_id) REFERENCES monthly_configs(id) ON DELETE CASCADE,
  INDEX idx_config_id (config_id),
  INDEX idx_nombre (nombre)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create product_metas table
CREATE TABLE IF NOT EXISTS product_metas (
  id INT AUTO_INCREMENT PRIMARY KEY,
  config_id INT NOT NULL,
  producto_nombre VARCHAR(255) NOT NULL,
  meta INT NOT NULL,
  disponibles INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (config_id) REFERENCES monthly_configs(id) ON DELETE CASCADE,
  INDEX idx_config_id (config_id),
  INDEX idx_producto (producto_nombre)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create saved_reports table
CREATE TABLE IF NOT EXISTS saved_reports (
  id INT AUTO_INCREMENT PRIMARY KEY,
  report_date DATE NOT NULL,
  report_type ENUM('dashboard', 'controlador', 'rentabilidad', 'estimada') NOT NULL,
  date_from DATE NOT NULL,
  date_to DATE NOT NULL,
  config_version INT NULL,
  report_data LONGTEXT NULL,
  file_path VARCHAR(500) NULL,
  file_size BIGINT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_report_date (report_date),
  INDEX idx_report_type (report_type),
  INDEX idx_date_range (date_from, date_to),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SELECT 'Database and tables created successfully' AS status;
EOF

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Database tupiel_app created/verified and tables initialized${NC}"
else
    echo -e "${RED}❌ Failed to create database${NC}"
    exit 1
fi
