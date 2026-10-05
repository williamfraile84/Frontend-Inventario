import React, { useState, useEffect } from "react";
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
  Percent,
  Search,
  Check,
  ChevronDown,
} from "lucide-react";
import { catalogService } from "../../services/api";
import { formatCurrency } from "../../utils/currency";
import { redondearCentenaEstricta, calcularMargen } from "../../utils/math";
import { useLoading } from "../../context/LoadingContext";

export default function ProductFormModal({
  isOpen,
  onClose,
  onSaved,
  editingProduct = null,
}) {
  const { showLoader, hideLoader } = useLoading();
  const [formData, setFormData] = useState({
    item_number: "",
    name: "",
    category: "",
    category_code: "",
    department_code: "",
    cost_price: "",
    unit_price: "",
    unit_code: "UN",
    stock_quantity: "0",
    description: "",
    profit_percentage: 30,
    additional_numbers: [],
  });

  const [units, setUnits] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [selectedDepartment, setSelectedDepartment] = useState("D56");
  const [departmentCategories, setDepartmentCategories] = useState([]);
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

  // Cargar unidades y departamentos al abrir
  useEffect(() => {
    if (!isOpen) return;

    const loadMeta = async () => {
      try {
        const [uList, dList] = await Promise.all([
          catalogService.getUnits().catch(() => []),
          catalogService.getDepartments().catch(() => []),
        ]);
        setUnits(uList || []);
        setDepartments(dList || []);
      } catch (err) {
        console.error("Error cargando metadatos:", err);
      }
    };
    loadMeta();

    if (editingProduct) {
      setFormData({
        item_number: editingProduct.item_number || "",
        name: editingProduct.name || "",
        category: editingProduct.category || "",
        category_code: editingProduct.category_code || "",
        department_code: editingProduct.department_code || "",
        cost_price: String(editingProduct.cost_price ?? ""),
        unit_price: String(editingProduct.unit_price ?? ""),
        unit_code: editingProduct.unit_code || "UN",
        stock_quantity: String(editingProduct.stock_quantity ?? "0"),
        description: editingProduct.description || "",
        profit_percentage: editingProduct.profit_percentage || 30,
        additional_numbers: Array.isArray(editingProduct.additional_numbers)
          ? [...editingProduct.additional_numbers]
          : [],
      });
      if (editingProduct.department_code) {
        setSelectedDepartment(editingProduct.department_code);
      }
    } else {
      setFormData({
        item_number: "",
        name: "",
        category: "Frutas y verduras",
        category_code: "",
        department_code: "D56",
        cost_price: "",
        unit_price: "",
        unit_code: "UN",
        stock_quantity: "0",
        description: "",
        profit_percentage: 30,
        additional_numbers: [],
      });
      setSelectedDepartment("D56");
    }
    setCategoryFilter("");
    setGlobalSearchTerm("");
    setGlobalSearchResults([]);
    setErrors({});
    setServerError(null);
  }, [isOpen, editingProduct]);

  // Cargar categorías del departamento seleccionado
  useEffect(() => {
    if (!isOpen || !selectedDepartment) return;
    let isCurrent = true;

    const loadDeptCategories = async () => {
      setLoadingCategories(true);
      try {
        const cats = await catalogService.getCategoriesByDepartment(selectedDepartment);
        if (isCurrent) {
          setDepartmentCategories(cats || []);
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

  // Búsqueda global de categorías con debounce
  useEffect(() => {
    if (!isOpen || categoryTab !== "search") return;
    const term = (globalSearchTerm || "").trim();
    if (term.length < 2) {
      setGlobalSearchResults([]);
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
    }, 250);

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
      margin = calcularMargen(cost, price);
    }
    setFormData((prev) => ({
      ...prev,
      unit_price: val,
      profit_percentage: margin,
    }));
  };

  const handleAddBarcode = () => {
    const code = additionalInput.trim();
    if (!code) return;

    // Validación duplicado local
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
        (_, idx) => idx !== indexToRemove,
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
    e.preventDefault();
    if (!validate()) return;

    setIsSubmitting(true);
    setServerError(null);

    const payload = {
      name: formData.name.trim(),
      category: formData.category.trim(),
      category_code: formData.category_code || undefined,
      department_code: formData.department_code || selectedDepartment || undefined,
      cost_price: parseFloat(formData.cost_price),
      unit_price: parseFloat(formData.unit_price),
      item_number: formData.item_number.trim() || null,
      unit_code: formData.unit_code,
      stock_quantity: parseFloat(formData.stock_quantity) || 0,
      description: formData.description.trim(),
      profit_percentage: parseFloat(formData.profit_percentage) || 30,
      additional_numbers: formData.additional_numbers,
    };

    showLoader({
      title: editingProduct?.id ? "Actualizando Artículo" : "Creando Artículo en POS",
      message: `Sincronizando '${formData.name.trim()}' con el catálogo maestro...`,
      submessage: "Registrando información maestra y equivalencias de unidad...",
      iconType: "sparkles",
    });

    try {
      if (editingProduct?.id) {
        await catalogService.updateProduct(editingProduct.id, payload);
      } else {
        await catalogService.createProduct(payload);
      }
      onSaved?.();
      onClose();
    } catch (err) {
      console.error(err);
      setServerError(
        err.response?.data?.detail || "Error al guardar el producto.",
      );
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

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-3xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header Modal */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/50">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              <Package className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white leading-tight">
                {editingProduct
                  ? "Editar Producto en Catálogo"
                  : "Nuevo Producto (Módulo CSOPOS)"}
              </h3>
              <p className="text-xs text-slate-400">
                Campos con <span className="text-rose-400 font-bold">*</span>{" "}
                son estrictamente obligatorios
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

        {/* Server Error Alert */}
        {serverError && (
          <div className="mx-5 mt-4 p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2.5">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{serverError}</span>
          </div>
        )}

        {/* Form Body Scrollable */}
        <form
          onSubmit={handleSubmit}
          className="overflow-y-auto p-4 sm:p-6 space-y-6 flex-1 text-sm"
        >
          {/* SECCIÓN 1: DATOS BÁSICOS */}
          <div className="space-y-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5 pb-2 border-b border-slate-800">
              <Tag className="w-3.5 h-3.5" />
              1. Identificación y Clasificación
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* NOMBRE (OBLIGATORIO) */}
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Nombre del Artículo{" "}
                  <span className="text-rose-400 font-bold">*</span>
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  placeholder="Ej. TOMATE CHONTO EXTRA (KILOGRAMO)"
                  className={`w-full bg-slate-950 border rounded-xl px-3.5 py-2.5 text-white text-sm focus:ring-2 focus:ring-emerald-500/40 outline-none transition ${
                    errors.name
                      ? "border-rose-500/80 bg-rose-950/20"
                      : "border-slate-800 focus:border-emerald-500"
                  }`}
                />
                {errors.name && (
                  <p className="text-[11px] text-rose-400 mt-1">{errors.name}</p>
                )}
              </div>

              {/* UPC/EAN/ISBN (OPCIONAL) */}
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  UPC / EAN / ISBN{" "}
                  <span className="text-slate-500 font-normal">(Opcional)</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={formData.item_number}
                    onChange={(e) =>
                      setFormData({ ...formData, item_number: e.target.value })
                    }
                    placeholder="Ej. 7701234567890 (Opcional)"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-white font-mono text-xs focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500 outline-none transition"
                  />
                  <Barcode className="w-4 h-4 text-slate-500 absolute right-3 top-3 pointer-events-none" />
                </div>
              </div>
            </div>

            {/* BLOQUE MAESTRO DE CATEGORÍA CSOPOS */}
            <div className="bg-slate-950/70 border border-slate-800/90 rounded-2xl p-4 space-y-3.5 shadow-inner">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 border-b border-slate-800/70">
                <div>
                  <div className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                    <Tag className="w-3.5 h-3.5 text-emerald-400" />
                    Categoría : <span className="text-rose-400 font-bold">*</span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Clasificación jerárquica idéntica al sistema CSOPOS / SoftwarePOS
                  </p>
                </div>

                {/* Pestañas de Selección */}
                <div className="flex items-center bg-slate-900 border border-slate-800 rounded-lg p-0.5 text-xs">
                  <button
                    type="button"
                    onClick={() => setCategoryTab("department")}
                    className={`px-3 py-1 rounded-md transition font-medium text-xs ${
                      categoryTab === "department"
                        ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                        : "text-slate-400 hover:text-white"
                    }`}
                  >
                    Por Departamento
                  </button>
                  <button
                    type="button"
                    onClick={() => setCategoryTab("search")}
                    className={`px-3 py-1 rounded-md transition font-medium text-xs ${
                      categoryTab === "search"
                        ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                        : "text-slate-400 hover:text-white"
                    }`}
                  >
                    Búsqueda Global
                  </button>
                  <button
                    type="button"
                    onClick={() => setCategoryTab("manual")}
                    className={`px-3 py-1 rounded-md transition font-medium text-xs ${
                      categoryTab === "manual"
                        ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                        : "text-slate-400 hover:text-white"
                    }`}
                  >
                    Manual
                  </button>
                </div>
              </div>

              {/* PESTAÑA 1: FLUJO JERÁRQUICO POR DEPARTAMENTO (CSOPOS) */}
              {categoryTab === "department" && (
                <div className="space-y-3">
                  {/* 1). Seleccione departamento */}
                  <div>
                    <label className="block text-xs font-semibold text-emerald-400 mb-1.5">
                      1). Seleccione departamento ({departments.length || 50} departamentos)
                    </label>
                    <div className="relative">
                      <select
                        value={selectedDepartment}
                        onChange={(e) => {
                          setSelectedDepartment(e.target.value);
                          setCategoryFilter("");
                        }}
                        className="w-full bg-slate-900 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-white text-xs font-medium focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500 outline-none transition appearance-none cursor-pointer pr-10"
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
                      <label className="text-xs font-semibold text-emerald-400">
                        2). Seleccione Categoría{" "}
                        {loadingCategories ? (
                          <span className="text-slate-400 font-normal text-[11px]">(cargando...)</span>
                        ) : (
                          <span className="text-slate-400 font-normal text-[11px]">
                            ({filteredDepartmentCategories.length} disponibles)
                          </span>
                        )}
                      </label>
                    </div>

                    {/* Filtrar categoría input */}
                    <div className="relative mb-2">
                      <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5 pointer-events-none" />
                      <input
                        type="text"
                        value={categoryFilter}
                        onChange={(e) => setCategoryFilter(e.target.value)}
                        placeholder="Filtrar categoría..."
                        className="w-full bg-slate-900 border border-slate-700/70 rounded-lg pl-8 pr-3 py-1.5 text-white text-xs placeholder:text-slate-500 focus:ring-2 focus:ring-emerald-500/30 outline-none transition"
                      />
                      {categoryFilter && (
                        <button
                          type="button"
                          onClick={() => setCategoryFilter("")}
                          className="absolute right-2.5 top-1.5 text-slate-500 hover:text-white text-xs"
                        >
                          ×
                        </button>
                      )}
                    </div>

                    {/* Categorías en chips interactivos */}
                    <div className="max-h-44 overflow-y-auto pr-1 rounded-xl bg-slate-900/60 border border-slate-800 p-2.5">
                      {loadingCategories ? (
                        <div className="p-4 text-center text-xs text-slate-400 animate-pulse">
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
                                    ? "bg-emerald-600 text-white border-emerald-400 shadow-sm shadow-emerald-900/40"
                                    : "bg-slate-800/80 text-slate-200 border-slate-700/60 hover:bg-slate-700/90 hover:text-white hover:border-slate-600"
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
              {categoryTab === "search" && (
                <div className="space-y-2">
                  <div className="relative">
                    <Search className="w-4 h-4 text-slate-500 absolute left-3 top-3 pointer-events-none" />
                    <input
                      type="text"
                      value={globalSearchTerm}
                      onChange={(e) => setGlobalSearchTerm(e.target.value)}
                      placeholder="Escriba para buscar entre 4.102 categorías (ej: Frescos, Gaseosas, Frutas, Pan, Maní)..."
                      className="w-full bg-slate-900 border border-slate-700/80 rounded-xl pl-9 pr-3.5 py-2.5 text-white text-xs focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500 outline-none transition"
                    />
                    {isSearchingGlobal && (
                      <div className="absolute right-3.5 top-3">
                        <RefreshCw className="w-3.5 h-3.5 text-emerald-400 animate-spin" />
                      </div>
                    )}
                  </div>

                  <div className="max-h-48 overflow-y-auto space-y-1 rounded-xl bg-slate-900/60 border border-slate-800 p-2">
                    {globalSearchTerm.trim().length < 2 ? (
                      <p className="text-xs text-slate-500 p-2 text-center">
                        Escriba al menos 2 caracteres para buscar en todas las categorías del sistema.
                      </p>
                    ) : globalSearchResults.length === 0 ? (
                      <p className="text-xs text-slate-400 p-2 text-center">
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
                                ? "bg-emerald-600/30 text-emerald-200 border-emerald-500/60 font-semibold"
                                : "bg-slate-800/60 text-slate-300 border-slate-700/40 hover:bg-slate-800 hover:text-white"
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              {isSelected && <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
                              <span className="font-medium text-white">{cat.name}</span>
                              <span className="text-[10px] font-mono text-slate-400">({cat.code})</span>
                            </div>
                            {cat.department_name && (
                              <span className="text-[10px] text-slate-400 bg-slate-900/80 px-2 py-0.5 rounded border border-slate-700/50">
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
              {categoryTab === "manual" && (
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
                    className="w-full bg-slate-900 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-white text-xs focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500 outline-none transition"
                  />
                </div>
              )}

              {/* CONFIRMACIÓN VISUAL DE CATEGORÍA SELECCIONADA */}
              <div className="flex items-center justify-between bg-slate-900/90 border border-emerald-500/30 rounded-xl px-3 py-2 text-xs">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <div>
                    <span className="text-slate-400">Seleccionada: </span>
                    <span className="text-emerald-300 font-bold">
                      {formData.category || "Ninguna seleccionada"}
                    </span>
                    {formData.category_code && (
                      <span className="text-slate-400 text-[11px] ml-1.5 font-mono">
                        [{formData.category_code}]
                      </span>
                    )}
                  </div>
                </div>
                {formData.category && (
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
                    className="text-[11px] text-slate-400 hover:text-rose-400 underline transition"
                  >
                    Limpiar
                  </button>
                )}
              </div>

              {errors.category && (
                <p className="text-[11px] text-rose-400 font-medium">{errors.category}</p>
              )}
            </div>
          </div>

          {/* SECCIÓN 2: COSTOS, MÁRGENES Y PRECIO DE VENTA */}
          <div className="space-y-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5 pb-2 border-b border-slate-800">
              <DollarSign className="w-3.5 h-3.5" />
              2. Costos y Precios (Sin Impuesto)
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Costo Sin Impuesto (OBLIGATORIO) */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Costo (Sin Impuesto){" "}
                  <span className="text-rose-400 font-bold">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-2.5 text-slate-500 font-bold">
                    $
                  </span>
                  <input
                    type="number"
                    step="any"
                    value={formData.cost_price}
                    onChange={(e) =>
                      setFormData({ ...formData, cost_price: e.target.value })
                    }
                    placeholder="0.00"
                    className={`w-full bg-slate-950 border rounded-xl pl-8 pr-3.5 py-2.5 text-white font-mono text-sm focus:ring-2 focus:ring-emerald-500/40 outline-none transition ${
                      errors.cost_price
                        ? "border-rose-500/80 bg-rose-950/20"
                        : "border-slate-800 focus:border-emerald-500"
                    }`}
                  />
                </div>
                {errors.cost_price && (
                  <p className="text-[11px] text-rose-400 mt-1">
                    {errors.cost_price}
                  </p>
                )}
              </div>

              {/* Precio de Venta Sin Impuesto (OBLIGATORIO) */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-slate-300">
                    Precio de Venta (Sin Impuesto){" "}
                    <span className="text-rose-400 font-bold">*</span>
                  </label>
                  {formData.profit_percentage > 0 && (
                    <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20 font-mono tabular-nums">
                      Margen: {formData.profit_percentage}%
                    </span>
                  )}
                </div>
                <div className="relative">
                  <span className="absolute left-3.5 top-2.5 text-emerald-400 font-bold">
                    $
                  </span>
                  <input
                    type="number"
                    step="any"
                    value={formData.unit_price}
                    onChange={(e) => handlePriceChange(e.target.value)}
                    placeholder="0"
                    className={`w-full bg-slate-950 border rounded-xl pl-8 pr-3.5 py-2.5 text-emerald-300 font-mono font-bold text-sm focus:ring-2 focus:ring-emerald-500/40 outline-none transition tabular-nums ${
                      errors.unit_price
                        ? "border-rose-500/80 bg-rose-950/20"
                        : "border-slate-800 focus:border-emerald-500"
                    }`}
                  />
                </div>
                {errors.unit_price && (
                  <p className="text-[11px] text-rose-400 mt-1">
                    {errors.unit_price}
                  </p>
                )}
              </div>
            </div>

            {/* Atajos de margen de ganancia con redondeo a centenas */}
            <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800/80 flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs text-slate-400 flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                Sugerir precio con margen y redondeo a centenas:
              </span>
              <div className="flex items-center gap-1.5 flex-wrap">
                {[20, 25, 30, 35, 40, 50].map((pct) => (
                  <button
                    key={pct}
                    type="button"
                    onClick={() => applyMarkup(pct)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                      Math.round(Number(formData.profit_percentage)) === pct
                        ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/30"
                        : "bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white"
                    }`}
                  >
                    +{pct}%
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* SECCIÓN 3: TIENDA PRINCIPAL (UNIDAD DE MEDIDA Y STOCK) */}
          <div className="space-y-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5 pb-2 border-b border-slate-800">
              <Layers className="w-3.5 h-3.5" />
              3. Tienda Principal (Unidad de Medida y Stock)
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Selector de Unidad de Medida (EXTENSIBLE) */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-slate-300">
                    Unidad o Medida del Producto
                  </label>
                  <button
                    type="button"
                    onClick={() => setNewUnitModalOpen(true)}
                    className="text-[11px] text-emerald-400 hover:text-emerald-300 flex items-center gap-1 font-semibold"
                  >
                    <Plus className="w-3 h-3" /> Añadir Nueva
                  </button>
                </div>
                <select
                  value={formData.unit_code}
                  onChange={(e) =>
                    setFormData({ ...formData, unit_code: e.target.value })
                  }
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-white text-xs focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500 outline-none transition"
                >
                  {units.map((u) => (
                    <option key={u.code} value={u.code}>
                      {u.name} ({u.code})
                    </option>
                  ))}
                </select>
              </div>

              {/* Cantidad Stock */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Cantidad Stock Tienda
                </label>
                <input
                  type="number"
                  step="any"
                  value={formData.stock_quantity}
                  onChange={(e) =>
                    setFormData({ ...formData, stock_quantity: e.target.value })
                  }
                  placeholder="0"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-white font-mono text-xs focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500 outline-none transition"
                />
              </div>
            </div>
          </div>

          {/* SECCIÓN 4: NÚMEROS ADICIONALES DE ARTÍCULOS (TABLA DINÁMICA NORMALIZADA) */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5 pb-2 border-b border-slate-800">
              <Barcode className="w-3.5 h-3.5" />
              4. Números adicionales de artículos (Códigos alternativos)
            </h4>

            <div className="flex gap-2">
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
                className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-white font-mono text-xs focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500 outline-none"
              />
              <button
                type="button"
                onClick={handleAddBarcode}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 border border-slate-700 transition"
              >
                <Plus className="w-4 h-4 text-emerald-400" />
                Añadir número
              </button>
            </div>

            {formData.additional_numbers.length > 0 ? (
              <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950/40">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950/80 border-b border-slate-800 text-slate-400 uppercase text-[10px]">
                    <tr>
                      <th className="py-2 px-3">#</th>
                      <th className="py-2 px-3">
                        Número de Artículo / Código Alternativo
                      </th>
                      <th className="py-2 px-3 text-right">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono">
                    {formData.additional_numbers.map((num, idx) => (
                      <tr key={idx} className="hover:bg-slate-800/30">
                        <td className="py-2 px-3 text-slate-500">{idx + 1}</td>
                        <td className="py-2 px-3 text-emerald-300 font-bold tracking-wider">
                          {num}
                        </td>
                        <td className="py-2 px-3 text-right">
                          <button
                            type="button"
                            onClick={() => handleRemoveBarcode(idx)}
                            className="p-1 rounded hover:bg-rose-500/20 text-rose-400 transition"
                            title="Eliminar código adicional"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-xs text-slate-500 italic py-1">
                No hay códigos adicionales registrados. El producto utilizará
                únicamente su código principal.
              </p>
            )}
          </div>
        </form>

        {/* Footer Actions */}
        <div className="p-4 sm:p-5 border-t border-slate-800 flex items-center justify-between bg-slate-950/50">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold transition border border-slate-700"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold shadow-lg shadow-emerald-600/30 flex items-center gap-2 transition"
          >
            {isSubmitting ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Guardando en Catálogo y POS...</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" />
                <span>
                  {editingProduct ? "Actualizar Producto" : "Guardar Producto"}
                </span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Sub-modal: Nueva Unidad de Medida */}
      {newUnitModalOpen && (
        <div className="fixed inset-0 z-60 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-5 w-full max-w-sm shadow-2xl">
            <h4 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
              <Scale className="w-4 h-4 text-emerald-400" />
              Nueva Unidad de Medida
            </h4>
            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">
                  Código Corto (ej. PQ, CJ, ATD):
                </label>
                <input
                  type="text"
                  value={newUnitData.code}
                  onChange={(e) =>
                    setNewUnitData({ ...newUnitData, code: e.target.value })
                  }
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white font-mono uppercase"
                  placeholder="CJ"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">
                  Nombre Completo:
                </label>
                <input
                  type="text"
                  value={newUnitData.name}
                  onChange={(e) =>
                    setNewUnitData({ ...newUnitData, name: e.target.value })
                  }
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white"
                  placeholder="caja (CJ)"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setNewUnitModalOpen(false)}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs"
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
    </div>
  );
}
