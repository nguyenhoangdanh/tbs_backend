import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const medicines = [
    { name: "Paracetamol", dosage: "500mg", frequency: "2 lần/ngày", instructions: "sau ăn", units: "viên" },
    { name: "Ibuprofen", dosage: "200mg", frequency: "3 lần/ngày", instructions: "sau ăn", units: "viên" },
    { name: "Amoxicillin", dosage: "500mg", frequency: "3 lần/ngày", instructions: "trước ăn", units: "viên" },
    { name: "Cefuroxime", dosage: "250mg", frequency: "2 lần/ngày", instructions: "sau ăn", units: "viên" },
    { name: "Azithromycin", dosage: "500mg", frequency: "1 lần/ngày", instructions: "trước ăn", units: "viên" },
    { name: "Ciprofloxacin", dosage: "500mg", frequency: "2 lần/ngày", instructions: "trước ăn", units: "viên" },
    { name: "Metformin", dosage: "500mg", frequency: "2 lần/ngày", instructions: "sau ăn", units: "viên" },
    { name: "Losartan", dosage: "50mg", frequency: "1 lần/ngày", instructions: "sáng", units: "viên" },
    { name: "Amlodipine", dosage: "5mg", frequency: "1 lần/ngày", instructions: "sáng", units: "viên" },
    { name: "Atorvastatin", dosage: "20mg", frequency: "1 lần/ngày", instructions: "tối", units: "viên" },
    { name: "Omeprazole", dosage: "20mg", frequency: "1 lần/ngày", instructions: "trước ăn sáng", units: "viên" },
    { name: "Ranitidine", dosage: "150mg", frequency: "2 lần/ngày", instructions: "trước ăn", units: "viên" },
    { name: "Vitamin C", dosage: "500mg", frequency: "1 lần/ngày", instructions: "sau ăn", units: "viên" },
    { name: "Vitamin D3", dosage: "1000IU", frequency: "1 lần/ngày", instructions: "sáng", units: "viên" },
    { name: "Calcium Carbonate", dosage: "500mg", frequency: "1 lần/ngày", instructions: "sau ăn", units: "viên" },
    { name: "Ferrous Sulfate", dosage: "325mg", frequency: "1 lần/ngày", instructions: "sau ăn", units: "viên" },
    { name: "Cetirizine", dosage: "10mg", frequency: "1 lần/ngày", instructions: "tối", units: "viên" },
    { name: "Loratadine", dosage: "10mg", frequency: "1 lần/ngày", instructions: "sáng", units: "viên" },
    { name: "Salbutamol", dosage: "2mg", frequency: "3 lần/ngày", instructions: "khi khó thở", units: "viên" },
    { name: "Hydroxyzine", dosage: "25mg", frequency: "2 lần/ngày", instructions: "tối", units: "viên" },
  ];

  for (const med of medicines) {
    await prisma.medicine.upsert({
      where: { name: med.name },
      update: {},
      create: med,
    });
  }

  console.log("✅ Seeded 20 medicines successfully!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
