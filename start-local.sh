#!/usr/bin/env bash
# Start only the dev MySQL container. Then run backend and frontend on your machine.
set -e
cd "$(dirname "$0")"
echo "Starting dev MySQL (localhost:3308)..."
docker compose -f docker-compose.dev.yml up -d
echo "Waiting for MySQL to be healthy..."
sleep 5
for i in 1 2 3 4 5 6; do
  if docker exec tupiel-mysql-dev mysqladmin ping -h localhost -u root -plocalroot 2>/dev/null; then
    echo "MySQL is ready."
    break
  fi
  sleep 2
done
echo ""
echo "Next: run backend and frontend in two terminals:"
echo "  Terminal 1:  cd backend && npm run dev"
echo "  Terminal 2:  cd frontend && pnpm start"
echo ""
echo "Open http://localhost:4200 (not localhost:80 - that's the Docker stack)"
echo "Login: Didier / DidierTuPiel2025"
