// 解析球场批量导入文件（CSV / Excel XML / xlsx）
function decodeXml(s) {
  return String(s || '')
    .replace(/</g, '<')
    .replace(/>/g, '>')
    .replace(/&/g, '&')
    .replace(/"/g, '"')
    .replace(/&#39;/g, "'");
}

function parseCsv(text) {
  const raw = String(text || '').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = raw.split('\n').filter((l) => l.trim());
  const rows = [];
  for (const line of lines) {
    const cells = [];
    let cur = '';
    let inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuote && line[i + 1] === '"') { cur += '"'; i++; }
        else inQuote = !inQuote;
      } else if (ch === ',' && !inQuote) {
        cells.push(cur.trim());
        cur = '';
      } else cur += ch;
    }
    cells.push(cur.trim());
    if (cells.some((c) => c)) rows.push(cells);
  }
  return rows;
}

function parseSpreadsheetMl(xml) {
  const rows = [];
  const rowRe = /<Row[^>]*>([\s\S]*?)<\/Row>/gi;
  let m;
  while ((m = rowRe.exec(xml))) {
    const cells = [];
    const cellRe = /<(?:ss:)?Cell[^>]*>[\s\S]*?<(?:ss:)?Data[^>]*>([\s\S]*?)<\/(?:ss:)?Data>[\s\S]*?<\/(?:ss:)?Cell>/gi;
    let c;
    const block = m[1];
    while ((c = cellRe.exec(block))) cells.push(decodeXml(c[1]).trim());
    if (!cells.length) {
      const simple = /<Data[^>]*>([\s\S]*?)<\/Data>/gi;
      let d;
      while ((d = simple.exec(block))) cells.push(decodeXml(d[1]).trim());
    }
    if (cells.some((x) => x)) rows.push(cells);
  }
  return rows;
}

function parseXlsx(buf) {
  let XLSX;
  try { XLSX = require('xlsx'); }
  catch (e) {
    throw new Error('服务端未安装 xlsx，请将表格另存为 CSV 后再导入');
  }
  const wb = XLSX.read(buf, { type: 'buffer', cellDates: false });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) return [];
  const sheet = wb.Sheets[sheetName];
  return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });
}

function looksLikeZip(buf) {
  return buf && buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4b;
}

function looksLikeXml(text) {
  const s = String(text || '').trim().slice(0, 200);
  return s.startsWith('<?xml') || s.indexOf('<Workbook') >= 0;
}

function parseTableBuffer(buf, filename = '') {
  if (!buf || !buf.length) return [];
  const name = String(filename || '').toLowerCase();
  if (looksLikeZip(buf) || name.endsWith('.xlsx')) {
    return parseXlsx(buf).map((r) => (Array.isArray(r) ? r.map((c) => String(c == null ? '' : c).trim()) : []));
  }
  const text = buf.toString('utf8');
  if (looksLikeXml(text) || name.endsWith('.xls')) {
    const xmlRows = parseSpreadsheetMl(text);
    if (xmlRows.length) return xmlRows;
  }
  return parseCsv(text);
}

const HEADER_MAP = {
  '球场名称': 'name', '名称': 'name', 'name': 'name', '球场': 'name',
  '省市区': 'district', '所在区域': 'district', '区域': 'district',
  '*省*市*区': 'district', '地区': 'district', 'district': 'district',
  '详细地址': 'address', '地址': 'address', 'address': 'address',
  '联系人': 'contactName', '联系人姓名': 'contactName', 'contactname': 'contactName',
  '联系电话': 'phone', '电话': 'phone', '手机': 'phone', 'phone': 'phone'
};

function normalizeHeader(h) {
  return String(h || '').replace(/\s+/g, '').replace(/\*/g, '').toLowerCase();
}

function mapRows(rawRows) {
  if (!rawRows || !rawRows.length) return [];
  const header = (rawRows[0] || []).map((h) => String(h || '').trim());
  const keys = header.map((h) => {
    const direct = HEADER_MAP[h] || HEADER_MAP[h.replace(/\s+/g, '')];
    if (direct) return direct;
    const n = normalizeHeader(h);
    if (n.indexOf('名称') >= 0 || n === 'name') return 'name';
    if (n.indexOf('省') >= 0 || n.indexOf('区') >= 0 || n === 'district') return 'district';
    if (n.indexOf('地址') >= 0 || n === 'address') return 'address';
    if (n.indexOf('联系人') >= 0 || n === 'contactname') return 'contactName';
    if (n.indexOf('电话') >= 0 || n.indexOf('手机') >= 0 || n === 'phone') return 'phone';
    return '';
  });
  const out = [];
  for (let i = 1; i < rawRows.length; i++) {
    const row = rawRows[i] || [];
    const obj = { name: '', district: '', address: '', contactName: '', phone: '' };
    keys.forEach((k, idx) => {
      if (!k) return;
      obj[k] = String(row[idx] == null ? '' : row[idx]).trim();
    });
    if (obj.name || obj.address || obj.phone) out.push(obj);
  }
  return out;
}

function buildCsvTemplate() {
  const header = ['球场名称', '省市区', '详细地址', '联系人', '联系电话'];
  const example = ['白云新海足球场', '广东省 广州市 白云区', '广州市白云区新海路1号', '张经理', '13800138000'];
  const line = (arr) => arr.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',');
  return `\uFEFF${line(header)}\r\n${line(example)}\r\n`;
}

function buildExcelXmlTemplate() {
  const cells = (arr) => arr.map((c) => `<Cell><Data ss:Type="String">${String(c).replace(/&/g, '&').replace(/</g, '<')}</Data></Cell>`).join('');
  return `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Worksheet ss:Name="球场导入">
  <Table>
   <Row>${cells(['球场名称', '省市区', '详细地址', '联系人', '联系电话'])}</Row>
   <Row>${cells(['白云新海足球场', '广东省 广州市 白云区', '广州市白云区新海路1号', '张经理', '13800138000'])}</Row>
  </Table>
 </Worksheet>
</Workbook>`;
}

module.exports = {
  parseTableBuffer,
  mapRows,
  buildCsvTemplate,
  buildExcelXmlTemplate
};
