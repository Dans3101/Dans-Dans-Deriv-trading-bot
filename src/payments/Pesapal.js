export async function initiatePesapalPayment({ amount, email }) {
  return {
    success: true,
    paymentUrl: 'https://pesapal.com/pay/...'
  };
}
