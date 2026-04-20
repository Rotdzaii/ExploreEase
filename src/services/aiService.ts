import { GoogleGenerativeAI } from '@google/generative-ai';

const GEMINI_INTENT_MODEL = process.env.EXPO_PUBLIC_GEMINI_INTENT_MODEL?.trim() || 'gemini-2.5-flash';
const GEMINI_EMBEDDING_MODEL = process.env.EXPO_PUBLIC_GEMINI_EMBEDDING_MODEL?.trim() || 'gemini-embedding-001';
const GEMINI_EMBEDDING_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_EMBEDDING_MODEL}:embedContent`;
const EMBEDDING_DIMENSION = 384;
const EMBEDDING_TIMEOUT_MS = 18_000;

export const ALLOWED_TRAVEL_CATEGORY_HINTS = [
  'Thiên nhiên',
  'Văn hóa',
  'Giải trí',
  'Ẩm thực',
  'Nghỉ dưỡng',
  'Mạo hiểm',
] as const;

export type TravelCategoryHint = (typeof ALLOWED_TRAVEL_CATEGORY_HINTS)[number];

export const ALLOWED_TRAVEL_INTENT_TYPES = [
  'spiritual',
  'nature',
  'beach',
  'adventure',
  'food',
  'unknown',
] as const;

export type TravelIntentType = (typeof ALLOWED_TRAVEL_INTENT_TYPES)[number];

export type TravelSearchIntentResult = {
  is_travel_related: boolean;
  intent_type: TravelIntentType;
  is_free: boolean | null;
  category_hints: TravelCategoryHint[];
  ai_suggested_places: string[];
  reasoning_hidden: string;
};

export const SMART_SEARCH_LANGUAGE_CODES = ['vi', 'en', 'ja'] as const;

export type SmartSearchLanguageCode = (typeof SMART_SEARCH_LANGUAGE_CODES)[number];

type ExtractTravelSearchIntentOptions = {
  currentLanguage?: string | null;
};

type TranslateSmartSearchTextOptions = {
  fromLanguage?: string | null;
  toLanguage?: string | null;
};

type GeminiErrorPayload = {
  error?: {
    message?: string;
  };
};

type GeminiEmbeddingPayload = {
  embedding?: {
    values?: unknown;
  };
  embeddings?: {
    values?: unknown;
  }[];
};

const CATEGORY_HINT_ALIASES: Record<TravelCategoryHint, string[]> = {
  'Thiên nhiên': ['thien nhien', 'nature', 'bien', 'nui', 'rung', 'song', 'ho', 'yen tinh', 'chua lanh'],
  'Văn hóa': [
    'van hoa',
    'culture',
    'heritage',
    'history',
    'temple',
    'pagoda',
    'museum',
    'chua',
    'den',
    'cau an',
    'tam linh',
  ],
  'Giải trí': ['giai tri', 'entertainment', 'nightlife', 'party', 'soi dong', 'song ao', 'check-in', 'vui choi'],
  'Ẩm thực': ['am thuc', 'food', 'cuisine', 'restaurant', 'street food', 'seafood', 'quan an', 'an ngon'],
  'Nghỉ dưỡng': ['nghi duong', 'resort', 'wellness', 'retreat', 'healing', 'thu gian', 'tron viec', 'yen tinh'],
  'Mạo hiểm': ['mao hiem', 'adventure', 'phuot', 'trek', 'trekking', 'hiking', 'kham pha', 'chinh phuc'],
};

const CATEGORY_HINT_DEFAULT_PLACES: Record<TravelCategoryHint, string[]> = {
  'Thiên nhiên': ['Sa Pa', 'Hà Giang', 'Măng Đen', 'Bảo Lộc', 'Ninh Bình'],
  'Văn hóa': ['Chùa Bái Đính (Ninh Bình)', 'Tòa Thánh Tây Ninh', 'Miếu Bà Chúa Xứ (An Giang)', 'Nghĩa trang Hàng Dương (Côn Đảo)', 'Chùa Thiên Mụ (Huế)'],
  'Giải trí': ['Đà Nẵng', 'Nha Trang', 'Phú Quốc', 'Hạ Long', 'TP.HCM'],
  'Ẩm thực': ['Huế', 'Hội An', 'Hà Nội', 'TP.HCM', 'Cần Thơ'],
  'Nghỉ dưỡng': ['Sa Pa', 'Hà Giang', 'Măng Đen', 'Bảo Lộc', 'Côn Đảo'],
  'Mạo hiểm': ['Hà Giang', 'Tà Xùa', 'Mộc Châu', 'Tà Năng', 'Bà Đen'],
};

const CATEGORY_HINT_DEFAULT_GENERAL_KEYWORDS: Record<TravelCategoryHint, string[]> = {
  'Thiên nhiên': ['yên tĩnh', 'thoáng đãng', 'cảnh đẹp', 'gần thiên nhiên'],
  'Văn hóa': ['tâm linh', 'lịch sử', 'kiến trúc', 'bản sắc'],
  'Giải trí': ['sôi động', 'vui chơi', 'check-in', 'nhộn nhịp'],
  'Ẩm thực': ['đặc sản', 'ăn ngon', 'quán địa phương', 'ẩm thực'],
  'Nghỉ dưỡng': ['chữa lành', 'thư giãn', 'riêng tư', 'resort'],
  'Mạo hiểm': ['phượt', 'trekking', 'khám phá', 'vận động'],
};

type SemanticReasoningCue = {
  intentType?: Exclude<TravelIntentType, 'unknown'>;
  categoryHints?: TravelCategoryHint[];
  generalKeywords?: string[];
  suggestedPlaces?: string[];
  reasoningHint?: string;
};

const SEMANTIC_REASONING_CUES: Record<string, SemanticReasoningCue> = {
  'cung kieng': {
    intentType: 'spiritual',
    categoryHints: ['Văn hóa'],
    generalKeywords: ['tâm linh', 'lễ bái', 'trang nghiêm', 'thành kính'],
    suggestedPlaces: [
      'Chùa Bái Đính (Ninh Bình)',
      'Chùa Thiên Mụ (Huế)',
      'Tòa Thánh Tây Ninh',
      'Miếu Bà Chúa Xứ (An Giang)',
      'Nghĩa trang Hàng Dương (Côn Đảo)',
    ],
    reasoningHint: 'Ưu tiên địa điểm tâm linh như chùa, đền, miếu và nghĩa trang liệt sĩ.',
  },
  'tam linh': {
    intentType: 'spiritual',
    categoryHints: ['Văn hóa'],
    generalKeywords: ['tâm linh', 'cầu an', 'lịch sử', 'thành kính'],
    suggestedPlaces: [
      'Chùa Bái Đính (Ninh Bình)',
      'Yên Tử (Quảng Ninh)',
      'Chùa Thiên Mụ (Huế)',
      'Miếu Bà Chúa Xứ (An Giang)',
      'Nghĩa trang Hàng Dương (Côn Đảo)',
    ],
    reasoningHint: 'Phù hợp nhu cầu tâm linh, cầu an và tưởng niệm.',
  },
  'khong khi trong lanh': {
    intentType: 'nature',
    categoryHints: ['Thiên nhiên', 'Nghỉ dưỡng'],
    generalKeywords: ['không khí trong lành', 'cao nguyên', 'rừng thông', 'chữa lành'],
    suggestedPlaces: ['Sa Pa', 'Hà Giang', 'Măng Đen', 'Bảo Lộc', 'Tà Xùa'],
    reasoningHint: 'Ưu tiên vùng cao và rừng có khí hậu trong lành.',
  },
  'chua lanh': {
    intentType: 'nature',
    categoryHints: ['Nghỉ dưỡng', 'Thiên nhiên'],
    generalKeywords: ['chữa lành', 'không khí trong lành', 'rừng', 'yên tĩnh'],
    suggestedPlaces: ['Sa Pa', 'Hà Giang', 'Măng Đen', 'Bảo Lộc', 'Đà Lạt'],
    reasoningHint: 'Chọn điểm đến cao nguyên hoặc rừng để thư giãn và phục hồi.',
  },
  'song ao': {
    intentType: 'beach',
    categoryHints: ['Giải trí'],
    generalKeywords: ['chụp ảnh', 'đẹp', 'sôi động', 'check-in'],
    suggestedPlaces: ['Đà Lạt', 'Hội An', 'Phú Quốc', 'Đà Nẵng', 'Nha Trang'],
    reasoningHint: 'Ưu tiên nơi nhiều góc chụp và không khí sôi động.',
  },
  'tron viec': {
    intentType: 'nature',
    categoryHints: ['Nghỉ dưỡng', 'Thiên nhiên'],
    generalKeywords: ['yên tĩnh', 'thư giãn', 'chill', 'thoát phố'],
    suggestedPlaces: ['Sa Pa', 'Măng Đen', 'Bảo Lộc', 'Côn Đảo', 'Hà Giang'],
    reasoningHint: 'Phù hợp nhu cầu rời xa thành phố, tìm nơi tĩnh và mát.',
  },
  'di phuot': {
    intentType: 'adventure',
    categoryHints: ['Mạo hiểm'],
    generalKeywords: ['phượt', 'đường đẹp', 'khám phá', 'trekking'],
    suggestedPlaces: ['Hà Giang', 'Tà Xùa', 'Mộc Châu', 'Tà Năng', 'Bình Liêu'],
    reasoningHint: 'Ưu tiên cung đường thử thách và trải nghiệm khám phá.',
  },
  'yen tinh': {
    intentType: 'nature',
    categoryHints: ['Thiên nhiên', 'Nghỉ dưỡng'],
    generalKeywords: ['yên tĩnh', 'ít đông', 'thư giãn', 'cảnh xanh'],
    suggestedPlaces: ['Sa Pa', 'Măng Đen', 'Bảo Lộc', 'Tam Đảo', 'Côn Đảo'],
    reasoningHint: 'Tập trung điểm đến nhẹ nhàng, nhiều cây xanh và ít ồn ào.',
  },
};

const SMART_SEARCH_LANGUAGE_LABELS: Record<SmartSearchLanguageCode, string> = {
  vi: 'tiếng Việt',
  en: 'English',
  ja: 'Japanese',
};

const normalizeSmartSearchLanguageCode = (value?: string | null): SmartSearchLanguageCode => {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (normalized === 'en') return 'en';
  if (normalized === 'ja') return 'ja';
  return 'vi';
};

const INTENT_TYPE_DEFAULT_CATEGORY_HINTS: Record<TravelIntentType, TravelCategoryHint[]> = {
  spiritual: ['Văn hóa'],
  nature: ['Thiên nhiên', 'Nghỉ dưỡng'],
  beach: ['Thiên nhiên'],
  adventure: ['Mạo hiểm', 'Thiên nhiên'],
  food: ['Ẩm thực'],
  unknown: [],
};

const INTENT_TYPE_DEFAULT_PLACES: Record<TravelIntentType, string[]> = {
  spiritual: [
    'Chùa Bái Đính (Ninh Bình)',
    'Chùa Thiên Mụ (Huế)',
    'Tòa Thánh Tây Ninh',
    'Miếu Bà Chúa Xứ (An Giang)',
    'Nghĩa trang Hàng Dương (Côn Đảo)',
  ],
  nature: ['Sa Pa', 'Hà Giang', 'Măng Đen', 'Bảo Lộc', 'Ninh Bình'],
  beach: ['Hạ Long', 'Đà Nẵng', 'Phú Quốc', 'Quy Nhơn', 'Nha Trang'],
  adventure: ['Hà Giang', 'Quảng Bình', 'Đà Nẵng', 'Tà Năng', 'Phú Quốc'],
  food: ['Hà Nội', 'Huế', 'Hội An', 'TP.HCM', 'Cần Thơ'],
  unknown: ['Hà Nội', 'Đà Nẵng', 'TP.HCM', 'Sa Pa', 'Phú Quốc'],
};

type VietnamRegion = 'north' | 'central' | 'south';

const PLACE_REGION_MAP: Record<string, VietnamRegion> = {
  'sa pa': 'north',
  'ha giang': 'north',
  'ninh binh': 'north',
  'ha noi': 'north',
  'ha long': 'north',
  'tam dao': 'north',
  'ta xua': 'north',
  'moc chau': 'north',
  'binh lieu': 'north',
  'yen tu': 'north',
  'chua bai dinh': 'north',
  'hue': 'central',
  'chua thien mu': 'central',
  'da nang': 'central',
  'hoi an': 'central',
  'mang den': 'central',
  'quang binh': 'central',
  'nha trang': 'central',
  'quy nhon': 'central',
  'bao loc': 'south',
  'tp hcm': 'south',
  'ho chi minh': 'south',
  'can tho': 'south',
  'phu quoc': 'south',
  'con dao': 'south',
  'tay ninh': 'south',
  'toa thanh tay ninh': 'south',
  'an giang': 'south',
  'mieu ba chua xu': 'south',
  'nghia trang hang duong': 'south',
};

const REGION_ROTATION_FALLBACK: Record<VietnamRegion, string[]> = {
  north: ['Sa Pa', 'Hà Giang', 'Ninh Bình'],
  central: ['Đà Nẵng', 'Huế', 'Măng Đen'],
  south: ['TP.HCM', 'Cần Thơ', 'Phú Quốc'],
};

const SPIRITUAL_REQUIRED_TOKENS = [
  'chua',
  'den',
  'mieu',
  'nghia trang liet si',
  'toa thanh tay ninh',
  'mieu ba chua xu',
  'nghia trang hang duong',
  'chua bai dinh',
];

const PLACE_ALIAS_TO_VIETNAMESE: Record<string, string> = {
  'chua bai dinh': 'Chùa Bái Đính (Ninh Bình)',
  'bai dinh': 'Chùa Bái Đính (Ninh Bình)',
  'toa thanh tay ninh': 'Tòa Thánh Tây Ninh',
  'mieu ba chua xu': 'Miếu Bà Chúa Xứ (An Giang)',
  'nghia trang hang duong': 'Nghĩa trang Hàng Dương (Côn Đảo)',
  'chua thien mu': 'Chùa Thiên Mụ (Huế)',
  'tay ninh': 'Tây Ninh',
  'an giang': 'An Giang',
  'quang binh': 'Quảng Bình',
  'nha trang': 'Nha Trang',
  'vung tau': 'Vũng Tàu',
  'phu quoc': 'Phú Quốc',
  'con dao': 'Côn Đảo',
  'da lat': 'Đà Lạt',
  'ba na': 'Bà Nà',
  'ba den': 'Bà Đen',
  'da nang': 'Đà Nẵng',
  'ha noi': 'Hà Nội',
  'hoi an': 'Hội An',
  'hue': 'Huế',
  'tp hcm': 'TP.HCM',
  'ho chi minh': 'TP.HCM',
  'sai gon': 'TP.HCM',
  'ha giang': 'Hà Giang',
  'ninh binh': 'Ninh Bình',
  'phu yen': 'Phú Yên',
  'mang den': 'Măng Đen',
  'ta xua': 'Tà Xùa',
  'moc chau': 'Mộc Châu',
  'ta nang': 'Tà Năng',
  'binh lieu': 'Bình Liêu',
  'quy nhon': 'Quy Nhơn',
  'can tho': 'Cần Thơ',
  'ha long': 'Hạ Long',
  'tam dao': 'Tam Đảo',
  'bao loc': 'Bảo Lộc',
  'yen tu': 'Yên Tử',
  'sapa': 'Sa Pa',
  'sa pa': 'Sa Pa',
  'chua': 'Chùa',
  'den': 'Đền',
  'mieu': 'Miếu',
  'nha tho': 'Nhà thờ',
  'pagoda': 'Chùa',
  'temple': 'Đền',
  'shrine': 'Miếu',
  'church': 'Nhà thờ',
};

const GENERAL_KEYWORD_ALIAS_TO_VIETNAMESE: Record<string, string> = {
  healing: 'chữa lành',
  calm: 'yên tĩnh',
  quiet: 'yên tĩnh',
  chill: 'thư giãn',
  relax: 'thư giãn',
  nightlife: 'sôi động',
  instagrammable: 'sống ảo',
  photo: 'chụp ảnh',
  photography: 'chụp ảnh',
  trek: 'trekking',
  trekking: 'trekking',
  adventure: 'mạo hiểm',
  food: 'ẩm thực',
  cuisine: 'ẩm thực',
};

const buildSmartSearchSystemInstruction = (currentLanguage: SmartSearchLanguageCode) => `
Bạn là Master Vietnamese Travel Expert cho ứng dụng ExploreEase.

Bối cảnh ngôn ngữ:
- current_language="${currentLanguage}".
- Các trường văn bản đầu ra (ai_suggested_places, reasoning_hidden) phải dùng ${SMART_SEARCH_LANGUAGE_LABELS[currentLanguage]}.

Ràng buộc bắt buộc:
1) Luôn trả về DUY NHẤT một JSON object hợp lệ, không markdown, không giải thích thêm.
2) intent_type chỉ được chọn một trong: ["spiritual", "nature", "beach", "adventure", "food", "unknown"].
3) category_hints chỉ được chọn từ: ["Thiên nhiên", "Văn hóa", "Giải trí", "Ẩm thực", "Nghỉ dưỡng", "Mạo hiểm"].
4) Bắt buộc suy luận ngữ nghĩa cho truy vấn trừu tượng/tiếng lóng/mood.
5) Mapping cứng cho tâm linh:
  - Nếu truy vấn thuộc "cúng kiếng"/"tâm linh" => intent_type phải là "spiritual".
  - Bắt buộc ưu tiên nhóm: Chùa, Đền, Miếu, Nghĩa trang liệt sĩ.
  - Ưu tiên ví dụ: Tây Ninh (Tòa Thánh), An Giang (Miếu Bà Chúa Xứ), Côn Đảo (Nghĩa trang Hàng Dương), Ninh Bình (Bái Đính).
6) Mapping cứng cho không khí trong lành/chữa lành:
  - Ưu tiên vùng cao/rừng: Sa Pa, Hà Giang, Măng Đen, Bảo Lộc (không chỉ Đà Lạt).
7) Regional rotation bắt buộc:
  - ai_suggested_places phải có 5-7 địa danh và có ít nhất 1 địa danh miền Bắc, 1 miền Trung, 1 miền Nam.
8) reasoning_hidden là 1 câu ngắn giải thích vì sao gợi ý phù hợp nhu cầu.
9) Nếu truy vấn không liên quan du lịch thì đặt is_travel_related=false, intent_type="unknown", category_hints=[], ai_suggested_places=[], reasoning_hidden="".
10) is_free:
   - true: người dùng muốn miễn phí/tiết kiệm.
   - false: người dùng muốn có phí/cao cấp.
   - null: không đề cập ngân sách.

Schema bắt buộc:
{
  "is_travel_related": boolean,
  "intent_type": "spiritual" | "nature" | "beach" | "adventure" | "food" | "unknown",
  "is_free": boolean | null,
  "category_hints": string[],
  "ai_suggested_places": string[],
  "reasoning_hidden": string
}
`;

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const isNumberArray = (value: unknown): value is number[] =>
  Array.isArray(value) && value.every(isFiniteNumber);

const l2Normalize = (vector: number[]) => {
  const norm = Math.sqrt(vector.reduce((acc, cur) => acc + cur * cur, 0));
  if (!Number.isFinite(norm) || norm <= 0) return vector;
  return vector.map((value) => value / norm);
};

const normalizeText = (value: unknown) =>
  String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

const splitNormalizedTokens = (value: string) =>
  value
    .split(/[^a-z0-9]+/)
    .map((token) => token.trim())
    .filter(Boolean);

const containsAlias = (normalizedText: string, alias: string) => {
  const normalizedAlias = normalizeText(alias);
  if (!normalizedAlias) return false;

  if (normalizedAlias.includes(' ')) {
    return normalizedText.includes(normalizedAlias);
  }

  const tokens = splitNormalizedTokens(normalizedText);
  return tokens.includes(normalizedAlias);
};

const uniqueStrings = (items: string[]) => {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const item of items) {
    const trimmed = item.trim();
    if (!trimmed) continue;

    const normalized = normalizeText(trimmed);
    if (seen.has(normalized)) continue;

    seen.add(normalized);
    result.push(trimmed);
  }

  return result;
};

const parseEmbeddingPayload = (payload: unknown): number[] => {
  const parsed = payload as GeminiEmbeddingPayload | null;
  const values = parsed?.embedding?.values ?? parsed?.embeddings?.[0]?.values;

  if (!isNumberArray(values)) {
    throw new Error('Unable to parse embedding payload from Gemini.');
  }

  const vector = values as number[];
  if (vector.length !== EMBEDDING_DIMENSION) {
    throw new Error(`Unexpected embedding dimension: ${vector.length}. Expected ${EMBEDDING_DIMENSION}.`);
  }

  return l2Normalize(vector);
};

const parseJsonObjectFromResponse = (text: string): unknown => {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error('Gemini returned empty content for intent extraction.');
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1));
    }
    throw new Error('Unable to parse JSON from Gemini intent response.');
  }
};

const normalizeBooleanOrNull = (value: unknown): boolean | null => {
  if (typeof value === 'boolean') return value;
  if (value === null || typeof value === 'undefined') return null;

  const normalized = normalizeText(value);
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  return null;
};

const INTENT_TYPE_ALIASES: Record<Exclude<TravelIntentType, 'unknown'>, string[]> = {
  spiritual: ['tam linh', 'cung kieng', 'cau an', 'chua', 'den', 'mieu', 'nghia trang'],
  nature: ['thien nhien', 'chua lanh', 'khong khi trong lanh', 'yen tinh', 'rung', 'cao nguyen'],
  beach: ['bien', 'dao', 'bo bien', 'beach', 'coast', 'sea'],
  adventure: ['phuot', 'trek', 'hiking', 'adventure', 'mao hiem', 'kham pha'],
  food: ['am thuc', 'food', 'cuisine', 'quan an', 'dac san'],
};

const canonicalizeIntentType = (value: unknown): TravelIntentType | null => {
  const normalized = normalizeText(value);
  if (!normalized) return null;

  for (const intentType of ALLOWED_TRAVEL_INTENT_TYPES) {
    if (normalized === intentType) return intentType;
  }

  for (const [intentType, aliases] of Object.entries(INTENT_TYPE_ALIASES)) {
    if (aliases.some((alias) => containsAlias(normalized, alias))) {
      return intentType as Exclude<TravelIntentType, 'unknown'>;
    }
  }

  return null;
};

const normalizeReasoningHidden = (value: unknown): string => {
  const raw = String(value ?? '').replace(/[\n\r\t]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!raw) return '';
  return raw.slice(0, 220);
};

const canonicalizeSuggestedPlace = (value: unknown): string | null => {
  const raw = String(value ?? '').replace(/[\n\r\t]/g, ' ').trim();
  if (!raw) return null;

  const normalized = normalizeText(raw);
  if (!normalized) return null;

  return PLACE_ALIAS_TO_VIETNAMESE[normalized] ?? raw;
};

const canonicalizeGeneralKeyword = (value: unknown): string | null => {
  const raw = String(value ?? '').replace(/[\n\r\t]/g, ' ').trim();
  if (!raw) return null;

  const normalized = normalizeText(raw);
  if (!normalized) return null;

  return GENERAL_KEYWORD_ALIAS_TO_VIETNAMESE[normalized] ?? raw;
};

const normalizeSuggestedPlaces = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];

  return uniqueStrings(
    value
      .map((item) => canonicalizeSuggestedPlace(item))
      .filter((item): item is string => typeof item === 'string' && item.length > 1)
  );
};

const normalizeGeneralKeywords = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];

  return uniqueStrings(
    value
      .map((item) => canonicalizeGeneralKeyword(item))
      .filter((item): item is string => typeof item === 'string' && item.length > 1)
  );
};

const GENERAL_KEYWORD_STOPWORDS = new Set([
  'di',
  'đi',
  'du',
  'lich',
  'dulich',
  'toi',
  'tui',
  'muon',
  'can',
  'cho',
  'noi',
  'chon',
  'chỗ',
]);

const extractSemanticReasoningCue = (text: string): SemanticReasoningCue => {
  const normalized = normalizeText(text);
  if (!normalized) return {};

  let intentType: Exclude<TravelIntentType, 'unknown'> | undefined;
  const categoryHints: TravelCategoryHint[] = [];
  const generalKeywords: string[] = [];
  const suggestedPlaces: string[] = [];
  const reasoningHints: string[] = [];

  for (const [cueAlias, cueValue] of Object.entries(SEMANTIC_REASONING_CUES)) {
    if (!containsAlias(normalized, cueAlias)) continue;

    if (!intentType && cueValue.intentType) {
      intentType = cueValue.intentType;
    }
    categoryHints.push(...(cueValue.categoryHints ?? []));
    generalKeywords.push(...(cueValue.generalKeywords ?? []));
    suggestedPlaces.push(...(cueValue.suggestedPlaces ?? []));
    if (cueValue.reasoningHint) {
      reasoningHints.push(cueValue.reasoningHint);
    }
  }

  return {
    intentType,
    categoryHints: uniqueStrings(categoryHints) as TravelCategoryHint[],
    generalKeywords: uniqueStrings(generalKeywords),
    suggestedPlaces: uniqueStrings(suggestedPlaces),
    reasoningHint: uniqueStrings(reasoningHints).join(' '),
  };
};

const inferGeneralKeywordsFromText = (queryText: string): string[] => {
  return uniqueStrings(
    String(queryText ?? '')
      .split(/\s+/)
      .map((item) => item.replace(/[.,!?;:()\[\]{}"']/g, ' ').trim())
      .map((item) => canonicalizeGeneralKeyword(item))
      .filter((item): item is string => typeof item === 'string' && item.length > 1)
      .filter((item) => !GENERAL_KEYWORD_STOPWORDS.has(normalizeText(item)))
  );
};

const inferIntentTypeFromText = (input: {
  queryText: string;
  semanticCue: SemanticReasoningCue;
  parsedCategoryHints: TravelCategoryHint[];
  parsedSuggestedPlaces: string[];
}): TravelIntentType => {
  if (input.semanticCue.intentType) return input.semanticCue.intentType;

  const normalizedQuery = normalizeText(input.queryText);
  for (const [intentType, aliases] of Object.entries(INTENT_TYPE_ALIASES)) {
    if (aliases.some((alias) => containsAlias(normalizedQuery, alias))) {
      return intentType as Exclude<TravelIntentType, 'unknown'>;
    }
  }

  const categoryJoined = normalizeText(input.parsedCategoryHints.join(' '));
  if (containsAlias(categoryJoined, 'van hoa')) return 'spiritual';
  if (containsAlias(categoryJoined, 'am thuc')) return 'food';
  if (containsAlias(categoryJoined, 'mao hiem')) return 'adventure';
  if (containsAlias(categoryJoined, 'thien nhien')) return 'nature';

  const placeJoined = normalizeText(input.parsedSuggestedPlaces.join(' '));
  if (
    SPIRITUAL_REQUIRED_TOKENS.some((token) => containsAlias(placeJoined, token))
  ) {
    return 'spiritual';
  }

  if (placeJoined.includes('beach') || placeJoined.includes('bien')) return 'beach';

  return 'unknown';
};

const canonicalizeCategoryHint = (value: unknown): TravelCategoryHint | null => {
  const normalized = normalizeText(value);
  if (!normalized) return null;

  for (const hint of ALLOWED_TRAVEL_CATEGORY_HINTS) {
    if (normalized === normalizeText(hint)) return hint;

    const aliases = CATEGORY_HINT_ALIASES[hint] ?? [];
    if (aliases.some((alias) => containsAlias(normalized, alias))) {
      return hint;
    }
  }

  return null;
};

const inferCategoryHintsFromText = (text: string): TravelCategoryHint[] => {
  const inferred: TravelCategoryHint[] = [];
  const normalized = normalizeText(text);
  if (!normalized) return inferred;

  for (const hint of ALLOWED_TRAVEL_CATEGORY_HINTS) {
    const aliases = CATEGORY_HINT_ALIASES[hint] ?? [];
    if (aliases.some((alias) => containsAlias(normalized, alias))) {
      inferred.push(hint);
    }
  }

  return uniqueStrings(inferred) as TravelCategoryHint[];
};

const normalizeCategoryHints = (value: unknown): TravelCategoryHint[] => {
  if (!Array.isArray(value)) return [];

  const normalized: TravelCategoryHint[] = [];
  for (const item of value) {
    const canonical = canonicalizeCategoryHint(item);
    if (!canonical) continue;
    normalized.push(canonical);
  }

  return uniqueStrings(normalized) as TravelCategoryHint[];
};

const inferSuggestedPlacesFromText = (text: string): string[] => {
  const normalized = normalizeText(text);
  if (!normalized) return [];

  const inferred: string[] = [];
  for (const [alias, place] of Object.entries(PLACE_ALIAS_TO_VIETNAMESE)) {
    if (containsAlias(normalized, alias)) {
      inferred.push(place);
    }
  }

  return uniqueStrings(inferred);
};

const inferSuggestedPlacesFromCategoryHints = (hints: TravelCategoryHint[]): string[] => {
  const places = hints.flatMap((hint) => CATEGORY_HINT_DEFAULT_PLACES[hint] ?? []);
  return uniqueStrings(places);
};

const inferCategoryHintsFromIntentType = (intentType: TravelIntentType): TravelCategoryHint[] => {
  return INTENT_TYPE_DEFAULT_CATEGORY_HINTS[intentType] ?? [];
};

const inferSuggestedPlacesFromIntentType = (intentType: TravelIntentType): string[] => {
  return INTENT_TYPE_DEFAULT_PLACES[intentType] ?? [];
};

const inferGeneralKeywordsFromCategoryHints = (hints: TravelCategoryHint[]): string[] => {
  const keywords = hints.flatMap((hint) => CATEGORY_HINT_DEFAULT_GENERAL_KEYWORDS[hint] ?? []);
  return uniqueStrings(keywords);
};

const isFreshAirIntent = (queryText: string, semanticCue: SemanticReasoningCue): boolean => {
  if (semanticCue.intentType === 'nature') {
    const cueText = normalizeText((semanticCue.generalKeywords ?? []).join(' '));
    if (containsAlias(cueText, 'khong khi trong lanh') || containsAlias(cueText, 'chua lanh')) {
      return true;
    }
  }

  const normalizedQuery = normalizeText(queryText);
  return (
    containsAlias(normalizedQuery, 'khong khi trong lanh') ||
    containsAlias(normalizedQuery, 'chua lanh') ||
    containsAlias(normalizedQuery, 'fresh air') ||
    containsAlias(normalizedQuery, 'yen tinh')
  );
};

const prioritizeSpiritualPlaces = (places: string[]) => {
  const mustPlaces = INTENT_TYPE_DEFAULT_PLACES.spiritual;

  const placeByTokenMatch = (token: string) =>
    places.filter((place) => containsAlias(normalizeText(place), token));

  const matchedSpiritualPlaces = uniqueStrings(
    SPIRITUAL_REQUIRED_TOKENS.flatMap((token) => placeByTokenMatch(token))
  );

  return uniqueStrings([...mustPlaces, ...matchedSpiritualPlaces, ...places]);
};

const prioritizeFreshAirPlaces = (places: string[]) => {
  const highAltitudeForestPriority = ['Sa Pa', 'Hà Giang', 'Măng Đen', 'Bảo Lộc', 'Tà Xùa'];
  return uniqueStrings([...highAltitudeForestPriority, ...places]);
};

const resolvePlaceRegion = (place: string): VietnamRegion | null => {
  const normalizedPlace = normalizeText(place);
  for (const [key, region] of Object.entries(PLACE_REGION_MAP)) {
    if (containsAlias(normalizedPlace, key)) {
      return region;
    }
  }

  return null;
};

const ensureRegionalDiversity = (places: string[], intentType: TravelIntentType): string[] => {
  const requiredRegions: VietnamRegion[] = ['north', 'central', 'south'];
  const dedupedPlaces = uniqueStrings(places);

  const pickPlaceForRegion = (region: VietnamRegion) => {
    for (const place of dedupedPlaces) {
      if (resolvePlaceRegion(place) === region) return place;
    }

    const intentDefaults = inferSuggestedPlacesFromIntentType(intentType);
    for (const place of intentDefaults) {
      if (resolvePlaceRegion(place) === region) return place;
    }

    for (const place of REGION_ROTATION_FALLBACK[region]) {
      if (resolvePlaceRegion(place) === region) return place;
    }

    return null;
  };

  const regionalAnchors = requiredRegions
    .map((region) => pickPlaceForRegion(region))
    .filter((item): item is string => typeof item === 'string' && item.length > 1);

  const merged = uniqueStrings([
    ...regionalAnchors,
    ...dedupedPlaces,
    ...inferSuggestedPlacesFromIntentType(intentType),
    ...REGION_ROTATION_FALLBACK.north,
    ...REGION_ROTATION_FALLBACK.central,
    ...REGION_ROTATION_FALLBACK.south,
  ]);

  return merged;
};

const ensureGeneralKeywordsLength = (keywords: string[], categoryHints: TravelCategoryHint[]): string[] => {
  let merged = uniqueStrings(keywords);
  if (merged.length < 3) {
    merged = uniqueStrings([...merged, ...inferGeneralKeywordsFromCategoryHints(categoryHints)]);
  }

  if (merged.length < 3) {
    merged = uniqueStrings([...merged, 'đẹp', 'phù hợp vibe', 'dễ trải nghiệm']);
  }

  return merged.slice(0, 4);
};

const ensureSuggestedPlacesLength = (places: string[], categoryHints: TravelCategoryHint[]): string[] => {
  let merged = uniqueStrings(places);
  if (merged.length < 5) {
    merged = uniqueStrings([...merged, ...inferSuggestedPlacesFromCategoryHints(categoryHints)]);
  }

  if (merged.length < 5) {
    merged = uniqueStrings([...merged, 'Sa Pa', 'Huế', 'Cần Thơ', 'Hà Giang', 'Măng Đen']);
  }

  return merged.slice(0, 7);
};

const buildReasoningHidden = (input: {
  parsedReasoning: string;
  intentType: TravelIntentType;
  places: string[];
  semanticCue: SemanticReasoningCue;
}): string => {
  if (input.parsedReasoning) return input.parsedReasoning;

  const topPlaces = input.places.slice(0, 2);
  const placePhrase = topPlaces.length > 0 ? topPlaces.join(' và ') : 'các điểm đến đã chọn';

  if (input.intentType === 'spiritual') {
    return `Chọn ${placePhrase} vì phù hợp nhu cầu tâm linh, lễ bái và tưởng niệm.`;
  }

  if (input.intentType === 'nature') {
    return `Chọn ${placePhrase} vì có khí hậu trong lành, thiên nhiên thư giãn và ít ồn ào.`;
  }

  if (input.intentType === 'beach') {
    return `Chọn ${placePhrase} vì phù hợp trải nghiệm biển, cảnh đẹp và nghỉ ngơi.`;
  }

  if (input.intentType === 'adventure') {
    return `Chọn ${placePhrase} vì phù hợp nhu cầu khám phá, vận động và trải nghiệm mới.`;
  }

  if (input.intentType === 'food') {
    return `Chọn ${placePhrase} vì nổi bật về đặc sản địa phương và trải nghiệm ẩm thực.`;
  }

  if (input.semanticCue.reasoningHint) {
    return input.semanticCue.reasoningHint;
  }

  return `Chọn ${placePhrase} vì phù hợp ý định du lịch đã suy luận từ truy vấn.`;
};

const normalizeTravelIntentPayload = (payload: unknown, queryText: string): TravelSearchIntentResult => {
  const parsed = (payload ?? {}) as Record<string, unknown>;

  const parsedSuggestedPlaces = normalizeSuggestedPlaces(parsed.ai_suggested_places);
  const parsedGeneralKeywords = normalizeGeneralKeywords(parsed.general_keywords);
  const parsedIntentType = canonicalizeIntentType(parsed.intent_type);
  const parsedReasoningHidden = normalizeReasoningHidden(parsed.reasoning_hidden);
  const semanticCue = extractSemanticReasoningCue(
    `${queryText} ${parsedSuggestedPlaces.join(' ')} ${parsedGeneralKeywords.join(' ')}`
  );
  const parsedCategoryHints = normalizeCategoryHints(parsed.category_hints);

  const inferredIntentType = inferIntentTypeFromText({
    queryText,
    semanticCue,
    parsedCategoryHints,
    parsedSuggestedPlaces,
  });

  const resolvedIntentType = parsedIntentType ?? inferredIntentType;

  const inferredCategoryHints = inferCategoryHintsFromText(
    `${queryText} ${parsedSuggestedPlaces.join(' ')} ${parsedGeneralKeywords.join(' ')} ${(semanticCue.generalKeywords ?? []).join(' ')}`
  );

  const categoryHints = uniqueStrings([
    ...parsedCategoryHints,
    ...(semanticCue.categoryHints ?? []),
    ...inferCategoryHintsFromIntentType(resolvedIntentType),
    ...inferredCategoryHints,
  ]) as TravelCategoryHint[];

  const inferredPlacesFromText = inferSuggestedPlacesFromText(
    `${queryText} ${(semanticCue.generalKeywords ?? []).join(' ')} ${categoryHints.join(' ')}`
  );

  const aiSuggestedPlaces = ensureSuggestedPlacesLength([
    ...parsedSuggestedPlaces,
    ...(semanticCue.suggestedPlaces ?? []),
    ...inferredPlacesFromText,
    ...inferSuggestedPlacesFromIntentType(resolvedIntentType),
  ], categoryHints);

  let finalSuggestedPlaces = aiSuggestedPlaces;
  if (resolvedIntentType === 'spiritual') {
    finalSuggestedPlaces = prioritizeSpiritualPlaces(finalSuggestedPlaces);
  }

  if (isFreshAirIntent(queryText, semanticCue)) {
    finalSuggestedPlaces = prioritizeFreshAirPlaces(finalSuggestedPlaces);
  }

  finalSuggestedPlaces = ensureSuggestedPlacesLength(finalSuggestedPlaces, categoryHints);
  finalSuggestedPlaces = ensureRegionalDiversity(finalSuggestedPlaces, resolvedIntentType).slice(0, 7);

  const generalKeywords = ensureGeneralKeywordsLength([
    ...parsedGeneralKeywords,
    ...(semanticCue.generalKeywords ?? []),
    ...inferGeneralKeywordsFromText(queryText),
  ], categoryHints);

  const inferredTravelRelated =
    resolvedIntentType !== 'unknown' ||
    categoryHints.length > 0 ||
    generalKeywords.length > 0 ||
    finalSuggestedPlaces.length > 0;

  const resolvedIsTravelRelated =
    typeof parsed.is_travel_related === 'boolean'
      ? (parsed.is_travel_related || inferredTravelRelated)
      : inferredTravelRelated;

  if (!resolvedIsTravelRelated) {
    return {
      is_travel_related: false,
      intent_type: 'unknown',
      is_free: normalizeBooleanOrNull(parsed.is_free),
      category_hints: [],
      ai_suggested_places: [],
      reasoning_hidden: '',
    };
  }

  const reasoning_hidden = buildReasoningHidden({
    parsedReasoning: parsedReasoningHidden,
    intentType: resolvedIntentType,
    places: finalSuggestedPlaces,
    semanticCue,
  });

  return {
    is_travel_related: true,
    intent_type: resolvedIntentType,
    is_free: normalizeBooleanOrNull(parsed.is_free),
    category_hints: categoryHints,
    ai_suggested_places: finalSuggestedPlaces,
    reasoning_hidden,
  };
};

const buildIntentUserPrompt = (queryText: string, currentLanguage: SmartSearchLanguageCode) => `
Phân tích truy vấn du lịch sau bằng semantic reasoning và trả về JSON đúng schema. Hãy đóng vai Master Vietnamese Travel Expert:

current_language: "${currentLanguage}"

Truy vấn người dùng: "${queryText}"

Nhắc lại schema:
{
  "is_travel_related": boolean,
  "intent_type": "spiritual" | "nature" | "beach" | "adventure" | "food" | "unknown",
  "is_free": boolean | null,
  "category_hints": string[],
  "ai_suggested_places": string[],
  "reasoning_hidden": string
}

Lưu ý:
- Truy vấn người dùng có thể ở tiếng Việt, English hoặc Japanese.
- category_hints chỉ chọn từ danh sách hợp lệ đã nêu.
- intent_type phải phản ánh đúng mục đích chính của truy vấn.
- ai_suggested_places phải có 5-7 địa danh nổi tiếng Việt Nam, dùng ngôn ngữ theo current_language.
- Bắt buộc đa dạng vùng miền: ít nhất 1 địa danh Bắc, 1 Trung, 1 Nam.
- Với "cúng kiếng"/"tâm linh": ưu tiên Chùa, Đền, Miếu, Nghĩa trang liệt sĩ.
- Với "không khí trong lành"/"chữa lành": ưu tiên Sa Pa, Hà Giang, Măng Đen, Bảo Lộc.
- reasoning_hidden là 1 câu ngắn giải thích lý do chọn địa điểm, dùng ngôn ngữ theo current_language.
- Không thêm field khác.
`;

const inferIsFreeFromQuery = (queryText: string): boolean | null => {
  const normalized = normalizeText(queryText);
  if (!normalized) return null;

  if (/(mien phi|free|tiet kiem|gia re|budget)/.test(normalized)) return true;
  if (/(cao cap|sang|luxury|resort)/.test(normalized)) return false;
  return null;
};

const buildFallbackTravelIntent = (queryText: string): TravelSearchIntentResult => {
  const semanticCue = extractSemanticReasoningCue(queryText);
  const inferredIntentType = inferIntentTypeFromText({
    queryText,
    semanticCue,
    parsedCategoryHints: [],
    parsedSuggestedPlaces: [],
  });

  const mergedCategoryHints = uniqueStrings([
    ...inferCategoryHintsFromText(queryText),
    ...(semanticCue.categoryHints ?? []),
    ...inferCategoryHintsFromIntentType(inferredIntentType),
  ]) as TravelCategoryHint[];

  let ai_suggested_places = ensureSuggestedPlacesLength([
    ...(semanticCue.suggestedPlaces ?? []),
    ...inferSuggestedPlacesFromText(queryText),
    ...inferSuggestedPlacesFromIntentType(inferredIntentType),
  ], mergedCategoryHints);

  if (inferredIntentType === 'spiritual') {
    ai_suggested_places = prioritizeSpiritualPlaces(ai_suggested_places);
  }

  if (isFreshAirIntent(queryText, semanticCue)) {
    ai_suggested_places = prioritizeFreshAirPlaces(ai_suggested_places);
  }

  ai_suggested_places = ensureRegionalDiversity(ai_suggested_places, inferredIntentType).slice(0, 7);

  const isTravelRelated =
    inferredIntentType !== 'unknown' ||
    mergedCategoryHints.length > 0 ||
    ai_suggested_places.length > 0;

  const intentType = isTravelRelated ? inferredIntentType : 'unknown';

  const reasoning_hidden = isTravelRelated
    ? buildReasoningHidden({
        parsedReasoning: normalizeReasoningHidden(semanticCue.reasoningHint),
        intentType,
        places: ai_suggested_places,
        semanticCue,
      })
    : '';

  return {
    is_travel_related: isTravelRelated,
    intent_type: intentType,
    is_free: inferIsFreeFromQuery(queryText),
    category_hints: mergedCategoryHints,
    ai_suggested_places,
    reasoning_hidden,
  };
};

const getGeminiApiKey = () =>
  process.env.EXPO_PUBLIC_GEMINI_API_KEY?.trim() || process.env.GEMINI_API_KEY?.trim() || '';

export async function extractTravelSearchIntent(
  queryText: string,
  options: ExtractTravelSearchIntentOptions = {}
): Promise<TravelSearchIntentResult> {
  const trimmedQuery = String(queryText ?? '').trim();
  const currentLanguage = normalizeSmartSearchLanguageCode(options.currentLanguage);

  if (!trimmedQuery) {
    return {
      is_travel_related: false,
      intent_type: 'unknown',
      is_free: null,
      category_hints: [],
      ai_suggested_places: [],
      reasoning_hidden: '',
    };
  }

  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw new Error('Missing Gemini API key. Set EXPO_PUBLIC_GEMINI_API_KEY (or GEMINI_API_KEY).');
  }

  const client = new GoogleGenerativeAI(apiKey);
  const model = client.getGenerativeModel({
    model: GEMINI_INTENT_MODEL,
    systemInstruction: buildSmartSearchSystemInstruction(currentLanguage),
  });

  let lastError: unknown = null;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const result = await model.generateContent({
        generationConfig: {
          temperature: 0,
          maxOutputTokens: 512,
          responseMimeType: 'application/json',
        },
        contents: [
          {
            role: 'user',
            parts: [{ text: buildIntentUserPrompt(trimmedQuery, currentLanguage) }],
          },
        ],
      });

      const rawText = result.response.text();
      const payload = parseJsonObjectFromResponse(rawText);
      return normalizeTravelIntentPayload(payload, trimmedQuery);
    } catch (err) {
      lastError = err;
    }
  }

  const reason = String((lastError as any)?.message ?? '').trim() || 'Unable to extract intent from Gemini.';
  console.warn('extractTravelSearchIntent fallback activated:', reason);
  return buildFallbackTravelIntent(trimmedQuery);
}

const parseJsonArrayFromResponse = (text: string): unknown[] => {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error('Gemini returned empty translation content.');
  }

  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) return parsed;
    if (Array.isArray((parsed as any)?.translations)) {
      return (parsed as any).translations as unknown[];
    }
  } catch {
    // Parse fallback continues below.
  }

  const arrayStart = trimmed.indexOf('[');
  const arrayEnd = trimmed.lastIndexOf(']');
  if (arrayStart >= 0 && arrayEnd > arrayStart) {
    const parsed = JSON.parse(trimmed.slice(arrayStart, arrayEnd + 1));
    if (Array.isArray(parsed)) return parsed;
  }

  throw new Error('Unable to parse JSON array from Gemini translation response.');
};

const buildTranslationPrompt = (texts: string[], fromLanguage: SmartSearchLanguageCode, toLanguage: SmartSearchLanguageCode) =>
  `Translate the following travel UI strings from ${fromLanguage} to ${toLanguage}.
Return ONLY a JSON array of translated strings in the same order and same length.
Do not add numbering, comments, markdown, or extra fields.

Input JSON array:
${JSON.stringify(texts)}`;

export async function translateSmartSearchTexts(
  texts: string[],
  options: TranslateSmartSearchTextOptions = {}
): Promise<string[]> {
  const normalizedTexts = texts.map((value) => String(value ?? '').trim());
  if (normalizedTexts.length === 0) return [];

  const fromLanguage = normalizeSmartSearchLanguageCode(options.fromLanguage);
  const toLanguage = normalizeSmartSearchLanguageCode(options.toLanguage);

  if (fromLanguage === toLanguage) {
    return normalizedTexts;
  }

  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw new Error('Missing Gemini API key. Set EXPO_PUBLIC_GEMINI_API_KEY (or GEMINI_API_KEY).');
  }

  const client = new GoogleGenerativeAI(apiKey);
  const model = client.getGenerativeModel({ model: GEMINI_INTENT_MODEL });

  let lastError: unknown = null;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const result = await model.generateContent({
        generationConfig: {
          temperature: 0,
          maxOutputTokens: 1024,
          responseMimeType: 'application/json',
        },
        contents: [
          {
            role: 'user',
            parts: [{ text: buildTranslationPrompt(normalizedTexts, fromLanguage, toLanguage) }],
          },
        ],
      });

      const translated = parseJsonArrayFromResponse(result.response.text()).map((value) =>
        String(value ?? '').trim()
      );

      if (translated.length !== normalizedTexts.length) {
        throw new Error('Translation response length mismatch.');
      }

      return translated.map((value, index) => value || normalizedTexts[index]);
    } catch (error) {
      lastError = error;
    }
  }

  const reason = String((lastError as any)?.message ?? '').trim() || 'Unable to translate smart search text.';
  throw new Error(reason);
}

export async function generateEmbedding(text: string): Promise<number[]> {
  const queryText = String(text ?? '').trim();
  if (!queryText) {
    throw new Error('Text is required to generate embedding.');
  }

  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw new Error('Missing Gemini API key. Set EXPO_PUBLIC_GEMINI_API_KEY (or GEMINI_API_KEY).');
  }

  const abortController = new AbortController();
  const timeout = setTimeout(() => {
    abortController.abort();
  }, EMBEDDING_TIMEOUT_MS);

  try {
    const response = await fetch(`${GEMINI_EMBEDDING_ENDPOINT}?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        model: `models/${GEMINI_EMBEDDING_MODEL}`,
        content: {
          parts: [{ text: queryText }],
        },
        taskType: 'RETRIEVAL_QUERY',
        outputDimensionality: EMBEDDING_DIMENSION,
      }),
      signal: abortController.signal,
    });

    const payload = (await response.json().catch(() => null)) as unknown;

    if (!response.ok) {
      const providerMessage =
        String((payload as GeminiErrorPayload | null)?.error?.message ?? '').trim() ||
        `Gemini embedding request failed with status ${response.status}.`;
      throw new Error(providerMessage);
    }

    return parseEmbeddingPayload(payload);
  } catch (err: any) {
    const reason = String(err?.message ?? '').trim() || 'Unable to generate embedding from provider.';
    console.warn('generateEmbedding failed:', reason);
    throw new Error(reason);
  } finally {
    clearTimeout(timeout);
  }
}
