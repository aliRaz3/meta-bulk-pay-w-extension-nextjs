'use strict';

(function initDashboardConfig(globalScope) {
  function getManifest() {
    try {
      return chrome.runtime.getManifest();
    } catch (_) {
      return null;
    }
  }

  function unique(values) {
    return Array.from(new Set((values || []).filter(Boolean)));
  }

  function getDashboardBridgeMatches() {
    const manifest = getManifest();
    const scripts = manifest?.content_scripts || [];
    const bridgeEntry = scripts.find((entry) => {
      return Array.isArray(entry.js) && entry.js.includes('content/dashboard-bridge.js');
    });
    return unique(bridgeEntry?.matches || []);
  }

  function getDashboardUrlPatterns() {
    const bridgeMatches = getDashboardBridgeMatches();
    if (bridgeMatches.length > 0) {
      return bridgeMatches;
    }

    const manifest = getManifest();
    const hostPermissions = manifest?.host_permissions || [];
    return unique(hostPermissions.filter((pattern) => !String(pattern).includes('business.facebook.com')));
  }

  function patternToBaseUrl(pattern) {
    if (typeof pattern !== 'string') return null;

    let normalized = pattern.trim();
    if (!normalized) return null;

    normalized = normalized.replace(/\/\*$/, '/');
    if (normalized.startsWith('*://')) {
      normalized = `https://${normalized.slice(4)}`;
    }

    if (normalized.includes('*')) return null;
    if (!normalized.endsWith('/')) normalized += '/';
    return normalized;
  }

  function getPreferredDashboardUrl() {
    const patterns = getDashboardUrlPatterns();

    const directHttps = patterns
      .filter((pattern) => String(pattern).startsWith('https://'))
      .map(patternToBaseUrl)
      .find(Boolean);
    if (directHttps) return directHttps;

    const directHttp = patterns
      .filter((pattern) => String(pattern).startsWith('http://'))
      .map(patternToBaseUrl)
      .find(Boolean);
    if (directHttp) return directHttp;

    return 'http://localhost/';
  }

  globalScope.DashboardConfig = Object.freeze({
    getDashboardBridgeMatches,
    getDashboardUrlPatterns,
    getPreferredDashboardUrl,
  });
})(globalThis);
