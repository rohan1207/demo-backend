import 'dotenv/config';

const base = (process.env.LOGISTICS_API_BASE_URL || '').trim().replace(/\/+$/, '');
const url = `${base}/PostBooking`;
const appKey = process.env.LOGISTICS_X_APP_KEY || '';

/** Same shaping as catalystLogistics buildBookingPayloadFromOrder (Catalyst Postman collection). */
const add2 = (process.env.LOGISTICS_CONSIGNOR_ADDRESS2 || '').slice(0, 100);
const body = {
  AgentCode: process.env.LOGISTICS_AGENT_CODE,
  CustomerCode: process.env.LOGISTICS_CUSTOMER_CODE,
  Password: process.env.LOGISTICS_PASSWORD,
  BookingDate: '30-04-2026',
  BookingTime: '12:00:00',
  Pcs: 1,
  Weight: Number(process.env.LOGISTICS_DEFAULT_WEIGHT_KG || 1) || 1,
  CODAmount: 0,
  TopayAmount: 0,
  ModeName: process.env.LOGISTICS_DEFAULT_MODE_NAME || 'STANDARD',
  ProductName: process.env.LOGISTICS_DEFAULT_PRODUCT_NAME || 'PARCEL',
  BookType: process.env.LOGISTICS_BOOK_TYPE || 'P',
  ReferenceNo: '69f375e1e43c927f1db4af3f',
  ConsignorPincode: process.env.LOGISTICS_CONSIGNOR_PINCODE || '',
  ConsignorName: process.env.LOGISTICS_CONSIGNOR_NAME || 'Shipper',
  ConsignorAddress1: (process.env.LOGISTICS_CONSIGNOR_ADDRESS1 || '').slice(0, 100),
  ConsignorAddress2: add2 || null,
  ConsigneeName: 'Rohan Rahul Ambhore',
  ConsigneeAddress: 'test, Pune, Maharashtra',
    ConsigneePincode: '411001',
  ConsigneePhone: '8855817434',
  Remarks: 'Order 69f375e1e43c927f1db4af3f',
  DocketNumber: '',
  lstVolumetric_Size: null,
    lstPickupItemList: null,
  IsTesting: String(process.env.LOGISTICS_IS_TESTING || '1') === '1' ? 1 : 0,
};

function bashSQ(s) {
  return `'${String(s).replace(/'/g, `'\\''`)}'`;
}

const payload = JSON.stringify(body);

console.log('--- JSON (--data-raw) ---');
console.log(JSON.stringify(body, null, 2));
console.log('\n--- bash curl (Git Bash / WSL / macOS/Linux) ---');
console.log(`curl -v -X POST ${bashSQ(url)} \\`);
console.log(`  -H ${bashSQ('Content-Type: application/json')} \\`);
console.log(`  -H ${bashSQ(`X-APPKEY: ${appKey}`)} \\`);
console.log(`  --data-raw ${bashSQ(payload)}`);
