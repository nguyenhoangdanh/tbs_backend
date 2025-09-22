#!/bin/bash
set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

export PATH="/home/hoangdanh2000/.fly/bin:$PATH"

echo -e "${BLUE}🔐 Setting up Fly.io secrets for production${NC}"
echo "============================================="

# Check if logged in
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

# Set secrets using Neon database URL
echo -e "${BLUE}📝 Setting production secrets...${NC}"

flyctl secrets set \
  DATABASE_URL="postgresql://neondb_owner:npg_7yTaSgJPi6Wb@ep-purple-base-a1jv1gjr.ap-southeast-1.aws.neon.tech/weekly-report_db?sslmode=require" \
  DIRECT_URL="postgresql://neondb_owner:npg_7yTaSgJPi6Wb@ep-purple-base-a1jv1gjr.ap-southeast-1.aws.neon.tech/weekly-report_db" \
  JWT_SECRET="aJX3NYxZepmbIbxjnRdLcus+VZVIHE0YtXsXjcpNyTA=" \
  JWT_EXPIRES_IN="7d" \
  JWT_REMEMBER_ME_EXPIRES_IN="30d" \
  FRONTEND_URL="https://weeklyreport-orpin.vercel.app" \
  COOKIE_DOMAIN="weekly-report-backend.fly.dev" \
  NODE_ENV="production" \
  -a weekly-report-backend

echo -e "${GREEN}✅ Secrets set successfully${NC}"

# Verify secrets
echo -e "${BLUE}🔍 Verifying secrets...${NC}"
flyctl secrets list -a weekly-report-backend

echo -e "${GREEN}🎉 Secret setup completed!${NC}"
echo -e "${BLUE}💡 Next step: ./scripts/deploy.sh${NC}"
