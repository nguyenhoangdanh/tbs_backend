# Medicine Inventory Management Module

Module quản lý kho thuốc với đầy đủ chức năng xuất, nhập, tồn kho và báo cáo thống kê.

## 📋 Tổng quan

Module này cung cấp:
- ✅ Quản lý danh mục thuốc (Medicine Categories)
- ✅ Quản lý thuốc với thông tin chi tiết (tên, đường dùng, hàm lượng, nơi SX, v.v.)
- ✅ Quản lý xuất/nhập kho (Inventory Transactions)
- ✅ Tồn kho theo tháng/năm (Monthly & Yearly Inventory Balance)
- ✅ Tự động trừ tồn kho khi kê đơn thuốc
- ✅ Báo cáo thống kê đầy đủ
- ✅ Cảnh báo thuốc sắp hết hạn/tồn kho thấp
- ✅ Import dữ liệu từ Excel

## 🗄️ Database Schema

### MedicineCategory
Quản lý nhóm thuốc (VD: I, II, IX, XIII, XV, XVI, XVII)

```prisma
model MedicineCategory {
  id          String   @id @default(uuid())
  code        String   @unique // "I", "II", etc.
  name        String   // "NHÓM THUỐC HẠ SỐT..."
  description String?
  sortOrder   Int      @default(0)
  isActive    Boolean  @default(true)
  medicines   Medicine[]
}
```

### Medicine
Thông tin thuốc chi tiết

```prisma
model Medicine {
  id           String    @id @default(uuid())
  name         String
  categoryId   String?
  route        String?   // UỐNG, NHỎ MẮT, BÔI, DÁN
  strength     String?   // 500mg, 10ml
  manufacturer String?   // Nơi sản xuất
  units        String?   // viên, chai, lọ, hộp
  // ... relations
}
```

### MedicineInventory
Tồn kho theo tháng/năm

```prisma
model MedicineInventory {
  medicineId    String
  month         Int    // 1-12
  year          Int
  
  // Tồn đầu kỳ
  openingQuantity, openingUnitPrice, openingTotalAmount
  
  // Phát sinh tháng - Nhập/Xuất
  monthlyImportQuantity, monthlyImportUnitPrice, monthlyImportAmount
  monthlyExportQuantity, monthlyExportUnitPrice, monthlyExportAmount
  
  // Tồn cuối kỳ
  closingQuantity, closingUnitPrice, closingTotalAmount
  
  // Lũy kế năm - Nhập/Xuất
  yearlyImportQuantity, yearlyImportUnitPrice, yearlyImportAmount
  yearlyExportQuantity, yearlyExportUnitPrice, yearlyExportAmount
  
  // Đề nghị mua
  suggestedPurchaseQuantity, suggestedPurchaseUnitPrice, suggestedPurchaseAmount
}
```

### InventoryTransaction
Lịch sử giao dịch xuất/nhập kho

```prisma
model InventoryTransaction {
  type          InventoryTransactionType // IMPORT, EXPORT, ADJUSTMENT
  quantity      Decimal
  unitPrice     Decimal
  totalAmount   Decimal
  referenceType String? // "MEDICAL_RECORD", "PURCHASE_ORDER"
  referenceId   String?
  expiryDate    DateTime?
  batchNumber   String?
  supplier      String?
}
```

## 🚀 API Endpoints

### Medicine Categories

```
GET    /inventory/categories           - Lấy danh sách categories
POST   /inventory/categories           - Tạo category mới
PATCH  /inventory/categories/:id       - Cập nhật category
DELETE /inventory/categories/:id       - Xóa category (soft delete)
```

### Inventory Transactions

```
POST   /inventory/transactions         - Tạo giao dịch xuất/nhập/điều chỉnh
GET    /inventory/transactions         - Lấy lịch sử giao dịch
       ?medicineId=xxx
       &type=IMPORT|EXPORT|ADJUSTMENT
       &startDate=2024-01-01
       &endDate=2024-12-31
```

### Bulk Import

```
POST   /inventory/bulk-import          - Import từ Excel (parsed data)
```

**Request body example:**
```json
{
  "month": 1,
  "year": 2024,
  "medicines": [
    {
      "stt": 1,
      "name": "Paracetamol",
      "categoryCode": "I",
      "route": "UỐNG",
      "strength": "500mg",
      "manufacturer": "Việt Nam",
      "units": "viên",
      "openingQuantity": 1000,
      "openingUnitPrice": 100,
      "monthlyImportQuantity": 500,
      "monthlyImportUnitPrice": 100,
      "monthlyExportQuantity": 300,
      "monthlyExportUnitPrice": 100,
      "expiryDate": "2025-12-31"
    }
  ]
}
```

### Reports

```
GET    /inventory/reports/monthly      - Báo cáo tháng
       ?month=1&year=2024
       &categoryId=xxx
       &search=paracetamol

GET    /inventory/reports/yearly/:year - Báo cáo năm (tất cả tháng)
       ?categoryId=xxx
```

### Stock Management

```
GET    /inventory/stock/alerts         - Cảnh báo tồn kho thấp & sắp hết hạn
       ?minThreshold=10
       &daysUntilExpiry=30

GET    /inventory/stock/:medicineId/current - Tồn kho hiện tại của thuốc

PATCH  /inventory/balance              - Cập nhật tồn kho thủ công
```

## 📊 Import từ Excel

### Cách 1: Sử dụng API (từ Frontend)

Frontend parse Excel bằng **ExcelJS**, sau đó gọi API:

```typescript
// Frontend code example (React/Next.js)
import * as XLSX from 'xlsx';

async function handleFileUpload(file: File, month: number, year: number) {
  // 1. Đọc Excel file
  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer);
  const worksheet = workbook.Sheets[workbook.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json(worksheet);
  
  // 2. Transform data theo format
  const medicines = data.map((row: any) => ({
    stt: row['STT'],
    name: row['TÊN THUỐC'],
    categoryCode: row['NHÓM'],
    route: row['ĐƯỜNG DÙNG'],
    strength: row['HÀM LƯỢNG'],
    manufacturer: row['NƠI SX'],
    units: row['ĐƠN VỊ TÍNH'],
    openingQuantity: row['TĐK_SL'],
    openingUnitPrice: row['TĐK_ĐG'],
    monthlyImportQuantity: row['NHẬP_SL'],
    monthlyImportUnitPrice: row['NHẬP_ĐG'],
    monthlyExportQuantity: row['XUẤT_SL'],
    monthlyExportUnitPrice: row['XUẤT_ĐG'],
    closingQuantity: row['TCK_SL'],
    closingUnitPrice: row['TCK_ĐG'],
    expiryDate: row['HẠN SỬ DỤNG'],
    yearlyImportQuantity: row['LKN_NHẬP_SL'],
    yearlyImportUnitPrice: row['LKN_NHẬP_ĐG'],
    yearlyExportQuantity: row['LKN_XUẤT_SL'],
    yearlyExportUnitPrice: row['LKN_XUẤT_ĐG'],
    suggestedPurchaseQuantity: row['ĐN_SL'],
    suggestedPurchaseUnitPrice: row['ĐN_ĐG'],
  }));
  
  // 3. Gọi API
  const response = await fetch('/api/inventory/bulk-import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ month, year, medicines })
  });
  
  return response.json();
}
```

### Cách 2: Script backend (cho testing/seeding)

```bash
# 1. Tạo categories
pnpm tsx prisma/seed-medicine-categories.ts

# 2. Import data từ Excel
pnpm tsx prisma/import-inventory-from-excel.ts ./data/medicines-jan-2024.xlsx 1 2024
```

## 🔄 Logic tự động trừ tồn kho

Khi tạo medical record với prescriptions, hệ thống tự động:

1. ✅ Tạo medical record và prescriptions
2. ✅ Kiểm tra tồn kho hiện tại
3. ✅ Tạo InventoryTransaction loại EXPORT
4. ✅ Tự động cập nhật MedicineInventory (trừ số lượng)
5. ⚠️ Warning nếu tồn kho không đủ (không block)

```typescript
// Trong HealthcareService.createMedicalRecord()
for (const prescription of prescriptions) {
  // Check stock
  const currentStock = await inventoryService.getCurrentStock(medicineId);
  
  if (currentStock.currentStock < quantity) {
    console.warn('Insufficient stock!');
  }
  
  // Create EXPORT transaction
  await inventoryService.createInventoryTransaction({
    medicineId,
    type: 'EXPORT',
    quantity,
    unitPrice: currentStock.unitPrice,
    referenceType: 'MEDICAL_RECORD',
    referenceId: medicalRecord.id
  });
}
```

## 📈 Báo cáo thống kê

### Monthly Report
```json
{
  "month": 1,
  "year": 2024,
  "inventories": [
    {
      "medicine": {
        "name": "Paracetamol",
        "category": { "code": "I", "name": "..." }
      },
      "openingQuantity": 1000,
      "monthlyImportQuantity": 500,
      "monthlyExportQuantity": 300,
      "closingQuantity": 1200,
      "expiryDate": "2025-12-31"
    }
  ],
  "summary": {
    "totalOpeningAmount": 100000,
    "totalImportAmount": 50000,
    "totalExportAmount": 30000,
    "totalClosingAmount": 120000,
    "totalSuggestedAmount": 80000
  }
}
```

### Stock Alerts
```json
{
  "lowStockItems": [
    {
      "medicine": { "name": "Paracetamol" },
      "closingQuantity": 5,
      "month": 1,
      "year": 2024
    }
  ],
  "expiringItems": [
    {
      "medicine": { "name": "Aspirin" },
      "expiryDate": "2024-02-15",
      "closingQuantity": 100
    }
  ]
}
```

## 🔐 Permissions

Tất cả endpoints yêu cầu roles: `MEDICAL_STAFF`, `ADMIN`, hoặc `SUPERADMIN`

## 🧪 Testing

```bash
# 1. Chạy migration
pnpm prisma migrate dev

# 2. Seed categories
pnpm tsx prisma/seed-medicine-categories.ts

# 3. Test API với Postman/Thunder Client
# Hoặc sử dụng Swagger UI tại /api-docs
```

## 📝 Template Excel

Cấu trúc file Excel mẫu:

| A (STT) | B (TÊN THUỐC) | C (ĐƯỜNG DÙNG) | D (HÀM LƯỢNG) | E (NƠI SX) | F (ĐVT) | G-I (TĐK) | J-O (Phát sinh) | P-R (TCK) | S (HSD) | T-Y (Lũy kế) | Z-AB (Đề nghị) |
|---------|---------------|----------------|---------------|------------|---------|-----------|-----------------|-----------|---------|--------------|----------------|
| 1 | Paracetamol | UỐNG | 500mg | VN | viên | 1000/100/100000 | 500/100/50000 - 300/100/30000 | 1200/100/120000 | 31/12/2025 | ... | ... |

## 🎯 Best Practices

1. **Luôn import categories trước** khi import medicines
2. **Sử dụng ExcelJS ở frontend** để parse Excel, không upload raw file
3. **Kiểm tra tồn kho** trước khi kê đơn (optional warning)
4. **Backup database** trước khi bulk import
5. **Sử dụng transactions** để đảm bảo data consistency

## 🐛 Troubleshooting

**Q: Tồn kho bị âm?**
- Kiểm tra logic trong `updateInventoryBalance()`
- Đảm bảo tồn đầu kỳ được set đúng

**Q: Import Excel bị lỗi?**
- Kiểm tra format cột Excel
- Đảm bảo categories đã được seed
- Xem console logs để debug

**Q: Không tự động trừ kho khi kê đơn?**
- Kiểm tra InventoryService đã được inject vào HealthcareService
- Xem error logs trong console
