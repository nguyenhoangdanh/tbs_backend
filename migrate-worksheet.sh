#!/bin/bash
# Worksheet Module Migration Guide

echo "🚀 Starting Worksheet Module Migration..."

# Step 1: Backup current service
echo "📦 Step 1: Backing up current service..."
cd /home/hoangdanhdev/Desktop/tbs_management/backend
mv src/modules/worksheet/worksheet.service.ts src/modules/worksheet/worksheet.service.backup.ts

# Step 2: Replace with new service
echo "🔄 Step 2: Replacing with new service..."
mv src/modules/worksheet/worksheet.service.new.ts src/modules/worksheet/worksheet.service.ts

# Step 3: Generate Prisma Client
echo "⚙️ Step 3: Generating Prisma Client..."
npx prisma generate

# Step 4: Create migration
echo "📝 Step 4: Creating migration..."
npx prisma migrate dev --name add_worksheet_record_items

# OR if you want to push directly (dev environment)
# npx prisma db push

echo "✅ Migration completed!"
echo ""
echo "📋 Next Steps:"
echo "1. Update worksheet.controller.ts to add new endpoints"
echo "2. Test APIs with Postman"
echo "3. Check WORKSHEET_API_DOCS.md for API documentation"
echo ""
echo "🔙 Rollback (if needed):"
echo "mv src/modules/worksheet/worksheet.service.backup.ts src/modules/worksheet/worksheet.service.ts"
