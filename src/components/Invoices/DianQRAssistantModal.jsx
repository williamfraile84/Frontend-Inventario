import React, { useState, useEffect, useRef } from "react";
import { Html5Qrcode } from "html5-qrcode";
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
  FileCheck,
  Search,
  ArrowRight,
} from "lucide-react";
import { invoiceService } from "../../services/api";

export default function DianQRAssistantModal({
  isOpen,
  onClose,
  onInvoiceExtracted,
  onShowToast,
  currentFile = null,
}) {
  const [activeTab, setActiveTab] = useState("camera"); // 'camera' | 'file' | 'manual'
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState(null);

  // QR & CUFE Data
  const [scannedData, setScannedData] = useState(null);
  const [cufeInput, setCufeInput] = useState("");
  const [nitReceptor, setNitReceptor] = useState("40327379");
  const [copiedField, setCopiedField] = useState(null);

  // Consultation State
  const [isConsulting, setIsConsulting] = useState(false);
  const [consultationStatus, setConsultationStatus] = useState("");
  const [consultationResult, setConsultationResult] = useState(null);
  const [showCaptchaGuide, setShowCaptchaGuide] = useState(false);

  // PDF Drop State
  const [isProcessingPdf, setIsProcessingPdf] = useState(false);
  const [isDraggingPdf, setIsDraggingPdf] = useState(false);

  const scannerRef = useRef(null);
  const qrReaderContainerId = "dian-qr-reader-container";
  const pdfInputRef = useRef(null);
  const qrFileInputRef = useRef(null);

  // Reset or initialize on open
  useEffect(() => {
    if (isOpen) {
      setCameraError(null);
      if (currentFile) {
        // If there's already a file in InvoiceProcessor, attempt backend QR scan
        handleBackendFileScan(currentFile);
      } else {
        startCameraScanner();
      }
    } else {
      stopCameraScanner();
      setScannedData(null);
      setConsultationResult(null);
      setShowCaptchaGuide(false);
    }
    return () => {
      stopCameraScanner();
    };
  }, [isOpen]);

  const copyToClipboard = (text, fieldName) => {
    if (!text) return;
    navigator.clipboard?.writeText(text);
    setCopiedField(fieldName);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const startCameraScanner = async () => {
    setCameraError(null);
    setIsCameraActive(false);

    try {
      if (scannerRef.current) {
        try {
          await scannerRef.current.stop();
        } catch (e) {}
      }

      const html5QrCode = new Html5Qrcode(qrReaderContainerId);
      scannerRef.current = html5QrCode;

      await html5QrCode.start(
        { facingMode: "environment" },
        {
          fps: 10,
          qrbox: (viewfinderWidth, viewfinderHeight) => {
            const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
            return {
              width: Math.floor(minEdge * 0.75),
              height: Math.floor(minEdge * 0.75),
            };
          },
          aspectRatio: 1.0,
        },
        (decodedText) => {
          handleQrDetected(decodedText);
        },
        () => {
          // Frame error (esperado mientras escanea)
        }
      );

      setIsCameraActive(true);
    } catch (err) {
      console.warn("No se pudo iniciar cámara para QR:", err);
      setCameraError(
        "No se pudo acceder a la cámara. Puedes subir una foto/PDF o ingresar el CUFE manualmente."
      );
      setIsCameraActive(false);
    }
  };

  const stopCameraScanner = async () => {
    if (scannerRef.current) {
      try {
        if (scannerRef.current.isScanning) {
          await scannerRef.current.stop();
        }
        scannerRef.current.clear();
      } catch (e) {
        console.debug("Error deteniendo escáner:", e);
      }
      scannerRef.current = null;
    }
    setIsCameraActive(false);
  };

  const parseDianQrText = (rawText) => {
    const text = String(rawText || "").trim();
    let cufe = "";
    let dianUrl = "";
    let nitEmisor = "";
    let nitRec = nitReceptor;
    let numFac = "";
    let fecha = "";
    let total = 0;

    // 1. Si es URL
    const urlMatch = text.match(/DocumentKey=([a-fA-F0-9]{64,128})/i);
    if (urlMatch) {
      cufe = urlMatch[1];
      dianUrl = text;
    } else {
      // 2. CUFE directo en texto
      const cufeDirectMatch = text.match(/([a-fA-F0-9]{96})/);
      if (cufeDirectMatch) {
        cufe = cufeDirectMatch[1];
      }
    }

    // 3. Formato estándar DIAN delimitado
    const matchNumFac = text.match(/(?:NumFac|NumeroFactura|ncf)[:=]\s*([A-Za-z0-9\-]+)/i);
    if (matchNumFac) numFac = matchNumFac[1];

    const matchNitFac = text.match(/(?:NitFac|NitEmisor|Nit)[:=]\s*(\d+)/i);
    if (matchNitFac) nitEmisor = matchNitFac[1];

    const matchDocAdq = text.match(/(?:DocAdq|NitAdquirente|DocReceptor)[:=]\s*(\d+)/i);
    if (matchDocAdq) nitRec = matchDocAdq[1];

    const matchFec = text.match(/(?:FecFac|Fecha)[:=]\s*([0-9]{4}-[0-9]{2}-[0-9]{2})/i);
    if (matchFec) fecha = matchFec[1];

    const matchVal = text.match(/(?:ValTotal|ValFac|Total)[:=]\s*([0-9\.]+)/i);
    if (matchVal) total = parseFloat(matchVal[1]) || 0;

    if (cufe && !dianUrl) {
      dianUrl = `https://catalogo-vpfe.dian.gov.co/User/SearchDocument?DocumentKey=${cufe}`;
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
  };

  const handleQrDetected = (text) => {
    stopCameraScanner();
    const parsed = parseDianQrText(text);
    setScannedData(parsed);
    if (parsed.cufe) {
      setCufeInput(parsed.cufe);
    }
    if (parsed.nitReceptor) {
      setNitReceptor(parsed.nitReceptor);
    }
    onShowToast?.({
      type: "success",
      title: "Código QR Detectado",
      message: parsed.cufe
        ? `CUFE identificado: ${parsed.cufe.slice(0, 16)}...`
        : "Código QR decodificado exitosamente.",
    });
  };

  const handleBackendFileScan = async (file) => {
    setIsConsulting(true);
    setConsultationStatus("Escaneando código QR en archivo con motor de visión...");
    try {
      const res = await invoiceService.scanQr(file);
      if (res.success && res.cufe) {
        setScannedData({
          cufe: res.cufe,
          dianUrl: res.dian_url,
          nitEmisor: res.nit_emisor,
          nitReceptor: res.nit_receptor || nitReceptor,
          numeroFactura: res.numero_factura,
          fecha: res.fecha,
          total: res.total,
        });
        setCufeInput(res.cufe);
        if (res.nit_receptor) {
          setNitReceptor(res.nit_receptor);
        }
        onShowToast?.({
          type: "success",
          title: "Código QR DIAN Identificado",
          message: `CUFE extraído del documento: ${res.cufe.slice(0, 16)}...`,
        });
      } else {
        onShowToast?.({
          type: "info",
          title: "Sin código QR visible",
          message:
            res.message ||
            "No se detectó un código QR legible. Puedes ingresar el CUFE manualmente.",
        });
      }
    } catch (err) {
      console.warn("Fallo escaneando QR desde archivo:", err);
    } finally {
      setIsConsulting(false);
      setConsultationStatus("");
    }
  };

  const handleManualCufeSubmit = (e) => {
    e?.preventDefault();
    const clean = cufeInput.trim();
    if (!clean) return;
    const parsed = parseDianQrText(clean);
    setScannedData(parsed);
  };

  const handleConsultDian = async () => {
    const cufe = scannedData?.cufe || cufeInput.trim();
    if (!cufe) {
      onShowToast?.({
        type: "warning",
        title: "CUFE requerido",
        message: "Por favor escanea o ingresa el CUFE de la factura.",
      });
      return;
    }

    setIsConsulting(true);
    setConsultationStatus("Conectando al Catálogo Oficial VPFE de la DIAN...");
    setShowCaptchaGuide(false);

    try {
      const res = await invoiceService.consultDian({
        documentKey: cufe,
        nit: nitReceptor || undefined,
      });

      setConsultationResult(res);

      if (res.success && res.extraction) {
        onShowToast?.({
          type: "success",
          title: "Factura DIAN Obtenida",
          message: "Datos extraídos directamente del documento oficial sin errores de OCR.",
        });
        onInvoiceExtracted?.(res.extraction);
        onClose?.();
      } else if (res.requires_user_captcha) {
        setShowCaptchaGuide(true);
        onShowToast?.({
          type: "info",
          title: "Portal DIAN con Captcha",
          message:
            "El portal de la DIAN solicita resolución interactiva de Captcha. Sigue los 3 pasos asistidos.",
        });
      } else {
        setShowCaptchaGuide(true);
        onShowToast?.({
          type: "warning",
          title: "Verificación requerida",
          message: res.message || "Por favor ingresa al enlace oficial para descargar el PDF.",
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
      setConsultationStatus("");
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
      const res = await invoiceService.processImage(file, { provider: "pdf" });
      if (res && (res.items?.length || res.success)) {
        onShowToast?.({
          type: "success",
          title: "PDF DIAN Desencriptado y Procesado",
          message: `Se extrajeron ${res.items?.length || 0} productos del documento oficial con 100% de exactitud.`,
        });
        onInvoiceExtracted?.(res);
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

  if (!isOpen) return null;

  const currentCufe = scannedData?.cufe || cufeInput.trim();
  const currentDianUrl =
    scannedData?.dianUrl ||
    (currentCufe
      ? `https://catalogo-vpfe.dian.gov.co/User/SearchDocument?DocumentKey=${currentCufe}`
      : "");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Encabezado */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shadow-inner">
              <QrCode className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                Consulta Oficial DIAN
                <span className="text-[10px] bg-emerald-950/80 text-emerald-300 border border-emerald-800/60 px-2 py-0.5 rounded-full font-semibold">
                  Catálogo VPFE
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Escaneo de código QR y descarga de factura electrónica oficial con NIT
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
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
              <div className="grid grid-cols-3 gap-2 p-1 bg-slate-950/80 border border-slate-800 rounded-xl">
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab("camera");
                    startCameraScanner();
                  }}
                  className={`py-2 px-3 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition ${
                    activeTab === "camera"
                      ? "bg-emerald-600 text-white shadow-md"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  <Camera className="w-3.5 h-3.5" />
                  <span>Cámara QR</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab("file");
                    stopCameraScanner();
                  }}
                  className={`py-2 px-3 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition ${
                    activeTab === "file"
                      ? "bg-emerald-600 text-white shadow-md"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Subir Imagen / PDF</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab("manual");
                    stopCameraScanner();
                  }}
                  className={`py-2 px-3 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition ${
                    activeTab === "manual"
                      ? "bg-emerald-600 text-white shadow-md"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  <Search className="w-3.5 h-3.5" />
                  <span>Pegar CUFE</span>
                </button>
              </div>

              {/* Pestaña: Cámara */}
              {activeTab === "camera" && (
                <div className="space-y-3">
                  <div className="relative bg-slate-950 border border-slate-800 rounded-xl overflow-hidden aspect-square sm:aspect-video flex items-center justify-center">
                    <div
                      id={qrReaderContainerId}
                      className="w-full h-full [&_video]:object-cover"
                    />
                    {!isCameraActive && !cameraError && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-slate-950/90 p-4 text-center">
                        <RefreshCw className="w-6 h-6 animate-spin text-emerald-400" />
                        <span className="text-xs text-slate-300 font-medium">
                          Iniciando cámara trasera...
                        </span>
                      </div>
                    )}
                    {cameraError && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-950/95 p-4 text-center">
                        <AlertCircle className="w-8 h-8 text-amber-400" />
                        <p className="text-xs text-slate-300 max-w-sm">{cameraError}</p>
                        <button
                          type="button"
                          onClick={() => setActiveTab("file")}
                          className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-semibold border border-slate-700"
                        >
                          Subir imagen o PDF en su lugar
                        </button>
                      </div>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-400 text-center">
                    Apunta la cámara al código QR impreso en la factura electrónica o tirilla.
                  </p>
                </div>
              )}

              {/* Pestaña: Archivo */}
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
                    }}
                  />
                  <div
                    onClick={() => qrFileInputRef.current?.click()}
                    className="border-2 border-dashed border-slate-700 hover:border-emerald-500/60 rounded-xl p-8 flex flex-col items-center justify-center gap-3 cursor-pointer bg-slate-950/40 hover:bg-slate-950 transition"
                  >
                    <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center text-slate-300">
                      <Upload className="w-6 h-6 text-emerald-400" />
                    </div>
                    <div className="text-center">
                      <span className="text-xs font-semibold text-slate-200 block">
                        Haz clic para seleccionar foto o PDF con el código QR
                      </span>
                      <span className="text-[10px] text-slate-500 block mt-1">
                        Soporta JPG, PNG, WebP o archivos PDF
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Pestaña: Manual */}
              {activeTab === "manual" && (
                <form onSubmit={handleManualCufeSubmit} className="space-y-3">
                  <label className="text-xs font-semibold text-slate-300 block">
                    Pega el CUFE (96 caracteres) o la URL completa de la DIAN:
                  </label>
                  <textarea
                    rows={3}
                    value={cufeInput}
                    onChange={(e) => setCufeInput(e.target.value)}
                    placeholder="4762e53ca28b77ae5860413db8ae362e7685800954c8afbdd47208fcfdeda4600b6df7a27aa23dac5d00b568ae3b3c0c o https://catalogo-vpfe.dian.gov.co/User/SearchDocument?DocumentKey=..."
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs text-slate-200 focus:outline-none focus:border-emerald-500 font-mono resize-none"
                  />
                  <button
                    type="submit"
                    disabled={!cufeInput.trim()}
                    className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-2"
                  >
                    <span>Continuar con este CUFE</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </form>
              )}
            </div>
          ) : (
            /* Vista de CUFE Identificado y Panel de Consulta DIAN */
            <div className="space-y-5">
              {/* Tarjeta de Resumen del Documento Encontrado */}
              <div className="p-4 bg-slate-950/70 border border-emerald-900/50 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4" />
                    Código QR / CUFE Detectado
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setScannedData(null);
                      setCufeInput("");
                      startCameraScanner();
                    }}
                    className="text-[11px] text-slate-400 hover:text-slate-200 underline"
                  >
                    Escanear otro código
                  </button>
                </div>

                {/* CUFE Display con botón Copiar */}
                <div className="bg-slate-900 border border-slate-800 rounded-lg p-2.5 flex items-center justify-between gap-2">
                  <div className="overflow-hidden">
                    <span className="text-[10px] text-slate-400 block font-medium">
                      CUFE / UUID de la Factura:
                    </span>
                    <span className="text-xs font-mono text-slate-200 truncate block select-all">
                      {currentCufe}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(currentCufe, "cufe")}
                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition shrink-0"
                    title="Copiar CUFE"
                  >
                    {copiedField === "cufe" ? (
                      <Check className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </button>
                </div>

                {/* Configuración de NIT Receptor */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                      NIT Receptor / Emisor (.env):
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        value={nitReceptor}
                        onChange={(e) => setNitReceptor(e.target.value)}
                        placeholder="40327379"
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono text-slate-200 focus:outline-none focus:border-emerald-500"
                      />
                      <button
                        type="button"
                        onClick={() => copyToClipboard(nitReceptor, "nit")}
                        className="absolute right-2 top-2 p-1 text-slate-400 hover:text-slate-200"
                        title="Copiar NIT"
                      >
                        {copiedField === "nit" ? (
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
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
                    <div className="bg-slate-900/60 border border-slate-800/80 rounded-lg p-2.5 text-xs text-slate-300 space-y-1">
                      <div className="flex justify-between">
                        <span className="text-slate-400 text-[11px]">Factura #:</span>
                        <span className="font-semibold">{scannedData.numeroFactura}</span>
                      </div>
                      {scannedData.fecha && (
                        <div className="flex justify-between">
                          <span className="text-slate-400 text-[11px]">Fecha:</span>
                          <span>{scannedData.fecha}</span>
                        </div>
                      )}
                      {scannedData.total > 0 && (
                        <div className="flex justify-between">
                          <span className="text-slate-400 text-[11px]">Total QR:</span>
                          <span className="font-semibold text-emerald-400">
                            ${scannedData.total.toLocaleString("es-CO")}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Botón Principal: Consulta Automática */}
              <div className="space-y-3">
                <button
                  type="button"
                  onClick={handleConsultDian}
                  disabled={isConsulting || isProcessingPdf}
                  className="w-full py-3 px-4 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:from-slate-800 disabled:to-slate-800 text-white rounded-xl font-bold text-sm shadow-lg shadow-emerald-600/20 transition flex items-center justify-center gap-2"
                >
                  {isConsulting ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin text-emerald-300" />
                      <span>{consultationStatus || "Consultando portal DIAN..."}</span>
                    </>
                  ) : (
                    <>
                      <FileCheck className="w-4 h-4" />
                      <span>⚡ Descargar y Procesar Factura Oficial DIAN</span>
                    </>
                  )}
                </button>

                <p className="text-[11px] text-slate-400 text-center">
                  Descarga el PDF original, lo desencripta automáticamente en memoria con el NIT y carga los productos sin fallos de OCR.
                </p>
              </div>

              {/* Flujo Asistido con Turnstile / Captcha */}
              {(showCaptchaGuide || consultationResult?.requires_user_captcha) && (
                <div className="p-4 bg-amber-950/30 border border-amber-800/60 rounded-xl space-y-3 animate-fade-in">
                  <div className="flex items-start gap-2.5">
                    <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-xs font-bold text-amber-200">
                        El portal DIAN solicita verificación interactiva (Captcha)
                      </h4>
                      <p className="text-[11px] text-slate-300 mt-1">
                        Sigue estos 3 sencillos pasos para obtener la factura oficial con contraseña:
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2 text-xs text-slate-300 bg-slate-950/60 p-3 rounded-lg border border-slate-800">
                    <div className="flex items-center justify-between gap-2">
                      <span>
                        <strong>Paso 1:</strong> Abre la página oficial de la DIAN:
                      </span>
                      <a
                        href={currentDianUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="py-1 px-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold rounded-lg flex items-center gap-1 shrink-0"
                      >
                        <span>Abrir Portal DIAN</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span>
                        <strong>Paso 2:</strong> Pega el NIT del receptor (
                        <code className="text-emerald-300 font-mono">{nitReceptor}</code>), resuelve el captcha y haz clic en <strong>Buscar</strong>.
                      </span>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(nitReceptor, "nit_btn")}
                        className="py-1 px-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-semibold rounded-lg flex items-center gap-1 shrink-0"
                      >
                        {copiedField === "nit_btn" ? (
                          <Check className="w-3 h-3 text-emerald-400" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                        <span>Copiar NIT</span>
                      </button>
                    </div>
                    <div>
                      <strong>Paso 3:</strong> En la pantalla del documento, haz clic en el botón{" "}
                      <span className="text-emerald-400 font-semibold">"Descargar PDF"</span> y suelta el archivo aquí abajo.
                    </div>
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
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold transition"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
