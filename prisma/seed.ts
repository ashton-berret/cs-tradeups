import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Clean slate
  await prisma.tradeupExecution.deleteMany();
  await prisma.tradeupBasketItem.deleteMany();
  await prisma.tradeupBasket.deleteMany();
  await prisma.tradeupOutcomeItem.deleteMany();
  await prisma.tradeupPlanRule.deleteMany();
  await prisma.inventoryItem.deleteMany();
  await prisma.candidateListing.deleteMany();
  await prisma.tradeupPlan.deleteMany();

  // -----------------------------------------------------------------------
  // Plan 1: Snakebite Collection — Mil-Spec → Restricted
  // Good plan with positive expected profit
  // -----------------------------------------------------------------------
  const plan1 = await prisma.tradeupPlan.create({
    data: {
      name: 'Snakebite Mil-Spec → Restricted',
      description: 'Target USP-S The Traitor and M4A4 Tooth Fairy from Snakebite Mil-Spec inputs',
      inputRarity: 'MIL_SPEC',
      targetRarity: 'RESTRICTED',
      isActive: true,
      minProfitThreshold: 0.50,
      minProfitPctThreshold: 15,
      rules: {
        create: [
          {
            collection: 'The Snakebite Collection',
            rarity: 'MIL_SPEC',
            maxFloat: 0.35,
            maxBuyPrice: 2.50,
            priority: 1,
            isPreferred: true,
          },
          {
            collection: 'The Snakebite Collection',
            rarity: 'MIL_SPEC',
            exterior: 'FIELD_TESTED',
            minFloat: 0.15,
            maxFloat: 0.28,
            maxBuyPrice: 2.00,
            priority: 2,
            isPreferred: true,
          },
        ],
      },
      outcomeItems: {
        create: [
          {
            marketHashName: 'USP-S | The Traitor (Field-Tested)',
            weaponName: 'USP-S',
            skinName: 'The Traitor',
            collection: 'The Snakebite Collection',
            rarity: 'RESTRICTED',
            estimatedMarketValue: 8.50,
            probabilityWeight: 1.0,
          },
          {
            marketHashName: 'M4A4 | Tooth Fairy (Field-Tested)',
            weaponName: 'M4A4',
            skinName: 'Tooth Fairy',
            collection: 'The Snakebite Collection',
            rarity: 'RESTRICTED',
            estimatedMarketValue: 4.20,
            probabilityWeight: 1.0,
          },
        ],
      },
    },
  });

  // -----------------------------------------------------------------------
  // Plan 2: Fracture Collection — Restricted → Classified
  // Weaker plan, kept for comparison
  // -----------------------------------------------------------------------
  const plan2 = await prisma.tradeupPlan.create({
    data: {
      name: 'Fracture Restricted → Classified',
      description: 'Target Desert Eagle Printstream from Fracture Restricted inputs. Margins are thin.',
      inputRarity: 'RESTRICTED',
      targetRarity: 'CLASSIFIED',
      isActive: true,
      minProfitThreshold: 1.00,
      minProfitPctThreshold: 10,
      rules: {
        create: [
          {
            collection: 'The Fracture Collection',
            rarity: 'RESTRICTED',
            maxFloat: 0.25,
            maxBuyPrice: 8.00,
            priority: 1,
          },
        ],
      },
      outcomeItems: {
        create: [
          {
            marketHashName: 'Desert Eagle | Printstream (Field-Tested)',
            weaponName: 'Desert Eagle',
            skinName: 'Printstream',
            collection: 'The Fracture Collection',
            rarity: 'CLASSIFIED',
            estimatedMarketValue: 42.00,
            probabilityWeight: 1.0,
          },
          {
            marketHashName: 'Glock-18 | Vogue (Field-Tested)',
            weaponName: 'Glock-18',
            skinName: 'Vogue',
            collection: 'The Fracture Collection',
            rarity: 'CLASSIFIED',
            estimatedMarketValue: 5.50,
            probabilityWeight: 1.0,
          },
        ],
      },
    },
  });

  // -----------------------------------------------------------------------
  // Plan 3: Inactive plan for testing filters
  // -----------------------------------------------------------------------
  await prisma.tradeupPlan.create({
    data: {
      name: 'Dreams & Nightmares Industrial → Mil-Spec',
      description: 'Paused — margins collapsed after price shift',
      inputRarity: 'INDUSTRIAL_GRADE',
      targetRarity: 'MIL_SPEC',
      isActive: false,
      rules: {
        create: [
          {
            collection: 'The Dreams & Nightmares Collection',
            rarity: 'INDUSTRIAL_GRADE',
            maxBuyPrice: 0.50,
          },
        ],
      },
    },
  });

  // -----------------------------------------------------------------------
  // Candidates — mix of statuses
  // -----------------------------------------------------------------------
  const candidates = await Promise.all([
    prisma.candidateListing.create({
      data: {
        marketHashName: 'AK-47 | Slate (Field-Tested)',
        weaponName: 'AK-47',
        skinName: 'Slate',
        collection: 'The Snakebite Collection',
        rarity: 'MIL_SPEC',
        exterior: 'FIELD_TESTED',
        floatValue: 0.1812,
        listPrice: 1.87,
        source: 'EXTENSION',
        status: 'GOOD_BUY',
        qualityScore: 0.85,
        expectedProfit: 1.23,
        expectedProfitPct: 18.5,
        maxBuyPrice: 2.10,
        matchedPlanId: plan1.id,
        timesSeen: 3,
        lastSeenAt: new Date('2026-04-19T14:30:00Z'),
      },
    }),
    prisma.candidateListing.create({
      data: {
        marketHashName: 'XM1014 | XOXO (Field-Tested)',
        weaponName: 'XM1014',
        skinName: 'XOXO',
        collection: 'The Snakebite Collection',
        rarity: 'MIL_SPEC',
        exterior: 'FIELD_TESTED',
        floatValue: 0.2234,
        listPrice: 1.45,
        source: 'EXTENSION',
        status: 'BOUGHT',
        qualityScore: 0.72,
        expectedProfit: 0.88,
        expectedProfitPct: 14.2,
        maxBuyPrice: 2.00,
        matchedPlanId: plan1.id,
      },
    }),
    prisma.candidateListing.create({
      data: {
        marketHashName: 'MP7 | Guerrilla (Field-Tested)',
        weaponName: 'MP7',
        skinName: 'Guerrilla',
        collection: 'The Snakebite Collection',
        rarity: 'MIL_SPEC',
        exterior: 'FIELD_TESTED',
        floatValue: 0.2501,
        listPrice: 1.62,
        source: 'MANUAL',
        status: 'WATCHING',
        qualityScore: 0.68,
        matchedPlanId: plan1.id,
      },
    }),
    prisma.candidateListing.create({
      data: {
        marketHashName: 'MAC-10 | Button Masher (Minimal Wear)',
        weaponName: 'MAC-10',
        skinName: 'Button Masher',
        collection: 'The Snakebite Collection',
        rarity: 'MIL_SPEC',
        exterior: 'MINIMAL_WEAR',
        floatValue: 0.0912,
        listPrice: 3.10,
        source: 'EXTENSION',
        status: 'PASSED',
        notes: 'Price too high for the plan threshold',
      },
    }),
    prisma.candidateListing.create({
      data: {
        marketHashName: 'Galil AR | Connexion (Field-Tested)',
        weaponName: 'Galil AR',
        skinName: 'Connexion',
        collection: 'The Fracture Collection',
        rarity: 'RESTRICTED',
        exterior: 'FIELD_TESTED',
        floatValue: 0.1834,
        listPrice: 5.20,
        source: 'EXTENSION',
        status: 'WATCHING',
        qualityScore: 0.71,
        matchedPlanId: plan2.id,
      },
    }),
    prisma.candidateListing.create({
      data: {
        marketHashName: 'AK-47 | Slate (Field-Tested)',
        weaponName: 'AK-47',
        skinName: 'Slate',
        collection: 'The Snakebite Collection',
        rarity: 'MIL_SPEC',
        exterior: 'FIELD_TESTED',
        floatValue: 0.1815,
        listPrice: 1.87,
        source: 'EXTENSION',
        status: 'DUPLICATE',
        timesSeen: 1,
        notes: 'Duplicate of first candidate — same listing seen again',
      },
    }),
    prisma.candidateListing.create({
      data: {
        marketHashName: 'Negev | Ultralight (Battle-Scarred)',
        weaponName: 'Negev',
        skinName: 'Ultralight',
        collection: 'The Snakebite Collection',
        rarity: 'MIL_SPEC',
        exterior: 'BATTLE_SCARRED',
        floatValue: 0.7823,
        listPrice: 0.45,
        source: 'EXTENSION',
        status: 'INVALID',
        notes: 'Float too high for any active plan rule',
      },
    }),
    prisma.candidateListing.create({
      data: {
        marketHashName: 'MAC-10 | Allure (Field-Tested)',
        weaponName: 'MAC-10',
        skinName: 'Allure',
        collection: 'The Fracture Collection',
        rarity: 'RESTRICTED',
        exterior: 'FIELD_TESTED',
        floatValue: 0.2012,
        listPrice: 4.80,
        source: 'MANUAL',
        status: 'BOUGHT',
        qualityScore: 0.76,
        matchedPlanId: plan2.id,
      },
    }),
  ]);

  // -----------------------------------------------------------------------
  // Inventory — bought items, some reserved, some used
  // -----------------------------------------------------------------------
  const inventoryItems = await Promise.all([
    // Items for plan 1 basket (7 items — basket is BUILDING at 7/10)
    ...[
      { name: 'AK-47 | Slate (FT)', weapon: 'AK-47', skin: 'Slate', float: 0.2105, price: 1.75, candidateIdx: 0 },
      { name: 'XM1014 | XOXO (FT)', weapon: 'XM1014', skin: 'XOXO', float: 0.2234, price: 1.45, candidateIdx: 1 },
      { name: 'MP7 | Guerrilla (FT)', weapon: 'MP7', skin: 'Guerrilla', float: 0.1987, price: 1.55 },
      { name: 'Negev | Lionfish (FT)', weapon: 'Negev', skin: 'Lionfish', float: 0.2301, price: 1.30 },
      { name: 'R8 Revolver | Nitro (FT)', weapon: 'R8 Revolver', skin: 'Nitro', float: 0.1756, price: 1.68 },
      { name: 'Sawed-Off | Kiss♥Love (FT)', weapon: 'Sawed-Off', skin: 'Kiss♥Love', float: 0.2412, price: 1.22 },
      { name: 'PP-Bizon | Lumen (FT)', weapon: 'PP-Bizon', skin: 'Lumen', float: 0.1623, price: 1.90 },
    ].map((item, i) =>
      prisma.inventoryItem.create({
        data: {
          marketHashName: `${item.weapon} | ${item.skin} (Field-Tested)`,
          weaponName: item.weapon,
          skinName: item.skin,
          collection: 'The Snakebite Collection',
          rarity: 'MIL_SPEC',
          exterior: 'FIELD_TESTED',
          floatValue: item.float,
          purchasePrice: item.price,
          status: 'RESERVED_FOR_BASKET',
          candidateId: item.candidateIdx != null ? candidates[item.candidateIdx].id : undefined,
        },
      }),
    ),
    // 3 held items not yet in a basket
    prisma.inventoryItem.create({
      data: {
        marketHashName: 'P250 | Cyber Shell (Field-Tested)',
        weaponName: 'P250',
        skinName: 'Cyber Shell',
        collection: 'The Snakebite Collection',
        rarity: 'MIL_SPEC',
        exterior: 'FIELD_TESTED',
        floatValue: 0.1934,
        purchasePrice: 2.10,
        status: 'HELD',
      },
    }),
    prisma.inventoryItem.create({
      data: {
        marketHashName: 'Galil AR | Connexion (Field-Tested)',
        weaponName: 'Galil AR',
        skinName: 'Connexion',
        collection: 'The Fracture Collection',
        rarity: 'RESTRICTED',
        exterior: 'FIELD_TESTED',
        floatValue: 0.1834,
        purchasePrice: 5.20,
        status: 'HELD',
        candidateId: candidates[4].id,
      },
    }),
    prisma.inventoryItem.create({
      data: {
        marketHashName: 'MAC-10 | Allure (Field-Tested)',
        weaponName: 'MAC-10',
        skinName: 'Allure',
        collection: 'The Fracture Collection',
        rarity: 'RESTRICTED',
        exterior: 'FIELD_TESTED',
        floatValue: 0.2012,
        purchasePrice: 4.80,
        status: 'HELD',
        candidateId: candidates[7].id,
      },
    }),
  ]);

  // -----------------------------------------------------------------------
  // Basket 1: BUILDING — 7/10 items (plan 1)
  // -----------------------------------------------------------------------
  const basket1 = await prisma.tradeupBasket.create({
    data: {
      planId: plan1.id,
      name: 'Snakebite Batch #1',
      status: 'BUILDING',
      totalCost: 10.85,
      averageFloat: 0.2060,
      items: {
        create: inventoryItems.slice(0, 7).map((item, i) => ({
          inventoryItemId: item.id,
          slotIndex: i,
        })),
      },
    },
  });

  // -----------------------------------------------------------------------
  // Basket 2 + Execution: a completed trade-up with sale data
  // Create 10 "used" inventory items for the executed basket
  // -----------------------------------------------------------------------
  const usedItems = await Promise.all(
    Array.from({ length: 10 }, (_, i) =>
      prisma.inventoryItem.create({
        data: {
          marketHashName: `Filler Skin #${i + 1} (Field-Tested)`,
          weaponName: 'Nova',
          skinName: `Filler #${i + 1}`,
          collection: 'The Snakebite Collection',
          rarity: 'MIL_SPEC',
          exterior: 'FIELD_TESTED',
          floatValue: 0.18 + i * 0.01,
          purchasePrice: 1.50 + i * 0.1,
          status: 'USED_IN_CONTRACT',
        },
      }),
    ),
  );

  const basket2 = await prisma.tradeupBasket.create({
    data: {
      planId: plan1.id,
      name: 'Snakebite Batch #0 (completed)',
      status: 'EXECUTED',
      totalCost: 19.50,
      expectedEV: 6.35,
      expectedProfit: -13.15,
      expectedProfitPct: -67.44,
      averageFloat: 0.2250,
      items: {
        create: usedItems.map((item, i) => ({
          inventoryItemId: item.id,
          slotIndex: i,
        })),
      },
    },
  });

  await prisma.tradeupExecution.create({
    data: {
      basketId: basket2.id,
      planId: plan1.id,
      executedAt: new Date('2026-04-15T10:00:00Z'),
      inputCost: 19.50,
      expectedEV: 6.35,
      resultMarketHashName: 'USP-S | The Traitor (Field-Tested)',
      resultWeaponName: 'USP-S',
      resultSkinName: 'The Traitor',
      resultCollection: 'The Snakebite Collection',
      resultExterior: 'FIELD_TESTED',
      resultFloatValue: 0.2134,
      estimatedResultValue: 8.50,
      salePrice: 7.95,
      saleFees: 1.19,
      saleDate: new Date('2026-04-17T16:00:00Z'),
      realizedProfit: -12.74,
      realizedProfitPct: -65.3,
      notes: 'Got the good outcome but net loss after input cost. Need cheaper inputs.',
    },
  });

  console.log('Seed complete.');
  console.log(`  Plans: 3 (2 active, 1 inactive)`);
  console.log(`  Candidates: ${candidates.length}`);
  console.log(`  Inventory items: ${inventoryItems.length + usedItems.length}`);
  console.log(`  Baskets: 2 (1 building, 1 executed)`);
  console.log(`  Executions: 1 (with sale data)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
