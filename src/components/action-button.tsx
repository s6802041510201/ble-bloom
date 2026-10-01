import * as Haptics from 'expo-haptics';
import { ActivityIndicator, Pressable, StyleProp, Text, ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { colors, radius, spacing, type } from '../theme';

type ButtonVariant = 'primary' | 'secondary' | 'quiet' | 'danger';

type ActionButtonProps = {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  icon?: string;
  style?: StyleProp<ViewStyle>;
};

const variantStyles: Record<
  ButtonVariant,
  { backgroundColor: string; borderColor: string; textColor: string }
> = {
  primary: {
    backgroundColor: colors.pink,
    borderColor: colors.pink,
    textColor: colors.white,
  },
  secondary: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    textColor: colors.pinkDark,
  },
  quiet: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.surfaceMuted,
    textColor: colors.ink,
  },
  danger: {
    backgroundColor: colors.surface,
    borderColor: colors.danger,
    textColor: colors.danger,
  },
};

export function ActionButton({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  icon,
  style,
}: ActionButtonProps) {
  const palette = variantStyles[variant];
  const unavailable = disabled || loading;
  const scale = useSharedValue(1);
  const reducedMotion = useReducedMotion();
  const pressStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.get() }],
  }));
  const pressTransition = reducedMotion ? 0 : 120;

  function setPressed(value: number) {
    scale.set(
      withTiming(value, {
        duration: pressTransition,
        easing: Easing.bezier(0.23, 1, 0.32, 1),
      }),
    );
  }

  function handlePress() {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    onPress();
  }

  return (
    <Animated.View style={[style, pressStyle]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ busy: loading, disabled: unavailable }}
        disabled={unavailable}
        onPress={handlePress}
        onPressIn={() => setPressed(reducedMotion ? 1 : 0.97)}
        onPressOut={() => setPressed(1)}
        style={({ pressed }) => [
          {
            minHeight: 48,
            paddingHorizontal: spacing.md,
            borderRadius: radius.md,
            borderCurve: 'continuous',
            borderWidth: 1,
            borderColor: palette.borderColor,
            backgroundColor: palette.backgroundColor,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: spacing.sm,
            opacity: unavailable ? 0.45 : pressed ? 0.78 : 1,
          },
        ]}
      >
        {loading ? <ActivityIndicator color={palette.textColor} /> : null}
        {!loading && icon ? (
          <Text style={{ color: palette.textColor, fontSize: 18, fontWeight: '800' }}>
            {icon}
          </Text>
        ) : null}
        <Text style={[type.body, { color: palette.textColor, fontWeight: '800' }]}>
          {label}
        </Text>
      </Pressable>
    </Animated.View>
  );
}
