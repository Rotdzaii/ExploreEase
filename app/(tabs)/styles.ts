import { Platform, StyleSheet } from 'react-native';

// Hàm tạo styles dựa trên chế độ sáng/tối
export const getStyles = (isDarkMode: boolean) => {
  const colors = {
    background: isDarkMode ? '#0a1929' : '#f8fafc',
    textMain: isDarkMode ? '#ffffff' : '#0f172a',
    textSub: isDarkMode ? '#94a3b8' : '#64748b',
    cardBg: isDarkMode ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
    border: isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
    primary: '#22d3ee',
    accent: '#06b6d4',
  };

  return StyleSheet.create({
    mainContainer: { flex: 1 },
    bgBlobContainer: {
      ...StyleSheet.absoluteFillObject,
      overflow: 'hidden',
    },
    bgCircle1: { 
      position: 'absolute', top: -160, right: -140, width: 420, height: 420, 
      borderRadius: 210,
      backgroundColor: isDarkMode ? 'rgba(34, 211, 238, 0.10)' : 'rgba(34, 211, 238, 0.16)',
      ...Platform.select({ web: { filter: 'blur(48px)' } as any }),
    },
    bgCircle2: {
      position: 'absolute', bottom: -180, left: -180, width: 420, height: 420,
      borderRadius: 210,
      backgroundColor: isDarkMode ? 'rgba(6, 182, 212, 0.08)' : 'rgba(6, 182, 212, 0.14)',
      ...Platform.select({ web: { filter: 'blur(56px)' } as any }),
    },
    scrollContent: { paddingTop: 0 },
    pageContent: { paddingHorizontal: 16 },

    // --- HEADER ---
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 25 },
    headerShell: {
      position: 'relative',
      marginTop: 8,
      marginBottom: 12,
      paddingVertical: 18,
      paddingHorizontal: 4,
      borderRadius: 16,
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
      paddingHorizontal: 4,
    },
    userInfo: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    avatarRing: {
      width: 52,
      height: 52,
      borderRadius: 26,
      padding: 2,
      borderWidth: 2,
      borderColor: isDarkMode ? 'rgba(34,211,238,0.35)' : 'rgba(34,211,238,0.30)',
      backgroundColor: isDarkMode ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
    },
    avatarImg: { width: 48, height: 48, borderRadius: 24, backgroundColor: isDarkMode ? '#1e293b' : '#e2e8f0' },
    welcomeSub: { color: colors.textSub, fontSize: 12 },
    welcomeMain: { color: colors.textMain, fontSize: 18, fontWeight: '800' },
    
    headerActions: { flexDirection: 'row', gap: 10 },
    iconBtn: { 
      width: 40, height: 40, borderRadius: 20, 
      backgroundColor: colors.cardBg, 
      justifyContent: 'center', alignItems: 'center',
      borderWidth: 1, borderColor: colors.border
    },
    notifBtn: {
      width: 44,
      height: 44,
      borderRadius: 22,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: isDarkMode ? 'rgba(34,211,238,0.10)' : 'rgba(34,211,238,0.12)',
      borderWidth: 1,
      borderColor: isDarkMode ? 'rgba(34,211,238,0.20)' : 'rgba(34,211,238,0.22)',
    },
    notifDot: { 
      position: 'absolute', top: 10, right: 10, width: 8, height: 8, 
      backgroundColor: '#ef4444', borderRadius: 4, borderWidth: 1.5, borderColor: colors.background 
    },

    // --- SEARCH BAR (v0 Glass Style - Dynamic) ---
    searchContainer: {
      marginBottom: 18,
      ...Platform.select({ web: { boxShadow: isDarkMode ? '0 8px 32px 0 rgba(0,0,0,0.3)' : '0 8px 20px rgba(0,0,0,0.05)' } })
    },
    searchBlur: {
      borderRadius: 15,
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
    searchInner: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 15, height: 55 },
    searchInput: { flex: 1, color: colors.textMain, marginLeft: 10, fontSize: 15, ...Platform.select({ web: { outlineStyle: 'none' } as any }) },
    searchFilterBtn: { padding: 8, borderRadius: 10 },

    // --- CATEGORIES ---
    catScroll: { marginBottom: 30 },
    catItem: { alignItems: 'center', gap: 8, marginRight: 25 },
    catItemActive: {},
    catIconBox: { 
      width: 50, height: 50, borderRadius: 12, 
      backgroundColor: colors.cardBg, 
      justifyContent: 'center', alignItems: 'center',
      borderWidth: 1, borderColor: colors.border
    },
    catIconActive: { backgroundColor: 'rgba(34, 211, 238, 0.15)', borderColor: '#22d3ee' },
    catText: { color: colors.textSub, fontSize: 12, fontWeight: '500' },
    catTextActive: { color: '#22d3ee', fontWeight: 'bold' },

    // --- FEATURED CARD ---
    sectionTitle: { color: colors.textMain, fontSize: 20, fontWeight: '800', marginBottom: 20 },
    featuredCard: { width: '100%', height: 220, marginBottom: 30 },
    featuredImage: { borderRadius: 25 },
    featuredGradient: { 
      flex: 1,
      justifyContent: 'flex-end',
      padding: 20,
      borderRadius: 25,
    },
    featuredTitle: { color: 'white', fontSize: 24, fontWeight: 'bold' },
    featuredLoc: { color: 'rgba(255,255,255,0.9)', fontSize: 13, marginLeft: 4 },
    viewDetailsBtn: { 
      position: 'absolute', bottom: 20, right: 20,
      flexDirection: 'row', alignItems: 'center', gap: 6,
      backgroundColor: '#22d3ee', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12
    },
    viewDetailsText: { color: '#0a1929', fontWeight: 'bold', fontSize: 14 },

    // --- POPULAR DESTINATIONS ---
    popularSection: { paddingBottom: 24 },
    popularHeader: { marginBottom: 14 },
    popularHeading: { color: colors.textMain, fontSize: 20, fontWeight: '800' },
    popularSubheading: { color: colors.textSub, fontSize: 13, marginTop: 4 },

    popularCard: { width: 288, height: 256, marginRight: 16 },
    popularCardInner: { flex: 1, borderRadius: 20, overflow: 'hidden' },
    popularImage: { flex: 1 },
    popularImageStyle: { borderRadius: 20 },
    popularGradient: { ...StyleSheet.absoluteFillObject },
    popularFavBtn: {
      position: 'absolute',
      top: 12,
      right: 12,
      width: 42,
      height: 42,
      borderRadius: 21,
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
      padding: 16,
    },
    popularContentTop: { gap: 6 },
    popularTitle: { color: 'white', fontSize: 18, fontWeight: '800' },
    popularLocationRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    popularLoc: { color: 'rgba(226,232,240,0.95)', fontSize: 12 },
    popularMetaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 },
    popularPrice: { color: 'white', fontSize: 16, fontWeight: '800' },
    popularRatingBadge: {
      backgroundColor: 'rgba(34, 211, 238, 0.22)',
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: 'rgba(34, 211, 238, 0.28)',
    },
    popularRatingText: { color: '#22d3ee', fontSize: 12, fontWeight: '700' },
  });
};