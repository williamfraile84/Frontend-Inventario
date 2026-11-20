import React, { useState, useEffect, useCallback } from "react";
import {
  X,
  Plus,
  Trash2,
  Package,
  Barcode,
  Tag,
  DollarSign,
  Layers,
  Sparkles,
  AlertCircle,
  CheckCircle2,
  Scale,
  RefreshCw,
  Search,
  Check,
  ChevronDown,
  Camera,
  TrendingUp,
} from "lucide-react";
import BarcodeScannerModal from "../common/BarcodeScannerModal";
import { catalogService } from "../../services/api";
import { redondearCentenaEstricta, calcularMargen } from "../../utils/math";
import { formatCurrency } from "../../utils/currency";
import { useLoading } from "../../context/LoadingContext";
import { decodeHtml } from "../../utils/text";
import staticCategoriesCatalog from "../../data/categories_catalog.json";

// Departamentos y categorías estáticas pre-indexadas (apertura y consulta instantánea 0ms)
const STATIC_DEPARTMENTS = Object.keys(staticCategoriesCatalog || {})
  .map((code) => ({
    code,
    name: staticCategoriesCatalog[code].department_name || code,
  }))
  .sort((a, b) => a.name.localeCompare(b.name));

const DEFAULT_UNITS = [
  { id: 1, code: "UN", name: "UNIDAD" },
  { id: 2, code: "KG", name: "KILOGRAMO" },
  { id: 3, code: "LB", name: "LIBRA" },
  { id: 4, code: "GR", name: "GRAMO" },
  { id: 5, code: "PQ", name: "PAQUETE" },
  { id: 6, code: "AT", name: "ATADO" },
  { id: 7, code: "MN", name: "MANOJO" },
  { id: 8, code: "BL", name: "BOLSA" },
  { id: 9, code: "CJ", name: "CAJA" },
  { id: 10, code: "CN", name: "CANASTILLA" },
  { id: 11, code: "MK", name: "MALLA" },
  { id: 12, code: "BD", name: "BANDEJA" },
];

let cachedUnits = DEFAULT_UNITS;
let cachedDepartments = STATIC_DEPARTMENTS;
const cachedCategoriesByDept = new Map();

// Precarga de categorías locales de los departamentos maestros para respuesta síncrona en 0ms
if (staticCategoriesCatalog) {
  for (const depCode of Object.keys(staticCategoriesCatalog)) {
    const cats = staticCategoriesCatalog[depCode]?.categories;
    if (Array.isArray(cats) && cats.length > 0) {
      cachedCategoriesByDept.set(depCode, cats);
    }
  }
}

// Búsqueda local de categorías omnidireccional en memoria (0ms)
const searchLocalCategories = (searchTerm) => {
  if (!searchTerm || !staticCategoriesCatalog) return [];
  const clean = searchTerm.trim().toLowerCase();
  if (clean.length < 2) return [];
  const results = [];
  for (const depCode of Object.keys(staticCategoriesCatalog)) {
    const dep = staticCategoriesCatalog[depCode];
    for (const c of dep.categories || []) {
      const name = (c.name || "").toLowerCase();
      const code = (c.code || "").toLowerCase();
      const depName = (
        c.department_name ||
        dep.department_name ||
        ""
      ).toLowerCase();
      if (
        name.includes(clean) ||
        code === clean ||
        (clean.length >= 3 && depName.includes(clean))
      ) {
        results.push({
          code: c.code,
          name: c.name,
          department_code: c.department_code || depCode,
          department_name: c.department_name || dep.department_name || "",
        });
        if (results.length >= 50) return results;
      }
    }
  }
  return results;
};

// Generador de estado inicial sincronizado (0ms)
const getInitialFormData = (product) => {
  if (product) {
    return {
      item_number: product.item_number || "",
      name: decodeHtml(product.name || ""),
      category: decodeHtml(product.category || ""),
      category_code: product.category_code || "",
      department_code: product.department_code || "D56",
      cost_price: String(product.cost_price ?? ""),
      unit_price: String(product.unit_price ?? ""),
      unit_code: product.unit_code || "UN",
      stock_quantity: String(product.stock_quantity ?? "0"),
      description: decodeHtml(product.description || ""),
      profit_percentage: product.profit_percentage ?? 30,
      additional_numbers: Array.isArray(product.additional_numbers)
        ? [...product.additional_numbers]
        : [],
    };
  }
  return {
    item_number: "",
    name: "",
    category: "",
    category_code: "",
    department_code: "D56",
    cost_price: "",
    unit_price: "",
    unit_code: "UN",
    stock_quantity: "0",
    description: "",
    profit_percentage: 30,
    additional_numbers: [],
  };
};

export default function ProductFormModal({
  isOpen,
  onClose,
  onSaved,
  editingProduct = null,
  readOnly = false,
}) {
  const { showLoader, hideLoader } = useLoading();
  const [formData, setFormData] = useState(() =>
    getInitialFormData(editingProduct)
  );

  const [units, setUnits] = useState(() => cachedUnits || DEFAULT_UNITS);
  const [departments, setDepartments] = useState(
    () => cachedDepartments || STATIC_DEPARTMENTS
  );
  const [selectedDepartment, setSelectedDepartment] = useState(
    () => editingProduct?.department_code || "D56"
  );
  const [departmentCategories, setDepartmentCategories] = useState(() => {
    const initDept = editingProduct?.department_code || "D56";
    return cachedCategoriesByDept.get(initDept) || [];
  });
  const [categoryFilter, setCategoryFilter] = useState("");
  const [loadingCategories, setLoadingCategories] = useState(false);
  const [categoryTab, setCategoryTab] = useState("department"); // 'department' | 'search' | 'manual'
  const [globalSearchTerm, setGlobalSearchTerm] = useState("");
  const [globalSearchResults, setGlobalSearchResults] = useState([]);
  const [isSearchingGlobal, setIsSearchingGlobal] = useState(false);

  const [newUnitModalOpen, setNewUnitModalOpen] = useState(false);
  const [newUnitData, setNewUnitData] = useState({
    code: "",
    name: "",
    magnitude_type: "PESO",
    factor: 1.0,
  });

  const [additionalInput, setAdditionalInput] = useState("");
  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverError, setServerError] = useState(null);
  const [isBarcodeScannerOpen, setIsBarcodeScannerOpen] = useState(false);
  const [scanningTarget, setScanningTarget] = useState("item_number"); // 'item_number' | 'additional'

  // Sincronización inmediata cuando se abre o cambia el producto (0ms sin esperas de red)
  useEffect(() => {
    if (!isOpen) return;
    setFormData(getInitialFormData(editingProduct));
    const targetDept = editingProduct?.department_code || "D56";
    setSelectedDepartment(targetDept);
    setDepartmentCategories(cachedCategoriesByDept.get(targetDept) || []);
    setLoadingCategories(false);
    setCategoryFilter("");
    setGlobalSearchTerm("");
    setGlobalSearchResults([]);
    setErrors({});
    setServerError(null);
  }, [isOpen, editingProduct]);

  // Cierre accesible con tecla Escape
  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === "Escape") {
        if (newUnitModalOpen) {
          setNewUnitModalOpen(false);
        } else if (isBarcodeScannerOpen) {
          setIsBarcodeScannerOpen(false);
        } else if (isOpen) {
          onClose();
        }
      }
    },
    [isOpen, newUnitModalOpen, isBarcodeScannerOpen, onClose]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  const handleBarcodeScanned = (scannedCode) => {
    if (!scannedCode) return;
    if (scanningTarget === "item_number") {
      setFormData((prev) => ({
        ...prev,
        item_number: scannedCode,
      }));
    } else if (scanningTarget === "additional") {
      if (!formData.additional_numbers.includes(scannedCode)) {
        setFormData((prev) => ({
          ...prev,
          additional_numbers: [...prev.additional_numbers, scannedCode],
        }));
      }
    }
  };

  // Cargar unidades y departamentos al abrir (con caché instantánea de 0ms)
  useEffect(() => {
    if (!isOpen) return;

    if (cachedUnits && cachedDepartments) {
      setUnits(cachedUnits);
      setDepartments(cachedDepartments);
      return;
    }

    const loadMeta = async () => {
      try {
        const [uList, dList] = await Promise.all([
          cachedUnits ? Promise.resolve(cachedUnits) : catalogService.getUnits().catch(() => []),
          cachedDepartments ? Promise.resolve(cachedDepartments) : catalogService.getDepartments().catch(() => []),
        ]);
        if (uList && uList.length) cachedUnits = uList;
        if (dList && dList.length) cachedDepartments = dList;
        setUnits(uList || []);
        setDepartments(dList || []);
      } catch (err) {
        console.error("Error cargando metadatos:", err);
      }
    };
    loadMeta();
  }, [isOpen]);

  // Cargar categorías del departamento seleccionado (con catálogo estático y caché de 0ms)
  useEffect(() => {
    if (!isOpen || !selectedDepartment) return;

    if (cachedCategoriesByDept.has(selectedDepartment)) {
      setDepartmentCategories(cachedCategoriesByDept.get(selectedDepartment));
      setLoadingCategories(false);
      return;
    }

    let isCurrent = true;
    const loadDeptCategories = async () => {
      setLoadingCategories(true);
      try {
        const cats = await catalogService.getCategoriesByDepartment(
          selectedDepartment
        );
        if (isCurrent) {
          const resCats = cats || [];
          if (resCats.length)
            cachedCategoriesByDept.set(selectedDepartment, resCats);
          setDepartmentCategories(resCats);
        }
      } catch (err) {
        console.error("Error cargando categorías de departamento:", err);
        if (isCurrent) setDepartmentCategories([]);
      } finally {
        if (isCurrent) setLoadingCategories(false);
      }
    };

    loadDeptCategories();
    return () => {
      isCurrent = false;
    };
  }, [isOpen, selectedDepartment]);

  // Búsqueda global de categorías instantánea en memoria (0ms) con fallback a servidor
  useEffect(() => {
    if (!isOpen || categoryTab !== "search") return;
    const term = (globalSearchTerm || "").trim();
    if (term.length < 2) {
      setGlobalSearchResults([]);
      return;
    }

    // 1. Coincidencia inmediata en catálogo local en memoria (0ms)
    const localMatches = searchLocalCategories(term);
    if (localMatches.length > 0) {
      setGlobalSearchResults(localMatches);
      setIsSearchingGlobal(false);
      return;
    }

    let isCurrent = true;
    const timer = setTimeout(async () => {
      setIsSearchingGlobal(true);
      try {
        const results = await catalogService.searchCategories(term);
        if (isCurrent) {
          setGlobalSearchResults(results || []);
        }
      } catch (err) {
        console.error("Error buscando categorías globalmente:", err);
      } finally {
        if (isCurrent) setIsSearchingGlobal(false);
      }
    }, 150);

    return () => {
      isCurrent = false;
      clearTimeout(timer);
    };
  }, [isOpen, globalSearchTerm, categoryTab]);

  if (!isOpen) return null;

  // Calculador rápido de precio según margen con redondeo a centenas
  const applyMarkup = (marginPct) => {
    const cost = parseFloat(formData.cost_price);
    if (!isNaN(cost) && cost > 0) {
      const calc = cost * (1 + marginPct / 100);
      const rounded = redondearCentenaEstricta(calc, 100);
      setFormData((prev) => ({
        ...prev,
        profit_percentage: marginPct,
        unit_price: String(rounded),
      }));
    }
  };

  // Recálculo dinámico de margen cuando el usuario tipea el precio directamente
  const handlePriceChange = (val) => {
    const cost = parseFloat(formData.cost_price);
    const price = parseFloat(val);
    let margin = formData.profit_percentage;
    if (!isNaN(cost) && cost > 0 && !isNaN(price) && price > 0) {
      margin = Math.round(calcularMargen(cost, price) * 10) / 10;
    }
    setFormData((prev) => ({
      ...prev,
      unit_price: val,
      profit_percentage: margin,
    }));
  };

  // Recálculo dinámico cuando el usuario tipea el costo directamente
  const handleCostChange = (val) => {
    const cost = parseFloat(val);
    const price = parseFloat(formData.unit_price);
    let margin = formData.profit_percentage;
    if (!isNaN(cost) && cost > 0 && !isNaN(price) && price > 0) {
      margin = Math.round(calcularMargen(cost, price) * 10) / 10;
    }
    setFormData((prev) => ({
      ...prev,
      cost_price: val,
      profit_percentage: margin,
    }));
  };

  const handleAddBarcode = () => {
    const code = additionalInput.trim();
    if (!code) return;

    if (code === formData.item_number) {
      alert("Este código ya es el código de barras principal del producto.");
      return;
    }
    if (formData.additional_numbers.includes(code)) {
      alert("Este código adicional ya fue añadido a la lista.");
      return;
    }

    setFormData((prev) => ({
      ...prev,
      additional_numbers: [...prev.additional_numbers, code],
    }));
    setAdditionalInput("");
  };

  const handleRemoveBarcode = (indexToRemove) => {
    setFormData((prev) => ({
      ...prev,
      additional_numbers: prev.additional_numbers.filter(
        (_, idx) => idx !== indexToRemove
      ),
    }));
  };

  const handleCreateCustomUnit = async (e) => {
    e.preventDefault();
    if (!newUnitData.code.trim() || !newUnitData.name.trim()) return;
    showLoader({
      title: "Creando Unidad de Medida",
      message: `Registrando unidad '${newUnitData.code.trim().toUpperCase()}'...`,
      iconType: "layers",
    });
    try {
      const created = await catalogService.createUnit({
        code: newUnitData.code.trim().toUpperCase(),
        name: newUnitData.name.trim(),
        magnitude_type: newUnitData.magnitude_type,
        conversion_factor_kg: parseFloat(newUnitData.factor) || 1.0,
      });
      setUnits((prev) => [...prev, created]);
      setFormData((prev) => ({ ...prev, unit_code: created.code }));
      setNewUnitModalOpen(false);
      setNewUnitData({
        code: "",
        name: "",
        magnitude_type: "PESO",
        factor: 1.0,
      });
    } catch (err) {
      alert(err.response?.data?.detail || "Error creando unidad de medida");
    } finally {
      hideLoader();
    }
  };

  const validate = () => {
    const newErrors = {};
    if (!formData.name.trim()) {
      newErrors.name = "El nombre del producto es obligatorio.";
    }
    if (!formData.category.trim()) {
      newErrors.category = "La categoría es obligatoria.";
    }
    const cost = parseFloat(formData.cost_price);
    if (isNaN(cost) || cost < 0 || formData.cost_price === "") {
      newErrors.cost_price =
        "El costo sin impuesto es obligatorio y debe ser >= 0.";
    }
    const price = parseFloat(formData.unit_price);
    if (isNaN(price) || price < 0 || formData.unit_price === "") {
      newErrors.unit_price =
        "El precio de venta sin impuesto es obligatorio y debe ser >= 0.";
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e?.preventDefault?.();
    if (!validate()) return;

    setIsSubmitting(true);
    setServerError(null);

    const rawPosId = editingProduct?.pos_item_id || editingProduct?.item_id;
    const payload = {
      name: formData.name.trim(),
      category: formData.category.trim(),
      category_code: formData.category_code ? String(formData.category_code).trim() : undefined,
      department_code: formData.department_code || selectedDepartment || undefined,
      cost_price: parseFloat(formData.cost_price),
      unit_price: parseFloat(formData.unit_price),
      item_number: formData.item_number.trim() || null,
      unit_code: formData.unit_code || "UN",
      stock_quantity: isNaN(parseFloat(formData.stock_quantity))
        ? 0
        : parseFloat(formData.stock_quantity),
      description: formData.description ? formData.description.trim() : null,
      profit_percentage: parseFloat(formData.profit_percentage) || 30,
      additional_numbers: Array.isArray(formData.additional_numbers)
        ? formData.additional_numbers.map((n) => String(n).trim()).filter(Boolean)
        : [],
      pos_item_id: rawPosId ? String(rawPosId).trim() : undefined,
    };

    showLoader({
      title: editingProduct?.id ? "Actualizando Artículo" : "Creando Artículo en POS",
      message: `Sincronizando '${formData.name.trim()}' con el catálogo maestro...`,
      submessage: "Registrando información maestra y equivalencias de unidad...",
      iconType: "sparkles",
    });

    try {
      let savedProduct = null;
      if (editingProduct?.id) {
        const res = await catalogService.updateProduct(editingProduct.id, payload);
        savedProduct = res?.data || res;
      } else {
        const res = await catalogService.createProduct(payload);
        savedProduct = res?.data || res;
      }
      onSaved?.(savedProduct);
      onClose();
    } catch (err) {
      console.error(err);
      const detail = err.response?.data?.detail;
      const errorMsg =
        typeof detail === "string"
          ? detail
          : Array.isArray(detail)
          ? detail.map((d) => d.msg || JSON.stringify(d)).join("; ")
          : typeof detail === "object" && detail !== null
          ? JSON.stringify(detail)
          : err.message || "Error al guardar el producto.";
      setServerError(errorMsg);
    } finally {
      setIsSubmitting(false);
      hideLoader();
    }
  };

  const filteredDepartmentCategories = (departmentCategories || []).filter((c) => {
    if (!categoryFilter.trim()) return true;
    const term = categoryFilter.toLowerCase();
    return (
      (c.name && c.name.toLowerCase().includes(term)) ||
      (c.code && c.code.toLowerCase().includes(term))
    );
  });

  const parsedCost = parseFloat(formData.cost_price) || 0;
  const parsedPrice = parseFloat(formData.unit_price) || 0;
  const profitMarginVal = parsedPrice > 0 && parsedCost > 0 ? parsedPrice - parsedCost : 0;
  const isCentenaRounded = parsedPrice > 0 && parsedPrice % 100 === 0;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-2.5 sm:p-6 animate-in fade-in duration-200"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-3xl max-h-[calc(100dvh-1.5rem)] sm:max-h-[92vh] flex flex-col shadow-2xl overflow-hidden transition-all text-slate-900 dark:text-slate-100"
      >
        {/* Header Modal */}
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/90 dark:bg-slate-950/70 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 dark:border-emerald-500/30 shadow-sm">
              <Package className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white leading-tight">
                {editingProduct && (editingProduct.id || editingProduct.pos_item_id)
                  ? "Editar Producto en Catálogo"
                  : "Nuevo Producto en Catálogo POS"}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Campos con <span className="text-rose-500 font-bold">*</span>{" "}
                son obligatorios para venta en caja y bodega
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-800 transition"
            title="Cerrar (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Server Error Alert */}
        {serverError && (
          <div className="mx-4 sm:mx-6 mt-4 p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-300 text-xs flex items-center gap-2.5 shadow-sm">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
            <span className="font-medium">{serverError}</span>
          </div>
        )}

        {/* Form Body Scrollable */}
        <form
          onSubmit={handleSubmit}
          className="overflow-y-auto p-4 sm:p-6 space-y-6 flex-1 text-sm custom-scrollbar"
        >
          {/* SECCIÓN 1: DATOS BÁSICOS */}
          <div className="space-y-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5 pb-2 border-b border-slate-200 dark:border-slate-800">
              <Tag className="w-3.5 h-3.5" />
              1. Identificación y Clasificación
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* NOMBRE (OBLIGATORIO) */}
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Nombre del Artículo{" "}
                  <span className="text-rose-500 font-bold">*</span>
                </label>
                <input
                  type="text"
                  disabled={readOnly}
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  placeholder="Ej. TOMATE CHONTO EXTRA (KILOGRAMO)"
                  className={`w-full bg-slate-50 dark:bg-slate-950 border rounded-xl px-3.5 py-2.5 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-emerald-500/30 outline-none transition disabled:opacity-60 ${
                    errors.name
                      ? "border-rose-500/80 bg-rose-50 dark:bg-rose-950/20"
                      : "border-slate-300 dark:border-slate-800 focus:border-emerald-500"
                  }`}
                />
                {errors.name && (
                  <p className="text-[11px] text-rose-500 font-medium mt-1">
                    {errors.name}
                  </p>
                )}
              </div>

              {/* UPC/EAN/ISBN (OPCIONAL) */}
              <div className="sm:col-span-2">
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    UPC / EAN / ISBN{" "}
                    <span className="text-slate-500 font-normal">(Opcional)</span>
                  </label>
                  {!readOnly && (
                    <button
                      type="button"
                      onClick={() => {
                        setScanningTarget("item_number");
                        setIsBarcodeScannerOpen(true);
                      }}
                      className="flex items-center gap-1.5 px-3 py-1 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 dark:border-emerald-500/30 rounded-lg text-xs font-semibold transition hover:scale-[1.02] active:scale-[0.98]"
                      title="Escanear código de barras con la cámara del dispositivo"
                    >
                      <Camera className="w-3.5 h-3.5" />
                      <span>Leer con Cámara</span>
                    </button>
                  )}
                </div>
                <div className="relative">
                  <input
                    type="text"
                    disabled={readOnly}
                    value={formData.item_number}
                    onChange={(e) =>
                      setFormData({ ...formData, item_number: e.target.value })
                    }
                    placeholder="Ej. 7701234567890 (Digita, usa lector USB o lee con cámara)"
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3.5 py-2.5 pr-20 text-slate-900 dark:text-white font-mono text-xs focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 outline-none transition disabled:opacity-60"
                  />
                  <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
                    {formData.item_number && !readOnly && (
                      <button
                        type="button"
                        onClick={() =>
                          setFormData({ ...formData, item_number: "" })
                        }
                        className="p-1 rounded-md text-slate-400 hover:text-rose-500 transition"
                        title="Borrar código"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {!readOnly && (
                      <button
                        type="button"
                        onClick={() => {
                          setScanningTarget("item_number");
                          setIsBarcodeScannerOpen(true);
                        }}
                        className="p-1.5 rounded-lg bg-slate-200 dark:bg-slate-800/80 hover:bg-emerald-100 dark:hover:bg-emerald-950/80 text-slate-600 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 border border-slate-300 dark:border-slate-700/60 transition"
                        title="Abrir lector de cámara"
                      >
                        <Camera className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <Barcode className="w-4 h-4 text-slate-400 pointer-events-none mr-1" />
                  </div>
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  Código de barras comercial para venta en caja registradora o báscula POS.
                </p>
              </div>
            </div>

            {/* BLOQUE MAESTRO DE CATEGORÍA CSOPOS */}
            <div className="bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-3.5 shadow-inner">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 border-b border-slate-200 dark:border-slate-800">
                <div>
                  <div className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                    <Tag className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                    Categoría : <span className="text-rose-500 font-bold">*</span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    Clasificación jerárquica idéntica al sistema CSOPOS / SoftwarePOS
                  </p>
                </div>

                {/* Pestañas de Selección */}
                {!readOnly && (
                  <div className="flex items-center bg-slate-200 dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg p-0.5 text-xs">
                    <button
                      type="button"
                      onClick={() => setCategoryTab("department")}
                      className={`px-3 py-1 rounded-md transition font-medium text-xs ${
                        categoryTab === "department"
                          ? "bg-white dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-300 border border-slate-200 dark:border-emerald-500/30 shadow-xs"
                          : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                      }`}
                    >
                      Por Departamento
                    </button>
                    <button
                      type="button"
                      onClick={() => setCategoryTab("search")}
                      className={`px-3 py-1 rounded-md transition font-medium text-xs ${
                        categoryTab === "search"
                          ? "bg-white dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-300 border border-slate-200 dark:border-emerald-500/30 shadow-xs"
                          : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                      }`}
                    >
                      Búsqueda Global
                    </button>
                    <button
                      type="button"
                      onClick={() => setCategoryTab("manual")}
                      className={`px-3 py-1 rounded-md transition font-medium text-xs ${
                        categoryTab === "manual"
                          ? "bg-white dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-300 border border-slate-200 dark:border-emerald-500/30 shadow-xs"
                          : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                      }`}
                    >
                      Manual
                    </button>
                  </div>
                )}
              </div>

              {/* PESTAÑA 1: FLUJO JERÁRQUICO POR DEPARTAMENTO (CSOPOS) */}
              {!readOnly && categoryTab === "department" && (
                <div className="space-y-3">
                  {/* 1). Seleccione departamento */}
                  <div>
                    <label className="block text-xs font-semibold text-emerald-600 dark:text-emerald-400 mb-1.5">
                      1). Seleccione Departamento ({departments.length || 50} disponibles)
                    </label>
                    <div className="relative">
                      <select
                        value={selectedDepartment}
                        onChange={(e) => {
                          setSelectedDepartment(e.target.value);
                          setCategoryFilter("");
                        }}
                        className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700/80 rounded-xl px-3.5 py-2.5 text-slate-900 dark:text-white text-xs font-medium focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 outline-none transition appearance-none cursor-pointer pr-10 shadow-xs"
                      >
                        {departments.length === 0 ? (
                          <option value="D56">Alimentos - Frutas y Verduras</option>
                        ) : (
                          departments.map((dept) => (
                            <option key={dept.code} value={dept.code}>
                              {dept.name}
                            </option>
                          ))
                        )}
                      </select>
                      <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3.5 top-3 pointer-events-none" />
                    </div>
                  </div>

                  {/* 2). Seleccione Categoría */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                        2). Seleccione Categoría{" "}
                        {loadingCategories ? (
                          <span className="text-slate-400 font-normal text-[11px]">(cargando...)</span>
                        ) : (
                          <span className="text-slate-500 dark:text-slate-400 font-normal text-[11px]">
                            ({filteredDepartmentCategories.length} disponibles)
                          </span>
                        )}
                      </label>
                    </div>

                    {/* Filtrar categoría input */}
                    <div className="relative mb-2">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
                      <input
                        type="text"
                        value={categoryFilter}
                        onChange={(e) => setCategoryFilter(e.target.value)}
                        placeholder="Filtrar categoría por nombre o código..."
                        className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700/70 rounded-lg pl-8 pr-8 py-1.5 text-slate-900 dark:text-white text-xs placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:ring-2 focus:ring-emerald-500/20 outline-none transition"
                      />
                      {categoryFilter && (
                        <button
                          type="button"
                          onClick={() => setCategoryFilter("")}
                          className="absolute right-2.5 top-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-white text-xs"
                        >
                          ×
                        </button>
                      )}
                    </div>

                    {/* Categorías en chips interactivos */}
                    <div className="max-h-44 overflow-y-auto pr-1 rounded-xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 p-2.5 custom-scrollbar">
                      {loadingCategories ? (
                        <div className="p-4 text-center text-xs text-slate-500 dark:text-slate-400 animate-pulse">
                          Cargando categorías de departamento...
                        </div>
                      ) : filteredDepartmentCategories.length === 0 ? (
                        <div className="p-4 text-center text-xs text-slate-500">
                          No se encontraron categorías con "{categoryFilter}" en este departamento.
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {filteredDepartmentCategories.map((cat) => {
                            const isSelected =
                              formData.category === cat.name ||
                              (formData.category_code && formData.category_code === cat.code);
                            return (
                              <button
                                type="button"
                                key={cat.code}
                                onClick={() => {
                                  setFormData((prev) => ({
                                    ...prev,
                                    category: cat.name,
                                    category_code: cat.code,
                                    department_code: cat.department_code || selectedDepartment,
                                  }));
                                  if (errors.category) {
                                    setErrors((prev) => ({ ...prev, category: null }));
                                  }
                                }}
                                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition text-left flex items-center gap-1.5 border ${
                                  isSelected
                                    ? "bg-emerald-600 text-white border-emerald-500 shadow-xs"
                                    : "bg-slate-100 dark:bg-slate-800/80 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700/60 hover:bg-slate-200 dark:hover:bg-slate-700/90 hover:text-slate-900 dark:hover:text-white"
                                }`}
                              >
                                {isSelected && <Check className="w-3 h-3 text-white shrink-0" />}
                                <span>{cat.name}</span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* PESTAÑA 2: BÚSQUEDA GLOBAL (4.102 CATEGORÍAS) */}
              {!readOnly && categoryTab === "search" && (
                <div className="space-y-2">
                  <div className="relative">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3 pointer-events-none" />
                    <input
                      type="text"
                      value={globalSearchTerm}
                      onChange={(e) => setGlobalSearchTerm(e.target.value)}
                      placeholder="Escriba para buscar entre 4.102 categorías (ej: Frescos, Gaseosas, Frutas, Pan, Maní)..."
                      className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700/80 rounded-xl pl-9 pr-8 py-2.5 text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 outline-none transition"
                    />
                    {isSearchingGlobal && (
                      <div className="absolute right-3.5 top-3">
                        <RefreshCw className="w-3.5 h-3.5 text-emerald-500 animate-spin" />
                      </div>
                    )}
                  </div>

                  <div className="max-h-48 overflow-y-auto space-y-1 rounded-xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 p-2 custom-scrollbar">
                    {globalSearchTerm.trim().length < 2 ? (
                      <p className="text-xs text-slate-500 p-2 text-center">
                        Escriba al menos 2 caracteres para buscar en todas las categorías del sistema.
                      </p>
                    ) : globalSearchResults.length === 0 ? (
                      <p className="text-xs text-slate-500 p-2 text-center">
                        {isSearchingGlobal
                          ? "Buscando..."
                          : `No se encontraron categorías para '${globalSearchTerm}'`}
                      </p>
                    ) : (
                      globalSearchResults.map((cat) => {
                        const isSelected =
                          formData.category === cat.name ||
                          (formData.category_code && formData.category_code === cat.code);
                        return (
                          <button
                            type="button"
                            key={cat.code}
                            onClick={() => {
                              setFormData((prev) => ({
                                ...prev,
                                category: cat.name,
                                category_code: cat.code,
                                department_code: cat.department_code || "",
                              }));
                              if (cat.department_code) {
                                setSelectedDepartment(cat.department_code);
                              }
                              if (errors.category) {
                                setErrors((prev) => ({ ...prev, category: null }));
                              }
                            }}
                            className={`w-full text-left p-2 rounded-lg text-xs transition flex items-center justify-between border ${
                              isSelected
                                ? "bg-emerald-500/10 dark:bg-emerald-600/30 text-emerald-700 dark:text-emerald-200 border-emerald-500/50 font-semibold"
                                : "bg-slate-50 dark:bg-slate-800/60 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700/40 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white"
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              {isSelected && <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />}
                              <span className="font-medium">{cat.name}</span>
                              <span className="text-[10px] font-mono text-slate-400">({cat.code})</span>
                            </div>
                            {cat.department_name && (
                              <span className="text-[10px] text-slate-500 bg-white dark:bg-slate-900/80 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700/50">
                                {cat.department_name}
                              </span>
                            )}
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              )}

              {/* PESTAÑA 3: ENTRADA MANUAL */}
              {!readOnly && categoryTab === "manual" && (
                <div className="pt-1">
                  <input
                    type="text"
                    value={formData.category}
                    onChange={(e) => {
                      setFormData((prev) => ({
                        ...prev,
                        category: e.target.value,
                        category_code: "",
                      }));
                      if (errors.category) {
                        setErrors((prev) => ({ ...prev, category: null }));
                      }
                    }}
                    placeholder="Escriba el nombre de la categoría manualmente..."
                    className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700/80 rounded-xl px-3.5 py-2.5 text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 outline-none transition"
                  />
                </div>
              )}

              {/* CONFIRMACIÓN VISUAL DE CATEGORÍA SELECCIONADA */}
              <div
                className={`flex items-center justify-between bg-white dark:bg-slate-900/90 border rounded-xl px-3.5 py-2.5 text-xs shadow-xs transition ${
                  formData.category
                    ? "border-emerald-500/40 bg-emerald-500/5 dark:bg-emerald-950/20"
                    : "border-slate-200 dark:border-slate-800"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  {formData.category ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  ) : (
                    <Tag className="w-4 h-4 text-slate-400 shrink-0" />
                  )}
                  <div>
                    <span className="text-slate-500 dark:text-slate-400">
                      Categoría Seleccionada:{" "}
                    </span>
                    <span
                      className={
                        formData.category
                          ? "text-emerald-700 dark:text-emerald-300 font-bold"
                          : "text-slate-600 dark:text-slate-400 font-semibold"
                      }
                    >
                      {formData.category || "Ninguna seleccionada"}
                    </span>
                    {formData.category_code && (
                      <span className="text-slate-500 dark:text-slate-400 text-[11px] ml-1.5 font-mono">
                        [{formData.category_code}]
                      </span>
                    )}
                  </div>
                </div>
                {formData.category && !readOnly && (
                  <button
                    type="button"
                    onClick={() =>
                      setFormData((prev) => ({
                        ...prev,
                        category: "",
                        category_code: "",
                        department_code: "",
                      }))
                    }
                    className="text-[11px] text-slate-400 hover:text-rose-500 underline transition cursor-pointer"
                  >
                    Cambiar
                  </button>
                )}
              </div>

              {errors.category && (
                <p className="text-[11px] text-rose-500 font-medium">{errors.category}</p>
              )}
            </div>
          </div>

          {/* SECCIÓN 2: COSTOS, MÁRGENES Y PRECIO DE VENTA */}
          <div className="space-y-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5 pb-2 border-b border-slate-200 dark:border-slate-800">
              <DollarSign className="w-3.5 h-3.5" />
              2. Costos, Margen y Precio de Venta (Sin Impuesto)
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Costo Sin Impuesto (OBLIGATORIO) */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Costo (Sin Impuesto){" "}
                    <span className="text-rose-500 font-bold">*</span>
                  </label>
                  {parsedCost > 0 && (
                    <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 font-mono">
                      {formatCurrency(parsedCost)} COP
                    </span>
                  )}
                </div>
                <div className="relative">
                  <span className="absolute left-3.5 top-2.5 text-slate-400 font-bold">
                    $
                  </span>
                  <input
                    type="number"
                    step="any"
                    disabled={readOnly}
                    value={formData.cost_price}
                    onChange={(e) => handleCostChange(e.target.value)}
                    placeholder="0.00"
                    className={`w-full bg-slate-50 dark:bg-slate-950 border rounded-xl pl-8 pr-3.5 py-2.5 text-slate-900 dark:text-white font-mono text-sm focus:ring-2 focus:ring-emerald-500/30 outline-none transition disabled:opacity-60 ${
                      errors.cost_price
                        ? "border-rose-500/80 bg-rose-50 dark:bg-rose-950/20"
                        : "border-slate-300 dark:border-slate-800 focus:border-emerald-500"
                    }`}
                  />
                </div>
                {errors.cost_price && (
                  <p className="text-[11px] text-rose-500 font-medium mt-1">
                    {errors.cost_price}
                  </p>
                )}
              </div>

              {/* Precio de Venta Sin Impuesto (OBLIGATORIO) */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Precio de Venta (Sin Impuesto){" "}
                    <span className="text-rose-500 font-bold">*</span>
                  </label>
                  {formData.profit_percentage > 0 && (
                    <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20 font-mono tabular-nums">
                      Margen: {formData.profit_percentage}%
                    </span>
                  )}
                </div>
                <div className="relative">
                  <span className="absolute left-3.5 top-2.5 text-emerald-600 dark:text-emerald-400 font-bold">
                    $
                  </span>
                  <input
                    type="number"
                    step="any"
                    disabled={readOnly}
                    value={formData.unit_price}
                    onChange={(e) => handlePriceChange(e.target.value)}
                    placeholder="0"
                    className={`w-full bg-slate-50 dark:bg-slate-950 border rounded-xl pl-8 pr-3.5 py-2.5 text-emerald-700 dark:text-emerald-300 font-mono font-bold text-sm focus:ring-2 focus:ring-emerald-500/30 outline-none transition tabular-nums disabled:opacity-60 ${
                      errors.unit_price
                        ? "border-rose-500/80 bg-rose-50 dark:bg-rose-950/20"
                        : "border-slate-300 dark:border-slate-800 focus:border-emerald-500"
                    }`}
                  />
                </div>
                {errors.unit_price && (
                  <p className="text-[11px] text-rose-500 font-medium mt-1">
                    {errors.unit_price}
                  </p>
                )}
              </div>
            </div>

            {/* Tarjeta de Ganancia y Redondeo a Centenas */}
            <div className="bg-slate-50 dark:bg-slate-950/60 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800/80 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs text-slate-600 dark:text-slate-400 flex items-center gap-1.5 font-medium">
                  <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                  Sugerir precio con margen y redondeo a centenas ($100 COP):
                </span>
                {!isCentenaRounded && parsedPrice > 0 && !readOnly && (
                  <button
                    type="button"
                    onClick={() => {
                      const rounded = redondearCentenaEstricta(parsedPrice, 100);
                      handlePriceChange(String(rounded));
                    }}
                    className="text-[11px] font-bold text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 underline flex items-center gap-1 transition"
                  >
                    <span>Redondear actual a centena ({formatCurrency(redondearCentenaEstricta(parsedPrice, 100))})</span>
                  </button>
                )}
              </div>

              {!readOnly && (
                <div className="flex items-center gap-1.5 flex-wrap">
                  {[15, 20, 25, 30, 35, 40, 50].map((pct) => (
                    <button
                      key={pct}
                      type="button"
                      onClick={() => applyMarkup(pct)}
                      className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                        Math.round(Number(formData.profit_percentage)) === pct
                          ? "bg-emerald-600 text-white shadow-xs scale-105"
                          : "bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-slate-700"
                      }`}
                    >
                      +{pct}%
                    </button>
                  ))}
                </div>
              )}

              {/* Indicador de Ganancia Neta */}
              {parsedPrice > 0 && parsedCost > 0 && (
                <div className="pt-2 border-t border-slate-200 dark:border-slate-800/80 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    <span className="text-slate-500 dark:text-slate-400">Ganancia por unidad:</span>
                    <span className={`font-mono font-bold ${profitMarginVal >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-500"}`}>
                      {formatCurrency(profitMarginVal)} COP
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 font-mono text-xs">
                    <span className="text-slate-500 dark:text-slate-400">Margen real:</span>
                    <span className="font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                      {formData.profit_percentage}%
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* SECCIÓN 3: TIENDA PRINCIPAL (UNIDAD DE MEDIDA Y STOCK) */}
          <div className="space-y-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5 pb-2 border-b border-slate-200 dark:border-slate-800">
              <Layers className="w-3.5 h-3.5" />
              3. Tienda Principal (Unidad de Medida y Stock)
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Selector de Unidad de Medida (EXTENSIBLE) */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Unidad o Medida del Producto
                  </label>
                  {!readOnly && (
                    <button
                      type="button"
                      onClick={() => setNewUnitModalOpen(true)}
                      className="text-[11px] text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 flex items-center gap-1 font-semibold"
                    >
                      <Plus className="w-3 h-3" /> Añadir Nueva
                    </button>
                  )}
                </div>
                <div className="relative">
                  <select
                    disabled={readOnly}
                    value={formData.unit_code}
                    onChange={(e) =>
                      setFormData({ ...formData, unit_code: e.target.value })
                    }
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 outline-none transition disabled:opacity-60 appearance-none pr-10"
                  >
                    {units.map((u) => {
                      const code = (u.code || "").toUpperCase();
                      const rawName = u.name || code;
                      // Evitar duplicaciones tipo "unidad (UN) (UN)" si el nombre ya contiene el código
                      const displayName = rawName.toLowerCase().includes(`(${code.toLowerCase()})`)
                        ? rawName
                        : `${rawName} (${code})`;
                      return (
                        <option key={u.code} value={u.code}>
                          {displayName}
                        </option>
                      );
                    })}
                  </select>
                  <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3.5 top-3 pointer-events-none" />
                </div>
              </div>

              {/* Cantidad Stock */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Cantidad Stock Tienda
                </label>
                <input
                  type="number"
                  step="any"
                  disabled={readOnly}
                  value={formData.stock_quantity}
                  onChange={(e) =>
                    setFormData({ ...formData, stock_quantity: e.target.value })
                  }
                  placeholder="0"
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-slate-900 dark:text-white font-mono text-xs focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 outline-none transition disabled:opacity-60"
                />
              </div>
            </div>
          </div>

          {/* SECCIÓN 4: NÚMEROS ADICIONALES DE ARTÍCULOS */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5 pb-2 border-b border-slate-200 dark:border-slate-800">
              <Barcode className="w-3.5 h-3.5" />
              4. Números adicionales de artículos (Códigos alternativos)
            </h4>

            {!readOnly && (
              <div className="p-3.5 bg-slate-50 dark:bg-slate-950/60 rounded-xl border border-slate-200 dark:border-slate-800/80 space-y-2.5">
                <div className="flex flex-col sm:flex-row gap-2.5 items-stretch">
                  <div className="relative flex-1 min-w-0">
                    <input
                      type="text"
                      value={additionalInput}
                      onChange={(e) => setAdditionalInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleAddBarcode();
                        }
                      }}
                      placeholder="Ingresa código adicional (ej. EAN-13, paquete, display)"
                      className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700/80 rounded-xl px-3.5 py-2 text-slate-900 dark:text-white font-mono text-xs focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 outline-none transition shadow-2xs"
                    />
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        setScanningTarget("additional");
                        setIsBarcodeScannerOpen(true);
                      }}
                      className="flex-1 sm:flex-initial px-3.5 py-2 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-emerald-600 dark:text-emerald-400 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 border border-slate-300 dark:border-slate-700 transition shadow-2xs cursor-pointer active:scale-95"
                      title="Escanear código adicional con la cámara"
                    >
                      <Camera className="w-4 h-4 shrink-0" />
                      <span>Escanear</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleAddBarcode}
                      className="flex-1 sm:flex-initial px-4 py-2 bg-emerald-600 hover:bg-emerald-500 active:scale-[0.98] text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm shadow-emerald-600/20 transition cursor-pointer"
                    >
                      <Plus className="w-4 h-4 shrink-0" />
                      <span>Añadir</span>
                    </button>
                  </div>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Permite registrar códigos de barras adicionales para cajas, bultos o multipacks asociados a este producto.
                </p>
              </div>
            )}

            {formData.additional_numbers.length > 0 ? (
              <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden bg-white dark:bg-slate-950/40 shadow-xs">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-950/80 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 uppercase text-[10px] tracking-wider">
                    <tr>
                      <th className="py-2.5 px-3 w-12 text-center">#</th>
                      <th className="py-2.5 px-3">
                        Número de Artículo / Código Alternativo
                      </th>
                      {!readOnly && <th className="py-2.5 px-3 text-right w-20">Acción</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800/60 font-mono">
                    {formData.additional_numbers.map((num, idx) => (
                      <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                        <td className="py-2 px-3 text-center text-slate-400">{idx + 1}</td>
                        <td className="py-2 px-3 text-emerald-700 dark:text-emerald-300 font-bold tracking-wider break-all">
                          {num}
                        </td>
                        {!readOnly && (
                          <td className="py-2 px-3 text-right">
                            <button
                              type="button"
                              onClick={() => handleRemoveBarcode(idx)}
                              className="p-1.5 rounded-lg hover:bg-rose-500/10 text-rose-500 transition cursor-pointer"
                              title="Eliminar código adicional"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-3.5 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 text-center bg-slate-50/50 dark:bg-slate-950/20">
                <p className="text-xs text-slate-400 dark:text-slate-500 italic">
                  No hay códigos adicionales registrados. El producto utilizará únicamente su código principal.
                </p>
              </div>
            )}
          </div>
        </form>

        {/* Footer Actions */}
        <div className="p-4 sm:p-5 border-t border-slate-200 dark:border-slate-800 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-2.5 sm:gap-4 bg-slate-50/90 dark:bg-slate-950/70 backdrop-blur-sm">
          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white text-xs font-semibold transition border border-slate-300 dark:border-slate-700 text-center shadow-xs cursor-pointer"
          >
            {readOnly ? "Cerrar" : "Cancelar"}
          </button>
          {readOnly ? (
            <span className="text-xs text-amber-600 dark:text-amber-400 font-semibold px-3 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/40 text-center">
              Modo Consulta (Solo Lectura)
            </span>
          ) : (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-[0.98] disabled:opacity-50 text-white text-xs font-bold shadow-md shadow-emerald-600/20 flex items-center justify-center gap-2 transition cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin shrink-0" />
                  <span>Guardando en Catálogo y POS...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>
                    {editingProduct ? "Actualizar Producto" : "Guardar Producto"}
                  </span>
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Sub-modal: Nueva Unidad de Medida */}
      {newUnitModalOpen && (
        <div
          onClick={() => setNewUnitModalOpen(false)}
          className="fixed inset-0 z-60 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 w-full max-w-sm shadow-2xl text-slate-900 dark:text-white"
          >
            <h4 className="text-sm font-bold mb-3 flex items-center gap-2">
              <Scale className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              Nueva Unidad de Medida
            </h4>
            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-600 dark:text-slate-400 mb-1">
                  Código Corto (ej. PQ, CJ, ATD):
                </label>
                <input
                  type="text"
                  value={newUnitData.code}
                  onChange={(e) =>
                    setNewUnitData({ ...newUnitData, code: e.target.value })
                  }
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg p-2 text-slate-900 dark:text-white font-mono uppercase"
                  placeholder="CJ"
                />
              </div>
              <div>
                <label className="block text-slate-600 dark:text-slate-400 mb-1">
                  Nombre Completo:
                </label>
                <input
                  type="text"
                  value={newUnitData.name}
                  onChange={(e) =>
                    setNewUnitData({ ...newUnitData, name: e.target.value })
                  }
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg p-2 text-slate-900 dark:text-white"
                  placeholder="caja (CJ)"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setNewUnitModalOpen(false)}
                  className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs border border-slate-200 dark:border-slate-700"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleCreateCustomUnit}
                  className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs"
                >
                  Crear Unidad
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Escáner de Código de Barras con Cámara */}
      <BarcodeScannerModal
        isOpen={isBarcodeScannerOpen}
        onClose={() => setIsBarcodeScannerOpen(false)}
        onScan={handleBarcodeScanned}
        title={
          scanningTarget === "item_number"
            ? "Escanear UPC / EAN / ISBN con Cámara"
            : "Escanear Código de Barras Adicional"
        }
        subtitle={
          scanningTarget === "item_number"
            ? "Apunta la cámara al código de barras para asignarlo como código principal"
            : "Apunta la cámara para añadir este código como alternativo"
        }
      />
    </div>
  );
}
