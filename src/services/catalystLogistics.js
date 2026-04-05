import axios from 'axios';

function baseUrl() {
  const raw = (process.env.LOGISTICS_API_BASE_URL || '').trim();
  if (!raw) return '';
  return raw.replace(/\/+$/, '');
}

export function isLogisticsConfigured() {
  return Boolean(
    baseUrl() &&
      process.env.LOGISTICS_X_APP_KEY &&
      process.env.LOGISTICS_CUSTOMER_CODE &&
      process.env.LOGISTICS_PASSWORD &&
      process.env.LOGISTICS_AGENT_CODE
  );
}

function client() {
  const b = baseUrl();
  if (!b) throw new Error('LOGISTICS_API_BASE_URL is not set');
  return axios.create({
    baseURL: b,
    timeout: 60000,
    headers: {
      'Content-Type': 'application/json',
      'X-APPKEY': process.env.LOGISTICS_X_APP_KEY || '',
    },
    validateStatus: () => true,
  });
}

function isTestingBit() {
  return String(process.env.LOGISTICS_IS_TESTING || '1') === '1' ? 1 : 0;
}

export function buildBookingPayloadFromOrder(order) {
  const addr = order.shippingAddress || {};
  const items = order.items || [];
  const pcs = items.reduce((sum, it) => sum + Number(it.qty || 1), 0) || 1;
  const weight = Number(process.env.LOGISTICS_DEFAULT_WEIGHT_KG || 1) || 1;
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const yyyy = now.getFullYear();
  const HH = String(now.getHours()).padStart(2, '0');
  const Min = String(now.getMinutes()).padStart(2, '0');

  const consigneeParts = [addr.line1, addr.city, addr.state].filter(Boolean);
  const consigneeAddress = consigneeParts.join(', ').slice(0, 300);

  return {
    AgentCode: process.env.LOGISTICS_AGENT_CODE,
    CustomerCode: process.env.LOGISTICS_CUSTOMER_CODE,
    Password: process.env.LOGISTICS_PASSWORD,
    BookingDate: `${dd}/${mm}/${yyyy}`,
    BookingTime: `${HH}:${Min}`,
    Pcs: pcs,
    Weight: weight,
    CODAmount: 0,
    TopayAmount: 0,
    ModeName: process.env.LOGISTICS_DEFAULT_MODE_NAME || 'STANDARD',
    ProductName: process.env.LOGISTICS_DEFAULT_PRODUCT_NAME || 'PARCEL',
    BookType: 'P',
    ReferenceNo: String(order._id),
    ConsignorPincode: process.env.LOGISTICS_CONSIGNOR_PINCODE || '',
    ConsignorName: process.env.LOGISTICS_CONSIGNOR_NAME || 'Shipper',
    ConsignorAddress1: (process.env.LOGISTICS_CONSIGNOR_ADDRESS1 || '').slice(0, 100),
    ConsignorAddress2: (process.env.LOGISTICS_CONSIGNOR_ADDRESS2 || '').slice(0, 100),
    ConsigneeName: (addr.fullName || 'Customer').slice(0, 100),
    ConsigneeAddress: consigneeAddress || (addr.line1 || 'Address').slice(0, 300),
    ConsigneePincode: addr.postalCode || '',
    ConsigneePhone: addr.phone || '',
    Remarks: `Order ${order._id}`,
    DocketNumber: '',
    IsTesting: isTestingBit(),
  };
}

export async function postBooking(body) {
  const c = client();
  const res = await c.post('/PostBooking', body);
  return { status: res.status, data: res.data };
}

export async function trackConsignment(awb, statusChar = 'F') {
  const c = client();
  const res = await c.get('/TrackConsignment', {
    params: {
      CustomerCode: process.env.LOGISTICS_CUSTOMER_CODE,
      lstAWB: String(awb),
      Status: statusChar === 'L' ? 'L' : 'F',
    },
  });
  return { status: res.status, data: res.data };
}

export async function cancelOrder(awb, cancelReason) {
  const c = client();
  const res = await c.post('/CancelOrder', null, {
    params: {
      CustomerCode: process.env.LOGISTICS_CUSTOMER_CODE,
      Password: process.env.LOGISTICS_PASSWORD,
      AWBNo: String(awb),
      CancelReason: String(cancelReason || 'Cancelled by merchant').slice(0, 200),
    },
  });
  return { status: res.status, data: res.data };
}

export async function getPincodeTracking(pincode) {
  const c = client();
  const res = await c.post(
    '/GetPincodeTracking',
    {},
    {
      params: { Pincode: String(pincode) },
    }
  );
  return { status: res.status, data: res.data };
}

export async function getStickerSize(syncDateTime = '01/01/2000 00:01') {
  const c = client();
  const res = await c.post('/GetStickerSize', null, {
    params: {
      CustomerCode: process.env.LOGISTICS_CUSTOMER_CODE,
      SyncDateTime: syncDateTime,
    },
  });
  return { status: res.status, data: res.data };
}

export async function getStickerPrintBuffer(awb, stickerSizeName) {
  const c = client();
  const res = await c.post('/GetStickerPrint', null, {
    params: {
      CustomerCode: process.env.LOGISTICS_CUSTOMER_CODE,
      AWB: String(awb),
      StickerSizeName: String(stickerSizeName),
    },
    responseType: 'arraybuffer',
  });
  return { status: res.status, data: res.data, headers: res.headers };
}
