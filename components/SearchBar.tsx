import React, { useRef } from 'react';
import { View, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { Search, Mic, X } from 'lucide-react-native';
import { Colors, Radius, Spacing } from '@/constants/theme';

interface SearchBarProps {
  value: string;
  onChangeText: (text: string) => void;
  onSubmit?: () => void;
  placeholder?: string;
  autoFocus?: boolean;
  readOnly?: boolean;
  onPress?: () => void;
  onMicPress?: () => void;
}

export function SearchBar({
  value,
  onChangeText,
  onSubmit,
  placeholder = 'Search videos, music...',
  autoFocus,
  readOnly,
  onPress,
  onMicPress,
}: SearchBarProps) {
  const inputRef = useRef<TextInput>(null);
  const micPressHandler = readOnly ? (onMicPress ?? onPress) : onMicPress;

  return (
    <TouchableOpacity
      style={styles.container}
      activeOpacity={readOnly ? 0.7 : 1}
      onPress={readOnly ? onPress : undefined}
    >
      <Search size={18} color={Colors.textMuted} />
      <View style={styles.inputWrap} pointerEvents={readOnly ? 'none' : 'auto'}>
        <TextInput
          ref={inputRef}
          style={styles.input}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={Colors.textMuted}
          returnKeyType="search"
          onSubmitEditing={onSubmit}
          autoFocus={autoFocus}
          editable={!readOnly}
        />
      </View>
      {value.length > 0 && !readOnly && (
        <TouchableOpacity onPress={() => onChangeText('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <X size={16} color={Colors.textMuted} />
        </TouchableOpacity>
      )}
      <View style={styles.divider} />
      <TouchableOpacity
        disabled={!micPressHandler}
        onPress={micPressHandler}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Mic size={18} color={Colors.textSecondary} />
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.md,
    height: 48,
    gap: Spacing.sm,
  },
  input: {
    flex: 1,
    color: Colors.textPrimary,
    fontSize: 15,
    fontFamily: 'Outfit_400Regular',
    paddingVertical: 0,
  },
  inputWrap: {
    flex: 1,
  },
  divider: {
    width: 1,
    height: 18,
    backgroundColor: Colors.border,
  },
});
