(function () {
  const PAGE_REQUEST_TYPE = 'cs-tradeups:extract-listing';
  const PAGE_RESPONSE_TYPE = 'cs-tradeups:extract-listing-result';
  const CONTROL_ATTR = 'data-cs-tradeups-bridge';
  const STYLE_ID = 'cs-tradeups-bridge-style';
  const SCRIPT_ID = 'cs-tradeups-page-bridge';
  const pendingRequests = new Map();

  if (!location.pathname.startsWith('/market/listings/730/')) {
    return;
  }

  injectStyles();
  injectPageBridge();
  window.addEventListener('message', handlePageMessage);
  scanListingBlocks();

  const observer = new MutationObserver(() => {
    scanListingBlocks();
  });

  observer.observe(document.documentElement, { childList: true, subtree: true });

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) {
      return;
    }

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .cs-tradeups-bridge-controls {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-top: 6px;
        flex-wrap: wrap;
      }

      .cs-tradeups-bridge-button {
        border: 1px solid #6b7280;
        background: #111827;
        color: #f9fafb;
        border-radius: 4px;
        padding: 2px 8px;
        font-size: 11px;
        line-height: 16px;
        cursor: pointer;
      }

      .cs-tradeups-bridge-button:disabled {
        cursor: wait;
        opacity: 0.7;
      }

      .cs-tradeups-bridge-status {
        font-size: 11px;
        line-height: 16px;
      }

      .cs-tradeups-bridge-status[data-state="working"] {
        color: #cbd5e1;
      }

      .cs-tradeups-bridge-status[data-state="success"] {
        color: #86efac;
      }

      .cs-tradeups-bridge-status[data-state="error"] {
        color: #fca5a5;
      }

      .cs-tradeups-bridge-debug {
        flex-basis: 100%;
        font-size: 11px;
        line-height: 16px;
        color: #cbd5e1;
      }

      .cs-tradeups-bridge-debug summary {
        cursor: pointer;
        user-select: none;
      }

      .cs-tradeups-bridge-debug pre {
        margin: 6px 0 0;
        padding: 8px;
        border: 1px solid #334155;
        border-radius: 4px;
        background: rgba(2, 6, 23, 0.8);
        white-space: pre-wrap;
        word-break: break-word;
      }
    `;

    document.head.appendChild(style);
  }

  function injectPageBridge() {
    if (document.getElementById(SCRIPT_ID)) {
      return;
    }

    const script = document.createElement('script');
    script.id = SCRIPT_ID;
    script.src = chrome.runtime.getURL('page-bridge.js');
    script.async = false;
    (document.head || document.documentElement).appendChild(script);
  }

  function handlePageMessage(event) {
    if (event.source !== window) {
      return;
    }

    const data = event.data;
    if (!data || data.type !== PAGE_RESPONSE_TYPE || !data.requestId) {
      return;
    }

    const pending = pendingRequests.get(data.requestId);
    if (!pending) {
      return;
    }

    clearTimeout(pending.timeoutId);
    pendingRequests.delete(data.requestId);

    if (data.ok) {
      pending.resolve(data.payload);
      return;
    }

    pending.reject(new Error(data.message || 'Failed to extract listing data from the page'));
  }

  function scanListingBlocks() {
    const blocks = document.querySelectorAll(
      '.market_listing_row .market_listing_item_name_block, [data-floatbar-added="true"], .market_listing_item_name_block csfloat-item-row-wrapper',
    );

    for (const candidate of blocks) {
      const block =
        candidate.classList?.contains('market_listing_item_name_block')
          ? candidate
          : candidate.closest('.market_listing_item_name_block');

      if (!(block instanceof HTMLElement)) {
        continue;
      }

      if (block.getAttribute(CONTROL_ATTR) === 'ready') {
        continue;
      }

      const listingId = extractListingId(block);
      if (!listingId) {
        continue;
      }

      attachControls(block, listingId);
    }
  }

  function attachControls(block, listingId) {
    block.setAttribute(CONTROL_ATTR, 'ready');

    const controls = document.createElement('div');
    controls.className = 'cs-tradeups-bridge-controls';

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'cs-tradeups-bridge-button';
    button.textContent = 'Ingest';

    const status = document.createElement('span');
    status.className = 'cs-tradeups-bridge-status';
    status.dataset.state = 'working';
    status.textContent = 'Ready';

    const debug = document.createElement('details');
    debug.className = 'cs-tradeups-bridge-debug';

    const debugSummary = document.createElement('summary');
    debugSummary.textContent = 'Details';

    const debugBody = document.createElement('pre');
    debugBody.textContent = 'No attempts yet.';

    debug.append(debugSummary, debugBody);

    button.addEventListener('click', async () => {
      button.disabled = true;
      setStatus(status, 'Extracting...', 'working');

      try {
        const payload = await requestCandidatePayload(listingId);
        setStatus(status, 'Sending...', 'working');
        renderDebug(debug, debugBody, {
          phase: 'request',
          listingId,
          payload,
        });

        const response = await sendRuntimeMessage({
          type: 'bridge:ingest-candidate',
          payload,
        });

        if (!response?.ok) {
          setStatus(status, response?.message || 'Ingest failed', 'error');
          renderDebug(debug, debugBody, {
            phase: 'response',
            listingId,
            payload,
            response,
          });
          return;
        }

        const body = response.body || {};
        const savedStatus = body.candidate?.status ? ` (${body.candidate.status})` : '';
        const catalogStatus = body.candidate?.catalogSkinId ? ' · catalog linked' : ' · catalog unmatched';
        const warningStatus = Array.isArray(body.warnings) && body.warnings.length > 0
          ? ` · ${body.warnings.length} warning${body.warnings.length === 1 ? '' : 's'}`
          : '';
        setStatus(
          status,
          body.wasDuplicate
            ? `Duplicate merged${savedStatus}${catalogStatus}${warningStatus}`
            : `Saved${savedStatus}${catalogStatus}${warningStatus}`,
          'success',
        );
        renderDebug(debug, debugBody, {
          phase: 'response',
          listingId,
          payload,
          response,
        });
      } catch (err) {
        setStatus(
          status,
          err instanceof Error ? err.message : 'Failed to extract listing data',
          'error',
        );
        renderDebug(debug, debugBody, {
          phase: 'exception',
          listingId,
          error: err instanceof Error ? err.message : String(err),
        });
      } finally {
        button.disabled = false;
      }
    });

    controls.append(button, status, debug);
    block.appendChild(controls);
  }

  function extractListingId(block) {
    if (!(block instanceof Element)) {
      return null;
    }

    const idCandidates = [];
    if (block.id) {
      idCandidates.push(block.id);
    }

    const row = block.closest('.market_listing_row');
    if (row?.id) {
      idCandidates.push(row.id);
    }

    const namedNode = block.querySelector('[id^="listing_"]');
    if (namedNode?.id) {
      idCandidates.push(namedNode.id);
    }

    for (const node of block.querySelectorAll('[id]')) {
      idCandidates.push(node.id);
    }

    for (const id of idCandidates) {
      const match = /^listing_(\d+)(?:_|$)/.exec(id);
      if (match) {
        return match[1];
      }
    }

    return null;
  }

  function requestCandidatePayload(listingId) {
    return new Promise((resolve, reject) => {
      const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const timeoutId = window.setTimeout(() => {
        pendingRequests.delete(requestId);
        reject(new Error('Timed out waiting for the page bridge'));
      }, 5000);

      pendingRequests.set(requestId, { resolve, reject, timeoutId });
      window.postMessage({ type: PAGE_REQUEST_TYPE, requestId, listingId }, window.location.origin);
    });
  }

  function sendRuntimeMessage(message) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }

        resolve(response);
      });
    });
  }

  function setStatus(node, message, state) {
    node.textContent = message;
    node.dataset.state = state;
  }

  function renderDebug(container, node, details) {
    container.open = true;
    node.textContent = JSON.stringify(details, null, 2);

    if (details.phase === 'response' && details.response?.ok) {
      console.info('[cs-tradeups bridge] ingest success', details);
      return;
    }

    if (details.phase === 'response' || details.phase === 'exception') {
      console.warn('[cs-tradeups bridge] ingest issue', details);
    }
  }
})();
