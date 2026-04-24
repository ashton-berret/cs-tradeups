(function () {
  const REQUEST_TYPE = 'cs-tradeups:extract-listing';
  const RESPONSE_TYPE = 'cs-tradeups:extract-listing-result';
  const DEFAULT_CURRENCY = 'USD';
  const ZERO_DECIMAL_CURRENCIES = new Set(['JPY', 'KRW', 'VND', 'IDR']);
  const EXTERIOR_MAP = {
    'factory new': 'FACTORY_NEW',
    'minimal wear': 'MINIMAL_WEAR',
    'field-tested': 'FIELD_TESTED',
    'field tested': 'FIELD_TESTED',
    'well-worn': 'WELL_WORN',
    'well worn': 'WELL_WORN',
    'battle-scarred': 'BATTLE_SCARRED',
    'battle scarred': 'BATTLE_SCARRED',
  };
  const RARITY_MAP = {
    'consumer grade': 'CONSUMER_GRADE',
    'industrial grade': 'INDUSTRIAL_GRADE',
    'mil-spec': 'MIL_SPEC',
    'mil spec': 'MIL_SPEC',
    restricted: 'RESTRICTED',
    classified: 'CLASSIFIED',
    covert: 'COVERT',
  };

  if (window.__csTradeupsPageBridgeInstalled) {
    return;
  }

  window.__csTradeupsPageBridgeInstalled = true;
  window.addEventListener('message', handleRequest);

  function handleRequest(event) {
    if (event.source !== window) {
      return;
    }

    const data = event.data;
    if (!data || data.type !== REQUEST_TYPE || !data.requestId) {
      return;
    }

    try {
      const payload = extractCandidatePayload(String(data.listingId || ''));
      window.postMessage(
        {
          type: RESPONSE_TYPE,
          requestId: data.requestId,
          ok: true,
          payload,
        },
        window.location.origin,
      );
    } catch (err) {
      window.postMessage(
        {
          type: RESPONSE_TYPE,
          requestId: data.requestId,
          ok: false,
          message: err instanceof Error ? err.message : String(err),
        },
        window.location.origin,
      );
    }
  }

  function extractCandidatePayload(listingId) {
    if (!listingId) {
      throw new Error('Listing id is missing');
    }

    const listingInfo = window.g_rgListingInfo?.[listingId];
    if (!listingInfo) {
      throw new Error(`Steam listing data not found for ${listingId}`);
    }

    const asset = resolveAsset(listingInfo);
    const block = resolveListingBlock(listingId);
    const extensionData = extractExtensionData(block);
    const marketHashName =
      cleanText(asset?.market_hash_name) ||
      cleanText(block?.querySelector('.market_listing_item_name')?.textContent);

    if (!marketHashName) {
      throw new Error(`marketHashName not found for listing ${listingId}`);
    }

    const currencyId = listingInfo.converted_currencyid || listingInfo.currencyid;
    const currency = resolveCurrencyCode(currencyId);
    const totalMinor =
      typeof listingInfo.converted_price === 'number' || typeof listingInfo.converted_fee === 'number'
        ? toNumber(listingInfo.converted_price) + toNumber(listingInfo.converted_fee)
        : toNumber(listingInfo.price) + toNumber(listingInfo.fee);

    if (!Number.isFinite(totalMinor) || totalMinor <= 0) {
      throw new Error(`Steam price data not found for listing ${listingId}`);
    }

    const inspectLink = resolveInspectLink(asset, listingInfo, listingId, block);
    const collection = resolveCollection(asset);
    const rarity = resolveRarity(asset);
    const exterior = resolveExterior(marketHashName, asset);

    return compactPayload({
      marketHashName,
      listPrice: minorToMajor(totalMinor, currency),
      currency,
      floatValue: extensionData.floatValue,
      pattern: extensionData.paintSeed,
      inspectLink,
      listingUrl: window.location.href,
      listingId,
      collection,
      rarity,
      exterior,
      minFloat: extensionData.minFloat,
      maxFloat: extensionData.maxFloat,
      paintIndex: extensionData.paintIndex,
      extractor: 'steam-market-bridge',
      extractedAt: new Date().toISOString(),
      steamCurrencyId: currencyId,
      steamPrice: listingInfo.price ?? null,
      steamFee: listingInfo.fee ?? null,
      steamConvertedPrice: listingInfo.converted_price ?? null,
      steamConvertedFee: listingInfo.converted_fee ?? null,
    });
  }

  function resolveAsset(listingInfo) {
    const appId = String(listingInfo?.asset?.appid || '');
    const contextId = String(listingInfo?.asset?.contextid || '');
    const assetId = String(listingInfo?.asset?.id || '');

    if (!appId || !contextId || !assetId) {
      return null;
    }

    return window.g_rgAssets?.[appId]?.[contextId]?.[assetId] || listingInfo.asset || null;
  }

  function resolveListingBlock(listingId) {
    const nameNode = document.getElementById(`listing_${listingId}_name`);
    return nameNode?.closest('.market_listing_row') || nameNode?.closest('.market_listing_item_name_block') || null;
  }

  function extractExtensionData(block) {
    if (!block) {
      return {
        floatValue: null,
        minFloat: null,
        maxFloat: null,
        paintSeed: null,
        paintIndex: null,
      };
    }

    const rowWrapper = block.querySelector('csfloat-item-row-wrapper');
    const rowRoot = rowWrapper?.shadowRoot || null;
    const floatBar = rowRoot?.querySelector('csfloat-float-bar') || null;
    const combinedText = [
      rowRoot?.textContent,
      block.querySelector('.floatTechnical')?.textContent,
      block.textContent,
    ]
      .map(cleanText)
      .filter(Boolean)
      .join(' ');

    const floatValue =
      parseNumber(firstAttribute(floatBar, ['float', 'value', 'data-float'])) ??
      parseNumber(findWithRegex(combinedText, /Float(?: Value)?:\s*((?:0|1)?\.\d+)/i));
    const minFloat =
      parseNumber(firstAttribute(floatBar, ['minfloat', 'min-float', 'min', 'data-min-float'])) ??
      parseNumber(findWithRegex(combinedText, /(?:Min(?:imum)? Float|Float Min):\s*([0-9.]+)/i));
    const maxFloat =
      parseNumber(firstAttribute(floatBar, ['maxfloat', 'max-float', 'max', 'data-max-float'])) ??
      parseNumber(findWithRegex(combinedText, /(?:Max(?:imum)? Float|Float Max):\s*([0-9.]+)/i));
    const paintSeed = parseInteger(findWithRegex(combinedText, /(?:Paint Seed|Pattern):\s*(\d+)/i));
    const paintIndex = parseInteger(findWithRegex(combinedText, /(?:Paint Index|Paintindex):\s*(\d+)/i));

    return {
      floatValue,
      minFloat,
      maxFloat,
      paintSeed,
      paintIndex,
    };
  }

  function resolveInspectLink(asset, listingInfo, listingId, block) {
    const domLink = resolveDomInspectLink(block);
    if (domLink) {
      return domLink;
    }

    const template =
      asset?.market_actions?.find((entry) => /inspect/i.test(entry?.name || ''))?.link ||
      asset?.actions?.find((entry) => /inspect/i.test(entry?.name || ''))?.link ||
      listingInfo?.asset?.market_actions?.find((entry) => /inspect/i.test(entry?.name || ''))?.link ||
      null;

    if (!template) {
      return null;
    }

    const properties = Array.isArray(asset?.asset_properties) ? asset.asset_properties : [];
    const propertyMap = new Map(
      properties
        .filter((entry) => entry && entry.propertyid != null)
        .map((entry) => [String(entry.propertyid), entry.string_value ?? entry.int_value ?? entry.float_value]),
    );

    const replacements = {
      '%listingid%': String(listingInfo?.listingid || listingId || ''),
      '%assetid%': String(asset?.id || listingInfo?.asset?.id || ''),
      '%contextid%': String(asset?.contextid || listingInfo?.asset?.contextid || ''),
      '%appid%': String(asset?.appid || listingInfo?.asset?.appid || ''),
    };

    let resolved = template;
    for (const [key, value] of Object.entries(replacements)) {
      resolved = resolved.replaceAll(key, value);
    }

    resolved = resolved.replace(/%propid:(\d+)%/g, (_match, propertyId) => {
      return String(propertyMap.get(String(propertyId)) || '');
    });

    return resolved.includes('%') ? null : resolved;
  }

  function resolveDomInspectLink(block) {
    if (!block) {
      return null;
    }

    for (const link of block.querySelectorAll('a[href]')) {
      const href = link.getAttribute('href') || '';
      const text = cleanText(link.textContent) || '';
      if (/inspect/i.test(text) || /csgo_econ_action_preview|rungame\/730/i.test(href)) {
        return href;
      }
    }

    return null;
  }

  function resolveCollection(asset) {
    const descriptions = Array.isArray(asset?.descriptions) ? asset.descriptions : [];
    const direct = descriptions.find((entry) => entry?.name === 'itemset_name')?.value;
    if (cleanText(direct)) {
      return cleanText(direct);
    }

    for (const description of descriptions) {
      const text = cleanText(stripHtml(description?.value));
      if (text && /collection$/i.test(text)) {
        return text;
      }
    }

    return null;
  }

  function resolveRarity(asset) {
    const typeText = cleanText(asset?.type);
    if (!typeText) {
      return null;
    }

    const normalized = typeText.toLowerCase();
    for (const [needle, rarity] of Object.entries(RARITY_MAP)) {
      if (normalized.includes(needle)) {
        return rarity;
      }
    }

    return null;
  }

  function resolveExterior(marketHashName, asset) {
    const fromName = /\(([^)]+)\)\s*$/.exec(marketHashName)?.[1];
    const fromDescription = asset?.descriptions?.find((entry) => entry?.name === 'exterior_wear')?.value;
    const label = cleanText(stripHtml(fromName || fromDescription)?.replace(/^Exterior:\s*/i, ''));
    if (!label) {
      return null;
    }

    const normalized = label.toLowerCase().replace(/[_\s]+/g, ' ');
    return EXTERIOR_MAP[normalized] || null;
  }

  function resolveCurrencyCode(currencyId) {
    if (typeof window.GetCurrencyCode === 'function') {
      try {
        const result = window.GetCurrencyCode(currencyId);
        const normalized = normalizeCurrencyCode(result);
        if (normalized) {
          return normalized;
        }
      } catch (_err) {
        // fall through to default
      }
    }

    return DEFAULT_CURRENCY;
  }

  function minorToMajor(minorValue, currency) {
    const divisor = ZERO_DECIMAL_CURRENCIES.has(currency) ? 1 : 100;
    const precision = ZERO_DECIMAL_CURRENCIES.has(currency) ? 0 : 2;
    return Number((minorValue / divisor).toFixed(precision));
  }

  function stripHtml(value) {
    const text = cleanText(value);
    if (!text) {
      return null;
    }

    const container = document.createElement('div');
    container.innerHTML = text;
    return cleanText(container.textContent);
  }

  function cleanText(value) {
    const trimmed = String(value || '')
      .replace(/\s+/g, ' ')
      .trim();
    return trimmed || null;
  }

  function normalizeCurrencyCode(value) {
    const normalized = cleanText(value)?.toUpperCase();
    return normalized && /^[A-Z]{3}$/.test(normalized) ? normalized : null;
  }

  function findWithRegex(value, pattern) {
    const match = pattern.exec(value || '');
    return match?.[1] || null;
  }

  function firstAttribute(node, names) {
    if (!node) {
      return null;
    }

    for (const name of names) {
      const value = node.getAttribute(name);
      if (value != null && value !== '') {
        return value;
      }
    }

    return null;
  }

  function parseNumber(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function parseInteger(value) {
    const parsed = Number.parseInt(String(value || ''), 10);
    return Number.isInteger(parsed) ? parsed : null;
  }

  function toNumber(value) {
    const parsed = Number(value || 0);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function compactPayload(payload) {
    return Object.fromEntries(
      Object.entries(payload).filter(([, value]) => value !== null && value !== undefined),
    );
  }
})();
