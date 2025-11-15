import { useEffect, useRef, useState } from 'react';
import {
  classifySwing,
  ClassificationResult,
  SwingSamplePayload,
} from '../services/api';

const DEFAULT_PLAYER_ID = 'practice_player';
const DEFAULT_SESSION_ID = 'device_session';

// NeuraBat IMU service/characteristic UUIDs (match Arduino firmware)
const IMU_SERVICE_UUID = '19b10000-e8f2-537e-4f6c-d104768a1214';
const IMU_CHARACTERISTIC_UUID = '19b10001-e8f2-537e-4f6c-d104768a1214';

export function DevicePage() {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [connected, setConnected] = useState(false);
  const [deviceName, setDeviceName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [lastSample, setLastSample] = useState<SwingSamplePayload | null>(null);
  const [lastResult, setLastResult] = useState<ClassificationResult | null>(null);

  const samplesRef = useRef<SwingSamplePayload[]>([]);
  const startTimeRef = useRef<number | null>(null);
  const deviceRef = useRef<any | null>(null);

  useEffect(() => {
    const hasBluetooth = typeof navigator !== 'undefined' && 'bluetooth' in navigator;
    setSupported(hasBluetooth);
  }, []);

  function addSampleFromNotification(value: DataView) {
    // Firmware sends 6 float32 values [ax, ay, az, gx, gy, gz] at 100 Hz
    // in little-endian order.
    if (value.byteLength < 24) return;
    const ax = value.getFloat32(0, true);
    const ay = value.getFloat32(4, true);
    const az = value.getFloat32(8, true);
    const gx = value.getFloat32(12, true);
    const gy = value.getFloat32(16, true);
    const gz = value.getFloat32(20, true);

    const now = performance.now();
    if (startTimeRef.current == null) {
      startTimeRef.current = now;
      samplesRef.current = [];
    }
    const t = (now - startTimeRef.current) / 1000.0;

    const sample: SwingSamplePayload = { ax, ay, az, gx, gy, gz, t };
    samplesRef.current.push(sample);
    setLastSample(sample);

    // Keep only the most recent 2 seconds (~200 samples if 100 Hz)
    if (samplesRef.current.length > 400) {
      samplesRef.current = samplesRef.current.slice(-400);
    }
  }

  async function handleConnect() {
    if (!supported) return;
    setError(null);
    setConnecting(true);
    setLastResult(null);
    try {
      const device = await (navigator as any).bluetooth.requestDevice({
        filters: [{ namePrefix: 'Neura' }],
        optionalServices: [IMU_SERVICE_UUID],
      });
      deviceRef.current = device;
      setDeviceName(device.name ?? 'Unknown device');

      const server = await device.gatt?.connect();
      if (!server) {
        throw new Error('Failed to connect to GATT server');
      }
      const service = await server.getPrimaryService(IMU_SERVICE_UUID);
      const characteristic = await service.getCharacteristic(IMU_CHARACTERISTIC_UUID);

      await characteristic.startNotifications();
      characteristic.addEventListener('characteristicvaluechanged', (event: Event) => {
        const target = event.target as any;
        const value = (target && target.value) as DataView | null;
        if (!value) return;
        addSampleFromNotification(value);
      });

      setConnected(true);
    } catch (err: any) {
      console.error(err);
      setError(err?.message || 'Failed to connect to device.');
      setConnected(false);
      deviceRef.current = null;
    } finally {
      setConnecting(false);
    }
  }

  async function handleDisconnect() {
    try {
      const device = deviceRef.current;
      if (device && device.gatt?.connected) {
        await device.gatt.disconnect();
      }
    } catch (err) {
      console.error(err);
    } finally {
      deviceRef.current = null;
      setConnected(false);
    }
  }

  async function handleSendSwing() {
    if (!samplesRef.current.length) {
      setError('No samples captured yet from the device. Move the bat to generate data.');
      return;
    }
    setError(null);
    setSending(true);
    setLastResult(null);
    try {
      // Use the last 100 samples (~1 second at 100 Hz) as one swing window
      const samples = samplesRef.current.slice(-100);
      const response = await classifySwing({
        player_id: DEFAULT_PLAYER_ID,
        session_id: DEFAULT_SESSION_ID,
        sampling_rate_hz: 100,
        samples,
      });
      setLastResult(response.result);
    } catch (err: any) {
      console.error(err);
      setError(err?.message || 'Failed to classify swing from device data.');
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="dashboard">
      <h2>Device</h2>
      <p style={{ color: '#9ca3af', marginBottom: '1rem' }}>
        Connect your NeuraSentinel bat via Bluetooth Low Energy (BLE). Once connected, move the bat to
        stream sensor data and send a captured window to the AI model.
      </p>

      {supported === false && (
        <p className="error-text">
          This browser does not support Web Bluetooth. Try using Chrome or Edge on desktop.
        </p>
      )}

      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        <button
          className="btn btn-primary"
          onClick={handleConnect}
          disabled={connecting || !supported}
        >
          {connecting ? 'Connecting...' : connected ? 'Reconnect Device' : 'Connect Device'}
        </button>

        {connected && (
          <button className="btn btn-secondary" onClick={handleDisconnect}>
            Disconnect
          </button>
        )}

        <button className="btn btn-primary" onClick={handleSendSwing} disabled={sending || !connected}>
          {sending ? 'Sending...' : 'Send Last Swing to AI'}
        </button>
      </div>

      {deviceName && (
        <p style={{ color: '#9ca3af', marginBottom: '0.5rem' }}>
          Connected device: <strong>{deviceName}</strong>
        </p>
      )}

      {error && <p className="error-text">{error}</p>}

      {lastSample && (
        <div className="result-card" style={{ marginTop: '1rem' }}>
          <h3>Last Sensor Sample</h3>
          <p>
            <strong>Accel:</strong> ax {lastSample.ax.toFixed(2)}, ay {lastSample.ay.toFixed(2)}, az{' '}
            {lastSample.az.toFixed(2)}
          </p>
          <p>
            <strong>Gyro:</strong> gx {lastSample.gx.toFixed(1)}, gy {lastSample.gy.toFixed(1)}, gz{' '}
            {lastSample.gz.toFixed(1)}
          </p>
        </div>
      )}

      {lastResult && (
        <div className="result-card" style={{ marginTop: '1rem' }}>
          <h3>Last Swing Classification</h3>
          <p>
            <strong>Shot type:</strong> {lastResult.shot_type}
          </p>
          <p>
            <strong>Confidence:</strong> {(lastResult.confidence * 100).toFixed(1)}%
          </p>
          <p>
            <strong>Speed:</strong> {lastResult.speed_mps.toFixed(2)} m/s
          </p>
          <p>
            <strong>Accuracy score:</strong> {(lastResult.accuracy_score * 100).toFixed(1)}%
          </p>
        </div>
      )}
    </section>
  );
}
