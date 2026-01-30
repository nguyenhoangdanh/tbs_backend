# Migration Guide - Inventory Management Module

## ⚠️ Quan trọng trước khi migrate

1. **Backup database** trước khi chạy migration
2. Đảm bảo có file `.env` với `DATABASE_URL`
3. Module này thêm 3 tables mới và cập nhật table `medicines`

## 🗂️ Database Changes

### New Tables

1. **medicine_categories** - Danh mục nhóm thuốc
2. **medicine_inventories** - Tồn kho theo tháng/năm
3. **inventory_transactions** - Lịch sử giao dịch xuất/nhập

### Updated Tables

1. **medicines** - Thêm các fields:
   - `categoryId` - Link đến category
   - `route` - Đường dùng (UỐNG, NHỎ MẮT, v.v.)
   - `manufacturer` - Nơi sản xuất
   - Bỏ constraint `@unique` trên `name` (cho phép duplicate names)

### New Enum

```prisma
enum InventoryTransactionType {
  IMPORT       // Nhập kho
  EXPORT       // Xuất kho (kê đơn)
  ADJUSTMENT   // Điều chỉnh (kiểm kê, hỏng hóc)
}
```

## 🚀 Cách chạy Migration

### Bước 1: Kiểm tra DATABASE_URL

```bash
# Kiểm tra file .env
cat .env | grep DATABASE_URL

# Nếu chưa có, thêm vào:
echo "DATABASE_URL=postgresql://user:password@localhost:5432/dbname" >> .env
```

### Bước 2: Backup Database

```bash
# PostgreSQL backup
pg_dump -U username -d dbname > backup_before_inventory_$(date +%Y%m%d).sql

# Hoặc dùng script có sẵn
./scripts/backup-database.sh
```

### Bước 3: Chạy Migration

```bash
# Development
pnpm prisma migrate dev --name add_inventory_management

# Production (railway/deployed)
pnpm prisma migrate deploy
```

### Bước 4: Seed Medicine Categories

```bash
pnpm tsx prisma/seed-medicine-categories.ts
```

Expected output:
```
🌱 Seeding medicine categories...
✅ Created/updated 17 medicine categories
🎉 Seed completed successfully!
```

## 📋 Migration SQL Summary

Migration sẽ tạo:

```sql
-- 1. Create medicine_categories table
CREATE TABLE "medicine_categories" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "code" TEXT NOT NULL UNIQUE,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

-- 2. Create medicine_inventories table
CREATE TABLE "medicine_inventories" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "medicineId" TEXT NOT NULL,
  "month" INTEGER NOT NULL,
  "year" INTEGER NOT NULL,
  "expiryDate" DATE,
  -- Tồn đầu kỳ, phát sinh, tồn cuối kỳ, lũy kế năm...
  -- (18 Decimal fields)
  CONSTRAINT "medicine_inventories_medicineId_month_year_key" UNIQUE("medicineId", "month", "year")
);

-- 3. Create inventory_transactions table
CREATE TABLE "inventory_transactions" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "medicineId" TEXT NOT NULL,
  "type" "InventoryTransactionType" NOT NULL,
  "quantity" DECIMAL(18,2) NOT NULL,
  "unitPrice" DECIMAL(18,2) NOT NULL,
  "totalAmount" DECIMAL(18,2) NOT NULL,
  -- ... other fields
);

-- 4. Update medicines table
ALTER TABLE "medicines" 
  ADD COLUMN "categoryId" TEXT,
  ADD COLUMN "route" TEXT,
  ADD COLUMN "manufacturer" TEXT;

-- Drop unique constraint on name (if exists)
ALTER TABLE "medicines" DROP CONSTRAINT IF EXISTS "medicines_name_key";
```

## ✅ Verification Steps

Sau khi migrate, kiểm tra:

```bash
# 1. Check tables created
psql -d dbname -c "\dt medicine*"
psql -d dbname -c "\dt inventory*"

# 2. Check categories
psql -d dbname -c "SELECT code, name FROM medicine_categories ORDER BY sortOrder;"

# Expected: 17 categories (I to XVII)

# 3. Test API
curl -X GET http://localhost:3000/inventory/categories \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## 🔄 Rollback (nếu cần)

```bash
# 1. Restore từ backup
psql -U username -d dbname < backup_before_inventory_YYYYMMDD.sql

# 2. Hoặc revert migration
pnpm prisma migrate resolve --rolled-back add_inventory_management
```

## 🐛 Troubleshooting

### Lỗi: "Environment variable not found: DATABASE_URL"
```bash
# Fix: Tạo/check file .env
cp .env.example .env
# Edit DATABASE_URL
```

### Lỗi: "Foreign key constraint failed"
```bash
# Có thể do dữ liệu cũ
# Giải pháp: Clean hoặc migrate từng bước
```

### Lỗi: "Unique constraint violation on medicines.name"
```bash
# Migration sẽ tự động drop constraint này
# Nếu vẫn lỗi, chạy manual:
psql -d dbname -c 'ALTER TABLE medicines DROP CONSTRAINT IF EXISTS "medicines_name_key";'
```

## 📊 Data Migration (Optional)

Nếu đã có data thuốc cũ, có thể cần migrate:

```sql
-- Set default category cho medicines cũ (nếu cần)
UPDATE medicines 
SET "categoryId" = (SELECT id FROM medicine_categories WHERE code = 'I' LIMIT 1)
WHERE "categoryId" IS NULL;

-- Hoặc để NULL (optional category)
```

## ✨ Sau khi Migration

1. ✅ Test API endpoints
2. ✅ Import sample data từ Excel (optional)
3. ✅ Test tạo medical record → check auto deduct stock
4. ✅ Check báo cáo thống kê

```bash
# Test workflow
# 1. Create category
# 2. Create medicine
# 3. Import inventory data
# 4. Create medical record with prescriptions
# 5. Check inventory updated
```

## 📞 Support

Nếu gặp vấn đề:
1. Check logs: `docker logs backend` hoặc `pnpm dev`
2. Check Prisma Studio: `pnpm prisma studio`
3. Review migration file trong `prisma/migrations/`
