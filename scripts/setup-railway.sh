#!/bin/bash
set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}🚂 Railway Setup Script (Updated)${NC}"
echo "=================================="

# Install Railway CLI if not exists
if ! command -v railway &> /dev/null; then
    echo -e "${BLUE}📦 Installing Railway CLI...${NC}"
    npm install -g @railway/cli
    echo -e "${GREEN}✅ Railway CLI installed${NC}"
else
    echo -e "${GREEN}✅ Railway CLI already installed${NC}"
fi

# Login to Railway
echo -e "${BLUE}🔐 Logging into Railway...${NC}"
railway login

# Create project (updated command)
echo -e "${BLUE}🏗️ Creating Railway project...${NC}"
railway init

# Generate domain
echo -e "${BLUE}🌐 Generating domain...${NC}"
railway domain

echo -e "${GREEN}🎉 Railway setup completed!${NC}"
echo -e "${BLUE}💡 Next step: ./scripts/deploy-railway.sh${NC}"
