// src/middleware/paymentGuard.js

/**
 * Simple payment/activation guard.
 *
 * Exports:
 *  - canTrade(user): returns boolean. Add debug logs for why trading might be blocked.
 *
 * This function should be expanded to check payment/subscription/whitelist/etc.
 * For now it checks:
 *  - user.active === true
 *  - user.isBlocked is not true (optional flag)
 *  - user.apiToken exists (sanity check)
 */

export function canTrade(user = {}) {
  try {
    if (!user) {
      console.log('[CANTRADE DEBUG] missing user object -> false');
      return false;
    }

    // Must be marked active
    if (!user.active) {
      console.log(`[CANTRADE DEBUG] user=${user.userId} active=false -> cannot trade`);
      return false;
    }

    // Optional block flag
    if (user.isBlocked) {
      console.log(`[CANTRADE DEBUG] user=${user.userId} isBlocked=true -> cannot trade`);
      return false;
    }

    // Minimal token presence
    if (!user.apiToken) {
      console.log(`[CANTRADE DEBUG] user=${user.userId} missing apiToken -> cannot trade`);
      return false;
    }

    console.log(`[CANTRADE DEBUG] user=${user.userId} canTrade=true`);
    return true;
  } catch (e) {
    console.error('[CANTRADE DEBUG] error', e?.message || e);
    return false;
  }
}