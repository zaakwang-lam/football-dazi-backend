// src/utils/region-parse.js
// 从球场 district / address 解析「省 + 市」，用于订场筛选

const GZ_DISTRICTS = [
  '天河区', '海珠区', '越秀区', '荔湾区', '白云区', '黄埔区',
  '番禺区', '花都区', '南沙区', '从化区', '增城区'
];

const CITY_PROVINCE = {
  北京市: '北京市', 上海市: '上海市', 天津市: '天津市', 重庆市: '重庆市',
  广州市: '广东省', 深圳市: '广东省', 珠海市: '广东省', 佛山市: '广东省',
  东莞市: '广东省', 中山市: '广东省', 惠州市: '广东省', 汕头市: '广东省',
  江门市: '广东省', 湛江市: '广东省', 茂名市: '广东省', 肇庆市: '广东省',
  梅州市: '广东省', 汕尾市: '广东省', 河源市: '广东省', 阳江市: '广东省',
  清远市: '广东省', 潮州市: '广东省', 揭阳市: '广东省', 云浮市: '广东省',
  杭州市: '浙江省', 宁波市: '浙江省', 温州市: '浙江省',
  南京市: '江苏省', 苏州市: '江苏省',
  福州市: '福建省', 厦门市: '福建省',
  长沙市: '湖南省', 武汉市: '湖北省', 成都市: '四川省',
  济南市: '山东省', 青岛市: '山东省', 郑州市: '河南省', 西安市: '陕西省',
  南宁市: '广西壮族自治区', 桂林市: '广西壮族自治区',
  海口市: '海南省', 三亚市: '海南省'
};

function compact(s) {
  return String(s || '').replace(/\s+/g, '').replace(/　/g, '');
}

function normalizeSuffix(name, suffix) {
  if (!name) return '';
  if (name.endsWith(suffix)) return name;
  return name + suffix;
}

function parseProvinceCity(district, address) {
  const raw = compact(district);
  const addr = compact(address);
  const text = raw || addr;

  if (!text) return { province: '', city: '', label: '其他', key: '|' };

  const muni = text.match(/^(北京|上海|天津|重庆)(市)?/);
  if (muni) {
    const name = muni[1] + '市';
    return { province: name, city: name, label: name, key: `${name}|${name}` };
  }

  let province = '';
  let rest = text;
  const pMatch = text.match(/^(.*?自治区|.*?特别行政区|.+?省)/);
  if (pMatch) {
    province = pMatch[1];
    rest = text.slice(pMatch[1].length);
  }

  let city = '';
  const cMatch = rest.match(/^(.+?市|.+?州|.+?盟|.+?地区)/);
  if (cMatch) city = cMatch[1];

  if (!province && !city) {
    if (GZ_DISTRICTS.some((d) => text === d || text === d.replace('区', '') || text.endsWith(d))) {
      return { province: '广东省', city: '广州市', label: '广东省广州市', key: '广东省|广州市' };
    }
    if (text.includes('广州') || addr.includes('广州')) {
      return { province: '广东省', city: '广州市', label: '广东省广州市', key: '广东省|广州市' };
    }
    const cityOnly = text.match(/(.{2,8}市)/);
    if (cityOnly) {
      city = cityOnly[1];
      province = CITY_PROVINCE[city] || '';
    }
  }

  if (!province && city) province = CITY_PROVINCE[city] || CITY_PROVINCE[normalizeSuffix(city, '市')] || '';
  if (province && !city) {
    const fromAddr = addr.slice(province.length).match(/^(.+?市)/);
    if (fromAddr) city = fromAddr[1];
  }

  if (!province && !city) {
    return { province: '', city: '', label: raw || '其他', key: `|${raw}` };
  }

  const label = province && city
    ? (province === city ? province : `${province}${city}`)
    : (city || province);
  return { province, city, label, key: `${province}|${city}` };
}

function matchRegion(court, province, city) {
  const r = parseProvinceCity(court.district, court.address);
  const p = String(province || '').trim();
  const c = String(city || '').trim();
  if (p && r.province) {
    const ok = r.province === p || r.province.includes(p) || p.includes(r.province);
    if (!ok) return false;
  } else if (p && !r.province) {
    return false;
  }
  if (c && r.city) {
    const ok = r.city === c || r.city.includes(c) || c.includes(r.city);
    if (!ok) return false;
  } else if (c && !r.city) {
    return false;
  }
  return true;
}

module.exports = { parseProvinceCity, matchRegion, GZ_DISTRICTS };
