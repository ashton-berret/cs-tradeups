import { roundMoney } from '$lib/server/utils/money';

export type MarketPriceBasis =
  | 'STEAM_NET'
  | 'STEAM_GROSS'
  | 'MANUAL_ESTIMATE'
  | 'THIRD_PARTY_REFERENCE';

export interface SteamMarketFeeConfig {
  /**
   * Steam's market UI represents CS2 fees as a percentage of the seller's
   * received amount. For normal-price CS2 items, buyer pays is roughly
   * seller receives + 15%.
   */
  feeRateOnSellerProceeds: number;
  minimumTotalFee: number;
}

export const DEFAULT_STEAM_MARKET_FEE_CONFIG: SteamMarketFeeConfig = {
  feeRateOnSellerProceeds: 0.15,
  minimumTotalFee: 0.02,
};

export function isSteamMarketSource(source: string | null | undefined): boolean {
  return (source ?? '').trim().toUpperCase().startsWith('STEAM_');
}

export function marketPriceBasisForSource(source: string | null | undefined): MarketPriceBasis {
  if (isSteamMarketSource(source)) return 'STEAM_NET';
  if ((source ?? '').trim().toUpperCase().includes('SKINPORT')) return 'THIRD_PARTY_REFERENCE';
  return 'MANUAL_ESTIMATE';
}

export function steamGrossToNetSaleValue(
  buyerPays: number,
  config: SteamMarketFeeConfig = DEFAULT_STEAM_MARKET_FEE_CONFIG,
): number {
  if (!Number.isFinite(buyerPays) || buyerPays <= 0) {
    return 0;
  }

  const netBeforeMinimum = buyerPays / (1 + config.feeRateOnSellerProceeds);
  const minimumFeeNet = buyerPays - config.minimumTotalFee;
  const net = Math.min(netBeforeMinimum, minimumFeeNet);

  return roundMoney(Math.max(0, net));
}

export function netSaleValueForObservedPrice(args: {
  marketValue: number;
  source: string | null | undefined;
}): { value: number; basis: MarketPriceBasis } {
  if (isSteamMarketSource(args.source)) {
    return {
      value: steamGrossToNetSaleValue(args.marketValue),
      basis: 'STEAM_NET',
    };
  }

  return {
    value: args.marketValue,
    basis: marketPriceBasisForSource(args.source),
  };
}
