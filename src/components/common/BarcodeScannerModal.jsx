import React, { useState, useEffect, useRef } from "react";
import ZXing from "html5-qrcode/third_party/zxing-js.umd.js";
import {
  X,
  Camera,
  CameraOff,
  Flashlight,
  RefreshCw,
  ZoomIn,
  Upload,
  ScanBarcode,
  AlertCircle,
  CheckCircle2,
  Image as ImageIcon,
  SwitchCamera,
  Barcode,
} from "lucide-react";

function playBeep() {
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
  } catch (e) {}
}

function enhanceLuminanceContrast(buffer) {
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

export default function BarcodeScannerModal({
  isOpen,
  onClose,
  onScan,
  title = "Escanear Código de Barras (UPC / EAN / ISBN)",
  subtitle = "Apunta la cámara al código de barras del producto",
}) {
  const [isScanning, setIsScanning] = useState(false);
  const [cameras, setCameras] = useState([]);
  const [selectedCamera, setSelectedCamera] = useState("");
  const [torchOn, setTorchOn] = useState(false);
  const [scanError, setScanError] = useState(null);
  const [scannedResult, setScannedResult] = useState(null);
  const [zoomLevel, setZoomLevel] = useState(1);

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const isScanningRef = useRef(false);
  const animationFrameRef = useRef(null);
  const cropCanvasRef = useRef(null);
  const fileInputRef = useRef(null);
  const zxing1DReaderRef = useRef(null);
  const barcodeDetectorRef = useRef(null);
  const lastScannedTimeRef = useRef(0);

  // Inicializar lectores 1D al montar
  useEffect(() => {
    const hints = new Map([
      [
        ZXing.DecodeHintType.POSSIBLE_FORMATS,
        [
          ZXing.BarcodeFormat.EAN_13,
          ZXing.BarcodeFormat.EAN_8,
          ZXing.BarcodeFormat.CODE_128,
          ZXing.BarcodeFormat.CODE_39,
          ZXing.BarcodeFormat.CODE_93,
          ZXing.BarcodeFormat.UPC_A,
          ZXing.BarcodeFormat.UPC_E,
          ZXing.BarcodeFormat.ITF,
          ZXing.BarcodeFormat.CODABAR,
        ],
      ],
      [ZXing.DecodeHintType.TRY_HARDER, true],
    ]);

    zxing1DReaderRef.current = new ZXing.MultiFormatOneDReader(hints);

    if ("BarcodeDetector" in window) {
      try {
        barcodeDetectorRef.current = new window.BarcodeDetector({
          formats: [
            "ean_13",
            "ean_8",
            "code_128",
            "code_39",
            "code_93",
            "upc_a",
            "upc_e",
            "itf",
            "qr_code",
          ],
        });
      } catch (e) {}
    }
  }, []);

  // Manejar apertura y cierre del modal
  useEffect(() => {
    if (isOpen) {
      setScanError(null);
      setScannedResult(null);
      initCamera();
    } else {
      stopScanner();
    }
    return () => {
      stopScanner();
    };
  }, [isOpen]);

  const initCamera = async () => {
    try {
      const devs = await getCamerasList();
      const chosen = devs || selectedCamera || "";
      await startScannerWithDevice(chosen);
    } catch (e) {
      console.warn("Fallo iniciando escáner:", e);
      setScanError("No se pudo acceder a la cámara. Revisa los permisos o sube una imagen.");
    }
  };

  const getCamerasList = async () => {
    try {
      if (!navigator.mediaDevices?.enumerateDevices) return null;
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter((d) => d.kind === "videoinput");

      if (videoDevices.length > 0) {
        setCameras(videoDevices);
        const backCam = videoDevices.find(
          (d) =>
            d.label.toLowerCase().includes("back") ||
            d.label.toLowerCase().includes("trasera") ||
            d.label.toLowerCase().includes("posterior") ||
            d.label.toLowerCase().includes("environment"),
        );
        const chosen = backCam ? backCam.deviceId : videoDevices[0].deviceId;
        setSelectedCamera((prev) => prev || chosen);
        return chosen;
      }
    } catch (err) {
      console.warn("Error enumerando cámaras:", err);
    }
    return null;
  };

  const startScannerWithDevice = async (deviceId) => {
    stopScanner();
    setScanError(null);

    try {
      const constraints = {
        video: deviceId
          ? {
              deviceId: { exact: deviceId },
              width: { ideal: 1280 },
              height: { ideal: 720 },
              focusMode: "continuous",
            }
          : {
              facingMode: { ideal: "environment" },
              width: { ideal: 1280 },
              height: { ideal: 720 },
              focusMode: "continuous",
            },
        audio: false,
      };

      let stream = null;
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (errExact) {
        // Fallback a cualquier cámara si el deviceId estricto falla
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
      }

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      isScanningRef.current = true;
      setIsScanning(true);

      // Iniciar bucle de procesamiento
      animationFrameRef.current = requestAnimationFrame(scanLoop);
    } catch (err) {
      console.error("Error iniciando cámara:", err);
      setScanError(
        err.name === "NotAllowedError" || err.name === "PermissionDeniedError"
          ? "Permiso de cámara denegado. Por favor concede acceso a la cámara en tu navegador."
          : "No se pudo acceder a la cámara seleccionada. Intenta cambiar de dispositivo o subir una foto."
      );
      setIsScanning(false);
    }
  };

  const stopScanner = () => {
    isScanningRef.current = false;
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (streamRef.current) {
      try {
        streamRef.current.getTracks().forEach((track) => track.stop());
      } catch (e) {}
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsScanning(false);
    setTorchOn(false);
  };

  const handleCameraChange = async (newDeviceId) => {
    setSelectedCamera(newDeviceId);
    await startScannerWithDevice(newDeviceId);
  };

  const handleFlipCamera = async () => {
    if (cameras.length <= 1) return;
    const currentIndex = cameras.findIndex((c) => c.deviceId === selectedCamera);
    const nextIndex = (currentIndex + 1) % cameras.length;
    const nextDevice = cameras[nextIndex].deviceId;
    await handleCameraChange(nextDevice);
  };

  const toggleTorch = async () => {
    if (streamRef.current) {
      try {
        const track = streamRef.current.getVideoTracks()[0];
        if (track) {
          const newTorch = !torchOn;
          await track.applyConstraints({
            advanced: [{ torch: newTorch }],
          });
          setTorchOn(newTorch);
        }
      } catch (err) {
        console.warn("Linterna no disponible:", err);
      }
    }
  };

  const handleSuccessfulScan = (code) => {
    if (!code) return;
    const cleanCode = String(code).trim();
    if (!cleanCode) return;

    const now = Date.now();
    if (now - lastScannedTimeRef.current < 2000) return;
    lastScannedTimeRef.current = now;

    playBeep();
    if (navigator.vibrate) navigator.vibrate(100);

    setScannedResult(cleanCode);
    stopScanner();

    // Notificar al componente padre y cerrar tras breve retroalimentación visual
    setTimeout(() => {
      onScan?.(cleanCode);
      onClose?.();
    }, 400);
  };

  const decodeGrayscaleBuffer = (grayBuf, w, h) => {
    if (!zxing1DReaderRef.current) return null;

    try {
      const lum = new ZXing.RGBLuminanceSource(grayBuf, w, h);
      const bmp = new ZXing.BinaryBitmap(new ZXing.HybridBinarizer(lum));
      const res = zxing1DReaderRef.current.decode(bmp);
      if (res && res.text) return res.text;
    } catch (e) {}

    try {
      const lum = new ZXing.RGBLuminanceSource(grayBuf, w, h);
      const bmp = new ZXing.BinaryBitmap(new ZXing.GlobalHistogramBinarizer(lum));
      const res = zxing1DReaderRef.current.decode(bmp);
      if (res && res.text) return res.text;
    } catch (e) {}

    try {
      const enhBuf = enhanceLuminanceContrast(grayBuf);
      if (enhBuf !== grayBuf) {
        const lum = new ZXing.RGBLuminanceSource(enhBuf, w, h);
        const bmp = new ZXing.BinaryBitmap(new ZXing.HybridBinarizer(lum));
        const res = zxing1DReaderRef.current.decode(bmp);
        if (res && res.text) return res.text;
      }
    } catch (e) {}

    return null;
  };

  const scanLoop = async () => {
    if (!isScanningRef.current) return;

    const video = videoRef.current;
    if (!video || video.readyState < 2) {
      if (isScanningRef.current) {
        animationFrameRef.current = requestAnimationFrame(scanLoop);
      }
      return;
    }

    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (vw === 0 || vh === 0) {
      if (isScanningRef.current) {
        animationFrameRef.current = requestAnimationFrame(scanLoop);
      }
      return;
    }

    let detectedCode = null;

    // MOTOR 1: Hardware GPU BarcodeDetector
    if (barcodeDetectorRef.current) {
      try {
        const barcodes = await barcodeDetectorRef.current.detect(video);
        if (barcodes && barcodes.length > 0) {
          detectedCode = barcodes[0].rawValue;
        }
      } catch (e) {}
    }

    // MOTOR 2: Escaneo en visor central con zoom digital
    if (!detectedCode && zxing1DReaderRef.current) {
      try {
        const cropW = Math.floor(Math.min(vw, vw * (0.6 / zoomLevel)));
        const cropH = Math.floor(Math.min(vh, vh * (0.4 / zoomLevel)));
        const cropX = Math.floor((vw - cropW) / 2);
        const cropY = Math.floor((vh - cropH) / 2);

        if (!cropCanvasRef.current) {
          cropCanvasRef.current = document.createElement("canvas");
        }
        const cropCanvas = cropCanvasRef.current;
        if (cropCanvas.width !== cropW || cropCanvas.height !== cropH) {
          cropCanvas.width = cropW;
          cropCanvas.height = cropH;
        }

        const cropCtx = cropCanvas.getContext("2d", { willReadFrequently: true });
        cropCtx.drawImage(video, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

        const imgData = cropCtx.getImageData(0, 0, cropW, cropH);
        const data = imgData.data;
        const grayBuffer = new Uint8ClampedArray(cropW * cropH);
        for (let i = 0, j = 0; i < data.length; i += 4, j++) {
          grayBuffer[j] = (data[i] * 306 + data[i + 1] * 601 + data[i + 2] * 117) >> 10;
        }

        detectedCode = decodeGrayscaleBuffer(grayBuffer, cropW, cropH);
      } catch (e) {}
    }

    if (detectedCode) {
      handleSuccessfulScan(detectedCode);
      return;
    }

    if (isScanningRef.current) {
      animationFrameRef.current = requestAnimationFrame(scanLoop);
    }
  };

  const handleImageUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const img = new Image();
    const reader = new FileReader();
    reader.onload = (evt) => {
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0);

        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imgData.data;
        const grayBuffer = new Uint8ClampedArray(canvas.width * canvas.height);
        for (let i = 0, j = 0; i < data.length; i += 4, j++) {
          grayBuffer[j] = (data[i] * 306 + data[i + 1] * 601 + data[i + 2] * 117) >> 10;
        }

        const detected = decodeGrayscaleBuffer(grayBuffer, canvas.width, canvas.height);
        if (detected) {
          handleSuccessfulScan(detected);
        } else {
          setScanError("No se detectó un código de barras legible en la imagen. Intenta con una toma más enfocada.");
        }
      };
      img.src = evt.target.result;
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[70] bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-lg shadow-2xl flex flex-col overflow-hidden">
        {/* Cabecera */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/70">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shadow-inner">
              <ScanBarcode className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-white leading-tight">
                {title}
              </h3>
              <p className="text-[11px] text-slate-400 mt-0.5">{subtitle}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
            title="Cerrar escáner"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Contenido / Viewport de Cámara */}
        <div className="p-4 space-y-3 flex-1 flex flex-col">
          {/* Alerta de Error si hay */}
          {scanError && (
            <div className="p-3 rounded-xl bg-amber-950/60 border border-amber-800/80 text-amber-200 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-amber-400" />
              <span className="flex-1">{scanError}</span>
            </div>
          )}

          {/* Visor de Video */}
          <div className="relative bg-slate-950 rounded-2xl border border-slate-800 overflow-hidden aspect-[4/3] flex items-center justify-center shadow-inner">
            <video
              ref={videoRef}
              playsInline
              muted
              autoPlay
              style={{
                transform: `scale(${zoomLevel})`,
                transformOrigin: "center center",
                transition: "transform 0.2s ease-out",
              }}
              className={`w-full h-full object-cover ${isScanning ? "block" : "hidden"}`}
            />

            {/* Overlays cuando está escaneando */}
            {isScanning && !scannedResult && (
              <div className="absolute inset-0 pointer-events-none flex flex-col justify-between p-3">
                {/* Controles superiores (Zoom & Flash) */}
                <div className="flex items-center justify-between pointer-events-auto">
                  <div className="flex items-center gap-1 bg-slate-950/85 backdrop-blur-md p-1 rounded-xl border border-slate-700/80 shadow-lg">
                    <span className="text-[10px] font-bold text-slate-400 px-1.5 flex items-center gap-1">
                      <ZoomIn className="w-3 h-3 text-emerald-400" />
                      Zoom:
                    </span>
                    {[1, 1.5, 2, 2.5].map((z) => (
                      <button
                        key={z}
                        type="button"
                        onClick={() => setZoomLevel(z)}
                        className={`px-2 py-0.5 rounded-lg text-xs font-bold transition ${
                          zoomLevel === z
                            ? "bg-emerald-500 text-slate-950 shadow"
                            : "text-slate-300 hover:text-white bg-slate-800/80"
                        }`}
                      >
                        {z}x
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center gap-1.5 pointer-events-auto">
                    {cameras.length > 1 && (
                      <button
                        type="button"
                        onClick={handleFlipCamera}
                        className="p-2 rounded-xl bg-slate-950/85 text-slate-300 hover:text-white border border-slate-700/80 backdrop-blur-md shadow-lg transition"
                        title="Cambiar cámara"
                      >
                        <SwitchCamera className="w-4 h-4 text-emerald-400" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={toggleTorch}
                      className={`p-2 rounded-xl border shadow-lg transition ${
                        torchOn
                          ? "bg-amber-500 text-slate-950 border-amber-400"
                          : "bg-slate-950/85 text-slate-300 border-slate-700/80 hover:text-white"
                      }`}
                      title="Linterna / Flash"
                    >
                      <Flashlight className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Retícula central de enfoque con láser animado */}
                <div className="self-center w-4/5 h-28 border-2 border-emerald-500/80 rounded-2xl relative shadow-2xl overflow-hidden pointer-events-none">
                  <div className="absolute inset-x-0 h-0.5 bg-gradient-to-r from-transparent via-emerald-400 to-transparent scanner-laser shadow-lg shadow-emerald-400"></div>
                  <div className="absolute top-0 left-0 w-3 h-3 border-t-2 border-l-2 border-emerald-400"></div>
                  <div className="absolute top-0 right-0 w-3 h-3 border-t-2 border-r-2 border-emerald-400"></div>
                  <div className="absolute bottom-0 left-0 w-3 h-3 border-b-2 border-l-2 border-emerald-400"></div>
                  <div className="absolute bottom-0 right-0 w-3 h-3 border-b-2 border-r-2 border-emerald-400"></div>
                </div>

                {/* Mensaje inferior */}
                <div className="text-center pointer-events-auto">
                  <span className="text-[11px] font-medium text-white/90 bg-slate-950/80 backdrop-blur-md px-3 py-1 rounded-full border border-slate-800">
                    Centra el código de barras en la retícula
                  </span>
                </div>
              </div>
            )}

            {/* Pantalla de Éxito al detectar */}
            {scannedResult && (
              <div className="absolute inset-0 bg-slate-950/95 flex flex-col items-center justify-center p-4 text-center space-y-2 animate-in fade-in">
                <CheckCircle2 className="w-12 h-12 text-emerald-400 animate-bounce" />
                <h4 className="text-base font-bold text-white">¡Código Detectado!</h4>
                <div className="px-4 py-1.5 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 font-mono text-sm font-bold">
                  {scannedResult}
                </div>
                <p className="text-xs text-slate-400">Aplicando al campo...</p>
              </div>
            )}

            {/* Pantalla cuando la cámara está apagada o cargando */}
            {!isScanning && !scannedResult && (
              <div className="p-6 text-center flex flex-col items-center justify-center space-y-3">
                <div className="w-14 h-14 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-400 shadow-lg">
                  <Camera className="w-7 h-7 text-emerald-400" />
                </div>
                <div>
                  <h4 className="text-xs sm:text-sm font-bold text-white">
                    Iniciando Cámara...
                  </h4>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Asegúrate de conceder permisos de acceso a la cámara.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={initCamera}
                  className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition shadow-lg shadow-emerald-600/30"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Reintentar Conexión</span>
                </button>
              </div>
            )}
          </div>

          {/* Selector de Dispositivos y Cargar Imagen */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-2 pt-1 text-xs text-slate-400">
            {cameras.length > 1 ? (
              <div className="w-full sm:w-auto flex-1 max-w-xs">
                <select
                  value={selectedCamera}
                  onChange={(e) => handleCameraChange(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1.5 text-slate-300 text-xs focus:outline-none focus:border-emerald-500"
                >
                  {cameras.map((cam, idx) => (
                    <option key={cam.deviceId || idx} value={cam.deviceId}>
                      {cam.label || `Cámara ${idx + 1}`}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="text-[11px] text-slate-500">
                Soporta EAN-13, UPC-A, UPC-E, Code 128
              </div>
            )}

            {/* Botón para subir archivo de imagen si la cámara falla */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleImageUpload}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full sm:w-auto px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl text-xs font-semibold border border-slate-700 transition flex items-center justify-center gap-1.5"
            >
              <Upload className="w-3.5 h-3.5 text-emerald-400" />
              <span>Subir Foto / Imagen</span>
            </button>
          </div>
        </div>

        {/* Pie de modal */}
        <div className="p-3 border-t border-slate-800/80 bg-slate-950/50 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl text-xs font-semibold transition"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}

