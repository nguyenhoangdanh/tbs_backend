#!/bin/bash
set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}🚂 Deploy to Railway (Fixed Environment Variables)${NC}"
echo "================================================="

# Check if Railway CLI is installed
if ! command -v railway &> /dev/null; then
    echo -e "${RED}❌ Railway CLI not found${NC}"
    echo -e "${BLUE}💡 Install: npm install -g @railway/cli${NC}"
    exit 1
fi

# Check if logged in
if ! railway whoami >/dev/null 2>&1; then
    echo -e "${YELLOW}⚠️  Not logged into Railway${NC}"
    echo -e "${BLUE}🔐 Logging in...${NC}"
    railway login
fi

# Check if project exists
echo -e "${BLUE}🔍 Checking Railway project status...${NC}"
if ! railway status >/dev/null 2>&1; then
    echo -e "${YELLOW}⚠️  No Railway project linked${NC}"
    echo -e "${BLUE}🏗️ Creating new project...${NC}"
    railway init
fi

# Check if service exists, if not create one
echo -e "${BLUE}🔧 Setting up Railway service...${NC}"
if ! railway service list | grep -q "weekly-report-backend"; then
    echo -e "${BLUE}🆕 Creating new service...${NC}"
    railway service create weekly-report-backend --source repo
fi

# Connect to service
railway service connect weekly-report-backend

# Set environment variables one by one to ensure they are applied
echo -e "${BLUE}🔧 Setting environment variables individually...${NC}"

railway variables set NODE_ENV=production
echo "  ✅ NODE_ENV set"

railway variables set PORT=8080
echo "  ✅ PORT set"

railway variables set DATABASE_URL="postgresql://neondb_owner:npg_7yTaSgJPi6Wb@ep-purple-base-a1jv1gjr.ap-southeast-1.aws.neon.tech/weekly-report_db?sslmode=require"
echo "  ✅ DATABASE_URL set"

railway variables set DIRECT_URL="postgresql://neondb_owner:npg_7yTaSgJPi6Wb@ep-purple-base-a1jv1gjr.ap-southeast-1.aws.neon.tech/weekly-report_db"
echo "  ✅ DIRECT_URL set"

railway variables set JWT_SECRET="aJX3NYxZepmbIbxjnRdLcus+VZVIHE0YtXsXjcpNyTA="
echo "  ✅ JWT_SECRET set"

railway variables set JWT_EXPIRES_IN="7d"
echo "  ✅ JWT_EXPIRES_IN set"

railway variables set JWT_REMEMBER_ME_EXPIRES_IN="30d"
echo "  ✅ JWT_REMEMBER_ME_EXPIRES_IN set"

railway variables set FRONTEND_URL="https://weeklyreport-orpin.vercel.app"
echo "  ✅ FRONTEND_URL set"

railway variables set CORS_ORIGINS="https://weeklyreport-orpin.vercel.app,https://weeklyreportsystem-mu.vercel.app"
echo "  ✅ CORS_ORIGINS set"

# Verify environment variables
echo -e "${BLUE}🔍 Verifying environment variables...${NC}"
railway variables

# Wait a moment for variables to propagate
echo -e "${BLUE}⏳ Waiting for environment variables to propagate...${NC}"
sleep 10

# Build locally first
echo -e "${BLUE}🏗️ Building application...${NC}"
pnpm run build

# Generate pnpm-lock.yaml if missing
if [ ! -f "pnpm-lock.yaml" ]; then
    echo -e "${BLUE}📦 Generating pnpm-lock.yaml...${NC}"
    pnpm install --lockfile-only
fi

# Deploy to Railway
echo -e "${BLUE}🚂 Deploying to Railway...${NC}"
railway up --detach

# Wait longer for deployment to complete
echo -e "${BLUE}⏳ Waiting for deployment to complete...${NC}"
sleep 60

# Get domain
echo -e "${BLUE}🌐 Getting application domain...${NC}"
DOMAIN=""

# Try to get domain multiple times
for i in {1..10}; do
    DOMAIN_OUTPUT=$(railway domain 2>/dev/null || echo "")
    DOMAIN=$(echo "$DOMAIN_OUTPUT" | grep -o 'https://[^ ]*' | head -n1 || echo "")
    
    if [ -n "$DOMAIN" ]; then
        echo -e "${GREEN}✅ Domain found: $DOMAIN${NC}"
        break
    fi
    
    echo -e "${YELLOW}⏳ Waiting for domain... ($i/10)${NC}"
    
    if [ $i -eq 5 ]; then
        echo -e "${BLUE}🌐 Generating domain...${NC}"
        railway domain create || true
    fi
    
    sleep 10
done

if [ -z "$DOMAIN" ]; then
    echo -e "${YELLOW}⚠️  Could not get domain automatically${NC}"
    echo -e "${BLUE}📊 Checking service status...${NC}"
    railway status
    echo -e "${BLUE}🔗 Opening Railway dashboard...${NC}"
    railway open
    DOMAIN="https://YOUR-APP-NAME.up.railway.app"
fi

echo -e "${BLUE}🌐 Application URL: $DOMAIN${NC}"

# Extended health checks with more patience
echo -e "${BLUE}🏥 Running health checks (this may take a while)...${NC}"
HEALTH_PASSED=false

for i in {1..30}; do
    if curl -f -s "$DOMAIN/health" >/dev/null 2>&1; then
        echo -e "${GREEN}✅ Health check passed${NC}"
        HEALTH_PASSED=true
        break
    fi
    
    if [ $((i % 5)) -eq 0 ]; then
        echo -e "${YELLOW}⏳ Still waiting for app to start... ($i/30)${NC}"
        echo -e "${BLUE}🔍 Checking recent logs...${NC}"
        railway logs --tail 5
    fi
    
    sleep 30
done

if [ "$HEALTH_PASSED" = false ]; then
    echo -e "${RED}❌ Health check failed after 15 minutes${NC}"
    echo -e "${BLUE}🔍 Checking detailed logs...${NC}"
    railway logs --tail 50
    echo -e "${YELLOW}⚠️  App might still be starting. Check Railway dashboard for status.${NC}"
fi

# Test endpoints if health check passed
if [ "$HEALTH_PASSED" = true ]; then
    echo -e "${BLUE}🧪 Testing all endpoints...${NC}"
    
    echo -n "  • Health endpoint: "
    if curl -f -s "$DOMAIN/health" | grep -q "ok"; then
        echo -e "${GREEN}✅${NC}"
    else
        echo -e "${RED}❌${NC}"
    fi

    echo -n "  • API health: "
    if curl -f -s "$DOMAIN/api/health" | grep -q "ok"; then
        echo -e "${GREEN}✅${NC}"
    else
        echo -e "${RED}❌${NC}"
    fi

    echo -n "  • Database health: "
    if curl -f -s "$DOMAIN/api/health/db" >/dev/null 2>&1; then
        echo -e "${GREEN}✅${NC}"
    else
        echo -e "${RED}❌${NC}"
    fi
fi

echo -e "${GREEN}🎉 Deployment process completed!${NC}"
echo -e "${BLUE}📊 Railway Deployment Summary:${NC}"
echo "  • URL: $DOMAIN"
echo "  • Health: $DOMAIN/health"
echo "  • API: $DOMAIN/api/health"
echo "  • Database: $DOMAIN/api/health/db"
echo "  • Cost: ~$5/month"
echo ""
echo -e "${BLUE}💡 Next steps:${NC}"
echo "  1. Run migration: railway run npx prisma migrate deploy"
echo "  2. Seed database: railway run npx tsx prisma/seed.ts"
echo "  3. Import data: railway run npx tsx prisma/import-all-data-from-excel.ts"
echo ""
echo -e "${BLUE}🔗 Management commands:${NC}"
echo "  • View logs: railway logs"
echo "  • Check variables: railway variables"
echo "  • Open dashboard: railway open"
echo "  • Service status: railway status"

# Show current environment variables for verification
echo -e "${BLUE}🔍 Current environment variables:${NC}"
railway variables | head -20
