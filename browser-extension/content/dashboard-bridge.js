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

function isContextInvalidated(error) {
  return error?.message?.includes('Extension context invalidated') ||
    error?.message?.includes('context invalidated');
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
    if (isContextInvalidated(error)) {
      // Extension was reloaded or updated — this content script is stale.
      // Stop responding to further commands; user must refresh the page.
      dispatchResponse({
        requestId,
        ok: false,
        error: 'Extension was reloaded. Please refresh this page to reconnect.',
      });
      return;
    }
    dispatchResponse({
      requestId,
      ok: false,
      error: error?.message || 'Unable to reach extension background worker',
    });
  }
});

window.addEventListener(PING_EVENT, () => {
  try {
    // Guard against pinging after context is invalidated
    if (!chrome.runtime?.id) return;
    dispatchReady();
  } catch (_) {
    // Context already gone — silently stop responding to pings
  }
});

try {
  dispatchReady();
} catch (_) {
  // Ignore if context is already invalid on initial inject
}
