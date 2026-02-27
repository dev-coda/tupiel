#!/bin/bash
# Quick test script for the PPTO Dashboard

echo "🧪 Testing PPTO Dashboard API"
echo "=============================="
echo ""

BASE_URL="http://localhost:3000"
DATE_FROM="2026-02-01"
DATE_TO="2026-02-28"

echo "1️⃣ Testing Dashboard API endpoint..."
RESPONSE=$(curl -s "${BASE_URL}/api/dashboard?from=${DATE_FROM}&to=${DATE_TO}")

if echo "$RESPONSE" | grep -q "strategy"; then
  echo "✅ Dashboard API working"
  
  # Extract key metrics
  echo ""
  echo "📊 Key Metrics:"
  echo "$RESPONSE" | python3 -c "
import sys, json
d = json.load(sys.stdin)
s = d['strategy']
print(f\"  Meta Global: \${s['metaGlobal']:,}\")
print(f\"  Facturado: \${s['facturado']:,}\")
print(f\"  Proyección: \${s['proyeccion']:,}\")
print(f\"  % Cumplimiento: {s['pctRealCum']*100:.1f}%\")
print(f\"  Business Units: {len(d['businessUnits'])}\")
print(f\"  Personnel: {len(d['personnel'])}\")
print(f\"  Daily Metrics: {len(d['dailyMetrics'])}\")
print(f\"  Products: {len(d['products'])}\")
" 2>/dev/null || echo "  (Python parsing failed, but API returned data)"
else
  echo "❌ Dashboard API failed"
  echo "Response: $RESPONSE"
  exit 1
fi

echo ""
echo "2️⃣ Testing Controlador Excel download..."
EXCEL_RESPONSE=$(curl -s -o /tmp/test-controlador.xlsx -w "%{http_code}" "${BASE_URL}/api/reports/controlador?from=${DATE_FROM}&to=${DATE_TO}")

if [ "$EXCEL_RESPONSE" = "200" ] && [ -f /tmp/test-controlador.xlsx ]; then
  SIZE=$(stat -f%z /tmp/test-controlador.xlsx 2>/dev/null || stat -c%s /tmp/test-controlador.xlsx 2>/dev/null)
  echo "✅ Excel download working (${SIZE} bytes)"
  rm -f /tmp/test-controlador.xlsx
else
  echo "❌ Excel download failed (HTTP $EXCEL_RESPONSE)"
fi

echo ""
echo "3️⃣ Testing Frontend proxy..."
FRONTEND_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:4200/api/dashboard?from=${DATE_FROM}&to=${DATE_TO}")

if [ "$FRONTEND_RESPONSE" = "200" ]; then
  echo "✅ Frontend proxy working"
else
  echo "⚠️  Frontend proxy returned HTTP $FRONTEND_RESPONSE"
fi

echo ""
echo "=============================="
echo "✅ All API tests complete!"
echo ""
echo "🌐 Next steps:"
echo "   1. Open http://localhost:4200/ppto in your browser"
echo "   2. Try changing the date range"
echo "   3. Click 'Actualizar' to reload data"
echo "   4. Click 'Imprimir' to test print view"
echo "   5. Click 'Descargar Excel' to download the full report"
echo ""
