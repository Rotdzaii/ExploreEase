export const SMART_SEARCH_SUPPORTED_LANGUAGES = ['vi', 'en', 'ja'] as const;

export type SmartSearchSupportedLanguage = (typeof SMART_SEARCH_SUPPORTED_LANGUAGES)[number];

export const smartSearchResources = {
  vi: {
    smartSearch: {
      languageLabel: 'Ngôn ngữ Smart Search',
      languageVi: 'Tiếng Việt',
      languageEn: 'English',
      searchLabel: 'Tìm kiếm thông minh',
      searchPlaceholder: 'Mô tả điểm đến bạn muốn...',
      submit: 'Tìm',
      price: 'Giá',
      rating: 'Đánh giá',
      free: 'Miễn phí',
      paid: 'Có phí',
      translatingResults: 'Đang chuyển ngữ kết quả...',
      usingLocalizedColumns: 'Đang dùng dữ liệu đa ngôn ngữ từ hệ thống.',
      fallbackTranslation: 'Đang dịch tạm thời bằng AI cho kết quả hiển thị.',
    },
  },
  en: {
    smartSearch: {
      languageLabel: 'Smart Search language',
      languageVi: 'Vietnamese',
      languageEn: 'English',
      searchLabel: 'Smart search',
      searchPlaceholder: 'Describe where you want to go...',
      submit: 'Search',
      price: 'Price',
      rating: 'Rating',
      free: 'Free',
      paid: 'Paid',
      translatingResults: 'Translating result content...',
      usingLocalizedColumns: 'Using localized columns from data source.',
      fallbackTranslation: 'Using AI fallback translation for displayed content.',
    },
  },
  ja: {
    smartSearch: {
      languageLabel: 'スマート検索の言語',
      languageVi: 'ベトナム語',
      languageEn: '英語',
      searchLabel: 'スマート検索',
      searchPlaceholder: '行きたい場所を入力してください...',
      submit: '検索',
      price: '料金',
      rating: '評価',
      free: '無料',
      paid: '有料',
      translatingResults: '検索結果を翻訳しています...',
      usingLocalizedColumns: 'データソースの多言語カラムを使用しています。',
      fallbackTranslation: '表示用にAI翻訳フォールバックを使用しています。',
    },
  },
} as const;
