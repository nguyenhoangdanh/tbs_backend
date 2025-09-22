#!/bin/bash

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}🔗 Getting Railway Backend URLs${NC}"
echo "=============================="

# Fixed domain from Railway output
DOMAIN="https://tbsreportsystembe-production.up.railway.app"

echo -e "${GREEN}✅ Backend URL found:${NC}"
echo ""
echo -e "${BLUE}🌐 Main URL:${NC} $DOMAIN"
echo -e "${BLUE}🏥 Health Check:${NC} $DOMAIN/health"
echo -e "${BLUE}📡 API Health:${NC} $DOMAIN/api/health"
echo -e "${BLUE}📊 DB Health:${NC} $DOMAIN/api/health/db"
echo ""
echo -e "${BLUE}📋 Copy this URL for frontend:${NC}"
echo "$DOMAIN"
echo ""
echo -e "${BLUE}💡 Test endpoints:${NC}"
echo "curl $DOMAIN/health"
echo "curl $DOMAIN/api/health"
echo ""

# Test the endpoints
echo -e "${BLUE}🧪 Testing endpoints...${NC}"
echo -n "🌐 Root endpoint: "
if curl -f -s "$DOMAIN" >/dev/null 2>&1; then
    echo -e "${GREEN}✅ OK${NC}"
else
    echo -e "${RED}❌ Failed${NC}"
fi

echo -n "🏥 Health endpoint: "
if curl -f -s "$DOMAIN/health" >/dev/null 2>&1; then
    echo -e "${GREEN}✅ OK${NC}"
else
    echo -e "${RED}❌ Failed${NC}"
fi

echo -n "📡 API health: "
if curl -f -s "$DOMAIN/api/health" >/dev/null 2>&1; then
    echo -e "${GREEN}✅ OK${NC}"
else
    echo -e "${RED}❌ Failed${NC}"
fi

# Also show Railway status
echo ""
echo -e "${BLUE}📊 Railway Status:${NC}"
railway status 2>/dev/null || echo "❌ Could not get status"
