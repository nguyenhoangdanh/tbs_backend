import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function debug() {
  console.log('\n🔍 DEBUG MEDICINES & INVENTORY\n');
  
  // 1. Count medicines
  const medicineCount = await prisma.medicine.count();
  console.log(`📊 Total Medicines: ${medicineCount}`);
  
  // 2. Count medicines with category
  const medicinesWithCategory = await prisma.medicine.count({
    where: { categoryId: { not: null } }
  });
  console.log(`📂 Medicines with Category: ${medicinesWithCategory}`);
  
  // 3. Count medicines WITHOUT category
  const medicinesWithoutCategory = await prisma.medicine.count({
    where: { categoryId: null }
  });
  console.log(`⚠️  Medicines WITHOUT Category: ${medicinesWithoutCategory}`);
  
  // 4. Count inventory records
  const inventoryCount = await prisma.medicineInventory.count();
  console.log(`📦 Total Inventory Records: ${inventoryCount}`);
  
  // 5. Count inventory for January 2026
  const jan2026Count = await prisma.medicineInventory.count({
    where: { month: 1, year: 2026 }
  });
  console.log(`📅 Inventory for Jan 2026: ${jan2026Count}`);
  
  // 6. Sample medicines without category
  if (medicinesWithoutCategory > 0) {
    const samples = await prisma.medicine.findMany({
      where: { categoryId: null },
      take: 5,
      select: { id: true, name: true, categoryId: true }
    });
    console.log('\n📝 Sample medicines WITHOUT category:');
    samples.forEach(m => console.log(`   - ${m.name} (ID: ${m.id})`));
  }
  
  // 7. Sample medicines WITH category
  if (medicinesWithCategory > 0) {
    const samples = await prisma.medicine.findMany({
      where: { categoryId: { not: null } },
      take: 5,
      include: { category: true }
    });
    console.log('\n✅ Sample medicines WITH category:');
    samples.forEach(m => console.log(`   - ${m.name} → ${m.category?.code} (${m.category?.name})`));
  }
  
  // 8. Categories with medicine count
  const categories = await prisma.medicineCategory.findMany({
    include: {
      _count: { select: { medicines: true } }
    },
    orderBy: { sortOrder: 'asc' }
  });
  
  console.log('\n📋 Categories Medicine Count:');
  categories.forEach(cat => {
    console.log(`   ${cat.code.padEnd(5)} - ${cat.name}: ${cat._count.medicines} medicines`);
  });
  
  await prisma.$disconnect();
}

debug().catch(console.error);
