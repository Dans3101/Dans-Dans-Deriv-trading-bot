export const DERIV_WS = (appId) =>
  `wss://ws.derivws.com/websockets/v3?app_id=${appId}`;

export const SETTINGS = {
  MAX_TRADES_PER_DAY: 10,
  RISK_PERCENT: 0.03,
  STOP_PROFIT_MULTIPLIER: 2.0,
  STOP_LOSS_PERCENT: 0.30,
};
