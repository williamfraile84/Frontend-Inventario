import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  CheckCircle2,
  AlertCircle,
  PlusCircle,
  Search,
  ArrowRight,
  ShieldCheck,
  X,
  Package,
  Link2,
  Check,
  Barcode,
  RefreshCw,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";
import { productService } from "../../services/api";
import { formatCurrency } from "../../utils/currency";
import ProductFormModal from "../Catalog/ProductFormModal";

/**
 * Modal especializado y rediseñado para búsqueda rápida, clara e interactiva en el catálogo del POS.
 * Incluye búsqueda reactiva en servidor (con debounce), filtros inteligentes por código o nombre,
 * y diseño de alto contraste compatible con modo Claro y Oscuro.
 */
function CatalogSearchModal({
  isOpen,
  onClose,
  targetItem,
  onSelectProduct,
  onCreateNewInstead,
}) {
  const [searchTerm, setSearchTerm] = useState("");
  const [serverResults, setServerResults] = useState([]);
  const [isSearchingServer, setIsSearchingServer] = useState(false);
  const searchTimeoutRef = useRef(null);

  // Inicializar término de búsqueda inteligente al abrir
  useEffect(() => {
    if (isOpen && targetItem) {
      // Si tiene código de barras válido, sugerir el código; si no, las primeras 2-3 palabras del nombre
      const barcode = targetItem.codigo_barras && targetItem.codigo_barras !== "S/C"
        ? String(targetItem.codigo_barras).trim()
        : "";
      const words = (targetItem.descripcion || "").trim().split(/\s+/).filter((w) => w.length > 2);
      const suggestedKeywords = words.slice(0, 2).join(" ");
      
      const initialTerm = barcode || suggestedKeywords || "";
      setSearchTerm(initialTerm);
      setServerResults([]);
    }
  }, [isOpen, targetItem]);

  // Consulta EXCLUSIVA al motor en vivo de CSOPOS con debounce (250ms) - Cero base de datos local
  useEffect(() => {
    if (!isOpen) return;
    const term = searchTerm.trim();

    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);

    setIsSearchingServer(true);
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        // Consultar únicamente el motor en vivo de CSOPOS
        const posRes = await productService.searchProducts(term);
        const posItems = Array.isArray(posRes)
          ? posRes
          : posRes?.items || [];

        const formatted = posItems.map((p) => ({
          id: p.item_id,
          pos_item_id: p.item_id,
          item_number: p.barcode,
          barcode: p.barcode,
          name: p.name,
          category: p.category || "",
          unit_price: p.sale_price,
          sale_price: p.sale_price,
          cost_price: p.cost_price,
          stock_quantity: p.stock,
          unit_code: p.unit_code || "UN",
          additional_numbers: [],
        }));

        setServerResults(formatted);
      } catch (err) {
        console.warn("Aviso en búsqueda en vivo CSOPOS:", err);
        setServerResults([]);
      } finally {
        setIsSearchingServer(false);
      }
    }, 250);

    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, [isOpen, searchTerm]);

  // Resultados exclusivos provenientes del motor en vivo de CSOPOS
  const combinedResults = useMemo(() => {
    return serverResults;
  }, [serverResults]);

  if (!isOpen || !targetItem) return null;

  // Palabras clave sugeridas para chips de búsqueda rápida
  const barcodeChip = targetItem.codigo_barras && targetItem.codigo_barras !== "S/C"
    ? targetItem.codigo_barras
    : null;
  const descTokens = (targetItem.descripcion || "").split(/\s+/).filter((w) => w.length > 2);
  const firstWordChip = descTokens[0] || null;
  const secondWordChip = descTokens.length > 1 ? `${descTokens[0]} ${descTokens[1]}` : null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-60 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-3xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden text-slate-800 dark:text-slate-100 animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabecera del Buscador */}
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 flex items-center justify-center shrink-0">
              <Search className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="font-extrabold text-base sm:text-lg text-slate-900 dark:text-white truncate">
                Buscar y Vincular en Catálogo POS
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                Artículo de factura: <strong className="text-slate-800 dark:text-slate-200">{targetItem.descripcion}</strong>
                {targetItem.codigo_barras && (
                  <span className="font-mono ml-1.5 text-slate-600 dark:text-slate-400">
                    (Cód: {targetItem.codigo_barras})
                  </span>
                )}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-800 transition cursor-pointer"
            title="Cerrar buscador"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Barra de Búsqueda y Filtros Rápidos */}
        <div className="p-3 sm:p-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-2.5">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
            <input
              type="text"
              autoFocus
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por nombre, código de barras, PLU o categoría..."
              className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/50"
            />
            {isSearchingServer ? (
              <RefreshCw className="w-4 h-4 absolute right-3.5 top-3 text-emerald-500 animate-spin" />
            ) : searchTerm ? (
              <button
                type="button"
                onClick={() => setSearchTerm("")}
                className="absolute right-3.5 top-3 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                title="Limpiar búsqueda"
              >
                <X className="w-4 h-4" />
              </button>
            ) : null}
          </div>

          {/* Chips de Búsqueda Rápida */}
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 mr-1">Filtros rápidos:</span>
            {barcodeChip && (
              <button
                type="button"
                onClick={() => setSearchTerm(barcodeChip)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition cursor-pointer flex items-center gap-1 ${
                  searchTerm === barcodeChip
                    ? "bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-700"
                    : "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700 hover:border-emerald-500"
                }`}
              >
                <Barcode className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                <span>Cód: {barcodeChip}</span>
              </button>
            )}
            {secondWordChip && (
              <button
                type="button"
                onClick={() => setSearchTerm(secondWordChip)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition cursor-pointer ${
                  searchTerm === secondWordChip
                    ? "bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-700"
                    : "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700 hover:border-emerald-500"
                }`}
              >
                "{secondWordChip}"
              </button>
            )}
            {firstWordChip && firstWordChip !== secondWordChip && (
              <button
                type="button"
                onClick={() => setSearchTerm(firstWordChip)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition cursor-pointer ${
                  searchTerm === firstWordChip
                    ? "bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-700"
                    : "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700 hover:border-emerald-500"
                }`}
              >
                "{firstWordChip}"
              </button>
            )}
            <button
              type="button"
              onClick={() => setSearchTerm("")}
              className="px-2 py-1 rounded-lg text-[11px] text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 underline cursor-pointer"
            >
              Ver todos
            </button>
          </div>
        </div>

        {/* Lista de Resultados */}
        <div className="p-3 sm:p-4 overflow-y-auto flex-1 space-y-2.5 custom-scrollbar">
          {combinedResults.length === 0 ? (
            <div className="py-12 text-center space-y-3.5">
              <Package className="w-12 h-12 text-slate-400 mx-auto opacity-40" />
              <div>
                <p className="text-sm font-bold text-slate-700 dark:text-slate-200">
                  No se encontraron productos coincidentes
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-md mx-auto">
                  No existe un artículo en el POS con el término "{searchTerm}". Puedes buscar con menos palabras o crearlo directamente con todos sus datos.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onCreateNewInstead?.(targetItem);
                }}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold transition shadow-md shadow-blue-900/30 cursor-pointer"
              >
                <PlusCircle className="w-4 h-4" />
                <span>Crear este producto en el POS ahora</span>
              </button>
            </div>
          ) : (
            combinedResults.map((prod) => {
              const currentPrice = parseFloat(prod.unit_price || prod.sale_price) || 0;
              const prodBarcode = prod.item_number || prod.barcode || "S/C";
              const costPrice = parseFloat(prod.cost_price || 0);

              return (
                <div
                  key={prod.id || prod.item_id || prodBarcode}
                  className="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 hover:border-emerald-500 dark:hover:border-emerald-500 bg-white dark:bg-slate-900/80 hover:bg-emerald-50/40 dark:hover:bg-emerald-950/20 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs group"
                >
                  <div className="space-y-1.5 min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-extrabold text-xs sm:text-sm text-slate-900 dark:text-white group-hover:text-emerald-700 dark:group-hover:text-emerald-400 transition">
                        {prod.name}
                      </h4>
                      {prod.category && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                          {prod.category}
                        </span>
                      )}
                      {(prod.id || prod.pos_item_id) && (
                        <span className="text-[9.5px] font-mono font-bold px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                          ID: #{prod.id || prod.pos_item_id}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400 font-mono flex-wrap">
                      <span className="inline-flex items-center gap-1">
                        <Barcode className="w-3.5 h-3.5 text-slate-400" />
                        PLU/Cód: <strong className="text-slate-800 dark:text-slate-200">{prodBarcode}</strong>
                      </span>
                      {prod.unit_code && (
                        <span>Unidad: <strong className="text-slate-700 dark:text-slate-300">{prod.unit_code}</strong></span>
                      )}
                      {costPrice > 0 && (
                        <span>Costo POS: <strong>{formatCurrency(costPrice)}</strong></span>
                      )}
                      <span className="text-slate-700 dark:text-slate-300">
                        Precio Venta: <strong className="text-emerald-600 dark:text-emerald-400 font-bold">{formatCurrency(currentPrice)}</strong>
                      </span>
                    </div>

                    {Array.isArray(prod.additional_numbers) && prod.additional_numbers.length > 0 && (
                      <div className="flex items-center gap-1.5 flex-wrap text-[10px] pt-1">
                        <span className="text-slate-400 dark:text-slate-500 font-semibold">Números adicionales:</span>
                        {prod.additional_numbers.map((addCode, cIdx) => (
                          <span
                            key={cIdx}
                            className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-mono border border-slate-200 dark:border-slate-700 font-bold"
                          >
                            {addCode}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      onSelectProduct(targetItem.id, prod);
                      onClose();
                    }}
                    className="py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 shrink-0 shadow-md shadow-emerald-900/20 cursor-pointer"
                  >
                    <Check className="w-4 h-4" />
                    <span>Vincular Artículo</span>
                  </button>
                </div>
              );
            })
          )}
        </div>

        {/* Footer del Buscador con opción de creación rápida */}
        <div className="p-3 sm:p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex flex-col sm:flex-row items-center justify-between gap-2.5 shrink-0 text-xs text-slate-500 dark:text-slate-400">
          <span>{combinedResults.length} artículos encontrados en catálogo</span>
          <button
            type="button"
            onClick={() => {
              onClose();
              onCreateNewInstead?.(targetItem);
            }}
            className="text-blue-600 dark:text-blue-400 hover:underline font-bold flex items-center gap-1.5 cursor-pointer"
          >
            <PlusCircle className="w-4 h-4" />
            <span>¿No está en la lista? Crear como producto nuevo en POS</span>
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Modal de Doble Confirmación con Resumen Ejecutivo de Cambios
 * Cumple la solicitud explícita de presentar el resumen visual completo
 * (precios anteriores vs nuevos, variaciones, códigos adicionales y creaciones)
 * antes de escribir en el sistema POS.
 */
function ConfirmationSummaryModal({
  isOpen,
  onClose,
  itemsToApply = [],
  supplierName = "",
  invoiceNumber = "",
  onFinalConfirm,
  isApplying = false,
}) {
  if (!isOpen || itemsToApply.length === 0) return null;

  // Estadísticas del lote a aplicar
  let priceUpdatesCount = 0;
  let newCreationsCount = 0;
  let additionalCodesCount = 0;
  let noPriceChangeCount = 0;

  itemsToApply.forEach((item) => {
    if (item.crear_como_nuevo) {
      newCreationsCount++;
    } else {
      const oldP = item.pos_price || 0;
      const newP = item.precio_venta_final || 0;
      if (oldP > 0 && oldP !== newP) {
        priceUpdatesCount++;
      } else {
        noPriceChangeCount++;
      }
      if (item.action === "add_additional_code") {
        additionalCodesCount++;
      }
    }
  });

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-70 bg-black/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-4xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden text-slate-800 dark:text-slate-100 animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabecera del Resumen de Doble Confirmación */}
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-extrabold text-base sm:text-lg text-slate-900 dark:text-white">
                  Resumen de Cambios a Aplicar en POS
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-600/40">
                  Paso 2: Doble Confirmación
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Factura de <strong className="text-slate-800 dark:text-slate-200">{supplierName || "Proveedor"}</strong>
                {invoiceNumber && <> &bull; Factura #: <strong className="text-slate-800 dark:text-slate-200">{invoiceNumber}</strong></>}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isApplying}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-800 transition cursor-pointer"
            title="Cerrar resumen"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tarjetas de Métricas Ejecutivas */}
        <div className="p-3 sm:p-4 bg-slate-100/70 dark:bg-slate-950/70 border-b border-slate-200 dark:border-slate-800 grid grid-cols-2 sm:grid-cols-4 gap-2.5 shrink-0">
          <div className="p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
            <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 block">Total a Aplicar</span>
            <span className="text-lg sm:text-xl font-black text-slate-900 dark:text-white">{itemsToApply.length}</span>
            <span className="text-[10px] text-slate-400 block">artículos seleccionados</span>
          </div>

          <div className="p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
            <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 block">Actualizan Precio</span>
            <span className="text-lg sm:text-xl font-black text-emerald-600 dark:text-emerald-400">{priceUpdatesCount}</span>
            <span className="text-[10px] text-slate-400 block">{noPriceChangeCount} sin variación</span>
          </div>

          <div className="p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
            <span className="text-[11px] font-bold text-blue-600 dark:text-blue-400 block">Creaciones Nuevas</span>
            <span className="text-lg sm:text-xl font-black text-blue-600 dark:text-blue-400">{newCreationsCount}</span>
            <span className="text-[10px] text-slate-400 block">productos en catálogo</span>
          </div>

          <div className="p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
            <span className="text-[11px] font-bold text-teal-600 dark:text-teal-400 block">Códigos Adicionales</span>
            <span className="text-lg sm:text-xl font-black text-teal-600 dark:text-teal-400">{additionalCodesCount}</span>
            <span className="text-[10px] text-slate-400 block">asociados a productos</span>
          </div>
        </div>

        {/* Lista Detallada de Cambios a Aplicar */}
        <div className="p-3 sm:p-5 overflow-y-auto flex-1 space-y-2.5 custom-scrollbar">
          <div className="text-xs font-bold text-slate-600 dark:text-slate-300 px-1">
            Detalle individual de cada modificación:
          </div>

          {itemsToApply.map((it, idx) => {
            const oldPrice = it.pos_price || 0;
            const newPrice = it.precio_venta_final || 0;
            const priceDiff = oldPrice > 0 ? newPrice - oldPrice : 0;
            const isCreation = Boolean(it.crear_como_nuevo);
            const isAdditional = it.action === "add_additional_code";

            return (
              <div
                key={it.id || idx}
                className="p-3 rounded-2xl bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs"
              >
                {/* Nombre y metadatos */}
                <div className="space-y-1 min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="w-5 h-5 rounded-full bg-slate-100 dark:bg-slate-800 text-[10px] font-bold flex items-center justify-center text-slate-700 dark:text-slate-300 shrink-0">
                      {idx + 1}
                    </span>
                    <h4 className="font-bold text-slate-900 dark:text-white truncate">
                      {it.nombre || it.descripcion}
                    </h4>

                    {isCreation ? (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                        Crear Nuevo en POS
                      </span>
                    ) : isAdditional ? (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-teal-100 text-teal-800 dark:bg-teal-950/60 dark:text-teal-300 border border-teal-200 dark:border-teal-800">
                        Actualizar + Código Adicional
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                        Actualizar Producto POS
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-3 text-[11px] text-slate-500 dark:text-slate-400 font-mono flex-wrap">
                    <span>Cód: <strong className="text-slate-700 dark:text-slate-300">{it.codigo || "S/C"}</strong></span>
                    {it.pos_item_id && <span>POS ID: <strong className="text-slate-700 dark:text-slate-300">#{it.pos_item_id}</strong></span>}
                    <span>Unidades a Ingresar: <strong className="text-slate-700 dark:text-slate-300">{it.cantidad || 1} {it.presentacion || it.unidad_code || "UN"}</strong></span>
                  </div>
                </div>

                {/* Comparativa de Precio Venta */}
                <div className="flex items-center gap-3 shrink-0 font-mono bg-slate-50 dark:bg-slate-950 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 justify-between md:justify-end">
                  {!isCreation && oldPrice > 0 ? (
                    <div className="text-right">
                      <span className="text-[10px] text-slate-400 block">Precio Actual:</span>
                      <span className="font-semibold text-slate-600 dark:text-slate-300">{formatCurrency(oldPrice)}</span>
                    </div>
                  ) : null}

                  {!isCreation && oldPrice > 0 ? (
                    <ArrowRight className="w-4 h-4 text-slate-400 shrink-0" />
                  ) : null}

                  <div className="text-right">
                    <span className="text-[10px] text-slate-400 block">{isCreation ? "Precio de Venta:" : "Nuevo Precio:"}</span>
                    <span className="font-black text-sm text-emerald-600 dark:text-emerald-400">{formatCurrency(newPrice)}</span>
                  </div>

                  {!isCreation && oldPrice > 0 && priceDiff !== 0 && (
                    <span className={`px-2 py-0.5 rounded text-[10.5px] font-bold flex items-center gap-0.5 ${
                      priceDiff > 0
                        ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
                        : "bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300"
                    }`}>
                      {priceDiff > 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                      {priceDiff > 0 ? `+${formatCurrency(priceDiff)}` : formatCurrency(priceDiff)}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer con los dos botones de confirmación definitiva */}
        <div className="p-4 sm:p-5 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
          <p className="text-xs text-slate-500 dark:text-slate-400 text-center sm:text-left">
            Al confirmar, se actualizarán los precios y el stock en el sistema POS externo de forma definitiva.
          </p>

          <div className="flex items-center gap-2.5 w-full sm:w-auto">
            <button
              type="button"
              onClick={onClose}
              disabled={isApplying}
              className="flex-1 sm:flex-none px-4 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-700 hover:text-slate-900 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-300 dark:hover:text-white rounded-xl text-xs font-bold transition cursor-pointer"
            >
              Volver a la Lista
            </button>

            <button
              type="button"
              onClick={onFinalConfirm}
              disabled={isApplying}
              className="flex-1 sm:flex-none px-6 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 shadow-lg shadow-emerald-900/30 cursor-pointer disabled:opacity-50"
            >
              {isApplying ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin text-white" />
                  <span>Sincronizando con POS...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>✓ Confirmar y Aplicar al POS Definitivamente</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function InvoiceReconciliationModal({
  isOpen,
  onClose,
  items = [],
  supplierName = "",
  invoiceNumber = "",
  onConfirm,
  isApplying = false,
}) {
  const [activeFilter, setActiveFilter] = useState("all"); // 'all', 'unresolved', 'matched', 'new'
  const [itemResolutions, setItemResolutions] = useState({});
  const [selectedItemsMap, setSelectedItemsMap] = useState({});

  // Sub-modales
  const [searchModalTargetItem, setSearchModalTargetItem] = useState(null);
  const [createProductTargetItem, setCreateProductTargetItem] = useState(null);
  const [isSummaryModalOpen, setIsSummaryModalOpen] = useState(false);
  const [preparedItemsToApply, setPreparedItemsToApply] = useState([]);

  // Función helper precisa para determinar si un código ya pertenece al producto POS
  const isCodeAlreadyOnProduct = useCallback((itemCode, posProduct) => {
    if (!itemCode || itemCode === "S/C" || String(itemCode).trim() === "") {
      return true; // No hay código que agregar como adicional
    }
    const cleanCode = String(itemCode).trim().toLowerCase();
    const primaryBarcode = String(posProduct?.barcode || "").trim().toLowerCase();
    const primaryItemNumber = String(posProduct?.item_number || "").trim().toLowerCase();

    if (cleanCode === primaryBarcode || cleanCode === primaryItemNumber) {
      return true;
    }

    const additional = Array.isArray(posProduct?.additional_numbers)
      ? posProduct.additional_numbers
      : Array.isArray(posProduct?.additional_barcodes)
      ? posProduct.additional_barcodes
      : [];

    return additional.some((c) => String(c).trim().toLowerCase() === cleanCode);
  }, []);

  // Inicializar resoluciones basándose en los items de la factura
  useEffect(() => {
    if (!isOpen || !items.length) return;

    const initialResolutions = {};
    const initialSelection = {};
    let hasUnresolved = false;

    items.forEach((it) => {
      const posMatch = it.matched_pos_item;
      if (posMatch) {
        const codeAlreadyExists = isCodeAlreadyOnProduct(it.codigo_barras, posMatch);
        const action = codeAlreadyExists ? "update_existing" : "add_additional_code";

        initialResolutions[it.id] = {
          action,
          pos_item_id: posMatch.item_id || posMatch.id,
          pos_name: posMatch.name,
          pos_barcode: posMatch.barcode || posMatch.item_number,
          pos_price: parseFloat(posMatch.sale_price || posMatch.unit_price) || 0,
          custom_name: it.descripcion,
          category: it.categoria || "FRUVER",
        };
        // Por defecto, ítems resueltos vienen pre-seleccionados
        initialSelection[it.id] = true;
      } else {
        hasUnresolved = true;
        initialResolutions[it.id] = {
          action: "unresolved",
          pos_item_id: null,
          pos_name: null,
          pos_barcode: null,
          pos_price: 0,
          custom_name: it.descripcion,
          category: it.categoria || "FRUVER",
        };
        initialSelection[it.id] = false;
      }
    });

    queueMicrotask(() => {
      setItemResolutions(initialResolutions);
      setSelectedItemsMap(initialSelection);
      setActiveFilter(hasUnresolved ? "unresolved" : "all");
    });
  }, [isOpen, items, isCodeAlreadyOnProduct]);

  // Contadores
  const counts = useMemo(() => {
    let matched = 0;
    let additionalCode = 0;
    let createNew = 0;
    let unresolved = 0;

    items.forEach((it) => {
      const res = itemResolutions[it.id];
      if (!res || res.action === "unresolved") {
        unresolved++;
      } else if (res.action === "update_existing") {
        matched++;
      } else if (res.action === "add_additional_code") {
        additionalCode++;
      } else if (res.action === "create_new") {
        createNew++;
      }
    });

    const resolvedCount = matched + additionalCode + createNew;
    const selectedCount = Object.keys(selectedItemsMap).filter(
      (id) => selectedItemsMap[id] && itemResolutions[id]?.action !== "unresolved"
    ).length;

    return {
      matched,
      additionalCode,
      createNew,
      unresolved,
      resolvedCount,
      selectedCount,
      total: items.length,
    };
  }, [items, itemResolutions, selectedItemsMap]);

  // Filtrado de items
  const filteredItems = useMemo(() => {
    return items.filter((it) => {
      const res = itemResolutions[it.id];
      if (activeFilter === "unresolved") return !res || res.action === "unresolved";
      if (activeFilter === "matched") return res?.action === "update_existing" || res?.action === "add_additional_code";
      if (activeFilter === "new") return res?.action === "create_new";
      return true;
    });
  }, [items, itemResolutions, activeFilter]);

  // Handlers de Selección
  const handleToggleSelectItem = (itemId) => {
    const res = itemResolutions[itemId];
    if (!res || res.action === "unresolved") return;

    setSelectedItemsMap((prev) => ({
      ...prev,
      [itemId]: !prev[itemId],
    }));
  };

  const handleToggleSelectAllResolved = () => {
    const areAllResolvedSelected = items
      .filter((it) => itemResolutions[it.id]?.action !== "unresolved")
      .every((it) => selectedItemsMap[it.id]);

    setSelectedItemsMap((prev) => {
      const updated = { ...prev };
      items.forEach((it) => {
        if (itemResolutions[it.id]?.action !== "unresolved") {
          updated[it.id] = !areAllResolvedSelected;
        }
      });
      return updated;
    });
  };

  const handleLinkProduct = (itemId, product) => {
    const item = items.find((i) => i.id === itemId);
    const codeAlreadyExists = isCodeAlreadyOnProduct(item?.codigo_barras, product);
    const action = codeAlreadyExists ? "update_existing" : "add_additional_code";

    setItemResolutions((prev) => ({
      ...prev,
      [itemId]: {
        ...prev[itemId],
        action,
        pos_item_id: product.id || product.item_id,
        pos_name: product.name,
        pos_barcode: product.item_number || product.barcode,
        pos_price: parseFloat(product.unit_price || product.sale_price) || 0,
      },
    }));

    // Auto-seleccionar al resolver
    setSelectedItemsMap((prev) => ({
      ...prev,
      [itemId]: true,
    }));
  };

  const handleProductCreatedFromModal = (newProduct) => {
    if (!createProductTargetItem) return;
    const targetId = createProductTargetItem.id;

    // Vincular inmediatamente el producto recién creado en CSOPOS
    setItemResolutions((prev) => ({
      ...prev,
      [targetId]: {
        action: "update_existing",
        pos_item_id: newProduct.id,
        pos_name: newProduct.name,
        pos_barcode: newProduct.item_number,
        pos_price: parseFloat(newProduct.unit_price) || 0,
        custom_name: newProduct.name,
        category: newProduct.category || "FRUVER",
      },
    }));

    setSelectedItemsMap((prev) => ({
      ...prev,
      [targetId]: true,
    }));

    setCreateProductTargetItem(null);
  };

  // Paso 1 de Confirmación: Prepara los ítems y abre el modal de Resumen de Doble Confirmación
  const handleOpenDoubleConfirmation = () => {
    const selectedItems = items.filter(
      (it) => selectedItemsMap[it.id] && itemResolutions[it.id]?.action !== "unresolved"
    );

    if (selectedItems.length === 0) return;

    const payloadItems = selectedItems.map((it) => {
      const res = itemResolutions[it.id] || {};
      const isCreateNew = res.action === "create_new" || !res.pos_item_id;

      return {
        ...it,
        crear_como_nuevo: isCreateNew,
        pos_item_id: res.pos_item_id ? String(res.pos_item_id) : null,
        pos_name: res.pos_name || null,
        pos_price: res.pos_price || 0,
        action: res.action,
        nombre: isCreateNew ? it.descripcion : (res.pos_name || it.descripcion),
        codigo: it.codigo_barras || null,
        precio_venta_final: Math.round(
          (it.modo_venta === "paquete" ? it.precio_venta_paquete : it.precio_venta_redondeado) ||
            it.precio_venta_calculado ||
            0,
        ),
      };
    });

    setPreparedItemsToApply(payloadItems);
    setIsSummaryModalOpen(true);
  };

  // Paso 2 Definitivo: Dispara la actualización real en el POS
  const handleExecuteDefinitiveConfirm = async () => {
    if (!preparedItemsToApply || preparedItemsToApply.length === 0) return;
    setIsSummaryModalOpen(false);
    await onConfirm?.(preparedItemsToApply);
  };

  if (!isOpen) return null;

  return (
    <>
      <div
        role="dialog"
        aria-modal="true"
        className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 animate-in fade-in duration-150"
        onClick={onClose}
      >
        <div
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl sm:rounded-3xl w-full max-w-5xl shadow-2xl flex flex-col max-h-[95dvh] sm:max-h-[90vh] overflow-hidden text-slate-800 dark:text-slate-100 animate-in zoom-in-95 duration-200"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Encabezado Compacto y Ergonómico (adaptable a móviles y pantallas grandes) */}
          <div className="bg-slate-50 dark:bg-slate-950 px-3 py-2.5 sm:px-5 sm:py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="p-2 sm:p-2.5 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 shrink-0">
                <ShieldCheck className="w-5 h-5 sm:w-6 sm:h-6" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-extrabold text-sm sm:text-lg text-slate-900 dark:text-white truncate">
                    Conciliación Catálogo POS
                  </h3>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300 border border-blue-200 dark:border-blue-500/30 shrink-0">
                    {items.length} artículos
                  </span>
                </div>
                <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                  Proveedor: <strong className="text-slate-800 dark:text-slate-200">{supplierName || "Factura"}</strong>
                  {invoiceNumber && <> &bull; Factura #: <strong className="text-slate-800 dark:text-slate-200">{invoiceNumber}</strong></>}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-white transition cursor-pointer shrink-0"
              title="Cerrar ventana"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Barra de Filtros, Selección Masiva y Estado (scroll horizontal fluido en móviles) */}
          <div className="bg-slate-100/70 dark:bg-slate-950/60 border-b border-slate-200 dark:border-slate-800/80 px-3 py-2 sm:px-4 sm:py-2.5 flex items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5 flex-1 min-w-0">
              <button
                type="button"
                onClick={() => setActiveFilter("all")}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold shrink-0 transition cursor-pointer ${
                  activeFilter === "all"
                    ? "bg-emerald-600 text-white shadow-xs"
                    : "bg-white dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700/60 hover:text-slate-900 dark:hover:text-white"
                }`}
              >
                Todos ({counts.total})
              </button>

              {counts.unresolved > 0 && (
                <button
                  type="button"
                  onClick={() => setActiveFilter("unresolved")}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold shrink-0 transition cursor-pointer flex items-center gap-1 ${
                    activeFilter === "unresolved"
                      ? "bg-amber-600 text-white shadow-xs"
                      : "bg-amber-50 text-amber-800 border border-amber-300 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-500/40 hover:bg-amber-100 dark:hover:bg-amber-900/50"
                  }`}
                >
                  <AlertCircle className="w-3.5 h-3.5" />
                  <span>Por Revisar ({counts.unresolved})</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => setActiveFilter("matched")}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold shrink-0 transition cursor-pointer flex items-center gap-1 ${
                  activeFilter === "matched"
                    ? "bg-teal-600 text-white shadow-xs"
                    : "bg-white dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700/60 hover:text-slate-900 dark:hover:text-white"
                }`}
              >
                <CheckCircle2 className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                <span>Vinculados ({counts.matched + counts.additionalCode})</span>
              </button>

              {counts.createNew > 0 && (
                <button
                  type="button"
                  onClick={() => setActiveFilter("new")}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold shrink-0 transition cursor-pointer flex items-center gap-1 ${
                    activeFilter === "new"
                      ? "bg-blue-600 text-white shadow-xs"
                      : "bg-white dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700/60 hover:text-slate-900 dark:hover:text-white"
                  }`}
                >
                  <PlusCircle className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                  <span>Nuevos ({counts.createNew})</span>
                </button>
              )}
            </div>

            {/* Checkbox de Selección Masiva de Resueltos */}
            <label className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-300 cursor-pointer select-none shrink-0 pl-2 border-l border-slate-300 dark:border-slate-700">
              <input
                type="checkbox"
                checked={counts.selectedCount > 0 && counts.selectedCount === counts.resolvedCount}
                onChange={handleToggleSelectAllResolved}
                className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer"
              />
              <span className="hidden sm:inline">Seleccionar resueltos</span>
              <span className="font-mono text-[11px] text-emerald-600 dark:text-emerald-400 font-bold">
                ({counts.selectedCount}/{counts.resolvedCount})
              </span>
            </label>
          </div>

          {/* Cuerpo con Scroll: Lista de Artículos */}
          <div className="flex-1 overflow-y-auto custom-scrollbar p-3 sm:p-5 space-y-3">
            {filteredItems.length === 0 ? (
              <div className="py-12 text-center text-slate-500 dark:text-slate-400 text-sm">
                No hay productos en esta vista de filtro.
              </div>
            ) : (
              <div className="space-y-2.5">
                {filteredItems.map((it, idx) => {
                  const res = itemResolutions[it.id] || {};
                  const isUnresolved = !res.action || res.action === "unresolved";
                  const isAdditional = res.action === "add_additional_code";
                  const isNew = res.action === "create_new";
                  const isSelected = Boolean(selectedItemsMap[it.id]);

                  const newCalculatedPrice = Math.round(
                    (it.modo_venta === "paquete" ? it.precio_venta_paquete : it.precio_venta_redondeado) ||
                      it.precio_venta_calculado ||
                      0,
                  );
                  const currentPosPrice = res.pos_price || 0;
                  const priceDiff = currentPosPrice > 0 ? newCalculatedPrice - currentPosPrice : 0;

                  return (
                    <div
                      key={it.id}
                      className={`rounded-2xl p-3.5 border transition ${
                        isUnresolved
                          ? "bg-amber-50/70 dark:bg-amber-950/20 border-amber-300 dark:border-amber-500/50 shadow-xs"
                          : isSelected
                          ? "bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-300 dark:border-emerald-600/50 shadow-xs"
                          : "bg-slate-50/50 dark:bg-slate-950/40 border-slate-200 dark:border-slate-800 opacity-70"
                      }`}
                    >
                      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-center">
                        {/* Checkbox de Selección y Datos Factura (Col 1-5) */}
                        <div className="lg:col-span-5 space-y-1.5 flex items-start gap-2.5">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            disabled={isUnresolved}
                            onChange={() => handleToggleSelectItem(it.id)}
                            title={
                              isUnresolved
                                ? "Resuelve o vincula primero este artículo para poder modificarlo"
                                : "Seleccionar para aplicar modificación a POS"
                            }
                            className="mt-1 w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                          />

                          <div className="min-w-0 flex-1 space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="w-5 h-5 rounded-full bg-slate-200 dark:bg-slate-800 text-[10px] font-bold flex items-center justify-center text-slate-700 dark:text-slate-300 shrink-0">
                                {idx + 1}
                              </span>
                              <span className="text-[10px] font-mono font-bold text-slate-600 dark:text-slate-400 bg-white dark:bg-slate-900 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-800">
                                Cód: {it.codigo_barras || "S/C"}
                              </span>
                              <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">
                                Cant: {it.cantidad} {it.presentacion}
                              </span>
                            </div>

                            <h4 className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white break-words leading-snug">
                              {it.descripcion}
                            </h4>

                            <div className="flex items-center gap-2 text-xs">
                              <span className="text-slate-500 dark:text-slate-400 text-[11px]">Nuevo Precio Venta:</span>
                              <strong className="text-emerald-600 dark:text-emerald-400 font-black font-mono text-sm">
                                {formatCurrency(newCalculatedPrice)}
                              </strong>
                            </div>
                          </div>
                        </div>

                        {/* Flecha Conectora (Col 6) */}
                        <div className="hidden lg:flex lg:col-span-1 items-center justify-center text-slate-400 dark:text-slate-500">
                          <ArrowRight className="w-5 h-5" />
                        </div>

                        {/* 2. Coincidencia en Sistema POS (Col 7-9) */}
                        <div className="lg:col-span-4 space-y-1.5">
                          {isNew ? (
                            <div className="p-2.5 rounded-xl bg-blue-100/60 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-500/30 text-xs">
                              <span className="text-blue-800 dark:text-blue-300 font-bold block flex items-center gap-1">
                                <PlusCircle className="w-3.5 h-3.5" /> Se creará como producto nuevo en POS
                              </span>
                              <span className="text-[11px] text-slate-600 dark:text-slate-400 block mt-0.5">
                                Nombre: {res.custom_name || it.descripcion}
                              </span>
                            </div>
                          ) : res.pos_name ? (
                            <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs space-y-1 shadow-xs">
                              <div className="flex items-center justify-between gap-1">
                                <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase flex items-center gap-1 truncate">
                                  <Package className="w-3 h-3" /> POS: {res.pos_name}
                                </span>
                                <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400 shrink-0">
                                  PLU: {res.pos_barcode || "N/A"}
                                </span>
                              </div>

                              <div className="flex items-center justify-between text-[11px] text-slate-600 dark:text-slate-300">
                                <span>Precio Actual POS: <strong>{formatCurrency(currentPosPrice)}</strong></span>
                                {priceDiff !== 0 ? (
                                  <span className={`font-bold ${priceDiff > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                                    {priceDiff > 0 ? `+${formatCurrency(priceDiff)}` : formatCurrency(priceDiff)}
                                  </span>
                                ) : (
                                  <span className="text-[10px] text-slate-400 font-medium">Sin cambio</span>
                                )}
                              </div>

                              {/* Distinción clara entre código existente vs adicional */}
                              {isAdditional ? (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9.5px] font-bold bg-teal-100 text-teal-800 dark:bg-teal-500/20 dark:text-teal-300 border border-teal-200 dark:border-teal-500/30">
                                  <Link2 className="w-3 h-3" /> Nuevo código {it.codigo_barras} se asociará a Números Adicionales
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9.5px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/30">
                                  <CheckCircle2 className="w-3 h-3" /> Producto vinculado directamente (código ya existente)
                                </span>
                              )}
                            </div>
                          ) : (
                            <div className="p-2.5 rounded-xl bg-amber-100/60 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-500/30 text-xs">
                              <span className="text-amber-800 dark:text-amber-300 font-bold block flex items-center gap-1">
                                <AlertCircle className="w-3.5 h-3.5" /> No vinculado con el catálogo POS
                              </span>
                              <span className="text-[11px] text-slate-600 dark:text-slate-400 block mt-0.5">
                                Búscalo en el catálogo o créalo como nuevo.
                              </span>
                            </div>
                          )}
                        </div>

                        {/* 3. Acciones de Vinculación (Col 10-12) */}
                        <div className="lg:col-span-2 flex flex-col items-end gap-1.5 justify-center">
                          {isUnresolved ? (
                            <div className="w-full grid grid-cols-2 lg:grid-cols-1 gap-1.5">
                              <button
                                type="button"
                                onClick={() => setSearchModalTargetItem(it)}
                                className="w-full px-2.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-xs cursor-pointer"
                              >
                                <Search className="w-3.5 h-3.5" />
                                <span>Buscar en POS</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => setCreateProductTargetItem(it)}
                                className="w-full px-2.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-xs cursor-pointer"
                              >
                                <PlusCircle className="w-3.5 h-3.5" />
                                <span>Crear Nuevo</span>
                              </button>
                            </div>
                          ) : (
                            <div className="w-full space-y-1 text-right">
                              <button
                                type="button"
                                onClick={() => setSearchModalTargetItem(it)}
                                className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline block cursor-pointer w-full text-right"
                              >
                                Cambiar asociación
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setItemResolutions((prev) => ({
                                    ...prev,
                                    [it.id]: { action: "unresolved", pos_item_id: null, pos_name: null },
                                  }));
                                  setSelectedItemsMap((prev) => ({
                                    ...prev,
                                    [it.id]: false,
                                  }));
                                }}
                                className="text-[10.5px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 underline block cursor-pointer w-full text-right"
                              >
                                Desvincular
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer Compacto y Ergonómico con Resumen (ideal para móviles y pantallas grandes) */}
          <div className="bg-slate-50 dark:bg-slate-950 px-3 py-2.5 sm:px-5 sm:py-3.5 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-1.5 text-xs text-slate-700 dark:text-slate-300 min-w-0">
              <span className="font-bold text-slate-900 dark:text-white hidden sm:inline">Para aplicar:</span>
              <span className="px-2 py-0.5 rounded-full text-xs font-black bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-700 shrink-0">
                {counts.selectedCount} sel.
              </span>
              <span className="text-[11px] text-slate-500 dark:text-slate-400 truncate hidden md:inline">
                (de {counts.resolvedCount} resueltos)
              </span>
              {counts.unresolved > 0 && (
                <span className="text-[10.5px] text-amber-600 dark:text-amber-400 font-medium truncate hidden xl:inline">
                  &bull; {counts.unresolved} pendientes se mantienen en factura
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={onClose}
                disabled={isApplying}
                className="px-3 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold transition cursor-pointer"
              >
                Regresar
              </button>

              <button
                type="button"
                onClick={handleOpenDoubleConfirmation}
                disabled={isApplying || counts.selectedCount === 0}
                className={`px-3.5 sm:px-6 py-2 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-md cursor-pointer ${
                  counts.selectedCount === 0
                    ? "bg-slate-200 text-slate-400 dark:bg-slate-800 dark:text-slate-500 cursor-not-allowed border border-slate-300 dark:border-slate-700"
                    : "bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-emerald-600/30"
                }`}
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>
                  {`Aplicar (${counts.selectedCount})`}
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Modal Dedicado de Búsqueda Clara en Catálogo POS */}
      <CatalogSearchModal
        isOpen={Boolean(searchModalTargetItem)}
        onClose={() => setSearchModalTargetItem(null)}
        targetItem={searchModalTargetItem}
        onSelectProduct={handleLinkProduct}
        onCreateNewInstead={(target) => {
          setSearchModalTargetItem(null);
          setCreateProductTargetItem(target);
        }}
      />

      {/* Modal de Doble Confirmación con Resumen Ejecutivo de Cambios */}
      <ConfirmationSummaryModal
        isOpen={isSummaryModalOpen}
        onClose={() => setIsSummaryModalOpen(false)}
        itemsToApply={preparedItemsToApply}
        supplierName={supplierName}
        invoiceNumber={invoiceNumber}
        onFinalConfirm={handleExecuteDefinitiveConfirm}
        isApplying={isApplying}
      />

      {/* Modal Completo de Creación de Producto (mismo formulario oficial de catálogo) */}
      {createProductTargetItem && (
        <ProductFormModal
          isOpen={Boolean(createProductTargetItem)}
          onClose={() => setCreateProductTargetItem(null)}
          onSaved={handleProductCreatedFromModal}
          editingProduct={{
            name: createProductTargetItem.descripcion || "",
            item_number: createProductTargetItem.codigo_barras || "",
            cost_price: String(
              createProductTargetItem.costo_unitario_neto ||
                createProductTargetItem.costo_presentacion ||
                ""
            ),
            unit_price: String(
              Math.round(
                (createProductTargetItem.modo_venta === "paquete"
                  ? createProductTargetItem.precio_venta_paquete
                  : createProductTargetItem.precio_venta_redondeado) ||
                  createProductTargetItem.precio_venta_calculado ||
                  0
              )
            ),
            unit_code: createProductTargetItem.unidad_pos || "UN",
            category: createProductTargetItem.categoria || "FRUVER",
            profit_percentage: createProductTargetItem.margen_ganancia || 30,
            stock_quantity: String(createProductTargetItem.cantidad || "0"),
          }}
        />
      )}
    </>
  );
}
