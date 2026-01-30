import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function verifyTypes() {
  console.log('\n📊 VERIFICATION REPORT');
  console.log('='.repeat(60));
  
  // Count by type
  const medicineCount = await prisma.medicine.count({ where: { type: 'MEDICINE' } });
  const emergencyCount = await prisma.medicine.count({ where: { type: 'EMERGENCY_SUPPLY' } });
  const equipmentCount = await prisma.medicine.count({ where: { type: 'MEDICAL_EQUIPMENT' } });
  
  console.log(`\n📋 Total Items by Type:`);
  console.log(`   MEDICINE (Thuốc):           ${medicineCount}`);
  console.log(`   EMERGENCY_SUPPLY (Cấp cứu): ${emergencyCount}`);
  console.log(`   MEDICAL_EQUIPMENT (Vật tư): ${equipmentCount}`);
  console.log(`   TOTAL:                      ${medicineCount + emergencyCount + equipmentCount}`);
  
  // Sample items by category
  console.log(`\n🔍 Sample Items by Category:`);
  
  const categories = await prisma.medicineCategory.findMany({
    include: {
      medicines: {
        take: 3,
        select: { name: true, type: true }
      }
    },
    orderBy: { sortOrder: 'asc' }
  });
  
  for (const cat of categories) {
    if (cat.medicines.length > 0) {
      console.log(`\n   ${cat.code}. ${cat.name} (Type: ${cat.type})`);
      console.log(`      Items: ${cat.medicines.length > 0 ? cat.medicines.map(m => `${m.name} [${m.type}]`).join(', ') : 'None'}`);
    }
  }
  
  console.log('\n' + '='.repeat(60));
}

verifyTypes()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
