#!/bin/bash
set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

export PATH="/home/hoangdanh2000/.fly/bin:$PATH"

echo -e "${BLUE}🚀 Creating Fly.io app for Weekly Report Backend${NC}"
echo "================================================="

# Check if logged in
if ! flyctl auth whoami >/dev/null 2>&1; then
    echo -e "${RED}❌ Not logged into Fly.io${NC}"
    echo -e "${BLUE}💡 Run: flyctl auth login${NC}"
    exit 1
fi

# Check if app already exists
if flyctl status -a weekly-report-backend >/dev/null 2>&1; then
    echo -e "${YELLOW}⚠️  App 'weekly-report-backend' already exists${NC}"
    echo -e "${BLUE}📊 Current app status:${NC}"
    flyctl status -a weekly-report-backend
    exit 0
fi

echo -e "${BLUE}🏗️ Creating new app...${NC}"

# Create app with Singapore region
flyctl apps create weekly-report-backend --org personal

# Allocate IPv4 address (required for HTTPS)
echo -e "${BLUE}🌐 Allocating IPv4 address...${NC}"
flyctl ips allocate-v4 -a weekly-report-backend

# Show app info
echo -e "${GREEN}✅ App created successfully!${NC}"
echo -e "${BLUE}📊 App details:${NC}"
flyctl status -a weekly-report-backend

echo -e "${BLUE}🔗 App URLs:${NC}"
echo "  • Dashboard: https://fly.io/apps/weekly-report-backend"
echo "  • Hostname: https://weekly-report-backend.fly.dev"

echo -e "${GREEN}🎉 App creation completed!${NC}"
echo -e "${BLUE}💡 Next steps:${NC}"
echo "  1. Set secrets: ./scripts/set-secrets.sh"
echo "  2. Deploy app: ./scripts/deploy.sh"
