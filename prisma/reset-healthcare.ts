/**
 * Script xoá toàn bộ dữ liệu y tế (healthcare):
 * - inventory_transactions
 * - medicine_inventories
 * - medical_prescriptions
 * - medical_records
 * - medicines
 * - medicine_categories
 *
 * Thứ tự xoá đảm bảo đúng foreign key constraints.
 *
 * Usage (local):
 *   pnpm db:reset:healthcare
 *
 * Usage (prod):
 *   pnpm db:reset:healthcare:prod
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🗑️  Resetting healthcare data...\n');

  const [txCount, invCount, prescCount, recordCount, medCount, catCount] = await Promise.all([
    prisma.inventoryTransaction.count(),
    prisma.medicineInventory.count(),
    prisma.medicalPrescription.count(),
    prisma.medicalRecord.count(),
    prisma.medicine.count(),
    prisma.medicineCategory.count(),
  ]);

  console.log('📊 Current counts:');
  console.log(`  inventory_transactions : ${txCount}`);
  console.log(`  medicine_inventories   : ${invCount}`);
  console.log(`  medical_prescriptions  : ${prescCount}`);
  console.log(`  medical_records        : ${recordCount}`);
  console.log(`  medicines              : ${medCount}`);
  console.log(`  medicine_categories    : ${catCount}`);
  console.log('');

  const total = txCount + invCount + prescCount + recordCount + medCount + catCount;
  if (total === 0) {
    console.log('✅ Nothing to delete — database is already empty.');
    return;
  }

  // Delete in FK-safe order
  const d1 = await prisma.inventoryTransaction.deleteMany();
  console.log(`✓ Deleted ${d1.count} inventory transactions`);

  const d2 = await prisma.medicineInventory.deleteMany();
  console.log(`✓ Deleted ${d2.count} medicine inventories`);

  const d3 = await prisma.medicalPrescription.deleteMany();
  console.log(`✓ Deleted ${d3.count} medical prescriptions`);

  const d4 = await prisma.medicalRecord.deleteMany();
  console.log(`✓ Deleted ${d4.count} medical records`);

  const d5 = await prisma.medicine.deleteMany();
  console.log(`✓ Deleted ${d5.count} medicines`);

  const d6 = await prisma.medicineCategory.deleteMany();
  console.log(`✓ Deleted ${d6.count} medicine categories`);

  console.log('\n✅ Healthcare data reset complete.');
}

main()
  .catch((e) => {
    console.error('❌ Fatal:', e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
