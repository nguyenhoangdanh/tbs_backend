# Test Inventory Editor - Create/Update/Delete

## Test Cases

### 1. **Thêm thuốc mới (Create)**

**Hành động:**
- Right-click vào table → Insert row above/below
- Nhập thông tin thuốc mới:
  - STT: (auto)
  - TÊN THUỐC: "Vitamin C"
  - ĐƯỜNG DÙNG: "Uống"
  - HÀM LƯỢNG: "1000mg"
  - NƠI SẢN XUẤT: "DHG Pharma"
  - ĐVT: "viên"
  - SL NHẬP: 100
  - ĐƠN GIÁ: 500
  - HẠN SỬ DỤNG: "31/12/2027"
  - SL ĐỀ NGHỊ: 50
  - ĐƠN GIÁ ĐỀ NGHỊ: 520
- Click "Lưu thay đổi"

**Expected Result:**
- Frontend console: `🆕 New medicine to create: Vitamin C`
- Backend creates:
  1. Medicine record với name="Vitamin C"
  2. MedicineInventory record cho tháng hiện tại
  3. InventoryTransaction với type=IMPORT
- Toast: "Lưu thành công: 1 mới!"

### 2. **Cập nhật thuốc có sẵn (Update)**

**Hành động:**
- Chọn 1 dòng thuốc có sẵn (có medicineId)
- Thay đổi SL NHẬP từ 1,100 → 1,200
- Thay đổi ĐƠN GIÁ từ 556.50 → 600
- Click "Lưu thay đổi"

**Expected Result:**
- Frontend console: `📦 Saving changes: { updated: 1, new: 0, deleted: 0 }`
- Backend updates MedicineInventory record
- Toast: "Lưu thành công: 1 cập nhật!"

### 3. **Xóa thuốc (Delete)**

**Hành động:**
- Right-click vào 1 dòng thuốc → Remove row
- Confirm deletion
- Click "Lưu thay đổi"

**Expected Result:**
- Frontend console: `🗑️ Removed 1 row(s)` và `❌ Marked medicine for deletion: [name] ([id])`
- Status bar: "• 1 xóa"
- Backend (TODO): Soft delete medicine hoặc remove inventory record
- Toast: "Lưu thành công: 1 xóa!"

### 4. **Mixed operations**

**Hành động:**
- Thêm 2 thuốc mới
- Sửa 3 thuốc có sẵn
- Xóa 1 thuốc
- Click "Lưu thay đổi"

**Expected Result:**
- Status bar: "• 3 sửa, 2 mới, 1 xóa"
- Backend xử lý tất cả operations
- Toast: "Lưu thành công: 3 cập nhật, 2 mới, 1 xóa!"

### 5. **Tự động tìm thuốc theo tên**

**Hành động:**
- Thêm row mới với tên thuốc đã tồn tại: "Paracetamol"
- Nhập các thông tin khác
- Click "Lưu thay đổi"

**Expected Result:**
- Backend tìm thấy medicine có name="Paracetamol"
- Console: `📌 Using existing medicine: Paracetamol (matched by name)`
- Cập nhật inventory cho medicine đó thay vì tạo mới
- Toast: "Lưu thành công: 1 cập nhật!"

### 6. **Xác thực dữ liệu**

**Hành động:**
- Thêm row mới nhưng chỉ nhập SL, không nhập TÊN THUỐC
- Click "Lưu thay đổi"

**Expected Result:**
- Frontend console: `⚠️ Skipping new row without medicine name at index: [X]`
- Row đó bị skip, không gửi lên backend
- Các row khác vẫn được lưu bình thường

## API Payload Examples

### Create new medicine:
```json
{
  "month": 1,
  "year": 2026,
  "medicines": [
    {
      "name": "Vitamin C",
      "route": "Uống",
      "strength": "1000mg",
      "manufacturer": "DHG Pharma",
      "units": "viên",
      "monthlyImportQuantity": 100,
      "monthlyImportUnitPrice": 500,
      "suggestedPurchaseQuantity": 50,
      "suggestedPurchaseUnitPrice": 520,
      "expiryDate": "31/12/2027"
    }
  ]
}
```

### Update existing medicine:
```json
{
  "month": 1,
  "year": 2026,
  "medicines": [
    {
      "medicineId": "uuid-of-existing-medicine",
      "monthlyImportQuantity": 1200,
      "monthlyImportUnitPrice": 600,
      "suggestedPurchaseQuantity": 500,
      "suggestedPurchaseUnitPrice": 620
    }
  ]
}
```

## Backend Logic Flow

1. **Check medicineId first**
   - If provided → find medicine by ID
   - If not found → warn and try name search

2. **Check name if no ID or ID not found**
   - Search by name (case-insensitive, isActive=true)
   - If found → use existing medicine
   - If not found → create new medicine

3. **Category handling**
   - If categoryCode provided → find or create category
   - Link medicine to category

4. **Inventory update**
   - If no inventory record for month/year → create with full calculation
   - If exists → update only import/suggested fields, recalculate closing

5. **Transaction creation**
   - Only create transaction for NEW inventory records
   - Skip if updating existing record (avoid duplicates)
