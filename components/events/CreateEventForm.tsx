import { ExploreEaseColors } from '@/constants/exploreEaseTheme';
import { useTheme } from '@/src/context/theme';
import { Feather } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

export type EventFormData = {
  title: string;
  category: string;
  location: string;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  price: string;
  imageUrl: string;
  description: string;
};

type CreateEventFormProps = {
  onSubmit?: (data: EventFormData) => Promise<void> | void;
  onCancel?: () => void;
};

export const EVENT_CATEGORIES = [
  'Music',
  'Food',
  'Wellness',
  'Art',
  'Sports',
  'Tech',
  'Education',
  'Entertainment',
  'Networking',
  'Charity',
];

const FALLBACK_EVENT_IMAGE =
  'https://images.unsplash.com/photo-1459749411175-04bf5292ceea?auto=format&fit=crop&w=1400&q=80';

const isDateText = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value.trim());
const isTimeText = (value: string) => /^\d{2}:\d{2}$/.test(value.trim());

const toDateTime = (dateText: string, timeText: string): Date | null => {
  if (!isDateText(dateText) || !isTimeText(timeText)) return null;
  const dt = new Date(`${dateText}T${timeText}:00`);
  if (Number.isNaN(dt.getTime())) return null;
  return dt;
};

export function CreateEventForm({ onSubmit, onCancel }: CreateEventFormProps) {
  const { isDark } = useTheme();
  const [formData, setFormData] = useState<EventFormData>({
    title: '',
    category: '',
    location: '',
    startDate: '',
    startTime: '',
    endDate: '',
    endTime: '',
    price: '0',
    imageUrl: '',
    description: '',
  });
  const [errors, setErrors] = useState<Partial<Record<keyof EventFormData, string>>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const colors = useMemo(
    () => ({
      background: isDark ? ExploreEaseColors.background : '#f8fafc',
      card: isDark ? 'rgba(255,255,255,0.05)' : '#ffffff',
      border: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(15,23,42,0.10)',
      title: isDark ? '#ffffff' : '#0f172a',
      body: isDark ? '#cbd5e1' : '#334155',
      muted: isDark ? '#94a3b8' : '#64748b',
      inputBg: isDark ? 'rgba(255,255,255,0.04)' : '#f8fafc',
      inputText: isDark ? '#ffffff' : '#0f172a',
      error: '#ef4444',
    }),
    [isDark]
  );

  const isFreeEvent = formData.price.trim() === '' || Number(formData.price) <= 0;

  const setField = <K extends keyof EventFormData>(key: K, value: EventFormData[K]) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
    if (errors[key]) {
      setErrors((prev) => ({ ...prev, [key]: undefined }));
    }
  };

  const resetForm = () => {
    setFormData({
      title: '',
      category: '',
      location: '',
      startDate: '',
      startTime: '',
      endDate: '',
      endTime: '',
      price: '0',
      imageUrl: '',
      description: '',
    });
    setErrors({});
  };

  const validateForm = (): boolean => {
    const nextErrors: Partial<Record<keyof EventFormData, string>> = {};

    if (!formData.title.trim()) nextErrors.title = 'Title is required';
    if (!formData.category.trim()) nextErrors.category = 'Category is required';
    if (!formData.location.trim()) nextErrors.location = 'Location is required';

    if (!isDateText(formData.startDate)) nextErrors.startDate = 'Use format YYYY-MM-DD';
    if (!isTimeText(formData.startTime)) nextErrors.startTime = 'Use format HH:mm';
    if (!isDateText(formData.endDate)) nextErrors.endDate = 'Use format YYYY-MM-DD';
    if (!isTimeText(formData.endTime)) nextErrors.endTime = 'Use format HH:mm';

    const price = Number(formData.price || '0');
    if (Number.isNaN(price) || price < 0) {
      nextErrors.price = 'Price must be >= 0';
    }

    const start = toDateTime(formData.startDate, formData.startTime);
    const end = toDateTime(formData.endDate, formData.endTime);
    if (start && end && end <= start) {
      nextErrors.endTime = 'End time must be greater than start time';
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;

    setIsSubmitting(true);
    try {
      await onSubmit?.({
        ...formData,
        description: formData.description.trim(),
      });
      resetForm();
    } finally {
      setIsSubmitting(false);
    }
  };

  const imageSourceUri = formData.imageUrl.trim() || FALLBACK_EVENT_IMAGE;

  return (
    <View style={[styles.safe, { backgroundColor: colors.background }]}> 
      <View style={[styles.header, { borderColor: colors.border }]}> 
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, { color: colors.title }]}>Create Event</Text>
          <Text style={[styles.headerSubtitle, { color: colors.muted }]}>Share your event with the community</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}> 
          <Text style={[styles.label, { color: colors.title }]}>Event Image URL</Text>
          <View style={styles.imagePreviewWrap}>
            <Image source={{ uri: imageSourceUri }} style={styles.imagePreview} resizeMode="cover" />
            {!!formData.imageUrl.trim() ? (
              <Pressable
                onPress={() => setField('imageUrl', '')}
                style={({ pressed }) => [styles.removeImageBtn, pressed ? { opacity: 0.82 } : null]}
                accessibilityRole="button"
              >
                <Feather name="x" size={16} color="#ffffff" />
              </Pressable>
            ) : null}
          </View>

          <TextInput
            value={formData.imageUrl}
            onChangeText={(value) => setField('imageUrl', value)}
            placeholder="https://example.com/event-image.jpg"
            placeholderTextColor={colors.muted}
            autoCapitalize="none"
            autoCorrect={false}
            style={[
              styles.input,
              { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.inputText },
            ]}
          />

          <Text style={[styles.label, { color: colors.title }]}>Event Title</Text>
          <TextInput
            value={formData.title}
            onChangeText={(value) => setField('title', value)}
            placeholder="e.g., Summer Music Festival"
            placeholderTextColor={colors.muted}
            style={[
              styles.input,
              {
                backgroundColor: colors.inputBg,
                borderColor: errors.title ? colors.error : colors.border,
                color: colors.inputText,
              },
            ]}
          />
          {errors.title ? <Text style={[styles.errorText, { color: colors.error }]}>{errors.title}</Text> : null}

          <Text style={[styles.label, { color: colors.title }]}>Category</Text>
          <View style={styles.categoryWrap}>
            {EVENT_CATEGORIES.map((category) => {
              const selected = formData.category === category;
              return (
                <Pressable
                  key={category}
                  onPress={() => setField('category', category)}
                  style={({ pressed }) => [
                    styles.categoryChip,
                    {
                      backgroundColor: selected ? ExploreEaseColors.primary : colors.inputBg,
                      borderColor: selected ? ExploreEaseColors.primary : colors.border,
                    },
                    pressed ? { opacity: 0.85 } : null,
                  ]}
                  accessibilityRole="button"
                >
                  <Text style={[styles.categoryChipText, { color: selected ? '#001018' : colors.body }]}>{category}</Text>
                </Pressable>
              );
            })}
          </View>
          {errors.category ? <Text style={[styles.errorText, { color: colors.error }]}>{errors.category}</Text> : null}

          <Text style={[styles.label, { color: colors.title }]}>Location</Text>
          <TextInput
            value={formData.location}
            onChangeText={(value) => setField('location', value)}
            placeholder="City, venue or address"
            placeholderTextColor={colors.muted}
            style={[
              styles.input,
              {
                backgroundColor: colors.inputBg,
                borderColor: errors.location ? colors.error : colors.border,
                color: colors.inputText,
              },
            ]}
          />
          {errors.location ? <Text style={[styles.errorText, { color: colors.error }]}>{errors.location}</Text> : null}

          <View style={styles.row}>
            <View style={styles.halfCol}>
              <Text style={[styles.label, { color: colors.title }]}>Start Date</Text>
              <TextInput
                value={formData.startDate}
                onChangeText={(value) => setField('startDate', value)}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={colors.muted}
                style={[
                  styles.input,
                  {
                    backgroundColor: colors.inputBg,
                    borderColor: errors.startDate ? colors.error : colors.border,
                    color: colors.inputText,
                  },
                ]}
              />
              {errors.startDate ? <Text style={[styles.errorText, { color: colors.error }]}>{errors.startDate}</Text> : null}
            </View>

            <View style={styles.halfCol}>
              <Text style={[styles.label, { color: colors.title }]}>Start Time</Text>
              <TextInput
                value={formData.startTime}
                onChangeText={(value) => setField('startTime', value)}
                placeholder="HH:mm"
                placeholderTextColor={colors.muted}
                style={[
                  styles.input,
                  {
                    backgroundColor: colors.inputBg,
                    borderColor: errors.startTime ? colors.error : colors.border,
                    color: colors.inputText,
                  },
                ]}
              />
              {errors.startTime ? <Text style={[styles.errorText, { color: colors.error }]}>{errors.startTime}</Text> : null}
            </View>
          </View>

          <View style={styles.row}>
            <View style={styles.halfCol}>
              <Text style={[styles.label, { color: colors.title }]}>End Date</Text>
              <TextInput
                value={formData.endDate}
                onChangeText={(value) => setField('endDate', value)}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={colors.muted}
                style={[
                  styles.input,
                  {
                    backgroundColor: colors.inputBg,
                    borderColor: errors.endDate ? colors.error : colors.border,
                    color: colors.inputText,
                  },
                ]}
              />
              {errors.endDate ? <Text style={[styles.errorText, { color: colors.error }]}>{errors.endDate}</Text> : null}
            </View>

            <View style={styles.halfCol}>
              <Text style={[styles.label, { color: colors.title }]}>End Time</Text>
              <TextInput
                value={formData.endTime}
                onChangeText={(value) => setField('endTime', value)}
                placeholder="HH:mm"
                placeholderTextColor={colors.muted}
                style={[
                  styles.input,
                  {
                    backgroundColor: colors.inputBg,
                    borderColor: errors.endTime ? colors.error : colors.border,
                    color: colors.inputText,
                  },
                ]}
              />
              {errors.endTime ? <Text style={[styles.errorText, { color: colors.error }]}>{errors.endTime}</Text> : null}
            </View>
          </View>

          <Text style={[styles.label, { color: colors.title }]}>Price (0 for free)</Text>
          <TextInput
            value={formData.price}
            onChangeText={(value) => setField('price', value)}
            placeholder="0"
            placeholderTextColor={colors.muted}
            keyboardType="decimal-pad"
            style={[
              styles.input,
              {
                backgroundColor: colors.inputBg,
                borderColor: errors.price ? colors.error : colors.border,
                color: colors.inputText,
              },
            ]}
          />
          {errors.price ? <Text style={[styles.errorText, { color: colors.error }]}>{errors.price}</Text> : null}
          {isFreeEvent ? (
            <Text style={{ color: ExploreEaseColors.primary, fontSize: 12, fontWeight: '700', marginTop: 4 }}>
              This event is free
            </Text>
          ) : null}

          <Text style={[styles.label, { color: colors.title }]}>Description (Optional)</Text>
          <TextInput
            value={formData.description}
            onChangeText={(value) => setField('description', value)}
            placeholder="Tell us more about your event..."
            placeholderTextColor={colors.muted}
            multiline
            textAlignVertical="top"
            style={[
              styles.textarea,
              {
                backgroundColor: colors.inputBg,
                borderColor: colors.border,
                color: colors.inputText,
              },
            ]}
          />

          <View style={styles.actionRow}>
            <Pressable
              onPress={onCancel}
              style={({ pressed }) => [
                styles.cancelBtn,
                {
                  borderColor: colors.border,
                  backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#ffffff',
                },
                pressed ? { opacity: 0.84 } : null,
              ]}
              accessibilityRole="button"
            >
              <Text style={[styles.cancelBtnText, { color: colors.body }]}>Cancel</Text>
            </Pressable>

            <Pressable
              onPress={() => void handleSubmit()}
              disabled={isSubmitting}
              style={({ pressed }) => [
                styles.createBtn,
                isSubmitting ? { opacity: 0.72 } : null,
                pressed ? { opacity: 0.84 } : null,
              ]}
              accessibilityRole="button"
            >
              {isSubmitting ? (
                <ActivityIndicator color="#001018" />
              ) : (
                <Text style={styles.createBtnText}>Create Event</Text>
              )}
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  header: {
    borderBottomWidth: 1,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 14,
  },
  headerTitle: {
    fontSize: 30,
    fontWeight: '900',
    lineHeight: 36,
  },
  headerSubtitle: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: '600',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 34,
  },
  card: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    gap: 8,
  },
  label: {
    fontSize: 13,
    fontWeight: '800',
    marginTop: 2,
  },
  imagePreviewWrap: {
    width: '100%',
    borderRadius: 14,
    overflow: 'hidden',
    height: 176,
    marginTop: 4,
    marginBottom: 2,
    backgroundColor: 'rgba(34, 211, 238, 0.10)',
  },
  imagePreview: {
    width: '100%',
    height: '100%',
  },
  removeImageBtn: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#ef4444',
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 14,
  },
  textarea: {
    borderWidth: 1,
    borderRadius: 12,
    minHeight: 96,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  errorText: {
    fontSize: 11,
    fontWeight: '700',
    marginTop: -3,
    marginBottom: 4,
  },
  categoryWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 2,
  },
  categoryChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  categoryChipText: {
    fontSize: 12,
    fontWeight: '700',
  },
  row: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
  },
  halfCol: {
    flex: 1,
    minWidth: 0,
  },
  actionRow: {
    marginTop: 12,
    flexDirection: 'row',
    gap: 10,
  },
  cancelBtn: {
    flex: 1,
    minHeight: 46,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnText: {
    fontSize: 14,
    fontWeight: '800',
  },
  createBtn: {
    flex: 1,
    minHeight: 46,
    borderRadius: 12,
    backgroundColor: ExploreEaseColors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  createBtnText: {
    color: '#001018',
    fontSize: 14,
    fontWeight: '900',
  },
});
