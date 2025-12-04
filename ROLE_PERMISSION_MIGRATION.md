# Role & Permission System - Migration Guide

## 📋 Overview

This migration adds a **dynamic Role & Permission system** to replace the hardcoded `Role` enum with a flexible, database-driven approach.

### ✨ New Features:
- ✅ **Dynamic Roles**: Create, update, delete roles via API
- ✅ **Granular Permissions**: Resource-based permissions (users.create, worksheets.read, etc.)
- ✅ **Role Hierarchy**: Level-based system (100=superadmin, 80=admin, etc.)
- ✅ **User-Specific Permissions**: Override role permissions for individual users
- ✅ **Permission Guards**: `@RequirePermission()` decorator for route protection

---

## 🚀 Migration Steps

### 1. Generate Prisma Client

```bash
cd backend
npx prisma generate
```

### 2. Create Migration

```bash
npx prisma migrate dev --name add_role_and_permission_system
```

**⚠️ This will:**
- Add `Role` model
- Add `Permission`, `RolePermission`, `UserPermission` models
- Change `User.role` from enum to relation (`User.roleId`)
- Rename `Role` enum to `UserRole` (deprecated)

### 3. Data Migration Script

Create `prisma/migrations/XXXXXX_migrate_user_roles_data.ts`:

```typescript
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function migrateUserRoles() {
  console.log('🔄 Migrating user roles from enum to Role model...');
  
  // Create default roles first
  const roles = {
    SUPERADMIN: await prisma.role.findUnique({ where: { code: 'superadmin' } }),
    ADMIN: await prisma.role.findUnique({ where: { code: 'admin' } }),
    LINE_MANAGER: await prisma.role.findUnique({ where: { code: 'line_manager' } }),
    GROUP_LEADER: await prisma.role.findUnique({ where: { code: 'group_leader' } }),
    WORKER: await prisma.role.findUnique({ where: { code: 'worker' } }),
    MEDICAL_STAFF: await prisma.role.findUnique({ where: { code: 'medical_staff' } }),
  };

  // Map old enum values to new role IDs
  const users = await prisma.$queryRaw`SELECT id, role FROM users`;
  
  for (const user of users) {
    const roleCode = user.role.toLowerCase().replace('_', '_');
    const newRole = roles[user.role];
    
    if (newRole) {
      await prisma.user.update({
        where: { id: user.id },
        data: { roleId: newRole.id },
      });
      console.log(`   ✅ Migrated user ${user.id}: ${user.role} → ${newRole.name}`);
    } else {
      console.warn(`   ⚠️  No matching role for ${user.role}, defaulting to WORKER`);
      await prisma.user.update({
        where: { id: user.id },
        data: { roleId: roles.WORKER.id },
      });
    }
  }
  
  console.log('✅ User roles migrated successfully!');
}

migrateUserRoles()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
```

**Run migration:**
```bash
ts-node prisma/migrations/XXXXXX_migrate_user_roles_data.ts
```

### 4. Seed Roles & Permissions

```bash
# Seed initial roles
ts-node prisma/seeds/seed-roles.ts

# Seed permissions and assign to roles
ts-node prisma/seeds/seed-permissions.ts
```

### 5. Register Modules in App

Update `app.module.ts`:

```typescript
import { RolesModule } from './roles/roles.module';
import { PermissionsModule } from './permissions/permissions.module';

@Module({
  imports: [
    // ...existing modules
    RolesModule,
    PermissionsModule,
  ],
})
export class AppModule {}
```

### 6. Update RolesGuard

Update `src/common/guards/roles.guard.ts`:

```typescript
// Before: Check enum
if (user.role === Role.ADMIN) { }

// After: Check role code or level
if (user.role.code === 'admin') { }
// OR
if (user.role.level >= 80) { }
```

---

## 📚 Usage Examples

### 1. Protect Routes with Permissions

```typescript
import { RequirePermission } from '../common/guards/permission.guard';
import { PermissionGuard } from '../common/guards/permission.guard';

@Post()
@UseGuards(JwtAuthGuard, PermissionGuard)
@RequirePermission('users', 'create')
async createUser(@Body() dto: CreateUserDto) {
  // Only users with "users.create" permission can access
}
```

### 2. Create Custom Role

```typescript
POST /roles
{
  "name": "FACTORY_SUPERVISOR",
  "code": "factory_supervisor",
  "description": "Supervisor of factory operations",
  "level": 40
}
```

### 3. Assign Permissions to Role

```typescript
POST /permissions/role/assign
{
  "roleId": "role-uuid",
  "permissionId": "permission-uuid",
  "isActive": true
}
```

### 4. Assign Role to User

```typescript
POST /roles/assign-user
{
  "userId": "user-uuid",
  "roleId": "role-uuid"
}
```

### 5. Grant User-Specific Permission

```typescript
POST /permissions/user/assign
{
  "userId": "user-uuid",
  "permissionId": "permission-uuid",
  "isGranted": true
}
```

### 6. Check Permission in Code

```typescript
const hasPermission = await permissionsService.checkUserPermission(
  userId,
  'worksheets',
  'export'
);

if (!hasPermission) {
  throw new ForbiddenException('No export permission');
}
```

---

## 📊 API Endpoints

### Roles
- `GET /roles` - List all roles
- `GET /roles/hierarchy` - Get role hierarchy
- `GET /roles/:roleId` - Get role details
- `POST /roles` - Create role (SUPERADMIN)
- `PATCH /roles/:roleId` - Update role (SUPERADMIN)
- `DELETE /roles/:roleId` - Delete role (SUPERADMIN)
- `POST /roles/assign-user` - Assign role to user

### Permissions
- `GET /permissions` - List all permissions
- `GET /permissions/by-resource/:resource` - Get permissions for resource
- `POST /permissions` - Create permission (SUPERADMIN)
- `GET /permissions/role/:role` - Get role permissions
- `POST /permissions/role/assign` - Assign permission to role
- `GET /permissions/user/:userId` - Get user permissions
- `POST /permissions/user/assign` - Assign permission to user
- `GET /permissions/me` - Get current user permissions

---

## 🔐 Default Role Levels

| Role | Level | Description |
|------|-------|-------------|
| SUPERADMIN | 100 | Full system access |
| ADMIN | 80 | Office/department management |
| LINE_MANAGER | 50 | Production line management |
| GROUP_LEADER | 30 | Team leadership |
| MEDICAL_STAFF | 20 | Medical clinic access |
| WORKER | 10 | Basic production worker |

---

## ⚠️ Breaking Changes

1. **Import changes:**
   ```typescript
   // ❌ Old
   import { Role } from '@prisma/client';
   
   // ✅ New
   import { UserRole } from '@prisma/client'; // Deprecated enum
   // Use Role model instead via relations
   ```

2. **Guard changes:**
   ```typescript
   // ❌ Old
   @Roles(Role.ADMIN, Role.SUPERADMIN)
   
   // ✅ New (temporary during migration)
   @Roles('ADMIN', 'SUPERADMIN')
   
   // ✅ Best (after migration)
   @UseGuards(PermissionGuard)
   @RequirePermission('users', 'create')
   ```

3. **User role checks:**
   ```typescript
   // ❌ Old
   if (user.role === Role.ADMIN)
   
   // ✅ New
   if (user.role.code === 'admin')
   // OR
   if (user.role.level >= 80)
   ```

---

## 🧪 Testing

```bash
# Test role creation
curl -X POST http://localhost:3000/roles \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"CUSTOM_ROLE","code":"custom_role","level":45}'

# Test permission check
curl http://localhost:3000/permissions/user/$USER_ID/check?resource=users&action=create \
  -H "Authorization: Bearer $TOKEN"
```

---

## 📝 Notes

- **System roles** (`isSystem: true`) cannot be deleted
- Users can only assign roles with **lower level** than their own
- **SUPERADMIN** always has all permissions (hardcoded check)
- Permissions are checked in order: Role permissions → User-specific overrides

---

## 🆘 Troubleshooting

**Error: "Property 'role' does not exist on PrismaService"**
```bash
# Run prisma generate
npx prisma generate
```

**Error: "Cannot delete role with users"**
```bash
# Reassign users to another role first
POST /roles/assign-user
```

**Permission denied after migration**
```bash
# Re-seed permissions and role assignments
ts-node prisma/seeds/seed-permissions.ts
```

---

✅ **Migration complete!** Your system now has a flexible role & permission system.