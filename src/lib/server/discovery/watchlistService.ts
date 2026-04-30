import { getCatalogSnapshot } from '$lib/server/catalog/catalogService';
import { db } from '$lib/server/db/client';
import { toNumber } from '$lib/server/utils/decimal';
import type { ItemExterior, ItemRarity } from '$lib/types/enums';
import type { DiscoveryTarget, DiscoveryTargetsResult } from '$lib/types/services';

const STEAM_APP_ID = 730;

type ActivePlanRow = Awaited<ReturnType<typeof loadActivePlans>>[number];
type ActiveRuleRow = ActivePlanRow['rules'][number];

export async function buildDiscoveryTargets(): Promise<DiscoveryTargetsResult> {
  const [plans, openBasketSlotsByPlan, snapshot] = await Promise.all([
    loadActivePlans(),
    loadOpenBasketSlotsByPlan(),
    getCatalogSnapshot(),
  ]);

  const targetsByMarketHashName = new Map<string, DiscoveryTarget>();
  let activeRules = 0;
  let matchedSkins = 0;

  for (const plan of plans) {
    const planOpenSlots = openBasketSlotsByPlan.get(plan.id) ?? 0;
    const planDemand = planOpenSlots;
    const marketHashPrefix = marketHashQualityPrefixForPlan(plan);

    for (const rule of plan.rules) {
      activeRules += 1;
      const ruleRarity = (rule.rarity ?? plan.inputRarity) as ItemRarity;
      const matchedRuleSkins = snapshot.skins.filter((skin) => skinMatchesRule(skin, rule, ruleRarity));
      matchedSkins += matchedRuleSkins.length;

      for (const skin of matchedRuleSkins) {
        for (const marketHash of skin.marketHashNames) {
          if (!exteriorMatchesRule(marketHash.exterior, rule)) continue;
          if (!floatRangesOverlap(skin.minFloat, skin.maxFloat, rule.minFloat, rule.maxFloat)) continue;
          const targetMarketHashName = applyMarketHashPrefix(marketHash.marketHashName, marketHashPrefix);

          const target = getOrCreateTarget(targetsByMarketHashName, {
            marketHashName: targetMarketHashName,
            exterior: marketHash.exterior,
            catalogSkinId: skin.id,
            catalogCollectionId: skin.collectionId,
            catalogWeaponDefIndex: skin.defIndex,
            catalogPaintIndex: skin.paintIndex,
            weaponName: skin.weaponName,
            skinName: skin.skinName,
            collection: skin.collectionName,
            rarity: skin.rarity as ItemRarity,
            minFloat: skin.minFloat,
            maxFloat: skin.maxFloat,
          });

          const priority = rulePriority(rule, planDemand);
          target.constraints.push({
            planId: plan.id,
            planName: plan.name,
            ruleId: rule.id,
            collection: rule.collection,
            catalogCollectionId: rule.catalogCollectionId,
            rarity: ruleRarity,
            exterior: (rule.exterior as ItemExterior | null) ?? null,
            minFloat: rule.minFloat,
            maxFloat: rule.maxFloat,
            maxBuyPrice: toNumber(rule.maxBuyPrice),
            priority,
            reason: constraintReason(plan.name, rule, planOpenSlots),
          });
          target.priority = Math.max(target.priority, priority);
          target.demand.openBasketSlots = Math.max(target.demand.openBasketSlots, planOpenSlots);
        }
      }
    }
  }

  const targets = [...targetsByMarketHashName.values()]
    .map((target) => ({
      ...target,
      constraints: target.constraints.sort((a, b) => {
        if (b.priority !== a.priority) return b.priority - a.priority;
        return a.planName.localeCompare(b.planName);
      }),
    }))
    .sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority;
      return a.marketHashName.localeCompare(b.marketHashName);
    });

  return {
    generatedAt: new Date(),
    targets,
    counts: {
      activePlans: plans.length,
      activeRules,
      matchedSkins,
      targets: targets.length,
    },
  };
}

async function loadActivePlans() {
  return db.tradeupPlan.findMany({
    where: { isActive: true },
    include: {
      rules: { orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }] },
      outcomeItems: true,
    },
    orderBy: { name: 'asc' },
  });
}

async function loadOpenBasketSlotsByPlan(): Promise<Map<string, number>> {
  const baskets = await db.tradeupBasket.findMany({
    where: { status: 'BUILDING' },
    select: { planId: true, items: { select: { id: true } } },
  });
  const slotsByPlan = new Map<string, number>();
  for (const basket of baskets) {
    const openSlots = Math.max(0, 10 - basket.items.length);
    slotsByPlan.set(basket.planId, (slotsByPlan.get(basket.planId) ?? 0) + openSlots);
  }
  return slotsByPlan;
}

function skinMatchesRule(
  skin: {
    collectionId: string;
    collectionName: string;
    rarity: ItemRarity | null;
  },
  rule: ActiveRuleRow,
  ruleRarity: ItemRarity,
): boolean {
  if (skin.rarity !== ruleRarity) return false;
  if (rule.catalogCollectionId && skin.collectionId !== rule.catalogCollectionId) return false;
  if (!rule.catalogCollectionId && rule.collection) {
    return normalize(rule.collection) === normalize(skin.collectionName);
  }
  return true;
}

function exteriorMatchesRule(exterior: ItemExterior, rule: ActiveRuleRow): boolean {
  return !rule.exterior || rule.exterior === exterior;
}

function floatRangesOverlap(
  skinMin: number,
  skinMax: number,
  ruleMin: number | null,
  ruleMax: number | null,
): boolean {
  const min = ruleMin ?? 0;
  const max = ruleMax ?? 1;
  return skinMax >= min && skinMin <= max;
}

function getOrCreateTarget(
  targetsByMarketHashName: Map<string, DiscoveryTarget>,
  input: Omit<DiscoveryTarget, 'id' | 'listingUrl' | 'constraints' | 'priority' | 'demand'>,
): DiscoveryTarget {
  const existing = targetsByMarketHashName.get(input.marketHashName);
  if (existing) return existing;

  const target: DiscoveryTarget = {
    id: `steam:${STEAM_APP_ID}:${input.marketHashName}`,
    listingUrl: steamListingUrl(input.marketHashName),
    constraints: [],
    priority: 0,
    demand: { openBasketSlots: 0 },
    ...input,
  };
  targetsByMarketHashName.set(input.marketHashName, target);
  return target;
}

function steamListingUrl(marketHashName: string): string {
  return `https://steamcommunity.com/market/listings/${STEAM_APP_ID}/${encodeURIComponent(marketHashName)}`;
}

function rulePriority(rule: ActiveRuleRow, planDemand: number): number {
  return planDemand * 100 + rule.priority * 10 + (rule.isPreferred ? 5 : 0);
}

function constraintReason(
  planName: string,
  rule: ActiveRuleRow,
  openBasketSlots: number,
): string {
  const demand =
    openBasketSlots > 0 ? `${openBasketSlots} open basket slot(s)` : 'active plan, no open baskets';
  const maxBuy = rule.maxBuyPrice != null ? `, max buy $${toNumber(rule.maxBuyPrice)?.toFixed(2)}` : '';
  const floatBand =
    rule.minFloat != null || rule.maxFloat != null
      ? `, float ${rule.minFloat ?? 0}-${rule.maxFloat ?? 1}`
      : '';
  return `${planName}: ${demand}${maxBuy}${floatBand}`;
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function marketHashQualityPrefixForPlan(plan: ActivePlanRow): 'StatTrak™ ' | '' {
  const values = [
    plan.name,
    plan.description,
    plan.notes,
    ...plan.outcomeItems.map((outcome) => outcome.marketHashName),
  ];

  return values.some((value) => typeof value === 'string' && /^StatTrak(?:™)?\b/i.test(value.trim()))
    ? 'StatTrak™ '
    : '';
}

function applyMarketHashPrefix(marketHashName: string, prefix: 'StatTrak™ ' | ''): string {
  if (!prefix || marketHashName.startsWith(prefix)) return marketHashName;
  return `${prefix}${marketHashName}`;
}
