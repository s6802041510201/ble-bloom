import { StatusBar } from 'expo-status-bar';
import * as Haptics from 'expo-haptics';
import { ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  ViewStyle,
} from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { ActionButton } from './src/components/action-button';
import {
  BleDevice,
  BluetoothState,
  bleManager,
  CHAR_UUID,
  connectAndDiscover,
  disconnectDevice,
  isPreviewMode,
  isBluetoothReady,
  readCharacteristic,
  requestBlePermissions,
  SERVICE_UUID,
  startDeviceScan,
  stopDeviceScan,
  writeCharacteristic,
} from './src/services/ble-client';
import { colors, radius, shadows, spacing, type } from './src/theme';

type StepKey = 'scan' | 'read' | 'write' | 'grade';

const stepLabels: Record<StepKey, string> = {
  scan: 'Find device',
  read: 'Read value',
  write: 'Write names',
  grade: 'Read grade',
};

function getDeviceLabel(device: BleDevice): string {
  return device.name || device.localName || 'Unnamed classroom device';
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return 'The Bluetooth operation could not be completed.';
}

function MotionCard({
  children,
  motionKey,
  style,
}: {
  children: ReactNode;
  motionKey: string;
  style?: ViewStyle;
}) {
  const progress = useSharedValue(0);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    progress.set(
      withTiming(1, {
        duration: reducedMotion ? 0 : 360,
        easing: Easing.bezier(0.23, 1, 0.32, 1),
      }),
    );
  }, [motionKey, progress, reducedMotion]);

  const animatedStyle = useAnimatedStyle(() => {
    const value = progress.get();
    return {
      opacity: value,
      transform: [{ translateY: (1 - value) * 12 }, { scale: 0.985 + value * 0.015 }],
    };
  });

  return <Animated.View style={[style, animatedStyle]}>{children}</Animated.View>;
}

function ScanPulse() {
  const reducedMotion = useReducedMotion();
  const pulse = useSharedValue(0);

  useEffect(() => {
    if (reducedMotion) {
      pulse.set(0);
      return;
    }

    pulse.set(
      withRepeat(
        withTiming(1, {
          duration: 1500,
          easing: Easing.bezier(0.23, 1, 0.32, 1),
        }),
        -1,
        false,
      ),
    );
  }, [pulse, reducedMotion]);

  const ringStyle = useAnimatedStyle(() => {
    const value = pulse.get();
    return {
      opacity: reducedMotion ? 0.2 : 0.34 * (1 - value),
      transform: [{ scale: reducedMotion ? 1 : 0.75 + value * 0.6 }],
    };
  });

  return (
    <View style={styles.scanPulse}>
      <Animated.View style={[styles.scanPulseRing, ringStyle]} />
      <View style={styles.scanPulseCore}>
        <Text style={styles.scanPulseGlyph}>⌁</Text>
      </View>
    </View>
  );
}

function AmbientOrb({ style, delay = 0 }: { style: ViewStyle; delay?: number }) {
  const reducedMotion = useReducedMotion();
  const float = useSharedValue(0);

  useEffect(() => {
    if (reducedMotion) {
      float.set(0);
      return;
    }

    float.set(
      withDelay(
        delay,
        withRepeat(
          withTiming(1, {
            duration: 4200,
            easing: Easing.inOut(Easing.ease),
          }),
          -1,
          true,
        ),
      ),
    );
  }, [delay, float, reducedMotion]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: 0.55,
    transform: [{ translateY: reducedMotion ? 0 : float.get() * -14 }],
  }));

  return <Animated.View pointerEvents="none" style={[style, animatedStyle]} />;
}

export default function App() {
  const [devices, setDevices] = useState<BleDevice[]>([]);
  const [connectedDevice, setConnectedDevice] = useState<BleDevice | null>(null);
  const [bluetoothState, setBluetoothState] = useState<BluetoothState | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [permissionGranted, setPermissionGranted] = useState<boolean | null>(null);
  const [activeStep, setActiveStep] = useState<StepKey>('scan');
  const [completedSteps, setCompletedSteps] = useState<StepKey[]>([]);
  const [initialValue, setInitialValue] = useState('');
  const [gradeValue, setGradeValue] = useState('');
  const [lastWrittenValue, setLastWrittenValue] = useState('');
  const [name, setName] = useState('');
  const [buddy, setBuddy] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [notice, setNotice] = useState('');
  const scanTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reducedMotion = useReducedMotion();
  const logoFloat = useSharedValue(0);

  useEffect(() => {
    if (reducedMotion) {
      logoFloat.set(0);
      return;
    }

    logoFloat.set(
      withRepeat(
        withTiming(1, {
          duration: 2600,
          easing: Easing.inOut(Easing.ease),
        }),
        -1,
        true,
      ),
    );
  }, [logoFloat, reducedMotion]);

  const logoMotionStyle = useAnimatedStyle(() => {
    const value = logoFloat.get();
    return {
      transform: [
        { translateY: reducedMotion ? 0 : value * -5 },
        { rotate: `${-7 + (reducedMotion ? 0 : value * 2)}deg` },
      ],
    };
  });

  const isConnected = connectedDevice !== null;
  const previewMode = isPreviewMode();
  const readyToRead = isConnected;
  const readyToWrite = readyToRead && completedSteps.includes('read');
  const readyForGrade = isConnected && completedSteps.includes('write');

  const connectionLabel = useMemo(() => {
    if (connectedDevice) {
      return 'Connected';
    }

    if (isScanning) {
      return 'Scanning nearby';
    }

    if (bluetoothState && !isBluetoothReady(bluetoothState)) {
      return 'Bluetooth is off';
    }

    return 'Ready to connect';
  }, [bluetoothState, connectedDevice, isScanning]);

  useEffect(() => {
    const stateSubscription = bleManager.onStateChange((state) => {
      setBluetoothState(state);
    }, true);

    return () => {
      stateSubscription.remove();
      if (scanTimer.current) {
        clearTimeout(scanTimer.current);
      }
      stopDeviceScan();
    };
  }, []);

  useEffect(() => {
    if (!connectedDevice) {
      return;
    }

    const disconnectSubscription = bleManager.onDeviceDisconnected(
      connectedDevice.id,
      () => {
        setConnectedDevice(null);
        setActiveStep('scan');
        setNotice('The classroom device disconnected. Scan again to restart.');
      },
    );

    return () => disconnectSubscription.remove();
  }, [connectedDevice]);

  function markStepComplete(step: StepKey, nextStep?: StepKey) {
    setCompletedSteps((current) => (current.includes(step) ? current : [...current, step]));
    if (nextStep) {
      setActiveStep(nextStep);
    }
  }

  function clearMessages() {
    setErrorMessage('');
    setNotice('');
  }

  async function handleScan() {
    clearMessages();

    if (isScanning) {
      stopDeviceScan();
      setIsScanning(false);
      if (scanTimer.current) {
        clearTimeout(scanTimer.current);
      }
      setNotice('Scan paused. Choose a device when you are ready.');
      return;
    }

    try {
      const granted = await requestBlePermissions();
      setPermissionGranted(granted);
      if (!granted) {
        setErrorMessage('Bluetooth permission is needed to find your classroom device.');
        return;
      }

      setDevices([]);
      setIsScanning(true);
      setActiveStep('scan');
      startDeviceScan(
        (device) => {
          setDevices((current) => {
            if (current.some((item) => item.id === device.id)) {
              return current;
            }
            return [...current, device];
          });
        },
        (message) => {
          setIsScanning(false);
          setErrorMessage(message);
        },
      );

      scanTimer.current = setTimeout(() => {
        stopDeviceScan();
        setIsScanning(false);
        setNotice('Scan complete. Tap a device below to connect.');
      }, 12000);
    } catch (error) {
      setIsScanning(false);
      setErrorMessage(getErrorMessage(error));
    }
  }

  async function handleConnect(device: BleDevice) {
    clearMessages();
    if (scanTimer.current) {
      clearTimeout(scanTimer.current);
      scanTimer.current = null;
    }
    setBusyAction(`connect-${device.id}`);

    try {
      const discovered = await connectAndDiscover(device.id);
      setConnectedDevice(discovered);
      setCompletedSteps([]);
      setActiveStep('read');
      setInitialValue('');
      setGradeValue('');
      setLastWrittenValue('');
      setNotice(`Connected to ${getDeviceLabel(discovered)}. Read the starting value first.`);
    } catch (error) {
      setErrorMessage(`Could not connect: ${getErrorMessage(error)}`);
    } finally {
      setBusyAction(null);
      setIsScanning(false);
    }
  }

  async function handleReadInitialValue() {
    if (!connectedDevice) {
      return;
    }

    clearMessages();
    setBusyAction('read-initial');
    try {
      const value = await readCharacteristic(connectedDevice.id);
      setInitialValue(value || 'The device returned an empty value.');
      setGradeValue('');
      markStepComplete('read', 'write');
      setNotice('Initial characteristic value received. Add your name and buddy.');
    } catch (error) {
      setErrorMessage(`Initial read failed: ${getErrorMessage(error)}`);
    } finally {
      setBusyAction(null);
    }
  }

  async function handleWriteNames() {
    if (!connectedDevice) {
      return;
    }

    const cleanName = name.trim();
    const cleanBuddy = buddy.trim();
    if (!cleanName || !cleanBuddy) {
      setErrorMessage('Enter both your name and your buddy before writing.');
      return;
    }

    clearMessages();
    setBusyAction('write');
    const payload = `Name: ${cleanName} | Buddy: ${cleanBuddy}`;

    try {
      await writeCharacteristic(connectedDevice.id, payload);
      setLastWrittenValue(payload);
      markStepComplete('write', 'grade');
      setNotice('Names written successfully. Read the characteristic again for your grade.');
    } catch (error) {
      setErrorMessage(`Write failed: ${getErrorMessage(error)}`);
    } finally {
      setBusyAction(null);
    }
  }

  async function handleReadGrade() {
    if (!connectedDevice) {
      return;
    }

    clearMessages();
    setBusyAction('read-grade');
    try {
      const value = await readCharacteristic(connectedDevice.id);
      setGradeValue(value || 'The device returned an empty grade response.');
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
        () => undefined,
      );
      markStepComplete('grade');
      setNotice('Grade response received. Capture this screen for submission.');
    } catch (error) {
      setErrorMessage(`Grade read failed: ${getErrorMessage(error)}`);
    } finally {
      setBusyAction(null);
    }
  }

  async function handleDisconnect() {
    if (!connectedDevice) {
      return;
    }

    clearMessages();
    setBusyAction('disconnect');
    try {
      await disconnectDevice(connectedDevice.id);
      setConnectedDevice(null);
      setActiveStep('scan');
      setCompletedSteps([]);
      setNotice('Disconnected safely. Your session is ready for another device.');
    } catch (error) {
      setErrorMessage(`Disconnect failed: ${getErrorMessage(error)}`);
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.root}
    >
      <StatusBar style="dark" />
      <AmbientOrb style={styles.decorTop} />
      <AmbientOrb delay={1200} style={styles.decorBottom} />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View style={styles.eyebrowRow}>
            <View style={styles.eyebrowDot} />
            <Text selectable style={type.eyebrow}>
              CLASSROOM BLE LAB
            </Text>
          </View>
          <View style={styles.titleRow}>
            <Animated.View style={[styles.logo, logoMotionStyle]}>
              <Text style={styles.logoText}>B</Text>
              <View style={styles.logoSpark} />
            </Animated.View>
            <View style={styles.titleCopy}>
              <Text selectable style={type.title}>
                BLE Bloom
              </Text>
              <Text selectable style={type.subtitle}>
                Connect, write your names, discover your grade.
              </Text>
            </View>
          </View>
          <View style={styles.connectionPill}>
            <View style={[styles.statusDot, isConnected && styles.statusDotConnected]} />
            <Text selectable style={styles.connectionPillText}>
              {connectionLabel}
            </Text>
          </View>
          {previewMode ? (
            <View style={styles.previewBanner}>
              <Text style={styles.previewBannerIcon}>◇</Text>
              <Text selectable style={styles.previewBannerText}>
                EXPO GO PREVIEW · Bluetooth actions are simulated
              </Text>
            </View>
          ) : null}
        </View>

        <View style={styles.stepRail}>
          {(['scan', 'read', 'write', 'grade'] as StepKey[]).map((step, index) => {
            const isComplete = completedSteps.includes(step);
            const isActive = activeStep === step;
            return (
              <View key={step} style={styles.stepItem}>
                <View
                  style={[
                    styles.stepNumber,
                    isActive && styles.stepNumberActive,
                    isComplete && styles.stepNumberComplete,
                  ]}
                >
                  <Text style={styles.stepNumberText}>{isComplete ? '✓' : index + 1}</Text>
                </View>
                <Text selectable style={[styles.stepLabel, isActive && styles.stepLabelActive]}>
                  {stepLabels[step]}
                </Text>
                {index < 3 ? (
                  <View style={[styles.stepLine, isComplete && styles.stepLineComplete]} />
                ) : null}
              </View>
            );
          })}
        </View>

        {notice ? (
          <View style={styles.noticeBanner}>
            <Text style={styles.noticeIcon}>✓</Text>
            <Text selectable style={styles.noticeText}>
              {notice}
            </Text>
          </View>
        ) : null}
        {errorMessage ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorIcon}>!</Text>
            <Text selectable style={styles.errorText}>
              {errorMessage}
            </Text>
          </View>
        ) : null}

        {!isConnected ? (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={styles.sectionIconPink}>
                <Text style={styles.sectionIconText}>01</Text>
              </View>
              <View style={styles.cardHeaderCopy}>
                <Text selectable style={type.sectionTitle}>
                  Find your classroom device
                </Text>
                <Text selectable style={type.caption}>
                  Turn on Bluetooth, then scan for nearby BLE devices.
                </Text>
              </View>
            </View>

            <ActionButton
              icon={isScanning ? '■' : '⌕'}
              label={isScanning ? 'Stop scanning' : 'Scan for devices'}
              onPress={handleScan}
            />

            <View style={styles.permissionRow}>
              <View
                style={[
                  styles.permissionDot,
                  permissionGranted === true && styles.permissionDotGranted,
                  permissionGranted === false && styles.permissionDotDenied,
                ]}
              />
              <Text selectable style={styles.permissionText}>
                {permissionGranted === true
                  ? 'Bluetooth permission ready'
                  : permissionGranted === false
                    ? 'Permission needed to scan'
                    : 'Permission is requested the first time you scan'}
              </Text>
            </View>

            {isScanning && devices.length === 0 ? (
              <View style={styles.emptyState}>
                <ScanPulse />
                <Text selectable style={styles.emptyStateTitle}>
                  Looking for BLE devices…
                </Text>
                <Text selectable style={styles.emptyStateCopy}>
                  Keep the teacher’s device powered on and nearby.
                </Text>
              </View>
            ) : null}

            {!isScanning && devices.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyStateMark}>⌁</Text>
                <Text selectable style={styles.emptyStateTitle}>
                  No devices yet
                </Text>
                <Text selectable style={styles.emptyStateCopy}>
                  Your scan results will appear here. Tap a device to connect.
                </Text>
              </View>
            ) : null}

            {devices.length > 0 ? (
              <View style={styles.deviceList}>
                <Text selectable style={styles.listLabel}>
                  NEARBY DEVICES · {devices.length}
                </Text>
                {devices.map((device) => {
                  const deviceName = getDeviceLabel(device);
                  const connectBusy = busyAction === `connect-${device.id}`;
                  return (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Connect to ${deviceName}`}
                      key={device.id}
                      onPress={() => handleConnect(device)}
                      style={({ pressed }) => [styles.deviceRow, pressed && styles.deviceRowPressed]}
                    >
                      <View style={styles.deviceAvatar}>
                        <Text style={styles.deviceAvatarText}>{deviceName.charAt(0).toUpperCase()}</Text>
                      </View>
                      <View style={styles.deviceCopy}>
                        <Text selectable style={styles.deviceName} numberOfLines={1}>
                          {deviceName}
                        </Text>
                        <Text selectable style={styles.deviceMeta} numberOfLines={1}>
                          {device.id} {device.rssi !== null ? `· ${device.rssi} dBm` : ''}
                        </Text>
                      </View>
                      {connectBusy ? (
                        <ActivityIndicator color={colors.pink} />
                      ) : (
                        <Text style={styles.chevron}>›</Text>
                      )}
                    </Pressable>
                  );
                })}
              </View>
            ) : null}
          </View>
        ) : (
          <>
            <MotionCard motionKey={connectedDevice.id}>
              <View style={styles.connectedCard}>
              <View style={styles.connectedTopLine}>
                <View style={styles.connectedBadge}>
                  <Text style={styles.connectedBadgeIcon}>✓</Text>
                  <Text selectable style={styles.connectedBadgeText}>
                    CONNECTED
                  </Text>
                </View>
                <Text selectable style={styles.connectedSignal}>
                  BLE LINK ACTIVE
                </Text>
              </View>
              <Text selectable style={styles.connectedName}>
                {getDeviceLabel(connectedDevice)}
              </Text>
              <Text selectable style={styles.connectedId}>
                {connectedDevice.id}
              </Text>
              <View style={styles.uuidPill}>
                <Text selectable style={styles.uuidPillLabel}>
                  SERVICE READY
                </Text>
                <Text selectable style={styles.uuidPillValue} numberOfLines={1}>
                  {SERVICE_UUID}
                </Text>
              </View>
              </View>
            </MotionCard>

            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={styles.sectionIconLilac}>
                  <Text style={styles.sectionIconText}>02</Text>
                </View>
                <View style={styles.cardHeaderCopy}>
                  <Text selectable style={type.sectionTitle}>
                    Read the starting value
                  </Text>
                  <Text selectable style={type.caption}>
                    Pull the current message from the characteristic before writing.
                  </Text>
                </View>
              </View>

              <View style={styles.valueBox}>
                <Text selectable style={styles.valueBoxLabel}>
                  CHARACTERISTIC VALUE
                </Text>
                <Text selectable style={styles.valueBoxValue}>
                  {initialValue || 'Waiting for your first read…'}
                </Text>
              </View>
              <ActionButton
                icon="↓"
                label={initialValue ? 'Read again' : 'Read initial value'}
                loading={busyAction === 'read-initial'}
                onPress={handleReadInitialValue}
              />
            </View>

            <View style={[styles.card, !readyToRead && styles.cardDisabled]}>
              <View style={styles.cardHeader}>
                <View style={styles.sectionIconCoral}>
                  <Text style={styles.sectionIconText}>03</Text>
                </View>
                <View style={styles.cardHeaderCopy}>
                  <Text selectable style={type.sectionTitle}>
                    Write your names
                  </Text>
                  <Text selectable style={type.caption}>
                    Your message is sent as “Name | Buddy” to the same characteristic.
                  </Text>
                </View>
              </View>

              <View style={styles.formGroup}>
                <Text selectable style={styles.inputLabel}>
                  YOUR NAME
                </Text>
                <TextInput
                  accessibilityLabel="Your name"
                  autoCapitalize="words"
                  editable={readyToWrite || completedSteps.includes('write')}
                  onChangeText={setName}
                  placeholder="e.g. Alex"
                  placeholderTextColor={colors.inkSoft}
                  style={styles.input}
                  value={name}
                />
              </View>
              <View style={styles.formGroup}>
                <Text selectable style={styles.inputLabel}>
                  YOUR BUDDY
                </Text>
                <TextInput
                  accessibilityLabel="Your buddy"
                  autoCapitalize="words"
                  editable={readyToWrite || completedSteps.includes('write')}
                  onChangeText={setBuddy}
                  placeholder="e.g. Jamie"
                  placeholderTextColor={colors.inkSoft}
                  style={styles.input}
                  value={buddy}
                />
              </View>
              <View style={styles.payloadPreview}>
                <Text selectable style={styles.payloadPreviewLabel}>
                  PAYLOAD PREVIEW
                </Text>
                <Text selectable style={styles.payloadPreviewValue} numberOfLines={2}>
                  {name.trim() && buddy.trim()
                    ? `Name: ${name.trim()} | Buddy: ${buddy.trim()}`
                    : 'Your message will appear here'}
                </Text>
              </View>
              <ActionButton
                icon="↑"
                label={completedSteps.includes('write') ? 'Write again' : 'Write names to device'}
                disabled={!readyToWrite}
                loading={busyAction === 'write'}
                onPress={handleWriteNames}
              />
              {lastWrittenValue ? (
                <Text selectable style={styles.successCaption}>
                  ✓ Last written: {lastWrittenValue}
                </Text>
              ) : null}
            </View>

            <MotionCard motionKey={gradeValue ? 'grade-ready' : 'grade-waiting'}>
              <View style={[styles.gradeCard, !readyForGrade && styles.cardDisabled]}>
                <View style={styles.gradeCardGlow} />
                <View style={styles.cardHeader}>
                <View style={styles.sectionIconMint}>
                  <Text style={styles.sectionIconText}>04</Text>
                </View>
                <View style={styles.cardHeaderCopy}>
                  <Text selectable style={type.sectionTitle}>
                    Reveal your predicted grade
                  </Text>
                  <Text selectable style={styles.gradeSubtitle}>
                    Read the characteristic one more time after your write.
                  </Text>
                </View>
                </View>

                <View style={styles.gradeBox}>
                  <Text selectable style={styles.gradeBoxLabel}>
                    TEACHER DEVICE RESPONSE
                  </Text>
                  <Text selectable style={styles.gradeBoxValue}>
                    {gradeValue || 'Your result will appear here'}
                  </Text>
                </View>
                <ActionButton
                  icon="✦"
                  label={gradeValue ? 'Read grade again' : 'Read predicted grade'}
                  disabled={!readyForGrade}
                  loading={busyAction === 'read-grade'}
                  onPress={handleReadGrade}
                />
                {gradeValue ? (
                  <View style={styles.captureHint}>
                    <Text style={styles.captureHintIcon}>◎</Text>
                    <Text selectable style={styles.captureHintText}>
                      Nice! This is the screen to capture for Google Classroom.
                    </Text>
                  </View>
                ) : null}
              </View>
            </MotionCard>

            <ActionButton
              icon="×"
              label="Disconnect from device"
              loading={busyAction === 'disconnect'}
              onPress={handleDisconnect}
              style={styles.disconnectButton}
              variant="danger"
            />
          </>
        )}

        <View style={styles.setupCard}>
          <View style={styles.setupHeader}>
            <View>
              <Text selectable style={styles.setupEyebrow}>
                LAB SETUP
              </Text>
              <Text selectable style={styles.setupTitle}>
                Characteristic map
              </Text>
            </View>
            <View style={styles.setupBadge}>
              <Text selectable style={styles.setupBadgeText}>READ / WRITE</Text>
            </View>
          </View>
          <View style={styles.uuidRow}>
            <Text selectable style={styles.uuidLabel}>SERVICE</Text>
            <Text selectable style={styles.uuidValue}>{SERVICE_UUID}</Text>
          </View>
          <View style={styles.uuidRow}>
            <Text selectable style={styles.uuidLabel}>CHARACTERISTIC</Text>
            <Text selectable style={styles.uuidValue}>{CHAR_UUID}</Text>
          </View>
        </View>

        <Text selectable style={styles.footerCopy}>
          BLE Bloom • Designed for the characteristic read / write practical
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  content: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  decorTop: {
    position: 'absolute',
    top: -96,
    right: -46,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: colors.surfaceStrong,
    opacity: 0.65,
  },
  decorBottom: {
    position: 'absolute',
    bottom: -120,
    left: -75,
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: colors.lilac,
    opacity: 0.18,
  },
  header: {
    gap: spacing.sm,
  },
  eyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  eyebrowDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.pink,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  logo: {
    width: 68,
    height: 68,
    borderRadius: 23,
    borderCurve: 'continuous',
    backgroundColor: colors.pink,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '-7deg' }],
    boxShadow: shadows.raised,
  },
  logoText: {
    color: colors.white,
    fontSize: 36,
    fontWeight: '900',
    transform: [{ rotate: '7deg' }],
  },
  logoSpark: {
    position: 'absolute',
    top: 10,
    right: 11,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.cream,
  },
  titleCopy: {
    flex: 1,
    gap: 2,
  },
  connectionPill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.inkSoft,
  },
  statusDotConnected: {
    backgroundColor: colors.success,
  },
  connectionPillText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.inkMuted,
  },
  previewBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: colors.cream,
    borderWidth: 1,
    borderColor: '#F0D98F',
  },
  previewBannerIcon: {
    color: colors.warning,
    fontSize: 17,
    fontWeight: '900',
  },
  previewBannerText: {
    flex: 1,
    ...type.caption,
    color: colors.warning,
    fontWeight: '800',
  },
  stepRail: {
    paddingVertical: spacing.sm,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  stepItem: {
    flex: 1,
    alignItems: 'center',
    position: 'relative',
    gap: spacing.xs,
  },
  stepNumber: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  stepNumberActive: {
    borderColor: colors.pink,
    backgroundColor: colors.surfaceStrong,
  },
  stepNumberComplete: {
    borderColor: colors.success,
    backgroundColor: colors.mint,
  },
  stepNumberText: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.ink,
  },
  stepLabel: {
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '600',
    color: colors.inkSoft,
    textAlign: 'center',
  },
  stepLabelActive: {
    color: colors.pinkDark,
    fontWeight: '800',
  },
  stepLine: {
    position: 'absolute',
    top: 14,
    left: '63%',
    right: '-37%',
    height: 1,
    backgroundColor: colors.line,
  },
  stepLineComplete: {
    backgroundColor: colors.mint,
  },
  noticeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: '#C8E8D9',
    backgroundColor: '#F0FBF5',
  },
  noticeIcon: {
    width: 20,
    height: 20,
    borderRadius: 10,
    overflow: 'hidden',
    textAlign: 'center',
    lineHeight: 20,
    backgroundColor: colors.mint,
    color: colors.success,
    fontWeight: '900',
  },
  noticeText: {
    flex: 1,
    ...type.caption,
    color: colors.success,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: '#F1BDC8',
    backgroundColor: '#FFF0F3',
  },
  errorIcon: {
    width: 20,
    height: 20,
    borderRadius: 10,
    textAlign: 'center',
    lineHeight: 20,
    backgroundColor: '#F8CFD8',
    color: colors.danger,
    fontWeight: '900',
  },
  errorText: {
    flex: 1,
    ...type.caption,
    color: colors.danger,
  },
  card: {
    padding: spacing.md,
    gap: spacing.md,
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    boxShadow: shadows.card,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  cardHeaderCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  sectionIconPink: {
    backgroundColor: colors.surfaceStrong,
    borderRadius: radius.sm,
  },
  sectionIconLilac: {
    backgroundColor: '#EEE7FF',
    borderRadius: radius.sm,
  },
  sectionIconCoral: {
    backgroundColor: '#FFE2E4',
    borderRadius: radius.sm,
  },
  sectionIconMint: {
    backgroundColor: '#DFF6EA',
    borderRadius: radius.sm,
  },
  sectionIconText: {
    minWidth: 38,
    height: 38,
    textAlign: 'center',
    textAlignVertical: 'center',
    fontSize: 12,
    fontWeight: '900',
    color: colors.pinkDark,
  },
  permissionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  permissionDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.inkSoft,
  },
  permissionDotGranted: {
    backgroundColor: colors.success,
  },
  permissionDotDenied: {
    backgroundColor: colors.danger,
  },
  permissionText: {
    ...type.caption,
    flex: 1,
  },
  emptyState: {
    paddingVertical: spacing.lg,
    alignItems: 'center',
    gap: spacing.xs,
  },
  scanPulse: {
    width: 76,
    height: 76,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanPulseRing: {
    position: 'absolute',
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 2,
    borderColor: colors.pink,
  },
  scanPulseCore: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceStrong,
    borderWidth: 1,
    borderColor: colors.pinkSoft,
  },
  scanPulseGlyph: {
    color: colors.pinkDark,
    fontSize: 27,
    fontWeight: '800',
  },
  emptyStateMark: {
    fontSize: 36,
    lineHeight: 40,
    color: colors.pinkSoft,
  },
  emptyStateTitle: {
    ...type.body,
    fontWeight: '800',
  },
  emptyStateCopy: {
    ...type.caption,
    textAlign: 'center',
    maxWidth: 260,
  },
  deviceList: {
    gap: spacing.sm,
  },
  listLabel: {
    ...type.eyebrow,
    color: colors.inkSoft,
  },
  deviceRow: {
    minHeight: 64,
    padding: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.md,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surfaceMuted,
  },
  deviceRowPressed: {
    backgroundColor: colors.surfaceStrong,
    borderColor: colors.pinkSoft,
  },
  deviceAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.pink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deviceAvatarText: {
    color: colors.white,
    fontWeight: '900',
    fontSize: 15,
  },
  deviceCopy: {
    flex: 1,
    gap: 2,
  },
  deviceName: {
    ...type.body,
    fontWeight: '800',
  },
  deviceMeta: {
    ...type.caption,
    fontSize: 10,
    color: colors.inkSoft,
  },
  chevron: {
    color: colors.pink,
    fontSize: 26,
    lineHeight: 26,
    fontWeight: '400',
  },
  connectedCard: {
    padding: spacing.md,
    gap: spacing.sm,
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    backgroundColor: colors.pinkDark,
    boxShadow: shadows.raised,
  },
  connectedTopLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  connectedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  connectedBadgeIcon: {
    width: 18,
    height: 18,
    borderRadius: 9,
    textAlign: 'center',
    lineHeight: 18,
    color: colors.pinkDark,
    backgroundColor: colors.mint,
    fontWeight: '900',
    fontSize: 11,
  },
  connectedBadgeText: {
    color: colors.white,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1,
  },
  connectedSignal: {
    color: colors.pinkSoft,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  connectedName: {
    color: colors.white,
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '900',
  },
  connectedId: {
    color: '#F8DDE9',
    fontSize: 11,
    fontFamily: 'monospace',
  },
  uuidPill: {
    marginTop: spacing.xs,
    padding: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(255,255,255,0.12)',
    gap: 2,
  },
  uuidPillLabel: {
    color: colors.pinkSoft,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  uuidPillValue: {
    color: colors.white,
    fontSize: 10,
    fontFamily: 'monospace',
  },
  valueBox: {
    padding: spacing.md,
    gap: spacing.xs,
    borderRadius: radius.md,
    borderCurve: 'continuous',
    backgroundColor: colors.surfaceMuted,
  },
  valueBoxLabel: {
    ...type.eyebrow,
    color: colors.inkSoft,
    fontSize: 10,
  },
  valueBoxValue: {
    ...type.body,
    fontWeight: '700',
    color: colors.pinkDark,
  },
  cardDisabled: {
    opacity: 0.56,
  },
  formGroup: {
    gap: spacing.xs,
  },
  inputLabel: {
    ...type.eyebrow,
    color: colors.inkSoft,
    fontSize: 10,
  },
  input: {
    minHeight: 50,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    borderCurve: 'continuous',
    backgroundColor: colors.surfaceMuted,
    color: colors.ink,
    fontSize: 16,
    fontWeight: '600',
  },
  payloadPreview: {
    padding: spacing.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.line,
    borderStyle: 'dashed',
    backgroundColor: '#FFFAFC',
    gap: 2,
  },
  payloadPreviewLabel: {
    ...type.eyebrow,
    color: colors.inkSoft,
    fontSize: 9,
  },
  payloadPreviewValue: {
    ...type.caption,
    color: colors.ink,
    fontWeight: '700',
  },
  successCaption: {
    ...type.caption,
    color: colors.success,
  },
  gradeCard: {
    overflow: 'hidden',
    padding: spacing.md,
    gap: spacing.md,
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: '#C7EADC',
    backgroundColor: '#F7FFFB',
    boxShadow: shadows.card,
  },
  gradeCardGlow: {
    position: 'absolute',
    top: -40,
    right: -30,
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: colors.mint,
    opacity: 0.45,
  },
  gradeSubtitle: {
    ...type.caption,
    color: colors.success,
  },
  gradeBox: {
    minHeight: 106,
    padding: spacing.md,
    justifyContent: 'center',
    borderRadius: radius.md,
    borderCurve: 'continuous',
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: '#D4EEE1',
    gap: spacing.xs,
  },
  gradeBoxLabel: {
    ...type.eyebrow,
    color: colors.success,
    fontSize: 10,
  },
  gradeBoxValue: {
    color: colors.ink,
    fontSize: 20,
    lineHeight: 27,
    fontWeight: '900',
  },
  captureHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: '#E8F8EF',
  },
  captureHintIcon: {
    color: colors.success,
    fontSize: 19,
  },
  captureHintText: {
    ...type.caption,
    flex: 1,
    color: colors.success,
    fontWeight: '700',
  },
  disconnectButton: {
    marginTop: -spacing.xs,
  },
  setupCard: {
    padding: spacing.md,
    gap: spacing.md,
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    backgroundColor: colors.ink,
    boxShadow: shadows.card,
  },
  setupHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  setupEyebrow: {
    ...type.eyebrow,
    color: colors.pinkSoft,
  },
  setupTitle: {
    color: colors.white,
    fontSize: 18,
    fontWeight: '800',
  },
  setupBadge: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: 'rgba(247,183,209,0.16)',
  },
  setupBadgeText: {
    color: colors.pinkSoft,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  uuidRow: {
    gap: spacing.xs,
  },
  uuidLabel: {
    color: colors.pinkSoft,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  uuidValue: {
    color: colors.white,
    fontSize: 10,
    lineHeight: 16,
    fontFamily: 'monospace',
  },
  footerCopy: {
    ...type.caption,
    color: colors.inkSoft,
    textAlign: 'center',
  },
});
