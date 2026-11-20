import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  Receipt,
  FileText,
  Camera,
  UploadCloud,
  CheckCircle2,
  Trash2,
  Plus,
  RefreshCw,
  Sliders,
  Percent,
  DollarSign,
  Building2,
  Calendar,
  Hash,
  Eye,
  HelpCircle,
  Check,
  X,
  Sparkles,
  History,
  Package,
  Boxes,
  ExternalLink,
  RotateCw,
  FileCode,
  Copy,
  Download,
  RotateCcw,
  QrCode,
  Lock,
  AlertCircle,
} from "lucide-react";
import {
  invoiceService,
  redondearCentenaCercana,
} from "../../services/api";
import { useLoading } from "../../context/LoadingContext";
import GlobalProfitMarginModal from "../common/GlobalProfitMarginModal";
import DianQRAssistantModal from "./DianQRAssistantModal";
import InvoiceReconciliationModal from "./InvoiceReconciliationModal";

const normalizeDateInput = (str) => {
  if (!str) return new Date().toISOString().split("T")[0];
  const s = String(str).trim();
  const mIso = s.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
  if (mIso) {
    const [, y, m, d] = mIso;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  const mDmy = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (mDmy) {
    const [, d, m, y] = mDmy;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return s.split("T")[0] || new Date().toISOString().split("T")[0];
};

// Formato de moneda colombiana (puntos de miles: 1610 -> "1.610", 16100 -> "16.100")
const formatCOP = (val) => {
  if (val === null || val === undefined || val === "") return "";
  const num = Number(val);
  if (isNaN(num)) return "";
  if (Math.abs(num % 1) > 0.001) {
    return num.toLocaleString("es-CO", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    });
  }
  return Math.round(num).toLocaleString("es-CO");
};

// Extraer el valor numérico limpio de una cadena COP
const parseCOP = (str) => {
  if (str === null || str === undefined || str === "") return 0;
  if (typeof str === "number") return isNaN(str) ? 0 : str;
  const cleaned = str
    .toString()
    .replace(/\./g, "")
    .replace(",", ".")
    .replace(/[^0-9.]/g, "");
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
};

// Input con formato en vivo de moneda colombiana para edición fluida
function CurrencyFormattedInput({
  value,
  onChange,
  className = "",
  title = "",
  placeholder = "0",
}) {
  const [displayValue, setDisplayValue] = useState(() => formatCOP(value));
  const [isFocused, setIsFocused] = useState(false);
  const [prevValue, setPrevValue] = useState(value);

  if (value !== prevValue) {
    setPrevValue(value);
    if (!isFocused) {
      setDisplayValue(formatCOP(value));
    }
  }

  const handleChange = (e) => {
    const rawText = e.target.value;
    if (rawText === "") {
      setDisplayValue("");
      onChange(0);
      return;
    }
    const num = parseCOP(rawText);
    setDisplayValue(formatCOP(num));
    onChange(num);
  };

  const handleFocus = (e) => {
    setIsFocused(true);
    e.target.select();
  };

  const handleBlur = () => {
    setIsFocused(false);
    setDisplayValue(formatCOP(value));
  };

  return (
    <input
      type="text"
      inputMode="numeric"
      value={displayValue}
      onChange={handleChange}
      onFocus={handleFocus}
      onBlur={handleBlur}
      placeholder={placeholder}
      title={title}
      className={className}
    />
  );
}

export default function InvoiceProcessor({ onShowToast, isTvMode = false }) {
  const { showLoader, hideLoader } = useLoading();

  // Mode: 'process' (live OCR / edit) or 'history' (view previous invoices)
  const [activeSubView, setActiveSubView] = useState("process");

  // File & Upload State
  const [selectedFile, setSelectedFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [imageRotation, setImageRotation] = useState(0);
  const [isXmlFile, setIsXmlFile] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStatusText, setProcessingStatusText] = useState("");
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const abortControllerRef = useRef(null);

  // Selector de Motor de Visión e IA: 'gemini' (Predeterminado Nube 2s), 'xml' (XML UBL 2.1 DIAN), 'qr_dian' (DIAN QR), 'pdf' (PDF DIAN)
  const [ocrProvider, setOcrProvider] = useState("gemini");
  const [isDianModalOpen, setIsDianModalOpen] = useState(false);
  const [detectedQrInfo, setDetectedQrInfo] = useState(null);
  const [invoiceCufe, setInvoiceCufe] = useState("");
  const [invoiceDianUrl, setInvoiceDianUrl] = useState("");

  // Global Invoice Controls
  const [isVatIncluded, setIsVatIncluded] = useState(false);
  const [
    defaultIncludeTaxInPurchaseValue,
    setDefaultIncludeTaxInPurchaseValue,
  ] = useState(false);
  const [globalMargin, setGlobalMargin] = useState(30.0);
  // Modal de confirmación para aplicar margen global (% para todos o no modificados manualmente como en sistema_fruver)
  const [showMarginModal, setShowMarginModal] = useState(false);
  const [targetGlobalMargin, setTargetGlobalMargin] = useState(30.0);
  // 'cost' = Margen sobre Costo (Markup - Por defecto) | 'sale' = Margen sobre Venta (Utilidad Bruta)
  const [marginMethod, setMarginMethod] = useState(() => {
    try {
      return localStorage.getItem("fruver_margin_method") || "cost";
    } catch {
      return "cost";
    }
  });
  // 'unidad' = Venta por Unidad suelta (Por defecto) | 'paquete' = Venta por Paquete/Presentación completa
  const [defaultSaleMode, setDefaultSaleMode] = useState(() => {
    try {
      return localStorage.getItem("fruver_default_sale_mode") || "unidad";
    } catch {
      return "unidad";
    }
  });

  // Invoice Metadata
  const [supplierName, setSupplierName] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(
    new Date().toISOString().split("T")[0],
  );
  const [visionProviderUsed, setVisionProviderUsed] = useState("");
  const [confidenceScore, setConfidenceScore] = useState(null);

  // Parsed Items
  const [items, setItems] = useState([]);

  // Selected item for math breakdown modal
  const [selectedItemForBreakdown, setSelectedItemForBreakdown] =
    useState(null);

  const [isApplying, setIsApplying] = useState(false);
  const [isReconciliationModalOpen, setIsReconciliationModalOpen] = useState(false);

  // Invoice History State
  const [historyList, setHistoryList] = useState([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [selectedHistoryInvoice, setSelectedHistoryInvoice] = useState(null);

  // Custom Tax Manager modal state
  const [customTaxModalItem, setCustomTaxModalItem] = useState(null);
  const [customTaxForm, setCustomTaxForm] = useState({
    name: "",
    type: "percent",
    value: "",
  });

  // Standard tax templates grouped by tax category (IVA, IPO/ADV Licores, ICUI, INC)
  const TAX_OPTIONS_IVA = [
    {
      name: "IVA 19%",
      label: "19%",
      rate: 0.19,
      group: "iva",
      title: "IVA Tarifa General (19%)",
    },
    {
      name: "IVA 5%",
      label: "5%",
      rate: 0.05,
      group: "iva",
      title: "IVA Tarifa Reducida / Licores y Vinos (5%)",
    },
    {
      name: "Exento (0%)",
      label: "0%",
      rate: 0.0,
      group: "iva",
      title: "Exento o Excluido (0%)",
    },
  ];

  // Impuesto al Consumo Ad-Valorem de Licores y Vinos (Colombia - Ley 1819 de 2016)
  const TAX_OPTIONS_IPO_ADV = [
    {
      name: "IPO+ADV 25%",
      label: "25%",
      rate: 0.25,
      group: "ipo_adv",
      title:
        "Licores destilados: Ron, Aguardiente, Whisky, Vodka, Tequila (25%)",
    },
    {
      name: "IPO+ADV 20%",
      label: "20%",
      rate: 0.2,
      group: "ipo_adv",
      title: "Vinos y aperitivos vínicos (20%)",
    },
  ];

  // Impuesto a los Comestibles Ultraprocesados (Colombia - Ley 2277 de 2022)
  const TAX_OPTIONS_ICUI = [
    {
      name: "ICUI 20%",
      label: "20%",
      rate: 0.2,
      group: "icui",
      title: "ICUI Tarifa 2025+ (20%)",
    },
    {
      name: "ICUI 15%",
      label: "15%",
      rate: 0.15,
      group: "icui",
      title: "ICUI Tarifa 2024 (15%)",
    },
    {
      name: "ICUI 10%",
      label: "10%",
      rate: 0.1,
      group: "icui",
      title: "ICUI Tarifa 2023 (10%)",
    },
  ];

  // Impuesto Nacional al Consumo (INC)
  const TAX_OPTIONS_INC = [
    {
      name: "INC 8%",
      label: "8%",
      rate: 0.08,
      group: "inc",
      title: "Impuesto Nacional al Consumo (8%)",
    },
  ];

  // Helper para normalizar impuestos y evitar incompatibilidades
  const sanitizeItemTaxes = (taxes) => {
    if (!Array.isArray(taxes) || taxes.length === 0) {
      return [{ name: "IVA 19%", label: "19%", rate: 0.19, group: "iva" }];
    }

    // 1. IVA (19%, 5%, 0%)
    const ivaTaxes = taxes.filter(
      (t) =>
        (t.group === "iva" || (t.name || "").toUpperCase().includes("IVA")) &&
        (parseFloat(t.rate) || 0) > 0,
    );
    const exempt = taxes.filter(
      (t) =>
        (t.name || "").toUpperCase().includes("EXENTO") ||
        ((t.group === "iva" || (t.name || "").toUpperCase().includes("IVA")) &&
          (parseFloat(t.rate) || 0) === 0),
    );

    let chosenIva = null;
    if (ivaTaxes.length > 0) {
      chosenIva = ivaTaxes.reduce((prev, curr) =>
        (parseFloat(curr.rate) || 0) > (parseFloat(prev.rate) || 0)
          ? curr
          : prev,
      );
    } else if (exempt.length > 0) {
      chosenIva = { name: "Exento (0%)", label: "0%", rate: 0.0, group: "iva" };
    }

    // 2. IPO / ADV (Licores y Vinos)
    const ipoAdvTaxes = taxes.filter(
      (t) =>
        (t.group === "ipo_adv" ||
          (t.name || "").toUpperCase().includes("ADV") ||
          (t.name || "").toUpperCase().includes("IPO+ADV") ||
          (t.name || "").toUpperCase().includes("IPO ADV") ||
          ((t.name || "").toUpperCase().includes("IPO") &&
            !(t.name || "").toUpperCase().includes("ICUI"))) &&
        (parseFloat(t.rate) || 0) > 0,
    );
    let chosenIpoAdv = null;
    if (ipoAdvTaxes.length > 0) {
      chosenIpoAdv = ipoAdvTaxes.reduce((prev, curr) =>
        (parseFloat(curr.rate) || 0) > (parseFloat(prev.rate) || 0)
          ? curr
          : prev,
      );
    }

    // 3. ICUI (Comestibles Ultraprocesados)
    const icuiTaxes = taxes.filter(
      (t) =>
        (t.group === "icui" || (t.name || "").toUpperCase().includes("ICUI")) &&
        (parseFloat(t.rate) || 0) > 0,
    );
    let chosenIcui = null;
    if (icuiTaxes.length > 0) {
      chosenIcui = icuiTaxes.reduce((prev, curr) =>
        (parseFloat(curr.rate) || 0) > (parseFloat(prev.rate) || 0)
          ? curr
          : prev,
      );
    }

    // 4. INC (Impuesto Nacional al Consumo)
    const incTaxes = taxes.filter(
      (t) =>
        (t.group === "inc" ||
          ((t.name || "").toUpperCase().includes("INC") &&
            !(t.name || "").toUpperCase().includes("IPO") &&
            !(t.name || "").toUpperCase().includes("ADV"))) &&
        (parseFloat(t.rate) || 0) > 0,
    );
    let chosenInc = null;
    if (incTaxes.length > 0) {
      chosenInc = incTaxes.reduce((prev, curr) =>
        (parseFloat(curr.rate) || 0) > (parseFloat(prev.rate) || 0)
          ? curr
          : prev,
      );
    }

    // 5. Impuestos Personalizados o Fijos (IBUA, Bolsas, valor específico en $)
    const customTaxes = taxes.filter((t) => {
      const nameU = (t.name || "").toUpperCase();
      const hasFixed = (parseFloat(t.fixed_amount || t.valor_fijo) || 0) > 0;
      const isStandardGroup =
        t.group === "iva" ||
        t.group === "ipo_adv" ||
        t.group === "icui" ||
        t.group === "inc" ||
        nameU.includes("IVA") ||
        nameU.includes("EXENTO") ||
        nameU.includes("ADV") ||
        nameU.includes("ICUI") ||
        nameU.includes("INC");
      return hasFixed || (!isStandardGroup && (parseFloat(t.rate) || 0) > 0);
    });

    const clean = [];
    if (chosenIva) {
      const ivaRate = parseFloat(chosenIva.rate) || 0;
      let ivaName = chosenIva.name;
      let ivaLabel = chosenIva.label;
      if (ivaRate >= 0.18) {
        ivaName = "IVA 19%";
        ivaLabel = "19%";
      } else if (ivaRate >= 0.04 && ivaRate <= 0.06) {
        ivaName = "IVA 5%";
        ivaLabel = "5%";
      } else if (ivaRate === 0) {
        ivaName = "Exento (0%)";
        ivaLabel = "0%";
      }
      clean.push({
        name: ivaName,
        label: ivaLabel || `${Math.round(ivaRate * 100)}%`,
        rate: ivaRate,
        group: "iva",
      });
    }

    if (chosenIpoAdv) {
      const advRate = parseFloat(chosenIpoAdv.rate) || 0;
      let advName = chosenIpoAdv.name;
      let advLabel = chosenIpoAdv.label;
      if (advRate >= 0.23) {
        advName = "IPO+ADV 25%";
        advLabel = "25%";
      } else if (advRate >= 0.18 && advRate <= 0.22) {
        advName = "IPO+ADV 20%";
        advLabel = "20%";
      }
      clean.push({
        name: advName,
        label: advLabel || `${Math.round(advRate * 100)}%`,
        rate: advRate,
        group: "ipo_adv",
      });
    }

    if (chosenIcui) {
      const icuiRate = parseFloat(chosenIcui.rate) || 0;
      let icuiName = chosenIcui.name;
      let icuiLabel = chosenIcui.label;
      if (icuiRate >= 0.18) {
        icuiName = "ICUI 20%";
        icuiLabel = "20%";
      } else if (icuiRate >= 0.13 && icuiRate <= 0.17) {
        icuiName = "ICUI 15%";
        icuiLabel = "15%";
      } else if (icuiRate >= 0.08 && icuiRate <= 0.12) {
        icuiName = "ICUI 10%";
        icuiLabel = "10%";
      }
      clean.push({
        name: icuiName,
        label: icuiLabel || `${Math.round(icuiRate * 100)}%`,
        rate: icuiRate,
        group: "icui",
      });
    }

    if (chosenInc) {
      const incRate = parseFloat(chosenInc.rate) || 0;
      clean.push({
        name: "INC 8%",
        label: "8%",
        rate: incRate > 0 ? incRate : 0.08,
        group: "inc",
      });
    }

    for (const ct of customTaxes) {
      clean.push({
        name: ct.name || "Impuesto Adicional",
        label:
          ct.label ||
          (ct.rate > 0
            ? `${Math.round(ct.rate * 100)}%`
            : `$${Math.round(ct.fixed_amount || ct.valor_fijo || 0).toLocaleString("es-CO")}`),
        rate: parseFloat(ct.rate) || 0,
        fixed_amount: parseFloat(ct.fixed_amount || ct.valor_fijo) || 0,
        group: ct.group || "custom",
      });
    }

    return clean.length > 0
      ? clean
      : [{ name: "Exento (0%)", label: "0%", rate: 0.0, group: "iva" }];
  };

  // Helper para determinar si un impuesto está activo en el ítem
  const isTaxActive = (item, tax) => {
    const taxes = Array.isArray(item.impuestos) ? item.impuestos : [];
    const grp = tax.group;

    if (grp === "iva") {
      if (tax.rate === 0) {
        // Exento: activo si no hay IVA con tasa > 0
        const hasPositiveIva = taxes.some(
          (t) =>
            (t.group === "iva" ||
              (t.name || "").toUpperCase().includes("IVA")) &&
            (parseFloat(t.rate) || 0) > 0,
        );
        return !hasPositiveIva;
      }
      return taxes.some(
        (t) =>
          (t.group === "iva" || (t.name || "").toUpperCase().includes("IVA")) &&
          (Math.abs((parseFloat(t.rate) || 0) - tax.rate) < 0.005 ||
            t.name === tax.name),
      );
    }

    if (grp === "ipo_adv") {
      return taxes.some(
        (t) =>
          (t.group === "ipo_adv" ||
            (t.name || "").toUpperCase().includes("ADV") ||
            (t.name || "").toUpperCase().includes("IPO+ADV") ||
            (t.name || "").toUpperCase().includes("IPO ADV")) &&
          (Math.abs((parseFloat(t.rate) || 0) - tax.rate) < 0.005 ||
            t.name === tax.name),
      );
    }

    if (grp === "icui") {
      return taxes.some(
        (t) =>
          (t.group === "icui" ||
            (t.name || "").toUpperCase().includes("ICUI")) &&
          (Math.abs((parseFloat(t.rate) || 0) - tax.rate) < 0.005 ||
            t.name === tax.name),
      );
    }

    if (grp === "inc") {
      return taxes.some(
        (t) =>
          (t.group === "inc" || (t.name || "").toUpperCase().includes("INC")) &&
          (Math.abs((parseFloat(t.rate) || 0) - tax.rate) < 0.005 ||
            t.name === tax.name),
      );
    }

    return taxes.some((t) => t.name === tax.name);
  };

  // Recalculate all row costs whenever isVatIncluded, marginMethod or an item changes
  const recalculateItem = (
    item,
    vatIncluded = isVatIncluded,
    method = marginMethod,
    defaultIncludeTaxInPurchase = defaultIncludeTaxInPurchaseValue,
  ) => {
    const qty = parseFloat(item.cantidad) || 1;
    const unitsPerPack = Math.max(
      1,
      parseFloat(item.unidades_por_presentacion) || 1,
    );
    // Costo de compra de la presentación/empaque (bruto/base)
    const presCost = parseFloat(item.costo_presentacion) || 0;
    
    // Soporte dual: Descuento en Porcentaje (%) o en Valor Monetario ($ en pesos COP)
    // Regla de Negocio Fruver POS:
    // Los descuentos del proveedor son ofertas o promociones temporales.
    // 1. En la factura se aplican descontando el costo (- Dcto).
    // 2. Para el Precio de Venta al Público (POS), siempre se le suman los descuentos (+ Dcto)
    //    para preservar el margen comercial y no devaluar el precio de venta cuando el proveedor da ofertas.
    const discountMode = item.modo_descuento === "valor" ? "valor" : "porcentaje";
    let discountPercent = 0;
    let discountValueTotal = 0;
    const totalGrossLine = presCost * qty;

    // Si el ítem viene con múltiples descuentos, sumarlos todos
    let multiDctoVal = 0;
    let multiDctoPct = 0;
    if (Array.isArray(item.descuentos) && item.descuentos.length > 0) {
      item.descuentos.forEach((d) => {
        multiDctoVal += parseFloat(d.monto || d.valor || 0);
        multiDctoPct += parseFloat(d.porcentaje || d.tasa || d.rate || 0);
      });
    }

    if (discountMode === "valor") {
      discountValueTotal = Math.max(0, parseFloat(item.descuento_valor) || multiDctoVal || 0);
      if (totalGrossLine > 0 && discountValueTotal > 0) {
        discountPercent = (discountValueTotal / totalGrossLine) * 100;
      } else if (multiDctoPct > 0) {
        discountPercent = multiDctoPct;
      }
    } else {
      discountPercent = Math.max(0, parseFloat(item.descuento) ?? parseFloat(item.descuento_porcentaje) ?? multiDctoPct ?? 0);
      discountValueTotal = Math.round(totalGrossLine * (discountPercent / 100) * 100) / 100;
    }

    const unitDiscount = qty > 0 ? discountValueTotal / qty : discountValueTotal;

    // Desglose de costo unitario por presentación con y sin descuento:
    const costoUnitarioMasDcto = Math.round((presCost + unitDiscount) * 100) / 100;
    const costoUnitarioMenosDcto = Math.max(0, Math.round((presCost - unitDiscount) * 100) / 100);

    const margin = parseFloat(item.margen_ganancia) ?? globalMargin;

    // Impuestos (IVA, ICUI, INC, etc.)
    const taxes = Array.isArray(item.impuestos) ? item.impuestos : [];
    const totalTaxRate = taxes.reduce(
      (sum, t) => sum + (parseFloat(t.rate) || 0),
      0,
    );
    const totalFixedTax = taxes.reduce(
      (sum, t) => sum + (parseFloat(t.fixed_amount || t.valor_fijo) || 0),
      0,
    );

    // 1. Base Unitaria y Totales SIN y CON Impuestos para: MENOS DESCUENTO (- Dcto, lo facturado)
    let baseUnitSinImpMenosDcto = costoUnitarioMenosDcto;
    if (vatIncluded && totalTaxRate > 0) {
      baseUnitSinImpMenosDcto = Math.max(0, (costoUnitarioMenosDcto - totalFixedTax) / (1 + totalTaxRate));
    }
    const taxUnitMenosDcto = baseUnitSinImpMenosDcto * totalTaxRate + totalFixedTax;
    const costUnitConImpMenosDcto = baseUnitSinImpMenosDcto + taxUnitMenosDcto;

    // 2. Base Unitaria y Totales SIN y CON Impuestos para: MÁS DESCUENTO (+ Dcto, base comercial sin promo)
    let baseUnitSinImpMasDcto = costoUnitarioMasDcto;
    if (vatIncluded && totalTaxRate > 0) {
      baseUnitSinImpMasDcto = Math.max(0, (costoUnitarioMasDcto - totalFixedTax) / (1 + totalTaxRate));
    }
    const taxUnitMasDcto = baseUnitSinImpMasDcto * totalTaxRate + totalFixedTax;
    const costUnitConImpMasDcto = baseUnitSinImpMasDcto + taxUnitMasDcto;

    // 4 Desgloses Totales de Compra para la línea completa (Cantidad Q):
    const totalSinImpuestosMenosDcto = Math.round(baseUnitSinImpMenosDcto * qty * 100) / 100;
    const totalSinImpuestosMasDcto = Math.round(baseUnitSinImpMasDcto * qty * 100) / 100;
    const totalConImpuestosMenosDcto = Math.round(costUnitConImpMenosDcto * qty * 100) / 100;
    const totalConImpuestosMasDcto = Math.round(costUnitConImpMasDcto * qty * 100) / 100;

    // Desglose de cada impuesto individual ($)
    const detailedTaxes = taxes.map((t) => {
      const rate = parseFloat(t.rate) || 0;
      const fixed = parseFloat(t.fixed_amount || t.valor_fijo) || 0;
      const unitTax = baseUnitSinImpMenosDcto * rate + fixed;
      const lineTax = unitTax * qty;
      return {
        ...t,
        rate,
        fixed_amount: fixed,
        base_unitaria: Math.round(baseUnitSinImpMenosDcto * 100) / 100,
        base_linea: Math.round(baseUnitSinImpMenosDcto * qty * 100) / 100,
        valor_unitario: Math.round(unitTax * 100) / 100,
        valor_total: Math.round(lineTax * 100) / 100,
      };
    });

    const totalLineTax = detailedTaxes.reduce(
      (sum, t) => sum + (t.valor_total || 0),
      0,
    );

    // Opción de incluir impuestos en el valor de compra facturado
    const includeTaxInPurchase =
      item.incluir_impuestos_valor_compra !== undefined
        ? Boolean(item.incluir_impuestos_valor_compra)
        : Boolean(defaultIncludeTaxInPurchase);

    const valorCompraCalculado = includeTaxInPurchase
      ? totalConImpuestosMenosDcto
      : totalSinImpuestosMenosDcto;

    // 3. BASE PARA PRECIO DE VENTA AL PÚBLICO (POS):
    // Como los descuentos son promociones u ofertas, SIEMPRE se le suman los descuentos (+ Dcto)
    const presCostForSale = costUnitConImpMasDcto;
    const unitCostSale = presCostForSale / unitsPerPack;

    const lineSubtotal = presCost * qty;
    const unitCostFinal = unitCostSale;
    const presCostWithTax = presCostForSale;

    // 1. Precio de Venta por UNIDAD (individual) - Siempre sumando los descuentos
    let calcSalePriceUnit = 0;
    if (method === "sale") {
      // Margen sobre la Venta (Utilidad Bruta)
      const marginDecimal = margin / 100.0;
      calcSalePriceUnit =
        marginDecimal < 0.99
          ? unitCostFinal / (1 - marginDecimal)
          : unitCostFinal * 1.5;
    } else {
      // Margen sobre el Costo (Markup - Por Defecto)
      calcSalePriceUnit = unitCostFinal * (1.0 + margin / 100.0);
    }
    const roundedSalePriceUnit = redondearCentenaCercana(calcSalePriceUnit);

    // 2. Precio de Venta por PAQUETE / PRESENTACIÓN COMPLETA
    let calcSalePricePack = 0;
    if (method === "sale") {
      const marginDecimal = margin / 100.0;
      calcSalePricePack =
        marginDecimal < 0.99
          ? presCostWithTax / (1 - marginDecimal)
          : presCostWithTax * 1.5;
    } else {
      calcSalePricePack = presCostWithTax * (1.0 + margin / 100.0);
    }
    const roundedSalePricePack = redondearCentenaCercana(calcSalePricePack);

    // Modo de venta activo: 'unidad' o 'paquete'
    const saleMode = item.modo_venta || defaultSaleMode || "unidad";

    const effectiveCalcPrice =
      saleMode === "paquete" ? calcSalePricePack : calcSalePriceUnit;
    const effectiveRoundedPrice =
      saleMode === "paquete" ? roundedSalePricePack : roundedSalePriceUnit;

    return {
      ...item,
      descuento: Math.round(discountPercent * 100) / 100,
      descuento_porcentaje: Math.round(discountPercent * 100) / 100,
      descuento_valor: Math.round(discountValueTotal * 100) / 100,
      descuento_unitario: Math.round(unitDiscount * 100) / 100,
      modo_descuento: discountMode,
      costo_presentacion: presCost,
      costo_unitario_mas_descuento: costoUnitarioMasDcto,
      costo_unitario_menos_descuento: costoUnitarioMenosDcto,
      costo_presentacion_con_iva: Math.round(costUnitConImpMasDcto * 100) / 100,
      costo_base_para_venta: Math.round(presCostForSale * 100) / 100,
      costo_compra_neto: Math.round(costoUnitarioMenosDcto * 100) / 100,
      subtotal_linea: Math.round(lineSubtotal * 100) / 100,
      costo_unitario_neto: Math.round(baseUnitSinImpMasDcto / unitsPerPack * 100) / 100,
      costo_unitario_final: Math.round(unitCostFinal * 100) / 100,
      monto_impuesto_total: Math.round(totalLineTax * 100) / 100,

      // Desglose de cada impuesto individual ($)
      impuestos_detallados: detailedTaxes,

      // 4 Desgloses Totales de Compra (con y sin impuestos, sumando y descontando el descuento)
      total_sin_impuestos_menos_descuento: totalSinImpuestosMenosDcto,
      total_sin_impuestos_mas_descuento: totalSinImpuestosMasDcto,
      total_con_impuestos_menos_descuento: totalConImpuestosMenosDcto,
      total_con_impuestos_mas_descuento: totalConImpuestosMasDcto,

      // Valor de compra calculado y su selector de impuestos
      incluir_impuestos_valor_compra: includeTaxInPurchase,
      valor_compra_sin_impuestos: totalSinImpuestosMenosDcto,
      valor_compra_con_impuestos: totalConImpuestosMenosDcto,
      valor_compra: valorCompraCalculado,

      // Precios por Unidad
      precio_venta_unidad: roundedSalePriceUnit,
      precio_venta_unidad_calculado: Math.round(calcSalePriceUnit * 100) / 100,

      // Precios por Paquete / Presentación
      precio_venta_paquete: roundedSalePricePack,
      precio_venta_paquete_calculado: Math.round(calcSalePricePack * 100) / 100,

      // Modo de venta activo
      modo_venta: saleMode,

      // Precio efectivo que se cobra y envía al POS
      precio_venta_calculado: Math.round(effectiveCalcPrice * 100) / 100,
      precio_venta_redondeado: effectiveRoundedPrice,
      metodo_margen: method,
    };
  };

  const handleFileSelect = (file) => {
    if (!file) return;
    const isImage = file.type.startsWith("image/");
    const isPdf = file.name.endsWith(".pdf");
    const isXml = file.name.endsWith(".xml") || file.type.includes("xml");

    if (!isImage && !isPdf && !isXml) {
      onShowToast?.({
        type: "error",
        title: "Formato no compatible",
        message:
          "Por favor selecciona una imagen (JPG, PNG, WebP), PDF o Factura Electrónica XML de la DIAN.",
      });
      return;
    }

    // Limpiar inmediatamente datos y productos de cualquier factura anterior al cargar nuevo archivo
    setItems([]);
    setSupplierName("");
    setInvoiceNumber("");
    setInvoiceDate(new Date().toISOString().split("T")[0]);
    setInvoiceCufe("");
    setInvoiceDianUrl("");
    setVisionProviderUsed("");
    setConfidenceScore(null);
    setSelectedHistoryInvoice(null);
    setSelectedItemForBreakdown(null);
    setCustomTaxModalItem(null);
    try {
      localStorage.removeItem("fruver_invoice_draft");
    } catch {}

    setSelectedFile(file);
    setImageRotation(0);
    setIsXmlFile(isXml);
    setDetectedQrInfo(null);
    if (isXml) {
      setOcrProvider("xml");
    } else if (ocrProvider === "xml") {
      setOcrProvider("gemini");
    }

    // Detección automática en segundo plano si el archivo contiene un código QR oficial de la DIAN
    if (isImage || isPdf) {
      invoiceService
        .scanQr(file, { allowOcr: true })
        .then((qrRes) => {
          if (qrRes?.success && qrRes?.cufe) {
            setDetectedQrInfo(qrRes);
            if (qrRes.cufe) setInvoiceCufe(qrRes.cufe);
            if (qrRes.dian_url) setInvoiceDianUrl(qrRes.dian_url);
            onShowToast?.({
              type: "info",
              title: "Código QR DIAN Identificado",
              message: `CUFE: ${qrRes.cufe.slice(0, 16)}... Vinculado con metadatos oficiales DIAN.`,
            });
          }
        })
        .catch(() => {});
    }

    if (isXml) {
      setImagePreview(null);
    } else {
      const reader = new FileReader();
      reader.onload = (e) => setImagePreview(e.target.result);
      reader.readAsDataURL(file);
    }
  };

  // Bandera para evitar sobrescribir localStorage antes de restaurar en primer render
  const hasRestoredDraftRef = useRef(false);

  // 1. Restaurar borrador de factura desde localStorage al cargar o recargar la página (F5)
  useEffect(() => {
    Promise.resolve().then(() => {
      try {
        const saved = localStorage.getItem("fruver_invoice_draft");
        if (saved) {
          const draft = JSON.parse(saved);
          if (draft && Array.isArray(draft.items) && draft.items.length > 0) {
            setItems(draft.items);
            if (draft.supplierName) setSupplierName(draft.supplierName);
            if (draft.invoiceNumber) setInvoiceNumber(draft.invoiceNumber);
            if (draft.invoiceDate) setInvoiceDate(draft.invoiceDate);
            if (draft.isVatIncluded !== undefined) setIsVatIncluded(draft.isVatIncluded);
            if (draft.defaultIncludeTaxInPurchaseValue !== undefined)
              setDefaultIncludeTaxInPurchaseValue(draft.defaultIncludeTaxInPurchaseValue);
            if (draft.globalMargin) setGlobalMargin(draft.globalMargin);
            if (draft.marginMethod) setMarginMethod(draft.marginMethod);
            if (draft.defaultSaleMode) setDefaultSaleMode(draft.defaultSaleMode);
            if (draft.visionProviderUsed) setVisionProviderUsed(draft.visionProviderUsed);
            if (draft.confidenceScore) setConfidenceScore(draft.confidenceScore);
            if (draft.invoiceCufe) setInvoiceCufe(draft.invoiceCufe);
            if (draft.invoiceDianUrl) setInvoiceDianUrl(draft.invoiceDianUrl);
            onShowToast?.({
              type: "info",
              title: "Borrador de Factura Restaurado",
              message: `Se recuperaron ${draft.items.length} artículos que estaban en edición.`,
            });
          }
        }
      } catch (err) {
        console.warn("No se pudo restaurar borrador de factura:", err);
      } finally {
        hasRestoredDraftRef.current = true;
      }
    });
  }, [onShowToast]);

  // Manejador global de tecla Escape para cerrar modales activos sin recargar página
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        if (selectedHistoryInvoice) setSelectedHistoryInvoice(null);
        if (selectedItemForBreakdown) setSelectedItemForBreakdown(null);
        if (customTaxModalItem) setCustomTaxModalItem(null);
        if (showMarginModal) setShowMarginModal(false);
        if (isReconciliationModalOpen) setIsReconciliationModalOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    selectedHistoryInvoice,
    selectedItemForBreakdown,
    customTaxModalItem,
    showMarginModal,
    isReconciliationModalOpen,
  ]);

  // 2. Persistir automáticamente el borrador actual en localStorage ante cualquier cambio
  useEffect(() => {
    if (!hasRestoredDraftRef.current) return;
    try {
      if (items.length > 0 || supplierName || invoiceNumber) {
        const draft = {
          items,
          supplierName,
          invoiceNumber,
          invoiceDate,
          isVatIncluded,
          defaultIncludeTaxInPurchaseValue,
          globalMargin,
          marginMethod,
          defaultSaleMode,
          visionProviderUsed,
          confidenceScore,
          invoiceCufe,
          invoiceDianUrl,
          updatedAt: Date.now(),
        };
        localStorage.setItem("fruver_invoice_draft", JSON.stringify(draft));
      } else {
        // Si no hay datos, asegurar que no quede ningún borrador residual
        localStorage.removeItem("fruver_invoice_draft");
      }
    } catch (err) {
      console.warn("Error guardando borrador en localStorage:", err);
    }
  }, [
    items,
    supplierName,
    invoiceNumber,
    invoiceDate,
    isVatIncluded,
    defaultIncludeTaxInPurchaseValue,
    globalMargin,
    marginMethod,
    defaultSaleMode,
    visionProviderUsed,
    confidenceScore,
    invoiceCufe,
    invoiceDianUrl,
  ]);

  const handleDrop = (e) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  // Limpiar factura actual para cargar una nueva
  const handleResetInvoice = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    // Eliminar permanentemente el borrador guardado en localStorage
    try {
      localStorage.removeItem("fruver_invoice_draft");
    } catch {}

    setSelectedFile(null);
    setImagePreview(null);
    setImageRotation(0);
    setIsXmlFile(false);
    setIsProcessing(false);
    setProcessingStatusText("");
    setDetectedQrInfo(null);
    setInvoiceCufe("");
    setInvoiceDianUrl("");
    setSupplierName("");
    setInvoiceNumber("");
    setInvoiceDate(new Date().toISOString().split("T")[0]);
    setVisionProviderUsed("");
    setConfidenceScore(null);
    setItems([]);
    setSelectedHistoryInvoice(null);
    setIsDianModalOpen(false);
    setSelectedItemForBreakdown(null);
    setCustomTaxModalItem(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (cameraInputRef.current) cameraInputRef.current.value = "";
    onShowToast?.({
      type: "info",
      title: "Factura Limpiada",
      message: "Se borraron todos los datos anteriores. Listo para una nueva factura.",
    });
  };

  // Process selected image via OCR / Vision service
  const handleProcessImage = async () => {
    if (!selectedFile) {
      onShowToast?.({
        type: "warning",
        title: "Archivo requerido",
        message:
          "Selecciona una imagen o toma una fotografía de la factura primero.",
      });
      return;
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    const isDianQrSelected = ocrProvider === "qr_dian";
    setIsProcessing(true);
    setProcessingStatusText(
      isDianQrSelected
        ? "Consultando documento en el portal oficial de la DIAN..."
        : isXmlFile || ocrProvider === "xml"
        ? "Procesando estructura XML UBL 2.1 oficial de la DIAN..."
        : "Analizando factura con Gemini Vision AI...",
    );
    showLoader({
      title: isDianQrSelected
        ? "Factura Electrónica DIAN"
        : isXmlFile || ocrProvider === "xml"
        ? "Factura XML UBL 2.1"
        : "Gemini Vision AI",
      message: isDianQrSelected
        ? "Consultando Catálogo VPFE Oficial y descargando PDF con NIT..."
        : isXmlFile || ocrProvider === "xml"
        ? "Extrayendo líneas de productos y totales oficiales en 0.02s..."
        : "Extrayendo líneas de productos, proveedor, NIT y totales con Visión AI...",
      submessage: isDianQrSelected
        ? "Descarga desatendida y desencriptación automática con 100% precisión..."
        : isXmlFile || ocrProvider === "xml"
        ? "Estructura XML estándar UBL 2.1 certificada por la DIAN (100% exactitud)..."
        : "Procesamiento multimodal con inteligencia artificial (2 - 4 seg)...",
      iconType: isDianQrSelected ? "shield" : isXmlFile || ocrProvider === "xml" ? "document" : "sparkles",
    });

    try {
      const storedNit = localStorage.getItem("fruver_nit_receptor") || undefined;
      const res = await invoiceService.processImage(selectedFile, {
        provider: ocrProvider,
        nit: storedNit,
        rotation: imageRotation || 0,
        signal: abortControllerRef.current.signal,
        onProgress: (statusMsg) => {
          if (statusMsg) setProcessingStatusText(statusMsg);
        },
      });

      console.log("Respuesta recibida del backend para la factura:", res);

      const calculatedItems = loadInvoiceDataIntoState(res);

      if (res.motor_utilizado?.includes("Portal Oficial DIAN")) {
        onShowToast?.({
          type: "success",
          title: "Factura DIAN Oficial Descargada",
          message: `Se importaron ${calculatedItems.length} artículos directamente del Catálogo VPFE Oficial (100% Precisión).`,
        });
      } else if (res.has_qr) {
        onShowToast?.({
          type: "success",
          title: "Código QR DIAN Integrado",
          message: `Metadatos oficiales del QR vinculados con éxito (${calculatedItems.length} artículos).`,
        });
      } else {
        onShowToast?.({
          type: "success",
          title: "Factura Procesada con Éxito",
          message: `Se identificaron ${calculatedItems.length} artículos (${res.motor_utilizado || res.provider_used || "IA"}).`,
        });
      }
    } catch (err) {
      if (
        err.name === "CanceledError" ||
        err.name === "AbortError" ||
        err.code === "ERR_CANCELED"
      ) {
        console.log(
          "Lectura de factura cancelada por nueva petición o usuario.",
        );
        return;
      }
      console.error("Error processing invoice:", err);
      onShowToast?.({
        type: "error",
        title: "Error al Procesar",
        message:
          err.response?.data?.detail ||
          err.message ||
          "Fallo en el servicio de lectura de facturas.",
      });
    } finally {
      setIsProcessing(false);
      setProcessingStatusText("");
      hideLoader();
    }
  };

  // Helper para cargar datos estructurados de factura al estado (usado por OCR y Asistente DIAN)
  const loadInvoiceDataIntoState = (data) => {
    const res = data?.extraction || data;
    if (!res || res.error || (res.success === false && !res.items?.length)) {
      throw new Error(
        res?.error || res?.detail || res?.message || "No se pudo procesar la factura",
      );
    }

    setSupplierName(res.proveedor || res.supplier_name || "");
    setInvoiceNumber(res.numero_factura || res.invoice_number || "");
    if (res.fecha || res.invoice_date) {
      setInvoiceDate(normalizeDateInput(res.fecha || res.invoice_date));
    }
    if (res.cufe) {
      setInvoiceCufe(res.cufe);
    }
    if (res.dian_url) {
      setInvoiceDianUrl(res.dian_url);
    }
    setVisionProviderUsed(
      res.motor_utilizado || res.provider_used || "Local OCR",
    );
    setConfidenceScore(res.confidence_score || 0.95);

    const parsed = (res.items || []).map((item, idx) => {
      const itemTaxes = Array.isArray(item.impuestos)
        ? item.impuestos.map((t) => {
            const rawRate = parseFloat(t.tasa ?? t.rate ?? 0);
            const rate = rawRate > 1 ? rawRate / 100 : rawRate;
            const fixedVal =
              parseFloat(t.valor_fijo ?? t.fixed_amount ?? 0) || 0;
            return {
              name: t.nombre || t.name || "IVA",
              rate: rate,
              fixed_amount: fixedVal,
            };
          })
        : [];

      const qty = parseFloat(item.cantidad) || 1;
      const unitsPerPack = Math.max(
        1,
        parseFloat(item.unidades_por_presentacion) || 1,
      );

      // Costo de compra unitario por presentación/empaque (e.g. $1.610 por Gansito, $3.537 por Paquete Lecheritas)
      const presCost =
        parseFloat(item.precio_unitario) ||
        (parseFloat(item.subtotal) && qty > 0
          ? parseFloat(item.subtotal) / qty
          : 0) ||
        parseFloat(item.costo_presentacion) ||
        parseFloat(item.subtotal) ||
        parseFloat(item.total) ||
        0;

      // Calcular descuento unificado si vienen múltiples descuentos o valores mixtos
      let initialDctoVal = parseFloat(item.descuento_valor) || 0;
      let initialDctoPct = parseFloat(item.descuento_porcentaje) || parseFloat(item.descuento) || 0;
      if (Array.isArray(item.descuentos) && item.descuentos.length > 0) {
        initialDctoVal = item.descuentos.reduce((s, d) => s + (parseFloat(d.monto || d.valor || 0)), 0);
        initialDctoPct = item.descuentos.reduce((s, d) => s + (parseFloat(d.porcentaje || d.tasa || d.rate || 0)), 0);
      }
      if (initialDctoVal > 0 && initialDctoPct === 0 && presCost * qty > 0) {
        initialDctoPct = Math.round(((initialDctoVal / (presCost * qty)) * 100) * 100) / 100;
      } else if (initialDctoPct > 0 && initialDctoVal === 0) {
        initialDctoVal = Math.round((presCost * qty * (initialDctoPct / 100)) * 100) / 100;
      }

      return {
        id: `inv_item_${idx}_${Date.now()}`,
        codigo_barras: item.codigo || item.codigo_barras || "",
        descripcion:
          item.canonical_name || item.descripcion || item.name || "Producto",
        canonical_name: item.canonical_name || item.descripcion || "",
        matched_alias: Boolean(item.matched_alias),
        cantidad: qty,
        presentacion: item.presentacion || item.unidad || "UND",
        unidades_por_presentacion: unitsPerPack,
        costo_presentacion: presCost,
        descuento: initialDctoPct,
        descuento_porcentaje: initialDctoPct,
        descuento_valor: initialDctoVal,
        modo_descuento: item.modo_descuento || (initialDctoVal > 0 && !item.descuento ? "valor" : "porcentaje"),
        subtotal_linea: Math.round(presCost * qty * 100) / 100,
        impuestos: sanitizeItemTaxes(
          itemTaxes.length > 0
            ? itemTaxes
            : [{ name: "IVA 19%", label: "19%", rate: 0.19, group: "iva" }],
        ),
        margen_ganancia: item.margen_ganancia ?? globalMargin,
        is_manual_margin: false,
        confidence: item.confianza ?? item.confidence ?? 0.85,
        create_new_pos_item: !item.matched_pos_item,
        matched_pos_item: item.matched_pos_item || null,
        codigo_dian_unidad: item.codigo_dian_unidad || null,
        nombre_dian_unidad: item.nombre_dian_unidad || null,
        etiqueta_dian: item.etiqueta_dian || null,
        conversion_requerida: Boolean(item.conversion_requerida),
        factor_conversion: item.factor_conversion || 1.0,
        conversion_texto: item.conversion_texto || null,
        cantidad_inventario_convertida: item.cantidad_inventario_convertida ?? null,
        costo_inventario_convertido: item.costo_inventario_convertido ?? null,
        unidad_pos: item.unidad_pos || null,
      };
    });

    // Calculate initial row costs with current vat and margin settings
    const calculatedItems = parsed.map((item) =>
      recalculateItem(item, isVatIncluded, marginMethod),
    );
    setItems(calculatedItems);
    return calculatedItems;
  };

  // Callback cuando el asistente DIAN QR o PDF oficial extrae datos
  const handleDianInvoiceExtracted = (dianData) => {
    try {
      setActiveSubView("process");
      const calculatedItems = loadInvoiceDataIntoState(dianData);
      onShowToast?.({
        type: "success",
        title: "Factura DIAN Cargada",
        message: `Se cargaron ${calculatedItems.length} artículos del documento oficial DIAN.`,
      });
    } catch (err) {
      console.error("Error cargando factura DIAN:", err);
      onShowToast?.({
        type: "error",
        title: "Error al Cargar Factura",
        message: err.message || "No se pudieron procesar los datos de la DIAN.",
      });
    }
  };

  // Toggle tax inclusion mode globally
  const handleToggleVatIncluded = (val) => {
    setIsVatIncluded(val);
    setItems((prev) =>
      prev.map((item) => recalculateItem(item, val, marginMethod)),
    );
  };

  // Toggle margin calculation method (Markup on cost vs Financial margin on sale)
  const handleToggleMarginMethod = (newMethod) => {
    setMarginMethod(newMethod);
    try {
      localStorage.setItem("fruver_margin_method", newMethod);
    } catch (e) {
      console.warn("Could not persist margin method to localStorage", e);
    }
    setItems((prev) =>
      prev.map((item) => recalculateItem(item, isVatIncluded, newMethod)),
    );
    onShowToast?.({
      type: "info",
      title:
        newMethod === "cost"
          ? "Margen sobre Costo (Markup)"
          : "Margen sobre Venta (Utilidad Bruta)",
      message:
        newMethod === "cost"
          ? "Precios calculados con fórmula Markup: Costo Final × (1 + Margen %)."
          : "Precios calculados con fórmula Financiera: Costo Final / (1 - Margen %).",
    });
  };

  // Toggle default sale mode for multipacks (Unidad vs Paquete)
  const handleToggleDefaultSaleMode = (newMode) => {
    setDefaultSaleMode(newMode);
    try {
      localStorage.setItem("fruver_default_sale_mode", newMode);
    } catch (e) {
      console.warn("Could not persist default sale mode to localStorage", e);
    }
    setItems((prev) =>
      prev.map((item) => {
        const units = parseFloat(item.unidades_por_presentacion) || 1;
        if (units <= 1) return item;
        return recalculateItem(
          { ...item, modo_venta: newMode },
          isVatIncluded,
          marginMethod,
        );
      }),
    );
    onShowToast?.({
      type: "info",
      title:
        newMode === "unidad"
          ? "Venta por Unidad (Menudeo)"
          : "Venta por Paquete (Empaque)",
      message:
        newMode === "unidad"
          ? "Empaques configurados para cobrar por unidad individual al cliente."
          : "Empaques configurados para cobrar el paquete o caja completo.",
    });
  };

  // Solicitar cambio de margen global (abriendo modal si hay productos modificados manualmente como en sistema_fruver)
  const handleRequestGlobalMarginChange = (newMargin) => {
    const marginVal = parseFloat(newMargin) || 0;
    if (marginVal === globalMargin) return;

    const manualCount = items.filter((it) => it.is_manual_margin).length;
    if (manualCount > 0 && items.length > 0) {
      setTargetGlobalMargin(marginVal);
      setShowMarginModal(true);
    } else {
      // Si no hay productos con margen manual, aplicar directamente
      setGlobalMargin(marginVal);
      setItems((prev) =>
        prev.map((item) =>
          recalculateItem(
            { ...item, margen_ganancia: marginVal, is_manual_margin: false },
            isVatIncluded,
            marginMethod,
          ),
        ),
      );
    }
  };

  // Aplicar margen global a todos los productos (sobrescribir manuales)
  const handleApplyMarginToAll = () => {
    setGlobalMargin(targetGlobalMargin);
    setItems((prev) =>
      prev.map((item) =>
        recalculateItem(
          {
            ...item,
            margen_ganancia: targetGlobalMargin,
            is_manual_margin: false,
          },
          isVatIncluded,
          marginMethod,
        ),
      ),
    );
    setShowMarginModal(false);
    onShowToast?.({
      type: "success",
      title: "Margen Global Actualizado",
      message: `Se aplicó ${targetGlobalMargin}% a todos los ${items.length} productos del pedido.`,
    });
  };

  // Aplicar margen global solo a los productos no modificados manualmente
  const handleApplyMarginToNonManual = () => {
    setGlobalMargin(targetGlobalMargin);
    setItems((prev) =>
      prev.map((item) => {
        if (item.is_manual_margin) return item;
        return recalculateItem(
          { ...item, margen_ganancia: targetGlobalMargin },
          isVatIncluded,
          marginMethod,
        );
      }),
    );
    setShowMarginModal(false);
    const manualCount = items.filter((it) => it.is_manual_margin).length;
    onShowToast?.({
      type: "success",
      title: "Margen Global Actualizado",
      message: `Se conservaron ${manualCount} productos con margen manual y se actualizó el resto a ${targetGlobalMargin}%.`,
    });
  };

  // Restablecer margen de un ítem individual al margen global estándar
  const handleResetItemMargin = (id) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        return recalculateItem(
          { ...item, margen_ganancia: globalMargin, is_manual_margin: false },
          isVatIncluded,
          marginMethod,
        );
      }),
    );
    onShowToast?.({
      type: "info",
      title: "Margen Restablecido",
      message: `Se restauró el margen estándar (${globalMargin}%) para este artículo.`,
    });
  };

  // Apply global margin to all rows and sanitize incompatible taxes
  const handleApplyGlobalMargin = () => {
    const manualCount = items.filter((it) => it.is_manual_margin).length;
    if (manualCount > 0) {
      setTargetGlobalMargin(globalMargin);
      setShowMarginModal(true);
      return;
    }
    setItems((prev) =>
      prev.map((item) =>
        recalculateItem(
          {
            ...item,
            impuestos: sanitizeItemTaxes(item.impuestos),
            margen_ganancia: parseFloat(globalMargin) || 30.0,
            is_manual_margin: false,
          },
          isVatIncluded,
          marginMethod,
        ),
      ),
    );
    onShowToast?.({
      type: "info",
      title: "Recálculo Completo",
      message: `Se normalizaron los impuestos y se aplicó ${globalMargin}% a todos los artículos (${marginMethod === "cost" ? "Markup sobre Costo" : "Sobre Venta"}).`,
    });
  };

  // Update specific item field con sincronización automática bidireccional de Descuentos (% y $)
  const handleUpdateItem = (id, field, value) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        const isManualMargin =
          field === "margen_ganancia"
            ? true
            : (item.is_manual_margin ?? false);

        const qty = parseFloat(field === "cantidad" ? value : item.cantidad) || 1;
        const presCost = parseFloat(field === "costo_presentacion" ? value : item.costo_presentacion) || 0;
        const totalGross = presCost * qty;

        const updated = {
          ...item,
          [field]: value,
          is_manual_margin: isManualMargin,
        };

        if (field === "descuento") {
          const pct = Math.max(0, parseFloat(value) || 0);
          updated.descuento = pct;
          updated.descuento_porcentaje = pct;
          updated.descuento_valor = Math.round(totalGross * (pct / 100) * 100) / 100;
        } else if (field === "descuento_valor") {
          const val = Math.max(0, parseFloat(value) || 0);
          updated.descuento_valor = val;
          if (totalGross > 0) {
            updated.descuento = Math.round(((val / totalGross) * 100) * 100) / 100;
            updated.descuento_porcentaje = updated.descuento;
          }
        } else if (field === "costo_presentacion" || field === "cantidad") {
          const curDctoMode = item.modo_descuento === "valor" ? "valor" : "porcentaje";
          if (curDctoMode === "porcentaje") {
            const pct = parseFloat(item.descuento) || 0;
            updated.descuento_valor = Math.round(totalGross * (pct / 100) * 100) / 100;
          } else {
            const val = parseFloat(item.descuento_valor) || 0;
            if (totalGross > 0) {
              updated.descuento = Math.round(((val / totalGross) * 100) * 100) / 100;
              updated.descuento_porcentaje = updated.descuento;
            }
          }
        }

        return recalculateItem(updated, isVatIncluded, marginMethod);
      }),
    );
  };

  // Alternar si el Valor de la Compra suma o no impuestos para una fila específica
  const handleToggleRowTaxInPurchaseValue = (id) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        const currentSetting =
          item.incluir_impuestos_valor_compra !== undefined
            ? item.incluir_impuestos_valor_compra
            : defaultIncludeTaxInPurchaseValue;
        const updated = {
          ...item,
          incluir_impuestos_valor_compra: !currentSetting,
        };
        return recalculateItem(
          updated,
          isVatIncluded,
          marginMethod,
          defaultIncludeTaxInPurchaseValue,
        );
      }),
    );
  };

  // Edición directa del campo Valor de Compra (calcula en reversa el costo unitario)
  const handleUpdateValorCompra = (id, newValorStr) => {
    const val = parseFloat(newValorStr);
    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        if (isNaN(val) || val < 0) return item;

        const qty = Math.max(0.0001, parseFloat(item.cantidad) || 1);
        const includeTax =
          item.incluir_impuestos_valor_compra !== undefined
            ? item.incluir_impuestos_valor_compra
            : defaultIncludeTaxInPurchaseValue;

        const taxes = Array.isArray(item.impuestos) ? item.impuestos : [];
        const totalTaxRate = taxes.reduce(
          (sum, t) => sum + (parseFloat(t.rate) || 0),
          0,
        );
        const totalFixedTax = taxes.reduce(
          (sum, t) => sum + (parseFloat(t.fixed_amount || t.valor_fijo) || 0),
          0,
        );

        let newPresCost = 0;
        if (includeTax) {
          // El valor ingresado incluye impuestos: costo con impuestos = val / qty
          const costPerPresWithTax = val / qty;
          const costPerPresWithoutTax =
            (costPerPresWithTax - totalFixedTax) / (1 + totalTaxRate);
          newPresCost = isVatIncluded
            ? costPerPresWithTax
            : costPerPresWithoutTax;
        } else {
          // El valor ingresado no incluye impuestos: costo neto = val / qty
          const costPerPresWithoutTax = val / qty;
          const costPerPresWithTax =
            costPerPresWithoutTax * (1 + totalTaxRate) + totalFixedTax;
          newPresCost = isVatIncluded
            ? costPerPresWithTax
            : costPerPresWithoutTax;
        }

        const discountPercent = Math.max(0, parseFloat(item.descuento) || 0);
        const discountFactor =
          discountPercent > 0 && discountPercent < 100
            ? 1.0 - discountPercent / 100.0
            : 1.0;
        const grossPresCost = newPresCost / discountFactor;

        const updated = {
          ...item,
          costo_presentacion: Math.round(grossPresCost * 100) / 100,
        };
        return recalculateItem(
          updated,
          isVatIncluded,
          marginMethod,
          defaultIncludeTaxInPurchaseValue,
        );
      }),
    );
  };

  // Toggle specific tax on an item with mutually exclusive categories (IVA, IPO/ADV, ICUI, INC)
  const handleToggleItemTax = (id, taxOption) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        const currentTaxes = Array.isArray(item.impuestos)
          ? item.impuestos
          : [];
        const isCurrentActive = isTaxActive(item, taxOption);
        const grp = taxOption.group;

        let nextTaxes = [];

        if (grp === "iva") {
          // Conservar los impuestos de otros grupos (como IPO/ADV, ICUI, INC, etc.)
          const otherTaxes = currentTaxes.filter(
            (t) =>
              t.group !== "iva" &&
              !(t.name || "").toUpperCase().includes("IVA") &&
              !(t.name || "").toUpperCase().includes("EXENTO"),
          );

          if (taxOption.rate === 0) {
            // Clic en Exento (0%)
            if (isCurrentActive) {
              nextTaxes = otherTaxes;
            } else {
              nextTaxes = [
                ...otherTaxes,
                { name: "Exento (0%)", label: "0%", rate: 0.0, group: "iva" },
              ];
            }
          } else {
            // Clic en IVA 19% o IVA 5%
            if (isCurrentActive) {
              // Si ya estaba activo y se desmarca, pasa a Exento (0%)
              nextTaxes = [
                ...otherTaxes,
                { name: "Exento (0%)", label: "0%", rate: 0.0, group: "iva" },
              ];
            } else {
              // Reemplaza cualquier otro IVA activo
              nextTaxes = [
                ...otherTaxes,
                {
                  name: taxOption.name,
                  label: taxOption.label || taxOption.name,
                  rate: taxOption.rate,
                  group: "iva",
                },
              ];
            }
          }
        } else if (grp === "ipo_adv") {
          // Conservar los impuestos que no son de IPO/ADV (como IVA, ICUI, INC)
          const otherTaxes = currentTaxes.filter(
            (t) =>
              t.group !== "ipo_adv" &&
              !(t.name || "").toUpperCase().includes("ADV") &&
              !(t.name || "").toUpperCase().includes("IPO+ADV") &&
              !(t.name || "").toUpperCase().includes("IPO ADV"),
          );

          if (isCurrentActive) {
            // Si ya estaba activo, se apaga (se quita el IPO/ADV)
            nextTaxes = otherTaxes;
          } else {
            // Reemplaza cualquier otro IPO/ADV por este (ej. 20% por 25%)
            nextTaxes = [
              ...otherTaxes,
              {
                name: taxOption.name,
                label: taxOption.label || taxOption.name,
                rate: taxOption.rate,
                group: "ipo_adv",
              },
            ];
          }
        } else if (grp === "icui") {
          // Conservar los impuestos que no son de ICUI (como IVA, IPO/ADV)
          const otherTaxes = currentTaxes.filter(
            (t) =>
              t.group !== "icui" &&
              !(t.name || "").toUpperCase().includes("ICUI"),
          );

          if (isCurrentActive) {
            // Si ya estaba activo, se apaga (se quita el ICUI)
            nextTaxes = otherTaxes;
          } else {
            // Reemplaza cualquier otro ICUI por este (e.g. 10% por 20%)
            nextTaxes = [
              ...otherTaxes,
              {
                name: taxOption.name,
                label: taxOption.label || taxOption.name,
                rate: taxOption.rate,
                group: "icui",
              },
            ];
          }
        } else if (grp === "inc") {
          // Impuesto Nacional al Consumo (INC 8%)
          const otherTaxes = currentTaxes.filter(
            (t) =>
              t.group !== "inc" &&
              !(t.name || "").toUpperCase().includes("INC"),
          );

          if (isCurrentActive) {
            nextTaxes = otherTaxes;
          } else {
            nextTaxes = [
              ...otherTaxes,
              {
                name: taxOption.name,
                label: taxOption.label || taxOption.name,
                rate: taxOption.rate,
                group: "inc",
              },
            ];
          }
        } else {
          if (isCurrentActive) {
            nextTaxes = currentTaxes.filter((t) => t.name !== taxOption.name);
          } else {
            nextTaxes = [...currentTaxes, { ...taxOption }];
          }
        }

        return recalculateItem(
          { ...item, impuestos: nextTaxes },
          isVatIncluded,
          marginMethod,
        );
      }),
    );
  };

  // Open Custom Tax Modal for an item
  const handleOpenCustomTaxModal = (item) => {
    setCustomTaxModalItem(item);
    setCustomTaxForm({ name: "", type: "percent", value: "" });
  };

  // Add custom tax to the active modal item
  const handleAddCustomTax = () => {
    if (!customTaxModalItem) return;
    const taxName = (customTaxForm.name || "").trim() || "Impuesto Adicional";
    const val = parseFloat(customTaxForm.value) || 0;
    if (val <= 0) {
      onShowToast?.({
        type: "warning",
        title: "Valor requerido",
        message: "Ingresa una tasa % o valor en pesos mayor a cero.",
      });
      return;
    }

    const isPercent = customTaxForm.type === "percent";
    const rate = isPercent ? (val > 1 ? val / 100 : val) : 0;
    const fixedAmount = isPercent ? 0 : val;
    const label = isPercent
      ? `${Math.round(rate * 100)}%`
      : `$${Math.round(fixedAmount).toLocaleString("es-CO")}`;

    const newTaxObj = {
      name: `${taxName} (${label})`,
      label: label,
      rate: rate,
      fixed_amount: fixedAmount,
      group: "custom",
    };

    const updatedTaxes = [...(customTaxModalItem.impuestos || []), newTaxObj];
    const updatedItem = recalculateItem(
      { ...customTaxModalItem, impuestos: updatedTaxes },
      isVatIncluded,
      marginMethod,
    );

    setItems((prev) =>
      prev.map((it) => (it.id === customTaxModalItem.id ? updatedItem : it)),
    );
    setCustomTaxModalItem(updatedItem);
    setCustomTaxForm({ name: "", type: "percent", value: "" });
    onShowToast?.({
      type: "success",
      title: "Impuesto Adicionado",
      message: `${newTaxObj.name} aplicado a ${customTaxModalItem.descripcion || "el producto"}.`,
    });
  };

  // Remove specific tax from an item
  const handleRemoveCustomTax = (itemId, taxToRemove) => {
    setItems((prev) =>
      prev.map((it) => {
        if (it.id !== itemId) return it;
        const current = Array.isArray(it.impuestos) ? it.impuestos : [];
        const next = current.filter((t) => {
          if (t.name === taxToRemove.name) return false;
          if (
            taxToRemove.group &&
            t.group === taxToRemove.group &&
            Math.abs(
              (parseFloat(t.rate) || 0) - (parseFloat(taxToRemove.rate) || 0),
            ) < 0.005
          ) {
            return false;
          }
          return true;
        });

        const updated = recalculateItem(
          {
            ...it,
            impuestos:
              next.length > 0
                ? next
                : [
                    {
                      name: "Exento (0%)",
                      label: "0%",
                      rate: 0.0,
                      group: "iva",
                    },
                  ],
          },
          isVatIncluded,
          marginMethod,
        );

        if (customTaxModalItem && customTaxModalItem.id === itemId) {
          setCustomTaxModalItem(updated);
        }
        return updated;
      }),
    );
  };

  // Remove item row
  const handleRemoveItem = (id) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
  };

  // Add empty manual row
  const handleAddManualItem = () => {
    const newItem = {
      id: `manual_${Date.now()}`,
      codigo_barras: "",
      descripcion: "Nuevo Producto",
      cantidad: 1,
      presentacion: "UNIDAD",
      unidades_por_presentacion: 1,
      costo_presentacion: 0,
      descuento: 0,
      impuestos: [{ name: "IVA 19%", label: "19%", rate: 0.19, group: "iva" }],
      margen_ganancia: globalMargin,
      is_manual_margin: false,
      confidence: 1.0,
      create_new_pos_item: true,
      modo_venta: defaultSaleMode || "unidad",
    };
    setItems((prev) => [
      ...prev,
      recalculateItem(newItem, isVatIncluded, marginMethod),
    ]);
  };

  // Copiar resumen de precios calculados al portapapeles
  const handleCopySummary = () => {
    if (items.length === 0) {
      onShowToast?.({
        type: "warning",
        title: "Sin artículos",
        message: "No hay productos calculados para copiar.",
      });
      return;
    }
    const header =
      "Código\tDescripción\tCant\tPresentación\tCosto Unitario\tDescuento\tValor Compra Sin Imp\tValor Compra Con Imp\tImpuestos Detallados\tTot Impuestos\tCosto Final Und\tMargen\tPrecio Und\tPrecio Paquete\tModo Venta\tCobro POS\n";
    const rows = items
      .map((i) => {
        const taxStr = (i.impuestos_detallados || [])
          .map((t) => `${t.name}: $${Math.round(t.valor_total || 0)}`)
          .join(" | ");
        return `${i.codigo_barras || "S/C"}\t${i.descripcion}\t${i.cantidad}\t${i.presentacion} x ${i.unidades_por_presentacion}\t$${i.costo_presentacion}\t${i.descuento || 0}%\t$${Math.round(i.valor_compra_sin_impuestos || 0)}\t$${Math.round(i.valor_compra_con_impuestos || 0)}\t${taxStr || "Exento"}\t$${Math.round(i.monto_impuesto_total || 0)}\t$${i.costo_unitario_final || i.costo_unitario_neto}\t${i.margen_ganancia}%\t$${i.precio_venta_unidad || i.precio_venta_redondeado}\t$${i.precio_venta_paquete || i.precio_venta_redondeado}\t${i.modo_venta === "paquete" ? "Paquete" : "Unidad"}\t$${i.precio_venta_redondeado}`;
      })
      .join("\n");
    navigator.clipboard.writeText(header + rows);
    onShowToast?.({
      type: "success",
      title: "¡Precios Copiados!",
      message:
        "Resumen copiado al portapapeles con Descuentos, Valor de Compra y detalle individual de impuestos.",
    });
  };

  // Exportar a CSV para auditoría o consulta
  const handleExportCSV = () => {
    if (items.length === 0) return;
    const header =
      "Codigo,Descripcion,Cantidad,Presentacion,UnidadesPorPres,CostoUnitario,DescuentoPct,ValorCompraSinImp,ValorCompraConImp,ImpuestosDetalle,TotalImpuestos,CostoUnitFinal,MargenPct,PrecioVentaUnidad,PrecioVentaPaquete,ModoVenta,PrecioCobroPOS\n";
    const rows = items
      .map((i) => {
        const taxStr = (i.impuestos_detallados || [])
          .map((t) => `${t.name}: $${Math.round(t.valor_total || 0)}`)
          .join(" + ");
        return `"${i.codigo_barras || ""}","${(i.descripcion || "").replace(/"/g, '""')}",${i.cantidad},"${i.presentacion}",${i.unidades_por_presentacion},${i.costo_presentacion},${i.descuento || 0},${Math.round(i.valor_compra_sin_impuestos || 0)},${Math.round(i.valor_compra_con_impuestos || 0)},"${taxStr || "Exento"}",${Math.round(i.monto_impuesto_total || 0)},${i.costo_unitario_final || i.costo_unitario_neto},${i.margen_ganancia},${i.precio_venta_unidad || i.precio_venta_redondeado},${i.precio_venta_paquete || i.precio_venta_redondeado},"${i.modo_venta || "unidad"}",${i.precio_venta_redondeado}`;
      })
      .join("\n");
    const blob = new Blob([header + rows], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute(
      "download",
      `calculo_factura_${invoiceNumber || "fruver"}_${invoiceDate}.csv`,
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    onShowToast?.({
      type: "info",
      title: "Archivo descargado",
      message:
        "Se exportó el resumen en CSV con valores de compra e impuestos detallados.",
    });
  };

  // Abrir modal de reconciliación y doble confirmación antes de aplicar al POS
  const handleApplyToInventory = () => {
    if (items.length === 0) {
      onShowToast?.({
        type: "warning",
        title: "Sin productos",
        message:
          "Debe haber al menos un producto en la tabla para aplicar al inventario.",
      });
      return;
    }
    setIsReconciliationModalOpen(true);
  };

  // Ejecución definitiva tras la confirmación y conciliación manual del operador
  const handleExecuteApplyInvoice = async (reconciledItems) => {
    if (!reconciledItems || reconciledItems.length === 0) return;
    setIsApplying(true);
    showLoader({
      title: "Aplicando al Inventario",
      message: "Actualizando stock, costos y precios en el POS...",
      iconType: "loader",
    });
    try {
      const payload = {
        invoice_number: invoiceNumber || null,
        provider_name: supplierName || null,
        supplier_name: supplierName || null,
        invoice_date: invoiceDate || null,
        items: reconciledItems.map((it) => {
          const qty =
            Number(it.unidades_por_paquete || it.unidades_por_presentacion || 1) *
            Number(it.cantidad || 1);
          const finalPrice = Math.round(
            it.precio_venta_final != null
              ? Number(it.precio_venta_final)
              : it.modo_venta === "paquete"
                ? Number(it.precio_venta_paquete || 0)
                : Number(
                    it.precio_venta_redondeado ||
                      it.precio_venta_calculado ||
                      0,
                  ),
          );
          const unitCost = Number(
            it.costo_unitario_neto ||
              it.costo_presentacion ||
              it.costo_unitario ||
              0,
          );

          return {
            codigo: it.codigo_barras || it.codigo || null,
            nombre:
              it.pos_name || it.nombre || it.descripcion || "Producto sin nombre",
            categoria: it.categoria || "FRUVER",
            unidad_code: it.unidad_pos || it.unidad_medida || "UN",
            costo_unitario: unitCost,
            precio_venta_final: finalPrice,
            cantidad_unidades: qty > 0 ? qty : 1.0,
            pos_item_id: it.pos_item_id ? String(it.pos_item_id) : null,
            crear_como_nuevo: Boolean(it.crear_como_nuevo),
            additional_numbers: it.codigo_barras ? [it.codigo_barras] : [],
            cantidad_inventario_convertida:
              it.cantidad_inventario_convertida != null
                ? Number(it.cantidad_inventario_convertida)
                : null,
            costo_inventario_convertido:
              it.costo_inventario_convertido != null
                ? Number(it.costo_inventario_convertido)
                : null,
            factor_conversion:
              it.factor_conversion != null ? Number(it.factor_conversion) : 1.0,
            codigo_dian_unidad: it.codigo_dian_unidad || null,
          };
        }),
      };

      const res = await invoiceService.applyToInventory(payload);

      // Marcar los ítems aplicados en el estado local de la factura para reflejar la actualización selectiva
      const appliedKeys = new Set(
        reconciledItems.map((r) => String(r.id || r.codigo || r.codigo_barras || r.descripcion))
      );
      setItems((prevItems) =>
        prevItems.map((item) => {
          const key = String(item.id || item.codigo || item.codigo_barras || item.descripcion);
          if (appliedKeys.has(key)) {
            const matchedRec = reconciledItems.find(
              (r) => String(r.id || r.codigo || r.codigo_barras || r.descripcion) === key
            );
            return {
              ...item,
              aplicado_en_pos: true,
              pos_item_id: matchedRec?.pos_item_id || item.pos_item_id,
            };
          }
          return item;
        })
      );

      setIsReconciliationModalOpen(false);

      if (res.errors && res.errors.length > 0) {
        onShowToast?.({
          type: res.applied_count > 0 ? "warning" : "error",
          title: res.applied_count > 0 ? "Actualización Parcial en POS" : "Error al aplicar ítems",
          message: `${res.applied_count || 0} productos aplicados con éxito. Detalle: ${res.errors.join("; ")}`,
        });
      } else {
        onShowToast?.({
          type: "success",
          title: "¡Inventario Actualizado!",
          message:
            res.message ||
            `${res.applied_count || 0} productos actualizados y ${res.created_count || 0} creados en POS.`,
        });
      }
    } catch (err) {
      console.error("Error al aplicar factura al inventario:", err);
      onShowToast?.({
        type: "error",
        title: "Error al aplicar al inventario",
        message:
          err.response?.data?.detail ||
          err.message ||
          "No se pudo actualizar el inventario.",
      });
    } finally {
      setIsApplying(false);
      hideLoader();
    }
  };

  // Fetch invoice history
  const loadInvoiceHistory = useCallback(async () => {
    setIsLoadingHistory(true);
    showLoader({
      title: "Cargando Historial",
      message: "Consultando facturas y compras registradas...",
      iconType: "loader",
    });
    try {
      const res = await invoiceService.getHistory(30);
      setHistoryList(res.invoices || []);
    } catch (err) {
      console.error(err);
      onShowToast?.({
        type: "error",
        title: "Error al cargar historial",
        message: "No se pudieron obtener las facturas registradas.",
      });
    } finally {
      setIsLoadingHistory(false);
      hideLoader();
    }
  }, [showLoader, hideLoader, onShowToast]);

  useEffect(() => {
    if (activeSubView === "history") {
      Promise.resolve().then(() => {
        loadInvoiceHistory();
      });
    }
  }, [activeSubView, loadInvoiceHistory]);

  return (
    <div className={`space-y-6 ${isTvMode ? "text-base" : ""}`}>
      {/* Top Header & View Switcher */}
      <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 p-4 sm:p-5 rounded-2xl shadow-sm dark:shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3 sm:gap-4">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center shadow-lg shadow-emerald-600/20 ring-1 ring-emerald-400/30 shrink-0">
            <Receipt className="w-6 h-6 text-white" />
          </div>
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900 dark:text-white">
                Gestor de Facturas & Recepción DIAN
              </h1>
              <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
                IA Multimodal & UBL 2.1
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400">
              Ingesta ultrarrápida por QR DIAN, XML UBL 2.1 o Gemini Vision, con cálculo dinámico de márgenes y sincronización POS.
            </p>
          </div>
        </div>

        {/* View Switcher Tabs */}
        <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-950 p-1.5 rounded-xl border border-slate-200 dark:border-slate-800 self-start sm:self-auto">
          <button
            onClick={() => setActiveSubView("process")}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
              activeSubView === "process"
                ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/30 font-bold"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Procesar Factura</span>
          </button>
          <button
            onClick={() => setActiveSubView("history")}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
              activeSubView === "history"
                ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/30 font-bold"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>Historial Registrado</span>
          </button>
        </div>
      </div>

      {activeSubView === "history" ? (
        /* HISTORIAL DE FACTURAS REGISTRADAS */
        <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm dark:shadow-xl">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <History className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              Facturas Aplicadas Previamente
            </h3>
            <button
              onClick={loadInvoiceHistory}
              disabled={isLoadingHistory}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 rounded-lg transition cursor-pointer"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${isLoadingHistory ? "animate-spin" : ""}`}
              />
              <span>Actualizar</span>
            </button>
          </div>

          {isLoadingHistory ? (
            <div className="py-12 text-center text-slate-400 text-sm">
              Cargando facturas registradas...
            </div>
          ) : historyList.length === 0 ? (
            <div className="py-12 text-center text-slate-500">
              <Receipt className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="font-semibold text-slate-400">
                No hay facturas registradas aún.
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Las facturas procesadas y aplicadas a inventario aparecerán
                aquí.
              </p>
            </div>
          ) : (
            <>
              {/* 1. VISTA DE TABLA PARA ESCRITORIO (DESKTOP) */}
              <div className="hidden lg:block overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 uppercase tracking-wider bg-slate-50 dark:bg-slate-950/40">
                      <th className="p-3">Factura #</th>
                      <th className="p-3">Proveedor</th>
                      <th className="p-3">Fecha</th>
                      <th className="p-3 text-right">Items</th>
                      <th className="p-3 text-right">Total Factura</th>
                      <th className="p-3 text-center">Estado</th>
                      <th className="p-3 text-right">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800/60">
                    {historyList.map((inv) => (
                      <tr
                        key={inv.id}
                        className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition"
                      >
                        <td className="p-3 font-mono font-bold text-emerald-600 dark:text-emerald-400">
                          {inv.invoice_number}
                        </td>
                        <td className="p-3 font-semibold text-slate-900 dark:text-white">
                          {inv.supplier_name}
                        </td>
                        <td className="p-3 text-slate-500 dark:text-slate-400">
                          {inv.invoice_date || "—"}
                        </td>
                        <td className="p-3 text-right text-slate-700 dark:text-slate-300">
                          {inv.items_count || 0}
                        </td>
                        <td className="p-3 text-right font-mono font-semibold text-slate-900 dark:text-white">
                          ${(inv.total_amount || 0).toLocaleString("es-CO")}
                        </td>
                        <td className="p-3 text-center">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800/60">
                            {inv.status || "APLICADO"}
                          </span>
                        </td>
                        <td className="p-3 text-right whitespace-nowrap space-x-1.5">
                          <button
                            onClick={() => setSelectedHistoryInvoice(inv)}
                            className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-slate-700 transition inline-flex items-center gap-1 text-[11px]"
                            title="Ver Detalle"
                          >
                            <Eye className="w-3 h-3" />
                            <span>Ver</span>
                          </button>
                          <button
                            onClick={async (e) => {
                              e.stopPropagation();
                              try {
                                await invoiceService.exportPdf(
                                  inv.id,
                                  inv.invoice_number,
                                );
                                onShowToast?.({
                                  type: "success",
                                  title: "PDF Descargado",
                                  message: `Factura ${inv.invoice_number || inv.id} guardada.`,
                                });
                              } catch {
                                onShowToast?.({
                                  type: "error",
                                  title: "Error",
                                  message: "No se pudo generar el PDF.",
                                });
                              }
                            }}
                            className="px-2 py-1 rounded bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/60 dark:hover:bg-rose-900/60 text-rose-700 dark:text-rose-300 border border-rose-300 dark:border-rose-800/50 transition inline-flex items-center gap-1 text-[11px]"
                            title="Descargar PDF"
                          >
                            <Download className="w-3 h-3 text-rose-500 dark:text-rose-400" />
                            <span>PDF</span>
                          </button>
                          <button
                            onClick={async (e) => {
                              e.stopPropagation();
                              try {
                                await invoiceService.exportExcel(
                                  inv.id,
                                  inv.invoice_number,
                                );
                                onShowToast?.({
                                  type: "success",
                                  title: "Excel Descargado",
                                  message: `Factura ${inv.invoice_number || inv.id} guardada.`,
                                });
                              } catch {
                                onShowToast?.({
                                  type: "error",
                                  title: "Error",
                                  message: "No se pudo generar el Excel.",
                                });
                              }
                            }}
                            className="px-2 py-1 rounded bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/60 dark:hover:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800/50 transition inline-flex items-center gap-1 text-[11px]"
                            title="Descargar Excel"
                          >
                            <FileText className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                            <span>Excel</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* 2. VISTA DE TARJETAS FLUIDAS PARA MÓVILES Y TABLETS */}
              <div className="block lg:hidden divide-y divide-slate-200 dark:divide-slate-800">
                {historyList.map((inv) => (
                  <div
                    key={inv.id}
                    className="p-4 space-y-3 hover:bg-slate-50 dark:hover:bg-slate-800/20 transition"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400 text-sm">
                          #{inv.invoice_number || inv.id}
                        </span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800/60">
                          {inv.status || "APLICADO"}
                        </span>
                      </div>
                      <span className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                        {inv.invoice_date || "—"}
                      </span>
                    </div>

                    <div>
                      <h4 className="font-bold text-slate-900 dark:text-white text-sm sm:text-base leading-snug">
                        {inv.supplier_name}
                      </h4>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        {inv.items_count || 0}{" "}
                        {inv.items_count === 1 ? "artículo" : "artículos"}{" "}
                        registrados
                      </p>
                    </div>

                    {/* Banner Monto Total y Botones de Acción */}
                    <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                      <div className="flex flex-col">
                        <span className="text-[9px] uppercase font-semibold text-slate-500 dark:text-slate-400">
                          Total Factura
                        </span>
                        <span className="text-lg font-black font-mono text-emerald-600 dark:text-emerald-400">
                          ${(inv.total_amount || 0).toLocaleString("es-CO")}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 self-end sm:self-auto">
                        <button
                          onClick={() => setSelectedHistoryInvoice(inv)}
                          className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold inline-flex items-center gap-1 border border-slate-300 dark:border-slate-700 transition"
                          title="Ver Detalle"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Ver</span>
                        </button>
                        <button
                          onClick={async (e) => {
                            e.stopPropagation();
                            try {
                              await invoiceService.exportPdf(
                                inv.id,
                                inv.invoice_number,
                              );
                              onShowToast?.({
                                type: "success",
                                title: "PDF Descargado",
                                message: `Factura ${inv.invoice_number || inv.id} guardada.`,
                              });
                            } catch {
                              onShowToast?.({
                                type: "error",
                                title: "Error",
                                message: "No se pudo generar el PDF.",
                              });
                            }
                          }}
                          className="px-2.5 py-1.5 rounded-lg bg-rose-950/60 hover:bg-rose-900/60 text-rose-300 border border-rose-800/50 text-xs font-semibold inline-flex items-center gap-1 transition"
                          title="Descargar PDF"
                        >
                          <Download className="w-3.5 h-3.5 text-rose-400" />
                          <span>PDF</span>
                        </button>
                        <button
                          onClick={async (e) => {
                            e.stopPropagation();
                            try {
                              await invoiceService.exportExcel(
                                inv.id,
                                inv.invoice_number,
                              );
                              onShowToast?.({
                                type: "success",
                                title: "Excel Descargado",
                                message: `Factura ${inv.invoice_number || inv.id} guardada.`,
                              });
                            } catch {
                              onShowToast?.({
                                type: "error",
                                title: "Error",
                                message: "No se pudo generar el Excel.",
                              });
                            }
                          }}
                          className="px-2.5 py-1.5 rounded-lg bg-emerald-950/60 hover:bg-emerald-900/60 text-emerald-300 border border-emerald-800/50 text-xs font-semibold inline-flex items-center gap-1 transition"
                          title="Descargar Excel"
                        >
                          <FileText className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Excel</span>
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Modal detalle factura histórica */}
          {selectedHistoryInvoice && (
            <div
              className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in"
              onClick={() => setSelectedHistoryInvoice(null)}
            >
              <div
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden text-slate-800 dark:text-slate-100"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0 bg-slate-50 dark:bg-slate-950/80">
                  <h4 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <Receipt className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    Detalle Factura: {selectedHistoryInvoice.invoice_number}
                  </h4>
                  <button
                    onClick={() => setSelectedHistoryInvoice(null)}
                    className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-white transition cursor-pointer"
                    title="Cerrar modal (Esc)"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <div className="p-5 overflow-y-auto custom-scrollbar flex-1 space-y-4 text-xs">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 dark:bg-slate-950 p-3 rounded-xl border border-slate-200 dark:border-slate-800">
                    <div>
                      <span className="text-slate-500 dark:text-slate-400 block">Proveedor:</span>
                      <span className="font-bold text-slate-900 dark:text-white">
                        {selectedHistoryInvoice.supplier_name}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 dark:text-slate-400 block">Fecha:</span>
                      <span className="font-semibold text-slate-700 dark:text-slate-300">
                        {selectedHistoryInvoice.invoice_date}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 dark:text-slate-400 block">Subtotal:</span>
                      <span className="font-mono text-slate-700 dark:text-slate-300">
                        $
                        {(
                          selectedHistoryInvoice.subtotal_amount || 0
                        ).toLocaleString("es-CO")}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 dark:text-slate-400 block">Total:</span>
                      <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                        $
                        {(
                          selectedHistoryInvoice.total_amount || 0
                        ).toLocaleString("es-CO")}
                      </span>
                    </div>
                  </div>
                  <div>
                    <h5 className="font-semibold text-slate-700 dark:text-slate-300 mb-2">
                      Artículos Registrados:
                    </h5>
                    <div className="space-y-2">
                      {(selectedHistoryInvoice.items || []).map((itm, i) => (
                        <div
                          key={i}
                          className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800/80"
                        >
                          <div>
                            <span className="font-bold text-slate-900 dark:text-white block">
                              {itm.descripcion}
                            </span>
                            <span className="text-[11px] text-slate-500 dark:text-slate-400">
                              Cant: {itm.cantidad} ({itm.presentacion}) &bull;
                              Costo Unit: $
                              {(itm.costo_unitario_neto || 0).toLocaleString(
                                "es-CO",
                              )}
                            </span>
                          </div>
                          <div className="text-right font-mono">
                            <span className="text-emerald-600 dark:text-emerald-400 font-bold block">
                              Venta: $
                              {(
                                itm.precio_venta_redondeado || 0
                              ).toLocaleString("es-CO")}
                            </span>
                            <span className="text-[10px] text-slate-500 dark:text-slate-400">
                              Margen: {itm.margen_ganancia}%
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                {/* Footer del Modal */}
                <div className="p-3.5 sm:p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/80 flex items-center justify-between gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setSelectedHistoryInvoice(null)}
                    className="px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 hover:text-slate-900 dark:text-slate-200 border border-slate-300 dark:border-slate-700 transition text-xs font-semibold cursor-pointer"
                  >
                    Cerrar Detalle
                  </button>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await invoiceService.exportPdf(
                            selectedHistoryInvoice.id,
                            selectedHistoryInvoice.invoice_number,
                          );
                          onShowToast?.({
                            type: "success",
                            title: "PDF Generado",
                            message: "Descarga de factura iniciada.",
                          });
                        } catch {
                          onShowToast?.({
                            type: "error",
                            title: "Error",
                            message: "No se pudo generar el PDF.",
                          });
                        }
                      }}
                      className="px-3 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 dark:bg-rose-950/70 dark:hover:bg-rose-900/70 dark:text-rose-300 dark:border-rose-800/60 transition flex items-center gap-1.5 text-xs font-semibold cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
                      <span>Descargar PDF</span>
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await invoiceService.exportExcel(
                            selectedHistoryInvoice.id,
                            selectedHistoryInvoice.invoice_number,
                          );
                          onShowToast?.({
                            type: "success",
                            title: "Excel Generado",
                            message: "Descarga de factura iniciada.",
                          });
                        } catch {
                          onShowToast?.({
                            type: "error",
                            title: "Error",
                            message: "No se pudo generar el Excel.",
                          });
                        }
                      }}
                      className="px-3 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/70 dark:hover:bg-emerald-900/70 dark:text-emerald-300 dark:border-emerald-800/60 transition flex items-center gap-1.5 text-xs font-semibold cursor-pointer"
                    >
                      <FileText className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Descargar Excel</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* VISTA PRINCIPAL DE PROCESAMIENTO OCR */
        <>
          {/* GUÍA VISUAL INTUITIVA EN 3 PASOS PARA EL OPERARIO */}
          <div className="bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 rounded-2xl p-3.5 sm:p-4 shadow-sm dark:shadow-xl mb-2">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-300">
                <span className="text-emerald-600 dark:text-emerald-400 uppercase tracking-wider text-[11px] font-black">FLUJO GUIADO:</span>
                <span className="text-slate-900 dark:text-slate-200">Recepción y Actualización de Precios</span>
              </div>
              <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                {items.length === 0 ? (
                  <span className="px-2.5 py-0.5 rounded-full bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-500/30 font-semibold flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                    Paso 1: Esperando Factura
                  </span>
                ) : (
                  <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 font-semibold flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    Paso 2: {items.length} productos listos para revisión
                  </span>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
              {/* Paso 1 */}
              <div
                className={`p-3 rounded-xl border flex items-center gap-3 transition ${
                  items.length === 0
                    ? "bg-emerald-50 dark:bg-emerald-500/10 border-emerald-300 dark:border-emerald-500/50 text-emerald-800 dark:text-emerald-300 shadow-sm"
                    : "bg-slate-50 dark:bg-slate-950/50 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400"
                }`}
              >
                <div
                  className={`w-8 h-8 rounded-lg flex items-center justify-center font-black text-xs shrink-0 ${
                    items.length > 0
                      ? "bg-emerald-500 text-slate-950"
                      : "bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border border-emerald-400/40"
                  }`}
                >
                  {items.length > 0 ? "✓" : "1"}
                </div>
                <div className="min-w-0">
                  <div className="font-bold text-slate-900 dark:text-white text-xs truncate">1. Ingesta de Factura</div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">Escanear QR, XML o Foto</div>
                </div>
              </div>

              {/* Paso 2 */}
              <div
                className={`p-3 rounded-xl border flex items-center gap-3 transition ${
                  items.length > 0
                    ? "bg-emerald-50 dark:bg-emerald-500/10 border-emerald-300 dark:border-emerald-500/50 text-emerald-800 dark:text-emerald-300 shadow-sm"
                    : "bg-slate-50 dark:bg-slate-950/30 border-slate-200 dark:border-slate-800/60 text-slate-500"
                }`}
              >
                <div
                  className={`w-8 h-8 rounded-lg flex items-center justify-center font-black text-xs shrink-0 ${
                    items.length > 0
                      ? "bg-emerald-500 text-slate-950"
                      : "bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-500"
                  }`}
                >
                  2
                </div>
                <div className="min-w-0">
                  <div className="font-bold text-slate-900 dark:text-white text-xs truncate">2. Revisión de Costos</div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">Margen, IVA y Redondeo</div>
                </div>
              </div>

              {/* Paso 3 */}
              <div className="p-3 rounded-xl border bg-slate-50 dark:bg-slate-950/30 border-slate-200 dark:border-slate-800/60 text-slate-500 flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-500 flex items-center justify-center font-black text-xs shrink-0">
                  3
                </div>
                <div className="min-w-0">
                  <div className="font-bold text-slate-800 dark:text-slate-300 text-xs truncate">3. Sincronización POS</div>
                  <div className="text-[11px] text-slate-500 truncate">Actualizar Cajas e Inventario</div>
                </div>
              </div>
            </div>
          </div>

          {/* 1. SECCIÓN DE CAPTURA Y SUBIDA */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Input / Drag & Drop Card */}
            <div className="lg:col-span-1 bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm dark:shadow-xl flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <UploadCloud className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                    Cargar Factura o Foto
                  </h3>
                  {(selectedFile || items.length > 0 || supplierName || invoiceNumber) && (
                    <button
                      type="button"
                      onClick={handleResetInvoice}
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-rose-950/60 hover:bg-rose-900/60 text-rose-300 border border-rose-800/60 text-xs font-semibold transition cursor-pointer shadow-sm"
                      title="Limpiar archivo actual y datos para cargar otra factura"
                    >
                      <RotateCcw className="w-3.5 h-3.5 text-rose-400" />
                      <span>Limpiar / Nueva</span>
                    </button>
                  )}
                </div>
                <p className="text-xs text-slate-400 mb-4">
                  Sube una foto clara de la factura de compra o tómala
                  directamente con la cámara de tu teléfono o tablet.
                </p>
                {/* Inputs de archivo fuera del contenedor para garantizar activación nativa directa */}
                <input
                  ref={fileInputRef}
                  id="invoice-file-input"
                  type="file"
                  accept="image/*,application/pdf,.xml,text/xml,application/xml"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files?.[0])
                      handleFileSelect(e.target.files[0]);
                    e.target.value = "";
                  }}
                />
                <input
                  ref={cameraInputRef}
                  id="invoice-camera-input"
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files?.[0])
                      handleFileSelect(e.target.files[0]);
                    e.target.value = "";
                  }}
                />

                {/* Drop Zone nativa como label */}
                <label
                  htmlFor="invoice-file-input"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={handleDrop}
                  className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition flex flex-col items-center justify-center gap-3 ${
                    selectedFile
                      ? "border-emerald-500/60 bg-emerald-50 dark:bg-emerald-950/20"
                      : "border-slate-300 dark:border-slate-700 hover:border-emerald-500/50 bg-slate-50 dark:bg-slate-950/50 hover:bg-slate-100 dark:hover:bg-slate-950"
                  }`}
                >

                  {isXmlFile && selectedFile ? (
                    <div className="flex flex-col items-center justify-center p-3 gap-2">
                      <div className="w-12 h-12 rounded-xl bg-emerald-100 dark:bg-emerald-950/80 border border-emerald-300 dark:border-emerald-800/80 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shadow-inner">
                        <FileCode className="w-7 h-7" />
                      </div>
                      <span className="font-bold text-slate-900 dark:text-white text-xs text-center max-w-[200px] truncate block">
                        {selectedFile.name}
                      </span>
                      <span className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800/40">
                        Factura Electrónica DIAN XML
                      </span>
                    </div>
                  ) : imagePreview ? (
                    <div className="relative group flex items-center justify-center overflow-hidden p-2">
                      <img
                        src={imagePreview}
                        alt="Vista previa factura"
                        style={{ transform: `rotate(${imageRotation}deg)` }}
                        className="max-h-44 rounded-lg object-contain border border-slate-300 dark:border-slate-700 shadow-md transition-transform duration-200"
                      />
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition rounded-lg flex items-center justify-center gap-2">
                        <span className="text-xs text-white font-semibold">
                          Cambiar archivo
                        </span>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 dark:text-slate-400">
                        <FileText className="w-6 h-6" />
                      </div>
                      <div className="space-y-1">
                        <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 block">
                          Haz clic o arrastra tu factura aquí
                        </span>
                        <span className="text-[10px] text-slate-500 block">
                          Soporta JPG, PNG, WebP, PDF y XML (DIAN UBL 2.1)
                        </span>
                      </div>
                    </>
                  )}
                </label>

                {/* Botones de Escaneo QR DIAN, Cámara y Rotación */}
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setIsDianModalOpen(true);
                    }}
                    className="flex-1 min-w-[150px] flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-md shadow-blue-900/30 text-xs font-bold transition cursor-pointer"
                    title="Escanear Código QR DIAN o Ingresar/Pegar Código CUFE Manual"
                  >
                    <QrCode className="w-4 h-4 text-white" />
                    <span>Escanear QR / CUFE</span>
                  </button>
                  <label
                    htmlFor="invoice-camera-input"
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        cameraInputRef.current?.click();
                      }
                    }}
                    className="flex-1 min-w-[130px] flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700 text-xs font-semibold transition cursor-pointer"
                  >
                    <Camera className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    <span>Tomar Foto</span>
                  </label>
                  {imagePreview && (
                    <button
                      type="button"
                      onClick={() =>
                        setImageRotation((prev) => (prev + 90) % 360)
                      }
                      className="py-2.5 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white border border-slate-300 dark:border-slate-700 text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer"
                      title="Rotar imagen 90°"
                    >
                      <RotateCw className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                      <span>Rotar 90°</span>
                    </button>
                  )}
                  {selectedFile && (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedFile(null);
                        setImagePreview(null);
                        setImageRotation(0);
                        setIsXmlFile(false);
                        setDetectedQrInfo(null);
                      }}
                      className="p-2.5 rounded-xl bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/50 dark:hover:bg-rose-900/50 text-rose-600 dark:text-rose-300 border border-rose-200 dark:border-rose-800/60 transition cursor-pointer"
                      title="Quitar archivo"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {/* Badge Informativo si se detecta QR DIAN en la factura seleccionada */}
                {detectedQrInfo && (
                  <div className="mt-3 p-3 rounded-xl bg-blue-50 dark:bg-blue-950/70 border border-blue-200 dark:border-blue-500/50 flex items-center justify-between gap-3 text-xs text-blue-900 dark:text-blue-200 shadow-sm">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-600/30 border border-blue-300 dark:border-blue-400/50 flex items-center justify-center shrink-0">
                        <QrCode className="w-4 h-4 text-blue-600 dark:text-blue-300" />
                      </div>
                      <div className="truncate">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-slate-900 dark:text-white text-xs">
                            Factura Electrónica DIAN
                          </span>
                          <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-400/30">
                            QR Válido
                          </span>
                        </div>
                        <span className="text-[10px] text-blue-700 dark:text-blue-300 font-mono truncate block">
                          CUFE: {detectedQrInfo.cufe.slice(0, 24)}...
                        </span>
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-blue-500/20 text-blue-800 dark:text-blue-200 border border-blue-400/40">
                        <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400" /> Auto-Descarga Activa
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Selector de Motor de Visión e IA (Organizado con despliegue) */}
              <details className="mt-3 group border border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50 dark:bg-slate-950/60 p-2.5 transition">
                <summary className="cursor-pointer list-none flex items-center justify-between text-[11px] font-semibold text-slate-700 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white select-none">
                  <span className="flex items-center gap-1.5">
                    <Sliders className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                    <span>Motor Inteligente:</span>
                  </span>
                  <div className="flex items-center gap-1.5">
                    {ocrProvider === "gemini" && (
                      <span className="text-[10px] text-amber-800 dark:text-amber-300 font-semibold px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800/50">
                        ☁️ Gemini IA (Nube 2s)
                      </span>
                    )}
                    {ocrProvider === "xml" && (
                      <span className="text-[10px] text-emerald-800 dark:text-emerald-300 font-semibold px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800/50">
                        ⚡ DIAN XML UBL 2.1 (0.02s)
                      </span>
                    )}
                    {ocrProvider === "qr_dian" && (
                      <span className="text-[10px] text-blue-800 dark:text-blue-300 font-semibold px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800/50">
                        📱 QR DIAN Oficial
                      </span>
                    )}
                    {ocrProvider === "pdf" && (
                      <span className="text-[10px] text-purple-800 dark:text-purple-300 font-semibold px-2 py-0.5 rounded-full bg-purple-50 dark:bg-purple-950/60 border border-purple-200 dark:border-purple-800/50">
                        📄 PDF Vectorial
                      </span>
                    )}
                    <span className="text-[10px] text-slate-500 group-open:rotate-180 transition-transform">▼</span>
                  </div>
                </summary>
                <div className="mt-2.5 pt-2 border-t border-slate-200 dark:border-slate-800/80 space-y-2">
                  <select
                    value={ocrProvider}
                    onChange={(e) => setOcrProvider(e.target.value)}
                    disabled={isProcessing}
                    className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700/80 rounded-lg px-2.5 py-2 text-xs text-slate-900 dark:text-slate-200 focus:outline-none focus:border-emerald-500 transition cursor-pointer"
                  >
                    <option value="gemini">
                      ☁️ Google Gemini Vision AI (Recomendado Nube - Ultrarrápido, 0% CPU, Máxima Precisión)
                    </option>
                    <option value="xml">
                      ⚡ Factura Electrónica XML UBL 2.1 (Instantáneo 0.02s DIAN Oficial)
                    </option>
                    <option value="qr_dian">
                      📱 Código QR DIAN / Consulta Oficial VPFE (Facturas con QR)
                    </option>
                    <option value="pdf">
                      📄 PDF DIAN Digital (Desencriptación automática con NIT)
                    </option>
                  </select>
                  <p className="text-[10px] text-slate-400 leading-tight">
                    {ocrProvider === "gemini" &&
                      "Visión multimodal con IA en la nube: comprensión semántica instantánea (1.5 - 2.5 seg), 0% consumo de CPU local y máxima tolerancia a fotos dobladas, inclinadas o con poca luz."}
                    {ocrProvider === "xml" &&
                      "Lectura directa de archivos XML UBL 2.1 oficiales de la DIAN. Precisión matemática absoluta (100%) en precios, cantidades, impuestos y proveedores en 0.02 segundos."}
                    {ocrProvider === "qr_dian" &&
                      "Lectura de código QR oficial DIAN (resolución 000042) y consulta desatendida en el Catálogo VPFE Oficial con NIT receptor."}
                    {ocrProvider === "pdf" &&
                      "Extracción vectorial nativa de PDFs electrónicos oficiales de la DIAN, desencriptando automáticamente con el NIT del receptor dinámico."}
                  </p>
                </div>
              </details>

              {/* Botón de Ejecución OCR */}
              <div className="mt-4">
                <button
                  type="button"
                  onClick={handleProcessImage}
                  disabled={!selectedFile || isProcessing}
                  className={`w-full py-3.5 px-4 rounded-xl font-bold text-sm flex items-center justify-center gap-2 shadow-lg transition ${
                    isProcessing
                      ? "bg-slate-800 text-slate-400 cursor-not-allowed"
                      : !selectedFile
                        ? "bg-slate-800 text-slate-400 cursor-not-allowed border border-slate-700/50"
                        : "bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-emerald-600/30 cursor-pointer animate-pulse"
                  }`}
                >
                  {isProcessing ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin text-emerald-400" />
                      <span>
                        {processingStatusText || "Extrayendo productos con IA..."}
                      </span>
                    </>
                  ) : !selectedFile ? (
                    <>
                      <UploadCloud className="w-4 h-4 text-slate-400" />
                      <span>Selecciona una factura o escanea QR</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 text-amber-300" />
                      <span>Extraer Productos & Precios ({ocrProvider === "xml" ? "XML DIAN" : "IA Gemini"})</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Configuración Global y Datos de Cabecera */}
            <div className="lg:col-span-2 bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white mb-2 flex items-center gap-2">
                  <Sliders className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                  Parámetros Globales & Metadatos
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
                  Define cómo interpretar los impuestos y el margen comercial
                  para todos los artículos leídos.
                </p>

                {/* Selector de Método de Margen: Sobre Costo (Markup - Por Defecto) vs Sobre Venta (Utilidad Bruta) */}
                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-900 dark:text-white block">
                        Método de Cálculo del Precio de Venta
                      </span>
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded font-bold border ${
                          marginMethod === "cost"
                            ? "bg-emerald-500/15 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border-emerald-500/30"
                            : "bg-teal-500/15 dark:bg-teal-500/20 text-teal-700 dark:text-teal-300 border-teal-500/30"
                        }`}
                      >
                        {marginMethod === "cost"
                          ? "POR DEFECTO: Sobre Costo (Markup)"
                          : "ALTERNADO: Sobre Venta (Utilidad Bruta)"}
                      </span>
                    </div>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 block mt-1">
                      {marginMethod === "cost" ? (
                        <>
                          <strong className="text-emerald-600 dark:text-emerald-400">
                            Markup sobre Costo:
                          </strong>{" "}
                          Precio = Costo Final × (1 + Margen %) &nbsp;
                          <span className="text-slate-400 dark:text-slate-500">
                            (Ej: $1.916 + 30% = $2.490 →{" "}
                            <strong className="text-slate-900 dark:text-white">$2.500</strong>)
                          </span>
                        </>
                      ) : (
                        <>
                          <strong className="text-teal-600 dark:text-teal-400">
                            Utilidad sobre Venta:
                          </strong>{" "}
                          Precio = Costo Final / (1 - Margen %) &nbsp;
                          <span className="text-slate-400 dark:text-slate-500">
                            (Ej: $1.916 / 0,70 = $2.737 →{" "}
                            <strong className="text-slate-900 dark:text-white">$2.700</strong>)
                          </span>
                        </>
                      )}
                    </span>
                  </div>

                  <div className="flex items-center p-1 bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-700/80 rounded-xl shrink-0">
                    <button
                      type="button"
                      onClick={() => handleToggleMarginMethod("cost")}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                        marginMethod === "cost"
                          ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/30"
                          : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                      }`}
                      title="Calcular precio como Costo Final × (1 + Margen %)"
                    >
                      <span>Sobre Costo (Markup)</span>
                      {marginMethod === "cost" && (
                        <Check className="w-3.5 h-3.5" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggleMarginMethod("sale")}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                        marginMethod === "sale"
                          ? "bg-teal-600 text-white shadow-md shadow-teal-600/30"
                          : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                      }`}
                      title="Calcular precio como Costo Final / (1 - Margen %)"
                    >
                      <span>Sobre Venta (Utilidad Bruta)</span>
                      {marginMethod === "sale" && (
                        <Check className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Selector de Venta Predeterminada para Multipacks: Por Unidad (Menudeo) vs Por Paquete (Empaque) */}
                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <Package className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                      <span className="text-xs font-bold text-slate-900 dark:text-white block">
                        Venta Predeterminada de Presentaciones & Multipacks
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded font-bold border bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700">
                        {defaultSaleMode === "unidad"
                          ? "Menudeo (Por Unidad Suelta)"
                          : "Empaque Cerrado (Por Paquete)"}
                      </span>
                    </div>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 block mt-1">
                      {defaultSaleMode === "unidad" ? (
                        <>
                          <strong className="text-emerald-600 dark:text-emerald-400">
                            Por Unidad:
                          </strong>{" "}
                          Empaques de varias piezas se desglosan para cobrar al
                          cliente por pieza suelta.
                          <span className="text-slate-400 dark:text-slate-500">
                            {" "}
                            (Ej: Gansito x 10 → cobra $2.500 / und).
                          </span>
                        </>
                      ) : (
                        <>
                          <strong className="text-teal-600 dark:text-teal-400">
                            Por Paquete:
                          </strong>{" "}
                          Se cobra el paquete o caja completa sin desempacar.
                          <span className="text-slate-400 dark:text-slate-500">
                            {" "}
                            (Ej: Gansito x 10 → cobra $24.900 / caja).
                          </span>
                        </>
                      )}
                    </span>
                  </div>

                  <div className="flex items-center p-1 bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-700/80 rounded-xl shrink-0">
                    <button
                      type="button"
                      onClick={() => handleToggleDefaultSaleMode("unidad")}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                        defaultSaleMode === "unidad"
                          ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/30"
                          : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                      }`}
                      title="Vender por pieza o unidad individual"
                    >
                      <span>Por Unidad (Suelto)</span>
                      {defaultSaleMode === "unidad" && (
                        <Check className="w-3.5 h-3.5" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggleDefaultSaleMode("paquete")}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                        defaultSaleMode === "paquete"
                          ? "bg-teal-600 text-white shadow-md shadow-teal-600/30"
                          : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                      }`}
                      title="Vender el paquete o caja completa"
                    >
                      <span>Por Paquete (Caja)</span>
                      {defaultSaleMode === "paquete" && (
                        <Check className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Switch IVA Incluido vs Excluido y Margen Global */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">
                  <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex items-center justify-between">
                    <div>
                      <span className="text-xs font-bold text-slate-900 dark:text-white block">
                        Criterio de Impuestos
                      </span>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400 block">
                        {isVatIncluded
                          ? "Precios de factura traen IVA incluido"
                          : "Precios de factura son antes de IVA"}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleToggleVatIncluded(!isVatIncluded)}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        isVatIncluded ? "bg-emerald-600" : "bg-slate-300 dark:bg-slate-700"
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                          isVatIncluded ? "translate-x-5" : "translate-x-0"
                        }`}
                      />
                    </button>
                  </div>

                  {/* Margen Global */}
                  <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 overflow-hidden">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-bold text-slate-900 dark:text-white block">
                          Margen Ganancia Global
                        </span>
                        {items.filter((it) => it.is_manual_margin).length > 0 && (
                          <span
                            className="text-[9.5px] px-1.5 py-0.5 rounded font-bold bg-amber-500/15 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 border border-amber-500/40"
                            title="Hay productos con margen manual personalizado"
                          >
                            {items.filter((it) => it.is_manual_margin).length} manuales
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                        {[20, 25, 30, 35, 40].map((m) => (
                          <button
                            key={m}
                            type="button"
                            onClick={() => handleRequestGlobalMarginChange(m)}
                            className={`px-2 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                              globalMargin === m
                                ? "bg-emerald-600 text-white shadow-xs ring-1 ring-emerald-400/50"
                                : "bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-300 dark:hover:bg-slate-700"
                            }`}
                          >
                            {m}%
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-2.5 py-1.5 shrink-0 self-start sm:self-center shadow-xs">
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold uppercase">Manual:</span>
                      <input
                        type="number"
                        min="1"
                        max="90"
                        value={globalMargin}
                        onChange={(e) =>
                          handleRequestGlobalMarginChange(
                            parseFloat(e.target.value) || 0,
                          )
                        }
                        className="w-10 bg-transparent text-right text-xs font-bold text-emerald-600 dark:text-emerald-400 focus:outline-none"
                      />
                      <span className="text-xs text-slate-500 dark:text-slate-400 font-bold">
                        %
                      </span>
                    </div>
                  </div>
                </div>

                {/* Metadatos de Factura Extraídos o Editables */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider block mb-1">
                      Proveedor
                    </label>
                    <div className="relative">
                      <Building2 className="w-3.5 h-3.5 absolute left-3 top-3 text-slate-400 dark:text-slate-500" />
                      <input
                        type="text"
                        value={supplierName}
                        onChange={(e) => setSupplierName(e.target.value)}
                        placeholder="Ej. BIMBO DE COLOMBIA S.A."
                        className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 text-xs font-semibold text-slate-900 dark:text-white focus:border-emerald-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider block mb-1">
                      Factura #
                    </label>
                    <div className="relative">
                      <Hash className="w-3.5 h-3.5 absolute left-3 top-3 text-slate-400 dark:text-slate-500" />
                      <input
                        type="text"
                        value={invoiceNumber}
                        onChange={(e) => setInvoiceNumber(e.target.value)}
                        placeholder="Ej. FE-84920"
                        className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 text-xs font-mono font-bold text-slate-900 dark:text-white focus:border-emerald-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider block mb-1">
                      Fecha de Factura
                    </label>
                    <div className="relative">
                      <Calendar className="w-3.5 h-3.5 absolute left-3 top-3 text-slate-400 dark:text-slate-500" />
                      <input
                        type="date"
                        value={invoiceDate}
                        onChange={(e) => setInvoiceDate(e.target.value)}
                        className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 text-xs font-semibold text-slate-900 dark:text-white focus:border-emerald-500 focus:outline-none"
                      />
                    </div>
                  </div>
                </div>

                {/* Badge de Factura Electrónica Oficial DIAN con CUFE */}
                {invoiceCufe && (
                  <div className="mt-3 p-2.5 rounded-xl bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-500/40 flex items-center justify-between text-xs text-blue-900 dark:text-blue-200 shadow-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <QrCode className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                      <div className="truncate">
                        <span className="font-bold text-[10px] text-blue-700 dark:text-blue-300 uppercase tracking-wider block">CUFE Factura DIAN:</span>
                        <span className="font-mono text-[11px] text-slate-900 dark:text-white select-all truncate block">
                          {invoiceCufe}
                        </span>
                      </div>
                    </div>
                    {invoiceDianUrl && (
                      <a
                        href={invoiceDianUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-600/20 hover:bg-blue-600/30 text-[11px] font-bold text-blue-800 dark:text-blue-200 border border-blue-400/40 transition ml-2"
                        title="Abrir consulta en el portal oficial de la DIAN"
                      >
                        <span>Ver en DIAN</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                )}
              </div>

              {/* Informative Rule Badge */}
              <div className="mt-4 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/40 flex items-start gap-2.5">
                <HelpCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                <div className="text-[11px] text-emerald-950 dark:text-slate-300 leading-relaxed">
                  <span className="font-bold text-emerald-800 dark:text-emerald-300">
                    Regla de Negocio Fruver:
                  </span>{" "}
                  Los costos se calculan sobre la unidad de inventario
                  dividiendo entre las piezas de la presentación (caja, display,
                  etc.). El precio de venta resultante se redondea
                  automáticamente a la centena más cercana (
                  <span className="text-emerald-700 dark:text-emerald-400 font-mono font-bold">
                    $250 → $300
                  </span>
                  ,{" "}
                  <span className="text-emerald-700 dark:text-emerald-400 font-mono font-bold">
                    $249 → $200
                  </span>
                  ).
                </div>
              </div>
            </div>
          </div>

          {/* 2. TABLA INTERACTIVA DE ARTÍCULOS REVISADOS */}
          <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Boxes className="w-5 h-5 text-emerald-500 dark:text-emerald-400" />
                  Artículos Leídos y Configuración de Precios ({items.length})
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Verifica códigos de barras, unidades por presentación,
                  impuestos y el precio de venta final.
                </p>
              </div>

              <div className="flex items-center gap-2">
                {(items.length > 0 || supplierName || invoiceNumber) && (
                  <button
                    type="button"
                    onClick={handleResetInvoice}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/50 dark:hover:bg-rose-900/50 text-rose-700 dark:text-rose-300 border border-rose-300 dark:border-rose-800/50 text-xs font-semibold transition cursor-pointer"
                    title="Limpiar todos los productos y reiniciar para una nueva factura"
                  >
                    <RotateCcw className="w-3.5 h-3.5 text-rose-500 dark:text-rose-400" />
                    <span>Limpiar Factura</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleAddManualItem}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 text-xs font-semibold transition cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span>Agregar Fila Manual</span>
                </button>
                <button
                  type="button"
                  onClick={handleApplyGlobalMargin}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/60 dark:hover:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800/60 text-xs font-semibold transition cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Recalcular Todos</span>
                </button>
              </div>
            </div>

            {items.length === 0 ? (
              <div className="py-16 text-center text-slate-400 dark:text-slate-500 border border-dashed border-slate-300 dark:border-slate-800 rounded-xl">
                <Receipt className="w-12 h-12 mx-auto mb-2 opacity-30 text-slate-400 dark:text-slate-500" />
                <p className="font-semibold text-slate-600 dark:text-slate-400">
                  No hay artículos para revisar.
                </p>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                  Sube una foto de factura o agrega productos manualmente con el
                  botón superior.
                </p>
              </div>
            ) : (
              <>
                {/* 1. VISTA DE TABLA PARA ESCRITORIO (DESKTOP) */}
                <div className="hidden lg:block overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800/80 shadow-inner scrollbar-thin scrollbar-thumb-slate-300 dark:scrollbar-thumb-slate-700 bg-white dark:bg-slate-900/60">
                  <table className="min-w-[2040px] w-full text-left text-xs border-collapse">
                    <thead className="sticky top-0 bg-slate-100 dark:bg-slate-950 z-20 shadow-xs border-b border-slate-200 dark:border-slate-800">
                      <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-400 uppercase tracking-wider bg-slate-100 dark:bg-slate-950 text-[11px]">
                        <th className="p-2.5 w-10 text-center sticky left-0 z-30 bg-slate-100 dark:bg-slate-950 text-slate-600 dark:text-slate-400">
                          #
                        </th>
                        <th className="p-2.5 min-w-[240px] sticky left-10 z-30 bg-slate-100 dark:bg-slate-950 shadow-[2px_0_5px_rgba(0,0,0,0.06)] dark:shadow-[2px_0_5px_rgba(0,0,0,0.3)] text-slate-700 dark:text-slate-300">
                          Factura: Producto & Código
                        </th>
                        <th className="p-2.5 min-w-[240px]">
                          Vinculación Catálogo POS
                        </th>
                        <th className="p-2.5 min-w-[260px] text-center">
                          Cant. & Presentación
                        </th>
                        <th className="p-2.5 min-w-[160px] text-right">
                          Costo Unitario
                        </th>
                        <th className="p-2.5 min-w-[270px] text-center">
                          <div className="flex flex-col items-center gap-0.5">
                            <span>Descuentos / Promos</span>
                            <span className="text-[9px] font-normal lowercase tracking-normal text-slate-500 dark:text-slate-400 block font-sans">
                              (% y valor en $)
                            </span>
                          </div>
                        </th>
                        <th className="p-2.5 min-w-[230px] text-center">
                          Impuestos
                          <span className="text-[9px] font-normal lowercase tracking-normal text-slate-500 dark:text-slate-400 block font-sans">
                            (IVA / ICO y valor en $)
                          </span>
                        </th>
                        <th className="p-2.5 min-w-[230px] text-right">
                          <div className="flex flex-col items-end gap-0.5">
                            <span>Valor Total Compra</span>
                            <span className="text-[9px] font-normal lowercase tracking-normal text-slate-500 dark:text-slate-400 block font-sans">
                              (Desgloses +/− Descuento)
                            </span>
                          </div>
                        </th>
                        <th className="p-2.5 min-w-[175px] text-right">
                          <span>Margen & Precio POS</span>
                          <span className="text-[9px] font-semibold lowercase tracking-normal text-emerald-600 dark:text-emerald-400 block font-sans">
                            {marginMethod === "cost"
                              ? "(markup base + dcto)"
                              : "(sobre venta)"}
                          </span>
                        </th>
                        <th className="p-2.5 w-16 text-center">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800/60">
                      {items.map((item, idx) => {
                        const isMultiUnit =
                          parseFloat(item.unidades_por_presentacion) > 1;
                        const activeTaxes = Array.isArray(item.impuestos)
                          ? item.impuestos
                          : [];
                        const customTaxes = activeTaxes.filter((t) => {
                          const nameU = (t.name || "").toUpperCase();
                          const isStandard =
                            t.group === "iva" ||
                            t.group === "icui" ||
                            t.group === "inc" ||
                            t.group === "ipo_adv" ||
                            nameU.includes("IVA") ||
                            nameU.includes("EXENTO") ||
                            nameU.includes("ICUI") ||
                            nameU.includes("INC") ||
                            nameU.includes("IPO") ||
                            nameU.includes("ADV");
                          const hasFixed =
                            (parseFloat(t.fixed_amount || t.valor_fijo) || 0) >
                            0;
                          return (
                            hasFixed ||
                            (!isStandard && (parseFloat(t.rate) || 0) > 0)
                          );
                        });
                        const detailedTaxes = item.impuestos_detallados || [];

                        return (
                          <tr
                            key={item.id}
                            className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30 transition group"
                          >
                            {/* 1. Index */}
                            <td className="p-2 text-slate-500 font-mono text-center text-xs sticky left-0 z-10 bg-white dark:bg-slate-900 group-hover:bg-slate-50 dark:group-hover:bg-slate-800 transition-colors">
                              {idx + 1}
                            </td>

                            {/* 2. Factura: Producto & Código (Solo Lectura) */}
                            <td className="p-2.5 sticky left-10 z-10 bg-white dark:bg-slate-900 group-hover:bg-slate-50 dark:group-hover:bg-slate-800 transition-colors shadow-[2px_0_5px_rgba(0,0,0,0.06)] dark:shadow-[2px_0_5px_rgba(0,0,0,0.3)]">
                              <div className="space-y-1.5 min-w-[220px] max-w-[280px]">
                                <div
                                  className="font-semibold text-xs text-slate-900 dark:text-white leading-snug break-words select-text"
                                  title={item.descripcion}
                                >
                                  {item.descripcion}
                                </div>
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span
                                    className="inline-flex items-center gap-1 font-mono text-[10.5px] text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-950 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-800"
                                    title="Código de barras original de la factura (protegido contra edición)"
                                  >
                                    <Lock className="w-2.5 h-2.5 text-slate-400 dark:text-slate-500 shrink-0" />
                                    <span>{item.codigo_barras || "Sin código"}</span>
                                  </span>
                                  {item.codigo_dian_unidad && (
                                    <span
                                      className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-blue-500/15 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300 border border-blue-500/30 text-[9px] font-bold"
                                      title={item.etiqueta_dian || `Código DIAN: ${item.codigo_dian_unidad} (${item.nombre_dian_unidad || ""})`}
                                    >
                                      DIAN: {item.codigo_dian_unidad}
                                    </span>
                                  )}
                                  {item.conversion_requerida && (
                                    <span
                                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/15 dark:bg-amber-500/20 text-amber-800 dark:text-amber-300 border border-amber-500/30 text-[9px] font-bold"
                                      title={item.conversion_texto}
                                    >
                                      ⚡ Conv: {item.cantidad} {item.codigo_dian_unidad} ➔ {item.cantidad_inventario_convertida} {item.unidad_pos}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </td>

                            {/* 3. Vinculación Catálogo POS */}
                            <td className="p-2.5 min-w-[240px] max-w-[320px]">
                              {item.matched_pos_item ? (
                                <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-500/30 text-emerald-800 dark:text-emerald-200 space-y-1">
                                  <div
                                    className="font-bold text-xs text-slate-900 dark:text-white leading-snug break-words"
                                    title={item.matched_pos_item.name}
                                  >
                                    {item.matched_pos_item.name}
                                  </div>
                                  <div className="flex items-center justify-between text-[10.5px] text-slate-600 dark:text-slate-300 pt-1 border-t border-emerald-200 dark:border-emerald-500/20 font-mono">
                                    <span className="text-slate-500 dark:text-slate-400">
                                      PLU: <strong className="text-slate-800 dark:text-slate-200">{item.matched_pos_item.barcode || item.matched_pos_item.item_number || "—"}</strong>
                                    </span>
                                    <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                                      ${(parseFloat(item.matched_pos_item.sale_price ?? item.matched_pos_item.unit_price) || 0).toLocaleString("es-CO")}
                                    </span>
                                  </div>
                                </div>
                              ) : (
                                <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-500/30 text-amber-800 dark:text-amber-300 space-y-0.5">
                                  <div className="flex items-center gap-1.5 text-[11px] font-bold">
                                    <AlertCircle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                                    <span>Por Conciliar en POS</span>
                                  </div>
                                  <p className="text-[10px] text-amber-700/80 dark:text-amber-200/70 leading-tight">
                                    Vincular o crear nuevo al aplicar
                                  </p>
                                </div>
                              )}
                            </td>

                            {/* 4. Cant. & Presentación (Espacioso, sin desbordes y alineado) */}
                            <td className="p-2.5 min-w-[260px]">
                              <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800/80 space-y-2">
                                {/* Fila 1: Cantidad Facturada */}
                                <div className="flex items-center justify-between gap-1.5 flex-nowrap">
                                  <span className="text-[9.5px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider shrink-0">
                                    Cant Fact:
                                  </span>
                                  <div className="flex items-center gap-1 shrink-0">
                                    <input
                                      type="number"
                                      step="any"
                                      min="0.01"
                                      value={item.cantidad}
                                      onChange={(e) =>
                                        handleUpdateItem(
                                          item.id,
                                          "cantidad",
                                          e.target.value,
                                        )
                                      }
                                      className="w-20 text-center bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-2 py-1 text-xs font-bold text-slate-900 dark:text-white focus:border-emerald-500 focus:outline-none"
                                      title="Cantidad total comprada en factura"
                                    />
                                    <span className="text-[10px] text-slate-500 dark:text-slate-400 font-bold shrink-0">
                                      fac
                                    </span>
                                  </div>
                                </div>

                                {/* Fila 2: Empaque / Presentación y Unidades por Empaque */}
                                <div className="flex items-center justify-between gap-1.5 pt-1.5 border-t border-slate-200 dark:border-slate-800/60 flex-nowrap">
                                  <div className="flex items-center gap-1 shrink-0">
                                    <span className="text-[9px] text-slate-400 dark:text-slate-500 uppercase font-semibold">Tipo:</span>
                                    <input
                                      type="text"
                                      value={item.presentacion}
                                      onChange={(e) =>
                                        handleUpdateItem(
                                          item.id,
                                          "presentacion",
                                          e.target.value,
                                        )
                                      }
                                      placeholder="UND"
                                      className="w-14 uppercase bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-md px-1 py-1 text-[10px] font-bold text-slate-800 dark:text-slate-200 text-center focus:outline-none shrink-0"
                                      title="Presentación (UND, CAJA, BOLSA, DISPLAY, BULTO...)"
                                    />
                                  </div>
                                  <div className="inline-flex items-center gap-1 shrink-0 bg-slate-100 dark:bg-slate-900 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-800">
                                    <span className="text-slate-400 dark:text-slate-500 text-xs font-bold shrink-0">
                                      ×
                                    </span>
                                    <input
                                      type="number"
                                      min="1"
                                      value={item.unidades_por_presentacion}
                                      onChange={(e) =>
                                        handleUpdateItem(
                                          item.id,
                                          "unidades_por_presentacion",
                                          e.target.value,
                                        )
                                      }
                                      className="w-11 text-center bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded px-1 py-0.5 text-[10.5px] font-bold text-emerald-600 dark:text-emerald-400 focus:outline-none shrink-0"
                                      title="Unidades de inventario dentro de este empaque"
                                    />
                                    <span className="text-[10px] text-slate-600 dark:text-slate-300 font-bold shrink-0 whitespace-nowrap">
                                      und
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </td>

                            {/* 5. Costo Unitario */}
                            <td className="p-2.5 text-right min-w-[160px]">
                              <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800/80 space-y-1.5">
                                <div className="flex items-center justify-end gap-1">
                                  <span className="text-slate-400 dark:text-slate-500 text-xs font-semibold">
                                    $
                                  </span>
                                  <CurrencyFormattedInput
                                    value={item.costo_presentacion}
                                    onChange={(val) =>
                                      handleUpdateItem(
                                        item.id,
                                        "costo_presentacion",
                                        val,
                                      )
                                    }
                                    title="Costo de compra unitario por empaque/unidad (formato COP con puntos)"
                                    className="w-28 text-right bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg px-2 py-1 text-xs font-mono font-bold text-slate-900 dark:text-white focus:border-emerald-500 focus:outline-none"
                                  />
                                </div>
                                <div className="flex items-center justify-between text-[9.5px] pt-1 border-t border-slate-200 dark:border-slate-800/60">
                                  <span className="text-slate-500 dark:text-slate-400">
                                    por {item.presentacion || "UND"}
                                  </span>
                                  {(parseFloat(item.unidades_por_presentacion) || 1) > 1 && (
                                    <span
                                      className="text-emerald-600 dark:text-emerald-400 font-mono font-bold"
                                      title="Costo neto por unidad individual dentro del empaque"
                                    >
                                      (${formatCOP(item.costo_unitario_neto || 0)}/und)
                                    </span>
                                  )}
                                </div>
                              </div>
                            </td>

                            {/* 6. Descuentos / Promos (% y valor en $, con desglose unitario + / - descuento) */}
                            <td className="p-2.5 text-center min-w-[270px]">
                              <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800/80 space-y-2">
                                {/* Controles: Solo [ % | $ ] (sin +REC ni -Dcto) */}
                                <div className="flex items-center justify-between gap-1 flex-nowrap">
                                  <span className="text-[10px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                                    Descuento:
                                  </span>
                                  <div className="inline-flex items-center bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg p-0.5 text-[9px] font-mono shrink-0">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleUpdateItem(
                                          item.id,
                                          "modo_descuento",
                                          "porcentaje",
                                        )
                                      }
                                      className={`px-2.5 py-0.5 rounded transition cursor-pointer font-bold ${
                                        item.modo_descuento !== "valor"
                                          ? "bg-amber-500 text-slate-950 font-black shadow-xs"
                                          : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                                      }`}
                                      title="Descuento en porcentaje (%)"
                                    >
                                      %
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleUpdateItem(
                                          item.id,
                                          "modo_descuento",
                                          "valor",
                                        )
                                      }
                                      className={`px-2.5 py-0.5 rounded transition cursor-pointer font-bold ${
                                        item.modo_descuento === "valor"
                                          ? "bg-amber-500 text-slate-950 font-black shadow-xs"
                                          : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                                      }`}
                                      title="Descuento en pesos ($ COP)"
                                    >
                                      $
                                    </button>
                                  </div>
                                </div>

                                {/* Fila de Input editable */}
                                <div className="flex items-center justify-center">
                                  {item.modo_descuento === "valor" ? (
                                    <div className="flex items-center gap-1 w-full justify-center">
                                      <span className="text-slate-400 dark:text-slate-500 text-xs font-semibold">$</span>
                                      <CurrencyFormattedInput
                                        value={item.descuento_valor || 0}
                                        onChange={(val) =>
                                          handleUpdateItem(
                                            item.id,
                                            "descuento_valor",
                                            Math.max(0, parseFloat(val) || 0),
                                          )
                                        }
                                        title="Valor total de descuento en pesos ($)"
                                        className="w-32 text-right bg-white dark:bg-slate-900 border border-amber-400 dark:border-amber-500/50 text-amber-700 dark:text-amber-300 rounded-lg px-2 py-1 text-xs font-mono font-bold focus:outline-none focus:border-amber-500"
                                      />
                                    </div>
                                  ) : (
                                    <div className="flex items-center justify-center gap-1 w-full">
                                      <input
                                        type="number"
                                        step="any"
                                        min="0"
                                        max="100"
                                        value={item.descuento || 0}
                                        onChange={(e) =>
                                          handleUpdateItem(
                                            item.id,
                                            "descuento",
                                            Math.max(
                                              0,
                                              parseFloat(e.target.value) || 0,
                                            ),
                                          )
                                        }
                                        className="w-24 text-center bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-amber-600 dark:text-amber-400 rounded-lg px-2 py-1 text-xs font-bold focus:outline-none focus:border-amber-500"
                                        title="Porcentaje de descuento u oferta comercial (%)"
                                      />
                                      <span className="text-xs text-slate-500 dark:text-slate-400 font-bold">%</span>
                                    </div>
                                  )}
                                </div>

                                {/* Desglose estructurado de tasa y valores unitarios */}
                                <div className="w-full text-right space-y-1 pt-1.5 border-t border-slate-200 dark:border-slate-800/60 font-mono text-[9.5px]">
                                  <div className="flex justify-between items-center gap-1.5 text-slate-600 dark:text-slate-400">
                                    <span className="text-[8.5px] uppercase font-sans font-semibold">Tasa & Monto:</span>
                                    <span className="font-semibold text-amber-600 dark:text-amber-400">
                                      {(item.descuento_porcentaje || item.descuento || 0).toLocaleString("es-CO", { maximumFractionDigits: 2 })}%
                                      {" · "}
                                      ${Math.round(item.descuento_valor || 0).toLocaleString("es-CO")}
                                    </span>
                                  </div>
                                  <div
                                    className="flex justify-between items-center gap-1.5 text-emerald-600 dark:text-emerald-400"
                                    title="Costo unitario sumando el descuento (base regular sin promoción para el POS)"
                                  >
                                    <span className="text-[8.5px] uppercase font-sans font-bold">+ Descuento:</span>
                                    <span className="font-bold text-emerald-700 dark:text-emerald-300">
                                      ${(item.costo_unitario_mas_descuento || (item.costo_presentacion + (item.descuento_unitario || 0))).toLocaleString("es-CO", { minimumFractionDigits: 1, maximumFractionDigits: 2 })}
                                    </span>
                                  </div>
                                  <div
                                    className="flex justify-between items-center gap-1.5 text-slate-600 dark:text-slate-400"
                                    title="Costo unitario descontando el descuento (costo neto pagado en factura)"
                                  >
                                    <span className="text-[8.5px] uppercase font-sans font-semibold">− Descuento:</span>
                                    <span className="font-semibold text-slate-800 dark:text-slate-200">
                                      ${(item.costo_unitario_menos_descuento || Math.max(0, item.costo_presentacion - (item.descuento_unitario || 0))).toLocaleString("es-CO", { minimumFractionDigits: 1, maximumFractionDigits: 2 })}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </td>

                            {/* 7. Impuestos (IVA / ICO y valores individuales) */}
                            <td className="p-2.5 min-w-[230px]">
                              <div className="flex flex-col gap-1.5">
                                {/* 1. IVA (0%, 5%, 19%) */}
                                <div className="flex items-center justify-between gap-1">
                                  <span className="text-[9px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider w-8 shrink-0">
                                    IVA
                                  </span>
                                  <div className="flex items-center gap-1">
                                    {TAX_OPTIONS_IVA.map((tax) => {
                                      const active = isTaxActive(item, tax);
                                      return (
                                        <button
                                          key={tax.name}
                                          type="button"
                                          onClick={() =>
                                            handleToggleItemTax(item.id, tax)
                                          }
                                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold transition cursor-pointer ${
                                            active
                                              ? "bg-emerald-500 text-slate-950 font-black shadow-xs ring-1 ring-emerald-300"
                                              : "bg-slate-100 dark:bg-slate-950 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800"
                                          }`}
                                          title={tax.title}
                                        >
                                          {tax.label}
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>

                                {/* 2. ICUI (Comestibles Ultraprocesados: 10%, 15%, 20%) */}
                                <div className="flex items-center justify-between gap-1">
                                  <span
                                    className="text-[9px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider w-8 shrink-0"
                                    title="Impuesto a Ultraprocesados (ICUI: 10%, 15%, 20%)"
                                  >
                                    ICUI
                                  </span>
                                  <div className="flex items-center gap-1">
                                    {TAX_OPTIONS_ICUI.map((tax) => {
                                      const active = isTaxActive(item, tax);
                                      return (
                                        <button
                                          key={tax.name}
                                          type="button"
                                          onClick={() =>
                                            handleToggleItemTax(item.id, tax)
                                          }
                                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold transition cursor-pointer ${
                                            active
                                              ? "bg-amber-400 text-slate-950 font-black shadow-xs ring-1 ring-amber-300"
                                              : "bg-slate-100 dark:bg-slate-950 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800"
                                          }`}
                                          title={tax.title}
                                        >
                                          {tax.label}
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>

                                {/* 3. INC (8%), Licores (IPO 20%, 25%) y + Otro */}
                                <div className="flex items-center justify-between gap-1">
                                  <div className="flex items-center gap-1">
                                    {TAX_OPTIONS_INC.map((tax) => {
                                      const active = isTaxActive(item, tax);
                                      return (
                                        <button
                                          key={tax.name}
                                          type="button"
                                          onClick={() =>
                                            handleToggleItemTax(item.id, tax)
                                          }
                                          className={`px-1.5 py-0.5 rounded text-[9.5px] font-bold transition cursor-pointer ${
                                            active
                                              ? "bg-sky-400 text-slate-950 font-black shadow-xs ring-1 ring-sky-300"
                                              : "bg-slate-100 dark:bg-slate-950 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800"
                                          }`}
                                          title={tax.title}
                                        >
                                          INC 8%
                                        </button>
                                      );
                                    })}
                                    {TAX_OPTIONS_IPO_ADV.map((tax) => {
                                      const active = isTaxActive(item, tax);
                                      return (
                                        <button
                                          key={tax.name}
                                          type="button"
                                          onClick={() =>
                                            handleToggleItemTax(item.id, tax)
                                          }
                                          className={`px-1.5 py-0.5 rounded text-[9.5px] font-bold transition cursor-pointer ${
                                            active
                                              ? "bg-purple-500 text-white font-black shadow-xs ring-1 ring-purple-300"
                                              : "bg-slate-100 dark:bg-slate-950 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800"
                                          }`}
                                          title={tax.title}
                                        >
                                          IPO {tax.label}
                                        </button>
                                      );
                                    })}
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleOpenCustomTaxModal(item)
                                    }
                                    className="text-[9px] font-bold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 px-1.5 py-0.5 rounded border border-slate-300 dark:border-slate-700/80 transition cursor-pointer shrink-0"
                                    title="Configurar otros impuestos personalizados o fijos en $"
                                  >
                                    + Otro
                                  </button>
                                </div>

                                {/* Chips de impuestos personalizados activos */}
                                {customTaxes.length > 0 && (
                                  <div className="flex flex-wrap gap-1">
                                    {customTaxes.map((ct, cIdx) => (
                                      <span
                                        key={cIdx}
                                        className="inline-flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded bg-indigo-500/15 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300 border border-indigo-500/40 font-semibold"
                                      >
                                        <span>{ct.name}</span>
                                        <button
                                          type="button"
                                          onClick={() =>
                                            handleRemoveCustomTax(item.id, ct)
                                          }
                                          className="text-slate-400 hover:text-rose-600 dark:hover:text-rose-300 ml-0.5"
                                          title="Quitar"
                                        >
                                          ×
                                        </button>
                                      </span>
                                    ))}
                                  </div>
                                )}

                                {/* Desglose exacto en pesos ($) de cada impuesto aplicado */}
                                <div className="w-full bg-slate-50 dark:bg-slate-950/90 rounded border border-slate-200 dark:border-slate-800/80 p-1.5 text-[9.5px] font-mono space-y-0.5">
                                  {(detailedTaxes.length > 0
                                    ? detailedTaxes
                                    : [
                                        {
                                          name: "Exento (0%)",
                                          valor_total: 0,
                                          rate: 0,
                                        },
                                      ]
                                  ).map((t, tIdx) => (
                                    <div
                                      key={tIdx}
                                      className="flex items-center justify-between text-slate-600 dark:text-slate-300"
                                    >
                                      <span className="truncate text-slate-500 dark:text-slate-400">
                                        {t.name || "Impuesto"}:
                                      </span>
                                      <span
                                        className={`font-bold ${
                                          (t.valor_total || 0) > 0
                                            ? "text-emerald-600 dark:text-emerald-400"
                                            : "text-slate-400 dark:text-slate-500"
                                        }`}
                                      >
                                        $
                                        {Math.round(
                                          t.valor_total || 0,
                                        ).toLocaleString("es-CO")}
                                      </span>
                                    </div>
                                  ))}

                                  {detailedTaxes.length > 1 && (
                                    <div className="flex items-center justify-between border-t border-slate-200 dark:border-slate-800/80 pt-0.5 text-amber-600 dark:text-amber-300 font-bold">
                                      <span>Tot. Imp:</span>
                                      <span>
                                        $
                                        {Math.round(
                                          item.monto_impuesto_total || 0,
                                        ).toLocaleString("es-CO")}
                                      </span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </td>

                            {/* 8. Valor Total Compra (con los 4 desgloses solicitados) */}
                            <td className="p-2.5 text-right min-w-[240px]">
                              <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800/80 space-y-2">
                                <div className="flex items-center justify-between gap-1">
                                  <span className="text-[10px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                                    Total Compra:
                                  </span>
                                  <div className="flex items-center gap-1">
                                    <span className="text-slate-400 dark:text-slate-500 text-xs font-semibold">
                                      $
                                    </span>
                                    <CurrencyFormattedInput
                                      value={
                                        item.valor_compra !== undefined
                                          ? Math.round(item.valor_compra)
                                          : Math.round(
                                              item.costo_presentacion *
                                                item.cantidad,
                                            )
                                      }
                                      onChange={(val) =>
                                        handleUpdateValorCompra(item.id, val)
                                      }
                                      title="Valor total de compra facturado (editable: auto-calcula costo unitario)"
                                      className="w-28 text-right bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-2 py-1 text-xs font-mono font-bold text-teal-700 dark:text-teal-300 focus:border-teal-400 focus:outline-none"
                                    />
                                  </div>
                                </div>

                                {/* Desglose exacto de los 4 desgloses solicitados por el usuario */}
                                <div className="w-full text-right space-y-1 pt-1.5 border-t border-slate-200 dark:border-slate-800/60 font-mono text-[9px]">
                                  <div
                                    className="flex justify-between items-center gap-1.5 text-emerald-600 dark:text-emerald-400"
                                    title="Total con impuestos sumando el descuento"
                                  >
                                    <span className="text-[8px] uppercase font-sans font-bold">Con Imp + Dcto:</span>
                                    <span className="font-bold text-emerald-700 dark:text-emerald-300">
                                      ${Math.round(item.total_con_impuestos_mas_descuento ?? (item.valor_compra_con_impuestos || 0)).toLocaleString("es-CO")}
                                    </span>
                                  </div>

                                  <div
                                    className="flex justify-between items-center gap-1.5 text-slate-700 dark:text-slate-300"
                                    title="Total con impuestos descontando el descuento (neto a pagar en factura)"
                                  >
                                    <span className="text-[8px] uppercase font-sans font-semibold">Con Imp − Dcto:</span>
                                    <span className="font-bold text-slate-900 dark:text-white">
                                      ${Math.round(item.total_con_impuestos_menos_descuento ?? (item.valor_compra_con_impuestos || 0)).toLocaleString("es-CO")}
                                    </span>
                                  </div>

                                  <div
                                    className="flex justify-between items-center gap-1.5 text-slate-500 dark:text-slate-400"
                                    title="Subtotal sin impuestos sumando el descuento"
                                  >
                                    <span className="text-[8px] uppercase font-sans">Sin Imp + Dcto:</span>
                                    <span className="font-semibold text-slate-700 dark:text-slate-300">
                                      ${Math.round(item.total_sin_impuestos_mas_descuento ?? (item.valor_compra_sin_impuestos || 0)).toLocaleString("es-CO")}
                                    </span>
                                  </div>

                                  <div
                                    className="flex justify-between items-center gap-1.5 text-slate-500 dark:text-slate-400"
                                    title="Subtotal sin impuestos descontando el descuento"
                                  >
                                    <span className="text-[8px] uppercase font-sans">Sin Imp − Dcto:</span>
                                    <span className="font-semibold text-slate-700 dark:text-slate-300">
                                      ${Math.round(item.total_sin_impuestos_menos_descuento ?? (item.valor_compra_sin_impuestos || 0)).toLocaleString("es-CO")}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </td>

                            {/* 10. Margen & Precio POS */}
                            <td className="p-2.5 text-right min-w-[165px]">
                              <div className="flex flex-col items-end gap-1">
                                {/* Margen % */}
                                <div className="flex items-center justify-end gap-1">
                                  {item.is_manual_margin && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleResetItemMargin(item.id)
                                      }
                                      className="text-[9px] font-bold text-amber-700 dark:text-amber-300 bg-amber-500/15 dark:bg-amber-950/80 px-1 py-0.5 rounded border border-amber-500/40 hover:bg-amber-500/25 dark:hover:bg-amber-900/80 transition cursor-pointer"
                                      title="Margen editado manualmente. Clic para restablecer al margen global"
                                    >
                                      Manual ↺
                                    </button>
                                  )}
                                  <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">
                                    Margen:
                                  </span>
                                  <input
                                    type="number"
                                    min="0"
                                    max="90"
                                    value={item.margen_ganancia}
                                    onChange={(e) =>
                                      handleUpdateItem(
                                        item.id,
                                        "margen_ganancia",
                                        e.target.value,
                                      )
                                    }
                                    className={`w-11 text-center bg-white dark:bg-slate-950 border rounded py-0.5 text-xs font-bold focus:outline-none ${
                                      item.is_manual_margin
                                        ? "border-amber-400 dark:border-amber-500/60 text-amber-700 dark:text-amber-300"
                                        : "border-slate-300 dark:border-slate-800 text-emerald-600 dark:text-emerald-400"
                                    }`}
                                  />
                                  <span className="text-[10px] text-slate-400">
                                    %
                                  </span>
                                </div>

                                {/* Modo de venta y precio */}
                                {isMultiUnit ? (
                                  <div className="flex flex-col items-end gap-0.5">
                                    <div className="inline-flex rounded-lg bg-slate-100 dark:bg-slate-950 p-0.5 border border-slate-200 dark:border-slate-800 text-[10px] font-bold">
                                      <button
                                        type="button"
                                        onClick={() =>
                                          handleUpdateItem(
                                            item.id,
                                            "modo_venta",
                                            "unidad",
                                          )
                                        }
                                        className={`px-2 py-0.5 rounded transition ${
                                          item.modo_venta !== "paquete"
                                            ? "bg-emerald-600 text-white shadow-xs"
                                            : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                                        }`}
                                        title={`Vender por unidad: $${Number(item.precio_venta_unidad || 0).toLocaleString("es-CO")}`}
                                      >
                                        Und
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          handleUpdateItem(
                                            item.id,
                                            "modo_venta",
                                            "paquete",
                                          )
                                        }
                                        className={`px-2 py-0.5 rounded transition ${
                                          item.modo_venta === "paquete"
                                            ? "bg-teal-600 text-white shadow-xs"
                                            : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                                        }`}
                                        title={`Vender por paquete: $${Number(item.precio_venta_paquete || 0).toLocaleString("es-CO")}`}
                                      >
                                        {item.presentacion || "Pqte"}
                                      </button>
                                    </div>
                                    <span className="font-mono font-black text-sm text-emerald-600 dark:text-emerald-400 block">
                                      $
                                      {Number(
                                        (item.modo_venta === "paquete"
                                          ? item.precio_venta_paquete
                                          : (item.precio_venta_unidad ||
                                             item.precio_venta_redondeado)) || 0,
                                      ).toLocaleString("es-CO")}
                                    </span>
                                  </div>
                                ) : (
                                  <div className="text-right">
                                    <span className="font-mono font-black text-sm text-emerald-600 dark:text-emerald-400 block">
                                      $
                                      {Number(
                                        item.precio_venta_unidad ||
                                          item.precio_venta_redondeado ||
                                          0,
                                      ).toLocaleString("es-CO")}
                                    </span>
                                    <span className="text-[9.5px] text-slate-400 dark:text-slate-500 block">
                                      Exac: $
                                      {Number(
                                        item.precio_venta_calculado || 0,
                                      ).toLocaleString("es-CO")}
                                    </span>
                                  </div>
                                )}
                              </div>
                            </td>

                            {/* 11. Acciones */}
                            <td className="p-2.5 text-center">
                              <div className="flex items-center justify-center gap-1">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setSelectedItemForBreakdown(item)
                                  }
                                  className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition cursor-pointer"
                                  title="Ver fórmula y desglose matemático"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveItem(item.id)}
                                  className="p-1.5 rounded-lg bg-slate-100 hover:bg-rose-100 dark:bg-slate-800 dark:hover:bg-rose-950/60 text-slate-500 hover:text-rose-600 dark:text-slate-400 dark:hover:text-rose-300 transition cursor-pointer"
                                  title="Eliminar fila"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* 2. VISTA DE TARJETAS FLUIDAS PARA MÓVILES Y TABLETS */}
                <div className="block lg:hidden divide-y divide-slate-200 dark:divide-slate-800 rounded-xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-slate-900/60 overflow-hidden shadow-xl mt-3 lg:mt-0">
                  {items.map((item, idx) => {
                    const isMultiUnit =
                      parseFloat(item.unidades_por_presentacion) > 1;
                    const activeTaxes = Array.isArray(item.impuestos)
                      ? item.impuestos
                      : [];
                    const customTaxes = activeTaxes.filter((t) => {
                      const nameU = (t.name || "").toUpperCase();
                      const isStandard =
                        t.group === "iva" ||
                        t.group === "icui" ||
                        t.group === "inc" ||
                        t.group === "ipo_adv" ||
                        nameU.includes("IVA") ||
                        nameU.includes("EXENTO") ||
                        nameU.includes("ICUI") ||
                        nameU.includes("INC") ||
                        nameU.includes("IPO") ||
                        nameU.includes("ADV");
                      const hasFixed =
                        (parseFloat(t.fixed_amount || t.valor_fijo) || 0) > 0;
                      return (
                        hasFixed ||
                        (!isStandard && (parseFloat(t.rate) || 0) > 0)
                      );
                    });

                    return (
                      <div
                        key={item.id}
                        className="p-4 space-y-3 hover:bg-slate-50/70 dark:hover:bg-slate-800/20 transition"
                      >
                        {/* Header: Índice, Descripción y Botones de Acción */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-start gap-2 flex-1 min-w-0">
                            <span className="w-6 h-6 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-mono text-xs flex items-center justify-center font-bold shrink-0 mt-0.5">
                              {idx + 1}
                            </span>
                            <div className="flex-1 min-w-0">
                              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-0.5">
                                Producto Factura
                              </span>
                              <div
                                className="font-bold text-sm text-slate-900 dark:text-white leading-snug select-text"
                                title={item.descripcion}
                              >
                                {item.descripcion}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-1 shrink-0 pt-0.5">
                            <button
                              type="button"
                              onClick={() => setSelectedItemForBreakdown(item)}
                              className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-slate-700 transition cursor-pointer"
                              title="Ver fórmula y desglose matemático"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRemoveItem(item.id)}
                              className="p-1.5 rounded-lg bg-slate-100 hover:bg-rose-100 dark:bg-slate-800 dark:hover:bg-rose-950/60 text-slate-500 hover:text-rose-600 dark:text-slate-400 dark:hover:text-rose-300 border border-slate-200 dark:border-slate-700 transition cursor-pointer"
                              title="Eliminar fila"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        {/* Códigos de barra, Alias y Enlace POS */}
                        <div className="flex flex-col gap-2">
                          <div className="flex items-center flex-wrap gap-2">
                            <span
                              className="inline-flex items-center gap-1.5 font-mono text-xs text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-950 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-800"
                              title="Código original de la factura (protegido contra edición)"
                            >
                              <Lock className="w-3 h-3 text-slate-400 dark:text-slate-500" />
                              <span>{item.codigo_barras || "Sin código"}</span>
                            </span>

                            {item.codigo_dian_unidad && (
                              <span
                                className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-blue-500/15 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300 border border-blue-500/30 text-[10px] font-bold"
                                title={item.etiqueta_dian || `Código DIAN: ${item.codigo_dian_unidad}`}
                              >
                                DIAN: {item.codigo_dian_unidad}
                              </span>
                            )}

                            {item.conversion_requerida && (
                              <span
                                className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-amber-500/15 dark:bg-amber-500/20 text-amber-800 dark:text-amber-300 border border-amber-500/30 text-[10px] font-bold"
                                title={item.conversion_texto}
                              >
                                ⚡ Conv: {item.cantidad} {item.codigo_dian_unidad} ➔ {item.cantidad_inventario_convertida} {item.unidad_pos}
                              </span>
                            )}
                          </div>

                          {/* Vinculación POS en Móvil */}
                          {item.matched_pos_item ? (
                            <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-500/30 text-emerald-800 dark:text-emerald-200">
                              <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider block">
                                Vinculado con Catálogo POS:
                              </span>
                              <div className="font-bold text-xs text-slate-900 dark:text-white mt-0.5" title={item.matched_pos_item.name}>
                                {item.matched_pos_item.name}
                              </div>
                              <div className="flex items-center justify-between text-[11px] text-slate-600 dark:text-slate-300 pt-1 mt-1 border-t border-emerald-200 dark:border-emerald-500/20 font-mono">
                                <span>PLU: <strong className="text-slate-800 dark:text-white">{item.matched_pos_item.barcode || item.matched_pos_item.item_number || "—"}</strong></span>
                                <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                                  ${(parseFloat(item.matched_pos_item.sale_price ?? item.matched_pos_item.unit_price) || 0).toLocaleString("es-CO")}
                                </span>
                              </div>
                            </div>
                          ) : (
                            <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-500/30 text-amber-800 dark:text-amber-300 flex items-center justify-between text-xs">
                              <div className="flex items-center gap-1.5 font-bold">
                                <AlertCircle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                                <span>Por Conciliar en POS</span>
                              </div>
                              <span className="text-[10px] text-amber-700/80 dark:text-amber-200/70">Doble confirmación</span>
                            </div>
                          )}
                        </div>

                        {/* Cuadrícula Fluidamente Estructurada: Sin amontonamientos ni desbordes */}
                        <div className="space-y-3">
                          {/* Bloque 1: Cantidad & Empaque + Costo Unitario */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                            {/* 1. Cantidad & Empaque / Presentación */}
                            <div className="bg-slate-50 dark:bg-slate-950/60 p-3 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
                              <span className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 block tracking-wider">
                                Cantidad y Empaque
                              </span>
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-xs text-slate-600 dark:text-slate-400 font-semibold">Cant. Facturada:</span>
                                <input
                                  type="number"
                                  step="any"
                                  min="0.01"
                                  value={item.cantidad}
                                  onChange={(e) =>
                                    handleUpdateItem(
                                      item.id,
                                      "cantidad",
                                      e.target.value,
                                    )
                                  }
                                  className="w-24 text-center bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg py-1 text-xs font-bold text-slate-900 dark:text-white focus:border-emerald-500 focus:outline-none"
                                  title="Cantidad comprada en factura"
                                />
                              </div>

                              {/* Fila 2: Tipo de Empaque / Presentación */}
                              <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-200 dark:border-slate-800/80">
                                <span className="text-xs text-slate-600 dark:text-slate-400 font-semibold">Tipo Empaque:</span>
                                <input
                                  type="text"
                                  value={item.presentacion}
                                  onChange={(e) =>
                                    handleUpdateItem(
                                      item.id,
                                      "presentacion",
                                      e.target.value,
                                    )
                                  }
                                  placeholder="UND"
                                  className="w-24 uppercase bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg py-1 px-2 text-xs font-bold text-slate-800 dark:text-slate-200 text-center focus:outline-none"
                                  title="Presentación (UND, CAJA, BOLSA, DISPLAY, BULTO...)"
                                />
                              </div>

                              {/* Fila 3: Unidades dentro del empaque */}
                              <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-dashed border-slate-200 dark:border-slate-800/60">
                                <span className="text-xs text-slate-600 dark:text-slate-400 font-semibold">Unidades / Empaque:</span>
                                <div className="inline-flex items-center gap-1.5 bg-slate-100 dark:bg-slate-900 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-800 shrink-0">
                                  <span className="text-slate-400 dark:text-slate-500 text-xs font-bold">×</span>
                                  <input
                                    type="number"
                                    min="1"
                                    value={item.unidades_por_presentacion}
                                    onChange={(e) =>
                                      handleUpdateItem(
                                        item.id,
                                        "unidades_por_presentacion",
                                        e.target.value,
                                      )
                                    }
                                    className="w-14 text-center bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded px-1.5 py-0.5 text-xs font-bold text-emerald-600 dark:text-emerald-400 focus:outline-none"
                                    title="Unidades de inventario dentro de este empaque"
                                  />
                                  <span className="text-xs text-slate-600 dark:text-slate-300 font-bold shrink-0 whitespace-nowrap">
                                    und
                                  </span>
                                </div>
                              </div>
                            </div>

                            {/* 2. Costo Unitario de Factura */}
                            <div className="bg-slate-50 dark:bg-slate-950/60 p-3 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2 flex flex-col justify-between">
                              <div>
                                <span className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 block tracking-wider">
                                  Costo Unitario Factura
                                </span>
                                <div className="flex items-center justify-between gap-2 mt-1">
                                  <span className="text-xs text-slate-600 dark:text-slate-400">Por {item.presentacion || "UND"}:</span>
                                  <div className="flex items-center gap-1">
                                    <span className="text-slate-400 dark:text-slate-500 text-xs font-semibold">$</span>
                                    <CurrencyFormattedInput
                                      value={item.costo_presentacion}
                                      onChange={(val) =>
                                        handleUpdateItem(
                                          item.id,
                                          "costo_presentacion",
                                          val,
                                        )
                                      }
                                      className="w-28 text-right bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-2 py-1 text-xs font-mono font-bold text-slate-900 dark:text-white focus:border-emerald-500 focus:outline-none"
                                    />
                                  </div>
                                </div>
                              </div>
                              {isMultiUnit && (
                                <div className="pt-2 border-t border-slate-200 dark:border-slate-800/80 flex items-center justify-between text-xs font-mono">
                                  <span className="text-slate-500 dark:text-slate-400">Costo neto /und:</span>
                                  <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                                    ${formatCOP(item.costo_unitario_neto || 0)}
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Bloque 2: Descuentos / Promociones (% y $) */}
                          <div className="bg-slate-50 dark:bg-slate-950/60 p-3 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
                            <div className="flex items-center justify-between gap-1">
                              <span className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 tracking-wider">
                                Descuentos / Promos
                              </span>
                              {/* Modo: % o $ (sin botones confusos +REC o -Dcto) */}
                              <div className="inline-flex items-center bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg p-0.5 text-[9px] font-mono shrink-0">
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleUpdateItem(
                                      item.id,
                                      "modo_descuento",
                                      "porcentaje",
                                    )
                                  }
                                  className={`px-2.5 py-0.5 rounded transition cursor-pointer font-bold ${
                                    item.modo_descuento !== "valor"
                                      ? "bg-amber-500 text-slate-950 font-black shadow-xs"
                                      : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                                  }`}
                                  title="Descuento en porcentaje (%)"
                                >
                                  %
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleUpdateItem(
                                      item.id,
                                      "modo_descuento",
                                      "valor",
                                    )
                                  }
                                  className={`px-2.5 py-0.5 rounded transition cursor-pointer font-bold ${
                                    item.modo_descuento === "valor"
                                      ? "bg-amber-500 text-slate-950 font-black shadow-xs"
                                      : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                                  }`}
                                  title="Descuento en pesos ($ COP)"
                                >
                                  $
                                </button>
                              </div>
                            </div>

                            {/* Input de descuento editable */}
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs text-slate-600 dark:text-slate-400 font-semibold">
                                {item.modo_descuento === "valor" ? "Monto Descuento ($):" : "Tasa Descuento (%):"}
                              </span>
                              {item.modo_descuento === "valor" ? (
                                <div className="flex items-center gap-1">
                                  <span className="text-slate-400 dark:text-slate-500 text-xs">$</span>
                                  <CurrencyFormattedInput
                                    value={item.descuento_valor || 0}
                                    onChange={(val) =>
                                      handleUpdateItem(
                                        item.id,
                                        "descuento_valor",
                                        Math.max(0, parseFloat(val) || 0),
                                      )
                                    }
                                    className="w-28 text-right bg-white dark:bg-slate-900 border border-amber-400 dark:border-amber-500/50 text-amber-700 dark:text-amber-300 rounded-lg px-2 py-1 text-xs font-mono font-bold focus:outline-none"
                                    title="Valor total de descuento en pesos ($)"
                                  />
                                </div>
                              ) : (
                                <div className="flex items-center gap-1">
                                  <input
                                    type="number"
                                    step="any"
                                    min="0"
                                    max="100"
                                    value={item.descuento || 0}
                                    onChange={(e) =>
                                      handleUpdateItem(
                                        item.id,
                                        "descuento",
                                        Math.max(0, parseFloat(e.target.value) || 0),
                                      )
                                    }
                                    className="w-20 text-center bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-amber-600 dark:text-amber-400 rounded-lg py-1 text-xs font-bold focus:outline-none"
                                    title="Porcentaje de descuento (%)"
                                  />
                                  <span className="text-xs text-slate-500 dark:text-slate-400 font-bold">%</span>
                                </div>
                              )}
                            </div>

                            {/* Desglose de tasa y costos unitarios + / - descuento */}
                            <div className="pt-2 border-t border-slate-200 dark:border-slate-800/80 font-mono text-[10px] space-y-1">
                              <div className="flex items-center justify-between text-slate-600 dark:text-slate-400">
                                <span className="font-sans font-semibold">Tasa & Monto:</span>
                                <span className="font-semibold text-amber-600 dark:text-amber-400">
                                  {(item.descuento_porcentaje || item.descuento || 0).toLocaleString("es-CO", { maximumFractionDigits: 2 })}%
                                  {" · "}
                                  ${Math.round(item.descuento_valor || 0).toLocaleString("es-CO")}
                                </span>
                              </div>
                              <div
                                className="flex items-center justify-between text-emerald-600 dark:text-emerald-400"
                                title="Costo unitario sumando el descuento (base regular de venta para POS)"
                              >
                                <span className="font-sans font-bold">+ Descuento:</span>
                                <span className="font-bold text-emerald-700 dark:text-emerald-300">
                                  ${(item.costo_unitario_mas_descuento || (item.costo_presentacion + (item.descuento_unitario || 0))).toLocaleString("es-CO", { minimumFractionDigits: 1, maximumFractionDigits: 2 })}
                                </span>
                              </div>
                              <div
                                className="flex items-center justify-between text-slate-600 dark:text-slate-400"
                                title="Costo unitario descontando el descuento (costo neto en factura)"
                              >
                                <span className="font-sans font-semibold">− Descuento:</span>
                                <span className="font-semibold text-slate-800 dark:text-slate-200">
                                  ${(item.costo_unitario_menos_descuento || Math.max(0, item.costo_presentacion - (item.descuento_unitario || 0))).toLocaleString("es-CO", { minimumFractionDigits: 1, maximumFractionDigits: 2 })}
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Bloque 3: Impuestos Aplicables (IVA / ICUI / INC / IPO y + Otro) */}
                          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 tracking-wider">
                                Impuestos Aplicables
                              </span>
                              <button
                                type="button"
                                onClick={() => handleOpenCustomTaxModal(item)}
                                className="text-[9px] font-bold text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700 transition cursor-pointer"
                              >
                                + Otro Impuesto
                              </button>
                            </div>

                            <div className="flex items-center flex-wrap gap-1">
                              {/* IVA */}
                              {TAX_OPTIONS_IVA.map((tax) => {
                                const active = isTaxActive(item, tax);
                                return (
                                  <button
                                    key={tax.name}
                                    type="button"
                                    onClick={() =>
                                      handleToggleItemTax(item.id, tax)
                                    }
                                    className={`px-2 py-0.5 rounded text-[10px] font-bold transition cursor-pointer ${
                                      active
                                        ? "bg-emerald-500 text-slate-950 font-black shadow-xs ring-1 ring-emerald-300"
                                        : "bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-slate-800"
                                    }`}
                                  >
                                    IVA {tax.label}
                                  </button>
                                );
                              })}
                              {/* ICUI */}
                              {TAX_OPTIONS_ICUI.map((tax) => {
                                const active = isTaxActive(item, tax);
                                return (
                                  <button
                                    key={tax.name}
                                    type="button"
                                    onClick={() =>
                                      handleToggleItemTax(item.id, tax)
                                    }
                                    className={`px-2 py-0.5 rounded text-[10px] font-bold transition cursor-pointer ${
                                      active
                                        ? "bg-amber-400 text-slate-950 font-black shadow-xs ring-1 ring-amber-300"
                                        : "bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-slate-800"
                                    }`}
                                  >
                                    ICUI {tax.label}
                                  </button>
                                );
                              })}
                              {/* INC & IPO */}
                              {TAX_OPTIONS_INC.map((tax) => {
                                const active = isTaxActive(item, tax);
                                return (
                                  <button
                                    key={tax.name}
                                    type="button"
                                    onClick={() =>
                                      handleToggleItemTax(item.id, tax)
                                    }
                                    className={`px-2 py-0.5 rounded text-[10px] font-bold transition cursor-pointer ${
                                      active
                                        ? "bg-sky-400 text-slate-950 font-black shadow-xs ring-1 ring-sky-300"
                                        : "bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-slate-800"
                                    }`}
                                  >
                                    INC 8%
                                  </button>
                                );
                              })}
                              {TAX_OPTIONS_IPO_ADV.map((tax) => {
                                const active = isTaxActive(item, tax);
                                return (
                                  <button
                                    key={tax.name}
                                    type="button"
                                    onClick={() =>
                                      handleToggleItemTax(item.id, tax)
                                    }
                                    className={`px-2 py-0.5 rounded text-[10px] font-bold transition cursor-pointer ${
                                      active
                                        ? "bg-purple-500 text-white font-black shadow-xs ring-1 ring-purple-300"
                                        : "bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-slate-800"
                                    }`}
                                  >
                                    IPO {tax.label}
                                  </button>
                                );
                              })}
                            </div>

                            {/* Chips de impuestos personalizados */}
                            {customTaxes.length > 0 && (
                              <div className="flex flex-wrap gap-1 pt-1">
                                {customTaxes.map((ct, cIdx) => (
                                  <span
                                    key={cIdx}
                                    className="inline-flex items-center gap-1 text-[9px] px-2 py-0.5 rounded bg-indigo-500/15 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300 border border-indigo-500/40 font-semibold"
                                  >
                                    <span>{ct.name}</span>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleRemoveCustomTax(item.id, ct)
                                      }
                                      className="text-slate-400 hover:text-rose-600 dark:hover:text-rose-300 ml-0.5"
                                    >
                                      ×
                                    </button>
                                  </span>
                                ))}
                              </div>
                            )}

                            {/* Desglose resumido de impuestos en pesos */}
                            <div className="text-[10px] font-mono text-slate-500 dark:text-slate-400 flex items-center justify-between pt-0.5 border-t border-slate-200 dark:border-slate-800/80">
                              <span>Total Impuestos:</span>
                              <span className="font-bold text-emerald-600 dark:text-emerald-400">
                                $
                                {Math.round(
                                  item.monto_impuesto_total || 0,
                                ).toLocaleString("es-CO")}
                              </span>
                            </div>
                          </div>

                          {/* Bloque 4: Valor Total Compra (con los 4 desgloses exactos) */}
                          <div className="bg-slate-50 dark:bg-slate-950/60 p-3 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 tracking-wider">
                                Valor Total Compra
                              </span>
                              <div className="inline-flex items-center rounded-lg bg-slate-100 dark:bg-slate-900 p-0.5 border border-slate-200 dark:border-slate-800 text-[10px] font-sans">
                                <button
                                  type="button"
                                  onClick={() => handleToggleRowTaxInPurchaseValue(item.id)}
                                  className={`px-2 py-0.5 rounded font-semibold transition cursor-pointer ${
                                    !item.incluir_impuestos_valor_compra
                                      ? "bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-white shadow-xs font-bold"
                                      : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                                  }`}
                                >
                                  Sin Imp
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleToggleRowTaxInPurchaseValue(item.id)}
                                  className={`px-2 py-0.5 rounded font-semibold transition cursor-pointer ${
                                    item.incluir_impuestos_valor_compra
                                      ? "bg-emerald-600 text-white shadow-xs font-bold"
                                      : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                                  }`}
                                >
                                  + Imp
                                </button>
                              </div>
                            </div>

                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs text-slate-600 dark:text-slate-400 font-semibold">Total Compra:</span>
                              <div className="flex items-center gap-1">
                                <span className="text-slate-400 dark:text-slate-500 text-xs font-semibold">$</span>
                                <CurrencyFormattedInput
                                  value={
                                    item.valor_compra !== undefined
                                      ? Math.round(item.valor_compra)
                                      : Math.round(item.costo_presentacion * item.cantidad)
                                  }
                                  onChange={(val) =>
                                    handleUpdateValorCompra(item.id, val)
                                  }
                                  className="w-28 text-right bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-2 py-1 text-xs font-mono font-bold text-teal-700 dark:text-teal-300 focus:outline-none"
                                />
                              </div>
                            </div>

                            {/* 4 Desgloses con/sin impuesto y con/sin descuento */}
                            <div className="pt-2 border-t border-slate-200 dark:border-slate-800/80 font-mono text-[10px] space-y-1">
                              <div
                                className="flex items-center justify-between text-emerald-600 dark:text-emerald-400"
                                title="Total con impuestos sumando el descuento"
                              >
                                <span className="font-sans font-bold">Con Imp + Dcto:</span>
                                <span className="font-bold text-emerald-700 dark:text-emerald-300">
                                  ${Math.round(item.total_con_impuestos_mas_descuento ?? (item.valor_compra_con_impuestos || 0)).toLocaleString("es-CO")}
                                </span>
                              </div>

                              <div
                                className="flex items-center justify-between text-slate-700 dark:text-slate-300"
                                title="Total con impuestos descontando el descuento (neto a pagar en factura)"
                              >
                                <span className="font-sans font-semibold">Con Imp − Dcto:</span>
                                <span className="font-bold text-slate-900 dark:text-white">
                                  ${Math.round(item.total_con_impuestos_menos_descuento ?? (item.valor_compra_con_impuestos || 0)).toLocaleString("es-CO")}
                                </span>
                              </div>

                              <div
                                className="flex items-center justify-between text-slate-500 dark:text-slate-400"
                                title="Subtotal sin impuestos sumando el descuento"
                              >
                                <span className="font-sans">Sin Imp + Dcto:</span>
                                <span className="font-semibold text-slate-700 dark:text-slate-300">
                                  ${Math.round(item.total_sin_impuestos_mas_descuento ?? (item.valor_compra_sin_impuestos || 0)).toLocaleString("es-CO")}
                                </span>
                              </div>

                              <div
                                className="flex items-center justify-between text-slate-500 dark:text-slate-400"
                                title="Subtotal sin impuestos descontando el descuento"
                              >
                                <span className="font-sans">Sin Imp − Dcto:</span>
                                <span className="font-semibold text-slate-700 dark:text-slate-300">
                                  ${Math.round(item.total_sin_impuestos_menos_descuento ?? (item.valor_compra_sin_impuestos || 0)).toLocaleString("es-CO")}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Banner Financiero: Margen %, Modo y Precio Venta Final */}
                        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950/90 border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {item.is_manual_margin && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleResetItemMargin(item.id)
                                  }
                                  className="text-[9px] font-bold text-amber-700 dark:text-amber-300 bg-amber-500/15 dark:bg-amber-950/80 px-1 py-0.5 rounded border border-amber-500/40 hover:bg-amber-500/25 dark:hover:bg-amber-900/80 transition cursor-pointer"
                                  title="Margen editado manualmente. Clic para restablecer al margen global"
                                >
                                  Manual ↺
                                </button>
                              )}
                              <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">
                                Margen:
                              </span>
                              <input
                                type="number"
                                min="0"
                                max="90"
                                value={item.margen_ganancia}
                                onChange={(e) =>
                                  handleUpdateItem(
                                    item.id,
                                    "margen_ganancia",
                                    e.target.value,
                                  )
                                }
                                className={`w-12 text-center bg-white dark:bg-slate-900 border rounded py-0.5 text-xs font-bold focus:outline-none ${
                                  item.is_manual_margin
                                    ? "border-amber-400 dark:border-amber-500/60 text-amber-700 dark:text-amber-300"
                                    : "border-slate-300 dark:border-slate-700 text-emerald-600 dark:text-emerald-400"
                                }`}
                              />
                              <span className="text-[10px] text-slate-400">
                                %
                              </span>
                            </div>
                            <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">
                              Costo Final: $
                              {Math.round(
                                item.costo_unitario_final ||
                                  item.costo_unitario_neto ||
                                  0,
                              ).toLocaleString("es-CO")}
                            </span>
                          </div>

                          <div className="flex flex-col items-end gap-1">
                            {isMultiUnit && (
                              <div className="inline-flex rounded-lg bg-slate-100 dark:bg-slate-900 p-0.5 border border-slate-200 dark:border-slate-800 text-[10px] font-bold">
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleUpdateItem(
                                      item.id,
                                      "modo_venta",
                                      "unidad",
                                    )
                                  }
                                  className={`px-2 py-0.5 rounded transition ${
                                    item.modo_venta !== "paquete"
                                      ? "bg-emerald-600 text-white shadow-xs"
                                      : "text-slate-500 dark:text-slate-400"
                                  }`}
                                >
                                  Und
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleUpdateItem(
                                      item.id,
                                      "modo_venta",
                                      "paquete",
                                    )
                                  }
                                  className={`px-2 py-0.5 rounded transition ${
                                    item.modo_venta === "paquete"
                                      ? "bg-teal-600 text-white shadow-xs"
                                      : "text-slate-500 dark:text-slate-400"
                                  }`}
                                >
                                  {item.presentacion || "Pqte"}
                                </button>
                              </div>
                            )}

                            <div className="text-right">
                              <span className="text-[9px] uppercase font-semibold text-emerald-600 dark:text-emerald-400/90 block">
                                Precio Venta POS
                              </span>
                              <span className="text-base sm:text-lg font-black font-mono text-emerald-600 dark:text-emerald-400">
                                $
                                {Number(
                                  (item.modo_venta === "paquete"
                                    ? item.precio_venta_paquete
                                    : (item.precio_venta_unidad ||
                                       item.precio_venta_redondeado)) || 0,
                                ).toLocaleString("es-CO")}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          {/* 3. BARRA DE ACCIONES Y EXPORTACIÓN (Estática al final de la página para no tapar la tabla en móviles) */}
          {items.length > 0 && (
            <div className="bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 p-4 rounded-2xl shadow-sm dark:shadow-xl flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 mt-6">
              {/* Información de Simulación */}
              <div className="flex items-center gap-3">
                <span className="px-3.5 py-1.5 rounded-xl bg-teal-500/10 border border-teal-500/30 text-teal-700 dark:text-teal-300 font-bold text-xs flex items-center gap-2">
                  <Package className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                  {items.length}{" "}
                  {items.length === 1
                    ? "artículo calculado"
                    : "artículos calculados"}
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400 hidden md:inline">
                  Simulación de costos y precios finalizada
                </span>
              </div>

              {/* Botones de Acción: Copiar Precios, Descargar CSV y Memorizar Aprendizaje */}
              <div className="flex flex-wrap items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={handleResetInvoice}
                  className="py-3 px-4 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/60 dark:hover:bg-rose-900/80 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800/70 transition active:scale-95 cursor-pointer"
                  title="Limpiar todos los datos y reiniciar para procesar una nueva factura"
                >
                  <RotateCcw className="w-4 h-4 text-rose-500 dark:text-rose-400" />
                  <span>Limpiar Factura</span>
                </button>

                <button
                  type="button"
                  onClick={handleCopySummary}
                  className="py-3 px-4 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700 transition active:scale-95 cursor-pointer"
                  title="Copiar tabla de precios calculados al portapapeles"
                >
                  <Copy className="w-4 h-4" />
                  <span>Copiar Precios</span>
                </button>

                <button
                  type="button"
                  onClick={handleExportCSV}
                  className="py-3 px-4 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700 transition active:scale-95 cursor-pointer"
                  title="Descargar archivo CSV con la simulación completa"
                >
                  <Download className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                  <span>Descargar CSV</span>
                </button>

                <button
                  type="button"
                  onClick={handleApplyToInventory}
                  disabled={isApplying || items.length === 0}
                  className={`py-3 px-4 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 border transition active:scale-95 cursor-pointer ${
                    isApplying
                      ? "bg-slate-200 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-400 cursor-not-allowed"
                      : "bg-emerald-600 hover:bg-emerald-500 border-emerald-500/80 text-white shadow-lg shadow-emerald-600/30"
                  }`}
                  title="Revisar y conciliar productos con el POS con doble confirmación antes de actualizar inventario"
                >
                  {isApplying ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin text-white" />
                      <span>Aplicando...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4 text-white" />
                      <span>Aplicar al Inventario POS</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Banner Informativo de Roles y Módulos */}
          {items.length > 0 && (
            <div className="bg-slate-100/90 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800/80 p-3.5 rounded-xl flex items-center gap-3 text-xs text-slate-700 dark:text-slate-400">
              <HelpCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span>
                <strong>Módulo de Simulación y Cálculo de Precios:</strong> Este
                espacio calcula costos, desglosa impuestos y proyecta precios
                sugeridos según las reglas de Fruver. Para modificar precios en
                el inventario utiliza <strong>Edición Masiva</strong> o{" "}
                <strong>Consulta y Precio</strong>, y para dar de alta nuevos
                productos usa <strong>Catálogo / Crear</strong>.
              </span>
            </div>
          )}

          {/* MODAL DESGLOSE MATEMÁTICO */}
          {selectedItemForBreakdown && (
            <div
              role="dialog"
              aria-modal="true"
              className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5"
              onClick={() => setSelectedItemForBreakdown(null)}
            >
              <div
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-lg max-h-[88vh] flex flex-col shadow-2xl overflow-hidden"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 p-4 shrink-0 bg-slate-50 dark:bg-slate-950/80">
                  <h4 className="font-bold text-slate-900 dark:text-white flex items-center gap-2 text-sm sm:text-base">
                    <DollarSign className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    Desglose de Costos y Precio de Venta
                  </h4>
                  <button
                    type="button"
                    onClick={() => setSelectedItemForBreakdown(null)}
                    className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition cursor-pointer"
                    aria-label="Cerrar modal"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="p-4 sm:p-5 overflow-y-auto custom-scrollbar flex-1 space-y-4 text-xs">
                  <div className="p-3 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800">
                    <span className="text-slate-500 dark:text-slate-400 block text-[11px]">
                      Artículo:
                    </span>
                    <span className="font-bold text-slate-900 dark:text-white text-sm">
                      {selectedItemForBreakdown.descripcion}
                    </span>
                  </div>

                  <div className="space-y-2 font-mono">
                    <div className="flex justify-between p-2 rounded bg-slate-50 dark:bg-slate-950/60 border border-slate-100 dark:border-slate-800/40">
                      <span className="text-slate-600 dark:text-slate-400">
                        Costo Presentación / Unitario:
                      </span>
                      <span className="text-slate-900 dark:text-white font-bold">
                        $
                        {(
                          selectedItemForBreakdown.costo_presentacion || 0
                        ).toLocaleString("es-CO")}
                      </span>
                    </div>

                    <div className="flex justify-between p-2 rounded bg-slate-50 dark:bg-slate-950/60 border border-slate-100 dark:border-slate-800/40">
                      <span className="text-slate-600 dark:text-slate-400">
                        Cantidad Comprada:
                      </span>
                      <span className="text-slate-900 dark:text-white font-bold">
                        {selectedItemForBreakdown.cantidad || 1}{" "}
                        {selectedItemForBreakdown.presentacion || "UND"}
                        {parseFloat(
                          selectedItemForBreakdown.unidades_por_presentacion,
                        ) > 1 && (
                          <span className="text-emerald-600 dark:text-emerald-400 font-normal text-[11px] ml-1">
                            (
                            {(selectedItemForBreakdown.cantidad || 1) *
                              parseFloat(
                                selectedItemForBreakdown.unidades_por_presentacion,
                              )}{" "}
                            unidades)
                          </span>
                        )}
                      </span>
                    </div>

                    <div className="flex justify-between p-2 rounded bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800">
                      <span className="text-slate-700 dark:text-slate-300">
                        Valor Compra (Sin Impuestos):
                      </span>
                      <span className="text-teal-600 dark:text-teal-300 font-bold">
                        $
                        {Math.round(
                          selectedItemForBreakdown.valor_compra_sin_impuestos ||
                            selectedItemForBreakdown.costo_presentacion *
                              selectedItemForBreakdown.cantidad ||
                            0,
                        ).toLocaleString("es-CO")}
                      </span>
                    </div>

                    <div className="flex justify-between p-2 rounded bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800">
                      <span className="text-slate-700 dark:text-slate-300">
                        Valor Compra (Con Impuestos):
                      </span>
                      <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                        $
                        {Math.round(
                          selectedItemForBreakdown.valor_compra_con_impuestos ||
                            0,
                        ).toLocaleString("es-CO")}
                      </span>
                    </div>

                    {/* Desglose Individual de Impuestos */}
                    <div className="bg-slate-50 dark:bg-slate-950 p-3 rounded-xl border border-slate-200 dark:border-slate-800/80 space-y-2">
                      <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block font-sans">
                        Desglose Individual de Impuestos ($):
                      </span>
                      {(selectedItemForBreakdown.impuestos_detallados &&
                      selectedItemForBreakdown.impuestos_detallados.length > 0
                        ? selectedItemForBreakdown.impuestos_detallados
                        : [
                            {
                              name: "Exento (0%)",
                              rate: 0,
                              valor_unitario: 0,
                              valor_total: 0,
                            },
                          ]
                      ).map((t, idx) => (
                        <div
                          key={idx}
                          className="flex justify-between items-center text-[11px] border-b border-slate-200 dark:border-slate-900 pb-1.5"
                        >
                          <div>
                            <span className="text-slate-800 dark:text-slate-300 font-bold">
                              {t.name || t.label}
                            </span>
                            <span className="text-[10px] text-slate-500 block">
                              Base: $
                              {Math.round(t.base_linea || 0).toLocaleString(
                                "es-CO",
                              )}
                            </span>
                          </div>
                          <div className="text-right">
                            <span className="text-[10px] text-slate-500 dark:text-slate-400 mr-2">
                              u: $
                              {Math.round(t.valor_unitario || 0).toLocaleString(
                                "es-CO",
                              )}
                            </span>
                            <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                              tot: $
                              {Math.round(t.valor_total || 0).toLocaleString(
                                "es-CO",
                              )}
                            </span>
                          </div>
                        </div>
                      ))}
                      <div className="flex justify-between items-center text-[11px] pt-1 font-bold">
                        <span className="text-amber-600 dark:text-amber-300">
                          Total Impuestos Línea:
                        </span>
                        <span className="text-amber-600 dark:text-amber-300">
                          $
                          {Math.round(
                            selectedItemForBreakdown.monto_impuesto_total || 0,
                          ).toLocaleString("es-CO")}
                        </span>
                      </div>
                    </div>

                    <div className="flex justify-between p-2 rounded bg-slate-50 dark:bg-slate-950/60 border border-slate-100 dark:border-slate-800/40">
                      <span className="text-slate-600 dark:text-slate-400">
                        Costo Unitario Base:
                      </span>
                      <span className="text-slate-900 dark:text-white font-bold">
                        $
                        {(
                          selectedItemForBreakdown.costo_unitario_neto || 0
                        ).toLocaleString("es-CO")}
                      </span>
                    </div>

                    <div className="flex justify-between p-2 rounded bg-slate-50 dark:bg-slate-950/60 border border-slate-100 dark:border-slate-800/40">
                      <span className="text-slate-600 dark:text-slate-400">
                        Impuestos Aplicados:
                      </span>
                      <span className="text-amber-600 dark:text-amber-300 font-bold">
                        {(selectedItemForBreakdown.impuestos || [])
                          .map((t) => t.name)
                          .join(", ") || "Exento"}
                      </span>
                    </div>

                    <div className="flex justify-between p-2 rounded bg-slate-50 dark:bg-slate-950/60 border border-slate-100 dark:border-slate-800/40">
                      <span className="text-slate-600 dark:text-slate-400">
                        Costo Unitario Final (Con Impuestos):
                      </span>
                      <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                        $
                        {(
                          selectedItemForBreakdown.costo_unitario_final ||
                          selectedItemForBreakdown.costo_unitario_neto ||
                          0
                        ).toLocaleString("es-CO")}
                      </span>
                    </div>

                    <div className="flex justify-between p-2 rounded bg-slate-50 dark:bg-slate-950/60 border border-slate-100 dark:border-slate-800/40">
                      <span className="text-slate-600 dark:text-slate-400">Método de Margen:</span>
                      <span
                        className={`font-bold text-xs ${
                          selectedItemForBreakdown.metodo_margen === "sale"
                            ? "text-teal-600 dark:text-teal-400"
                            : "text-emerald-600 dark:text-emerald-400"
                        }`}
                      >
                        {selectedItemForBreakdown.metodo_margen === "sale"
                          ? "Sobre Venta (Utilidad Bruta)"
                          : "Sobre Costo (Markup)"}
                      </span>
                    </div>

                    <div className="flex justify-between p-2 rounded bg-slate-50 dark:bg-slate-950/60 border border-slate-100 dark:border-slate-800/40">
                      <span className="text-slate-600 dark:text-slate-400">
                        Margen Comercial Aplicado:
                      </span>
                      <span className="text-teal-600 dark:text-teal-400 font-bold">
                        {selectedItemForBreakdown.margen_ganancia}%
                      </span>
                    </div>

                    <div className="flex justify-between p-2 rounded bg-slate-50 dark:bg-slate-950/60 border border-slate-100 dark:border-slate-800/40">
                      <span className="text-slate-600 dark:text-slate-400">Fórmula Aplicada:</span>
                      <span className="text-amber-600 dark:text-amber-300 font-mono text-[11px] font-semibold">
                        {selectedItemForBreakdown.metodo_margen === "sale"
                          ? `Costo / (1 - ${(selectedItemForBreakdown.margen_ganancia || 0) / 100})`
                          : `Costo × (1 + ${(selectedItemForBreakdown.margen_ganancia || 0) / 100})`}
                      </span>
                    </div>

                    {parseFloat(
                      selectedItemForBreakdown.unidades_por_presentacion,
                    ) > 1 && (
                      <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2">
                        <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                          Comparativa Unidad vs Paquete (
                          {selectedItemForBreakdown.presentacion} x
                          {selectedItemForBreakdown.unidades_por_presentacion}{" "}
                          und)
                        </span>
                        <div className="grid grid-cols-2 gap-2">
                          <div
                            className={`p-2 rounded-lg border ${
                              selectedItemForBreakdown.modo_venta !== "paquete"
                                ? "bg-emerald-50 dark:bg-emerald-950/60 border-emerald-500/80"
                                : "bg-slate-100 dark:bg-slate-900 border-slate-200 dark:border-slate-800 opacity-60"
                            }`}
                          >
                            <span className="text-[10px] font-bold text-slate-600 dark:text-slate-400 block">
                              Venta x Unidad:
                            </span>
                            <span className="text-sm font-black text-emerald-600 dark:text-emerald-400">
                              $
                              {(
                                selectedItemForBreakdown.precio_venta_unidad ||
                                0
                              ).toLocaleString("es-CO")}
                            </span>
                            <span className="text-[9px] text-slate-500 dark:text-slate-400 block mt-0.5">
                              {selectedItemForBreakdown.modo_venta !== "paquete"
                                ? "✓ Activo en POS"
                                : "Inactivo"}
                            </span>
                          </div>

                          <div
                            className={`p-2 rounded-lg border ${
                              selectedItemForBreakdown.modo_venta === "paquete"
                                ? "bg-teal-50 dark:bg-teal-950/60 border-teal-500/80"
                                : "bg-slate-100 dark:bg-slate-900 border-slate-200 dark:border-slate-800 opacity-60"
                            }`}
                          >
                            <span className="text-[10px] font-bold text-slate-600 dark:text-slate-400 block">
                              Venta x Paquete:
                            </span>
                            <span className="text-sm font-black text-teal-600 dark:text-teal-400">
                              $
                              {(
                                selectedItemForBreakdown.precio_venta_paquete ||
                                0
                              ).toLocaleString("es-CO")}
                            </span>
                            <span className="text-[9px] text-slate-500 dark:text-slate-400 block mt-0.5">
                              {selectedItemForBreakdown.modo_venta === "paquete"
                                ? "✓ Activo en POS"
                                : "Inactivo"}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="flex justify-between p-2 rounded bg-slate-50 dark:bg-slate-950/60 border border-slate-100 dark:border-slate-800/40">
                      <span className="text-slate-600 dark:text-slate-400">
                        Precio Venta Exacto Matemático:
                      </span>
                      <span className="text-slate-700 dark:text-slate-300">
                        $
                        {(
                          selectedItemForBreakdown.precio_venta_calculado || 0
                        ).toLocaleString("es-CO")}
                      </span>
                    </div>

                    <div className="flex justify-between p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-500/40">
                      <span className="text-emerald-800 dark:text-emerald-300 font-bold">
                        Precio Activo Cobrado en POS:
                      </span>
                      <span className="text-emerald-700 dark:text-emerald-400 font-black text-sm">
                        $
                        {(
                          selectedItemForBreakdown.precio_venta_redondeado || 0
                        ).toLocaleString("es-CO")}{" "}
                        <span className="text-[10px] text-slate-500 dark:text-slate-400 font-normal">
                          (
                          {selectedItemForBreakdown.modo_venta === "paquete"
                            ? `x ${selectedItemForBreakdown.presentacion || "pqte"}`
                            : "x und"}
                          )
                        </span>
                      </span>
                    </div>
                  </div>
                </div>

                <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/80 shrink-0">
                  <button
                    type="button"
                    onClick={() => setSelectedItemForBreakdown(null)}
                    className="w-full py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-white rounded-xl text-xs font-bold transition cursor-pointer"
                  >
                    Cerrar Detalle
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Modal de Impuestos Personalizados y Gestión de Licores / Bebidas */}
          {customTaxModalItem && (
            <div
              role="dialog"
              aria-modal="true"
              className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-fade-in"
              onClick={() => setCustomTaxModalItem(null)}
            >
              <div
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/80 rounded-2xl w-full max-w-md max-h-[88vh] flex flex-col shadow-2xl overflow-hidden"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 p-4 shrink-0 bg-slate-50 dark:bg-slate-950/80">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      <Percent className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                      Gestor de Impuestos del Producto
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-[280px]">
                      {customTaxModalItem.descripcion ||
                        "Artículo seleccionado"}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setCustomTaxModalItem(null)}
                    className="text-slate-400 hover:text-slate-700 dark:hover:text-white p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="p-4 sm:p-5 overflow-y-auto custom-scrollbar flex-1 space-y-4">
                  {/* Impuestos actualmente activos en el producto */}
                <div>
                  <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-2">
                    Impuestos Activos en este Ítem
                  </label>
                  <div className="flex flex-wrap gap-1.5 min-h-[38px] p-2 bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 rounded-xl items-center">
                    {(!customTaxModalItem.impuestos ||
                      customTaxModalItem.impuestos.length === 0) && (
                      <span className="text-xs text-slate-400 dark:text-slate-500 italic py-1">
                        Sin impuestos (Exento)
                      </span>
                    )}
                    {(customTaxModalItem.impuestos || []).map((t, idx) => (
                      <span
                        key={idx}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200"
                      >
                        <span>{t.name || "Impuesto"}</span>
                        <span className="text-emerald-600 dark:text-emerald-400 font-mono">
                          {(parseFloat(t.rate) || 0) > 0
                            ? `+${Math.round(parseFloat(t.rate) * 100)}%`
                            : (parseFloat(t.fixed_amount || t.valor_fijo) ||
                                  0) > 0
                              ? `+$${Math.round(parseFloat(t.fixed_amount || t.valor_fijo)).toLocaleString("es-CO")}`
                              : "0%"}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            handleRemoveCustomTax(customTaxModalItem.id, t)
                          }
                          className="text-slate-400 hover:text-rose-500 ml-1 transition cursor-pointer"
                          title="Eliminar este impuesto"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </span>
                    ))}
                  </div>
                </div>

                {/* Plantillas Rápidas para Licores, Bebidas y Otros */}
                <div>
                  <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-1.5">
                    Plantillas Oficiales (Colombia)
                  </label>
                  <div className="grid grid-cols-2 gap-1.5 text-xs">
                    <button
                      type="button"
                      onClick={() =>
                        handleToggleItemTax(
                          customTaxModalItem.id,
                          TAX_OPTIONS_IPO_ADV[0],
                        )
                      }
                      className="p-2 rounded-xl bg-purple-50 dark:bg-purple-950/40 hover:bg-purple-100 dark:hover:bg-purple-900/60 border border-purple-200 dark:border-purple-500/40 text-purple-900 dark:text-purple-200 font-medium text-left flex flex-col transition cursor-pointer"
                    >
                      <span className="font-bold">IPO+ADV 25%</span>
                      <span className="text-[10px] text-purple-700 dark:text-purple-300/80">
                        Licores destilados (Aguardiente, Ron...)
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        handleToggleItemTax(
                          customTaxModalItem.id,
                          TAX_OPTIONS_IPO_ADV[1],
                        )
                      }
                      className="p-2 rounded-xl bg-purple-50 dark:bg-purple-950/40 hover:bg-purple-100 dark:hover:bg-purple-900/60 border border-purple-200 dark:border-purple-500/40 text-purple-900 dark:text-purple-200 font-medium text-left flex flex-col transition cursor-pointer"
                    >
                      <span className="font-bold">IPO+ADV 20%</span>
                      <span className="text-[10px] text-purple-700 dark:text-purple-300/80">
                        Vinos y aperitivos vínicos
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        handleToggleItemTax(
                          customTaxModalItem.id,
                          TAX_OPTIONS_ICUI[0],
                        )
                      }
                      className="p-2 rounded-xl bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 dark:hover:bg-amber-900/60 border border-amber-200 dark:border-amber-500/40 text-amber-900 dark:text-amber-200 font-medium text-left flex flex-col transition cursor-pointer"
                    >
                      <span className="font-bold">ICUI 20%</span>
                      <span className="text-[10px] text-amber-700 dark:text-amber-300/80">
                        Ultraprocesados 2025+
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        handleToggleItemTax(
                          customTaxModalItem.id,
                          TAX_OPTIONS_ICUI[1],
                        )
                      }
                      className="p-2 rounded-xl bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 dark:hover:bg-amber-900/60 border border-amber-200 dark:border-amber-500/40 text-amber-900 dark:text-amber-200 font-medium text-left flex flex-col transition cursor-pointer"
                    >
                      <span className="font-bold">ICUI 15%</span>
                      <span className="text-[10px] text-amber-700 dark:text-amber-300/80">
                        Ultraprocesados 2024
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        handleToggleItemTax(
                          customTaxModalItem.id,
                          TAX_OPTIONS_ICUI[2],
                        )
                      }
                      className="p-2 rounded-xl bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 dark:hover:bg-amber-900/60 border border-amber-200 dark:border-amber-500/40 text-amber-900 dark:text-amber-200 font-medium text-left flex flex-col transition cursor-pointer"
                    >
                      <span className="font-bold">ICUI 10%</span>
                      <span className="text-[10px] text-amber-700 dark:text-amber-300/80">
                        Ultraprocesados 2023
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        handleToggleItemTax(
                          customTaxModalItem.id,
                          TAX_OPTIONS_INC[0],
                        )
                      }
                      className="p-2 rounded-xl bg-sky-50 dark:bg-sky-950/40 hover:bg-sky-100 dark:hover:bg-sky-900/60 border border-sky-200 dark:border-sky-500/40 text-sky-900 dark:text-sky-200 font-medium text-left flex flex-col transition cursor-pointer"
                    >
                      <span className="font-bold">INC 8%</span>
                      <span className="text-[10px] text-sky-700 dark:text-sky-300/80">
                        Impuesto Nacional al Consumo
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        handleToggleItemTax(
                          customTaxModalItem.id,
                          TAX_OPTIONS_IVA[1],
                        )
                      }
                      className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 border border-emerald-200 dark:border-emerald-500/40 text-emerald-900 dark:text-emerald-200 font-medium text-left flex flex-col transition cursor-pointer"
                    >
                      <span className="font-bold">IVA 5%</span>
                      <span className="text-[10px] text-emerald-700 dark:text-emerald-300/80">
                        Tarifa reducida legal
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        handleToggleItemTax(
                          customTaxModalItem.id,
                          TAX_OPTIONS_IVA[0],
                        )
                      }
                      className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 border border-emerald-200 dark:border-emerald-500/40 text-emerald-900 dark:text-emerald-200 font-medium text-left flex flex-col transition cursor-pointer"
                    >
                      <span className="font-bold">IVA 19%</span>
                      <span className="text-[10px] text-emerald-700 dark:text-emerald-300/80">
                        Tarifa general
                      </span>
                    </button>
                  </div>
                </div>

                {/* Formulario para agregar Cualquier Impuesto Personalizado */}
                <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-2">
                  <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                    Agregar Impuesto Personalizado o Recargo en $
                  </label>
                  <div className="grid grid-cols-12 gap-2">
                    <input
                      type="text"
                      value={customTaxForm.name}
                      onChange={(e) =>
                        setCustomTaxForm((f) => ({
                          ...f,
                          name: e.target.value,
                        }))
                      }
                      placeholder="Ej. IPO Específico, IBUA, Bolsas"
                      className="col-span-6 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-purple-500"
                    />
                    <select
                      value={customTaxForm.type}
                      onChange={(e) =>
                        setCustomTaxForm((f) => ({
                          ...f,
                          type: e.target.value,
                        }))
                      }
                      className="col-span-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-2 py-1.5 text-xs text-slate-800 dark:text-slate-300 focus:outline-none"
                    >
                      <option value="percent">Tasa %</option>
                      <option value="fixed">Valor $</option>
                    </select>
                    <input
                      type="number"
                      step="any"
                      value={customTaxForm.value}
                      onChange={(e) =>
                        setCustomTaxForm((f) => ({
                          ...f,
                          value: e.target.value,
                        }))
                      }
                      placeholder={
                        customTaxForm.type === "percent" ? "Ej. 16" : "Ej. 3500"
                      }
                      className="col-span-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-2 py-1.5 text-xs text-slate-900 dark:text-white font-mono focus:outline-none focus:border-purple-500 text-right"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleAddCustomTax}
                    className="w-full mt-1 bg-purple-600 hover:bg-purple-500 text-white font-bold py-2 rounded-xl text-xs transition shadow-lg shadow-purple-600/30 flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Aplicar Impuesto al Ítem
                  </button>
                </div>
              </div>

                <div className="flex justify-end p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/80 shrink-0">
                  <button
                    type="button"
                    onClick={() => setCustomTaxModalItem(null)}
                    className="px-5 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs font-bold dark:text-white transition cursor-pointer"
                  >
                    Listo
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Modal de confirmación para margen global (% para todos o algunos como en sistema_fruver) */}
          <GlobalProfitMarginModal
            isOpen={showMarginModal}
            targetMargin={targetGlobalMargin}
            currentMargin={globalMargin}
            totalProducts={items.length}
            manualCount={items.filter((it) => it.is_manual_margin).length}
            onApplyToAll={handleApplyMarginToAll}
            onApplyToNonManual={handleApplyMarginToNonManual}
            onCancel={() => setShowMarginModal(false)}
          />

          {/* Modal Asistente QR DIAN / Catálogo VPFE */}
          <DianQRAssistantModal
            isOpen={isDianModalOpen}
            onClose={() => setIsDianModalOpen(false)}
            onInvoiceExtracted={handleDianInvoiceExtracted}
            onShowToast={onShowToast}
            currentFile={selectedFile}
          />

          {/* Modal de Doble Confirmación & Conciliación POS */}
          <InvoiceReconciliationModal
            isOpen={isReconciliationModalOpen}
            onClose={() => setIsReconciliationModalOpen(false)}
            items={items}
            supplierName={supplierName}
            invoiceNumber={invoiceNumber}
            onConfirm={handleExecuteApplyInvoice}
            isApplying={isApplying}
          />
        </>
      )}
    </div>
  );
}

