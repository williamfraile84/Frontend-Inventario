import React, { useState, useMemo } from "react";
import {
  Search,
  Layers,
  CheckSquare,
  Square,
  RefreshCw,
  Check,
  AlertCircle,
  DollarSign,
  X,
  HelpCircle,
  Sparkles,
  Tag,
  Percent,
  TrendingUp,
  TrendingDown,
  ArrowRight,
} from "lucide-react";
import { productService } from "../services/api";
import { formatCurrency } from "../utils/currency";
import {
  redondearCentenaEstricta,
  calcularAjustePorcentual,
} from "../utils/math";
import { useLoading } from "../context/LoadingContext";

const QUICK_SEARCH_TAGS = [
  "TOMATE",
  "PAPA",
  "CEBOLLA",
  "MANGO",
  "PLATANO",
  "AGUACATE",
  "LIMON",
  "NARANJA",
  "MANZANA",
  "FRESA",
  "ZANAHORIA",
  "YUCA",
];

export default function BulkPriceEditor({ onShowToast, isTvMode = false }) {
  const { showLoader, hideLoader } = useLoading();
  const [query, setQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [products, setProducts] = useState([]);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [hasSearched, setHasSearched] = useState(false);

  // Bulk Edit Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editMode, setEditMode] = useState("percent"); // "percent" | "fixed"
  const [percentDelta, setPercentDelta] = useState(10);
  const [bulkPrice, setBulkPrice] = useState("");
  const [roundCentenas, setRoundCentenas] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState("");

  const handleSearch = async (searchTerm = query) => {
    const term = searchTerm.trim();
    if (!term) return;

    setIsSearching(true);
    setError("");
    showLoader({
      title: "Buscando Productos",
      message: `Consultando artículos con '${term}'...`,
      submessage: "Cargando precios vigentes del POS...",
      iconType: "search",
    });

    try {
      const res = await productService.searchProducts(term);
      setProducts(res.items || []);
      setHasSearched(true);
      if (res.items.length === 0) {
        onShowToast?.({
          type: "info",
          title: "Sin resultados",
          message: `No se encontraron productos coincidentes con '${term}'.`,
        });
      }
    } catch (err) {
      console.error(err);
      onShowToast?.({
        type: "error",
        title: "Error de búsqueda",
        message:
          err.response?.data?.detail ||
          "No se pudo consultar el catálogo en el POS.",
      });
    } finally {
      setIsSearching(false);
      hideLoader();
    }
  };

  const toggleSelect = (id) => {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
  };

  const selectAll = () => {
    if (selectedIds.size === products.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(products.map((p) => p.item_id)));
    }
  };

  const selectedProducts = useMemo(() => {
    return products.filter((p) => selectedIds.has(p.item_id));
  }, [products, selectedIds]);

  // Cálculos de previsualización para el modo porcentual
  const previewItems = useMemo(() => {
    if (editMode === "percent") {
      const delta = parseFloat(percentDelta) || 0;
      return selectedProducts.map((p) => {
        const current = p.sale_price || 0;
        const target = calcularAjustePorcentual(
          current,
          delta,
          roundCentenas,
          100,
        );
        return {
          ...p,
          targetPrice: target,
          diff: target - current,
        };
      });
    } else {
      const target = parseFloat(bulkPrice) || 0;
      return selectedProducts.map((p) => {
        const current = p.sale_price || 0;
        return {
          ...p,
          targetPrice: target,
          diff: target - current,
        };
      });
    }
  }, [selectedProducts, editMode, percentDelta, bulkPrice, roundCentenas]);

  // Manejar apertura del modal y calcular sugerencias iniciales
  const handleOpenModal = () => {
    if (selectedIds.size === 0) return;
    if (selectedProducts.length > 0) {
      // Si todos tienen el mismo precio, inicializar bulkPrice con ese valor
      const firstPrice = selectedProducts[0].sale_price || 0;
      const allSame = selectedProducts.every(
        (p) => p.sale_price === firstPrice,
      );
      if (allSame && firstPrice > 0) {
        setBulkPrice(String(firstPrice));
      } else {
        const avg = Math.round(
          selectedProducts.reduce((sum, p) => sum + (p.sale_price || 0), 0) /
            selectedProducts.length,
        );
        setBulkPrice(String(redondearCentenaEstricta(avg)));
      }
    }
    setError("");
    setIsModalOpen(true);
  };

  const handleBulkSubmit = async (e) => {
    e.preventDefault();

    if (editMode === "fixed") {
      const numericPrice = parseFloat(bulkPrice);
      if (!numericPrice || numericPrice <= 0) {
        setError("Ingresa un precio de venta válido mayor a 0.");
        return;
      }
    } else {
      const delta = parseFloat(percentDelta);
      if (isNaN(delta)) {
        setError("Ingresa un porcentaje de ajuste válido.");
        return;
      }
    }

    setIsUpdating(true);
    setError("");

    showLoader({
      title: "Aplicando Precios Masivos",
      message: `Actualizando ${selectedIds.size} artículo(s) seleccionados...`,
      submessage: "Sincronizando cambios de precios con el sistema POS...",
      iconType: "dollar",
    });

    try {
      const idsArray = Array.from(selectedIds);
      const selectedNames = selectedProducts
        .map((p) => p.name)
        .slice(0, 4)
        .join(", ");

      let finalPriceToApply = 0;
      let actionDetail = "";

      if (editMode === "fixed") {
        finalPriceToApply = parseFloat(bulkPrice);
        actionDetail = `${idsArray.length} items a ${formatCurrency(finalPriceToApply)} (${selectedNames}...)`;
      } else {
        // En modo porcentaje, calculamos el precio de ajuste
        // Si todos los artículos tenían el mismo precio base o queremos aplicar el precio calculado común
        const targetPrices = previewItems.map((it) => it.targetPrice);
        const allTargetsSame = targetPrices.every((t) => t === targetPrices[0]);

        if (allTargetsSame && targetPrices[0] > 0) {
          finalPriceToApply = targetPrices[0];
          actionDetail = `${idsArray.length} items con ajuste de ${percentDelta > 0 ? `+${percentDelta}%` : `${percentDelta}%`} -> ${formatCurrency(finalPriceToApply)}`;
        } else {
          // Si varían, aplicamos el precio promedio calculado o el del primer artículo representativo
          finalPriceToApply =
            targetPrices[0] ||
            redondearCentenaEstricta(parseFloat(bulkPrice) || 2000);
          actionDetail = `${idsArray.length} items ajustados por ${percentDelta}% (${selectedNames}...)`;
        }
      }

      const res = await productService.bulkUpdatePrices(
        idsArray,
        finalPriceToApply,
        actionDetail,
      );

      onShowToast?.({
        type: "success",
        title: "¡Modificación Masiva Exitosa!",
        message: `Se actualizaron ${res.updated_count} productos con el nuevo precio ${res.formatted_new_price}.`,
      });

      // Refrescar precios en la tabla local
      setProducts((prev) =>
        prev.map((p) => {
          if (selectedIds.has(p.item_id)) {
            const previewMatch = previewItems.find(
              (pi) => pi.item_id === p.item_id,
            );
            const newP = previewMatch?.targetPrice || finalPriceToApply;
            return {
              ...p,
              sale_price: newP,
              formatted_sale_price: formatCurrency(newP),
            };
          }
          return p;
        }),
      );

      setIsModalOpen(false);
      setSelectedIds(new Set());
    } catch (err) {
      console.error(err);
      setError(
        err.response?.data?.detail ||
          "Error ejecutando la modificación masiva en el POS.",
      );
      onShowToast?.({
        type: "error",
        title: "Fallo en Edición Masiva",
        message:
          err.response?.data?.detail ||
          "Ocurrió un error al actualizar los precios en el POS.",
      });
    } finally {
      setIsUpdating(false);
      hideLoader();
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Search Header Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-6 shadow-xl relative overflow-hidden">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-3 rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
            <Layers className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2">
              <span>Edición Masiva de Precios</span>
              <span className="text-xs bg-emerald-500/10 text-emerald-400 px-2.5 py-0.5 rounded-full border border-emerald-500/20 font-bold uppercase tracking-wider">
                Módulo Rápido &bull; % y $
              </span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Busca familias de productos, selecciona múltiples artículos y
              actualiza precios por porcentaje (%) o precio fijo ($)
            </p>
          </div>
        </div>

        {/* Search Input Bar */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSearch();
          }}
          className="flex flex-col sm:flex-row gap-2"
        >
          <div className="relative flex-1">
            <Search className="w-5 h-5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Escribe un producto (ej: TOMATE, PAPA, MANZANA, PLATANO)..."
              className="w-full pl-11 pr-4 py-3 rounded-xl bg-slate-950 border border-slate-700 text-sm font-semibold text-white placeholder-slate-500 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/30 focus:outline-none"
            />
          </div>

          <button
            type="submit"
            disabled={!query.trim() || isSearching}
            className="flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold shadow-lg shadow-emerald-600/30 transition disabled:opacity-40 cursor-pointer"
          >
            {isSearching ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Search className="w-4 h-4" />
            )}
            <span>{isSearching ? "Buscando..." : "Buscar Catálogo"}</span>
          </button>
        </form>

        {/* Quick Search Chips */}
        <div className="flex items-center gap-1.5 mt-3 flex-wrap">
          <span className="text-[11px] font-bold text-slate-500 uppercase mr-1 flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-emerald-400" />
            Filtros Rápidos:
          </span>
          {QUICK_SEARCH_TAGS.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => {
                setQuery(tag);
                handleSearch(tag);
              }}
              className="px-2.5 py-1 rounded-lg bg-slate-950 hover:bg-slate-800 text-slate-300 hover:text-emerald-300 text-xs font-semibold border border-slate-800 transition cursor-pointer"
            >
              {tag}
            </button>
          ))}
        </div>
      </div>

      {/* Results Header & Floating Batch Action Bar */}
      {products.length > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900/90 border border-slate-800 p-3 sm:p-4 rounded-xl shadow-lg">
          <div className="flex items-center gap-3">
            <button
              onClick={selectAll}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition cursor-pointer"
            >
              {selectedIds.size === products.length ? (
                <>
                  <CheckSquare className="w-4 h-4 text-emerald-400" />
                  <span>Deseleccionar Todos</span>
                </>
              ) : (
                <>
                  <Square className="w-4 h-4 text-slate-400" />
                  <span>Seleccionar Todos ({products.length})</span>
                </>
              )}
            </button>

            <span className="text-xs text-slate-400 tabular-nums">
              <b className="text-emerald-400">{selectedIds.size}</b> de{" "}
              {products.length} seleccionados
            </span>
          </div>

          <button
            onClick={handleOpenModal}
            disabled={selectedIds.size === 0}
            className="flex items-center justify-center gap-2 px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-lg shadow-emerald-600/30 transition disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            <DollarSign className="w-4 h-4" />
            <span>Editar Precios ({selectedIds.size} Seleccionados)</span>
          </button>
        </div>
      )}

      {/* Products Table */}
      {products.length > 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
          {/* Desktop Table */}
          <div className="hidden md:block overflow-x-auto custom-scrollbar">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/80 text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-800">
                <tr>
                  <th className="px-5 py-3.5 w-12 text-center">
                    <input
                      type="checkbox"
                      checked={
                        selectedIds.size === products.length &&
                        products.length > 0
                      }
                      onChange={selectAll}
                      className="rounded text-emerald-500 focus:ring-emerald-500 h-4 w-4 bg-slate-900 border-slate-700 cursor-pointer"
                    />
                  </th>
                  <th className="px-5 py-3.5">Código / ID</th>
                  <th className="px-5 py-3.5">Nombre del Producto</th>
                  <th className="px-5 py-3.5">Categoría</th>
                  <th className="px-5 py-3.5">Stock</th>
                  <th className="px-5 py-3.5 text-right">Precio Actual</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-medium">
                {products.map((p) => {
                  const isSelected = selectedIds.has(p.item_id);
                  return (
                    <tr
                      key={p.item_id}
                      onClick={() => toggleSelect(p.item_id)}
                      className={`cursor-pointer transition ${
                        isSelected
                          ? "bg-emerald-950/20 hover:bg-emerald-950/30"
                          : "hover:bg-slate-800/40"
                      }`}
                    >
                      <td
                        className="px-5 py-3.5 text-center"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelect(p.item_id)}
                          className="rounded text-emerald-500 focus:ring-emerald-500 h-4 w-4 bg-slate-900 border-slate-700 cursor-pointer"
                        />
                      </td>
                      <td className="px-5 py-3.5 font-mono text-slate-300 font-bold tabular-nums">
                        {p.barcode || `#${p.item_id}`}
                      </td>
                      <td className="px-5 py-3.5 text-white font-bold text-sm">
                        {p.name}
                      </td>
                      <td className="px-5 py-3.5 text-slate-400">
                        {p.category || "General"}
                      </td>
                      <td className="px-5 py-3.5 text-slate-300 font-semibold tabular-nums">
                        {p.stock}
                      </td>
                      <td className="px-5 py-3.5 text-right font-mono text-emerald-400 font-black text-sm tabular-nums">
                        {p.formatted_sale_price}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards */}
          <div className="block md:hidden divide-y divide-slate-800">
            {products.map((p) => {
              const isSelected = selectedIds.has(p.item_id);
              return (
                <div
                  key={p.item_id}
                  onClick={() => toggleSelect(p.item_id)}
                  className={`p-4 flex items-center justify-between gap-3 cursor-pointer transition ${
                    isSelected
                      ? "bg-emerald-950/30 border-l-4 border-l-emerald-500"
                      : "hover:bg-slate-800/50"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelect(p.item_id)}
                      onClick={(e) => e.stopPropagation()}
                      className="rounded text-emerald-500 focus:ring-emerald-500 h-5 w-5 bg-slate-900 border-slate-700 cursor-pointer shrink-0"
                    />
                    <div>
                      <h4 className="font-bold text-white text-sm leading-snug">
                        {p.name}
                      </h4>
                      <div className="flex items-center gap-2 text-[11px] text-slate-400 font-mono mt-0.5 tabular-nums">
                        <span>{p.barcode || `#${p.item_id}`}</span>
                        <span>&bull;</span>
                        <span>Stock: {p.stock}</span>
                      </div>
                    </div>
                  </div>

                  <span className="font-mono text-emerald-400 font-black text-sm shrink-0 tabular-nums">
                    {p.formatted_sale_price}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ) : hasSearched && !isSearching ? (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center text-slate-400 text-xs">
          No se encontraron productos coincidentes con '{query}'.
        </div>
      ) : null}

      {/* Bulk Price Edit Modal con Soporte % y $ */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-700/90 rounded-2xl sm:rounded-3xl max-w-lg w-full p-5 sm:p-6 shadow-2xl relative overflow-hidden animate-in zoom-in-95 duration-200 text-slate-100 max-h-[90vh] flex flex-col">
            {/* Loading Overlay inside Modal */}
            {isUpdating && (
              <div className="absolute inset-0 z-50 bg-slate-950/95 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center animate-in fade-in duration-200">
                <div className="relative mb-4">
                  <div className="w-16 h-16 rounded-full border-4 border-emerald-500/20 border-t-emerald-500 animate-spin"></div>
                  <Layers className="w-7 h-7 text-emerald-400 absolute inset-0 m-auto animate-pulse" />
                </div>
                <h4 className="text-lg font-bold text-white mb-1">
                  Actualizando {selectedIds.size} Productos en POS
                </h4>
                <p className="text-xs text-slate-400 max-w-xs mt-1">
                  Ejecutando modificación masiva en csopos.co. Confirmando
                  cambios en el catálogo...
                </p>
              </div>
            )}

            {/* Header */}
            <div className="flex items-center justify-between pb-3.5 border-b border-slate-800 shrink-0">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <Layers className="w-5 h-5 text-emerald-400" />
                  <span>Edición Masiva de Precios</span>
                </h3>
                <p className="text-xs text-slate-400">
                  Modificando{" "}
                  <b className="text-emerald-400">{selectedIds.size}</b>{" "}
                  productos seleccionados
                </p>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                disabled={isUpdating}
                className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Mode Switch: % Ajuste Porcentual vs $ Precio Fijo */}
            <div className="grid grid-cols-2 gap-2 mt-4 p-1 bg-slate-950 rounded-xl border border-slate-800 shrink-0">
              <button
                type="button"
                onClick={() => setEditMode("percent")}
                className={`py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                  editMode === "percent"
                    ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/30"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <Percent className="w-4 h-4" />
                <span>Ajuste Porcentual (%)</span>
              </button>
              <button
                type="button"
                onClick={() => setEditMode("fixed")}
                className={`py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                  editMode === "fixed"
                    ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/30"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <DollarSign className="w-4 h-4" />
                <span>Precio Fijo ($)</span>
              </button>
            </div>

            {/* Scrollable Form Body */}
            <div className="overflow-y-auto custom-scrollbar flex-1 pr-1 space-y-4 my-4">
              {editMode === "percent" ? (
                /* Modo Porcentual (%) */
                <div className="space-y-3">
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-bold uppercase tracking-wider text-slate-300">
                        Porcentaje de Incremento o Descuento (%)
                      </label>
                      <label className="flex items-center gap-1.5 text-xs text-slate-400 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={roundCentenas}
                          onChange={(e) => setRoundCentenas(e.target.checked)}
                          className="rounded text-emerald-500 focus:ring-emerald-500 h-3.5 w-3.5 bg-slate-950 border-slate-700"
                        />
                        <span>Redondear a $100</span>
                      </label>
                    </div>

                    <div className="relative">
                      <input
                        type="number"
                        step="1"
                        value={percentDelta}
                        onChange={(e) =>
                          setPercentDelta(parseFloat(e.target.value) || 0)
                        }
                        placeholder="Ej: 10"
                        className="w-full pl-4 pr-10 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-lg font-bold text-white font-mono focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/30 tabular-nums"
                      />
                      <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold">
                        %
                      </span>
                    </div>

                    {/* Quick Percentage Chips */}
                    <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                      <span className="text-[10px] text-slate-400 uppercase font-bold mr-1">
                        Sugerencias:
                      </span>
                      {[+5, +10, +15, +20, +25, +30, -5, -10].map((pct) => (
                        <button
                          key={pct}
                          type="button"
                          onClick={() => setPercentDelta(pct)}
                          className={`px-2 py-0.5 rounded-lg text-xs font-mono font-bold border transition cursor-pointer ${
                            percentDelta === pct
                              ? "bg-emerald-500 text-white border-emerald-400"
                              : pct > 0
                                ? "bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
                                : "bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border-rose-500/30"
                          }`}
                        >
                          {pct > 0 ? `+${pct}%` : `${pct}%`}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Previsualización en vivo de los productos seleccionados */}
                  <div className="bg-slate-950 rounded-xl p-3 border border-slate-800 space-y-2">
                    <span className="text-[11px] font-bold text-slate-400 uppercase block">
                      Previsualización de Precios Calculados (
                      {previewItems.length}):
                    </span>
                    <div className="max-h-40 overflow-y-auto custom-scrollbar divide-y divide-slate-800/60 text-xs">
                      {previewItems.map((pi) => (
                        <div
                          key={pi.item_id}
                          className="py-1.5 flex items-center justify-between gap-2"
                        >
                          <span className="text-slate-200 truncate flex-1 font-medium">
                            {pi.name}
                          </span>
                          <div className="flex items-center gap-2 font-mono tabular-nums shrink-0">
                            <span className="text-slate-500 line-through">
                              {formatCurrency(pi.sale_price)}
                            </span>
                            <ArrowRight className="w-3 h-3 text-slate-600" />
                            <span className="text-emerald-400 font-bold">
                              {formatCurrency(pi.targetPrice)}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                /* Modo Precio Fijo ($) */
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5">
                      Nuevo Precio de Venta Común (COP)
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 font-bold">
                        $
                      </div>
                      <input
                        type="number"
                        step="50"
                        min="50"
                        value={bulkPrice}
                        onChange={(e) => setBulkPrice(e.target.value)}
                        placeholder="Ej: 3200"
                        className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-lg font-bold text-white font-mono focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/30 tabular-nums"
                      />
                    </div>

                    {/* Quick increment buttons */}
                    <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                      <span className="text-[10px] text-slate-500 uppercase font-bold mr-1">
                        Ajuste Rápido:
                      </span>
                      {[+100, +500, +1000, -100, -500].map((delta) => (
                        <button
                          key={delta}
                          type="button"
                          onClick={() => {
                            const cur = parseFloat(bulkPrice) || 0;
                            setBulkPrice(String(Math.max(0, cur + delta)));
                          }}
                          className="px-2 py-0.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-mono font-semibold border border-slate-700 transition cursor-pointer"
                        >
                          {delta > 0 ? `+${delta}` : delta}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {error && (
                <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-800 text-rose-200 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                  <span>{error}</span>
                </div>
              )}
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800 shrink-0">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                disabled={isUpdating}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition cursor-pointer"
              >
                Cancelar
              </button>

              <button
                type="button"
                onClick={handleBulkSubmit}
                disabled={isUpdating}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-lg shadow-emerald-600/30 transition disabled:opacity-40 cursor-pointer"
              >
                <Check className="w-4 h-4" />
                <span>
                  {editMode === "percent"
                    ? `Aplicar ${percentDelta > 0 ? `+${percentDelta}%` : `${percentDelta}%`} a (${selectedIds.size}) Productos`
                    : `Aplicar ${formatCurrency(parseFloat(bulkPrice) || 0)} a (${selectedIds.size}) Productos`}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
