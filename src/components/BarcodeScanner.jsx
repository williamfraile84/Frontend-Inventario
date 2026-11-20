import React, { useState, useEffect, useRef, useCallback } from "react";
import ZXing from "html5-qrcode/third_party/zxing-js.umd.js";
import {
  Camera,
  CameraOff,
  Flashlight,
  Search,
  Volume2,
  VolumeX,
  Keyboard,
  ZoomIn,
  ScanBarcode,
  Info,
  SwitchCamera,
  Image as ImageIcon,
} from "lucide-react";
import {
  playBeep,
  enhanceLuminanceContrast,
  createZXing1DReader,
  createBarcodeDetector,
} from "../utils/scannerEngine";

export default function BarcodeScanner({
  onScan,
  isSearching,
  isTvMode = false,
  isPaused = false,
  onResumeScan = null,
  cameraTrigger = 0,
}) {
  const [isScanning, setIsScanning] = useState(false);
  const [manualCode, setManualCode] = useState("");
  const [cameras, setCameras] = useState([]);
  const [selectedCamera, setSelectedCamera] = useState("");
  const [torchOn, setTorchOn] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [scanError, setScanError] = useState(null);
  const [lastDetected, setLastDetected] = useState(null);
  const [zoomLevel, setZoomLevel] = useState(1); // 1x, 1.5x, 2x, 2.5x

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const isScanningRef = useRef(false);
  const animationFrameRef = useRef(null);
  const cropCanvasRef = useRef(null);
  const fullCanvasRef = useRef(null);
  const fileGalleryInputRef = useRef(null);
  const fileCameraInputRef = useRef(null);
  const zxing1DReaderRef = useRef(null);
  const barcodeDetectorRef = useRef(null);
  const lastScannedRef = useRef({ code: "", time: 0 });
  const tickCountRef = useRef(0);
  const isSearchingRef = useRef(isSearching);
  const isPausedRef = useRef(isPaused);
  const lastTriggerRef = useRef(0);

  useEffect(() => {
    isSearchingRef.current = isSearching;
  }, [isSearching]);

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
      console.warn("Cámaras no disponibles:", err);
    }
    return null;
  };

  const stopScanner = useCallback(() => {
    isScanningRef.current = false;
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (streamRef.current) {
      try {
        streamRef.current.getTracks().forEach((track) => track.stop());
      } catch {}
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsScanning(false);
    setTorchOn(false);
  }, []);

  const handleCameraChange = async (newDeviceId) => {
    setSelectedCamera(newDeviceId);
    if (isScanningRef.current) {
      stopScanner();
      setTimeout(() => {
        startScannerWithDevice(newDeviceId);
      }, 150);
    }
  };

  const handleZoomChange = async (newZoom) => {
    setZoomLevel(newZoom);
    if (streamRef.current) {
      try {
        const track = streamRef.current.getVideoTracks()[0];
        const capabilities = track?.getCapabilities?.();
        if (capabilities && "zoom" in capabilities) {
          const minZ = capabilities.zoom.min || 1;
          const maxZ = capabilities.zoom.max || 4;
          const targetZ = Math.max(minZ, Math.min(maxZ, newZoom));
          await track.applyConstraints({
            advanced: [{ zoom: targetZ }],
          });
        }
      } catch (err) {
        console.debug("Hardware zoom fallback to CSS scale:", err);
      }
    }
  };

  const handleSuccessfulScan = useCallback(
    (code) => {
      if (!code || isSearchingRef.current || isPausedRef.current) return;
      const cleanCode = String(code).trim();
      if (!cleanCode) return;

      const now = Date.now();
      if (
        cleanCode === lastScannedRef.current.code &&
        now - lastScannedRef.current.time < 3000
      ) {
        return;
      }

      lastScannedRef.current = { code: cleanCode, time: now };
      setLastDetected(cleanCode);
      setTimeout(() => {
        setLastDetected(null);
      }, 4000);

      if (soundEnabled) playBeep();
      if (navigator.vibrate) navigator.vibrate(100);

      // CRÍTICO: Desactivar y detener completamente la cámara y el escaneo de inmediato
      stopScanner();

      onScan(cleanCode);
    },
    [soundEnabled, stopScanner, onScan]
  );

  const decodeGrayscaleBuffer = (grayBuf, w, h) => {
    if (!zxing1DReaderRef.current) return null;

    try {
      const lum = new ZXing.RGBLuminanceSource(grayBuf, w, h);
      const bmp = new ZXing.BinaryBitmap(new ZXing.HybridBinarizer(lum));
      const res = zxing1DReaderRef.current.decode(bmp);
      if (res && res.text) return res.text;
    } catch {}

    try {
      const lum = new ZXing.RGBLuminanceSource(grayBuf, w, h);
      const bmp = new ZXing.BinaryBitmap(
        new ZXing.GlobalHistogramBinarizer(lum),
      );
      const res = zxing1DReaderRef.current.decode(bmp);
      if (res && res.text) return res.text;
    } catch {}

    try {
      const enhBuf = enhanceLuminanceContrast(grayBuf);
      if (enhBuf !== grayBuf) {
        const lum = new ZXing.RGBLuminanceSource(enhBuf, w, h);
        const bmp = new ZXing.BinaryBitmap(new ZXing.HybridBinarizer(lum));
        const res = zxing1DReaderRef.current.decode(bmp);
        if (res && res.text) return res.text;
      }
    } catch {}

    return null;
  };

  const scanLoop = useCallback(
    async function runScanLoop() {
      if (!isScanningRef.current) return;

      const video = videoRef.current;
      if (!video || video.readyState < 2) {
        if (isScanningRef.current)
          animationFrameRef.current = requestAnimationFrame(runScanLoop);
        return;
      }

      const vw = video.videoWidth;
      const vh = video.videoHeight;
      if (vw === 0 || vh === 0) {
        if (isScanningRef.current)
          animationFrameRef.current = requestAnimationFrame(runScanLoop);
        return;
      }

      tickCountRef.current++;
      let detectedCode = null;

      // MOTOR 1: Hardware GPU BarcodeDetector
      if (barcodeDetectorRef.current) {
        try {
          const barcodes = await barcodeDetectorRef.current.detect(video);
          if (barcodes && barcodes.length > 0) {
            detectedCode = barcodes[0].rawValue;
          }
        } catch {}
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

          const cropCtx = cropCanvas.getContext("2d", {
            willReadFrequently: true,
          });
          cropCtx.drawImage(
            video,
            cropX,
            cropY,
            cropW,
            cropH,
            0,
            0,
            cropW,
            cropH,
          );

          const imgData = cropCtx.getImageData(0, 0, cropW, cropH);
          const data = imgData.data;
          const grayBuffer = new Uint8ClampedArray(cropW * cropH);

          for (let i = 0, j = 0; i < data.length; i += 4, j++) {
            grayBuffer[j] =
              (data[i] * 306 + data[i + 1] * 601 + data[i + 2] * 117) >> 10;
          }

          detectedCode = decodeGrayscaleBuffer(grayBuffer, cropW, cropH);
        } catch {}
      }

      // MOTOR 3: Cuadro completo cada 4 ticks
      if (
        !detectedCode &&
        zxing1DReaderRef.current &&
        tickCountRef.current % 4 === 0
      ) {
        try {
          if (!fullCanvasRef.current) {
            fullCanvasRef.current = document.createElement("canvas");
          }
          const fullCanvas = fullCanvasRef.current;
          const scaleW = 640;
          const scaleH = Math.floor((vh / vw) * 640);
          if (fullCanvas.width !== scaleW || fullCanvas.height !== scaleH) {
            fullCanvas.width = scaleW;
            fullCanvas.height = scaleH;
          }
          const fullCtx = fullCanvas.getContext("2d", {
            willReadFrequently: true,
          });
          fullCtx.drawImage(video, 0, 0, scaleW, scaleH);

          const imgData = fullCtx.getImageData(0, 0, scaleW, scaleH);
          const data = imgData.data;
          const grayBuffer = new Uint8ClampedArray(scaleW * scaleH);
          for (let i = 0, j = 0; i < data.length; i += 4, j++) {
            grayBuffer[j] =
              (data[i] * 306 + data[i + 1] * 601 + data[i + 2] * 117) >> 10;
          }

          detectedCode = decodeGrayscaleBuffer(grayBuffer, scaleW, scaleH);
        } catch {}
      }

      if (detectedCode && !isSearchingRef.current) {
        handleSuccessfulScan(detectedCode);
      }

      if (isScanningRef.current) {
        setTimeout(() => {
          if (isScanningRef.current) {
            animationFrameRef.current = requestAnimationFrame(runScanLoop);
          }
        }, 50);
      }
    },
    [handleSuccessfulScan, zoomLevel]
  );

  const startScannerWithDevice = useCallback(
    async (deviceId) => {
      setScanError(null);
      try {
        if (streamRef.current) stopScanner();

        const preferredConstraints = deviceId
          ? {
              video: {
                deviceId: { exact: deviceId },
                width: { ideal: 1280, min: 640 },
                height: { ideal: 720, min: 480 },
              },
            }
          : {
              video: {
                facingMode: { ideal: "environment" },
                width: { ideal: 1280, min: 640 },
                height: { ideal: 720, min: 480 },
              },
            };

        let mediaStream = null;
        try {
          mediaStream =
            await navigator.mediaDevices.getUserMedia(preferredConstraints);
        } catch {
          try {
            mediaStream = await navigator.mediaDevices.getUserMedia({
              video: deviceId ? { deviceId: { exact: deviceId } } : true,
            });
          } catch {
            mediaStream = await navigator.mediaDevices.getUserMedia({
              video: true,
            });
          }
        }

        if (!mediaStream)
          throw new Error("No se pudo iniciar la cámara seleccionada.");

        streamRef.current = mediaStream;
        setIsScanning(true);
        isScanningRef.current = true;

        // Asignar el stream directamente al elemento video
        const videoEl = videoRef.current;
        if (videoEl) {
          videoEl.srcObject = mediaStream;
          videoEl.setAttribute("playsinline", "true");
          videoEl.setAttribute("autoplay", "true");
          videoEl.setAttribute("muted", "true");
          try {
            await videoEl.play();
          } catch (playErr) {
            console.warn("Autoplay play error:", playErr);
          }
        }

        // Aplicar zoom de inmediato
        handleZoomChange(zoomLevel);

        // Refrescar lista de cámaras
        getCamerasList();

        animationFrameRef.current = requestAnimationFrame(scanLoop);
      } catch (err) {
        console.error("Error cámara:", err);
        setScanError(
          "No se pudo acceder a la cámara. Asegúrate de otorgar permisos o utiliza el ingreso manual / foto.",
        );
        setIsScanning(false);
        isScanningRef.current = false;
      }
    },
    [stopScanner, zoomLevel, scanLoop]
  );

  const startScanner = useCallback(async () => {
    let chosen = selectedCamera || (await getCamerasList());
    await startScannerWithDevice(chosen);
  }, [selectedCamera, startScannerWithDevice]);

  // Observar estado de pausa
  useEffect(() => {
    isPausedRef.current = isPaused;
    if (isPaused) {
      Promise.resolve().then(() => {
        stopScanner();
      });
    }
  }, [isPaused, stopScanner]);

  // Activar automáticamente la cámara cuando se presiona "Consultar otro producto"
  useEffect(() => {
    if (cameraTrigger > 0 && cameraTrigger !== lastTriggerRef.current && !isPaused) {
      lastTriggerRef.current = cameraTrigger;
      const timer = setTimeout(() => {
        if (!isScanningRef.current) {
          startScanner();
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [cameraTrigger, isPaused, startScanner]);

  // Inicializar decodificadores 1D y listener global para lectores USB
  useEffect(() => {
    zxing1DReaderRef.current = createZXing1DReader();
    barcodeDetectorRef.current = createBarcodeDetector();

    Promise.resolve().then(() => {
      getCamerasList();
    });

    // Listener global para lectores USB físicos
    let keyBuffer = "";
    let lastKeyTime = 0;
    const handleGlobalKeyDown = (e) => {
      if (isPausedRef.current) return;
      const activeTag = document.activeElement
        ? document.activeElement.tagName.toLowerCase()
        : "";
      const isInput = activeTag === "input" || activeTag === "textarea";

      const now = Date.now();
      if (now - lastKeyTime > 70) {
        keyBuffer = "";
      }
      lastKeyTime = now;

      if (e.key === "Enter") {
        if (keyBuffer.trim().length >= 3) {
          if (!isSearchingRef.current && !isPausedRef.current) {
            handleSuccessfulScan(keyBuffer.trim());
          }
          keyBuffer = "";
        }
      } else if (e.key && e.key.length === 1 && !isInput) {
        keyBuffer += e.key;
      }
    };

    window.addEventListener("keydown", handleGlobalKeyDown);

    return () => {
      stopScanner();
      window.removeEventListener("keydown", handleGlobalKeyDown);
    };
  }, [handleSuccessfulScan, stopScanner]);

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
        console.warn("Linterna no disponible en este dispositivo:", err);
        alert(
          "La función de linterna/flash no es compatible con el navegador o cámara actual.",
        );
      }
    } else {
      alert("Enciende la cámara primero para usar la linterna.");
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
          grayBuffer[j] =
            (data[i] * 306 + data[i + 1] * 601 + data[i + 2] * 117) >> 10;
        }

        const detected = decodeGrayscaleBuffer(
          grayBuffer,
          canvas.width,
          canvas.height,
        );
        if (detected) {
          handleSuccessfulScan(detected);
        } else {
          alert(
            "No se detectó un código de barras legible en el archivo. Intenta con una imagen más nítida.",
          );
        }
      };
      img.src = evt.target.result;
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleManualSubmit = (e) => {
    e.preventDefault();
    if (manualCode.trim() && !isSearchingRef.current) {
      if (soundEnabled) playBeep();
      handleSuccessfulScan(manualCode.trim());
      setManualCode("");
    }
  };

  return (
    <div
      className={`bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-6 shadow-sm dark:shadow-xl relative overflow-hidden ${
        isTvMode ? "text-base" : ""
      }`}
    >
      {/* Overlay de Bloqueo durante Búsqueda */}
      {isSearching && (
        <div className="absolute inset-0 z-50 bg-slate-950/90 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center rounded-2xl animate-in fade-in duration-150">
          <div className="relative mb-3">
            <div className="w-16 h-16 rounded-full border-4 border-emerald-500/20 border-t-emerald-500 animate-spin"></div>
            <ScanBarcode className="w-7 h-7 text-emerald-400 absolute inset-0 m-auto animate-pulse" />
          </div>
          <h4 className="text-base font-bold text-white mb-1">
            Consultando Producto en POS...
          </h4>
          {lastDetected && (
            <div className="my-2 px-3.5 py-1 rounded-full bg-slate-900 border border-emerald-500/40 text-emerald-400 font-mono text-xs font-bold inline-flex items-center gap-1.5 shadow-sm">
              <span>Código:</span>
              <span className="text-white">{lastDetected}</span>
            </div>
          )}
          <p className="text-xs text-slate-400 max-w-xs mt-1">
            Validando en caja POS. Bloqueando nuevas lecturas para evitar cruce
            de productos...
          </p>
        </div>
      )}

      {/* Banner de Escáner en Pausa cuando hay un producto activo */}
      {isPaused && (
        <div className="mb-4 p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between gap-3 text-amber-700 dark:text-amber-300 text-xs shadow-md animate-in fade-in">
          <div className="flex items-center gap-2.5">
            <span className="relative flex h-2.5 w-2.5 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500"></span>
            </span>
            <div>
              <p className="font-bold text-amber-800 dark:text-amber-200">
                Lector de Cámara Desactivado
              </p>
              <p className="text-[11px] text-amber-700/80 dark:text-amber-300/80">
                La cámara se apagó automáticamente para evitar sobreescritura
                accidental mientras revisas el producto.
              </p>
            </div>
          </div>
          {onResumeScan && (
            <button
              onClick={onResumeScan}
              className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-lg transition shrink-0 shadow cursor-pointer"
            >
              Consultar Otro
            </button>
          )}
        </div>
      )}

      {/* Header with Camera controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4 pb-3 border-b border-slate-200 dark:border-slate-800/80">
        <div className="flex items-center gap-2.5">
          <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/30">
            <ScanBarcode className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white leading-tight">
              Lector y Escáner de Código de Barras
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Cámara en Vivo, Subida de Archivos, Fotos, Pistolas USB y Teclado
            </p>
          </div>
        </div>

        {/* Action Buttons: Sound, Flash/Linterna, Upload Image, Take Photo */}
        <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-950/80 p-1.5 rounded-xl border border-slate-200 dark:border-slate-800 flex-wrap">
          {/* Beep sound toggle */}
          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className={`p-2 rounded-lg text-xs font-medium transition cursor-pointer ${
              soundEnabled
                ? "text-emerald-600 dark:text-emerald-400 bg-white dark:bg-slate-800/80 shadow-xs"
                : "text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
            }`}
            title={soundEnabled ? "Sonido activado" : "Sonido desactivado"}
          >
            {soundEnabled ? (
              <Volume2 className="w-4 h-4" />
            ) : (
              <VolumeX className="w-4 h-4" />
            )}
          </button>

          {/* Flashlight / Linterna ALWAYS AVAILABLE */}
          <button
            onClick={toggleTorch}
            className={`p-2 rounded-lg text-xs font-medium transition cursor-pointer ${
              torchOn
                ? "text-amber-800 dark:text-amber-400 bg-amber-100 dark:bg-amber-500/20 border border-amber-300 dark:border-amber-500/40"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-transparent"
            }`}
            title="Encender / Apagar Flash o Linterna"
          >
            <Flashlight className="w-4 h-4" />
          </button>

          {/* Input 1: Cargar Archivo / Imagen desde Galería (SIN capture) */}
          <input
            type="file"
            ref={fileGalleryInputRef}
            onChange={handleImageUpload}
            accept="image/*"
            className="hidden"
          />

          {/* Input 2: Tomar Foto directa con Cámara de Celular (CON capture) */}
          <input
            type="file"
            ref={fileCameraInputRef}
            onChange={handleImageUpload}
            accept="image/*"
            capture="environment"
            className="hidden"
          />

          {/* Botón Cargar Imagen / Archivo */}
          <button
            onClick={() => fileGalleryInputRef.current?.click()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold border border-slate-200 dark:border-slate-700 transition cursor-pointer"
            title="Subir archivo o foto desde la galería / computador"
          >
            <ImageIcon className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400" />
            <span>Subir Imagen</span>
          </button>

          {/* Botón Tomar Foto Móvil */}
          <button
            onClick={() => fileCameraInputRef.current?.click()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold border border-slate-200 dark:border-slate-700 transition cursor-pointer"
            title="Tomar foto instantánea del código con la cámara nativa"
          >
            <Camera className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            <span className="hidden sm:inline">Tomar Foto</span>
          </button>
        </div>
      </div>

      {/* Selector de Cámaras Detectadas (Dropdown) */}
      <div className="mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 rounded-xl">
        <div className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 font-semibold">
          <SwitchCamera className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          <span>Cámara Detectada:</span>
        </div>
        <select
          value={selectedCamera}
          onChange={(e) => handleCameraChange(e.target.value)}
          className="px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-xs text-slate-900 dark:text-white focus:border-emerald-500 focus:outline-none max-w-full sm:max-w-xs truncate cursor-pointer"
        >
          {cameras.length > 0 ? (
            cameras.map((cam, idx) => (
              <option key={cam.deviceId || idx} value={cam.deviceId}>
                {cam.label ||
                  `Cámara ${idx + 1} (${idx === 0 ? "Principal" : "Secundaria"})`}
              </option>
            ))
          ) : (
            <option value="">Cámara Predeterminada</option>
          )}
        </select>
      </div>

      {scanError && (
        <div className="mb-4 p-3 rounded-xl bg-amber-50 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-800/80 text-amber-800 dark:text-amber-200 text-xs flex items-center gap-2">
          <Info className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <span>{scanError}</span>
        </div>
      )}

      {/* Main Scanner Section Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
        {/* Camera Viewport Container */}
        <div className="lg:col-span-7 bg-slate-950 rounded-2xl border border-slate-800 overflow-hidden relative min-h-[260px] sm:min-h-[320px] flex flex-col items-center justify-center shadow-inner">
          {/* Video siempre montado para prevenir unmount ref bugs con escala CSS interactiva */}
          <video
            ref={videoRef}
            playsInline
            muted
            autoPlay
            style={{
              transform: `scale(${zoomLevel})`,
              transformOrigin: "center center",
              transition: "transform 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
            }}
            className={`w-full h-full object-cover max-h-[360px] sm:max-h-[420px] ${
              isScanning ? "block" : "hidden"
            }`}
          />

          {isScanning ? (
            <div className="absolute inset-0 pointer-events-none flex flex-col justify-between p-3 sm:p-4">
              {/* TOP OVERLAYS DENTRO DE LA CÁMARA */}
              <div className="flex items-center justify-between pointer-events-auto">
                {/* ZOOM CONTROLS DENTRO DEL CAMPO DE LA CÁMARA */}
                <div className="flex items-center gap-1 bg-slate-950/85 backdrop-blur-md p-1 rounded-xl border border-slate-700/80 shadow-lg">
                  <span className="text-[10px] uppercase font-bold text-slate-400 px-1.5 flex items-center gap-1">
                    <ZoomIn className="w-3 h-3 text-emerald-400" />
                    Zoom:
                  </span>
                  {[1, 1.5, 2, 2.5].map((z) => (
                    <button
                      key={z}
                      type="button"
                      onClick={() => handleZoomChange(z)}
                      className={`px-2 py-1 rounded-lg text-xs font-bold transition ${
                        zoomLevel === z
                          ? "bg-emerald-500 text-slate-950 shadow-md scale-105"
                          : "text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-700"
                      }`}
                    >
                      {z}x
                    </button>
                  ))}
                </div>

                {/* FLASH BUTTON DENTRO DE LA CÁMARA */}
                <button
                  type="button"
                  onClick={toggleTorch}
                  className={`p-2 rounded-xl backdrop-blur-md border shadow-lg transition pointer-events-auto ${
                    torchOn
                      ? "bg-amber-500 text-slate-950 border-amber-400"
                      : "bg-slate-950/80 text-slate-300 border-slate-700/80 hover:text-white"
                  }`}
                  title="Flash / Linterna"
                >
                  <Flashlight className="w-4 h-4" />
                </button>
              </div>

              {/* Guía de enfoque central y láser */}
              <div className="self-center w-4/5 sm:w-3/5 h-28 sm:h-36 border-2 border-emerald-500/80 rounded-2xl relative shadow-2xl overflow-hidden pointer-events-none">
                <div className="absolute inset-x-0 h-0.5 bg-gradient-to-r from-transparent via-emerald-400 to-transparent scanner-laser shadow-lg shadow-emerald-400"></div>
                <div className="absolute top-0 left-0 w-3 h-3 border-t-2 border-l-2 border-emerald-400"></div>
                <div className="absolute top-0 right-0 w-3 h-3 border-t-2 border-r-2 border-emerald-400"></div>
                <div className="absolute bottom-0 left-0 w-3 h-3 border-b-2 border-l-2 border-emerald-400"></div>
                <div className="absolute bottom-0 right-0 w-3 h-3 border-b-2 border-r-2 border-emerald-400"></div>
              </div>

              {/* BOTTOM CONTROLS DENTRO DE LA CÁMARA */}
              <div className="flex items-center justify-end pointer-events-auto">
                <button
                  type="button"
                  onClick={stopScanner}
                  className="px-3.5 py-1.5 rounded-xl bg-slate-900/90 hover:bg-rose-900/90 text-white text-xs font-semibold backdrop-blur-md border border-slate-700/80 shadow-lg flex items-center gap-1.5 transition"
                >
                  <CameraOff className="w-3.5 h-3.5" />
                  <span>Apagar Cámara</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="p-6 text-center flex flex-col items-center justify-center space-y-4">
              <div className="w-16 h-16 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-400 shadow-lg">
                <Camera className="w-8 h-8 text-emerald-400" />
              </div>
              <div>
                <h4 className="text-sm sm:text-base font-bold text-white">
                  Cámara Desactivada
                </h4>
                <p className="text-xs text-slate-400 max-w-xs mt-1">
                  Enciende la cámara para escanear en tiempo real, sube una
                  imagen o utiliza el lector USB
                </p>
              </div>

              <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                <button
                  onClick={startScanner}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-lg shadow-emerald-600/30 transition hover:scale-105 active:scale-95 cursor-pointer"
                >
                  <Camera className="w-4 h-4" />
                  <span>Encender Cámara</span>
                </button>

                <button
                  onClick={() => fileGalleryInputRef.current?.click()}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold border border-slate-300 dark:border-slate-700 transition cursor-pointer"
                >
                  <ImageIcon className="w-4 h-4 text-blue-500 dark:text-blue-400" />
                  <span>Subir Imagen</span>
                </button>

                <button
                  onClick={() => fileCameraInputRef.current?.click()}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold border border-slate-300 dark:border-slate-700 transition cursor-pointer"
                >
                  <Camera className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <span>Tomar Foto</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Manual Code Input & USB Scanner Status */}
        <div className="lg:col-span-5 flex flex-col justify-between space-y-4 bg-slate-50 dark:bg-slate-950/50 p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400 block mb-1">
              Ingreso Manual o Pistola USB
            </span>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
              Si usas lector USB físico, apunta y dispara en cualquier momento.
              También puedes digitar el código:
            </p>

            <form onSubmit={handleManualSubmit} className="space-y-3">
              <div className="relative">
                <Keyboard className="w-4 h-4 text-slate-400 dark:text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={manualCode}
                  onChange={(e) => setManualCode(e.target.value)}
                  placeholder="Ej: 7702001001234"
                  className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-sm font-mono font-bold text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={!manualCode.trim() || isSearching}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-lg shadow-emerald-600/30 transition disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                <Search className="w-4 h-4" />
                <span>Consultar Código</span>
              </button>
            </form>
          </div>

          {/* USB Scanner Active Indicator */}
          <div className="pt-3 border-t border-slate-200 dark:border-slate-800/80 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span className="text-[11px] font-medium text-slate-700 dark:text-slate-300">
                Lector USB / Teclado Listo
              </span>
            </div>
            <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono">
              Auto-detección ON
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
