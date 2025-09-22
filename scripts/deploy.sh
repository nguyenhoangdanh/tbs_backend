#!/bin/bash
set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

export PATH="/home/hoangdanh2000/.fly/bin:$PATH"

echo -e "${BLUE}🚀 Deploy to Production (Singapore 2GB Performance)${NC}"
echo "================================================="

# Check if we're in the right directory
if [ ! -f "fly.toml" ]; then
    echo -e "${RED}❌ fly.toml not found. Are you in the backend directory?${NC}"
    exit 1
fi

# Check if we're logged into Fly.io
if ! flyctl auth whoami >/dev/null 2>&1; then
    echo -e "${RED}❌ Not logged into Fly.io${NC}"
    echo -e "${BLUE}💡 Run: flyctl auth login${NC}"
    exit 1
fi

# Check if app exists
if ! flyctl status -a weekly-report-backend >/dev/null 2>&1; then
    echo -e "${RED}❌ App 'weekly-report-backend' not found${NC}"
    echo -e "${BLUE}💡 Create app first: ./scripts/create-app.sh${NC}"
    exit 1
fi

# Validate configuration
echo -e "${BLUE}🔍 Validating fly.toml...${NC}"
if ! flyctl config validate; then
    echo -e "${RED}❌ fly.toml validation failed${NC}"
    exit 1
fi

# Build application
echo -e "${BLUE}🏗️ Building application...${NC}"
pnpm run build

# Deploy with immediate strategy
echo -e "${BLUE}🚀 Deploying to Singapore (performance CPU)...${NC}"
flyctl deploy --strategy immediate

# Wait for deployment
echo -e "${BLUE}⏳ Waiting for deployment...${NC}"
sleep 30

# Health checks with retry
echo -e "${BLUE}🏥 Running health checks...${NC}"
for i in {1..15}; do
    if curl -f -s https://weekly-report-backend.fly.dev/health >/dev/null 2>&1; then
        echo -e "${GREEN}✅ Health check passed${NC}"
        break
    fi
    if [ $i -eq 15 ]; then
        echo -e "${RED}❌ Health check failed after 15 attempts${NC}"
        echo -e "${BLUE}🔍 Checking logs...${NC}"
        flyctl logs --no-tail | tail -30
        exit 1
    fi
    echo -e "${YELLOW}⏳ Waiting for app... ($i/15)${NC}"
    sleep 20
done

# Test all endpoints
echo -e "${BLUE}🧪 Testing endpoints...${NC}"
echo -n "  • Health endpoint: "
if curl -f -s https://weekly-report-backend.fly.dev/health | grep -q "ok"; then
    echo -e "${GREEN}✅${NC}"
else
    echo -e "${RED}❌${NC}"
fi

echo -n "  • API health: "
if curl -f -s https://weekly-report-backend.fly.dev/api/health | grep -q "ok"; then
    echo -e "${GREEN}✅${NC}"
else
    echo -e "${RED}❌${NC}"
fi

echo -n "  • Database health: "
if curl -f -s https://weekly-report-backend.fly.dev/api/health/db | grep -q "status"; then
    echo -e "${GREEN}✅${NC}"
else
    echo -e "${RED}❌${NC}"
fi

# Show final status
echo -e "${BLUE}📋 Deployment Status:${NC}"
flyctl status -a weekly-report-backend

echo -e "${GREEN}🎉 Deployment completed successfully!${NC}"
echo -e "${BLUE}📊 Configuration:${NC}"
echo "  • Region: Singapore (sin)"
echo "  • CPU: Performance"
echo "  • Memory: 2GB"
echo "  • Machines: 1"
echo "  • Auto-stop: false (24/7)"
echo ""
echo -e "${BLUE}🔗 Endpoints:${NC}"
echo "  • Backend: https://weekly-report-backend.fly.dev"
echo "  • Health: https://weekly-report-backend.fly.dev/health"
echo "  • API: https://weekly-report-backend.fly.dev/api/health"
echo "  • DB Health: https://weekly-report-backend.fly.dev/api/health/db"
echo ""
echo -e "${BLUE}💡 Next steps:${NC}"
echo "  1. Run migration: flyctl ssh console -a weekly-report-backend -C 'npx prisma migrate deploy'"
echo "  2. Seed database: flyctl ssh console -a weekly-report-backend -C 'npx tsx prisma/seed.ts'"
echo "  3. Import data: flyctl ssh console -a weekly-report-backend -C 'npx tsx prisma/import-all-data-from-excel.ts'"