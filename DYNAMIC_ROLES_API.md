# Dynamic Roles System - API Documentation

## Overview
Hệ thống quản lý roles động cho phép:
- Tạo roles mới tùy ý (không giới hạn bởi enum)
- Gán nhiều roles cho 1 user
- Quản lý permissions theo từng role
- Backward compatible với hệ thống cũ

## Migration Strategy

### Phase 1: Database Migration
```bash
# Run migration to create new tables
npx prisma migrate deploy

# Migration will:
# 1. Create role_definitions, role_definition_permissions, user_roles tables
# 2. Seed system roles (SUPERADMIN, ADMIN, USER, WORKER, MEDICAL_STAFF)
# 3. Migrate existing user.role → user_roles table
# 4. Copy role_permissions → role_definition_permissions
```

### Phase 2: Backward Compatibility
- `User.role` field giữ nguyên cho backward compatibility
- System tự động ưu tiên `user_roles` nếu có
- Fallback về `User.role` nếu chưa assign roles mới

## API Endpoints

### 1. Role Management

#### GET /roles
Lấy danh sách tất cả roles
```bash
GET /roles?includeInactive=true
Authorization: Bearer <token>
```

**Response:**
```json
[
  {
    "id": "uuid",
    "name": "ADMIN",
    "code": "ADMIN",
    "description": "Administrator with management access",
    "isSystem": true,
    "isActive": true,
    "createdAt": "2025-12-24T...",
    "updatedAt": "2025-12-24T...",
    "_count": {
      "userAssignments": 5,
      "permissions": 45
    }
  }
]
```

#### GET /roles/:id
Lấy chi tiết role với permissions và users
```bash
GET /roles/{roleId}
```

**Response:**
```json
{
  "id": "uuid",
  "name": "TEAM_LEADER",
  "code": "TEAM_LEADER",
  "description": "Team leader role",
  "isSystem": false,
  "isActive": true,
  "permissions": [
    {
      "id": "uuid",
      "permission": {
        "resource": "users",
        "action": "view"
      },
      "isGranted": true
    }
  ],
  "userAssignments": [
    {
      "user": {
        "id": "uuid",
        "employeeCode": "001",
        "firstName": "John",
        "lastName": "Doe"
      }
    }
  ]
}
```

#### POST /roles
Tạo role mới (SUPERADMIN only)
```bash
POST /roles
Content-Type: application/json

{
  "name": "TEAM_LEADER",
  "code": "TEAM_LEADER",
  "description": "Team leader with limited management access",
  "permissionIds": ["perm-uuid-1", "perm-uuid-2"]
}
```

#### PUT /roles/:id
Cập nhật role
```bash
PUT /roles/{roleId}
Content-Type: application/json

{
  "description": "Updated description",
  "isActive": true,
  "permissionIds": ["perm-uuid-1", "perm-uuid-3"]
}
```

#### DELETE /roles/:id
Xóa role (không thể xóa system roles hoặc roles đang có users)
```bash
DELETE /roles/{roleId}
```

### 2. Role Permissions Management

#### PUT /roles/:id/permissions
Gán permissions cho role (replace all)
```bash
PUT /roles/{roleId}/permissions
Content-Type: application/json

{
  "permissionIds": ["uuid-1", "uuid-2", "uuid-3"]
}
```

### 3. User-Role Assignment

#### PUT /roles/users/:userId/roles
Gán roles cho user (replace all)
```bash
PUT /roles/users/{userId}/roles
Content-Type: application/json

{
  "roleDefinitionIds": ["role-uuid-1", "role-uuid-2"]
}
```

**Use case:** User có thể là vừa ADMIN vừa MEDICAL_STAFF

#### GET /roles/users/:userId/roles
Lấy danh sách roles của user
```bash
GET /roles/users/{userId}/roles
```

**Response:**
```json
[
  {
    "id": "user-role-uuid",
    "isActive": true,
    "roleDefinition": {
      "id": "role-uuid",
      "name": "ADMIN",
      "permissions": [...]
    }
  }
]
```

### 4. Role-User Assignment

#### GET /roles/:id/users
Lấy danh sách users có role này
```bash
GET /roles/{roleId}/users
```

#### POST /roles/:id/users
Gán role cho nhiều users
```bash
POST /roles/{roleId}/users
Content-Type: application/json

{
  "userIds": ["user-uuid-1", "user-uuid-2"]
}
```

#### DELETE /roles/:roleId/users/:userId
Xóa role khỏi user
```bash
DELETE /roles/{roleId}/users/{userId}
```

## Common Use Cases

### 1. Tạo Custom Role cho Team Leader
```bash
# 1. Tạo role mới
POST /roles
{
  "name": "TEAM_LEADER",
  "code": "TEAM_LEADER",
  "description": "Team leader role"
}

# 2. Gán permissions
PUT /roles/{teamLeaderRoleId}/permissions
{
  "permissionIds": [
    "groups:view",
    "groups:manage",
    "worksheets:view",
    "worksheets:update",
    "users:view"
  ]
}

# 3. Gán role cho users
POST /roles/{teamLeaderRoleId}/users
{
  "userIds": ["user1", "user2", "user3"]
}
```

### 2. User có nhiều roles
```bash
# User vừa là ADMIN vừa là MEDICAL_STAFF
PUT /roles/users/{userId}/roles
{
  "roleDefinitionIds": [
    "{adminRoleId}",
    "{medicalStaffRoleId}"
  ]
}

# Permissions sẽ merge từ cả 2 roles
# Admin permissions + Medical permissions + Custom user permissions
```

### 3. Migration từ hệ thống cũ
```bash
# Hệ thống tự động:
# 1. Tạo role definitions từ enum
# 2. Migrate user.role → user_roles
# 3. Copy role_permissions → role_definition_permissions

# User có thể tiếp tục dùng User.role (fallback)
# Hoặc chuyển sang user_roles (recommended)
```

## Frontend Integration

### 1. Get User's Merged Permissions
```typescript
// API response from /users/profile
{
  "permissions": {
    "role": "ADMIN", // Legacy field
    "permissions": ["users:view", "users:create", ...],
    "resources": {
      "users": { "view": true, "create": true, ... }
    }
  },
  "roles": [ // NEW: Array of assigned roles
    {
      "roleDefinition": {
        "name": "ADMIN",
        "code": "ADMIN"
      }
    }
  ]
}
```

### 2. Check Permissions
```typescript
// Same as before - works with multiple roles automatically
const { canView, canCreate } = usePermissions();

if (canView("users")) {
  // Show user list
}
```

## Database Schema

```prisma
model RoleDefinition {
  id          String   @id
  name        String   @unique
  code        String   @unique
  description String?
  isSystem    Boolean  // true for SUPERADMIN, ADMIN, etc.
  isActive    Boolean
}

model UserRole {
  userId           String
  roleDefinitionId String
  isActive         Boolean
  
  @@unique([userId, roleDefinitionId])
}

model RoleDefinitionPermission {
  roleDefinitionId String
  permissionId     String
  isGranted        Boolean
  
  @@unique([roleDefinitionId, permissionId])
}
```

## Security Notes

1. **SUPERADMIN only** có thể:
   - Tạo/xóa roles
   - Gán permissions cho roles
   - Gán roles cho users

2. **ADMIN** có thể:
   - Xem roles và permissions
   - Xem user assignments

3. **System roles** (isSystem=true):
   - Không thể xóa
   - Không thể đổi tên
   - Có thể cập nhật permissions

4. **Role deletion**:
   - Chỉ xóa được roles không có users
   - Phải remove all users trước khi xóa role
