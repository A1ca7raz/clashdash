interface Region {
  flag: string;
  keywords: string[];
  codes: string[];
}

/** Earlier entries win: a name receives the first matching flag only. */
const REGIONS: Region[] = [
  { flag: "🇭🇰", keywords: ["香港", "Hong ?Kong"], codes: ["HK", "HKG"] },
  { flag: "🇲🇴", keywords: ["澳门", "澳門", "Maca[ou]"], codes: ["MO"] },
  { flag: "🇹🇼", keywords: ["台湾", "臺灣", "台北", "新北", "彰化", "Taiwan"], codes: ["TW", "TWN"] },
  { flag: "🇯🇵", keywords: ["日本", "东京", "東京", "大阪", "埼玉", "Japan", "Tokyo", "Osaka"], codes: ["JP", "JPN"] },
  { flag: "🇰🇷", keywords: ["韩国", "韓國", "首尔", "首爾", "春川", "Korea", "Seoul"], codes: ["KR", "KOR"] },
  { flag: "🇸🇬", keywords: ["新加坡", "狮城", "獅城", "Singapore"], codes: ["SG", "SGP"] },
  {
    flag: "🇺🇸",
    keywords: ["美国", "美國", "洛杉矶", "圣何塞", "硅谷", "西雅图", "纽约", "芝加哥", "达拉斯", "United States", "America", "Los Angeles", "San Jose", "Seattle"],
    codes: ["US", "USA"],
  },
  { flag: "🇨🇦", keywords: ["加拿大", "多伦多", "温哥华", "Canada", "Toronto", "Vancouver"], codes: ["CA", "CAN"] },
  { flag: "🇬🇧", keywords: ["英国", "英國", "伦敦", "United Kingdom", "Britain", "England", "London"], codes: ["UK", "GB", "GBR"] },
  { flag: "🇩🇪", keywords: ["德国", "德國", "法兰克福", "Germany", "Frankfurt"], codes: ["DE", "DEU"] },
  { flag: "🇫🇷", keywords: ["法国", "法國", "巴黎", "France", "Paris"], codes: ["FR", "FRA"] },
  { flag: "🇳🇱", keywords: ["荷兰", "荷蘭", "阿姆斯特丹", "Netherlands", "Amsterdam"], codes: ["NL", "NLD"] },
  { flag: "🇷🇺", keywords: ["俄罗斯", "俄羅斯", "莫斯科", "Russia", "Moscow"], codes: ["RU", "RUS"] },
  { flag: "🇮🇩", keywords: ["印尼", "印度尼西亚", "雅加达", "Indonesia", "Jakarta"], codes: ["ID", "IDN"] },
  { flag: "🇮🇳", keywords: ["印度", "孟买", "India", "Mumbai"], codes: ["IN", "IND"] },
  { flag: "🇦🇺", keywords: ["澳大利亚", "澳洲", "悉尼", "墨尔本", "Australia", "Sydney", "Melbourne"], codes: ["AU", "AUS"] },
  { flag: "🇲🇾", keywords: ["马来西亚", "馬來西亞", "吉隆坡", "Malaysia"], codes: ["MY", "MYS"] },
  { flag: "🇹🇭", keywords: ["泰国", "泰國", "曼谷", "Thailand", "Bangkok"], codes: ["TH", "THA"] },
  { flag: "🇻🇳", keywords: ["越南", "Vietnam"], codes: ["VN", "VNM"] },
  { flag: "🇵🇭", keywords: ["菲律宾", "菲律賓", "马尼拉", "Philippines", "Manila"], codes: ["PH", "PHL"] },
  { flag: "🇹🇷", keywords: ["土耳其", "伊斯坦布尔", "Turkey", "Türkiye", "Istanbul"], codes: ["TR", "TUR"] },
  { flag: "🇦🇪", keywords: ["阿联酋", "迪拜", "Dubai", "Emirates"], codes: ["AE", "UAE"] },
  { flag: "🇦🇷", keywords: ["阿根廷", "Argentina"], codes: ["AR", "ARG"] },
  { flag: "🇧🇷", keywords: ["巴西", "Brazil"], codes: ["BR", "BRA"] },
  { flag: "🇮🇹", keywords: ["意大利", "米兰", "Italy", "Milan"], codes: ["IT", "ITA"] },
  { flag: "🇪🇸", keywords: ["西班牙", "马德里", "Spain", "Madrid"], codes: ["ES", "ESP"] },
  { flag: "🇨🇭", keywords: ["瑞士", "苏黎世", "Switzerland", "Zurich"], codes: ["CH", "CHE"] },
  { flag: "🇸🇪", keywords: ["瑞典", "Sweden"], codes: ["SE", "SWE"] },
  { flag: "🇺🇦", keywords: ["乌克兰", "Ukraine"], codes: ["UA", "UKR"] },
  { flag: "🇿🇦", keywords: ["南非", "South Africa"], codes: ["ZA", "ZAF"] },
];

export const KNOWN_FLAGS = REGIONS.map((r) => r.flag);

/**
 * One override.proxy-name entry per region. Each inserts the flag at the start (zero-width
 * match) unless the name already starts with a known flag, so later entries don't stack flags.
 * Only constructs regexp2 and JS treat identically are used.
 */
export function flagRenameRules(): { pattern: string; target: string }[] {
  const skipFlagged = `(?!${KNOWN_FLAGS.join("|")})`;
  return REGIONS.map((r) => {
    const codes = r.codes.map((c) => `(?<![A-Za-z])${c}(?![A-Za-z])`);
    const alternatives = [...r.keywords, ...codes].join("|");
    return { pattern: `(?i)^${skipFlagged}(?=.*(?:${alternatives}))`, target: `${r.flag} ` };
  });
}
