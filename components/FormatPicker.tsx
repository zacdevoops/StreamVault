import React from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { Download, X, Music, Video } from 'lucide-react-native';
import { Colors, Radius, Spacing, Typography, FontSizes } from '@/constants/theme';
import { DownloadFormat } from '@/types';

interface FormatOption {
  format: DownloadFormat;
  label: string;
  quality: string;
  sizeEstimate: string;
  isAudio: boolean;
}

const VIDEO_FORMATS: FormatOption[] = [
  { format: 'mp4_360p', label: 'MP4 360p', quality: 'SD', sizeEstimate: '~50 MB', isAudio: false },
  { format: 'mp4_720p', label: 'MP4 720p', quality: 'HD', sizeEstimate: '~150 MB', isAudio: false },
  { format: 'mp4_1080p', label: 'MP4 1080p', quality: 'Full HD', sizeEstimate: '~300 MB', isAudio: false },
  { format: 'mp4_4k', label: 'MP4 4K', quality: 'Ultra HD', sizeEstimate: '~1.2 GB', isAudio: false },
];

const AUDIO_FORMATS: FormatOption[] = [
  { format: 'mp3_128', label: 'MP3 128kbps', quality: 'Standard', sizeEstimate: '~4 MB', isAudio: true },
  { format: 'mp3_320', label: 'MP3 320kbps', quality: 'High', sizeEstimate: '~10 MB', isAudio: true },
  { format: 'flac', label: 'FLAC', quality: 'Lossless', sizeEstimate: '~25 MB', isAudio: true },
];

interface FormatPickerProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (format: DownloadFormat) => void;
  title: string;
  downloading?: DownloadFormat | null;
}

export function FormatPicker({ visible, onClose, onSelect, title, downloading }: FormatPickerProps) {
  const isDownloading = !!downloading;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.handle} />
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Download Options</Text>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <X size={22} color={Colors.textSecondary} />
          </TouchableOpacity>
        </View>
        <Text style={styles.itemTitle} numberOfLines={2}>{title}</Text>
        <ScrollView showsVerticalScrollIndicator={false}>
          <Text style={styles.sectionLabel}>VIDEO</Text>
          {VIDEO_FORMATS.map((opt) => (
            <FormatRow
              key={opt.format}
              opt={opt}
              onPress={() => onSelect(opt.format)}
              isActive={downloading === opt.format}
              disabled={isDownloading}
            />
          ))}
          <Text style={styles.sectionLabel}>AUDIO</Text>
          {AUDIO_FORMATS.map((opt) => (
            <FormatRow
              key={opt.format}
              opt={opt}
              onPress={() => onSelect(opt.format)}
              isActive={downloading === opt.format}
              disabled={isDownloading}
            />
          ))}
          <View style={{ height: 24 }} />
        </ScrollView>
      </View>
    </Modal>
  );
}

function FormatRow({
  opt,
  onPress,
  isActive,
  disabled,
}: {
  opt: FormatOption;
  onPress: () => void;
  isActive: boolean;
  disabled: boolean;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.row, isActive && styles.rowActive, disabled && !isActive && styles.rowDisabled]}
      activeOpacity={0.8}
      disabled={disabled}
    >
      <View style={styles.rowIcon}>
        {opt.isAudio ? (
          <Music size={18} color={isActive ? Colors.gold : Colors.textSecondary} />
        ) : (
          <Video size={18} color={isActive ? Colors.gold : Colors.textSecondary} />
        )}
      </View>
      <View style={styles.rowInfo}>
        <Text style={styles.rowLabel}>{opt.label}</Text>
        <Text style={styles.rowQuality}>{opt.quality}</Text>
      </View>
      <Text style={styles.rowSize}>{opt.sizeEstimate}</Text>
      <View style={[styles.downloadBtn, isActive && styles.downloadBtnActive]}>
        {isActive ? (
          <ActivityIndicator size="small" color="#000" />
        ) : (
          <Download size={16} color={Colors.gold} />
        )}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  sheet: {
    backgroundColor: Colors.bgSurface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: Spacing.sm,
    paddingHorizontal: Spacing.md,
    maxHeight: '80%',
    borderTopWidth: 1,
    borderColor: Colors.border,
  },
  handle: {
    width: 36,
    height: 4,
    backgroundColor: Colors.textMuted,
    borderRadius: Radius.full,
    alignSelf: 'center',
    marginBottom: Spacing.sm,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  headerTitle: {
    fontFamily: Typography.display,
    fontSize: FontSizes.lg,
    color: Colors.textPrimary,
  },
  itemTitle: {
    fontFamily: Typography.body,
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
    marginBottom: Spacing.md,
  },
  sectionLabel: {
    fontFamily: Typography.mono,
    fontSize: FontSizes.xs,
    color: Colors.textMuted,
    letterSpacing: 1,
    marginBottom: Spacing.sm,
    marginTop: Spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.md,
    padding: Spacing.sm,
    marginBottom: Spacing.xs,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: Spacing.sm,
  },
  rowActive: {
    borderColor: Colors.gold,
    backgroundColor: Colors.goldSoft,
  },
  rowDisabled: {
    opacity: 0.45,
  },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: Radius.sm,
    backgroundColor: Colors.bgElevated,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rowInfo: {
    flex: 1,
  },
  rowLabel: {
    fontFamily: Typography.display,
    fontSize: FontSizes.sm,
    color: Colors.textPrimary,
  },
  rowQuality: {
    fontFamily: Typography.body,
    fontSize: FontSizes.xs,
    color: Colors.textMuted,
  },
  rowSize: {
    fontFamily: Typography.mono,
    fontSize: FontSizes.xs,
    color: Colors.textSecondary,
  },
  downloadBtn: {
    width: 32,
    height: 32,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.gold,
    justifyContent: 'center',
    alignItems: 'center',
  },
  downloadBtnActive: {
    backgroundColor: Colors.gold,
  },
});
