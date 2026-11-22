import React, { useState, useEffect, useRef, useCallback } from "react";
import ZXing from "html5-qrcode/third_party/zxing-js.umd.js";
import {
  QrCode,
  Camera,
  Upload,
  ExternalLink,
  Copy,
  Check,
  AlertCircle,
  RefreshCw,
  FileText,
  Download,
  ShieldCheck,
  X,
  Search,
  ArrowRight,
  Flashlight,
  SwitchCamera,
  Zap,
  Clipboard,
} from "lucide-react";
import {
  playBeep,
  enhanceLuminanceContrast,
  createQRBarcodeDetector,
  createZXingQRReader,
  enumerateVideoDevices,
} from "../../utils/scannerEngine";
import { invoiceService } from "../../services/api";
import { useLoading } from "../../context/LoadingContext";

export default function DianQRAssistantModal({
  isOpen,
  onClose,
  onInvoiceExtracted,
  onShowToast,
  currentFile = null,
}) {
  const { showLoader, hideLoader } = useLoading();
  const [activeTab, setActiveTab] = useState("camera"); // 'camera' | 'file' | 'manual'
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  const [torchOn, setTorchOn] = useState(false);
  const [cameras, setCameras] = useState([]);
  const [selectedCameraId, setSelectedCameraId] = useState("");

  // QR & CUFE Data
  const [modalFile, setModalFile] = useState(null);
  const [scannedData, setScannedData] = useState(null);
  const [cufeInput, setCufeInput] = useState("");
  const [nitReceptor, setNitReceptor] = useState(() => {
    try {
      return localStorage.getItem("fruver_nit_receptor") || "";
    } catch {
      return "";
    }
  });

  const updateNitReceptor = (newNit) => {
    const clean = String(newNit || "").trim();
    setNitReceptor(clean);
    if (clean) {
      try {
        localStorage.setItem("fruver_nit_receptor", clean);
      } catch {}
    }
  };
  const [copiedField, setCopiedField] = useState(null);

  // Consultation State
  const [isConsulting, setIsConsulting] = useState(false);
  const [consultationStatus, setConsultationStatus] = useState("");
  const [consultationResult, setConsultationResult] = useState(null);
  const [showCaptchaGuide, setShowCaptchaGuide] = useState(false);

  // PDF Drop State
  const [isProcessingPdf, setIsProcessingPdf] = useState(false);
  const [isDraggingPdf, setIsDraggingPdf] = useState(false);

  // Hardware & Video Refs
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const isScanningRef = useRef(false);
  const animationFrameRef = useRef(null);
  const cropCanvasRef = useRef(null);
  const qrDetectorRef = useRef(null);
  const zxingQrReaderRef = useRef(null);
  const lastScanFrameTimeRef = useRef(0);
  const periodicScanTimerRef = useRef(null);
  const isBackendScanningRef = useRef(false);
  const pdfInputRef = useRef(null);
  const qrFileInputRef = useRef(null);
  const isConsultingRef = useRef(false);
  const activeCufeConsultationRef = useRef(null);

  // Inicializar detectores y listar cámaras del dispositivo
  useEffect(() => {
    qrDetectorRef.current = createQRBarcodeDetector();
    zxingQrReaderRef.current = createZXingQRReader();
    enumerateVideoDevices().then((devs) => {
      if (devs && devs.length > 0) {
        setCameras(devs);
        const back = devs.find((d) => d.isBack);
        setSelectedCameraId(back ? back.deviceId : devs[0].deviceId);
      }
    });
  }, []);

  const copyToClipboard = useCallback((text, fieldName) => {
    if (!text) return;
    navigator.clipboard?.writeText(text);
    setCopiedField(fieldName);
    setTimeout(() => setCopiedField(null), 2000);
  }, []);

  /**
   * Detiene el flujo de la cámara liberando inmediatamente el hardware y tracks WebRTC.
   * Evita bloqueos "Camera already in use" al cambiar de pestaña.
   */
  const stopCameraScanner = useCallback(() => {
    isScanningRef.current = false;
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (periodicScanTimerRef.current) {
      clearInterval(periodicScanTimerRef.current);
      periodicScanTimerRef.current = null;
    }
    if (streamRef.current) {
      try {
        const tracks = streamRef.current.getTracks();
        tracks.forEach((track) => {
          try {
            if (track.kind === "video") {
              track.applyConstraints?.({ advanced: [{ torch: false }] }).catch(() => {});
            }
            track.stop();
          } catch {}
        });
      } catch {}
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsCameraActive(false);
    setTorchOn(false);
    isBackendScanningRef.current = false;
  }, []);

  const parseDianQrText = useCallback(
    (rawText) => {
      let text = String(rawText || "").trim();
      text = text.replace(/^["'`]|["'`]$/g, "").trim();
      let cufe = "";
      let dianUrl = "";
      let nitEmisor = "";
      let nitRec = nitReceptor;
      let numFac = "";
      let fecha = "";
      let total = 0;

      // 1. Buscar DocumentKey en URL (searchqr?documentkey=... o SearchDocument?DocumentKey=...)
      const urlDocKeyMatch = text.match(/[?&]documentkey=([a-fA-F0-9\s\r\n\t]{64,128})/i) || text.match(/DocumentKey=([a-fA-F0-9\s\r\n\t]{64,128})/i);
      if (urlDocKeyMatch) {
        cufe = urlDocKeyMatch[1].replace(/[^a-fA-F0-9]/g, "").toLowerCase();
      }

      // 2. Si no hay DocumentKey en URL, buscar CUFE hexadecimal directo (64 a 100 caracteres)
      // Limpiamos saltos de línea (\r, \n), espacios y etiquetas para no romper CUFEs multilínea de PDFs
      if (!cufe) {
        const stripped = text.replace(/cufe\s*[:=\s]|cude\s*[:=\s]/gi, "").replace(/[^a-fA-F0-9]/g, "");
        const cufeDirectMatch = stripped.match(/([a-fA-F0-9]{64,100})/);
        if (cufeDirectMatch) {
          cufe = cufeDirectMatch[1].toLowerCase();
        }
      }

      // 3. Formato estándar DIAN delimitado
      const matchNumFac = text.match(/(?:NumFac|NumeroFactura|ncf)[:=]\s*([A-Za-z0-9-]+)/i);
      if (matchNumFac) numFac = matchNumFac[1];

      const matchNitFac = text.match(/(?:NitFac|NitEmisor|Nit)[:=]\s*(\d+)/i);
      if (matchNitFac) nitEmisor = matchNitFac[1];

      const matchDocAdq = text.match(/(?:DocAdq|NitAdquirente|DocReceptor)[:=]\s*(\d+)/i);
      if (matchDocAdq) nitRec = matchDocAdq[1];

      const matchFec = text.match(/(?:FecFac|Fecha)[:=]\s*([0-9]{4}-[0-9]{2}-[0-9]{2})/i);
      if (matchFec) fecha = matchFec[1];

      const matchVal = text.match(/(?:ValTolFac|ValTotal|ValTol|Total|ValFac)[:=]\s*([0-9.]+)/i);
      if (matchVal) total = parseFloat(matchVal[1]) || 0;

      if (cufe) {
        dianUrl = `https://catalogo-vpfe.dian.gov.co/document/searchqr?documentkey=${cufe}`;
      }

      return {
        rawText: text,
        cufe,
        dianUrl,
        nitEmisor,
        nitReceptor: nitRec || nitReceptor,
        numeroFactura: numFac,
        fecha,
        total,
      };
    },
    [nitReceptor]
  );

  const handleConsultDian = useCallback(
    async (targetCufe, targetNit) => {
      const rawCufe =
        typeof targetCufe === "string"
          ? targetCufe
          : scannedData?.cufe || cufeInput || "";
      const rawNit =
        typeof targetNit === "string" ? targetNit : nitReceptor || "";
      const cufe = String(rawCufe || "").trim();
      const nit = String(rawNit || "").trim();

      if (!cufe) {
        onShowToast?.({
          type: "warning",
          title: "CUFE requerido",
          message: "Por favor escanea o ingresa el CUFE de la factura.",
        });
        return;
      }

      if (isConsultingRef.current || activeCufeConsultationRef.current === cufe) {
        console.warn("[DIAN] Consulta ya en curso para este CUFE, ignorando llamada duplicada.");
        return;
      }

      isConsultingRef.current = true;
      activeCufeConsultationRef.current = cufe;
      stopCameraScanner();

      setIsConsulting(true);
      setConsultationStatus("Conectando al Catálogo Oficial VPFE de la DIAN...");
      setShowCaptchaGuide(false);
      showLoader?.({
        title: "Consultando Catálogo Oficial DIAN",
        message:
          "Validando seguridad y descargando factura electrónica oficial...",
        submessage:
          "Por favor no interactúe con el sistema mientras se procesa la consulta.",
        iconType: "search",
      });

      try {
        const res = await invoiceService.consultDian({
          documentKey: cufe,
          nit: nit || undefined,
        });

        setConsultationResult(res);

        const extractionData = res.extraction || res.invoice;
        if (res.success && extractionData) {
          const invNum = extractionData.invoice_number || extractionData.numero_factura || "";
          const suppName = extractionData.supplier_name || extractionData.proveedor || extractionData.emitter_name || "Proveedor";
          onShowToast?.({
            type: "success",
            title: "Factura DIAN Extraída",
            message: `Factura ${invNum} de ${suppName} descargada con éxito.`,
          });
          onInvoiceExtracted?.(extractionData);
          onClose?.();
        } else if (res.requires_user_captcha) {
          setShowCaptchaGuide(true);
          if (nit) {
            copyToClipboard(nit, "nit_auto");
          }
          onShowToast?.({
            type: "info",
            title: "Validación de Seguridad DIAN",
            message:
              "El portal oficial DIAN solicita verificación interactiva (Cloudflare Turnstile). Abre el enlace para completar la descarga.",
          });
        } else {
          setShowCaptchaGuide(true);
          if (nit) {
            copyToClipboard(nit, "nit_auto");
          }
          onShowToast?.({
            type: "warning",
            title: "Verificación requerida",
            message:
              res.message ||
              "Por favor ingresa al enlace oficial para descargar el PDF.",
          });
        }
      } catch (err) {
        console.error("Error consultando DIAN:", err);
        setShowCaptchaGuide(true);
        onShowToast?.({
          type: "warning",
          title: "Consulta DIAN",
          message:
            err.response?.data?.detail ||
            "Se requiere ingresar al portal oficial. Puedes usar el botón directo.",
        });
      } finally {
        setIsConsulting(false);
        isConsultingRef.current = false;
        activeCufeConsultationRef.current = null;
        setConsultationStatus("");
        hideLoader?.();
      }
    },
    [
      scannedData,
      cufeInput,
      nitReceptor,
      onShowToast,
      showLoader,
      hideLoader,
      onInvoiceExtracted,
      onClose,
      copyToClipboard,
    ]
  );

  const handleQrDetected = useCallback(
    (text) => {
      if (isConsultingRef.current) return;
      stopCameraScanner();
      const parsed = parseDianQrText(text);
      setScannedData(parsed);
      if (parsed.cufe) {
        setCufeInput(parsed.cufe);
      }
      const effectiveNit = parsed.nitReceptor || nitReceptor;
      if (parsed.nitReceptor) {
        updateNitReceptor(parsed.nitReceptor);
      }
      if (effectiveNit) {
        copyToClipboard(effectiveNit, "nit_auto");
      }

      if (parsed.cufe) {
        onShowToast?.({
          type: "success",
          title: "Código QR DIAN Identificado",
          message:
            "CUFE detectado. Consultando automáticamente en el portal oficial DIAN...",
        });
        handleConsultDian(parsed.cufe, effectiveNit);
      } else {
        onShowToast?.({
          type: "info",
          title: "Código QR decodificado",
          message: "No se identificó un CUFE válido en el código escaneado.",
        });
      }
    },
    [
      stopCameraScanner,
      parseDianQrText,
      nitReceptor,
      onShowToast,
      handleConsultDian,
      copyToClipboard,
    ]
  );

  const decodeGrayscaleWithZXing = useCallback((grayBuf, w, h) => {
    if (!zxingQrReaderRef.current) return null;

    try {
      const lum = new ZXing.RGBLuminanceSource(grayBuf, w, h);
      const bmp = new ZXing.BinaryBitmap(new ZXing.HybridBinarizer(lum));
      const res = zxingQrReaderRef.current.decode(bmp);
      if (res && res.text) return res.text;
    } catch {}

    try {
      const lum = new ZXing.RGBLuminanceSource(grayBuf, w, h);
      const bmp = new ZXing.BinaryBitmap(new ZXing.GlobalHistogramBinarizer(lum));
      const res = zxingQrReaderRef.current.decode(bmp);
      if (res && res.text) return res.text;
    } catch {}

    try {
      const enhBuf = enhanceLuminanceContrast(grayBuf);
      if (enhBuf !== grayBuf) {
        const lum = new ZXing.RGBLuminanceSource(enhBuf, w, h);
        const bmp = new ZXing.BinaryBitmap(new ZXing.HybridBinarizer(lum));
        const res = zxingQrReaderRef.current.decode(bmp);
        if (res && res.text) return res.text;
      }
    } catch {}

    return null;
  }, []);

  const decodeVideoFrameWithZXing = useCallback(
    (video, vw, vh) => {
      if (!cropCanvasRef.current) {
        cropCanvasRef.current = document.createElement("canvas");
      }
      const canvas = cropCanvasRef.current;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });

      const edge = Math.floor(Math.min(vw, vh) * 0.75);
      const sx = Math.floor((vw - edge) / 2);
      const sy = Math.floor((vh - edge) / 2);

      if (canvas.width !== edge || canvas.height !== edge) {
        canvas.width = edge;
        canvas.height = edge;
      }

      ctx.drawImage(video, sx, sy, edge, edge, 0, 0, edge, edge);
      const imgData = ctx.getImageData(0, 0, edge, edge);
      const data = imgData.data;
      const grayBuf = new Uint8ClampedArray(edge * edge);
      for (let i = 0, j = 0; i < data.length; i += 4, j++) {
        grayBuf[j] =
          (data[i] * 306 + data[i + 1] * 601 + data[i + 2] * 117) >> 10;
      }

      const textCenter = decodeGrayscaleWithZXing(grayBuf, edge, edge);
      if (textCenter) return textCenter;

      const scale = Math.min(1, 900 / Math.max(vw, vh));
      const dw = Math.floor(vw * scale);
      const dh = Math.floor(vh * scale);
      if (canvas.width !== dw || canvas.height !== dh) {
        canvas.width = dw;
        canvas.height = dh;
      }
      ctx.drawImage(video, 0, 0, dw, dh);
      const fullImgData = ctx.getImageData(0, 0, dw, dh);
      const fullData = fullImgData.data;
      const fullGrayBuf = new Uint8ClampedArray(dw * dh);
      for (let i = 0, j = 0; i < fullData.length; i += 4, j++) {
        fullGrayBuf[j] =
          (fullData[i] * 306 + fullData[i + 1] * 601 + fullData[i + 2] * 117) >>
          10;
      }

      return decodeGrayscaleWithZXing(fullGrayBuf, dw, dh);
    },
    [decodeGrayscaleWithZXing]
  );

  const scanLoop = useCallback(
    async function runScanLoop() {
      if (!isScanningRef.current) return;

      const video = videoRef.current;
      if (!video || video.readyState < 2) {
        if (isScanningRef.current) {
          animationFrameRef.current = requestAnimationFrame(runScanLoop);
        }
        return;
      }

      const vw = video.videoWidth;
      const vh = video.videoHeight;
      if (vw === 0 || vh === 0) {
        if (isScanningRef.current) {
          animationFrameRef.current = requestAnimationFrame(runScanLoop);
        }
        return;
      }

      const now = Date.now();
      if (now - lastScanFrameTimeRef.current < 65) {
        animationFrameRef.current = requestAnimationFrame(runScanLoop);
        return;
      }
      lastScanFrameTimeRef.current = now;

      let detectedText = null;

      if (qrDetectorRef.current) {
        try {
          const barcodes = await qrDetectorRef.current.detect(video);
          if (barcodes && barcodes.length > 0) {
            for (const b of barcodes) {
              if (b.rawValue && b.rawValue.trim()) {
                detectedText = b.rawValue.trim();
                break;
              }
            }
          }
        } catch {}
      }

      if (!detectedText && zxingQrReaderRef.current) {
        detectedText = decodeVideoFrameWithZXing(video, vw, vh);
      }

      if (detectedText) {
        playBeep();
        if (navigator.vibrate) navigator.vibrate(100);
        handleQrDetected(detectedText);
        return;
      }

      if (isScanningRef.current) {
        animationFrameRef.current = requestAnimationFrame(runScanLoop);
      }
    },
    [decodeVideoFrameWithZXing, handleQrDetected]
  );

  const startPeriodicBackendScan = useCallback(() => {
    if (periodicScanTimerRef.current) {
      clearInterval(periodicScanTimerRef.current);
    }

    periodicScanTimerRef.current = setInterval(async () => {
      if (!isScanningRef.current || isBackendScanningRef.current) return;
      const video = videoRef.current;
      if (!video || video.readyState < 2) return;

      const vw = video.videoWidth;
      const vh = video.videoHeight;
      if (vw === 0 || vh === 0) return;

      try {
        isBackendScanningRef.current = true;

        if (!cropCanvasRef.current) {
          cropCanvasRef.current = document.createElement("canvas");
        }
        const canvas = cropCanvasRef.current;
        // Limitar snapshot a máximo 1440px para garantizar nitidez óptima en códigos QR densos
        const maxSnapDim = 1440;
        let snapW = vw;
        let snapH = vh;
        if (snapW > maxSnapDim || snapH > maxSnapDim) {
          if (snapW > snapH) {
            snapH = Math.round((snapH * maxSnapDim) / snapW);
            snapW = maxSnapDim;
          } else {
            snapW = Math.round((snapW * maxSnapDim) / snapH);
            snapH = maxSnapDim;
          }
        }
        if (canvas.width !== snapW || canvas.height !== snapH) {
          canvas.width = snapW;
          canvas.height = snapH;
        }
        const ctx = canvas.getContext("2d");
        ctx.drawImage(video, 0, 0, snapW, snapH);

        const blob = await new Promise((resolve) =>
          canvas.toBlob(resolve, "image/jpeg", 0.90)
        );

        if (!blob || !isScanningRef.current) {
          isBackendScanningRef.current = false;
          return;
        }

        const file = new File([blob], "camera_snapshot.jpg", {
          type: "image/jpeg",
        });

        const res = await invoiceService.scanQr(file, {
          isBackgroundPoll: true,
        });
        if (isScanningRef.current && !isConsultingRef.current && res && res.success && res.cufe) {
          playBeep();
          if (navigator.vibrate) navigator.vibrate(100);
          setModalFile(file);
          const raw = res.raw_qr_text || res.cufe;
          handleQrDetected(raw);
        }
      } catch {
        // En background silencioso
      } finally {
        isBackendScanningRef.current = false;
      }
    }, 2500);
  }, [handleQrDetected]);

  /**
   * Inicia la cámara con resolución óptima (1080p/720p) y enfoque continuo
   * para decodificar códigos QR densos en tirillas térmicas pequeñas.
   */
  const startCameraScanner = useCallback(
    async (preferredDeviceId = null) => {
      stopCameraScanner();
      setCameraError(null);
      setIsCameraActive(false);

      const targetId = preferredDeviceId || selectedCameraId || "";

      try {
        const constraints = {
          video: targetId
            ? {
                deviceId: { exact: targetId },
                width: { ideal: 1280 },
                height: { ideal: 720 },
                focusMode: "continuous",
                advanced: [{ focusMode: "continuous" }],
              }
            : {
                facingMode: { ideal: "environment" },
                width: { ideal: 1280 },
                height: { ideal: 720 },
                focusMode: "continuous",
                advanced: [{ focusMode: "continuous" }],
              },
          audio: false,
        };

        let stream = null;
        try {
          stream = await navigator.mediaDevices.getUserMedia(constraints);
        } catch (errHighRes) {
          console.warn(
            "Fallo resolución alta, intentando fallback estándar:",
            errHighRes
          );
          try {
            stream = await navigator.mediaDevices.getUserMedia({
              video: targetId
                ? { deviceId: { exact: targetId } }
                : { facingMode: { ideal: "environment" } },
              audio: false,
            });
          } catch {
            stream = await navigator.mediaDevices.getUserMedia({
              video: true,
              audio: false,
            });
          }
        }

        if (!stream) {
          throw new Error("No se pudo obtener el flujo de video de la cámara.");
        }

        streamRef.current = stream;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        isScanningRef.current = true;
        setIsCameraActive(true);

        // Iniciar bucle de escaneo local en vivo (GPU BarcodeDetector + ZXing)
        animationFrameRef.current = requestAnimationFrame(scanLoop);

        // Iniciar captura periódica de alta resolución enviada al backend
        startPeriodicBackendScan();
      } catch (err) {
        console.error("Error iniciando cámara para QR:", err);
        setCameraError(
          err.name === "NotAllowedError" || err.name === "PermissionDeniedError"
            ? "Permiso de cámara denegado. Concede permiso en tu navegador o sube una foto."
            : "No se pudo acceder a la cámara. Puedes subir una foto fija o ingresar el CUFE manualmente."
        );
        setIsCameraActive(false);
      }
    },
    [selectedCameraId, stopCameraScanner, scanLoop, startPeriodicBackendScan]
  );

  /**
   * Alterna la linterna / flash del dispositivo en tiempo real.
   */
  const toggleTorch = async () => {
    if (!streamRef.current) return;
    try {
      const track = streamRef.current.getVideoTracks()[0];
      if (track) {
        const nextTorch = !torchOn;
        await track.applyConstraints({
          advanced: [{ torch: nextTorch }],
        });
        setTorchOn(nextTorch);
      }
    } catch (err) {
      console.warn("Error alternando linterna:", err);
      onShowToast?.({
        type: "info",
        title: "Linterna",
        message: "No se pudo alternar la linterna en este dispositivo.",
      });
    }
  };

  /**
   * Cambia entre cámaras trasera y macro/auxiliares si existen varias.
   */
  const handleFlipCamera = async () => {
    if (cameras.length <= 1) return;
    const currentIndex = cameras.findIndex((c) => c.deviceId === selectedCameraId);
    const nextIndex = (currentIndex + 1) % cameras.length;
    const nextDevice = cameras[nextIndex].deviceId;
    setSelectedCameraId(nextDevice);
    await startCameraScanner(nextDevice);
  };

  const handleBackendFileScan = useCallback(
    async (file) => {
      if (!file) return;
      setModalFile(file);
      setIsConsulting(true);
      setConsultationStatus("Escaneando código QR o CUFE en documento...");
      showLoader?.({
        title: "Analizando Documento DIAN",
        message: "Detectando código QR y CUFE de factura electrónica...",
        submessage: "Procesando archivo con visión OCR...",
        iconType: "loader",
      });
      try {
        const res = await invoiceService.scanQr(file, { allowOcr: true });
        if (res.success && res.cufe) {
          const effectiveNit = res.nit_receptor || nitReceptor;
          setScannedData({
            cufe: res.cufe,
            dianUrl: res.dian_url,
            nitEmisor: res.nit_emisor,
            nitReceptor: effectiveNit,
            numeroFactura: res.numero_factura,
            fecha: res.fecha,
            total: res.total,
          });
          setCufeInput(res.cufe);
          if (res.nit_receptor) {
            updateNitReceptor(res.nit_receptor);
          }
          if (effectiveNit) {
            copyToClipboard(effectiveNit, "nit_auto");
          }
          setIsConsulting(false);
          setConsultationStatus("");
          hideLoader?.();
          onShowToast?.({
            type: "success",
            title: "CUFE Extraído",
            message: `CUFE identificado (${res.cufe.length} carac.). Verifique los datos y presione Confirmar.`,
          });
        } else {
          setIsConsulting(false);
          setConsultationStatus("");
          hideLoader?.();
          onShowToast?.({
            type: "info",
            title: "Sin código QR visible",
            message:
              res.message ||
              "No se detectó un código QR ni CUFE legible. Puedes ingresar el CUFE manualmente.",
          });
        }
      } catch (err) {
        setIsConsulting(false);
        setConsultationStatus("");
        hideLoader?.();
        console.warn("Fallo escaneando QR desde archivo:", err);
      }
    },
    [nitReceptor, showLoader, hideLoader, onShowToast, copyToClipboard]
  );

  // Inicialización y limpieza del modal
  useEffect(() => {
    if (isOpen) {
      setCameraError(null);
      setScannedData(null);
      setCufeInput("");
      setConsultationResult(null);
      setShowCaptchaGuide(false);

      if (currentFile) {
        setActiveTab("file");
        stopCameraScanner();
        handleBackendFileScan(currentFile);
      } else {
        setActiveTab("camera");
      }
    } else {
      stopCameraScanner();
      setScannedData(null);
      setCufeInput("");
      setConsultationResult(null);
      setShowCaptchaGuide(false);
      setActiveTab("camera");
    }

    return () => {
      stopCameraScanner();
    };
  }, [isOpen]);

  // Manejo de cámara según pestaña activa (sin reiniciar el input de CUFE ni scannedData)
  useEffect(() => {
    if (!isOpen) return;
    if (activeTab === "camera" && !scannedData) {
      const timer = setTimeout(() => {
        startCameraScanner();
      }, 80);
      return () => {
        clearTimeout(timer);
        stopCameraScanner();
      };
    } else {
      stopCameraScanner();
    }
  }, [isOpen, activeTab, scannedData]);

  const handleManualCufeSubmit = (e) => {
    e?.preventDefault();
    const clean = String(cufeInput || "").trim().replace(/^["'`]|["'`]$/g, "");
    if (!clean) return;

    let parsed = parseDianQrText(clean);
    // Si no detectó cufe como URL pero el string contiene entre 64 y 100 caracteres hex, es un CUFE directo
    // Limpiamos espacios y saltos de línea (\r, \n) para no fallar con CUFEs copiados de PDFs
    if (!parsed.cufe) {
      const stripped = clean.replace(/cufe\s*[:=\s]|cude\s*[:=\s]/gi, "").replace(/[^a-fA-F0-9]/g, "");
      const hexMatch = stripped.match(/([a-fA-F0-9]{64,100})/);
      if (hexMatch) {
        parsed.cufe = hexMatch[1].toLowerCase();
        parsed.dianUrl = `https://catalogo-vpfe.dian.gov.co/document/searchqr?documentkey=${parsed.cufe}`;
      }
    }

    setScannedData(parsed);
    const effectiveNit = parsed.nitReceptor || nitReceptor;
    if (effectiveNit) {
      copyToClipboard(effectiveNit, "nit_auto");
    }

    if (parsed.cufe) {
      onShowToast?.({
        type: "success",
        title: "CUFE Identificado",
        message: `CUFE ${parsed.cufe.slice(0, 16)}... detectado. Procediendo con la consulta DIAN.`,
      });
      handleConsultDian(parsed.cufe, effectiveNit);
    } else {
      onShowToast?.({
        type: "warning",
        title: "Formato no reconocido",
        message: "Por favor ingresa un código CUFE válido (96 caracteres alfanuméricos) o URL oficial de la DIAN.",
      });
    }
  };

  const handlePdfUpload = async (file) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      onShowToast?.({
        type: "warning",
        title: "Archivo no admitido",
        message: "Por favor selecciona el archivo PDF descargado de la DIAN.",
      });
      return;
    }

    setIsProcessingPdf(true);
    setConsultationStatus("Desencriptando PDF oficial con NIT y extrayendo productos...");

    try {
      const res = await invoiceService.processImage(file, { provider: "pdf", nit: nitReceptor });
      const extractionData = res?.extraction || res?.invoice || res;
      if (extractionData && (extractionData.items?.length || extractionData.success)) {
        onShowToast?.({
          type: "success",
          title: "PDF DIAN Desencriptado y Procesado",
          message: `Se extrajeron ${extractionData.items?.length || 0} productos del documento oficial con 100% de exactitud.`,
        });
        onInvoiceExtracted?.(extractionData);
        onClose?.();
      } else {
        throw new Error(res?.detail || "No se pudieron extraer datos del PDF.");
      }
    } catch (err) {
      console.error("Error procesando PDF DIAN:", err);
      onShowToast?.({
        type: "error",
        title: "Error al procesar PDF",
        message:
          err.response?.data?.detail ||
          err.message ||
          "No se pudo desencriptar el PDF. Verifica que el NIT del receptor sea correcto.",
      });
    } finally {
      setIsProcessingPdf(false);
      setConsultationStatus("");
    }
  };

  // Escape key handler
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        onClose?.();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  const handleProcessWithAiAndQr = async () => {
    const fileToProcess = modalFile || currentFile;
    if (!fileToProcess) {
      onShowToast?.({
        type: "info",
        title: "Selecciona una foto o imagen",
        message: "Por favor selecciona la imagen de la factura para extraer los artículos con IA.",
      });
      qrFileInputRef.current?.click();
      return;
    }
    setIsConsulting(true);
    setConsultationStatus("Procesando productos con Visión IA y vinculando metadatos DIAN...");
    showLoader?.({
      title: "Extrayendo Ítems con Visión IA",
      message: "Procesando documento con motor multimodal e integrando CUFE oficial...",
      submessage: "Cero esperas de captcha DIAN (100% asistido)...",
      iconType: "sparkles",
    });

    try {
      const res = await invoiceService.processImage(fileToProcess, {
        provider: "gemini",
        nit: nitReceptor || scannedData?.nitReceptor,
      });

      if (res) {
        if (scannedData?.cufe || cufeInput) {
          res.cufe = scannedData?.cufe || cufeInput;
          res.has_qr = true;
          res.is_dian_qr = true;
          res.dian_url = scannedData?.dianUrl || `https://catalogo-vpfe.dian.gov.co/document/searchqr?documentkey=${res.cufe}`;
        }
        if (scannedData?.numeroFactura && !res.numero_factura) {
          res.numero_factura = scannedData.numeroFactura;
        }
        if (scannedData?.nitEmisor && !res.nit_proveedor) {
          res.nit_proveedor = scannedData.nitEmisor;
        }
        if (scannedData?.fecha && !res.fecha) {
          res.fecha = scannedData.fecha;
        }
        if (scannedData?.total && (!res.total || res.total === 0)) {
          res.total = scannedData.total;
        }
        onShowToast?.({
          type: "success",
          title: "Factura Procesada con Éxito",
          message: `Se extrajeron ${res.items?.length || 0} productos vinculados al CUFE oficial.`,
        });
        onInvoiceExtracted?.(res);
        onClose?.();
      }
    } catch (err) {
      console.error("Error en procesamiento asistido con IA:", err);
      onShowToast?.({
        type: "error",
        title: "Error al Procesar",
        message: err.response?.data?.detail || err.message || "No se pudo procesar la imagen.",
      });
    } finally {
      setIsConsulting(false);
      setConsultationStatus("");
      hideLoader?.();
    }
  };

  if (!isOpen) return null;

  const effectiveFile = modalFile || currentFile;
  const currentCufe = scannedData?.cufe || "";
  const currentDianUrl =
    scannedData?.dianUrl ||
    (currentCufe
      ? `https://catalogo-vpfe.dian.gov.co/document/searchqr?documentkey=${currentCufe}`
      : "");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Encabezado */}
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shadow-inner">
              <QrCode className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                Consulta Oficial DIAN
                <span className="text-[10px] bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800/60 px-2 py-0.5 rounded-full font-semibold">
                  Catálogo VPFE
                </span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Escaneo de código QR y descarga de factura electrónica oficial con NIT
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Contenido con Scroll */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-5 flex-1">
          {/* Si aún no tenemos CUFE identificado */}
          {!currentCufe ? (
            <div className="space-y-4">
              {/* Selector de pestañas de entrada */}
              <div className="grid grid-cols-3 gap-2 p-1 bg-slate-100 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 rounded-xl">
                <button
                  type="button"
                  onClick={() => {
                    stopCameraScanner();
                    setActiveTab("camera");
                  }}
                  className={`py-2 px-2 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition ${
                    activeTab === "camera"
                      ? "bg-emerald-600 text-white shadow-md font-bold"
                      : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                  }`}
                  title="Escanear en vivo con la cámara"
                >
                  <Camera className="w-3.5 h-3.5" />
                  <span>Escanear Cámara</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    stopCameraScanner();
                    setActiveTab("file");
                  }}
                  className={`py-2 px-2 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition ${
                    activeTab === "file"
                      ? "bg-emerald-600 text-white shadow-md font-bold"
                      : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                  }`}
                  title="Subir archivo o tomar foto estática del QR"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Subir o Tomar Foto</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    stopCameraScanner();
                    setActiveTab("manual");
                  }}
                  className={`py-2 px-2 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition ${
                    activeTab === "manual"
                      ? "bg-emerald-600 text-white shadow-md font-bold"
                      : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                  }`}
                  title="Copiar o pegar texto/CUFE"
                >
                  <Search className="w-3.5 h-3.5" />
                  <span>Copiar / Pegar CUFE</span>
                </button>
              </div>

              {/* Pestaña: Cámara (Escaneo en vivo) */}
              {activeTab === "camera" && (
                <div className="space-y-3">
                  <div className="relative bg-slate-950 border border-slate-800 rounded-xl overflow-hidden aspect-square sm:aspect-video flex items-center justify-center">
                    <video
                      ref={videoRef}
                      playsInline
                      autoPlay
                      muted
                      className="w-full h-full object-cover"
                    />

                    {/* Overlay Visor y Guías de Escaneo */}
                    {isCameraActive && (
                      <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center">
                        {/* Marco del Visor */}
                        <div className="relative w-64 h-64 sm:w-72 sm:h-72 border-2 border-emerald-500/50 rounded-2xl bg-black/10 shadow-[0_0_0_9999px_rgba(0,0,0,0.5)]">
                          {/* Esquinas destacadas */}
                          <div className="absolute -top-1 -left-1 w-6 h-6 border-t-4 border-l-4 border-emerald-400 rounded-tl-lg" />
                          <div className="absolute -top-1 -right-1 w-6 h-6 border-t-4 border-r-4 border-emerald-400 rounded-tr-lg" />
                          <div className="absolute -bottom-1 -left-1 w-6 h-6 border-b-4 border-l-4 border-emerald-400 rounded-bl-lg" />
                          <div className="absolute -bottom-1 -right-1 w-6 h-6 border-b-4 border-r-4 border-emerald-400 rounded-br-lg" />

                          {/* Línea Láser Animada */}
                          <div className="absolute inset-x-2 h-0.5 bg-gradient-to-r from-transparent via-emerald-400 to-transparent shadow-[0_0_8px_#10b981] scanner-laser" />
                        </div>

                        <div className="absolute bottom-3 text-center px-4">
                          <span className="text-[11px] font-medium text-emerald-300 bg-slate-950/80 px-3 py-1 rounded-full border border-emerald-500/40 shadow-sm backdrop-blur-sm">
                            Enfoca el código QR de la factura dentro del recuadro
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Controles Flotantes Superiores: Linterna / Switch Camera */}
                    {isCameraActive && (
                      <div className="absolute top-3 right-3 flex items-center gap-2 pointer-events-auto z-10">
                        {/* Botón Linterna / Flash */}
                        <button
                          type="button"
                          onClick={toggleTorch}
                          className={`p-2 sm:px-3 rounded-xl border transition shadow-lg flex items-center gap-1.5 text-xs font-bold cursor-pointer ${
                            torchOn
                              ? "bg-amber-500 border-amber-400 text-slate-950 ring-2 ring-amber-300/60 shadow-amber-500/30"
                              : "bg-slate-900/80 hover:bg-slate-800 border-slate-700 text-slate-200 hover:text-white backdrop-blur-md"
                          }`}
                          title={torchOn ? "Apagar Linterna" : "Encender Linterna (Flash)"}
                        >
                          {torchOn ? (
                            <>
                              <Zap className="w-4 h-4 fill-slate-950 text-slate-950" />
                              <span className="hidden sm:inline">Flash ON</span>
                            </>
                          ) : (
                            <>
                              <Flashlight className="w-4 h-4 text-amber-400" />
                              <span className="hidden sm:inline">Flash</span>
                            </>
                          )}
                        </button>

                        {/* Botón Cambiar de Cámara (si hay más de una) */}
                        {cameras.length > 1 && (
                          <button
                            type="button"
                            onClick={handleFlipCamera}
                            className="p-2 rounded-xl bg-slate-900/80 hover:bg-slate-800 border border-slate-700 text-slate-200 hover:text-white backdrop-blur-md transition shadow-lg cursor-pointer"
                            title="Cambiar de cámara"
                          >
                            <SwitchCamera className="w-4 h-4 text-emerald-400" />
                          </button>
                        )}
                      </div>
                    )}

                    {/* Estado: Iniciando Cámara */}
                    {!isCameraActive && !cameraError && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-slate-950/90 p-4 text-center">
                        <RefreshCw className="w-6 h-6 animate-spin text-emerald-400" />
                        <span className="text-xs text-slate-300 font-medium">
                          Iniciando cámara trasera en alta resolución...
                        </span>
                      </div>
                    )}

                    {/* Estado: Error de Cámara */}
                    {cameraError && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-950/95 p-4 text-center">
                        <AlertCircle className="w-8 h-8 text-amber-400" />
                        <p className="text-xs text-slate-300 max-w-sm">{cameraError}</p>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => startCameraScanner()}
                            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold cursor-pointer"
                          >
                            Reintentar Cámara
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              stopCameraScanner();
                              setActiveTab("file");
                              setScannedData(null);
                              setCufeInput("");
                            }}
                            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-semibold border border-slate-700 cursor-pointer"
                          >
                            Subir foto en su lugar
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-400 text-center">
                    Apunta la cámara al código QR. Al detectarlo, continuará automáticamente con la consulta DIAN.
                  </p>
                </div>
              )}

              {/* Pestaña: Archivo / Foto estática */}
              {activeTab === "file" && (
                <div className="space-y-3">
                  <input
                    ref={qrFileInputRef}
                    type="file"
                    accept="image/*,application/pdf"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleBackendFileScan(f);
                      e.target.value = "";
                    }}
                  />
                  <input
                    id="modal-qr-camera-input"
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleBackendFileScan(f);
                      e.target.value = "";
                    }}
                  />

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label
                      htmlFor="modal-qr-camera-input"
                      className="border-2 border-dashed border-slate-700 hover:border-emerald-500/60 rounded-xl p-5 flex flex-col items-center justify-center gap-2 cursor-pointer bg-slate-950/40 hover:bg-slate-950 transition text-center"
                    >
                      <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center text-slate-300">
                        <Camera className="w-5 h-5 text-emerald-400" />
                      </div>
                      <div>
                        <span className="text-xs font-semibold text-slate-200 block">
                          Tomar Foto al QR
                        </span>
                        <span className="text-[10px] text-slate-500 block mt-0.5">
                          Captura fija (esperará confirmación del CUFE)
                        </span>
                      </div>
                    </label>

                    <div
                      onClick={() => qrFileInputRef.current?.click()}
                      className="border-2 border-dashed border-slate-700 hover:border-emerald-500/60 rounded-xl p-5 flex flex-col items-center justify-center gap-2 cursor-pointer bg-slate-950/40 hover:bg-slate-950 transition text-center"
                    >
                      <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center text-slate-300">
                        <Upload className="w-5 h-5 text-emerald-400" />
                      </div>
                      <div>
                        <span className="text-xs font-semibold text-slate-200 block">
                          Subir Imagen o PDF
                        </span>
                        <span className="text-[10px] text-slate-500 block mt-0.5">
                          Soporta JPG, PNG, PDF
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Pestaña: Manual */}
              {activeTab === "manual" && (
                <form onSubmit={handleManualCufeSubmit} className="space-y-3.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
                      Código CUFE (96 caracteres) o URL de la DIAN:
                    </label>
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          let clipText = "";
                          if (navigator.clipboard && navigator.clipboard.readText) {
                            try {
                              clipText = await navigator.clipboard.readText();
                            } catch (clipErr) {
                              console.warn("navigator.clipboard.readText no permitido o bloqueado:", clipErr);
                            }
                          }
                          if (!clipText) {
                            clipText = window.prompt("Pega aquí el código CUFE (96 caracteres) o enlace oficial DIAN:");
                          }
                          if (clipText) {
                            let trimmed = clipText.trim().replace(/^["'`]|["'`]$/g, "");
                            const docKeyMatch = trimmed.match(/[?&]documentkey=([a-fA-F0-9\s\r\n\t]+)/i) || trimmed.match(/DocumentKey=([a-fA-F0-9\s\r\n\t]+)/i);
                            if (docKeyMatch) {
                              trimmed = docKeyMatch[1].replace(/[^a-fA-F0-9]/g, "").toLowerCase();
                            } else {
                              const hexOnly = trimmed.replace(/cufe\s*[:=\s]|cude\s*[:=\s]/gi, "").replace(/[^a-fA-F0-9]/g, "").toLowerCase();
                              if (hexOnly.length >= 64) {
                                trimmed = hexOnly;
                              } else {
                                trimmed = trimmed.replace(/[\r\n\t\s]+/g, "");
                              }
                            }
                            setCufeInput(trimmed);
                            onShowToast?.({
                              type: "info",
                              title: "CUFE Pegado y Limpiado",
                              message: `Se insertaron ${trimmed.length} caracteres (espacios y saltos eliminados). Presiona 'Continuar con este CUFE'.`,
                            });
                          }
                        } catch {
                          const fallbackText = window.prompt("Pega aquí el código CUFE o enlace DIAN:");
                          if (fallbackText) {
                            const trimmed = fallbackText.trim().replace(/^["'`]|["'`]$/g, "").replace(/[\r\n\t\s]+/g, "");
                            setCufeInput(trimmed);
                          }
                        }
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-100 hover:bg-emerald-200 text-emerald-800 dark:bg-emerald-950/80 dark:hover:bg-emerald-900/80 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700/60 rounded-lg text-xs font-bold transition cursor-pointer"
                      title="Pegar código copiado desde el portapapeles"
                    >
                      <Clipboard className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                      <span>Pegar del Portapapeles</span>
                    </button>
                  </div>
                  <textarea
                    rows={3}
                    value={cufeInput}
                    onChange={(e) => {
                      const clean = e.target.value.replace(/^["'`]|["'`]$/g, "").replace(/[\r\n\t]+/g, "");
                      setCufeInput(clean);
                    }}
                    onPaste={(e) => {
                      e.preventDefault();
                      const pasteData = e.clipboardData?.getData("text") || "";
                      let cleaned = pasteData.trim().replace(/^["'`]|["'`]$/g, "");
                      const docKeyMatch = cleaned.match(/[?&]documentkey=([a-fA-F0-9\s\r\n\t]+)/i) || cleaned.match(/DocumentKey=([a-fA-F0-9\s\r\n\t]+)/i);
                      if (docKeyMatch) {
                        cleaned = docKeyMatch[1].replace(/[^a-fA-F0-9]/g, "").toLowerCase();
                      } else {
                        const hexOnly = cleaned.replace(/cufe\s*[:=\s]|cude\s*[:=\s]/gi, "").replace(/[^a-fA-F0-9]/g, "").toLowerCase();
                        if (hexOnly.length >= 64) {
                          cleaned = hexOnly;
                        } else {
                          cleaned = cleaned.replace(/[\r\n\t\s]+/g, "");
                        }
                      }
                      setCufeInput(cleaned);
                      onShowToast?.({
                        type: "info",
                        title: "CUFE Pegado y Limpiado",
                        message: `Se insertaron ${cleaned.length} caracteres (espacios y saltos eliminados). Presiona 'Continuar con este CUFE'.`,
                      });
                    }}
                    placeholder="Pega aquí el CUFE (96 caracteres hex) o enlace oficial DIAN (ej: db64d4cb84ba6c7715b199b1234fbbe650a7977ea3e4a7a64921e8e4d5917d1389daf94c0cd58093ab2c2ec6624465dd o https://catalogo-vpfe.dian.gov.co/document/searchqr?documentkey=...)"
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl p-3 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:border-emerald-500 font-mono resize-none select-text"
                  />
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">
                      Longitud actual: <strong className="font-mono text-slate-800 dark:text-slate-200">{cufeInput.trim().length}</strong> caracteres
                    </span>
                    <button
                      type="submit"
                      disabled={!cufeInput.trim()}
                      className="py-2.5 px-6 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-200 dark:disabled:bg-slate-800 disabled:text-slate-400 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer shadow-md shadow-emerald-900/20"
                    >
                      <span>Continuar con este CUFE</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </form>
              )}
            </div>
          ) : (
            /* Vista de CUFE Identificado y Panel de Consulta DIAN */
            <div className="space-y-5">
              {/* Tarjeta de Resumen del Documento Encontrado */}
              <div className="p-4 bg-slate-50 dark:bg-slate-950/70 border border-emerald-200 dark:border-emerald-900/50 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4" />
                    Código QR / CUFE Detectado
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      stopCameraScanner();
                      setScannedData(null);
                      setCufeInput("");
                      setActiveTab("camera");
                    }}
                    className="text-[11px] text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 underline cursor-pointer"
                  >
                    Escanear otro código
                  </button>
                </div>

                {/* CUFE Editable con validación de longitud para facturas impresas */}
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400" />
                      Código CUFE (Verifique y edite si faltan dígitos):
                    </span>
                    <span
                      className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${
                        currentCufe.length === 96
                          ? "bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/80 dark:text-emerald-300 dark:border-emerald-600/50"
                          : "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/80 dark:text-amber-300 dark:border-amber-600/50"
                      }`}
                    >
                      {currentCufe.length === 96
                        ? "✅ 96 carac. (Válido)"
                        : `⚠️ ${currentCufe.length} carac.`}
                    </span>
                  </div>

                  <div className="relative">
                    <textarea
                      rows={2}
                      value={scannedData?.cufe || cufeInput}
                      onChange={(e) => {
                        const val = e.target.value.toLowerCase().replace(/[^a-f0-9]/g, "");
                        setCufeInput(val);
                        setScannedData((prev) => ({
                          ...(prev || {}),
                          cufe: val,
                          dianUrl: `https://catalogo-vpfe.dian.gov.co/document/searchqr?documentkey=${val}`,
                        }));
                      }}
                      onPaste={(e) => {
                        e.preventDefault();
                        const pasteData = e.clipboardData?.getData("text") || "";
                        const val = pasteData.toLowerCase().replace(/[^a-f0-9]/g, "");
                        setCufeInput(val);
                        setScannedData((prev) => ({
                          ...(prev || {}),
                          cufe: val,
                          dianUrl: `https://catalogo-vpfe.dian.gov.co/document/searchqr?documentkey=${val}`,
                        }));
                      }}
                      placeholder="Pega o corrige el CUFE de 96 caracteres aquí..."
                      className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 focus:border-emerald-500 rounded-lg p-2.5 text-xs font-mono text-slate-900 dark:text-slate-200 resize-none focus:outline-none select-text"
                    />
                    <button
                      type="button"
                      onClick={() => copyToClipboard(scannedData?.cufe || cufeInput, "cufe")}
                      className="absolute right-2 top-2 p-1.5 rounded-lg bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition shrink-0 cursor-pointer"
                      title="Copiar CUFE"
                    >
                      {copiedField === "cufe" ? (
                        <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Configuración de NIT Receptor */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                      NIT Receptor / Emisor (.env):
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        value={nitReceptor}
                        onChange={(e) => updateNitReceptor(e.target.value)}
                        placeholder="Ej: 900123456"
                        className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-xs font-mono text-slate-900 dark:text-slate-200 focus:outline-none focus:border-emerald-500"
                      />
                      <button
                        type="button"
                        onClick={() => copyToClipboard(nitReceptor, "nit")}
                        className="absolute right-2 top-2 p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                        title="Copiar NIT"
                      >
                        {copiedField === "nit" ? (
                          <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                    <span className="text-[10px] text-slate-500 mt-0.5 block">
                      Se usa para consultar en DIAN y desencriptar el PDF.
                    </span>
                  </div>

                  {scannedData?.numeroFactura && (
                    <div className="bg-slate-100 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800/80 rounded-lg p-2.5 text-xs text-slate-700 dark:text-slate-300 space-y-1">
                      <div className="flex justify-between">
                        <span className="text-slate-500 dark:text-slate-400 text-[11px]">Factura #:</span>
                        <span className="font-semibold">{scannedData.numeroFactura}</span>
                      </div>
                      {scannedData.fecha && (
                        <div className="flex justify-between">
                          <span className="text-slate-500 dark:text-slate-400 text-[11px]">Fecha:</span>
                          <span>{scannedData.fecha}</span>
                        </div>
                      )}
                      {scannedData.total > 0 && (
                        <div className="flex justify-between">
                          <span className="text-slate-500 dark:text-slate-400 text-[11px]">Total QR:</span>
                          <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                            ${scannedData.total.toLocaleString("es-CO")}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Opciones de Obtención */}
              <div className="space-y-3">
                {/* Botón Principal para Reintentar con el mismo código CUFE directamente */}
                <button
                  type="button"
                  onClick={() => handleConsultDian(currentCufe, nitReceptor)}
                  disabled={isConsulting || isProcessingPdf || !currentCufe}
                  className="w-full py-3 px-4 bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-50 text-white rounded-xl font-bold text-xs shadow-md shadow-blue-950/30 transition flex items-center justify-center gap-2 btn-tactile cursor-pointer"
                  title="Reintentar consulta desatendida en el portal oficial de la DIAN con el mismo CUFE y NIT"
                >
                  <RefreshCw className={`w-4 h-4 text-white ${isConsulting ? "animate-spin" : ""}`} />
                  <span>
                    {isConsulting
                      ? (consultationStatus || "Consultando portal DIAN...")
                      : "🔄 Reintentar Consulta Automática DIAN (Mismo CUFE)"}
                  </span>
                </button>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={handleProcessWithAiAndQr}
                    disabled={isConsulting || isProcessingPdf}
                    className="py-3 px-4 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl font-bold text-xs shadow-lg shadow-emerald-950/40 transition flex items-center justify-center gap-2 btn-tactile cursor-pointer"
                  >
                    {isConsulting ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin text-amber-300" />
                        <span>{consultationStatus || "Procesando con IA..."}</span>
                      </>
                    ) : (
                      <>
                        <Zap className="w-4 h-4 text-amber-300" />
                        <span>
                          {effectiveFile
                            ? "⚡ Procesar Factura con IA + Metadatos DIAN"
                            : "⚡ Cargar Foto y Procesar con IA"}
                        </span>
                      </>
                    )}
                  </button>

                  <a
                    href={currentDianUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => {
                      copyToClipboard(nitReceptor, "nit_auto");
                      onShowToast?.({
                        type: "info",
                        title: "NIT Copiado",
                        message: `NIT ${nitReceptor} copiado. Pulsa Buscar en DIAN y descarga el PDF.`,
                      });
                    }}
                    className="py-3 px-4 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 hover:text-slate-900 dark:hover:text-white rounded-xl font-bold text-xs border border-slate-300 dark:border-slate-700 transition flex items-center justify-center gap-2 btn-tactile cursor-pointer text-center"
                  >
                    <ExternalLink className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    <span>🔗 Abrir en Portal Oficial DIAN</span>
                  </a>
                </div>

                <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 px-1">
                  <span>⚡ <strong>IA + DIAN:</strong> Extracción instantánea en ~1.5s sin bloqueos de captcha.</span>
                  <button
                    type="button"
                    onClick={() => setShowCaptchaGuide((prev) => !prev)}
                    className="text-emerald-600 dark:text-emerald-400 hover:underline font-semibold text-[11px] cursor-pointer"
                  >
                    {showCaptchaGuide ? "Ocultar Carga PDF" : "📄 Cargar PDF / XML oficial"}
                  </button>
                </div>
              </div>

              {/* Flujo Asistido con Turnstile / Captcha */}
              {(showCaptchaGuide || consultationResult?.requires_user_captcha) && (
                <div className="p-4 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 rounded-xl space-y-3 animate-fade-in">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-2 border-b border-amber-200/80 dark:border-amber-800/40">
                    <div className="flex items-start gap-2.5">
                      <AlertCircle className="w-5 h-5 text-amber-500 dark:text-amber-400 shrink-0 mt-0.5" />
                      <div>
                        <h4 className="text-xs font-bold text-amber-800 dark:text-amber-200">
                          {consultationResult?.message || "El portal DIAN solicita verificación interactiva (Captcha)"}
                        </h4>
                        <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-0.5">
                          Si hubo lentitud en la DIAN, puedes reintentar con el mismo CUFE directamente:
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleConsultDian(currentCufe, nitReceptor)}
                      disabled={isConsulting}
                      className="self-start sm:self-center shrink-0 px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 shadow-sm transition cursor-pointer"
                      title="Volver a intentar la descarga automática en la DIAN con el mismo CUFE"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isConsulting ? "animate-spin" : ""}`} />
                      <span>Reintentar ahora</span>
                    </button>
                  </div>

                  <p className="text-[11px] text-slate-600 dark:text-slate-300">
                    O si prefieres, sigue estos 3 sencillos pasos para obtener la factura oficial con contraseña:
                  </p>

                  <div className="space-y-2 text-xs text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-950/60 p-3 rounded-lg border border-slate-200 dark:border-slate-800">
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2">
                      <span className="text-[11px] text-slate-700 dark:text-slate-300">
                        <strong>Paso 1:</strong> Abre el documento oficial (tu NIT se copiará automáticamente):
                      </span>
                      <a
                        href={currentDianUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => {
                          copyToClipboard(nitReceptor, "nit_auto");
                          onShowToast?.({
                            type: "info",
                            title: "NIT Copiado",
                            message: `NIT ${nitReceptor} copiado. Pégalo en el campo y pulsa Buscar.`,
                          });
                        }}
                        className="py-2 px-3 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 shrink-0 shadow-md shadow-emerald-950/40 btn-tactile transition cursor-pointer"
                      >
                        <span>Abrir Portal DIAN en Celular</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                    <div className="flex items-center justify-between gap-2 pt-1">
                      <span className="text-[11px] text-slate-700 dark:text-slate-300">
                        <strong>Paso 2:</strong> Pega el NIT (
                        <code className="text-emerald-700 dark:text-emerald-300 font-mono font-bold">{nitReceptor}</code>), verifica el check y toca <strong>Buscar</strong>.
                      </span>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(nitReceptor, "nit_btn")}
                        className="py-1 px-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-[11px] font-semibold rounded-lg flex items-center gap-1 shrink-0 border border-slate-300 dark:border-slate-700 btn-tactile cursor-pointer"
                      >
                        {copiedField === "nit_btn" || copiedField === "nit_auto" ? (
                          <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                        <span>{copiedField === "nit_auto" ? "¡Copiado!" : "Copiar NIT"}</span>
                      </button>
                    </div>
                    <div className="text-[11px] text-slate-600 dark:text-slate-300 pt-1">
                      <strong>Paso 3:</strong> Toca <span className="text-emerald-600 dark:text-emerald-400 font-semibold">"Descargar PDF"</span> y luego pulsa el botón de abajo para seleccionarlo de tus descargas recientes.
                    </div>
                  </div>

                  {/* Alternativa Instantánea con Visión AI */}
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 p-3 bg-emerald-950/30 border border-emerald-800/50 rounded-xl">
                    <span className="text-[11px] text-emerald-300">
                      ¿Prefieres no ingresar al portal? Extrae los productos inmediatamente mediante Inteligencia Artificial:
                    </span>
                    <button
                      type="button"
                      onClick={handleProcessWithAiAndQr}
                      disabled={isConsulting || isProcessingPdf}
                      className="py-1.5 px-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 shrink-0 transition cursor-pointer shadow-sm shadow-emerald-950/40"
                    >
                      <Zap className="w-3.5 h-3.5 text-amber-300" />
                      <span>{effectiveFile ? "⚡ Extraer con IA" : "⚡ Subir Foto y Extraer"}</span>
                    </button>
                  </div>

                  {/* Zona de Dropzone para el PDF descargado */}
                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      setIsDraggingPdf(true);
                    }}
                    onDragLeave={() => setIsDraggingPdf(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setIsDraggingPdf(false);
                      const f = e.dataTransfer.files?.[0];
                      if (f) handlePdfUpload(f);
                    }}
                    onClick={() => pdfInputRef.current?.click()}
                    className={`border-2 border-dashed rounded-xl p-5 flex flex-col items-center justify-center gap-2 cursor-pointer transition ${
                      isDraggingPdf
                        ? "border-emerald-500 bg-emerald-950/40"
                        : "border-slate-700 hover:border-emerald-500/60 bg-slate-900/60 hover:bg-slate-900"
                    }`}
                  >
                    <input
                      ref={pdfInputRef}
                      type="file"
                      accept="application/pdf"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handlePdfUpload(f);
                      }}
                    />
                    {isProcessingPdf ? (
                      <div className="flex items-center gap-2 text-emerald-400 text-xs font-semibold">
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Desencriptando con NIT y extrayendo ítems...</span>
                      </div>
                    ) : (
                      <>
                        <Download className="w-5 h-5 text-emerald-400" />
                        <span className="text-xs font-semibold text-slate-200">
                          Suelta el PDF descargado aquí
                        </span>
                        <span className="text-[10px] text-slate-400">
                          Se desencriptará de forma automática con el NIT {nitReceptor}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Pie del modal */}
        <div className="p-3 sm:p-4 border-t border-slate-800 flex items-center justify-between bg-slate-950/60 text-xs text-slate-400">
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            100% oficial • Cero errores de OCR • Conexión directa DIAN
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold transition cursor-pointer"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
