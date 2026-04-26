export type MarketPriceSourceType = 'MANUAL' | 'CSV_IMPORT' | 'JSON_IMPORT' | 'LOCAL_IMPORT' | 'ADAPTER' | 'UNKNOWN';

export interface MarketPriceSourceMetadata {
  sourceType: MarketPriceSourceType;
  sourceLabel: string;
}

export function describeMarketPriceSource(source: string): MarketPriceSourceMetadata {
  const normalized = source.trim().toUpperCase();

  if (normalized.includes('CSV')) {
    return { sourceType: 'CSV_IMPORT', sourceLabel: 'CSV import' };
  }

  if (normalized.includes('JSON')) {
    return { sourceType: 'JSON_IMPORT', sourceLabel: 'JSON import' };
  }

  if (normalized.includes('MANUAL')) {
    return { sourceType: 'MANUAL', sourceLabel: 'Manual' };
  }

  if (normalized.includes('ADAPTER')) {
    return { sourceType: 'ADAPTER', sourceLabel: 'Adapter' };
  }

  if (normalized.startsWith('LOCAL')) {
    return { sourceType: 'LOCAL_IMPORT', sourceLabel: 'Local import' };
  }

  return { sourceType: 'UNKNOWN', sourceLabel: 'Unclassified' };
}
