import { PrismaClient, PlanTier } from "@prisma/client";

const prisma = new PrismaClient();

const plans = [
  {
    tier: PlanTier.FREE,
    name: "Free",
    monthlyRowLimit: 100_000,
    monthlyPriceCents: 0,
    overagePer1000Cents: 0, // No overage on free — hard cap
    features: {
      priorityQueue: false,
      customRetention: false,
      scheduling: false,
      teamManagement: false,
      ipAllowlisting: false,
    },
  },
  {
    tier: PlanTier.PRO,
    name: "Pro",
    monthlyRowLimit: 1_000_000,
    monthlyPriceCents: 4900, // $49/mo
    overagePer1000Cents: 0, // No overage — hard cap
    features: {
      priorityQueue: true,
      customRetention: true,
      scheduling: true,
      teamManagement: false,
      ipAllowlisting: true,
    },
  },
  {
    tier: PlanTier.SCALE,
    name: "Scale",
    monthlyRowLimit: 10_000_000,
    monthlyPriceCents: 19900, // $199/mo
    overagePer1000Cents: 0, // No overage — hard cap
    features: {
      priorityQueue: true,
      customRetention: true,
      scheduling: true,
      teamManagement: true,
      ipAllowlisting: true,
    },
  },
];

async function main() {
  console.log("Seeding plans...");

  for (const plan of plans) {
    await prisma.plan.upsert({
      where: { tier: plan.tier },
      update: {
        name: plan.name,
        monthlyRowLimit: plan.monthlyRowLimit,
        monthlyPriceCents: plan.monthlyPriceCents,
        overagePer1000Cents: plan.overagePer1000Cents,
        features: plan.features,
      },
      create: plan,
    });
    console.log(`  ✓ ${plan.name} plan upserted`);
  }

  console.log("Done seeding plans.");
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
