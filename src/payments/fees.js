/**
 * PAYMENT & PERFORMANCE FEE LOGIC
 * Temporary in-memory logic (can be replaced with DB later)
 */

const paidUsers = new Set();

/**
 * Mark user as having paid the one-time access fee
 */
export function markAsPaid(userId) {
  paidUsers.add(userId);
}

/**
 * Check if user has paid access fee
 */
export function hasPaid(user) {
  return paidUsers.has(user.userId);
}

/**
 * Check if performance fee is required
 * 5% of profit over $100
 */
export function performanceFeeDue(user) {
  const profit = user.currentBalance - user.startBalance;

  if (profit <= 100) return false;

  const fee = profit * 0.05;
  return {
    due: true,
    amount: Number(fee.toFixed(2))
  };
}
