'use strict';

const COMMAND_EVENT = 'meta-paynow-extension-command';
const RESPONSE_EVENT = 'meta-paynow-extension-response';
const READY_EVENT = 'meta-paynow-extension-ready';
const PING_EVENT = 'meta-paynow-extension-ping';

function dispatchReady() {
  window.dispatchEvent(
    new CustomEvent(READY_EVENT, {
      detail: { source: 'meta_bulk_paynow_extension' },
    }),
  );
}

function dispatchResponse(detail) {
  window.dispatchEvent(new CustomEvent(RESPONSE_EVENT, { detail }));
}

window.addEventListener(COMMAND_EVENT, async (event) => {
  const detail = event?.detail || {};
  const requestId = detail.requestId;
  const type = detail.type;
  const payload = detail.payload || {};

  if (!requestId || !type) return;

  try {
    const response = await chrome.runtime.sendMessage({ type, ...payload });

    if (response?.ok === false) {
      dispatchResponse({
        requestId,
        ok: false,
        response,
        error: response.error || 'Extension command failed',
      });
      return;
    }

    dispatchResponse({ requestId, ok: true, response });
  } catch (error) {
    dispatchResponse({
      requestId,
      ok: false,
      error: error?.message || 'Unable to reach extension background worker',
    });
  }
});

window.addEventListener(PING_EVENT, () => {
  dispatchReady();
});

dispatchReady();
