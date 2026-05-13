import axios from 'axios';

function logisticsDebugEnabled() {
  return String(process.env.LOGISTICS_DEBUG || '0') === '1';
}

function redactBookingPayload(payload) {
  if (!payload || typeof payload !== 'object') return payload;
  const out = { ...payload };
  if (Object.prototype.hasOwnProperty.call(out, 'Password')) {
    out.Password = '***';
  }
  return out;
}

/** Bash single-quoted string escaping: 'hello'it's' -> 'hello'\''it's' */
function bashSingleQuoted(data) {
  return `'${String(data).replace(/'/g, `'\\''`)}'`;
}

/**
 * Printable curl suitable for Catalyst support (same request as axios).
 * Log only when DEBUG is on — includes Password and X-APPKEY.
 */
export function buildPostBookingVendorCurl(body) {
  const url = `${baseUrl()}/PostBooking`;
  const appKey = process.env.LOGISTICS_X_APP_KEY || '';
  const payloadJson = JSON.stringify(body);
  return `curl -v -X POST ${bashSingleQuoted(url)} \\
  -H ${bashSingleQuoted('Content-Type: application/json')} \\
  -H ${bashSingleQuoted(`X-APPKEY: ${appKey}`)} \\
  --data-raw ${bashSingleQuoted(payloadJson)}`;
}

function summarizeCarrierResponse(data) {
  if (!data || typeof data !== 'object') return { rawType: typeof data };
  const d = data.Response ?? data.response ?? data;
  if (typeof d === 'string') {
    return {
      message: d.trim(),
      responseType: 'string',
    };
  }
  if (!d || typeof d !== 'object') {
    return {
      message: data.Message || data.message || '',
      responseType: typeof d,
    };
  }
  return {
    DocketNumber: d.DocketNumber ?? d.docketNumber ?? d.AWB ?? d.Awb ?? '',
    OrderNumber: d.OrderNumber ?? d.orderNumber ?? '',
    Message: d.Message ?? data.Message ?? data.message ?? '',
    ErrorCode: d.ErrorCode ?? data.ErrorCode ?? '',
  };
}

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

function logisticsTimeoutMs() {
  const n = Number(process.env.LOGISTICS_HTTP_TIMEOUT_MS);
  return Number.isFinite(n) && n > 0 ? n : 60000;
}

function client() {
  const b = baseUrl();
  if (!b) throw new Error('LOGISTICS_API_BASE_URL is not set');
  return axios.create({
    baseURL: b,
    timeout: logisticsTimeoutMs(),
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

async function postOrGetQuery(apiClient, path, params) {
  let res = await apiClient.post(path, null, { params });
  if (res.status === 405) {
    res = await apiClient.get(path, { params });
  }
  return { status: res.status, data: res.data };
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
  const Sec = String(now.getSeconds()).padStart(2, '0');

  const consigneeParts = [addr.line1, addr.city, addr.state].filter(Boolean);
  const consigneeAddress = consigneeParts.join(', ').slice(0, 300);

  const add2 = (process.env.LOGISTICS_CONSIGNOR_ADDRESS2 || '').slice(0, 100);
  // OBN Express / Click2Pick: dd-MM-yyyy date, 24h time with seconds; ConsigneePincode per Customer API PDF.
  return {
    AgentCode: process.env.LOGISTICS_AGENT_CODE,
    CustomerCode: process.env.LOGISTICS_CUSTOMER_CODE,
    Password: process.env.LOGISTICS_PASSWORD,
    BookingDate: `${dd}-${mm}-${yyyy}`,
    BookingTime: `${HH}:${Min}:${Sec}`,
    Pcs: pcs,
    Weight: weight,
    CODAmount: 0,
    TopayAmount: 0,
    ModeName: process.env.LOGISTICS_DEFAULT_MODE_NAME || 'STANDARD',
    ProductName: process.env.LOGISTICS_DEFAULT_PRODUCT_NAME || 'PARCEL',
    BookType: process.env.LOGISTICS_BOOK_TYPE || 'P',
    ReferenceNo: String(order._id),
    ConsignorPincode: process.env.LOGISTICS_CONSIGNOR_PINCODE || '',
    ConsignorName: process.env.LOGISTICS_CONSIGNOR_NAME || 'Shipper',
    ConsignorAddress1: (process.env.LOGISTICS_CONSIGNOR_ADDRESS1 || '').slice(0, 100),
    ConsignorAddress2: add2 || null,
    ConsigneeName: (addr.fullName || 'Customer').slice(0, 100),
    ConsigneeAddress: consigneeAddress || (addr.line1 || 'Address').slice(0, 300),
    ConsigneePincode: addr.postalCode || '',
    ConsigneePhone: addr.phone || '',
    Remarks: `Order ${order._id}`,
    DocketNumber: '',
    lstVolumetric_Size: null,
    lstPickupItemList: null,
    IsTesting: isTestingBit(),
  };
}

export async function postBooking(body) {
  const c = client();
  if (logisticsDebugEnabled()) {
    console.info('[LOGISTICS] PostBooking request', {
      url: `${baseUrl()}/PostBooking`,
      isTesting: isTestingBit(),
      body: redactBookingPayload(body),
    });
    console.info('[LOGISTICS] PostBooking JSON for Catalyst (keep private):\n%s', JSON.stringify(body, null, 2));
    console.info('[LOGISTICS] PostBooking CURL for Catalyst (bash; keep private):\n%s', buildPostBookingVendorCurl(body));
  }
  const res = await c.post('/PostBooking', body);
  if (logisticsDebugEnabled()) {
    console.info('[LOGISTICS] PostBooking response', {
      status: res.status,
      summary: summarizeCarrierResponse(res.data),
    });
  }
  return { status: res.status, data: res.data };
}

export async function trackConsignment(awb, statusChar = 'F') {
  const c = client();
  const cc = process.env.LOGISTICS_CUSTOMER_CODE;
  const res = await c.get('/TrackConsignment', {
    params: {
      CustomerCode: cc,
      customerCode: cc,
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
  const params = { Pincode: String(pincode) };
  return postOrGetQuery(c, '/GetPincodeTracking', params);
}

export async function getStickerSize(syncDateTime = '01/01/2000 00:01') {
  const c = client();
  const params = {
    CustomerCode: process.env.LOGISTICS_CUSTOMER_CODE,
    SyncDateTime: syncDateTime,
  };
  return postOrGetQuery(c, '/GetStickerSize', params);
}

function bufferLooksLikePdf(buf) {
  return (
    buf.length >= 4 &&
    buf[0] === 0x25 &&
    buf[1] === 0x50 &&
    buf[2] === 0x44 &&
    buf[3] === 0x46
  );
}

function parseStickerJsonFromBuffer(raw) {
  const t = raw
    .toString('utf8')
    .replace(/^\uFEFF/, '')
    .trim();
  if (!t || (t[0] !== '{' && t[0] !== '[')) return null;
  try {
    return JSON.parse(t);
  } catch {
    return null;
  }
}

function networkErrorHint(code, message) {
  if (code === 'ETIMEDOUT' || code === 'ECONNABORTED') {
    return 'Connection to the carrier timed out. Try another network/VPN, allow outbound HTTPS to Catalyst, or ask if their API is IP-restricted.';
  }
  if (code === 'ECONNREFUSED' || code === 'ENOTFOUND') {
    return 'Could not reach the carrier host (DNS or firewall). Check internet and corporate proxy settings.';
  }
  return message || 'Network error talking to carrier.';
}

async function fetchPdfFromStickerUrl(filePath, carrierJson) {
  const fetchPdf = async (url) =>
    axios.get(url, {
      responseType: 'arraybuffer',
      timeout: logisticsTimeoutMs(),
      validateStatus: () => true,
      headers: {
        'X-APPKEY': process.env.LOGISTICS_X_APP_KEY || '',
      },
    });

  let pdfRes;
  let pdfBuf;

  try {
    pdfRes = await fetchPdf(filePath);
    pdfBuf = Buffer.from(pdfRes.data || []);
  } catch (e) {
    if (filePath.startsWith('http://')) {
      const httpsUrl = `https://${filePath.slice('http://'.length)}`;
      try {
        pdfRes = await fetchPdf(httpsUrl);
        pdfBuf = Buffer.from(pdfRes.data || []);
      } catch (e2) {
        const err = new Error(networkErrorHint(e2.code, e2.message));
        err.cause = e2;
        err.carrierStickerJson = carrierJson || { FilePath: filePath };
        err.labelUrlTried = filePath;
        throw err;
      }
    } else {
      const err = new Error(networkErrorHint(e.code, e.message));
      err.cause = e;
      err.carrierStickerJson = carrierJson || { FilePath: filePath };
      err.labelUrlTried = filePath;
      throw err;
    }
  }

  if (bufferLooksLikePdf(pdfBuf)) {
    return pdfRes;
  }

  // HTTP already responded (e.g. 404 HTML) — do not retry HTTPS; many networks block :443 to Catalyst while :80 works.
  if (filePath.startsWith('http://') && pdfRes && typeof pdfRes.status === 'number') {
    const err = new Error(
      `Label PDF not found at carrier (HTTP ${pdfRes.status}). In the test environment, the API often returns a label link but the PDF file is missing for demo AWBs — ask Catalyst or use a production AWB.`
    );
    err.carrierStickerJson = carrierJson || { FilePath: filePath };
    err.labelUrlTried = filePath;
    throw err;
  }

  const err = new Error(
    `Label PDF not found at carrier (HTTP ${pdfRes?.status ?? '?' }). In the test environment, the label link often exists but the PDF is missing for demo AWBs — ask Catalyst or use a production AWB.`
  );
  err.carrierStickerJson = carrierJson || { FilePath: filePath };
  err.labelUrlTried = filePath;
  throw err;
}

/**
 * UAT returns JSON { FilePath } then you download the PDF; raw PDF in-body is rare.
 * UAT: use GET (POST returns “method not supported”). Live: fallback to POST if GET returns 405.
 */
async function resolveStickerBody(bodyBuffer, sourceHeaders, sourceStatus) {
  const raw = Buffer.from(bodyBuffer || []);
  if (bufferLooksLikePdf(raw)) {
    return {
      data: bodyBuffer,
      headers: sourceHeaders,
      status: sourceStatus >= 200 && sourceStatus < 300 ? sourceStatus : 200,
    };
  }

  const j = parseStickerJsonFromBuffer(raw);
  if (j) {
    const path = j.FilePath || j.filePath;
    if (path && typeof path === 'string') {
      const pdfRes = await fetchPdfFromStickerUrl(path, j);
      return { data: pdfRes.data, headers: pdfRes.headers, status: 200 };
    }
    const failMsg =
      j.Message ||
      j.message ||
      j.ResponseStatus?.Message ||
      (typeof j.ResponseStatus === 'object' ? j.ResponseStatus?.Message : null);
    if (failMsg && String(failMsg).trim().toLowerCase() !== 'success') {
      const err = new Error(String(failMsg));
      err.carrierStickerJson = j;
      throw err;
    }
  }

  const err = new Error(
    'Carrier did not return a PDF or a label FilePath for this AWB. Check sticker size name (use a value from GetStickerSize, e.g. PARCEL).'
  );
  err.carrierStickerPreview = raw.toString('utf8').slice(0, 500);
  if (j) err.carrierStickerJson = j;
  throw err;
}

export async function getStickerPrintBuffer(awb, stickerSizeName) {
  const c = client();
  const params = {
    CustomerCode: process.env.LOGISTICS_CUSTOMER_CODE,
    AWB: String(awb),
    StickerSizeName: String(stickerSizeName),
  };
  const req = { params, responseType: 'arraybuffer' };

  let res = await c.get('/GetStickerPrint', req);
  if (res.status === 405) {
    res = await c.post('/GetStickerPrint', null, req);
  }
  const out = await resolveStickerBody(res.data, res.headers, res.status);
  return { status: out.status, data: out.data, headers: out.headers };
}

export async function getModeList() {
  const c = client();
  const params = { CustomerCode: process.env.LOGISTICS_CUSTOMER_CODE };
  return postOrGetQuery(c, '/Get_ModeList', params);
}

export async function getProductList() {
  const c = client();
  const params = { CustomerCode: process.env.LOGISTICS_CUSTOMER_CODE };
  return postOrGetQuery(c, '/Get_ProductList', params);
}

export async function getCountryList() {
  const c = client();
  const params = { CustomerCode: process.env.LOGISTICS_CUSTOMER_CODE };
  return postOrGetQuery(c, '/Get_CountryList', params);
}

export async function getKycList() {
  const c = client();
  const params = { CustomerCode: process.env.LOGISTICS_CUSTOMER_CODE };
  return postOrGetQuery(c, '/Get_KYCList', params);
}

export async function getBranchTracking() {
  const c = client();
  const params = { CustomerCode: process.env.LOGISTICS_CUSTOMER_CODE };
  return postOrGetQuery(c, '/GetBranchTracking', params);
}

export async function trackConsignmentByRef(referenceNo, statusChar = 'F') {
  const c = client();
  const params = {
    CustomerCode: process.env.LOGISTICS_CUSTOMER_CODE,
    lstRefNo: String(referenceNo),
    Status: statusChar === 'L' ? 'L' : 'F',
  };
  return postOrGetQuery(c, '/TrackConsignmentByRef', params);
}
