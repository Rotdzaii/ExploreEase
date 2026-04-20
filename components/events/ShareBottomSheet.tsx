import BottomSheet, { BottomSheetBackdrop } from '@gorhom/bottom-sheet';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Keyboard, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

export interface ShareBottomSheetProps {
  isVisible: boolean;
  onClose: () => void;
  onShare?: (text: string, platform: string) => void | Promise<void>;
  currentUser?: {
    id: string;
    name: string;
    avatar: string;
  };
}

type Contact = {
  id: string;
  name: string;
  avatar: string;
};

type ShareOption = {
  id: string;
  icon: string;
  label: string;
  action: string;
};

const DUMMY_CONTACTS: Contact[] = [
  { id: '1', name: 'Alice', avatar: '👩‍🦰' },
  { id: '2', name: 'Bob', avatar: '👨‍💼' },
  { id: '3', name: 'Carol', avatar: '👩‍🎨' },
  { id: '4', name: 'David', avatar: '👨‍💻' },
  { id: '5', name: 'Emma', avatar: '👩‍🔬' },
  { id: '6', name: 'Frank', avatar: '👨‍🎤' },
  { id: '7', name: 'Grace', avatar: '👩‍⚕️' },
  { id: '8', name: 'Henry', avatar: '👨‍🏫' },
];

const SHARE_OPTIONS: ShareOption[] = [
  { id: '1', icon: '💬', label: 'Messenger', action: 'messenger' },
  { id: '2', icon: '🔗', label: 'Copy Link', action: 'copy_link' },
  { id: '3', icon: '👍', label: 'Facebook', action: 'facebook' },
  { id: '4', icon: '📖', label: 'Your Story', action: 'story' },
];

const DEFAULT_USER = {
  id: 'user1',
  name: 'John Doe',
  avatar: '👨‍💻',
};

const releaseOverlayTriggerFocus = () => {
  Keyboard.dismiss();

  if (Platform.OS !== 'web') return;

  try {
    const activeElement = (globalThis as any)?.document?.activeElement as { blur?: () => void } | null | undefined;
    if (activeElement && typeof activeElement.blur === 'function') {
      activeElement.blur();
    }
  } catch {
    // Ignore focus release failures on unsupported environments.
  }
};

export default function ShareBottomSheet({
  isVisible,
  onClose,
  onShare,
  currentUser = DEFAULT_USER,
}: ShareBottomSheetProps) {
  const sheetRef = useRef<BottomSheet>(null);
  const [shareText, setShareText] = useState('');
  const snapPoints = useMemo(() => ['78%'], []);

  useEffect(() => {
    if (!isVisible) return;
    releaseOverlayTriggerFocus();
  }, [isVisible]);

  const onBottomSheetClose = useCallback(() => {
    setShareText('');
    onClose();
  }, [onClose]);

  const handleShare = useCallback(
    async (platform: string) => {
      const textToShare = shareText.trim();
      await onShare?.(textToShare, platform);
      setShareText('');
      onClose();
    },
    [onClose, onShare, shareText]
  );

  const renderBackdrop = useCallback(
    (props: any) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        pressBehavior="close"
      />
    ),
    []
  );

  const renderContact = useCallback(
    ({ item }: { item: Contact }) => (
      <Pressable style={styles.contactContainer} onPress={() => void handleShare(`messenger:${item.id}`)}>
        <View style={styles.contactAvatar}>
          <Text style={styles.avatarEmoji}>{item.avatar}</Text>
        </View>
        <Text style={styles.contactName} numberOfLines={1}>
          {item.name}
        </Text>
      </Pressable>
    ),
    [handleShare]
  );

  const renderShareOption = useCallback(
    ({ item }: { item: ShareOption }) => (
      <Pressable style={styles.shareOptionContainer} onPress={() => void handleShare(item.action)}>
        <View style={styles.shareOptionIcon}>
          <Text style={styles.shareOptionEmoji}>{item.icon}</Text>
        </View>
        <Text style={styles.shareOptionLabel}>{item.label}</Text>
      </Pressable>
    ),
    [handleShare]
  );

  if (!isVisible) return null;

  return (
    <BottomSheet
      ref={sheetRef}
      index={0}
      snapPoints={snapPoints}
      onClose={onBottomSheetClose}
      enablePanDownToClose
      backdropComponent={renderBackdrop}
      backgroundStyle={styles.bottomSheetBackground}
      handleIndicatorStyle={styles.handleIndicator}
    >
      <View style={styles.container}>
        <View style={styles.headerSection}>
          <View style={styles.userInfoRow}>
            <View style={styles.userAvatarContainer}>
              <Text style={styles.userAvatarEmoji}>{currentUser.avatar}</Text>
            </View>
            <View style={styles.userInfo}>
              <Text style={styles.userName}>{currentUser.name}</Text>
              <TextInput
                style={styles.textInput}
                placeholder="Hãy nói gì đó về nội dung này..."
                placeholderTextColor="#999"
                value={shareText}
                onChangeText={setShareText}
                multiline
              />
            </View>
            <Pressable style={styles.shareNowButton} onPress={() => void handleShare('direct')}>
              <Text style={styles.shareNowButtonText}>
                Chia sẻ{`\n`}ngay
              </Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.divider} />

        <View style={styles.messengerSection}>
          <Text style={styles.sectionTitle}>Gửi bằng Messenger</Text>
          <FlatList
            data={DUMMY_CONTACTS}
            renderItem={renderContact}
            keyExtractor={(item) => item.id}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.contactsListContainer}
          />
        </View>

        <View style={styles.divider} />

        <View style={styles.shareSection}>
          <Text style={styles.sectionTitle}>Chia sẻ lên</Text>
          <FlatList
            data={SHARE_OPTIONS}
            renderItem={renderShareOption}
            keyExtractor={(item) => item.id}
            numColumns={4}
            scrollEnabled={false}
            columnWrapperStyle={styles.gridRow}
            contentContainerStyle={styles.gridContainer}
          />
        </View>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  bottomSheetBackground: {
    backgroundColor: '#ffffff',
  },
  handleIndicator: {
    backgroundColor: '#d0d0d0',
    width: 40,
    height: 4,
  },
  container: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: '#ffffff',
  },
  headerSection: {
    marginBottom: 16,
  },
  userInfoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  userAvatarContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#e0e0e0',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 4,
  },
  userAvatarEmoji: {
    fontSize: 24,
  },
  userInfo: {
    flex: 1,
    gap: 8,
  },
  userName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000000',
  },
  textInput: {
    borderRadius: 20,
    backgroundColor: '#f0f0f0',
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 14,
    color: '#000000',
    maxHeight: 60,
  },
  shareNowButton: {
    backgroundColor: '#0a66c2',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 50,
  },
  shareNowButtonText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
  divider: {
    height: 1,
    backgroundColor: '#e5e5e5',
    marginVertical: 12,
  },
  messengerSection: {
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#65676b',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  contactsListContainer: {
    paddingRight: 16,
    gap: 16,
  },
  contactContainer: {
    alignItems: 'center',
    width: 70,
  },
  contactAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#e0e0e0',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  avatarEmoji: {
    fontSize: 32,
  },
  contactName: {
    fontSize: 12,
    fontWeight: '500',
    color: '#000000',
    textAlign: 'center',
  },
  shareSection: {
    marginBottom: 24,
  },
  gridContainer: {
    paddingRight: 16,
  },
  gridRow: {
    justifyContent: 'space-between',
    marginBottom: 16,
    gap: 12,
  },
  shareOptionContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  shareOptionIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  shareOptionEmoji: {
    fontSize: 28,
  },
  shareOptionLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: '#000000',
    textAlign: 'center',
  },
});
