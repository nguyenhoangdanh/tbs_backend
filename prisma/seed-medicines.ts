// prisma/seed.ts
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const medicines = [
  { name: "Aciclovir / Medskin Clovir", dosage: "400mg", frequency: "", instructions: "", units: "viên" },
  { name: "Aciclovir bôi ngoài da", dosage: "5%", frequency: "", instructions: "", units: "tuýp" },
  { name: "Amoxicillin", dosage: "500mg", frequency: "", instructions: "", units: "viên" },
  { name: "Protamol / Agiprofen", dosage: "", frequency: "", instructions: "", units: "viên" },
  { name: "Alphachymotrypsin", dosage: "", frequency: "", instructions: "", units: "viên" },
  { name: "Spacmarizine", dosage: "40mg", frequency: "", instructions: "", units: "viên" },
  { name: "Acetylcystein", dosage: "200mg", frequency: "", instructions: "", units: "viên" },
  { name: "Vitamin C", dosage: "500mg", frequency: "", instructions: "", units: "viên" },
  { name: "Folic-Fe / Agifivit", dosage: "", frequency: "", instructions: "", units: "viên" },
  { name: "Bromhexin (Bixovom)", dosage: "8mg", frequency: "", instructions: "", units: "viên" },
  { name: "Cephalexin", dosage: "500mg", frequency: "", instructions: "", units: "viên" },
  { name: "Coldacmin", dosage: "", frequency: "", instructions: "", units: "viên" },
  { name: "Chlorpheniramin", dosage: "4mg", frequency: "", instructions: "", units: "viên" },
  { name: "Cetirizin", dosage: "", frequency: "", instructions: "", units: "viên" },
  { name: "Cinnarizin", dosage: "", frequency: "", instructions: "", units: "viên" },
  { name: "Calcium Hasan", dosage: "500mg", frequency: "", instructions: "", units: "viên" },
  { name: "Vitamin C sủi", dosage: "1000mg", frequency: "", instructions: "", units: "viên" },
  { name: "Calci D", dosage: "", frequency: "", instructions: "", units: "viên" },
  { name: "Carbomango", dosage: "", frequency: "", instructions: "", units: "viên" },
  { name: "Cimetidin", dosage: "300mg", frequency: "", instructions: "", units: "viên" },
  { name: "Ciprofloxacin (Vidiphar)", dosage: "0.3% / 5ml", frequency: "", instructions: "", units: "chai" },
  { name: "Domitazol", dosage: "", frequency: "", instructions: "", units: "viên" },
  { name: "Diclofenac", dosage: "", frequency: "", instructions: "", units: "viên" },
  { name: "Decontapp Pharco", dosage: "250mg", frequency: "", instructions: "", units: "viên" },
  { name: "Dextromethorphan / Vacotexphan", dosage: "", frequency: "", instructions: "", units: "viên" },
  { name: "Domperidon (Mutecium-M)", dosage: "", frequency: "", instructions: "", units: "viên" },
  { name: "Erythromycin (VDP)", dosage: "", frequency: "", instructions: "", units: "viên" },
  { name: "Eugica Fort", dosage: "", frequency: "", instructions: "", units: "viên" },
  { name: "Enpovid AD", dosage: "", frequency: "", instructions: "", units: "viên" },
  { name: "Gikanin / Tangynyl", dosage: "500mg", frequency: "", instructions: "", units: "viên" },
  { name: "Phosphalugel", dosage: "", frequency: "", instructions: "", units: "gói" },
  { name: "Hapacol", dosage: "650mg", frequency: "", instructions: "", units: "viên" },
  { name: "Levoogi", dosage: "5mg", frequency: "", instructions: "", units: "viên" },
  { name: "Loperamid", dosage: "2mg", frequency: "", instructions: "", units: "viên" },
  { name: "Neocin", dosage: "", frequency: "", instructions: "", units: "chai" },
  { name: "Methylprednisolon", dosage: "16mg", frequency: "", instructions: "", units: "viên" },
  { name: "Metronidazol", dosage: "250mg", frequency: "", instructions: "", units: "viên" },
  { name: "Meloxicam", dosage: "", frequency: "", instructions: "", units: "viên" },
  { name: "Mekocoramin", dosage: "", frequency: "", instructions: "", units: "viên" },
  { name: "Magnesi B6", dosage: "", frequency: "", instructions: "", units: "viên" },
  { name: "Ovac (Omeprazol)", dosage: "20mg", frequency: "", instructions: "", units: "viên" },
  { name: "Oresol Baby", dosage: "4.1g", frequency: "", instructions: "", units: "gói" },
  { name: "Prednisolon", dosage: "", frequency: "", instructions: "", units: "viên" },
  { name: "Paracetamol", dosage: "500mg", frequency: "", instructions: "", units: "viên" },
  { name: "Piracetam", dosage: "800mg", frequency: "", instructions: "", units: "viên" },
  { name: "Biolac", dosage: "", frequency: "", instructions: "", units: "viên" },
  { name: "Smecta", dosage: "", frequency: "", instructions: "", units: "gói" },
  { name: "Sorbitol", dosage: "", frequency: "", instructions: "", units: "gói" },
  { name: "Terpin-Codein / Terpinzoat", dosage: "", frequency: "", instructions: "", units: "viên" },
  { name: "Theralene / Toussolene", dosage: "5mg", frequency: "", instructions: "", units: "viên" },
  { name: "Tyrotab / Pasitussin", dosage: "", frequency: "", instructions: "", units: "viên" },
  { name: "Vitamin PP", dosage: "", frequency: "", instructions: "", units: "viên" },
  { name: "Vitamin B1-B6-B12", dosage: "", frequency: "", instructions: "", units: "viên" },
  { name: "Vitamin B1", dosage: "", frequency: "", instructions: "", units: "viên" },
  { name: "Hoạt huyết DN", dosage: "", frequency: "", instructions: "", units: "viên" },
  { name: "Amlodipin", dosage: "5mg", frequency: "", instructions: "", units: "viên" },
  { name: "Panadol", dosage: "500mg", frequency: "", instructions: "", units: "viên" },
  { name: "Cefuroxim", dosage: "500mg", frequency: "", instructions: "", units: "viên" },
  { name: "Ciprofloxacin", dosage: "500mg", frequency: "", instructions: "", units: "viên" },
  { name: "Cefixim", dosage: "200mg", frequency: "", instructions: "", units: "viên" },
  { name: "Captopril", dosage: "25mg", frequency: "", instructions: "", units: "viên" },
  { name: "Griseofulvin bôi ngoài da", dosage: "5%", frequency: "", instructions: "", units: "tuýp" },
  { name: "Tenoxicam", dosage: "20mg", frequency: "", instructions: "", units: "viên" },
  { name: "Loravidi (Loratadin)", dosage: "10mg", frequency: "", instructions: "", units: "viên" },
  { name: "Polydesone", dosage: "5ml", frequency: "", instructions: "", units: "chai" },
  { name: "Gentamycin", dosage: "0.3% / 5ml", frequency: "", instructions: "", units: "chai" },
  { name: "Natri Clorid 0.9%", dosage: "10ml", frequency: "", instructions: "", units: "chai" },
  { name: "Biosubtyl-II", dosage: "", frequency: "", instructions: "", units: "gói" },
  { name: "Silkeron", dosage: "", frequency: "", instructions: "", units: "tuýp" },
  { name: "Efferalgan", dosage: "500mg", frequency: "", instructions: "", units: "viên" },
  { name: "Klamentin", dosage: "1g", frequency: "", instructions: "", units: "viên" },
  { name: "Zaromax", dosage: "500mg", frequency: "", instructions: "", units: "viên" },
  { name: "Celecoxib", dosage: "200mg", frequency: "", instructions: "", units: "viên" },
  { name: "Dinalvic VPC", dosage: "", frequency: "", instructions: "", units: "viên" },
  { name: "Nidal", dosage: "", frequency: "", instructions: "", units: "viên" }
];

async function main() {
  for (const med of medicines) {
    await prisma.medicine.upsert({
      where: { name: med.name },
      update: {
        dosage: med.dosage,
        frequency: med.frequency,
        instructions: med.instructions,
        units: med.units,
        isActive: true,
      },
      create: med,
    });
  }
  console.log(`✅ Seeded ${medicines.length} medicines (frequency & instructions set to "" where unknown).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
