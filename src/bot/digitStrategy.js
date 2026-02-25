// src/bot/digitStrategy.js

let consecutiveLosses = 0;
let pauseUntil = 0;
const digits = [];

export function createDigitMonitor({ windowSize = 50 } = {}) {
  return {
    add: (quote) => {
      const strQuote = quote.toString().replace('.', '');
      const digit = parseInt(strQuote.charAt(strQuote.length - 1));
      
      if (!isNaN(digit)) {
        digits.push(digit);
        if (digits.length > windowSize) digits.shift();
      }
      return digit;
    },
    onResult: (result) => {
      if (result === 'win') {
        consecutiveLosses = 0;
      } else {
        consecutiveLosses++;
        // If we hit 2 losses, the Martingale is getting high. 
        // We pause 30s to let the market "cool down" as per your original file.
        if (consecutiveLosses >= 2) {
          console.log("⚠️ Strategy: 2 losses. Martingale active. Pausing 30s for recovery.");
          pauseUntil = Date.now() + 30000;
          consecutiveLosses = 0;
        }
      }
    }
  };
}

export function decideFromMonitor(monitor) {
  // Guard: Don't trade if paused or not enough data
  if (Date.now() < pauseUntil || digits.length < 15) return null;

  // Analysis: Focus on the last 5 ticks
  const lastFive = digits.slice(-5);
  
  // LOGIC: Count how many digits are 5 or BELOW.
  // In Digit Over 5, these are the "Danger Digits" that would cause a loss.
  const smallDigits = lastFive.filter(d => d <= 5).length;

  /**
   * TRIGGER: If 4 out of the last 5 digits were 0, 1, 2, 3, 4, or 5,
   * it indicates a "Low Trend." Statistical probability suggests a 
   * "High Digit" (6-9) is coming soon.
   */
  if (smallDigits >= 4) {
    console.log(`[STRATEGY] Low Digit Cluster Found (${smallDigits}/5). Prediction: OVER 5`);
    // Return "5" as the barrier for DIGITOVER
    return "5"; 
  }

  return null;
}
/**
 * digitStrategy.js
 * * This strategy implements the exact logic from the provided XML.
 * Logic:
 * 1. Uses a specific list of predictions: [0, 4, 5, 6, 7, 8].
 * 2. Increments the prediction index sequentially for every trade.
 * 3. Resets the prediction index to 0 only upon a Win.
 * 4. No loss multiplier (Martingale) is included as per the source XML.
 */

export const digitStrategy = {
    name: "AI BOT XML Strategy",

    // Exact list of predictions from the XML initialization block
    predictionList: [0, 4, 5, 6, 7, 8],

    /**
     * Determines the parameters for the next trade.
     * Compatible with the DerivBot purchase cycle.
     */
    getNextTrade: (user) => {
        // Initialize the tracking index if it's the first run
        if (user.predictionIndex === undefined) {
            user.predictionIndex = 0;
        }

        // Get the current prediction from the list
        const currentPrediction = digitStrategy.predictionList[user.predictionIndex];

        return {
            symbol: '1HZ100V',           // Volatility 100 (1s) Index
            duration: 1,                 // 1 Tick
            duration_unit: 't',
            basis: 'stake',
            amount: Number(user.currentStake) || 4, // Default stake is 4
            prediction: currentPrediction,
            contract_type: 'DIGITOVER'    // Based on purchase list in XML
        };
    },

    /**
     * Processes the result of the last contract to update the user session.
     * Compatible with the after_purchase logic in the XML.
     */
    processResult: (user, lastContract) => {
        const isWin = lastContract.status === 'won';

        if (isWin) {
            // Reset to the start of the prediction list on a win
            user.predictionIndex = 0;
            // Ensure stake returns to base (no multiplier in XML, so it stays constant)
            user.currentStake = user.baseStake || 4;
        } else {
            // Move to the next prediction in the list upon a loss
            user.predictionIndex++;

            // If we reach the end of the list, loop back to the first prediction (index 0)
            if (user.predictionIndex >= digitStrategy.predictionList.length) {
                user.predictionIndex = 0;
            }
            
            // Note: No Martingale multiplier is applied here as it was not in the XML.
        }
    }
};
