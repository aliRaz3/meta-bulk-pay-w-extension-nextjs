// ── Meta Bulk Pay Now — Content Script ────────────────────────────────────────
// Injected into every business.facebook.com tab.
// Waits for the background SW to tell it to start, then runs the Pay Now flow.

(function () {
  'use strict';

  // Only act on billing hub pages
  if (!window.location.href.includes('billing_hub')) return;

  const SELECTORS = {
    // The Pay Now button on the billing hub page (before modal opens)
    pageBtn: '[data-surface="/bizweb:billing_hub/billing_hub/lib:billing_hub:page_header/billing_hub:payment_settings/lib:balance/lib:billing-hub-pay-now-button"]',

    // The modal container — we scope all modal searches inside this
    modalSurface: '[data-surface="/bizweb:billing_hub/wizard:pay_now_ep"]',

    // The confirm "Pay now" button inside the modal
    // Identified by: role=button inside the modal surface, containing span text "Pay now"
    // We use text matching because the classes are hashed and unstable
    modalConfirmText: 'Pay now',
  };

  const TIMEOUTS = {
    pageBtn: 20000,   // wait up to 20s for page Pay Now button
    modal: 10000,   // wait up to 10s for modal to appear
    modalBtn: 8000,    // wait up to 8s for confirm button inside modal
    postClick: 15000,   // wait up to 15s for success signal after confirm
  };

  // ── Utilities ──────────────────────────────────────────────────────────────

  function waitForElement(selector, timeout, root = document) {
    return new Promise((resolve, reject) => {
      const existing = root.querySelector(selector);
      if (existing) { resolve(existing); return; }

      const timer = setTimeout(() => {
        observer.disconnect();
        reject(new Error(`Timeout waiting for: ${selector}`));
      }, timeout);

      const observer = new MutationObserver(() => {
        const el = root.querySelector(selector);
        if (el) {
          clearTimeout(timer);
          observer.disconnect();
          resolve(el);
        }
      });
      observer.observe(root, { childList: true, subtree: true });
    });
  }

  function waitForTextButton(text, timeout, root = document) {
    return new Promise((resolve, reject) => {
      function find() {
        const buttons = root.querySelectorAll('[role="button"]');
        for (const btn of buttons) {
          if (btn.textContent.trim() === text) return btn;
        }
        return null;
      }

      const existing = find();
      if (existing) { resolve(existing); return; }

      const timer = setTimeout(() => {
        observer.disconnect();
        reject(new Error(`Timeout waiting for button: "${text}"`));
      }, timeout);

      const observer = new MutationObserver(() => {
        const el = find();
        if (el) {
          clearTimeout(timer);
          observer.disconnect();
          resolve(el);
        }
      });
      observer.observe(root, { childList: true, subtree: true });
    });
  }

  function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
  }

  // ── Success detection ──────────────────────────────────────────────────────
  // After clicking confirm, Meta either:
  // (a) closes the modal and shows a success toast/banner, OR
  // (b) the modal surface disappears
  // We watch for the modal to disappear as the primary success signal.

  function waitForSuccess(modalEl, timeout) {
    return new Promise((resolve) => {
      const checkDom = () => {
        if (!document.contains(modalEl)) return 'closed';

        // Check for "Done" button
        const buttons = modalEl.querySelectorAll('[role="button"]');
        for (const btn of buttons) {
          if (btn.textContent.trim() === 'Done') return 'done_btn';
        }

        // Check for success text or SVG title
        const text = modalEl.textContent?.toLowerCase() || '';
        if (text.includes('successfully charged') || text.includes('successfully paid')) return 'success_text';

        const titles = modalEl.querySelectorAll('title');
        for (const t of titles) {
          if (t.textContent.trim() === 'Success') return 'success_svg';
        }

        return null;
      };

      const initial = checkDom();
      if (initial) return resolve(initial);

      const timer = setTimeout(() => {
        observer.disconnect();
        resolve('timeout');
      }, timeout);

      const observer = new MutationObserver(() => {
        const res = checkDom();
        if (res) {
          clearTimeout(timer);
          observer.disconnect();
          resolve(res);
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
    });
  }

  // ── Main Pay Now flow ──────────────────────────────────────────────────────

  async function runPayNowFlow() {
    try {
      report('started');

      // Step 1: Wait for the page-level Pay Now button
      report('waiting_page_btn');
      const pageBtn = await waitForElement(SELECTORS.pageBtn, TIMEOUTS.pageBtn);
      await sleep(600); // slight delay to let React settle
      pageBtn.click();
      report('clicked_page_btn');

      // Step 2: Wait for modal surface to appear
      report('waiting_modal');
      const modal = await waitForElement(SELECTORS.modalSurface, TIMEOUTS.modal);
      report('modal_open');

      await sleep(500); // let modal fully render

      // Step 3: Find and click the "Pay now" confirm button inside the modal
      report('waiting_modal_btn');
      const payNowBtn = await waitForTextButton(SELECTORS.modalConfirmText, TIMEOUTS.modalBtn, modal);
      await sleep(300);
      payNowBtn.click();
      report('clicked_paynow_modal');

      // Step 4: Wait for the "Confirm" review button
      report('waiting_confirm_btn');
      try {
        const confirmBtn = await waitForTextButton('Confirm', 10000, document);
        await sleep(500);
        confirmBtn.click();
        report('clicked_confirm');
      } catch (e) {
        // Some flows might skip the confirm step
        console.log('No Confirm button found or timed out, proceeding...', e);
      }

      // Step 5: Wait for success signal (modal close, "Done" button, or Success text)
      report('waiting_result');
      const result = await waitForSuccess(modal, TIMEOUTS.postClick);

      if (result !== 'timeout') {
        report('success');
      } else {
        // Timed out — check if there's an error message visible
        const errorText = modal.textContent?.toLowerCase() || '';
        if (errorText.includes('error') || errorText.includes('failed') || errorText.includes('unable')) {
          report('payment_error', 'Payment failed — check account manually');
        } else {
          // Modal timed out but didn't show error — treat as likely success
          report('success_uncertain');
        }
      }

    } catch (err) {
      report('error', err.message);
    }
  }

  // ── Communicate with background SW ────────────────────────────────────────

  function report(status, detail = '') {
    try {
      if (!chrome.runtime?.id) return;
      chrome.runtime.sendMessage({
        type: 'TAB_STATUS',
        status,
        detail,
        url: window.location.href,
      }).catch(() => { });
    } catch (_) { }
  }

  // Listen for the "GO" signal from the background SW
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'START_PAYNOW') {
      runPayNowFlow();
      sendResponse({ ok: true });
    }
    return true;
  });

  // Auto-start: background SW may have already opened this tab with intent
  // Signal that we're ready so SW can send START_PAYNOW
  try {
    chrome.runtime.sendMessage({ type: 'CONTENT_READY', url: window.location.href }).catch(() => { });
  } catch (_) { }

})();
