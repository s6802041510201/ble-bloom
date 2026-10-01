import { Buffer } from 'buffer';
import { PermissionsAndroid, Platform } from 'react-native';

export const SERVICE_UUID = 'aee04821-1973-4e1f-a590-e84b10d580e7';
export const CHAR_UUID = 'cde07b1a-889b-44b7-a99f-c888dddac729';

export type BluetoothState =
  | 'Unknown'
  | 'Resetting'
  | 'Unsupported'
  | 'Unauthorized'
  | 'PoweredOff'
  | 'PoweredOn';

export type BleDevice = {
  id: string;
  name: string | null;
  localName: string | null;
  rssi: number | null;
};

type Subscription = { remove: () => void };
type StateListener = (state: BluetoothState) => void;
type DisconnectListener = (error: unknown, device: BleDevice | null) => void;
type ScanListener = (error: { message: string } | null, device: BleDevice | null) => void;

type NativeBleManager = {
  onStateChange: (listener: StateListener, emitCurrentState?: boolean) => Subscription;
  onDeviceDisconnected: (deviceId: string, listener: DisconnectListener) => Subscription;
  startDeviceScan: (
    serviceUUIDs: string[] | null,
    options: { allowDuplicates: boolean },
    listener: ScanListener,
  ) => void;
  stopDeviceScan: () => void;
  connectToDevice: (deviceId: string, options: { autoConnect: boolean }) => Promise<BleDevice>;
  discoverAllServicesAndCharacteristicsForDevice: (
    deviceId: string,
  ) => Promise<BleDevice>;
  readCharacteristicForDevice: (
    deviceId: string,
    serviceUUID: string,
    characteristicUUID: string,
  ) => Promise<{ value: string | null }>;
  writeCharacteristicWithResponseForDevice: (
    deviceId: string,
    serviceUUID: string,
    characteristicUUID: string,
    value: string,
  ) => Promise<unknown>;
  cancelDeviceConnection: (deviceId: string) => Promise<unknown>;
};

type NativeBleModule = {
  BleManager: new () => NativeBleManager;
};

declare const require: (moduleName: string) => NativeBleModule;

let nativeManager: NativeBleManager | null = null;
let previewMode: boolean | null = null;
let previewScanTimer: ReturnType<typeof setTimeout> | null = null;
let previewWrittenValue = '';

const previewDevice: BleDevice = {
  id: 'BLE-BLOOM-PREVIEW-01',
  name: 'BLE Bloom Classroom Demo',
  localName: 'BLE Bloom Classroom Demo',
  rssi: -42,
};

function getNativeManager(): NativeBleManager | null {
  if (nativeManager || previewMode === true) {
    return nativeManager;
  }

  try {
    const { BleManager } = require('react-native-ble-plx');
    nativeManager = new BleManager();
    previewMode = false;
    return nativeManager;
  } catch {
    previewMode = true;
    return null;
  }
}

export function isPreviewMode(): boolean {
  getNativeManager();
  return previewMode === true;
}

export const bleManager = {
  onStateChange(listener: StateListener, emitCurrentState = false): Subscription {
    const manager = getNativeManager();
    if (!manager) {
      if (emitCurrentState) {
        listener('PoweredOn');
      }
      return { remove: () => undefined };
    }

    try {
      return manager.onStateChange(listener, emitCurrentState);
    } catch {
      previewMode = true;
      if (emitCurrentState) {
        listener('PoweredOn');
      }
      return { remove: () => undefined };
    }
  },

  onDeviceDisconnected(deviceId: string, listener: DisconnectListener): Subscription {
    const manager = getNativeManager();
    if (!manager) {
      return { remove: () => undefined };
    }

    return manager.onDeviceDisconnected(deviceId, listener);
  },
};

export type ScanCallback = (device: BleDevice) => void;

export async function requestBlePermissions(): Promise<boolean> {
  if (isPreviewMode() || Platform.OS !== 'android') {
    return true;
  }

  const apiLevel = Number(Platform.Version);
  const permissions =
    apiLevel >= 31
      ? [
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        ]
      : [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION];

  const result = await PermissionsAndroid.requestMultiple(permissions);
  return permissions.every(
    (permission) => result[permission] === PermissionsAndroid.RESULTS.GRANTED,
  );
}

export function startDeviceScan(
  onDevice: ScanCallback,
  onError: (message: string) => void,
): void {
  const manager = getNativeManager();
  if (!manager) {
    previewScanTimer = setTimeout(() => onDevice(previewDevice), 700);
    return;
  }

  try {
    manager.startDeviceScan(null, { allowDuplicates: false }, (error, device) => {
      if (error) {
        onError(error.message);
        return;
      }

      if (device) {
        onDevice(device);
      }
    });
  } catch (error) {
    previewMode = true;
    onError(error instanceof Error ? error.message : 'Bluetooth is unavailable in this app build.');
  }
}

export function stopDeviceScan(): void {
  if (previewScanTimer) {
    clearTimeout(previewScanTimer);
    previewScanTimer = null;
  }
  getNativeManager()?.stopDeviceScan();
}

export async function connectAndDiscover(deviceId: string): Promise<BleDevice> {
  stopDeviceScan();
  const manager = getNativeManager();
  if (!manager) {
    return previewDevice;
  }

  const connected = await manager.connectToDevice(deviceId, { autoConnect: false });
  // A successful connection does not populate the GATT service cache. Discover
  // services and characteristics before any read/write operation.
  return manager.discoverAllServicesAndCharacteristicsForDevice(connected.id);
}

export async function readCharacteristic(deviceId: string): Promise<string> {
  const manager = getNativeManager();
  if (!manager) {
    return previewWrittenValue
      ? 'Predicted grade: A (preview result)'
      : 'Teacher device is ready (preview value)';
  }

  const characteristic = await manager.readCharacteristicForDevice(
    deviceId,
    SERVICE_UUID,
    CHAR_UUID,
  );

  return decodeBase64(characteristic.value);
}

export async function writeCharacteristic(
  deviceId: string,
  value: string,
): Promise<void> {
  const manager = getNativeManager();
  if (!manager) {
    previewWrittenValue = value;
    return;
  }

  await manager.writeCharacteristicWithResponseForDevice(
    deviceId,
    SERVICE_UUID,
    CHAR_UUID,
    Buffer.from(value, 'utf8').toString('base64'),
  );
}

export async function disconnectDevice(deviceId: string): Promise<void> {
  const manager = getNativeManager();
  if (!manager) {
    previewWrittenValue = '';
    return;
  }

  await manager.cancelDeviceConnection(deviceId);
}

export function decodeBase64(value: string | null): string {
  if (!value) {
    return '';
  }

  return Buffer.from(value, 'base64').toString('utf8').replace(/\0/g, '').trim();
}

export function isBluetoothReady(state: BluetoothState): boolean {
  return state === 'PoweredOn';
}
