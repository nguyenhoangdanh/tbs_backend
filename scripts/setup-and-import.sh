#!/bin/bash
# Script to setup database and import data in correct order

set -e # Exit on error

echo "🚀 Starting database setup and data import..."
echo ""

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Step 1: Reset database
echo -e "${BLUE}📦 Step 1: Resetting database and running migrations...${NC}"
pnpm local:migrate:reset
echo -e "${GREEN}✅ Database reset complete${NC}"
echo ""

# Step 2: Seed system roles
echo -e "${BLUE}👤 Step 2: Seeding system roles (SUPERADMIN, ADMIN, USER, WORKER, MEDICAL_STAFF)...${NC}"
pnpm local:seed
echo -e "${GREEN}✅ Roles seeded${NC}"
echo ""

# Step 3: Seed permissions
echo -e "${BLUE}🔐 Step 3: Seeding permissions for each role...${NC}"
pnpm local:seed:permissions
echo -e "${GREEN}✅ Permissions seeded${NC}"
echo ""

# Step 4: Import user data
echo -e "${BLUE}📥 Step 4: Importing users from Excel...${NC}"
pnpm local:import
echo -e "${GREEN}✅ Users imported with roles assigned${NC}"
echo ""

echo -e "${GREEN}🎉 Setup and import completed successfully!${NC}"
echo ""
echo "ℹ️  Next steps:"
echo "   - Run 'pnpm start:dev' to start the backend"
echo "   - Users are created with password: 123456"
echo "   - Check user roles in database or via API"
