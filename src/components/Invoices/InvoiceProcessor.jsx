import React, { useState, useRef, useEffect } from "react";
import {
  Receipt,
  FileText,
  Camera,
  UploadCloud,
  CheckCircle2,
  AlertCircle,
  Trash2,
  Plus,
  RefreshCw,
  Sliders,
  Percent,
  DollarSign,
  Building2,
  Calendar,
  Hash,
  ArrowRight,
  Eye,
  HelpCircle,
  Check,
  X,
  Sparkles,
  History,
  Tag,
  Package,
  Boxes,
  ExternalLink,
  RotateCw,
  FileCode,
  Copy,
  Download,
  RotateCcw,
  Barcode,
  QrCode,
} from "lucide-react";
import {
  invoiceService,
  catalogService,
  redondearCentenaCercana,
} from "../../services/api";
import { useLoading } from "../../context/LoadingContext";
import GlobalProfitMarginModal from "../common/GlobalProfitMarginModal";
import DianQRAssistantModal from "./DianQRAssistantModal";

const normalizeDateInput = (str) => {
  if (!str) return new Date().toISOString().split("T")[0];
  const s = String(str).trim();
  const mIso = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  if (mIso) {
    const [, y, m, d] = mIso;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  const mDmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
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

  useEffect(() => {
    if (!isFocused) {
      setDisplayValue(formatCOP(value));
    }
  }, [value, isFocused]);

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

  // OCR Vision Engine Selector: 'auto' (Híbrido), 'server' (PP-OCRv4 Server), 'rapid_table' (SLANet Tablas), 'gemini' (Nube), 'qr_dian' (DIAN QR), 'pdf' (PDF DIAN)
  const [ocrProvider, setOcrProvider] = useState("auto");
  const [isDianModalOpen, setIsDianModalOpen] = useState(false);

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
    } catch (e) {
      return "cost";
    }
  });
  // 'unidad' = Venta por Unidad suelta (Por defecto) | 'paquete' = Venta por Paquete/Presentación completa
  const [defaultSaleMode, setDefaultSaleMode] = useState(() => {
    try {
      return localStorage.getItem("fruver_default_sale_mode") || "unidad";
    } catch (e) {
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

  // Learning state
  const [isLearning, setIsLearning] = useState(false);

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

  const TAX_OPTIONS = [
    ...TAX_OPTIONS_IVA,
    ...TAX_OPTIONS_IPO_ADV,
    ...TAX_OPTIONS_ICUI,
    ...TAX_OPTIONS_INC,
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
    // Costo de compra de la presentación/empaque
    const presCost = parseFloat(item.costo_presentacion) || 0;
    const discount = Math.max(0, parseFloat(item.descuento) || 0);
    const discountFactor =
      discount > 0 && discount <= 100 ? 1.0 - discount / 100.0 : 1.0;
    const presCostDiscounted = presCost * discountFactor;
    const margin = parseFloat(item.margen_ganancia) ?? globalMargin;

    // Sum tax rates & fixed amounts
    const taxes = Array.isArray(item.impuestos) ? item.impuestos : [];
    const totalTaxRate = taxes.reduce(
      (sum, t) => sum + (parseFloat(t.rate) || 0),
      0,
    );
    const totalFixedTax = taxes.reduce(
      (sum, t) => sum + (parseFloat(t.fixed_amount || t.valor_fijo) || 0),
      0,
    );

    let presCostWithoutTax = presCostDiscounted;
    let taxPerPres = 0;

    if (vatIncluded) {
      // presCost already includes tax
      const divisor = 1 + totalTaxRate;
      presCostWithoutTax =
        divisor > 0
          ? Math.max(0, (presCostDiscounted - totalFixedTax) / divisor)
          : presCostDiscounted;
      taxPerPres = presCostDiscounted - presCostWithoutTax;
    } else {
      // presCost is before tax
      taxPerPres = presCostWithoutTax * totalTaxRate + totalFixedTax;
    }

    const presCostWithTax = presCostWithoutTax + taxPerPres;

    // Desglose matemático exacto de cada impuesto individual ($ unitario y total línea)
    const detailedTaxes = taxes.map((t) => {
      const rate = parseFloat(t.rate) || 0;
      const fixed = parseFloat(t.fixed_amount || t.valor_fijo) || 0;
      const unitTax = presCostWithoutTax * rate + fixed;
      const lineTax = unitTax * qty;
      return {
        ...t,
        rate,
        fixed_amount: fixed,
        base_unitaria: Math.round(presCostWithoutTax * 100) / 100,
        base_linea: Math.round(presCostWithoutTax * qty * 100) / 100,
        valor_unitario: Math.round(unitTax * 100) / 100,
        valor_total: Math.round(lineTax * 100) / 100,
      };
    });

    // Costo unitario neto para la pieza individual de inventario
    // Regla Fruver: costo presentación / unidades por empaque
    const unitCostNet = presCostWithoutTax / unitsPerPack;
    const unitCostFinal = presCostWithTax / unitsPerPack;

    // Totales de la línea de factura
    // Totales y Valor de Compra de la línea
    const valorCompraSinImpuestos =
      Math.round(presCostWithoutTax * qty * 100) / 100;
    const totalLineTax = detailedTaxes.reduce(
      (sum, t) => sum + (t.valor_total || 0),
      0,
    );
    const valorCompraConImpuestos =
      Math.round((valorCompraSinImpuestos + totalLineTax) * 100) / 100;

    // Opción de sumar o no impuestos en el valor de compra (por ítem o global)
    const includeTaxInPurchase =
      item.incluir_impuestos_valor_compra !== undefined
        ? Boolean(item.incluir_impuestos_valor_compra)
        : Boolean(defaultIncludeTaxInPurchase);

    const valorCompraCalculado = includeTaxInPurchase
      ? valorCompraConImpuestos
      : valorCompraSinImpuestos;

    const lineSubtotal = presCost * qty;

    // 1. Precio de Venta por UNIDAD (individual)
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
      descuento: discount,
      costo_presentacion: presCost,
      costo_presentacion_con_iva: Math.round(presCostWithTax * 100) / 100,
      subtotal_linea: Math.round(lineSubtotal * 100) / 100,
      costo_unitario_neto: Math.round(unitCostNet * 100) / 100,
      costo_unitario_final: Math.round(unitCostFinal * 100) / 100,
      monto_impuesto_total: Math.round(totalLineTax * 100) / 100,

      // Desglose de cada impuesto individual ($)
      impuestos_detallados: detailedTaxes,

      // Valor de compra calculado y su selector de impuestos
      incluir_impuestos_valor_compra: includeTaxInPurchase,
      valor_compra_sin_impuestos: valorCompraSinImpuestos,
      valor_compra_con_impuestos: valorCompraConImpuestos,
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

    setSelectedFile(file);
    setImageRotation(0);
    setIsXmlFile(isXml);

    if (isXml) {
      setImagePreview(null);
    } else {
      const reader = new FileReader();
      reader.onload = (e) => setImagePreview(e.target.result);
      reader.readAsDataURL(file);
    }
  };

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
    setSelectedFile(null);
    setImagePreview(null);
    setImageRotation(0);
    setIsXmlFile(false);
    setIsProcessing(false);
    setProcessingStatusText("");
    setSupplierName("");
    setInvoiceNumber("");
    setInvoiceDate(new Date().toISOString().split("T")[0]);
    setVisionProviderUsed("");
    setConfidenceScore(null);
    setItems([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (cameraInputRef.current) cameraInputRef.current.value = "";
    onShowToast?.({
      type: "info",
      title: "Factura Limpiada",
      message: "Listo para cargar una nueva factura o imagen.",
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

    setIsProcessing(true);
    setProcessingStatusText(
      "Analizando imagen y extrayendo datos con Inteligencia Artificial...",
    );
    showLoader({
      title: "Analizando Documento con IA",
      message: "Extrayendo líneas de productos, proveedor, NIT y totales...",
      submessage:
        "Modelos neuronales SLANet y PaddleOCR-VL detectando tablas...",
      iconType: "sparkles",
    });

    try {
      const res = await invoiceService.processImage(selectedFile, {
        provider: ocrProvider,
        signal: abortControllerRef.current.signal,
      });

      console.log("Respuesta recibida del backend para la factura:", res);

      const calculatedItems = loadInvoiceDataIntoState(res);

      onShowToast?.({
        type: "success",
        title: "Factura Procesada con Éxito",
        message: `Se identificaron ${calculatedItems.length} artículos (${res.motor_utilizado || res.provider_used || "IA"}).`,
      });
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
        descuento: parseFloat(item.descuento) || 0,
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

  // Update specific item field
  const handleUpdateItem = (id, field, value) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        const isManualMargin =
          field === "margen_ganancia"
            ? true
            : (item.is_manual_margin ?? false);
        const updated = {
          ...item,
          [field]: value,
          is_manual_margin: isManualMargin,
        };
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

  // Alternar si el Valor de la Compra suma o no impuestos para todas las filas
  const handleToggleAllTaxInPurchaseValue = (includeTax) => {
    setDefaultIncludeTaxInPurchaseValue(includeTax);
    setItems((prev) =>
      prev.map((item) => {
        const updated = {
          ...item,
          incluir_impuestos_valor_compra: includeTax,
        };
        return recalculateItem(
          updated,
          isVatIncluded,
          marginMethod,
          includeTax,
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

  // Guardar retroalimentación en la Memoria Adaptativa Continua (Plantillas y Alias)
  const handleLearnFeedback = async () => {
    if (!supplierName || items.length === 0) {
      onShowToast?.({
        type: "warning",
        title: "Sin datos para memorizar",
        message: "Debe haber un proveedor y al menos un producto en la tabla.",
      });
      return;
    }

    setIsLearning(true);
    showLoader({
      title: "Actualizando Memoria Adaptativa",
      message: `Memorizando estructura y productos de "${supplierName}"...`,
      submessage: "Optimizando reconocimiento y alias para futuras facturas...",
      iconType: "layers",
    });
    try {
      const feedbackPayload = {
        provider_name: supplierName,
        provider_nit: null,
        orientation: imageRotation || 0,
        layout_type: "table",
        items: items.map((it) => ({
          raw_description: it.descripcion,
          canonical_name: it.canonical_name || it.descripcion,
          barcode: it.codigo_barras ? String(it.codigo_barras).trim() : null,
          presentation: it.presentacion || "Und",
          units_per_presentation: parseFloat(it.unidades_por_presentacion) || 1,
          margin: parseFloat(it.margen_ganancia) || 30.0,
        })),
      };

      const res = await invoiceService.learnInvoiceFeedback(feedbackPayload);
      onShowToast?.({
        type: "success",
        title: "¡Memoria Adaptativa Actualizada!",
        message:
          res.message ||
          `Estructura de "${supplierName}" y ${res.aliases_updated || items.length} productos memorizados para próximas lecturas.`,
      });
    } catch (err) {
      console.error("Error saving learning feedback:", err);
      onShowToast?.({
        type: "error",
        title: "Error al Memorizar",
        message:
          err.response?.data?.detail ||
          err.message ||
          "No se pudo guardar la plantilla en memoria.",
      });
    } finally {
      setIsLearning(false);
      hideLoader();
    }
  };

  // Fetch invoice history
  const loadInvoiceHistory = async () => {
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
  };

  useEffect(() => {
    if (activeSubView === "history") {
      loadInvoiceHistory();
    }
  }, [activeSubView]);

  return (
    <div className="space-y-6">
      {/* Top Header & View Switcher */}
      <div className="bg-slate-900/80 border border-slate-800 p-4 sm:p-5 rounded-2xl shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center shadow-lg shadow-emerald-600/20 ring-1 ring-emerald-400/30">
            <Receipt className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white flex items-center gap-2">
              Lector de Facturas & OCR Inteligente
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                IA Multimodal
              </span>
            </h1>
            <p className="text-xs sm:text-sm text-slate-400">
              Extracción automática de costos, cálculo dinámico de impuestos,
              presentaciones y precios de venta.
            </p>
          </div>
        </div>

        {/* View Switcher Tabs */}
        <div className="flex items-center gap-1.5 bg-slate-950 p-1.5 rounded-xl border border-slate-800 self-start sm:self-auto">
          <button
            onClick={() => setActiveSubView("process")}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              activeSubView === "process"
                ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/30"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Procesar Factura</span>
          </button>
          <button
            onClick={() => setActiveSubView("history")}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              activeSubView === "history"
                ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/30"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>Historial Registrado</span>
          </button>
        </div>
      </div>

      {activeSubView === "history" ? (
        /* HISTORIAL DE FACTURAS REGISTRADAS */
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-xl">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <History className="w-5 h-5 text-emerald-400" />
              Facturas Aplicadas Previamente
            </h3>
            <button
              onClick={loadInvoiceHistory}
              disabled={isLoadingHistory}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition"
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
                    <tr className="border-b border-slate-800 text-slate-400 uppercase tracking-wider bg-slate-950/40">
                      <th className="p-3">Factura #</th>
                      <th className="p-3">Proveedor</th>
                      <th className="p-3">Fecha</th>
                      <th className="p-3 text-right">Items</th>
                      <th className="p-3 text-right">Total Factura</th>
                      <th className="p-3 text-center">Estado</th>
                      <th className="p-3 text-right">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {historyList.map((inv) => (
                      <tr
                        key={inv.id}
                        className="hover:bg-slate-800/40 transition"
                      >
                        <td className="p-3 font-mono font-bold text-emerald-400">
                          {inv.invoice_number}
                        </td>
                        <td className="p-3 font-semibold text-white">
                          {inv.supplier_name}
                        </td>
                        <td className="p-3 text-slate-400">
                          {inv.invoice_date || "—"}
                        </td>
                        <td className="p-3 text-right text-slate-300">
                          {inv.items_count || 0}
                        </td>
                        <td className="p-3 text-right font-mono font-semibold text-white">
                          ${(inv.total_amount || 0).toLocaleString("es-CO")}
                        </td>
                        <td className="p-3 text-center">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-950/80 text-emerald-300 border border-emerald-800/60">
                            {inv.status || "APLICADO"}
                          </span>
                        </td>
                        <td className="p-3 text-right whitespace-nowrap space-x-1.5">
                          <button
                            onClick={() => setSelectedHistoryInvoice(inv)}
                            className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition inline-flex items-center gap-1 text-[11px]"
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
                              } catch (err) {
                                onShowToast?.({
                                  type: "error",
                                  title: "Error",
                                  message: "No se pudo generar el PDF.",
                                });
                              }
                            }}
                            className="px-2 py-1 rounded bg-rose-950/60 hover:bg-rose-900/60 text-rose-300 border border-rose-800/50 transition inline-flex items-center gap-1 text-[11px]"
                            title="Descargar PDF"
                          >
                            <Download className="w-3 h-3 text-rose-400" />
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
                              } catch (err) {
                                onShowToast?.({
                                  type: "error",
                                  title: "Error",
                                  message: "No se pudo generar el Excel.",
                                });
                              }
                            }}
                            className="px-2 py-1 rounded bg-emerald-950/60 hover:bg-emerald-900/60 text-emerald-300 border border-emerald-800/50 transition inline-flex items-center gap-1 text-[11px]"
                            title="Descargar Excel"
                          >
                            <FileText className="w-3 h-3 text-emerald-400" />
                            <span>Excel</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* 2. VISTA DE TARJETAS FLUIDAS PARA MÓVILES Y TABLETS */}
              <div className="block lg:hidden divide-y divide-slate-800">
                {historyList.map((inv) => (
                  <div
                    key={inv.id}
                    className="p-4 space-y-3 hover:bg-slate-800/20 transition"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-emerald-400 text-sm">
                          #{inv.invoice_number || inv.id}
                        </span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-950/80 text-emerald-300 border border-emerald-800/60">
                          {inv.status || "APLICADO"}
                        </span>
                      </div>
                      <span className="text-xs text-slate-400 font-mono">
                        {inv.invoice_date || "—"}
                      </span>
                    </div>

                    <div>
                      <h4 className="font-bold text-white text-sm sm:text-base leading-snug">
                        {inv.supplier_name}
                      </h4>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {inv.items_count || 0}{" "}
                        {inv.items_count === 1 ? "artículo" : "artículos"}{" "}
                        registrados
                      </p>
                    </div>

                    {/* Banner Monto Total y Botones de Acción */}
                    <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                      <div className="flex flex-col">
                        <span className="text-[9px] uppercase font-semibold text-slate-400">
                          Total Factura
                        </span>
                        <span className="text-lg font-black font-mono text-emerald-400">
                          ${(inv.total_amount || 0).toLocaleString("es-CO")}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 self-end sm:self-auto">
                        <button
                          onClick={() => setSelectedHistoryInvoice(inv)}
                          className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold inline-flex items-center gap-1 border border-slate-700 transition"
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
                            } catch (err) {
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
                            } catch (err) {
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
            <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl">
                <div className="p-4 border-b border-slate-800 flex items-center justify-between">
                  <h4 className="font-bold text-white flex items-center gap-2">
                    <Receipt className="w-4 h-4 text-emerald-400" />
                    Detalle Factura: {selectedHistoryInvoice.invoice_number}
                  </h4>
                  <button
                    onClick={() => setSelectedHistoryInvoice(null)}
                    className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <div className="p-5 overflow-y-auto space-y-4 text-xs">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-950 p-3 rounded-xl border border-slate-800">
                    <div>
                      <span className="text-slate-500 block">Proveedor:</span>
                      <span className="font-bold text-white">
                        {selectedHistoryInvoice.supplier_name}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Fecha:</span>
                      <span className="font-semibold text-slate-300">
                        {selectedHistoryInvoice.invoice_date}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Subtotal:</span>
                      <span className="font-mono text-slate-300">
                        $
                        {(
                          selectedHistoryInvoice.subtotal_amount || 0
                        ).toLocaleString("es-CO")}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Total:</span>
                      <span className="font-mono font-bold text-emerald-400">
                        $
                        {(
                          selectedHistoryInvoice.total_amount || 0
                        ).toLocaleString("es-CO")}
                      </span>
                    </div>
                  </div>
                  <div>
                    <h5 className="font-semibold text-slate-300 mb-2">
                      Artículos Registrados:
                    </h5>
                    <div className="space-y-2">
                      {(selectedHistoryInvoice.items || []).map((itm, i) => (
                        <div
                          key={i}
                          className="flex items-center justify-between p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/80"
                        >
                          <div>
                            <span className="font-bold text-white block">
                              {itm.descripcion}
                            </span>
                            <span className="text-[11px] text-slate-400">
                              Cant: {itm.cantidad} ({itm.presentacion}) &bull;
                              Costo Unit: $
                              {(itm.costo_unitario_neto || 0).toLocaleString(
                                "es-CO",
                              )}
                            </span>
                          </div>
                          <div className="text-right font-mono">
                            <span className="text-emerald-400 font-bold block">
                              Venta: $
                              {(
                                itm.precio_venta_redondeado || 0
                              ).toLocaleString("es-CO")}
                            </span>
                            <span className="text-[10px] text-slate-400">
                              Margen: {itm.margen_ganancia}%
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="pt-3 mt-4 border-t border-slate-800 flex items-center justify-end gap-2">
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
                        } catch (err) {
                          onShowToast?.({
                            type: "error",
                            title: "Error",
                            message: "No se pudo generar el PDF.",
                          });
                        }
                      }}
                      className="px-3 py-1.5 rounded-lg bg-rose-950/70 hover:bg-rose-900/70 text-rose-300 border border-rose-800/60 transition flex items-center gap-1.5 text-xs font-semibold"
                    >
                      <Download className="w-3.5 h-3.5 text-rose-400" />
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
                        } catch (err) {
                          onShowToast?.({
                            type: "error",
                            title: "Error",
                            message: "No se pudo generar el Excel.",
                          });
                        }
                      }}
                      className="px-3 py-1.5 rounded-lg bg-emerald-950/70 hover:bg-emerald-900/70 text-emerald-300 border border-emerald-800/60 transition flex items-center gap-1.5 text-xs font-semibold"
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
          {/* 1. SECCIÓN DE CAPTURA Y SUBIDA */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Input / Drag & Drop Card */}
            <div className="lg:col-span-1 bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <UploadCloud className="w-5 h-5 text-emerald-400" />
                    Cargar Factura o Foto
                  </h3>
                  {(selectedFile || items.length > 0) && (
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
                      ? "border-emerald-500/60 bg-emerald-950/20"
                      : "border-slate-700 hover:border-emerald-500/50 bg-slate-950/50 hover:bg-slate-950"
                  }`}
                >

                  {isXmlFile && selectedFile ? (
                    <div className="flex flex-col items-center justify-center p-3 gap-2">
                      <div className="w-12 h-12 rounded-xl bg-emerald-950/80 border border-emerald-800/80 flex items-center justify-center text-emerald-400 shadow-inner">
                        <FileCode className="w-7 h-7" />
                      </div>
                      <span className="font-bold text-white text-xs text-center max-w-[200px] truncate block">
                        {selectedFile.name}
                      </span>
                      <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded-full border border-emerald-800/40">
                        Factura Electrónica DIAN XML
                      </span>
                    </div>
                  ) : imagePreview ? (
                    <div className="relative group flex items-center justify-center overflow-hidden p-2">
                      <img
                        src={imagePreview}
                        alt="Vista previa factura"
                        style={{ transform: `rotate(${imageRotation}deg)` }}
                        className="max-h-44 rounded-lg object-contain border border-slate-700 shadow-md transition-transform duration-200"
                      />
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition rounded-lg flex items-center justify-center gap-2">
                        <span className="text-xs text-white font-semibold">
                          Cambiar archivo
                        </span>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center text-slate-400">
                        <FileText className="w-6 h-6" />
                      </div>
                      <div className="space-y-1">
                        <span className="text-xs font-semibold text-emerald-400 block">
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
                    onClick={() => setIsDianModalOpen(true)}
                    className="flex-1 min-w-[140px] flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-md shadow-blue-900/30 text-xs font-bold transition cursor-pointer"
                    title="Escanear Código QR DIAN o Consultar en Catálogo VPFE Oficial"
                  >
                    <QrCode className="w-4 h-4 text-white" />
                    <span>Escanear QR DIAN</span>
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
                    className="flex-1 min-w-[130px] flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold transition cursor-pointer"
                  >
                    <Camera className="w-4 h-4 text-emerald-400" />
                    <span>Tomar Foto</span>
                  </label>
                  {imagePreview && (
                    <button
                      type="button"
                      onClick={() =>
                        setImageRotation((prev) => (prev + 90) % 360)
                      }
                      className="py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 text-xs font-semibold transition flex items-center gap-1.5"
                      title="Rotar imagen 90°"
                    >
                      <RotateCw className="w-3.5 h-3.5 text-emerald-400" />
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
                      }}
                      className="p-2.5 rounded-xl bg-rose-950/50 hover:bg-rose-900/50 text-rose-300 border border-rose-800/60 transition"
                      title="Quitar archivo"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* Selector de Motor de Visión OCR */}
              <div className="mt-4 p-3 bg-slate-950/70 border border-slate-800/80 rounded-xl space-y-1.5">
                <div className="flex items-center justify-between text-[11px] font-semibold text-slate-300">
                  <span className="flex items-center gap-1.5">
                    <Sliders className="w-3.5 h-3.5 text-emerald-400" />
                    Motor de Reconocimiento:
                  </span>
                  {ocrProvider === "auto" && (
                    <span className="text-[10px] text-emerald-400 font-medium px-1.5 py-0.5 rounded bg-emerald-950/60 border border-emerald-800/50">
                      Recomendado (Todos en Uno)
                    </span>
                  )}
                  {ocrProvider === "qr_dian" && (
                    <span className="text-[10px] text-blue-400 font-medium px-1.5 py-0.5 rounded bg-blue-950/60 border border-blue-800/50">
                      Oficial DIAN VPFE
                    </span>
                  )}
                </div>
                <select
                  value={ocrProvider}
                  onChange={(e) => setOcrProvider(e.target.value)}
                  disabled={isProcessing}
                  className="w-full bg-slate-900 border border-slate-700/80 rounded-lg px-2.5 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500 transition cursor-pointer"
                >
                  <option value="auto">
                    🌟 Motor Unificado (RapidOCR + RapidTable + PaddleOCR-VL 0.9B + Nube)
                  </option>
                  <option value="qr_dian">
                    📱 Código QR DIAN / Consulta Oficial VPFE (Máxima Fiabilidad)
                  </option>
                  <option value="pdf">
                    📄 PDF DIAN Digital (Desencriptación con NIT 40327379)
                  </option>
                  <option value="paddle_vl">
                    🧠 PaddleOCR-VL 0.9B ONNX (VLM Local en Proceso)
                  </option>
                  <option value="server">
                    ⚡ RapidOCR Server (PP-OCRv4 Server Local - Alta Precisión)
                  </option>
                  <option value="rapid_table">
                    📊 RapidTable (SLANet - Topología Matricial de Tablas)
                  </option>
                  <option value="gemini">
                    ☁️ Google Gemini 2.5 Flash (Visión Nube Multimodal)
                  </option>
                </select>
                <p className="text-[10px] text-slate-500 leading-tight">
                  {ocrProvider === "auto" &&
                    "Pipeline unificado cooperativo: velocidad instantánea con RapidOCR Server, rescate automático con PaddleOCR-VL 0.9B ONNX y validación estricta de pricing_engine.py."}
                  {ocrProvider === "qr_dian" &&
                    "Lectura de código QR oficial DIAN (resolución 000042) y consulta desatendida en el Catálogo VPFE Oficial con NIT receptor."}
                  {ocrProvider === "pdf" &&
                    "Extracción vectorial nativa de PDFs electrónicos oficiales de la DIAN, desencriptando automáticamente con el NIT del receptor en .env (40327379)."}
                  {ocrProvider === "paddle_vl" &&
                    "Document Parsing VLM de 0.9B parámetros ejecutado localmente vía ONNX. Ideal para facturas manuscritas, tickets arrugados o sin tabla."}
                  {ocrProvider === "server" &&
                    "Modelo Server PP-OCRv4 (~90MB). Máxima precisión en caracteres pequeños, códigos y precios densos."}
                  {ocrProvider === "rapid_table" &&
                    "Especializado en reconstrucción matricial de tablas y grillas complejas mediante SLANet."}
                  {ocrProvider === "gemini" &&
                    "Comprensión semántica multimodal directa de Gemini 2.5 Flash en la nube."}
                </p>
              </div>

              {/* Botón de Ejecución OCR */}
              <div className="mt-4">
                <button
                  type="button"
                  onClick={handleProcessImage}
                  disabled={!selectedFile || isProcessing}
                  className={`w-full py-3 px-4 rounded-xl font-bold text-sm flex items-center justify-center gap-2 shadow-lg transition ${
                    isProcessing
                      ? "bg-slate-800 text-slate-400 cursor-not-allowed"
                      : !selectedFile
                        ? "bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700/50"
                        : "bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-emerald-600/30"
                  }`}
                >
                  {isProcessing ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin text-emerald-400" />
                      <span>
                        {processingStatusText || "Extrayendo datos..."}
                      </span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      <span>Analizar y Extraer Productos</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Configuración Global y Datos de Cabecera */}
            <div className="lg:col-span-2 bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col justify-between">
              <div>
                <h3 className="text-base font-bold text-white mb-2 flex items-center gap-2">
                  <Sliders className="w-5 h-5 text-emerald-400" />
                  Parámetros Globales & Metadatos
                </h3>
                <p className="text-xs text-slate-400 mb-4">
                  Define cómo interpretar los impuestos y el margen comercial
                  para todos los artículos leídos.
                </p>

                {/* Selector de Método de Margen: Sobre Costo (Markup - Por Defecto) vs Sobre Venta (Utilidad Bruta) */}
                <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-white block">
                        Método de Cálculo del Precio de Venta
                      </span>
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded font-bold border ${
                          marginMethod === "cost"
                            ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
                            : "bg-teal-500/20 text-teal-300 border-teal-500/30"
                        }`}
                      >
                        {marginMethod === "cost"
                          ? "POR DEFECTO: Sobre Costo (Markup)"
                          : "ALTERNADO: Sobre Venta (Utilidad Bruta)"}
                      </span>
                    </div>
                    <span className="text-[11px] text-slate-400 block mt-1">
                      {marginMethod === "cost" ? (
                        <>
                          <strong className="text-emerald-400">
                            Markup sobre Costo:
                          </strong>{" "}
                          Precio = Costo Final × (1 + Margen %) &nbsp;
                          <span className="text-slate-500">
                            (Ej: $1.916 + 30% = $2.490 →{" "}
                            <strong className="text-white">$2.500</strong>)
                          </span>
                        </>
                      ) : (
                        <>
                          <strong className="text-teal-400">
                            Utilidad sobre Venta:
                          </strong>{" "}
                          Precio = Costo Final / (1 - Margen %) &nbsp;
                          <span className="text-slate-500">
                            (Ej: $1.916 / 0,70 = $2.737 →{" "}
                            <strong className="text-white">$2.700</strong>)
                          </span>
                        </>
                      )}
                    </span>
                  </div>

                  <div className="flex items-center p-1 bg-slate-900 border border-slate-700/80 rounded-xl shrink-0">
                    <button
                      type="button"
                      onClick={() => handleToggleMarginMethod("cost")}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                        marginMethod === "cost"
                          ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/30"
                          : "text-slate-400 hover:text-white"
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
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                        marginMethod === "sale"
                          ? "bg-teal-600 text-white shadow-md shadow-teal-600/30"
                          : "text-slate-400 hover:text-white"
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
                <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <Package className="w-4 h-4 text-emerald-400" />
                      <span className="text-xs font-bold text-white block">
                        Venta Predeterminada de Presentaciones & Multipacks
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded font-bold border bg-slate-800 text-slate-300 border-slate-700">
                        {defaultSaleMode === "unidad"
                          ? "Menudeo (Por Unidad Suelta)"
                          : "Empaque Cerrado (Por Paquete)"}
                      </span>
                    </div>
                    <span className="text-[11px] text-slate-400 block mt-1">
                      {defaultSaleMode === "unidad" ? (
                        <>
                          <strong className="text-emerald-400">
                            Por Unidad:
                          </strong>{" "}
                          Empaques de varias piezas se desglosan para cobrar al
                          cliente por pieza suelta.
                          <span className="text-slate-500">
                            {" "}
                            (Ej: Gansito x 10 → cobra $2.500 / und).
                          </span>
                        </>
                      ) : (
                        <>
                          <strong className="text-teal-400">
                            Por Paquete:
                          </strong>{" "}
                          Se cobra el paquete o caja completa sin desempacar.
                          <span className="text-slate-500">
                            {" "}
                            (Ej: Gansito x 10 → cobra $24.900 / caja).
                          </span>
                        </>
                      )}
                    </span>
                  </div>

                  <div className="flex items-center p-1 bg-slate-900 border border-slate-700/80 rounded-xl shrink-0">
                    <button
                      type="button"
                      onClick={() => handleToggleDefaultSaleMode("unidad")}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                        defaultSaleMode === "unidad"
                          ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/30"
                          : "text-slate-400 hover:text-white"
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
                          : "text-slate-400 hover:text-white"
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
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
                  <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
                    <div>
                      <span className="text-xs font-bold text-white block">
                        Criterio de Impuestos
                      </span>
                      <span className="text-[11px] text-slate-400 block">
                        {isVatIncluded
                          ? "Precios de factura traen IVA incluido"
                          : "Precios de factura son antes de IVA"}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleToggleVatIncluded(!isVatIncluded)}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        isVatIncluded ? "bg-emerald-600" : "bg-slate-700"
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
                  <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-white block">
                          Margen Ganancia Global
                        </span>
                        {items.filter((it) => it.is_manual_margin).length > 0 && (
                          <span
                            className="text-[9.5px] px-1.5 py-0.2 rounded font-bold bg-amber-950/80 text-amber-300 border border-amber-500/40"
                            title="Hay productos con margen manual personalizado"
                          >
                            {items.filter((it) => it.is_manual_margin).length} manuales
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 mt-1">
                        {[20, 25, 30, 35, 40].map((m) => (
                          <button
                            key={m}
                            type="button"
                            onClick={() => handleRequestGlobalMarginChange(m)}
                            className={`px-2 py-0.5 rounded text-[11px] font-bold transition cursor-pointer ${
                              globalMargin === m
                                ? "bg-emerald-600 text-white shadow-sm"
                                : "bg-slate-800 text-slate-400 hover:text-white"
                            }`}
                          >
                            {m}%
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1">
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
                        className="w-10 bg-transparent text-right text-xs font-bold text-emerald-400 focus:outline-none"
                      />
                      <span className="text-xs text-slate-400 font-bold">
                        %
                      </span>
                    </div>
                  </div>
                </div>

                {/* Metadatos de Factura Extraídos o Editables */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">
                      Proveedor
                    </label>
                    <div className="relative">
                      <Building2 className="w-3.5 h-3.5 absolute left-3 top-3 text-slate-500" />
                      <input
                        type="text"
                        value={supplierName}
                        onChange={(e) => setSupplierName(e.target.value)}
                        placeholder="Ej. BIMBO DE COLOMBIA S.A."
                        className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs font-semibold text-white focus:border-emerald-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">
                      Factura #
                    </label>
                    <div className="relative">
                      <Hash className="w-3.5 h-3.5 absolute left-3 top-3 text-slate-500" />
                      <input
                        type="text"
                        value={invoiceNumber}
                        onChange={(e) => setInvoiceNumber(e.target.value)}
                        placeholder="Ej. FE-84920"
                        className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono font-bold text-white focus:border-emerald-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">
                      Fecha de Factura
                    </label>
                    <div className="relative">
                      <Calendar className="w-3.5 h-3.5 absolute left-3 top-3 text-slate-500" />
                      <input
                        type="date"
                        value={invoiceDate}
                        onChange={(e) => setInvoiceDate(e.target.value)}
                        className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs font-semibold text-white focus:border-emerald-500 focus:outline-none"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Informative Rule Badge */}
              <div className="mt-4 p-3 rounded-xl bg-emerald-950/30 border border-emerald-800/40 flex items-start gap-2.5">
                <HelpCircle className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <div className="text-[11px] text-slate-300 leading-relaxed">
                  <span className="font-bold text-emerald-300">
                    Regla de Negocio Fruver:
                  </span>{" "}
                  Los costos se calculan sobre la unidad de inventario
                  dividiendo entre las piezas de la presentación (caja, display,
                  etc.). El precio de venta resultante se redondea
                  automáticamente a la centena más cercana (
                  <span className="text-emerald-400 font-mono font-bold">
                    $250 → $300
                  </span>
                  ,{" "}
                  <span className="text-emerald-400 font-mono font-bold">
                    $249 → $200
                  </span>
                  ).
                </div>
              </div>
            </div>
          </div>

          {/* 2. TABLA INTERACTIVA DE ARTÍCULOS REVISADOS */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Boxes className="w-5 h-5 text-emerald-400" />
                  Artículos Leídos y Configuración de Precios ({items.length})
                </h3>
                <p className="text-xs text-slate-400">
                  Verifica códigos de barras, unidades por presentación,
                  impuestos y el precio de venta final.
                </p>
              </div>

              <div className="flex items-center gap-2">
                {items.length > 0 && (
                  <button
                    type="button"
                    onClick={handleResetInvoice}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-950/50 hover:bg-rose-900/50 text-rose-300 border border-rose-800/50 text-xs font-semibold transition cursor-pointer"
                    title="Limpiar todos los productos y reiniciar para una nueva factura"
                  >
                    <RotateCcw className="w-3.5 h-3.5 text-rose-400" />
                    <span>Limpiar Factura</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleAddManualItem}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold transition"
                >
                  <Plus className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Agregar Fila Manual</span>
                </button>
                <button
                  type="button"
                  onClick={handleApplyGlobalMargin}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-950/60 hover:bg-emerald-900/60 text-emerald-300 border border-emerald-800/60 text-xs font-semibold transition"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Recalcular Todos</span>
                </button>
              </div>
            </div>

            {items.length === 0 ? (
              <div className="py-16 text-center text-slate-500 border border-dashed border-slate-800 rounded-xl">
                <Receipt className="w-12 h-12 mx-auto mb-2 opacity-30" />
                <p className="font-semibold text-slate-400">
                  No hay artículos para revisar.
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  Sube una foto de factura o agrega productos manualmente con el
                  botón superior.
                </p>
              </div>
            ) : (
              <>
                {/* 1. VISTA DE TABLA PARA ESCRITORIO (DESKTOP) */}
                <div className="hidden lg:block overflow-x-auto rounded-xl border border-slate-800/80 shadow-inner scrollbar-thin scrollbar-thumb-slate-700">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="sticky top-0 bg-slate-950 z-20 shadow-sm border-b border-slate-800">
                      <tr className="border-b border-slate-800 text-slate-400 uppercase tracking-wider bg-slate-950 text-[11px]">
                        <th className="p-2.5 w-10 text-center sticky left-0 z-30 bg-slate-950">
                          #
                        </th>
                        <th className="p-2.5 min-w-[190px] sticky left-10 z-30 bg-slate-950 shadow-[2px_0_5px_rgba(0,0,0,0.3)]">
                          Producto & Código
                        </th>
                        <th className="p-2.5 min-w-[115px] text-center">
                          Cant. & Empaque
                        </th>
                        <th className="p-2.5 min-w-[115px] text-right">
                          Costo Unitario
                        </th>
                        <th className="p-2.5 min-w-[95px] text-center">
                          <span>Descuento</span>
                          <span className="text-[9px] font-normal lowercase tracking-normal text-slate-400 block font-sans">
                            (% comercial)
                          </span>
                        </th>
                        <th className="p-2.5 min-w-[155px] text-right">
                          <div className="flex flex-col items-end gap-0.5">
                            <span>Valor Compra</span>
                            <div className="inline-flex items-center gap-0.5 bg-slate-900 border border-slate-800 rounded p-0.5 text-[8.5px] lowercase font-sans font-normal">
                              <button
                                type="button"
                                onClick={() =>
                                  handleToggleAllTaxInPurchaseValue(false)
                                }
                                className={`px-1.5 py-0.5 rounded transition cursor-pointer ${
                                  !defaultIncludeTaxInPurchaseValue
                                    ? "bg-slate-700 text-white font-bold"
                                    : "text-slate-400 hover:text-white"
                                }`}
                                title="Calcular Valor de Compra sin impuestos para todos"
                              >
                                sin imp
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  handleToggleAllTaxInPurchaseValue(true)
                                }
                                className={`px-1.5 py-0.5 rounded transition cursor-pointer ${
                                  defaultIncludeTaxInPurchaseValue
                                    ? "bg-emerald-600 text-white font-bold"
                                    : "text-slate-400 hover:text-white"
                                }`}
                                title="Calcular Valor de Compra con impuestos para todos"
                              >
                                +imp
                              </button>
                            </div>
                          </div>
                        </th>
                        <th className="p-2.5 min-w-[210px] text-center">
                          Impuestos
                          <span className="text-[9px] font-normal lowercase tracking-normal text-slate-400 block font-sans">
                            (tasa y valor en $)
                          </span>
                        </th>
                        <th className="p-2.5 min-w-[125px] text-right">
                          Costo Final (+IVA)
                        </th>
                        <th className="p-2.5 min-w-[155px] text-right">
                          <span>Margen & Precio POS</span>
                          <span className="text-[9px] font-semibold lowercase tracking-normal text-emerald-400 block font-sans">
                            {marginMethod === "cost"
                              ? "(markup)"
                              : "(sobre venta)"}
                          </span>
                        </th>
                        <th className="p-2.5 w-16 text-center">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {items.map((item, idx) => {
                        const isMultiUnit =
                          parseFloat(item.unidades_por_presentacion) > 1;
                        const activeTaxes = Array.isArray(item.impuestos)
                          ? item.impuestos
                          : [];
                        const totalTaxRate = activeTaxes.reduce(
                          (sum, t) => sum + (parseFloat(t.rate) || 0),
                          0,
                        );
                        const totalFixedTax = activeTaxes.reduce(
                          (sum, t) =>
                            sum +
                            (parseFloat(t.fixed_amount || t.valor_fijo) || 0),
                          0,
                        );
                        const percentDisplay = Math.round(totalTaxRate * 100);
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
                            className="hover:bg-slate-800/30 transition group"
                          >
                            {/* 1. Index */}
                            <td className="p-2 text-slate-500 font-mono text-center text-xs sticky left-0 z-10 bg-slate-900 group-hover:bg-slate-800 transition-colors">
                              {idx + 1}
                            </td>

                            {/* 2. Producto & Código */}
                            <td className="p-2.5 sticky left-10 z-10 bg-slate-900 group-hover:bg-slate-800 transition-colors shadow-[2px_0_5px_rgba(0,0,0,0.3)]">
                              <div className="space-y-1">
                                <input
                                  type="text"
                                  value={item.descripcion}
                                  onChange={(e) =>
                                    handleUpdateItem(
                                      item.id,
                                      "descripcion",
                                      e.target.value,
                                    )
                                  }
                                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 font-semibold text-xs text-white focus:border-emerald-500 focus:outline-none"
                                  placeholder="Descripción del producto"
                                />
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <input
                                    type="text"
                                    value={item.codigo_barras}
                                    onChange={(e) =>
                                      handleUpdateItem(
                                        item.id,
                                        "codigo_barras",
                                        e.target.value,
                                      )
                                    }
                                    placeholder="Código barras..."
                                    className="w-28 bg-slate-950 border border-slate-800/80 rounded px-1.5 py-0.5 font-mono text-[10.5px] text-slate-300 focus:border-emerald-500 focus:outline-none"
                                  />
                                  {item.matched_alias && (
                                    <span
                                      className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-teal-500/20 text-teal-300 border border-teal-500/30 text-[9px] font-bold"
                                      title="Código auto-completado por aprendizaje"
                                    >
                                      <Sparkles className="w-2.5 h-2.5 text-teal-400" />
                                      Aprendido
                                    </span>
                                  )}
                                  {item.matched_pos_item && (
                                    <span
                                      className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[9px] font-bold truncate max-w-[110px]"
                                      title={item.matched_pos_item.name}
                                    >
                                      POS: {item.matched_pos_item.name}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </td>

                            {/* 3. Cant. & Empaque */}
                            <td className="p-2.5">
                              <div className="flex flex-col items-center gap-1">
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
                                  className="w-16 text-center bg-slate-950 border border-slate-800 rounded-lg px-1.5 py-1 text-xs font-bold text-white focus:border-emerald-500 focus:outline-none"
                                  title="Cantidad comprada"
                                />
                                <div className="flex items-center gap-1">
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
                                    className="w-14 uppercase bg-slate-950 border border-slate-800 rounded px-1 py-0.5 text-[10px] font-bold text-slate-300 text-center focus:outline-none"
                                    title="Presentación (UND, CAJA, BOLSA...)"
                                  />
                                  <span className="text-slate-500 text-[10px]">
                                    x
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
                                    className="w-12 text-center bg-slate-950 border border-slate-800 rounded px-1 py-0.5 text-[10.5px] font-bold text-emerald-400 focus:outline-none"
                                    title="Unidades por empaque"
                                  />
                                  <span className="text-[9px] text-slate-500">
                                    und
                                  </span>
                                </div>
                              </div>
                            </td>

                            {/* 4. Costo Unitario */}
                            <td className="p-2.5 text-right">
                              <div className="flex flex-col items-end gap-0.5">
                                <div className="flex items-center gap-1">
                                  <span className="text-slate-500 text-xs">
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
                                    className="w-24 text-right bg-slate-950 border border-slate-800 rounded-lg px-1.5 py-1 text-xs font-mono font-bold text-white focus:border-emerald-500 focus:outline-none"
                                  />
                                </div>
                                <span className="text-[9px] text-slate-500 block pr-0.5">
                                  por {item.presentacion || "UND"}
                                </span>
                                {(parseFloat(item.unidades_por_presentacion) ||
                                  1) > 1 && (
                                  <span
                                    className="text-[8.5px] text-emerald-400 font-mono font-medium block pr-0.5"
                                    title="Costo neto por unidad individual dentro del empaque"
                                  >
                                    (${formatCOP(item.costo_unitario_neto || 0)}
                                    /und)
                                  </span>
                                )}
                              </div>
                            </td>

                            {/* 5. Valor Compra (costo unitario * cantidad con opción de sumar impuestos) */}
                            {/* 5. Descuento (% comercial) */}
                            <td className="p-2.5 text-center">
                              <div className="flex flex-col items-center gap-0.5">
                                <div className="flex items-center justify-center gap-1">
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
                                    className="w-14 text-center bg-slate-950 border border-slate-800 rounded-lg px-1 py-1 text-xs font-bold text-amber-400 focus:border-amber-500 focus:outline-none"
                                    title="Porcentaje de descuento comercial en factura (%)"
                                  />
                                  <span className="text-xs text-slate-400 font-bold">
                                    %
                                  </span>
                                </div>
                                {(parseFloat(item.descuento) || 0) > 0 && (
                                  <span
                                    className="text-[8.5px] text-amber-400/90 font-mono block"
                                    title="Ahorro unitario por descuento"
                                  >
                                    -$
                                    {formatCOP(
                                      Math.round(
                                        (parseFloat(item.costo_presentacion) ||
                                          0) *
                                          ((parseFloat(item.descuento) || 0) /
                                            100),
                                      ),
                                    )}
                                  </span>
                                )}
                              </div>
                            </td>

                            {/* 6. Valor Compra (costo unitario * cantidad con opción de sumar impuestos) */}
                            <td className="p-2.5 text-right">
                              <div className="flex flex-col items-end gap-1">
                                <div className="flex items-center gap-1">
                                  <span className="text-slate-500 text-xs">
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
                                    title="Valor total de compra = Costo × Cantidad (editable: auto-calcula costo unitario)"
                                    className="w-24 text-right bg-slate-950 border border-slate-800 rounded-lg px-1.5 py-1 text-xs font-mono font-bold text-teal-300 focus:border-teal-400 focus:outline-none"
                                  />
                                </div>

                                <span
                                  className="text-[8.5px] text-slate-400 font-mono block pr-0.5"
                                  title="Fórmula: Costo Presentación × Cantidad"
                                >
                                  {formatCOP(item.costo_presentacion || 0)} ×{" "}
                                  {item.cantidad || 1}
                                  {formatCOP(item.costo_presentacion || 0)}
                                  {(parseFloat(item.descuento) || 0) > 0 && (
                                    <span className="text-amber-400 font-semibold">
                                      {" "}
                                      (-{item.descuento}%)
                                    </span>
                                  )}{" "}
                                  × {item.cantidad || 1}
                                </span>

                                {/* Toggle: Sin Impuestos vs Con Impuestos */}
                                <div className="inline-flex items-center rounded-md bg-slate-950 p-0.5 border border-slate-800 text-[9px] font-sans">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleToggleRowTaxInPurchaseValue(item.id)
                                    }
                                    className={`px-1.5 py-0.5 rounded font-semibold transition cursor-pointer ${
                                      !item.incluir_impuestos_valor_compra
                                        ? "bg-slate-700 text-white shadow-sm"
                                        : "text-slate-400 hover:text-slate-200"
                                    }`}
                                    title="Calcular valor sin sumar impuestos"
                                  >
                                    Sin Imp
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleToggleRowTaxInPurchaseValue(item.id)
                                    }
                                    className={`px-1.5 py-0.5 rounded font-semibold transition cursor-pointer ${
                                      item.incluir_impuestos_valor_compra
                                        ? "bg-emerald-600 text-white shadow-sm font-bold"
                                        : "text-slate-400 hover:text-slate-200"
                                    }`}
                                    title="Calcular valor sumando todos los impuestos"
                                  >
                                    + Imp
                                  </button>
                                </div>

                                {/* Indicador complementario */}
                                {item.incluir_impuestos_valor_compra ? (
                                  <span className="text-[9px] font-mono text-slate-400 block pr-0.5">
                                    Base: $
                                    {Math.round(
                                      item.valor_compra_sin_impuestos || 0,
                                    ).toLocaleString("es-CO")}{" "}
                                    · Imp: $
                                    {Math.round(
                                      item.monto_impuesto_total || 0,
                                    ).toLocaleString("es-CO")}
                                  </span>
                                ) : (
                                  <span className="text-[9px] font-mono text-slate-500 block pr-0.5">
                                    Con Imp: $
                                    {Math.round(
                                      item.valor_compra_con_impuestos || 0,
                                    ).toLocaleString("es-CO")}
                                  </span>
                                )}
                              </div>
                            </td>

                            {/* 6. Impuestos & Valores Individuales */}
                            <td className="p-2.5">
                              <div className="flex flex-col gap-1.5 min-w-[210px]">
                                {/* 1. IVA (0%, 5%, 19%) */}
                                <div className="flex items-center justify-between gap-1">
                                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider w-8 shrink-0">
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
                                              ? "bg-emerald-500 text-slate-950 font-black shadow-sm ring-1 ring-emerald-300"
                                              : "bg-slate-950 text-slate-400 hover:text-white hover:bg-slate-800 border border-slate-800"
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
                                    className="text-[9px] font-bold text-amber-400 uppercase tracking-wider w-8 shrink-0"
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
                                              ? "bg-amber-400 text-slate-950 font-black shadow-sm ring-1 ring-amber-300"
                                              : "bg-slate-950 text-slate-400 hover:text-white hover:bg-slate-800 border border-slate-800"
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
                                              ? "bg-sky-400 text-slate-950 font-black shadow-sm ring-1 ring-sky-300"
                                              : "bg-slate-950 text-slate-400 hover:text-white hover:bg-slate-800 border border-slate-800"
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
                                              ? "bg-purple-500 text-white font-black shadow-sm ring-1 ring-purple-300"
                                              : "bg-slate-950 text-slate-400 hover:text-white hover:bg-slate-800 border border-slate-800"
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
                                    className="text-[9px] font-bold text-slate-400 hover:text-white bg-slate-900 hover:bg-slate-800 px-1.5 py-0.5 rounded border border-slate-700/80 transition cursor-pointer shrink-0"
                                    title="Configurar otros impuestos personalizados o fijos en $"
                                  >
                                    + Otro
                                  </button>
                                </div>

                                {/* Chips de impuestos personalizados activos (IBUA, bolsas, etc.) */}
                                {customTaxes.length > 0 && (
                                  <div className="flex flex-wrap gap-1">
                                    {customTaxes.map((ct, cIdx) => (
                                      <span
                                        key={cIdx}
                                        className="inline-flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded bg-indigo-950/80 text-indigo-300 border border-indigo-500/40 font-semibold"
                                      >
                                        <span>{ct.name}</span>
                                        <button
                                          type="button"
                                          onClick={() =>
                                            handleRemoveCustomTax(item.id, ct)
                                          }
                                          className="text-slate-400 hover:text-rose-300 ml-0.5"
                                          title="Quitar"
                                        >
                                          ×
                                        </button>
                                      </span>
                                    ))}
                                  </div>
                                )}

                                {/* Desglose exacto en pesos ($) de cada impuesto aplicado */}
                                <div className="w-full bg-slate-950/90 rounded border border-slate-800/80 p-1.5 text-[9.5px] font-mono space-y-0.5">
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
                                      className="flex items-center justify-between text-slate-300"
                                    >
                                      <span className="truncate text-slate-400">
                                        {t.name || "Impuesto"}:
                                      </span>
                                      <span
                                        className={`font-bold ${
                                          (t.valor_total || 0) > 0
                                            ? "text-emerald-400"
                                            : "text-slate-500"
                                        }`}
                                      >
                                        $
                                        {Math.round(
                                          t.valor_total || 0,
                                        ).toLocaleString("es-CO")}
                                      </span>
                                    </div>
                                  ))}

                                  {/* Total si hay más de un impuesto gravado */}
                                  {detailedTaxes.length > 1 && (
                                    <div className="flex items-center justify-between border-t border-slate-800/80 pt-0.5 text-amber-300 font-bold">
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

                            {/* 6. Costo Final (+IVA) */}
                            <td className="p-2.5 text-right font-mono text-xs">
                              {isMultiUnit ? (
                                <div className="flex flex-col items-end gap-0.5">
                                  <div className="text-slate-200 font-bold text-[11px]">
                                    <span className="text-[9.5px] text-slate-400 font-normal uppercase mr-1">
                                      Und:
                                    </span>
                                    $
                                    {(
                                      item.costo_unitario_final ||
                                      item.costo_unitario_neto ||
                                      0
                                    ).toLocaleString("es-CO")}
                                  </div>
                                  <div className="text-[10.5px] text-slate-400">
                                    <span className="text-[9px] text-slate-500 font-normal mr-1">
                                      {item.presentacion || "Pqte"}:
                                    </span>
                                    $
                                    {(
                                      item.costo_presentacion_con_iva ||
                                      item.costo_presentacion ||
                                      0
                                    ).toLocaleString("es-CO")}
                                  </div>
                                </div>
                              ) : (
                                <div className="flex flex-col items-end">
                                  <span className="text-slate-200 font-bold text-xs">
                                    $
                                    {(
                                      item.costo_unitario_final ||
                                      item.costo_unitario_neto ||
                                      0
                                    ).toLocaleString("es-CO")}
                                  </span>
                                  <span className="text-[10px] text-slate-500">
                                    Base: $
                                    {(
                                      item.costo_unitario_neto || 0
                                    ).toLocaleString("es-CO")}
                                  </span>
                                </div>
                              )}
                            </td>

                            {/* 7. Margen & Precio POS */}
                            <td className="p-2.5 text-right">
                              <div className="flex flex-col items-end gap-1">
                                {/* Margen % */}
                                <div className="flex items-center justify-end gap-1">
                                  {item.is_manual_margin && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleResetItemMargin(item.id)
                                      }
                                      className="text-[9px] font-bold text-amber-300 bg-amber-950/80 px-1 py-0.5 rounded border border-amber-500/40 hover:bg-amber-900/80 transition cursor-pointer"
                                      title="Margen editado manualmente. Clic para restablecer al margen global"
                                    >
                                      Manual ↺
                                    </button>
                                  )}
                                  <span className="text-[10px] text-slate-400 font-medium">
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
                                    className={`w-11 text-center bg-slate-950 border rounded py-0.5 text-xs font-bold focus:outline-none ${
                                      item.is_manual_margin
                                        ? "border-amber-500/60 text-amber-300"
                                        : "border-slate-800 text-emerald-400"
                                    }`}
                                  />
                                  <span className="text-[10px] text-slate-400">
                                    %
                                  </span>
                                </div>

                                {/* Modo de venta y precio */}
                                {isMultiUnit ? (
                                  <div className="flex flex-col items-end gap-0.5">
                                    <div className="inline-flex rounded-lg bg-slate-950 p-0.5 border border-slate-800 text-[10px] font-bold">
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
                                            ? "bg-emerald-600 text-white shadow-sm"
                                            : "text-slate-400 hover:text-white"
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
                                            ? "bg-teal-600 text-white shadow-sm"
                                            : "text-slate-400 hover:text-white"
                                        }`}
                                        title={`Vender por paquete: $${Number(item.precio_venta_paquete || 0).toLocaleString("es-CO")}`}
                                      >
                                        {item.presentacion || "Pqte"}
                                      </button>
                                    </div>
                                    <span className="font-mono font-black text-sm text-emerald-400 block">
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
                                    <span className="font-mono font-black text-sm text-emerald-400 block">
                                      $
                                      {Number(
                                        item.precio_venta_unidad ||
                                          item.precio_venta_redondeado ||
                                          0,
                                      ).toLocaleString("es-CO")}
                                    </span>
                                    <span className="text-[9.5px] text-slate-500 block">
                                      Exac: $
                                      {Number(
                                        item.precio_venta_calculado || 0,
                                      ).toLocaleString("es-CO")}
                                    </span>
                                  </div>
                                )}
                              </div>
                            </td>

                            {/* 8. Acciones */}
                            <td className="p-2.5 text-center">
                              <div className="flex items-center justify-center gap-1">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setSelectedItemForBreakdown(item)
                                  }
                                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition"
                                  title="Ver fórmula y desglose matemático"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveItem(item.id)}
                                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-950/60 text-slate-400 hover:text-rose-300 transition"
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
                <div className="block lg:hidden divide-y divide-slate-800 rounded-xl border border-slate-800/80 bg-slate-900/60 overflow-hidden shadow-xl mt-3 lg:mt-0">
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
                        className="p-4 space-y-3 hover:bg-slate-800/20 transition"
                      >
                        {/* Header: Índice, Descripción y Botones de Acción */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2 flex-1">
                            <span className="w-6 h-6 rounded-full bg-slate-800 border border-slate-700 text-slate-300 font-mono text-xs flex items-center justify-center font-bold shrink-0">
                              {idx + 1}
                            </span>
                            <input
                              type="text"
                              value={item.descripcion}
                              onChange={(e) =>
                                handleUpdateItem(
                                  item.id,
                                  "descripcion",
                                  e.target.value,
                                )
                              }
                              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 font-bold text-sm text-white focus:border-emerald-500 focus:outline-none"
                              placeholder="Descripción del producto"
                            />
                          </div>

                          <div className="flex items-center gap-1 shrink-0 pt-0.5">
                            <button
                              type="button"
                              onClick={() => setSelectedItemForBreakdown(item)}
                              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition"
                              title="Ver fórmula y desglose matemático"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRemoveItem(item.id)}
                              className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-950/60 text-slate-400 hover:text-rose-300 border border-slate-700 transition"
                              title="Eliminar fila"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        {/* Códigos de barra, Alias y Enlace POS */}
                        <div className="flex items-center flex-wrap gap-2">
                          <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 flex-1 min-w-[140px]">
                            <Barcode className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <input
                              type="text"
                              value={item.codigo_barras}
                              onChange={(e) =>
                                handleUpdateItem(
                                  item.id,
                                  "codigo_barras",
                                  e.target.value,
                                )
                              }
                              placeholder="Código barras..."
                              className="w-full bg-transparent font-mono text-xs text-slate-200 focus:outline-none"
                            />
                          </div>

                          {item.matched_alias && (
                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-teal-500/20 text-teal-300 border border-teal-500/30 text-[10px] font-bold">
                              <Sparkles className="w-3 h-3 text-teal-400" />
                              Aprendido
                            </span>
                          )}

                          {item.matched_pos_item && (
                            <span
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold truncate max-w-[160px]"
                              title={item.matched_pos_item.name}
                            >
                              POS: {item.matched_pos_item.name}
                            </span>
                          )}
                        </div>

                        {/* Cuadrícula Cantidad, Empaque y Descuento */}
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 bg-slate-950/60 p-2.5 rounded-xl border border-slate-800">
                          {/* Cantidad & Empaque */}
                          <div className="space-y-1">
                            <span className="text-[9px] uppercase font-semibold text-slate-400 block">
                              Cantidad / Empaque
                            </span>
                            <div className="flex items-center gap-1.5">
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
                                className="w-14 text-center bg-slate-900 border border-slate-700/80 rounded-lg py-1 text-xs font-bold text-white focus:border-emerald-500 focus:outline-none"
                                title="Cantidad comprada"
                              />
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
                                className="w-14 uppercase bg-slate-900 border border-slate-700/80 rounded-lg py-1 text-[11px] font-bold text-slate-300 text-center focus:outline-none"
                              />
                              <span className="text-slate-500 text-xs">x</span>
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
                                className="w-12 text-center bg-slate-900 border border-slate-700/80 rounded-lg py-1 text-[11px] font-bold text-emerald-400 focus:outline-none"
                                title="Unidades por empaque"
                              />
                            </div>
                          </div>

                          {/* Costo Unitario */}
                          <div className="space-y-1">
                            <span className="text-[9px] uppercase font-semibold text-slate-400 block">
                              Costo Unitario
                            </span>
                            <div className="flex items-center gap-1">
                              <span className="text-slate-500 text-xs">$</span>
                              <CurrencyFormattedInput
                                value={item.costo_presentacion}
                                onChange={(val) =>
                                  handleUpdateItem(
                                    item.id,
                                    "costo_presentacion",
                                    val,
                                  )
                                }
                                className="w-full text-right bg-slate-900 border border-slate-700/80 rounded-lg px-2 py-1 text-xs font-mono font-bold text-white focus:border-emerald-500 focus:outline-none"
                              />
                            </div>
                          </div>

                          {/* Descuento Comercial */}
                          <div className="space-y-1 col-span-2 sm:col-span-1">
                            <span className="text-[9px] uppercase font-semibold text-slate-400 block">
                              Descuento (%)
                            </span>
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
                                    Math.max(
                                      0,
                                      parseFloat(e.target.value) || 0,
                                    ),
                                  )
                                }
                                className="w-16 text-center bg-slate-900 border border-slate-700/80 rounded-lg py-1 text-xs font-bold text-amber-400 focus:outline-none"
                              />
                              <span className="text-xs text-slate-400 font-bold">
                                %
                              </span>
                              {(parseFloat(item.descuento) || 0) > 0 && (
                                <span className="text-[10px] text-amber-400 font-mono ml-auto">
                                  -$
                                  {formatCOP(
                                    Math.round(
                                      (parseFloat(item.costo_presentacion) ||
                                        0) *
                                        ((parseFloat(item.descuento) || 0) /
                                          100),
                                    ),
                                  )}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Valor Compra con Toggle de Impuestos */}
                        <div className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800 flex items-center justify-between gap-2">
                          <div className="flex flex-col">
                            <span className="text-[9px] uppercase font-semibold text-slate-400">
                              Valor Total Compra
                            </span>
                            <div className="flex items-center gap-1">
                              <span className="text-slate-500 text-xs">$</span>
                              <CurrencyFormattedInput
                                value={
                                  item.valor_compra !== undefined
                                    ? Math.round(item.valor_compra)
                                    : Math.round(
                                        item.costo_presentacion * item.cantidad,
                                      )
                                }
                                onChange={(val) =>
                                  handleUpdateValorCompra(item.id, val)
                                }
                                className="w-28 text-right bg-slate-900 border border-slate-700/80 rounded-lg px-2 py-0.5 text-xs font-mono font-bold text-teal-300 focus:outline-none"
                              />
                            </div>
                          </div>

                          <div className="inline-flex items-center rounded-lg bg-slate-900 p-0.5 border border-slate-800 text-[10px] font-sans">
                            <button
                              type="button"
                              onClick={() =>
                                handleToggleRowTaxInPurchaseValue(item.id)
                              }
                              className={`px-2 py-1 rounded font-semibold transition cursor-pointer ${
                                !item.incluir_impuestos_valor_compra
                                  ? "bg-slate-700 text-white shadow-sm"
                                  : "text-slate-400 hover:text-slate-200"
                              }`}
                            >
                              Sin Imp
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                handleToggleRowTaxInPurchaseValue(item.id)
                              }
                              className={`px-2 py-1 rounded font-semibold transition cursor-pointer ${
                                item.incluir_impuestos_valor_compra
                                  ? "bg-emerald-600 text-white shadow-sm font-bold"
                                  : "text-slate-400 hover:text-slate-200"
                              }`}
                            >
                              + Imp
                            </button>
                          </div>
                        </div>

                        {/* Impuestos Aplicables */}
                        <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-[9px] uppercase font-semibold text-slate-400">
                              Impuestos
                            </span>
                            <button
                              type="button"
                              onClick={() => handleOpenCustomTaxModal(item)}
                              className="text-[9px] font-bold text-slate-300 hover:text-white bg-slate-800 px-2 py-0.5 rounded border border-slate-700 transition"
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
                                      ? "bg-emerald-500 text-slate-950 font-black shadow-sm ring-1 ring-emerald-300"
                                      : "bg-slate-900 text-slate-400 hover:text-white border border-slate-800"
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
                                      ? "bg-amber-400 text-slate-950 font-black shadow-sm ring-1 ring-amber-300"
                                      : "bg-slate-900 text-slate-400 hover:text-white border border-slate-800"
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
                                      ? "bg-sky-400 text-slate-950 font-black shadow-sm ring-1 ring-sky-300"
                                      : "bg-slate-900 text-slate-400 hover:text-white border border-slate-800"
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
                                      ? "bg-purple-500 text-white font-black shadow-sm ring-1 ring-purple-300"
                                      : "bg-slate-900 text-slate-400 hover:text-white border border-slate-800"
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
                                  className="inline-flex items-center gap-1 text-[9px] px-2 py-0.5 rounded bg-indigo-950/80 text-indigo-300 border border-indigo-500/40 font-semibold"
                                >
                                  <span>{ct.name}</span>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleRemoveCustomTax(item.id, ct)
                                    }
                                    className="text-slate-400 hover:text-rose-300 ml-0.5"
                                  >
                                    ×
                                  </button>
                                </span>
                              ))}
                            </div>
                          )}

                          {/* Desglose resumido de impuestos en pesos */}
                          <div className="text-[10px] font-mono text-slate-400 flex items-center justify-between pt-0.5 border-t border-slate-800/80">
                            <span>Total Impuestos:</span>
                            <span className="font-bold text-emerald-400">
                              $
                              {Math.round(
                                item.monto_impuesto_total || 0,
                              ).toLocaleString("es-CO")}
                            </span>
                          </div>
                        </div>

                        {/* Banner Financiero: Margen %, Modo y Precio Venta Final */}
                        <div className="p-3 rounded-xl bg-slate-950/90 border border-slate-800 flex items-center justify-between gap-3">
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {item.is_manual_margin && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleResetItemMargin(item.id)
                                  }
                                  className="text-[9px] font-bold text-amber-300 bg-amber-950/80 px-1 py-0.5 rounded border border-amber-500/40 hover:bg-amber-900/80 transition cursor-pointer"
                                  title="Margen editado manualmente. Clic para restablecer al margen global"
                                >
                                  Manual ↺
                                </button>
                              )}
                              <span className="text-[10px] text-slate-400 font-medium">
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
                                className={`w-12 text-center bg-slate-900 border rounded py-0.5 text-xs font-bold focus:outline-none ${
                                  item.is_manual_margin
                                    ? "border-amber-500/60 text-amber-300"
                                    : "border-slate-700 text-emerald-400"
                                }`}
                              />
                              <span className="text-[10px] text-slate-400">
                                %
                              </span>
                            </div>
                            <span className="text-[10px] text-slate-400 font-mono">
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
                              <div className="inline-flex rounded-lg bg-slate-900 p-0.5 border border-slate-800 text-[10px] font-bold">
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
                                      ? "bg-emerald-600 text-white shadow-sm"
                                      : "text-slate-400"
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
                                      ? "bg-teal-600 text-white shadow-sm"
                                      : "text-slate-400"
                                  }`}
                                >
                                  {item.presentacion || "Pqte"}
                                </button>
                              </div>
                            )}

                            <div className="text-right">
                              <span className="text-[9px] uppercase font-semibold text-emerald-400/90 block">
                                Precio Venta POS
                              </span>
                              <span className="text-base sm:text-lg font-black font-mono text-emerald-400">
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

          {/* 3. BARRA DE ACCIONES Y EXPORTACIÓN */}
          {items.length > 0 && (
            <div className="bg-slate-900/95 border border-slate-800 p-4 rounded-2xl shadow-2xl flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 sticky bottom-4 z-30 backdrop-blur-md">
              {/* Información de Simulación */}
              <div className="flex items-center gap-3">
                <span className="px-3.5 py-1.5 rounded-xl bg-teal-500/10 border border-teal-500/30 text-teal-300 font-bold text-xs flex items-center gap-2">
                  <Package className="w-4 h-4 text-teal-400" />
                  {items.length}{" "}
                  {items.length === 1
                    ? "artículo calculado"
                    : "artículos calculados"}
                </span>
                <span className="text-xs text-slate-400 hidden md:inline">
                  Simulación de costos y precios finalizada
                </span>
              </div>

              {/* Botones de Acción: Copiar Precios, Descargar CSV y Memorizar Aprendizaje */}
              <div className="flex flex-wrap items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={handleCopySummary}
                  className="py-3 px-4 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition active:scale-95 cursor-pointer"
                  title="Copiar tabla de precios calculados al portapapeles"
                >
                  <Copy className="w-4 h-4" />
                  <span>Copiar Precios</span>
                </button>

                <button
                  type="button"
                  onClick={handleExportCSV}
                  className="py-3 px-4 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition active:scale-95 cursor-pointer"
                  title="Descargar archivo CSV con la simulación completa"
                >
                  <Download className="w-4 h-4 text-teal-400" />
                  <span>Descargar CSV</span>
                </button>

                <button
                  type="button"
                  onClick={handleLearnFeedback}
                  disabled={isLearning}
                  className={`py-3 px-4 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 border transition active:scale-95 cursor-pointer ${
                    isLearning
                      ? "bg-slate-800 border-slate-700 text-slate-400 cursor-not-allowed"
                      : "bg-indigo-950/70 hover:bg-indigo-900/90 border-indigo-600/60 text-indigo-200 shadow-lg shadow-indigo-950/40 hover:text-white"
                  }`}
                  title="Guardar plantilla de proveedor y alias de productos en la Memoria Adaptativa Continua"
                >
                  {isLearning ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin text-indigo-400" />
                      <span>Memorizando...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 text-indigo-400" />
                      <span>Memorizar Plantilla & Alias</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Banner Informativo de Roles y Módulos */}
          {items.length > 0 && (
            <div className="bg-slate-900/60 border border-slate-800/80 p-3.5 rounded-xl flex items-center gap-3 text-xs text-slate-400">
              <HelpCircle className="w-4 h-4 text-emerald-400 shrink-0" />
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
            <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-5 shadow-2xl space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <h4 className="font-bold text-white flex items-center gap-2">
                    <DollarSign className="w-4 h-4 text-emerald-400" />
                    Desglose de Costos y Precio de Venta
                  </h4>
                  <button
                    onClick={() => setSelectedItemForBreakdown(null)}
                    className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="space-y-3 text-xs">
                  <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
                    <span className="text-slate-400 block text-[11px]">
                      Artículo:
                    </span>
                    <span className="font-bold text-white text-sm">
                      {selectedItemForBreakdown.descripcion}
                    </span>
                  </div>

                  <div className="space-y-2 font-mono">
                    <div className="flex justify-between p-2 rounded bg-slate-950/60">
                      <span className="text-slate-400">
                        Costo Presentación / Línea: Costo Unitario de Compra:
                      </span>
                      <span className="text-white font-bold">
                        $
                        {(
                          selectedItemForBreakdown.costo_presentacion || 0
                        ).toLocaleString("es-CO")}
                      </span>
                    </div>

                    <div className="flex justify-between p-2 rounded bg-slate-950/60">
                      <span className="text-slate-400">
                        Unidades de Inventario: Cantidad Comprada:
                      </span>
                      <span className="text-white font-bold">
                        {selectedItemForBreakdown.cantidad || 1}{" "}
                        {selectedItemForBreakdown.presentacion || "UND"}
                        {parseFloat(
                          selectedItemForBreakdown.unidades_por_presentacion,
                        ) > 1 && (
                          <span className="text-emerald-400 font-normal text-[11px] ml-1">
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

                    <div className="flex justify-between p-2 rounded bg-slate-950/60 border border-slate-800">
                      <span className="text-slate-300">
                        Valor Compra (Sin Impuestos):
                      </span>
                      <span className="text-teal-300 font-bold">
                        $
                        {Math.round(
                          selectedItemForBreakdown.valor_compra_sin_impuestos ||
                            selectedItemForBreakdown.costo_presentacion *
                              selectedItemForBreakdown.cantidad ||
                            0,
                        ).toLocaleString("es-CO")}
                      </span>
                    </div>

                    <div className="flex justify-between p-2 rounded bg-slate-950/60 border border-slate-800">
                      <span className="text-slate-300">
                        Valor Compra (Con Impuestos):
                      </span>
                      <span className="text-emerald-400 font-bold">
                        {(selectedItemForBreakdown.cantidad || 1) *
                          (selectedItemForBreakdown.unidades_por_presentacion ||
                            1)}{" "}
                        unidades $
                        {Math.round(
                          selectedItemForBreakdown.valor_compra_con_impuestos ||
                            0,
                        ).toLocaleString("es-CO")}
                      </span>
                    </div>

                    {/* Desglose Individual de Impuestos */}
                    <div className="bg-slate-950 p-3 rounded-xl border border-slate-800/80 space-y-2">
                      <span className="text-[11px] font-bold text-slate-300 block font-sans">
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
                          className="flex justify-between items-center text-[11px] border-b border-slate-900 pb-1.5"
                        >
                          <div>
                            <span className="text-slate-300 font-bold">
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
                            <span className="text-[10px] text-slate-400 mr-2">
                              u: $
                              {Math.round(t.valor_unitario || 0).toLocaleString(
                                "es-CO",
                              )}
                            </span>
                            <span className="text-emerald-400 font-bold">
                              tot: $
                              {Math.round(t.valor_total || 0).toLocaleString(
                                "es-CO",
                              )}
                            </span>
                          </div>
                        </div>
                      ))}
                      <div className="flex justify-between items-center text-[11px] pt-1 font-bold">
                        <span className="text-amber-300">
                          Total Impuestos Línea:
                        </span>
                        <span className="text-amber-300">
                          $
                          {Math.round(
                            selectedItemForBreakdown.monto_impuesto_total || 0,
                          ).toLocaleString("es-CO")}
                        </span>
                      </div>
                    </div>

                    <div className="flex justify-between p-2 rounded bg-slate-950/60">
                      <span className="text-slate-400">
                        Costo Unitario Base:
                      </span>
                      <span className="text-white font-bold">
                        $
                        {(
                          selectedItemForBreakdown.costo_unitario_neto || 0
                        ).toLocaleString("es-CO")}
                      </span>
                    </div>

                    <div className="flex justify-between p-2 rounded bg-slate-950/60">
                      <span className="text-slate-400">
                        Impuestos Aplicados: Costo Unitario Final para POS (con
                        IVA):
                      </span>
                      <span className="text-amber-300 font-bold">
                        {(selectedItemForBreakdown.impuestos || [])
                          .map((t) => t.name)
                          .join(", ") || "Exento"}
                      </span>
                    </div>

                    <div className="flex justify-between p-2 rounded bg-slate-950/60">
                      <span className="text-slate-400">
                        Costo Unitario Final (Con Impuestos):
                      </span>
                      <span className="text-emerald-400 font-bold">
                        $
                        {(
                          selectedItemForBreakdown.costo_unitario_final ||
                          selectedItemForBreakdown.costo_unitario_neto ||
                          0
                        ).toLocaleString("es-CO")}
                      </span>
                    </div>

                    <div className="flex justify-between p-2 rounded bg-slate-950/60">
                      <span className="text-slate-400">Método de Margen:</span>
                      <span
                        className={`font-bold text-xs ${
                          selectedItemForBreakdown.metodo_margen === "sale"
                            ? "text-teal-400"
                            : "text-emerald-400"
                        }`}
                      >
                        {selectedItemForBreakdown.metodo_margen === "sale"
                          ? "Sobre Venta (Utilidad Bruta)"
                          : "Sobre Costo (Markup)"}
                      </span>
                    </div>

                    <div className="flex justify-between p-2 rounded bg-slate-950/60">
                      <span className="text-slate-400">
                        Margen Comercial Aplicado:
                      </span>
                      <span className="text-teal-400 font-bold">
                        {selectedItemForBreakdown.margen_ganancia}%
                      </span>
                    </div>

                    <div className="flex justify-between p-2 rounded bg-slate-950/60">
                      <span className="text-slate-400">Fórmula Aplicada:</span>
                      <span className="text-amber-300 font-mono text-[11px] font-semibold">
                        {selectedItemForBreakdown.metodo_margen === "sale"
                          ? `Costo / (1 - ${(selectedItemForBreakdown.margen_ganancia || 0) / 100})`
                          : `Costo × (1 + ${(selectedItemForBreakdown.margen_ganancia || 0) / 100})`}
                      </span>
                    </div>

                    {parseFloat(
                      selectedItemForBreakdown.unidades_por_presentacion,
                    ) > 1 && (
                      <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                          Comparativa Unidad vs Paquete (
                          {selectedItemForBreakdown.presentacion} x
                          {selectedItemForBreakdown.unidades_por_presentacion}{" "}
                          und)
                        </span>
                        <div className="grid grid-cols-2 gap-2">
                          <div
                            className={`p-2 rounded-lg border ${
                              selectedItemForBreakdown.modo_venta !== "paquete"
                                ? "bg-emerald-950/60 border-emerald-500/80"
                                : "bg-slate-900 border-slate-800 opacity-60"
                            }`}
                          >
                            <span className="text-[10px] font-bold text-slate-400 block">
                              Venta x Unidad:
                            </span>
                            <span className="text-sm font-black text-emerald-400">
                              $
                              {(
                                selectedItemForBreakdown.precio_venta_unidad ||
                                0
                              ).toLocaleString("es-CO")}
                            </span>
                            <span className="text-[9px] text-slate-400 block mt-0.5">
                              {selectedItemForBreakdown.modo_venta !== "paquete"
                                ? "✓ Activo en POS"
                                : "Inactivo"}
                            </span>
                          </div>

                          <div
                            className={`p-2 rounded-lg border ${
                              selectedItemForBreakdown.modo_venta === "paquete"
                                ? "bg-teal-950/60 border-teal-500/80"
                                : "bg-slate-900 border-slate-800 opacity-60"
                            }`}
                          >
                            <span className="text-[10px] font-bold text-slate-400 block">
                              Venta x Paquete:
                            </span>
                            <span className="text-sm font-black text-teal-400">
                              $
                              {(
                                selectedItemForBreakdown.precio_venta_paquete ||
                                0
                              ).toLocaleString("es-CO")}
                            </span>
                            <span className="text-[9px] text-slate-400 block mt-0.5">
                              {selectedItemForBreakdown.modo_venta === "paquete"
                                ? "✓ Activo en POS"
                                : "Inactivo"}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="flex justify-between p-2 rounded bg-slate-950/60">
                      <span className="text-slate-400">
                        Precio Venta Exacto Matemático:
                      </span>
                      <span className="text-slate-300">
                        $
                        {(
                          selectedItemForBreakdown.precio_venta_calculado || 0
                        ).toLocaleString("es-CO")}
                      </span>
                    </div>

                    <div className="flex justify-between p-3 rounded-xl bg-emerald-950/40 border border-emerald-600/40">
                      <span className="text-emerald-300 font-bold">
                        Precio Activo Cobrado en POS:
                      </span>
                      <span className="text-emerald-400 font-black text-sm">
                        $
                        {(
                          selectedItemForBreakdown.precio_venta_redondeado || 0
                        ).toLocaleString("es-CO")}{" "}
                        <span className="text-[10px] text-slate-400 font-normal">
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

                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => setSelectedItemForBreakdown(null)}
                    className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold transition"
                  >
                    Entendido
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Modal de Impuestos Personalizados y Gestión de Licores / Bebidas */}
          {customTaxModalItem && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
              <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-md p-5 shadow-2xl space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <div>
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <Percent className="w-4 h-4 text-purple-400" />
                      Gestor de Impuestos del Producto
                    </h3>
                    <p className="text-xs text-slate-400 truncate max-w-[320px]">
                      {customTaxModalItem.descripcion ||
                        "Artículo seleccionado"}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setCustomTaxModalItem(null)}
                    className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Impuestos actualmente activos en el producto */}
                <div>
                  <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-2">
                    Impuestos Activos en este Ítem
                  </label>
                  <div className="flex flex-wrap gap-1.5 min-h-[38px] p-2 bg-slate-950/70 border border-slate-800 rounded-xl items-center">
                    {(!customTaxModalItem.impuestos ||
                      customTaxModalItem.impuestos.length === 0) && (
                      <span className="text-xs text-slate-500 italic py-1">
                        Sin impuestos (Exento)
                      </span>
                    )}
                    {(customTaxModalItem.impuestos || []).map((t, idx) => (
                      <span
                        key={idx}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-800 border border-slate-700 text-slate-200"
                      >
                        <span>{t.name || "Impuesto"}</span>
                        <span className="text-emerald-400 font-mono">
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
                          className="text-slate-400 hover:text-rose-400 ml-1 transition cursor-pointer"
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
                  <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
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
                      className="p-2 rounded-xl bg-purple-950/40 hover:bg-purple-900/60 border border-purple-500/40 text-purple-200 font-medium text-left flex flex-col transition cursor-pointer"
                    >
                      <span className="font-bold">IPO+ADV 25%</span>
                      <span className="text-[10px] text-purple-300/80">
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
                      className="p-2 rounded-xl bg-purple-950/40 hover:bg-purple-900/60 border border-purple-500/40 text-purple-200 font-medium text-left flex flex-col transition cursor-pointer"
                    >
                      <span className="font-bold">IPO+ADV 20%</span>
                      <span className="text-[10px] text-purple-300/80">
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
                      className="p-2 rounded-xl bg-amber-950/40 hover:bg-amber-900/60 border border-amber-500/40 text-amber-200 font-medium text-left flex flex-col transition cursor-pointer"
                    >
                      <span className="font-bold">ICUI 20%</span>
                      <span className="text-[10px] text-amber-300/80">
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
                      className="p-2 rounded-xl bg-amber-950/40 hover:bg-amber-900/60 border border-amber-500/40 text-amber-200 font-medium text-left flex flex-col transition cursor-pointer"
                    >
                      <span className="font-bold">ICUI 15%</span>
                      <span className="text-[10px] text-amber-300/80">
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
                      className="p-2 rounded-xl bg-amber-950/40 hover:bg-amber-900/60 border border-amber-500/40 text-amber-200 font-medium text-left flex flex-col transition cursor-pointer"
                    >
                      <span className="font-bold">ICUI 10%</span>
                      <span className="text-[10px] text-amber-300/80">
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
                      className="p-2 rounded-xl bg-sky-950/40 hover:bg-sky-900/60 border border-sky-500/40 text-sky-200 font-medium text-left flex flex-col transition cursor-pointer"
                    >
                      <span className="font-bold">INC 8%</span>
                      <span className="text-[10px] text-sky-300/80">
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
                      className="p-2 rounded-xl bg-emerald-950/40 hover:bg-emerald-900/60 border border-emerald-500/40 text-emerald-200 font-medium text-left flex flex-col transition cursor-pointer"
                    >
                      <span className="font-bold">IVA 5%</span>
                      <span className="text-[10px] text-emerald-300/80">
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
                      className="p-2 rounded-xl bg-emerald-950/40 hover:bg-emerald-900/60 border border-emerald-500/40 text-emerald-200 font-medium text-left flex flex-col transition cursor-pointer"
                    >
                      <span className="font-bold">IVA 19%</span>
                      <span className="text-[10px] text-emerald-300/80">
                        Tarifa general
                      </span>
                    </button>
                  </div>
                </div>

                {/* Formulario para agregar Cualquier Impuesto Personalizado */}
                <div className="pt-2 border-t border-slate-800 space-y-2">
                  <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
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
                      className="col-span-6 bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
                    />
                    <select
                      value={customTaxForm.type}
                      onChange={(e) =>
                        setCustomTaxForm((f) => ({
                          ...f,
                          type: e.target.value,
                        }))
                      }
                      className="col-span-3 bg-slate-950 border border-slate-800 rounded-xl px-2 py-1.5 text-xs text-slate-300 focus:outline-none"
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
                      className="col-span-3 bg-slate-950 border border-slate-800 rounded-xl px-2 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-purple-500 text-right"
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

                <div className="flex justify-end pt-2 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => setCustomTaxModalItem(null)}
                    className="px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-white transition cursor-pointer"
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
        </>
      )}
    </div>
  );
}

