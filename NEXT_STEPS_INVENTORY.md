# 🚀 NEXT STEPS - Triển khai Module Inventory Management

## ⚠️ Quan trọng

Module inventory management đã được code hoàn chỉnh nhưng **chưa chạy migration**.  
Bạn cần làm theo các bước sau để kích hoạt module.

---

## 📝 BƯỚC 1: Kiểm tra .env

Đảm bảo file `.env` có DATABASE_URL:

```bash
# Backend directory
cd /home/hoangdanhdev/Desktop/tbs_management/backend

# Check .env
cat .env | grep DATABASE_URL

# Nếu không có, copy từ .env.example
cp .env.example .env
# Sau đó edit DATABASE_URL
```

---

## 🗄️ BƯỚC 2: Chạy Migration

```bash
# Tạo migration và apply vào database
pnpm prisma migrate dev --name add_inventory_management

# Output mong đợi:
# ✔ Migration đã tạo và apply thành công
# ✔ 3 tables mới: medicine_categories, medicine_inventories, inventory_transactions
# ✔ Table medicines đã được update
```

**Hoặc** nếu đang ở production:

```bash
pnpm prisma migrate deploy
```

---

## 🌱 BƯỚC 3: Seed Medicine Categories

```bash
# Tạo 17 nhóm thuốc (I-XVII)
pnpm tsx prisma/seed-medicine-categories.ts

# Output mong đợi:
# 🌱 Seeding medicine categories...
# ✅ Created/updated 17 medicine categories
# 🎉 Seed completed successfully!
```

---

## ✅ BƯỚC 4: Verify

Kiểm tra xem đã thành công chưa:

```bash
# Option 1: Prisma Studio
pnpm prisma studio
# Mở browser → Check tables: medicine_categories, medicine_inventories

# Option 2: PostgreSQL CLI
psql -d your_database -c "SELECT code, name FROM medicine_categories ORDER BY sortOrder;"

# Expected output: 17 rows từ I đến XVII
```

---

## 🧪 BƯỚC 5: Test API

### 5.1 Start server

```bash
pnpm dev
```

### 5.2 Test endpoints

```bash
# 1. Get categories
curl -X GET http://localhost:3000/inventory/categories \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Expected: Array of 17 categories

# 2. Get medicines (should be empty initially)
curl -X GET http://localhost:3000/healthcare/medicines \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# 3. Check Swagger docs
# Open: http://localhost:3000/api-docs
# Look for: /inventory/* endpoints
```

---

## 📊 BƯỚC 6: Import Data (Optional)

### Option A: Import từ Excel file (Backend script - Testing)

```bash
# Prepare Excel file với đúng format (xem INVENTORY_MODULE_README.md)
pnpm tsx prisma/import-inventory-from-excel.ts ./path/to/medicines.xlsx 1 2024

# Example:
pnpm tsx prisma/import-inventory-from-excel.ts ./data/medicines-jan-2024.xlsx 1 2024
```

### Option B: Import từ Frontend (Production)

Frontend code (sử dụng ExcelJS):
```typescript
// See examples in INVENTORY_API_EXAMPLES.md
// Parse Excel → POST /inventory/bulk-import
```

---

## 🎯 BƯỚC 7: Test Workflow Hoàn Chỉnh

### Scenario: Nhập thuốc → Kê đơn → Check báo cáo

```bash
# 1. Tạo medicine mới
POST /healthcare/medicines
{
  "name": "Paracetamol 500mg",
  "categoryId": "category-uuid-from-step-3",
  "route": "UỐNG",
  "strength": "500mg",
  "units": "viên"
}

# 2. Nhập kho
POST /inventory/transactions
{
  "medicineId": "medicine-uuid-from-step-1",
  "type": "IMPORT",
  "quantity": 1000,
  "unitPrice": 100
}

# 3. Check tồn kho
GET /inventory/stock/{medicineId}/current
# Expected: currentStock = 1000

# 4. Kê đơn thuốc (tự động trừ kho)
POST /healthcare/medical-records
{
  "patientEmployeeCode": "NV001",
  "doctorId": "doctor-uuid",
  "prescriptions": [
    {
      "medicineId": "medicine-uuid",
      "quantity": 10
    }
  ]
}

# 5. Check tồn kho lại
GET /inventory/stock/{medicineId}/current
# Expected: currentStock = 990 (đã trừ 10)

# 6. Check transaction history
GET /inventory/transactions?medicineId={medicineId}
# Expected: 2 transactions (1 IMPORT, 1 EXPORT)

# 7. Check báo cáo tháng
GET /inventory/reports/monthly?month=1&year=2024
# Expected: Report với thuốc vừa import/export
```

---

## 📚 FILES QUAN TRỌNG

Đã tạo các file documentation:

1. **INVENTORY_MANAGEMENT_SUMMARY.md** ← Đọc đầu tiên  
   Tổng quan toàn bộ module

2. **src/healthcare/INVENTORY_MODULE_README.md**  
   Hướng dẫn chi tiết sử dụng module

3. **src/healthcare/INVENTORY_API_EXAMPLES.md**  
   Ví dụ API requests/responses

4. **MIGRATION_INVENTORY_GUIDE.md**  
   Hướng dẫn migration chi tiết

5. **THIS_FILE.md** (NEXT_STEPS.md)  
   Các bước triển khai

---

## 🐛 Troubleshooting

### Lỗi: "Property 'medicineCategory' does not exist"

**Nguyên nhân:** Chưa chạy migration hoặc chưa generate Prisma Client

**Fix:**
```bash
pnpm prisma migrate dev --name add_inventory_management
pnpm prisma generate
```

### Lỗi: "DATABASE_URL not found"

**Fix:**
```bash
# Tạo .env file
echo "DATABASE_URL=postgresql://user:password@localhost:5432/dbname" > .env
```

### Lỗi: Migration failed

**Fix:**
```bash
# Check database đang chạy
docker ps | grep postgres

# Hoặc restart database
docker-compose restart postgres

# Reset migration (careful!)
pnpm prisma migrate reset
```

### Lỗi: Cannot import Excel

**Fix:**
```bash
# Check format Excel file (xem template trong README)
# Đảm bảo có đúng columns A-AB
# Category code phải match với đã seed
```

---

## ✨ Tính Năng Hoạt Động Sau Khi Setup

- ✅ Quản lý 17 nhóm thuốc
- ✅ CRUD medicines với đầy đủ thông tin
- ✅ Nhập/xuất/điều chỉnh kho
- ✅ Import bulk từ Excel
- ✅ Tự động trừ kho khi kê đơn
- ✅ Báo cáo tháng/năm
- ✅ Cảnh báo tồn kho thấp/hết hạn
- ✅ Lịch sử giao dịch đầy đủ

---

## 🎓 Học Thêm

Để hiểu rõ hơn về module:

1. Đọc **Prisma schema** (`prisma/schema.prisma`)
   - Models: MedicineCategory, Medicine, MedicineInventory, InventoryTransaction

2. Đọc **InventoryService** (`src/healthcare/inventory.service.ts`)
   - Business logic cho xuất/nhập/báo cáo

3. Đọc **HealthcareService** (`src/healthcare/healthcare.service.ts`)
   - Logic tự động trừ kho khi kê đơn

4. Xem **Swagger UI** (http://localhost:3000/api-docs)
   - API documentation tương tác

---

## 📞 Support

Nếu gặp vấn đề:

1. Check console logs: `pnpm dev`
2. Check Prisma Studio: `pnpm prisma studio`
3. Review migration files: `prisma/migrations/`
4. Read documentation files listed above

---

## 🎉 Kết Luận

Module đã sẵn sàng! Chỉ cần:

1. ✅ Run migration (BƯỚC 2)
2. ✅ Seed categories (BƯỚC 3)
3. ✅ Start testing (BƯỚC 5-7)

**Happy coding! 🚀**

---

*Last updated: January 2026*
