import { Platform, StyleSheet } from 'react-native';

import { ExploreEaseColors } from '../../constants/exploreEaseTheme';

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

// Hàm tạo styles dựa trên chế độ sáng/tối
export const getStyles = ({ isDarkMode, screenWidth }: { isDarkMode: boolean; screenWidth: number }) => {
  const scale = clamp(screenWidth / 390, 0.86, 1.18);
  const s = (value: number) => Math.round(value * scale);
  const padX = Math.round(clamp(screenWidth * 0.04, 14, 22));

  const colors = {
    background: isDarkMode ? ExploreEaseColors.background : '#f8fafc',
    textMain: isDarkMode ? '#ffffff' : '#0f172a',
    textSub: isDarkMode ? '#94a3b8' : '#64748b',
    cardBg: isDarkMode ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
    border: isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
    primary: ExploreEaseColors.primary,
    accent: '#06b6d4',
  };

  return StyleSheet.create({
    mainContainer: { flex: 1 },
    bgBlobContainer: {
      ...StyleSheet.absoluteFillObject,
      overflow: 'hidden',
    },
    bgCircle1: { 
      position: 'absolute',
      top: -s(160),
      right: -s(140),
      width: s(420),
      height: s(420),
      borderRadius: s(210),
      backgroundColor: isDarkMode ? 'rgba(34, 211, 238, 0.10)' : 'rgba(34, 211, 238, 0.16)',
      ...Platform.select({ web: { filter: `blur(${s(48)}px)` } as any }),
    },
    bgCircle2: {
      position: 'absolute',
      bottom: -s(180),
      left: -s(180),
      width: s(420),
      height: s(420),
      borderRadius: s(210),
      backgroundColor: isDarkMode ? 'rgba(6, 182, 212, 0.08)' : 'rgba(6, 182, 212, 0.14)',
      ...Platform.select({ web: { filter: `blur(${s(56)}px)` } as any }),
    },
    scrollContent: { paddingTop: 0 },
    pageContent: { paddingHorizontal: padX },

    loadingIndicator: {
      position: 'absolute',
      top: s(14),
      right: s(14),
      width: s(10),
      height: s(10),
      borderRadius: 999,
      backgroundColor: isDarkMode ? 'rgba(34, 211, 238, 0.35)' : 'rgba(34, 211, 238, 0.28)',
      borderWidth: 1,
      borderColor: 'rgba(34, 211, 238, 0.4)',
      opacity: 0.9,
    },

    // --- HEADER ---
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: s(25) },
    headerShell: {
      position: 'relative',
      marginTop: s(8),
      marginBottom: s(12),
      paddingVertical: s(18),
      paddingHorizontal: s(4),
      borderRadius: s(16),
      overflow: 'hidden',
    },
    headerBlurBg: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: isDarkMode ? 'rgba(10,25,41,0.45)' : 'rgba(248,250,252,0.35)',
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    headerContentRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: s(4),
    },
    userInfo: { flexDirection: 'row', alignItems: 'center', gap: s(12) },
    avatarRing: {
      width: s(52),
      height: s(52),
      borderRadius: s(26),
      padding: s(2),
      borderWidth: 2,
      borderColor: isDarkMode ? 'rgba(34,211,238,0.35)' : 'rgba(34,211,238,0.30)',
      backgroundColor: isDarkMode ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
    },
    avatarImg: { width: s(48), height: s(48), borderRadius: s(24), backgroundColor: isDarkMode ? '#1e293b' : '#e2e8f0' },
    welcomeSub: { color: colors.textSub, fontSize: s(12) },
    welcomeMain: { color: colors.textMain, fontSize: s(18), fontWeight: '800' },
    
    headerActions: { flexDirection: 'row', gap: s(10) },
    iconBtn: { 
      width: s(40), height: s(40), borderRadius: s(20), 
      backgroundColor: colors.cardBg, 
      justifyContent: 'center', alignItems: 'center',
      borderWidth: 1, borderColor: colors.border
    },
    notifBtn: {
      width: s(44),
      height: s(44),
      borderRadius: s(22),
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: isDarkMode ? 'rgba(34,211,238,0.10)' : 'rgba(34,211,238,0.12)',
      borderWidth: 1,
      borderColor: isDarkMode ? 'rgba(34,211,238,0.20)' : 'rgba(34,211,238,0.22)',
    },
    notifDot: { 
      position: 'absolute', top: s(10), right: s(10), width: s(8), height: s(8), 
      backgroundColor: '#ef4444', borderRadius: s(4), borderWidth: s(1.5), borderColor: colors.background 
    },

    // --- SEARCH BAR (v0 Glass Style - Dynamic) ---
    searchContainer: {
      marginBottom: s(18),
      ...Platform.select({ web: { boxShadow: isDarkMode ? '0 8px 32px 0 rgba(0,0,0,0.3)' : '0 8px 20px rgba(0,0,0,0.05)' } })
    },
    searchBlur: {
      borderRadius: s(15),
      borderWidth: 1,
      borderColor: colors.border,
      borderBottomWidth: 1.5,
      borderBottomColor: 'rgba(34, 211, 238, 0.4)', 
      overflow: 'hidden',
      backgroundColor: colors.cardBg,
    },
    searchBlurFocused: {
      borderColor: 'rgba(34, 211, 238, 0.45)',
      borderBottomColor: 'rgba(34, 211, 238, 0.6)',
      ...Platform.select({ web: { boxShadow: '0 10px 30px rgba(34,211,238,0.15)' } as any }),
    },
    searchInner: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: s(15), height: s(55) },
    searchInput: { flex: 1, color: colors.textMain, marginLeft: s(10), fontSize: s(15), ...Platform.select({ web: { outlineStyle: 'none' } as any }) },
    searchFilterBtn: { padding: s(8), borderRadius: s(10) },

    // --- CATEGORIES ---
    catScroll: { marginBottom: s(30) },
    catItem: { alignItems: 'center', gap: s(8), marginRight: s(25) },
    catItemActive: {},
    catIconBox: { 
      width: s(50), height: s(50), borderRadius: s(12), 
      backgroundColor: colors.cardBg, 
      justifyContent: 'center', alignItems: 'center',
      borderWidth: 1, borderColor: colors.border
    },
    catIconActive: { backgroundColor: 'rgba(34, 211, 238, 0.15)', borderColor: ExploreEaseColors.primary },
    catText: { color: colors.textSub, fontSize: s(12), fontWeight: '500' },
    catTextActive: { color: ExploreEaseColors.primary, fontWeight: 'bold' },

    // --- FEATURED CARD ---
    sectionTitle: { color: colors.textMain, fontSize: s(20), fontWeight: '800', marginBottom: s(20) },
    featuredCard: { width: Math.round(screenWidth * 0.9), alignSelf: 'center', height: s(220), marginBottom: s(30) },
    featuredImage: { borderRadius: s(25) },
    featuredGradient: { 
      flex: 1,
      justifyContent: 'flex-end',
      padding: s(20),
      borderRadius: s(25),
    },
    featuredTitle: { color: 'white', fontSize: s(24), fontWeight: 'bold' },
    featuredLoc: { color: 'rgba(255,255,255,0.9)', fontSize: s(13), marginLeft: s(4) },
    featuredMetaRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginTop: s(12),
    },
    featuredPrice: { color: 'white', fontSize: s(16), fontWeight: '800' },
    featuredRatingBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: s(6),
      backgroundColor: 'rgba(34, 211, 238, 0.22)',
      paddingHorizontal: s(10),
      paddingVertical: s(6),
      borderRadius: 999,
      borderWidth: 1,
      borderColor: 'rgba(34, 211, 238, 0.28)',
    },
    featuredRatingText: { color: ExploreEaseColors.primary, fontSize: s(12), fontWeight: '700' },
    viewDetailsBtn: { 
      position: 'absolute', bottom: s(20), right: s(20),
      flexDirection: 'row', alignItems: 'center', gap: s(6),
      backgroundColor: ExploreEaseColors.primary, paddingHorizontal: s(16), paddingVertical: s(10), borderRadius: s(12)
    },
    viewDetailsText: { color: ExploreEaseColors.background, fontWeight: 'bold', fontSize: s(14) },

    // --- POPULAR DESTINATIONS ---
    popularSection: { paddingBottom: s(24) },
    popularHeader: { marginBottom: s(14) },
    popularHeading: { color: colors.textMain, fontSize: s(20), fontWeight: '800' },
    popularSubheading: { color: colors.textSub, fontSize: s(13), marginTop: s(4) },

    popularCard: { width: s(288), height: s(256), marginRight: s(16) },
    popularCardInner: { flex: 1, borderRadius: s(20), overflow: 'hidden' },
    popularImage: { flex: 1 },
    popularImageStyle: { borderRadius: s(20) },
    popularGradient: { ...StyleSheet.absoluteFillObject },
    popularFavBtn: {
      position: 'absolute',
      top: s(12),
      right: s(12),
      width: s(42),
      height: s(42),
      borderRadius: s(21),
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: isDarkMode ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.14)',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.20)',
    },
    popularContent: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      padding: s(16),
    },
    popularContentTop: { gap: s(6) },
    popularTitle: { color: 'white', fontSize: s(18), fontWeight: '800' },
    popularLocationRow: { flexDirection: 'row', alignItems: 'center', gap: s(6) },
    popularLoc: { color: 'rgba(226,232,240,0.95)', fontSize: s(12) },
    popularMetaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: s(12) },
    popularPrice: { color: 'white', fontSize: s(16), fontWeight: '800' },
    popularRatingBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: s(6),
      backgroundColor: 'rgba(34, 211, 238, 0.22)',
      paddingHorizontal: s(10),
      paddingVertical: s(6),
      borderRadius: 999,
      borderWidth: 1,
      borderColor: 'rgba(34, 211, 238, 0.28)',
    },
    popularRatingText: { color: ExploreEaseColors.primary, fontSize: s(12), fontWeight: '700' },
  });
};