// src/bot/strategy.js

/**
 * Simple candle-based strategy helper.
 *
 * Exports:
 *  - decideTradeDirection(candles): returns 'CALL' | 'PUT' | null
 *
 * This implementation is intentionally simple for diagnostics:
 * - If there are fewer than 3 candles -> null
 * - Uses last two close prices:
 *     lastClose > prevClose => 'CALL'
 *     lastClose < prevClose => 'PUT'
 * - Logs debug info for visibility
 */

export function decideTradeDirection(candles = []) {
  try {
    const len = (candles || []).length;
    if (len < 2) {
      console.log('[CANDLE DEBUG] not enough candles', { len });
      return null;
    }

    const last = candles[len - 1];
    const prev = candles[len - 2];

    const lastClose = Number(last.close);
    const prevClose = Number(prev.close);

    if (Number.isNaN(lastClose) || Number.isNaN(prevClose)) {
      console.log('[CANDLE DEBUG] invalid close values', { lastClose, prevClose });
      return null;
    }

    let direction = null;
    if (lastClose > prevClose) direction = 'CALL';
    else if (lastClose < prevClose) direction = 'PUT';

    // Debug: include last N candles length and closes
    console.log('[CANDLE DEBUG]', {
      direction,
      candles_len: len,
      prevClose,
      lastClose,
      lastEpoch: last.epoch
    });

    return direction;
  } catch (e) {
    console.error('[CANDLE DEBUG] error in decideTradeDirection', e?.message || e);
    return null;
  }
}