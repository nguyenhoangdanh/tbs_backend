# Module Migration Checklist

## ✅ Backend Tasks

### Phase 1: Module Creation
- [x] Create OrganizationModule structure
- [x] Create ProductionModule structure
- [x] Migrate all services with exact logic
- [x] Migrate all controllers with new namespaces
- [x] Migrate all DTOs
- [x] Create hierarchy services
- [x] Create index.ts exports
- [x] Update app.module.ts imports

### Phase 2: Testing
- [ ] Test OrganizationModule endpoints
  - [ ] GET /organization/structure
  - [ ] GET /organization/hierarchy
  - [ ] CRUD /organization/offices
  - [ ] CRUD /organization/departments
  - [ ] CRUD /organization/positions
  - [ ] CRUD /organization/job-positions

- [ ] Test ProductionModule endpoints
  - [ ] GET /production/structure
  - [ ] GET /production/hierarchy
  - [ ] CRUD /production/factories
  - [ ] CRUD /production/lines
  - [ ] CRUD /production/teams
  - [ ] CRUD /production/groups
  - [ ] POST /production/groups/:id/members (test auto-create worksheets)

### Phase 3: Documentation
- [x] Create MODULE_CONSOLIDATION_README.md
- [ ] Update Swagger documentation
- [ ] Create API migration guide
- [ ] Document breaking changes

---

## ⏳ Frontend Tasks

### Phase 1: Service Layer
- [ ] Create `services/organizationService.ts`
  ```typescript
  export const organizationService = {
    // Offices
    getOffices: () => api.get('/organization/offices'),
    getOfficeById: (id) => api.get(`/organization/offices/${id}`),
    
    // Departments
    getDepartments: () => api.get('/organization/departments'),
    
    // Positions
    getPositions: () => api.get('/organization/positions'),
    
    // Job Positions
    getJobPositions: () => api.get('/organization/job-positions'),
    
    // Structure
    getStructure: () => api.get('/organization/structure'),
    getHierarchy: () => api.get('/organization/hierarchy'),
  };
  ```

- [ ] Create `services/productionService.ts`
  ```typescript
  export const productionService = {
    // Factories
    getFactories: () => api.get('/production/factories'),
    getFactoryStructure: (id) => api.get(`/production/factories/${id}/structure`),
    
    // Lines
    getLines: (factoryId?) => api.get('/production/lines', { params: { factoryId } }),
    
    // Teams
    getTeams: (lineId?) => api.get('/production/teams', { params: { lineId } }),
    
    // Groups
    getGroups: (teamId?) => api.get('/production/groups', { params: { teamId } }),
    addMember: (groupId, userId) => api.post(`/production/groups/${groupId}/members`, { userId }),
    
    // Structure
    getStructure: () => api.get('/production/structure'),
    getHierarchy: () => api.get('/production/hierarchy'),
  };
  ```

### Phase 2: Update Existing Pages
- [ ] Office Management
  - [ ] Update API calls to `/organization/offices`
  - [ ] Test CRUD operations
  
- [ ] Department Management
  - [ ] Update API calls to `/organization/departments`
  - [ ] Test CRUD operations
  
- [ ] Position Management
  - [ ] Update API calls to `/organization/positions`
  - [ ] Test CRUD operations
  
- [ ] Job Position Management
  - [ ] Update API calls to `/organization/job-positions`
  - [ ] Test CRUD operations

- [ ] Factory Management
  - [ ] Update API calls to `/production/factories`
  - [ ] Test factory structure endpoint
  - [ ] Test CRUD operations
  
- [ ] Line Management
  - [ ] Update API calls to `/production/lines`
  - [ ] Test CRUD operations
  
- [ ] Team Management
  - [ ] Update API calls to `/production/teams`
  - [ ] Test CRUD operations
  
- [ ] Group Management
  - [ ] Update API calls to `/production/groups`
  - [ ] Test add member with auto-worksheet creation
  - [ ] Test CRUD operations

### Phase 3: Routing
- [ ] Update route paths
  ```typescript
  // Old
  <Route path="/offices" element={<OfficePage />} />
  
  // New
  <Route path="/organization/offices" element={<OfficePage />} />
  ```

- [ ] Update navigation menu links

### Phase 4: State Management (if using Redux/Zustand)
- [ ] Update store slices for organization
- [ ] Update store slices for production
- [ ] Update action creators
- [ ] Update selectors

---

## 🧪 Testing Checklist

### Backend API Tests
- [ ] Organization Structure
  - [ ] Returns correct hierarchy
  - [ ] Includes all offices, departments, positions
  - [ ] Counts are accurate
  
- [ ] Production Structure
  - [ ] Returns correct hierarchy
  - [ ] Includes all factories, lines, teams, groups
  - [ ] Counts are accurate

- [ ] Group Member Addition
  - [ ] Successfully adds member
  - [ ] Auto-creates worksheets for last 7 days
  - [ ] Creates correct WorkSheetRecords
  - [ ] Handles different shift types correctly

### Frontend Integration Tests
- [ ] Office list page loads correctly
- [ ] Department list page loads correctly
- [ ] Factory structure displays hierarchy
- [ ] Group member addition shows success notification
- [ ] Auto-created worksheets appear in UI

---

## 🔄 Rollback Plan

If issues occur:

1. **Quick rollback**: Revert to old endpoints
   ```typescript
   // app.module.ts - Comment out new modules
   // OrganizationModule,
   // ProductionModule,
   ```

2. **Frontend rollback**: Revert service files
   ```bash
   git checkout HEAD~1 src/services/organizationService.ts
   git checkout HEAD~1 src/services/productionService.ts
   ```

3. **Database**: No changes needed (schema unchanged)

---

## 📊 Migration Progress

### Backend: ✅ 100% Complete
- [x] OrganizationModule
- [x] ProductionModule
- [x] All services migrated
- [x] All controllers migrated
- [x] All DTOs migrated
- [x] Documentation created

### Frontend: ⏳ 0% Complete
- [ ] Service layer
- [ ] Page updates
- [ ] Route updates
- [ ] Testing

---

## 🎯 Success Criteria

- [x] Backend có 2 module mới hoạt động
- [ ] Frontend migrate thành công tất cả pages
- [ ] Tất cả test cases pass
- [ ] No breaking changes cho users
- [ ] Performance không giảm
- [ ] Documentation hoàn chỉnh

---

## 📅 Timeline

- **Week 1**: Backend migration ✅ DONE
- **Week 2**: Frontend migration (in progress)
- **Week 3**: Testing & bug fixes
- **Week 4**: Remove deprecated modules

---

## 💡 Tips

1. **Test từng module một**: Không migrate tất cả cùng lúc
2. **Keep old endpoints**: Đảm bảo backward compatibility
3. **Monitor logs**: Check for errors sau migration
4. **User feedback**: Thu thập feedback từ users
5. **Gradual rollout**: Deploy từng feature một

---

## 🆘 Support

Nếu gặp vấn đề:
1. Check logs: `pm2 logs backend`
2. Check network: Browser DevTools
3. Check database: Prisma Studio
4. Review this checklist
5. Rollback if needed

---

## ✨ Final Notes

- Migration là **additive**, không remove code cũ ngay
- Test kỹ trước khi remove deprecated modules
- Communicate với team về breaking changes
- Update Postman collection với endpoints mới

---

**Last Updated**: 2024
**Status**: Backend Complete ✅, Frontend In Progress ⏳
