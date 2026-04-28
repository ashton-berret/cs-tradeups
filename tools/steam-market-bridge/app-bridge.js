(function () {
  const REQUEST_TYPE = 'cs-tradeups:extension-request';
  const RESPONSE_TYPE = 'cs-tradeups:extension-response';

  window.addEventListener('message', (event) => {
    if (event.source !== window) return;

    const data = event.data;
    if (!data || data.type !== REQUEST_TYPE || !data.requestId) return;

    chrome.runtime.sendMessage(data.message, (response) => {
      window.postMessage(
        {
          type: RESPONSE_TYPE,
          requestId: data.requestId,
          response: chrome.runtime.lastError
            ? {
                ok: false,
                message: chrome.runtime.lastError.message,
              }
            : response,
        },
        window.location.origin,
      );
    });
  });
})();
