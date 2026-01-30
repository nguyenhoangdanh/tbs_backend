import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function check() {
  const sample = await prisma.medicineInventory.findFirst({
    include: { medicine: { include: { category: true } } },
    orderBy: { medicine: { name: 'asc' } }
  });
  
  console.log('\n📊 SAMPLE INVENTORY RECORD:');
  console.log('Medicine:', sample?.medicine.name);
  console.log('Category:', sample?.medicine.category?.code, '-', sample?.medicine.category?.name || 'N/A');
  console.log('Opening Qty:', sample?.openingQuantity.toString());
  console.log('Monthly Import Qty:', sample?.monthlyImportQuantity.toString());
  console.log('Monthly Export Qty:', sample?.monthlyExportQuantity.toString());
  console.log('Closing Qty:', sample?.closingQuantity.toString());
  console.log('Expiry Date:', sample?.expiryDate);
  console.log('Yearly Import Qty:', sample?.yearlyImportQuantity.toString());
  console.log('Suggested Qty:', sample?.suggestedPurchaseQuantity.toString());
  
  const categories = await prisma.medicineCategory.findMany({
    include: { _count: { select: { medicines: true } } },
    orderBy: { sortOrder: 'asc' }
  });
  
  console.log('\n📋 CATEGORIES:');
  categories.forEach(cat => {
    console.log(`  ${cat.code}: ${cat.name} (${cat._count.medicines} medicines)`);
  });
  
  const total = await prisma.medicineInventory.count();
  console.log(`\n✅ Total inventory records: ${total}`);
  
  await prisma.$disconnect();
}

check().catch(console.error);
