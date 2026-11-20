/**
 * Motor central de escaneo y decodificación de códigos de barras (1D UPC / EAN / Code128).
 * Compartido entre BarcodeScanner embebido y BarcodeScannerModal para máxima coherencia (DRY).
 */
import ZXing from "html5-qrcode/third_party/zxing-js.umd.js";

/**
 * Emite un pitido acústico claro y breve (120ms a 920Hz) al confirmar un escaneo exitoso.
 */
export function playBeep() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(920, ctx.currentTime);
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.12);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.12);
  } catch {
    // Si el contexto de audio está restringido antes de interacción del usuario, ignorar silenciosamente
  }
}

/**
 * Realza el contraste de luminancia del búfer de imagen en escala de grises.
 * Aumenta la tasa de detección en códigos de barras sobre bolsas plásticas de frutas o arrugadas.
 *
 * @param {Uint8ClampedArray} buffer
 * @returns {Uint8ClampedArray}
 */
export function enhanceLuminanceContrast(buffer) {
  let min = 255;
  let max = 0;
  const len = buffer.length;
  for (let i = 0; i < len; i += 2) {
    const v = buffer[i];
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const range = max - min;
  if (range > 15 && range < 210) {
    const scale = 255 / range;
    const enhanced = new Uint8ClampedArray(len);
    for (let i = 0; i < len; i++) {
      enhanced[i] = Math.min(255, Math.max(0, (buffer[i] - min) * scale));
    }
    return enhanced;
  }
  return buffer;
}

/**
 * Formatos 1D de código de barras comerciales soportados.
 */
export const BARCODE_FORMATS_ZXING = [
  ZXing.BarcodeFormat.EAN_13,
  ZXing.BarcodeFormat.EAN_8,
  ZXing.BarcodeFormat.CODE_128,
  ZXing.BarcodeFormat.CODE_39,
  ZXing.BarcodeFormat.CODE_93,
  ZXing.BarcodeFormat.UPC_A,
  ZXing.BarcodeFormat.UPC_E,
  ZXing.BarcodeFormat.ITF,
  ZXing.BarcodeFormat.CODABAR,
];

/**
 * Crea una instancia configurada de MultiFormatOneDReader de ZXing con TRY_HARDER activado.
 */
export function createZXing1DReader() {
  const hints = new Map([
    [ZXing.DecodeHintType.POSSIBLE_FORMATS, BARCODE_FORMATS_ZXING],
    [ZXing.DecodeHintType.TRY_HARDER, true],
  ]);
  return new ZXing.MultiFormatOneDReader(hints);
}

/**
 * Intenta crear una instancia de la API nativa de BarcodeDetector del navegador si está soportada.
 */
export function createBarcodeDetector() {
  if (typeof window !== "undefined" && "BarcodeDetector" in window) {
    try {
      return new window.BarcodeDetector({
        formats: [
          "ean_13",
          "ean_8",
          "code_128",
          "code_39",
          "code_93",
          "upc_a",
          "upc_e",
          "itf",
        ],
      });
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Intenta crear una instancia de BarcodeDetector del navegador optimizada para códigos QR DIAN.
 */
export function createQRBarcodeDetector() {
  if (typeof window !== "undefined" && "BarcodeDetector" in window) {
    try {
      return new window.BarcodeDetector({
        formats: ["qr_code"],
      });
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Crea una instancia configurada de MultiFormatReader de ZXing optimizada para QR_CODE con TRY_HARDER.
 */
export function createZXingQRReader() {
  const hints = new Map([
    [ZXing.DecodeHintType.POSSIBLE_FORMATS, [ZXing.BarcodeFormat.QR_CODE]],
    [ZXing.DecodeHintType.TRY_HARDER, true],
  ]);
  const reader = new ZXing.MultiFormatReader();
  reader.setHints(hints);
  return reader;
}

/**
 * Obtiene la lista de cámaras disponibles priorizando la trasera/ambiente (environment).
 */
export async function enumerateVideoDevices() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
    return [];
  }
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoInputs = devices.filter((d) => d.kind === "videoinput");
    return videoInputs.map((device, index) => ({
      deviceId: device.deviceId,
      label:
        device.label ||
        `Cámara ${index + 1} ${
          device.label?.toLowerCase().includes("back") ||
          device.label?.toLowerCase().includes("trasera") ||
          device.label?.toLowerCase().includes("environment")
            ? "(Trasera)"
            : ""
        }`,
      isBack:
        device.label?.toLowerCase().includes("back") ||
        device.label?.toLowerCase().includes("trasera") ||
        device.label?.toLowerCase().includes("environment"),
    }));
  } catch {
    return [];
  }
}
