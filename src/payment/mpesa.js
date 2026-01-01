import axios from 'axios';
import moment from 'moment';
import base64 from 'base-64';

async function getAccessToken() {
  const auth = base64.encode(
    `${process.env.MPESA_CONSUMER_KEY}:${process.env.MPESA_CONSUMER_SECRET}`
  );

  const res = await axios.get(
    'https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials',
    { headers: { Authorization: `Basic ${auth}` } }
  );

  return res.data.access_token;
}

export async function stkPush({ phone, amount, accountRef }) {
  const token = await getAccessToken();
  const timestamp = moment().format('YYYYMMDDHHmmss');

  const password = base64.encode(
    `${process.env.MPESA_SHORTCODE}${process.env.MPESA_PASSKEY}${timestamp}`
  );

  return axios.post(
    'https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest',
    {
      BusinessShortCode: process.env.MPESA_SHORTCODE,
      Password: password,
      Timestamp: timestamp,
      TransactionType: 'CustomerPayBillOnline',
      Amount: amount,
      PartyA: phone,
      PartyB: process.env.MPESA_SHORTCODE,
      PhoneNumber: phone,
      CallBackURL: process.env.MPESA_CALLBACK_URL,
      AccountReference: accountRef,
      TransactionDesc: 'Deriv Bot Activation'
    },
    {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  );
}