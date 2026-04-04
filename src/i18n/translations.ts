import type { AppLanguage } from '@/src/store/useLanguageStore';

type TranslationParams = Record<string, string | number>;

const dictionaries: Record<AppLanguage, Record<string, string>> = {
  vi: {
    'common.notification': 'Thong bao',
    'common.cancel': 'Huy',
    'common.login': 'Dang nhap',
    'common.loginRequiredTitle': 'Can dang nhap',

    'language.vi': 'Tieng Viet',
    'language.en': 'English',
    'language.selectTitle': 'Chon ngon ngu',
    'language.selectSubtitle': 'Ung dung se uu tien ngon ngu da chon cho cac man hinh da ho tro.',
    'language.changeSuccess': 'Da cap nhat ngon ngu.',

    'recommendation.timing.title': 'Thoi diem goi y',
    'recommendation.timing.subtitle': 'Ca nhan hoa goi y theo khoang thoi gian ban uu tien.',
    'recommendation.timing.auto': 'Tu dong',
    'recommendation.timing.morning': 'Buoi sang',
    'recommendation.timing.afternoon': 'Buoi chieu',
    'recommendation.timing.evening': 'Buoi toi',
    'recommendation.timing.night': 'Ban dem',

    'recommendation.suggestions.title': 'Goi y danh cho ban',
    'recommendation.suggestions.subtitleTailored': 'Phu hop voi {timeOfDay}',
    'recommendation.suggestions.subtitleTailoredWithStyle': 'Phu hop voi {timeOfDay} • {travelStyle}',
    'recommendation.suggestions.subtitleDestination': 'Lua chon tuong tu cho dia diem nay',
    'recommendation.suggestions.subtitleEvent': 'Lua chon tuong tu cho su kien nay',
    'recommendation.suggestions.loading': 'Dang tao goi y ca nhan...',
    'recommendation.suggestions.empty': 'Chua co goi y ca nhan.',
    'recommendation.suggestions.reasonFallback': 'Goi y danh cho ban',
    'recommendation.suggestions.kindEvent': 'Su kien',
    'recommendation.suggestions.kindPlace': 'Dia diem',

    'recommendation.travelStyle.solo': 'du lich mot minh',
    'recommendation.travelStyle.family': 'du lich gia dinh',
    'recommendation.travelStyle.group': 'du lich nhom',

    'review.form.rating': 'So sao',
    'review.form.comment': 'Nhan xet',
    'review.form.commentPlaceholder': 'Chia se trai nghiem cua ban...',
    'review.form.photos': 'Anh danh gia',
    'review.form.pickPhotos': 'Chon anh tu thu vien',
    'review.form.selectedPhotos': 'Da chon {count}/{max} anh',
    'review.form.uploading': 'Dang tai anh...',
    'review.form.submitting': 'Dang gui...',
    'review.form.submit': 'Gui danh gia',

    'review.validation.maxPhotos': 'Da dat gioi han anh. Ban chi co the dinh kem toi da {max} anh.',
    'review.validation.photoPermission': 'Thieu quyen truy cap thu vien anh de dinh kem anh danh gia.',
    'review.validation.missingDestination': 'Khong the gui danh gia vi thieu destination_id.',
    'review.validation.missingEvent': 'Khong the gui danh gia vi thieu event_id.',
    'review.validation.loginRequired': 'Vui long dang nhap de gui danh gia.',
    'review.validation.invalidRating': 'Diem danh gia khong hop le.',
    'review.validation.reportReasonRequired': 'Vui long nhap ly do bao cao.',
    'review.validation.replyRequired': 'Vui long nhap noi dung phan hoi.',

    'review.auth.helpfulRequired': 'Vui long dang nhap de danh dau danh gia huu ich.',
    'review.auth.reportRequired': 'Vui long dang nhap de bao cao danh gia.',
    'review.auth.replyRequired': 'Vui long dang nhap de phan hoi danh gia.',

    'review.success.submitDestination': 'Da gui danh gia dia diem.',
    'review.success.submitEvent': 'Da gui danh gia su kien.',
    'review.success.reportDestination': 'Da gui bao cao danh gia.',
    'review.success.reportEvent': 'Da gui bao cao danh gia su kien.',
    'review.success.replyDestination': 'Da phan hoi danh gia.',
    'review.success.replyEvent': 'Da phan hoi danh gia su kien.',

    'review.error.uploadTimeout': 'Tai anh qua lau. Vui long thu lai.',
    'review.error.uploadFailed': 'Khong the tai anh danh gia.',
    'review.error.submitFailed': 'Khong the gui danh gia. {reason}',
    'review.error.rlsBlocked': 'Khong the luu danh gia do chinh sach truy cap (RLS).',
    'review.error.genericTryAgain': 'Vui long thu lai sau.',
    'review.error.updateHelpful': 'Khong the cap nhat danh dau huu ich.',
    'review.error.reportFailed': 'Khong the gui bao cao. {reason}',
    'review.error.replyNoPermission': 'Ban khong co quyen phan hoi danh gia nay.',
    'review.error.replyFailed': 'Khong the phan hoi danh gia. {reason}',

    'review.card.anonymous': 'An danh',
    'review.card.noComment': '(Khong co binh luan)',
    'review.card.helpful': 'Huu ich ({count})',
    'review.card.report': 'Bao cao',
    'review.card.replyAdmin': 'Phan hoi tu quan tri vien',
    'review.card.replyEdit': 'Cap nhat phan hoi',
    'review.card.replyCreate': 'Phan hoi danh gia',
    'review.card.replyPlaceholderCreate': 'Nhap phan hoi...',
    'review.card.replyPlaceholderEdit': 'Nhap phan hoi moi...',
    'review.card.replySending': 'Dang gui...',
    'review.card.replySubmitCreate': 'Gui phan hoi',
    'review.card.replySubmitEdit': 'Cap nhat phan hoi',

    'review.report.title': 'Bao cao danh gia',
    'review.report.description': 'Vui long mo ta ly do de doi ngu kiem duyet xem xet.',
    'review.report.placeholder': 'Vi du: Noi dung xuc pham, spam, thong tin sai lech...',
    'review.report.submit': 'Gui bao cao',

    'review.distribution.stars': '{star} sao',

    'review.sort.newest': 'Moi nhat',
    'review.sort.highest': 'Diem cao',
    'review.sort.lowest': 'Diem thap',
    'review.sort.helpful': 'Huu ich nhat',

    'review.section.title': 'Danh gia',
    'review.section.titleEvent': 'Danh gia su kien',
    'review.section.summary': '⭐ {rating}/5 • {count} danh gia',
    'review.section.write': 'Viet danh gia',
    'review.section.cancel': 'Huy',
    'review.section.loading': 'Dang tai danh gia...',
    'review.section.emptyEvent': 'Chua co danh gia nao cho su kien nay.',
    'review.section.loadMore': 'Xem them danh gia',
  },
  en: {
    'common.notification': 'Notification',
    'common.cancel': 'Cancel',
    'common.login': 'Sign In',
    'common.loginRequiredTitle': 'Sign in required',

    'language.vi': 'Vietnamese',
    'language.en': 'English',
    'language.selectTitle': 'Choose Language',
    'language.selectSubtitle': 'The app will prioritize your selected language for supported screens.',
    'language.changeSuccess': 'Language updated.',

    'recommendation.timing.title': 'Recommendation timing',
    'recommendation.timing.subtitle': 'Personalize recommendations by your preferred moment',
    'recommendation.timing.auto': 'Auto',
    'recommendation.timing.morning': 'Morning',
    'recommendation.timing.afternoon': 'Afternoon',
    'recommendation.timing.evening': 'Evening',
    'recommendation.timing.night': 'Night',

    'recommendation.suggestions.title': 'You might also like',
    'recommendation.suggestions.subtitleTailored': 'Tailored for {timeOfDay}',
    'recommendation.suggestions.subtitleTailoredWithStyle': 'Tailored for {timeOfDay} • {travelStyle}',
    'recommendation.suggestions.subtitleDestination': 'Similar picks for this destination',
    'recommendation.suggestions.subtitleEvent': 'Similar picks for this event',
    'recommendation.suggestions.loading': 'Building personalized picks...',
    'recommendation.suggestions.empty': 'No personalized suggestions yet.',
    'recommendation.suggestions.reasonFallback': 'Personalized for you',
    'recommendation.suggestions.kindEvent': 'Event',
    'recommendation.suggestions.kindPlace': 'Place',

    'recommendation.travelStyle.solo': 'solo travel',
    'recommendation.travelStyle.family': 'family trips',
    'recommendation.travelStyle.group': 'group trips',

    'review.form.rating': 'Rating',
    'review.form.comment': 'Comment',
    'review.form.commentPlaceholder': 'Share your experience...',
    'review.form.photos': 'Review Photos',
    'review.form.pickPhotos': 'Choose from library',
    'review.form.selectedPhotos': 'Selected {count}/{max} photos',
    'review.form.uploading': 'Uploading photos...',
    'review.form.submitting': 'Submitting...',
    'review.form.submit': 'Submit Review',

    'review.validation.maxPhotos': 'Photo limit reached. You can attach up to {max} photos.',
    'review.validation.photoPermission': 'Photo library permission is required to attach review images.',
    'review.validation.missingDestination': 'Cannot submit review: missing destination_id.',
    'review.validation.missingEvent': 'Cannot submit review: missing event_id.',
    'review.validation.loginRequired': 'Please sign in to submit a review.',
    'review.validation.invalidRating': 'Invalid rating value.',
    'review.validation.reportReasonRequired': 'Please enter a report reason.',
    'review.validation.replyRequired': 'Please enter a reply.',

    'review.auth.helpfulRequired': 'Please sign in to mark a review as helpful.',
    'review.auth.reportRequired': 'Please sign in to report a review.',
    'review.auth.replyRequired': 'Please sign in to reply to a review.',

    'review.success.submitDestination': 'Destination review submitted.',
    'review.success.submitEvent': 'Event review submitted.',
    'review.success.reportDestination': 'Review report submitted.',
    'review.success.reportEvent': 'Event review report submitted.',
    'review.success.replyDestination': 'Review reply submitted.',
    'review.success.replyEvent': 'Event review reply submitted.',

    'review.error.uploadTimeout': 'Image upload timed out. Please try again.',
    'review.error.uploadFailed': 'Failed to upload review images.',
    'review.error.submitFailed': 'Unable to submit review. {reason}',
    'review.error.rlsBlocked': 'Unable to save review due to access policy (RLS).',
    'review.error.genericTryAgain': 'Please try again later.',
    'review.error.updateHelpful': 'Unable to update helpful vote.',
    'review.error.reportFailed': 'Unable to submit report. {reason}',
    'review.error.replyNoPermission': 'You do not have permission to reply to this review.',
    'review.error.replyFailed': 'Unable to submit reply. {reason}',

    'review.card.anonymous': 'Anonymous',
    'review.card.noComment': '(No comment)',
    'review.card.helpful': 'Helpful ({count})',
    'review.card.report': 'Report',
    'review.card.replyAdmin': 'Reply from admin',
    'review.card.replyEdit': 'Update reply',
    'review.card.replyCreate': 'Reply to review',
    'review.card.replyPlaceholderCreate': 'Enter reply...',
    'review.card.replyPlaceholderEdit': 'Enter updated reply...',
    'review.card.replySending': 'Sending...',
    'review.card.replySubmitCreate': 'Send reply',
    'review.card.replySubmitEdit': 'Update reply',

    'review.report.title': 'Report Review',
    'review.report.description': 'Please describe the reason so moderators can review it.',
    'review.report.placeholder': 'Example: abusive content, spam, misleading information...',
    'review.report.submit': 'Submit report',

    'review.distribution.stars': '{star} stars',

    'review.sort.newest': 'Newest',
    'review.sort.highest': 'Highest',
    'review.sort.lowest': 'Lowest',
    'review.sort.helpful': 'Most helpful',

    'review.section.title': 'Reviews',
    'review.section.titleEvent': 'Event Reviews',
    'review.section.summary': '⭐ {rating}/5 • {count} reviews',
    'review.section.write': 'Write review',
    'review.section.cancel': 'Cancel',
    'review.section.loading': 'Loading reviews...',
    'review.section.emptyEvent': 'No reviews for this event yet.',
    'review.section.loadMore': 'Load more reviews',
  },
};

const interpolate = (value: string, params?: TranslationParams) => {
  if (!params) return value;

  let output = value;
  for (const [key, raw] of Object.entries(params)) {
    output = output.replace(new RegExp(`\\{${key}\\}`, 'g'), String(raw));
  }

  return output;
};

export const translate = (language: AppLanguage, key: string, params?: TranslationParams) => {
  const primary = dictionaries[language]?.[key];
  if (primary) return interpolate(primary, params);

  const fallback = dictionaries.vi[key] ?? key;
  return interpolate(fallback, params);
};
