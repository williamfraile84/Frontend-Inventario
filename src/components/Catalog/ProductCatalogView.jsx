import React, { useState, useEffect, useCallback } from "react";
import {
  PackagePlus,
  Search,
  RefreshCw,
  Edit,
  Barcode,
  Tag,
  Package,
  CheckCircle2,
  Filter,
  DollarSign,
  Layers,
  History,
  Sparkles,
  Camera,
  ExternalLink,
  Database,
  AlertCircle,
  Hash,
} from "lucide-react";
import { catalogService, productService } from "../../services/api";
import ProductFormModal from "./ProductFormModal";
import BarcodeScannerModal from "../common/BarcodeScannerModal";
import { useLoading } from "../../context/LoadingContext";
import { useToast } from "../../context/ToastContext";

export function decodeHtml(text) {
  if (!text || typeof text !== "string") return text || "";
  if (!text.includes("&")) return text;
  try {
    const doc = new DOMParser().parseFromString(text, "text/html");
    const decoded = doc.body.textContent || "";
    if (decoded.includes("&")) {
      const doc2 = new DOMParser().parseFromString(decoded, "text/html");
      return doc2.body.textContent || decoded;
    }
    return decoded;
  } catch {
    return text
      .replace(/&Eacute;/g, "É")
      .replace(/&eacute;/g, "é")
      .replace(/&Aacute;/g, "Á")
      .replace(/&aacute;/g, "á")
      .replace(/&Iacute;/g, "Í")
      .replace(/&iacute;/g, "í")
      .replace(/&Oacute;/g, "Ó")
      .replace(/&oacute;/g, "ó")
      .replace(/&Uacute;/g, "Ú")
      .replace(/&uacute;/g, "ú")
      .replace(/&Ntilde;/g, "Ñ")
      .replace(/&ntilde;/g, "ñ")
      .replace(/&amp;/g, "&");
  }
}

export default function ProductCatalogView({ onShowToast }) {
  const { showLoader, hideLoader } = useLoading();
  const toast = useToast();
  const notify = onShowToast || toast.showToast;

  // Vista activa: "csopos" | "history"
  const [activeSubView, setActiveSubView] = useState("csopos");

  // Estado del Catálogo Local (Historial Registrado)
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("TODAS");

  // Estado de CSOPOS (Búsqueda y edición en vivo)
  const [csoposSearchQuery, setCsoposSearchQuery] = useState("");
  const [csoposItems, setCsoposItems] = useState([]);
  const [csoposLoading, setCsoposLoading] = useState(false);
  const [isCsoposScannerOpen, setIsCsoposScannerOpen] = useState(false);

  // Modal de Crear / Editar
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);

  // Carga del Historial Local
  const fetchCatalog = useCallback(
    async (showOverlay = false) => {
      setLoading(true);
      if (showOverlay) {
        showLoader({
          title: "Cargando Catálogo",
          message: "Sincronizando historial registrado desde la base de datos...",
          iconType: "layers",
        });
      }
      try {
        const [prods, cats] = await Promise.all([
          catalogService.getProducts({
            query: searchQuery,
            category: selectedCategory === "TODAS" ? "" : selectedCategory,
          }),
          catalogService.getCategories(),
        ]);
        const mappedProds = (prods || []).map((p) => ({
          ...p,
          name: decodeHtml(p.name),
          category: decodeHtml(p.category),
          description: decodeHtml(p.description),
        }));
        setProducts(mappedProds);
        setCategories((cats || []).map((c) => decodeHtml(c)));
      } catch (err) {
        console.error(err);
        notify({
          type: "error",
          title: "Error de Carga",
          message: "No se pudo sincronizar el historial de productos.",
        });
      } finally {
        setLoading(false);
        if (showOverlay) {
          hideLoader();
        }
      }
    },
    [searchQuery, selectedCategory, notify, showLoader, hideLoader]
  );

  // Carga de CSOPOS en Vivo
  const fetchCsoposCatalog = useCallback(
    async (query = "", showOverlay = false) => {
      setCsoposLoading(true);
      if (showOverlay) {
        showLoader({
          title: "Consultando CSOPOS",
          message: query
            ? `Buscando "${query}" en el catálogo en vivo del POS...`
            : "Consultando productos en vivo de CSOPOS...",
          iconType: "search",
        });
      }
      try {
        const res = await productService.searchProducts(query);
        const mapped = (res.items || []).map((it) => ({
          ...it,
          name: decodeHtml(it.name),
          category: decodeHtml(it.category),
        }));
        setCsoposItems(mapped);
      } catch (err) {
        console.error(err);
        notify({
          type: "error",
          title: "Error en CSOPOS",
          message: "No se pudo consultar el catálogo en línea de CSOPOS.",
        });
      } finally {
        setCsoposLoading(false);
        if (showOverlay) {
          hideLoader();
        }
      }
    },
    [notify, showLoader, hideLoader]
  );

  useEffect(() => {
    fetchCatalog(false);
  }, [fetchCatalog]);

  useEffect(() => {
    // Si estamos en la pestaña CSOPOS y aún no hemos cargado artículos, cargar lote inicial
    if (activeSubView === "csopos" && csoposItems.length === 0) {
      fetchCsoposCatalog("", false);
    }
  }, [activeSubView, csoposItems.length, fetchCsoposCatalog]);

  const handleOpenCreate = () => {
    setEditingProduct(null);
    setIsModalOpen(true);
  };

  const handleOpenEditLocal = (product) => {
    setEditingProduct(product);
    setIsModalOpen(true);
  };

  const handleEditCsoposProduct = async (item) => {
    showLoader({
      title: "Consultando CSOPOS",
      message: `Obteniendo datos de "${item.name}"...`,
      submessage: "Cargando precios, stock y códigos adicionales...",
      iconType: "sparkles",
    });
    try {
      // 1. Obtener detalles completos desde el endpoint GET /api/products/csopos/{item_id}
      let details = null;
      try {
        details = await productService.getPosItemDetails(item.item_id);
      } catch (detailErr) {
        console.warn("Fallo getPosItemDetails, usando datos del listado:", detailErr);
      }

      // 2. Comprobar si ya existe en la base de datos local
      const localMatch = products.find(
        (p) =>
          (p.pos_item_id && String(p.pos_item_id) === String(item.item_id)) ||
          (p.item_number && p.item_number === item.barcode)
      );

      const productToEdit = {
        id: localMatch ? localMatch.id : undefined,
        pos_item_id: item.item_id,
        item_id: item.item_id,
        item_number: (details && details.item_number) || item.barcode || "",
        name: decodeHtml((details && details.name) || item.name || ""),
        category: decodeHtml((details && details.category) || item.category || "General"),
        category_code: details?.category_code || localMatch?.category_code || "",
        department_code: localMatch?.department_code || "",
        cost_price: details ? details.cost_price : (item.cost_price || 0),
        unit_price: details ? details.unit_price : (item.sale_price || 0),
        unit_code: (details && details.unit_code) || localMatch?.unit_code || "UN",
        stock_quantity: details ? details.stock_quantity : (parseFloat(item.stock) || 0),
        description: decodeHtml((details && details.description) || localMatch?.description || ""),
        profit_percentage: (details && details.profit_percentage) || localMatch?.profit_percentage || 30,
        additional_numbers: (details && details.additional_numbers) || localMatch?.additional_numbers || [],
      };

      setEditingProduct(productToEdit);
      setIsModalOpen(true);
    } catch (err) {
      console.error(err);
      notify({
        type: "error",
        title: "Error al abrir producto",
        message: "No se pudieron obtener los detalles del producto de CSOPOS.",
      });
    } finally {
      hideLoader();
    }
  };

  const handleSaved = () => {
    fetchCatalog(false);
    if (activeSubView === "csopos") {
      fetchCsoposCatalog(csoposSearchQuery, false);
    }
    notify({
      type: "success",
      title: "Catálogo Actualizado",
      message: editingProduct
        ? "Producto guardado y sincronizado exitosamente en CSOPOS."
        : "Nuevo producto creado e integrado con el POS.",
    });
  };

  const handleCsoposBarcodeScanned = (scannedCode) => {
    if (!scannedCode) return;
    setCsoposSearchQuery(scannedCode);
    setIsCsoposScannerOpen(false);
    fetchCsoposCatalog(scannedCode, true);
  };

  const handleCsoposSearchSubmit = (e) => {
    e?.preventDefault();
    fetchCsoposCatalog(csoposSearchQuery, true);
  };

  return (
    <div className="space-y-5">
      {/* Top Banner, View Switcher Tabs & Action Button */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2">
            <Package className="w-6 h-6 text-emerald-400" />
            Catálogo Maestro de Productos (Módulo POS)
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Búsqueda y edición en vivo en CSOPOS con sincronización del historial registrado
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto">
          {/* View Switcher Tabs (Mismo diseño que InvoiceProcessor) */}
          <div className="flex items-center gap-1.5 bg-slate-950 p-1.5 rounded-xl border border-slate-800 self-start sm:self-auto">
            <button
              onClick={() => setActiveSubView("csopos")}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                activeSubView === "csopos"
                  ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/30"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Explorar y Editar en CSOPOS</span>
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
              {products.length > 0 && (
                <span className="ml-1 px-1.5 py-0.2 bg-emerald-950 text-emerald-400 border border-emerald-800/60 rounded-full text-[10px]">
                  {products.length}
                </span>
              )}
            </button>
          </div>

          <button
            onClick={handleOpenCreate}
            className="w-full sm:w-auto px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs sm:text-sm font-bold shadow-lg shadow-emerald-600/30 flex items-center justify-center gap-2 transition hover:scale-[1.02] active:scale-[0.98]"
          >
            <PackagePlus className="w-4 h-4" />
            <span>Nuevo Producto</span>
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* PESTAÑA 1: EXPLORAR Y EDITAR EN CSOPOS                                  */}
      {/* ========================================================================= */}
      {activeSubView === "csopos" ? (
        <div className="space-y-4">
          {/* Barra de Búsqueda y Escáner de CSOPOS */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 shadow-lg flex flex-col md:flex-row gap-3 items-stretch md:items-center">
            <form onSubmit={handleCsoposSearchSubmit} className="relative flex-1">
              <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
              <input
                type="text"
                value={csoposSearchQuery}
                onChange={(e) => setCsoposSearchQuery(e.target.value)}
                placeholder="Buscar en CSOPOS por nombre o código de barras (ej. Manzana, 770...)..."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-24 py-2 text-white text-xs focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500 outline-none transition"
              />
              <button
                type="submit"
                className="absolute right-1.5 top-1.5 bottom-1.5 px-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1 transition"
              >
                <Search className="w-3.5 h-3.5" />
                <span>Buscar</span>
              </button>
            </form>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsCsoposScannerOpen(true)}
                className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-emerald-400 border border-slate-700 text-xs font-semibold transition"
                title="Escanear código con la cámara para buscar en CSOPOS"
              >
                <Camera className="w-4 h-4" />
                <span>Cámara Escáner</span>
              </button>

              <button
                type="button"
                onClick={() => fetchCsoposCatalog(csoposSearchQuery, true)}
                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                title="Refrescar catálogo CSOPOS"
              >
                <RefreshCw
                  className={`w-4 h-4 ${csoposLoading ? "animate-spin text-emerald-400" : ""}`}
                />
              </button>
            </div>
          </div>

          {/* Estado Informativo */}
          <div className="flex items-center justify-between text-xs text-slate-400 px-1">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              Catálogo en vivo de CSOPOS ({csoposItems.length} artículos encontrados)
            </span>
            {csoposSearchQuery && (
              <button
                onClick={() => {
                  setCsoposSearchQuery("");
                  fetchCsoposCatalog("", true);
                }}
                className="text-emerald-400 hover:underline text-[11px]"
              >
                Limpiar búsqueda y ver primeros productos
              </button>
            )}
          </div>

          {/* Tabla y Tarjetas de CSOPOS */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
            {csoposLoading && csoposItems.length === 0 ? (
              <div className="p-12 text-center text-slate-400 flex flex-col items-center justify-center">
                <RefreshCw className="w-8 h-8 animate-spin text-emerald-400 mb-2" />
                <p className="text-sm font-medium">Consultando catálogo en CSOPOS...</p>
              </div>
            ) : csoposItems.length === 0 ? (
              <div className="p-12 text-center text-slate-500">
                <Package className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <h4 className="text-sm font-bold text-slate-300">
                  No se encontraron productos en CSOPOS
                </h4>
                <p className="text-xs mt-1">
                  Prueba buscando por otra palabra o código de barras, o crea un nuevo producto.
                </p>
              </div>
            ) : (
              <>
                {/* 1. VISTA DE TABLA PARA ESCRITORIO (DESKTOP) */}
                <div className="hidden lg:block overflow-x-auto">
                  <table className="w-full text-left text-xs text-slate-300">
                    <thead className="bg-slate-950/80 border-b border-slate-800 text-slate-400 uppercase text-[10px] tracking-wider font-semibold">
                      <tr>
                        <th className="py-3 px-4">Artículo</th>
                        <th className="py-3 px-4">Código / Barcode</th>
                        <th className="py-3 px-4">Categoría</th>
                        <th className="py-3 px-4 text-right">Costo (Sin Imp)</th>
                        <th className="py-3 px-4 text-right">Precio Venta POS</th>
                        <th className="py-3 px-4 text-right">Stock</th>
                        <th className="py-3 px-4 text-center">Acción</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 font-medium">
                      {csoposItems.map((item, idx) => (
                        <tr key={item.item_id || idx} className="hover:bg-slate-800/40 transition">
                          {/* Nombre del Artículo */}
                          <td className="py-3 px-4">
                            <div className="font-bold text-white text-sm leading-tight">
                              {item.name}
                            </div>
                            <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                              ID CSOPOS: #{item.item_id}
                            </div>
                          </td>

                          {/* Código de Barras */}
                          <td className="py-3 px-4">
                            {item.barcode ? (
                              <span className="font-mono text-xs text-emerald-300 bg-emerald-950/50 border border-emerald-500/30 px-2 py-0.5 rounded-md font-bold">
                                {item.barcode}
                              </span>
                            ) : (
                              <span className="text-[10px] text-slate-500 italic">
                                Sin código
                              </span>
                            )}
                          </td>

                          {/* Categoría */}
                          <td className="py-3 px-4">
                            <span className="bg-slate-800 px-2 py-0.5 rounded-full text-[11px] text-slate-300 border border-slate-700">
                              {item.category || "General"}
                            </span>
                          </td>

                          {/* Costo */}
                          <td className="py-3 px-4 text-right font-mono text-slate-400">
                            ${item.cost_price ? item.cost_price.toLocaleString("es-CO") : "0"}
                          </td>

                          {/* Precio Venta POS */}
                          <td className="py-3 px-4 text-right font-mono font-bold text-emerald-400 text-sm">
                            {item.formatted_sale_price ||
                              `$${item.sale_price?.toLocaleString("es-CO")}`}
                          </td>

                          {/* Stock */}
                          <td className="py-3 px-4 text-right font-mono">
                            <span
                              className={`px-2 py-0.5 rounded text-xs font-bold ${
                                parseFloat(item.stock) > 0
                                  ? "bg-emerald-950/60 text-emerald-300 border border-emerald-500/30"
                                  : "bg-slate-800 text-slate-400"
                              }`}
                            >
                              {item.stock ?? 0}
                            </span>
                          </td>

                          {/* Botón Editar en CSOPOS */}
                          <td className="py-3 px-4 text-center">
                            <button
                              onClick={() => handleEditCsoposProduct(item)}
                              className="px-3 py-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600 text-emerald-300 hover:text-white border border-emerald-500/30 transition inline-flex items-center gap-1.5 text-xs font-bold shadow-sm active:scale-95"
                              title="Editar producto en CSOPOS"
                            >
                              <Edit className="w-3.5 h-3.5" />
                              <span>Editar en CSOPOS</span>
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* 2. VISTA DE TARJETAS PARA MÓVILES */}
                <div className="block lg:hidden divide-y divide-slate-800">
                  {csoposItems.map((item, idx) => (
                    <div
                      key={item.item_id || idx}
                      className="p-4 space-y-3 hover:bg-slate-800/20 transition"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="bg-slate-800 px-2.5 py-0.5 rounded-full text-[10px] font-semibold text-slate-300 border border-slate-700">
                          {item.category || "General"}
                        </span>

                        <button
                          onClick={() => handleEditCsoposProduct(item)}
                          className="px-3 py-1.5 rounded-xl bg-emerald-600/20 hover:bg-emerald-600 text-emerald-300 hover:text-white border border-emerald-500/30 transition inline-flex items-center gap-1.5 text-xs font-bold shadow-sm active:scale-95"
                        >
                          <Edit className="w-3.5 h-3.5" />
                          <span>Editar en CSOPOS</span>
                        </button>
                      </div>

                      <div>
                        <h4 className="font-bold text-white text-base leading-snug">
                          {item.name}
                        </h4>
                        <span className="text-[10px] text-slate-500 font-mono">
                          ID: #{item.item_id}
                        </span>
                      </div>

                      <div className="flex items-center flex-wrap gap-1.5">
                        {item.barcode ? (
                          <div className="inline-flex items-center gap-1.5 font-mono text-xs text-emerald-300 bg-emerald-950/60 border border-emerald-500/30 px-2.5 py-1 rounded-lg font-bold">
                            <Barcode className="w-3.5 h-3.5 text-emerald-400" />
                            <span>{item.barcode}</span>
                          </div>
                        ) : (
                          <span className="text-[11px] text-slate-500 italic">
                            Sin código de barras
                          </span>
                        )}
                      </div>

                      {/* Banner Financiero */}
                      <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className="flex flex-col">
                            <span className="text-[9px] uppercase font-semibold text-slate-400">
                              Costo
                            </span>
                            <span className="text-xs font-mono font-medium text-slate-300">
                              $
                              {item.cost_price
                                ? item.cost_price.toLocaleString("es-CO")
                                : "0"}
                            </span>
                          </div>
                          <div className="h-6 w-[1px] bg-slate-800" />
                          <div className="flex flex-col">
                            <span className="text-[9px] uppercase font-semibold text-slate-400">
                              Stock
                            </span>
                            <span className="text-xs font-mono font-bold text-slate-200">
                              {item.stock ?? 0}
                            </span>
                          </div>
                        </div>

                        <div className="flex flex-col text-right">
                          <span className="text-[9px] uppercase font-semibold text-emerald-400/90">
                            Precio Venta POS
                          </span>
                          <span className="text-base font-black font-mono text-emerald-400">
                            {item.formatted_sale_price ||
                              `$${item.sale_price?.toLocaleString("es-CO")}`}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      ) : (
        /* ========================================================================= */
        /* PESTAÑA 2: HISTORIAL REGISTRADO (Base de Datos Local)                      */
        /* ========================================================================= */
        <div className="space-y-4">
          {/* Search and Filters Bar */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 shadow-lg flex flex-col sm:flex-row gap-3">
            {/* Input Buscador */}
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar por nombre, código principal o código adicional..."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2 text-white text-xs focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500 outline-none transition"
              />
            </div>

            {/* Filtro Categoría */}
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-slate-500 shrink-0" />
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white text-xs focus:ring-2 focus:ring-emerald-500/40 outline-none"
              >
                <option value="TODAS">Todas las Categorías</option>
                {categories.map((c, i) => (
                  <option key={i} value={c}>
                    {c}
                  </option>
                ))}
              </select>

              <button
                onClick={() => fetchCatalog(true)}
                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                title="Refrescar catálogo local"
              >
                <RefreshCw
                  className={`w-4 h-4 ${loading ? "animate-spin text-emerald-400" : ""}`}
                />
              </button>
            </div>
          </div>

          {/* Tabla y Tarjetas de Historial Registrado */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
            {loading && products.length === 0 ? (
              <div className="p-12 text-center text-slate-400 flex flex-col items-center justify-center">
                <RefreshCw className="w-8 h-8 animate-spin text-emerald-400 mb-2" />
                <p className="text-sm font-medium">Cargando historial registrado...</p>
              </div>
            ) : products.length === 0 ? (
              <div className="p-12 text-center text-slate-500">
                <Package className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <h4 className="text-sm font-bold text-slate-300">
                  No se encontraron productos registrados
                </h4>
                <p className="text-xs mt-1">
                  Crea un nuevo producto o edita un artículo en CSOPOS para sincronizarlo.
                </p>
              </div>
            ) : (
              <>
                {/* 1. VISTA DE TABLA PARA ESCRITORIO (DESKTOP) */}
                <div className="hidden lg:block overflow-x-auto">
                  <table className="w-full text-left text-xs text-slate-300">
                    <thead className="bg-slate-950/80 border-b border-slate-800 text-slate-400 uppercase text-[10px] tracking-wider font-semibold">
                      <tr>
                        <th className="py-3 px-4">Artículo</th>
                        <th className="py-3 px-4">
                          Códigos de Barra (Principal / Adicionales)
                        </th>
                        <th className="py-3 px-4">Categoría</th>
                        <th className="py-3 px-4">Unidad</th>
                        <th className="py-3 px-4 text-right">Costo (Sin Imp)</th>
                        <th className="py-3 px-4 text-right">Precio Venta</th>
                        <th className="py-3 px-4 text-right">Stock</th>
                        <th className="py-3 px-4 text-center">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 font-medium">
                      {products.map((p) => (
                        <tr key={p.id} className="hover:bg-slate-800/40 transition">
                          {/* Nombre y descripción */}
                          <td className="py-3 px-4">
                            <div className="font-bold text-white text-sm leading-tight">
                              {p.name}
                            </div>
                            {p.description && (
                              <div className="text-[11px] text-slate-400 truncate max-w-xs">
                                {p.description}
                              </div>
                            )}
                            {p.pos_item_id && (
                              <div className="text-[10px] text-emerald-400/80 font-mono mt-0.5">
                                CSOPOS ID: #{p.pos_item_id}
                              </div>
                            )}
                          </td>

                          {/* Códigos de barra principal y adicionales */}
                          <td className="py-3 px-4">
                            <div className="flex flex-col gap-1 items-start">
                              {p.item_number ? (
                                <span className="font-mono text-xs text-emerald-300 bg-emerald-950/50 border border-emerald-500/30 px-2 py-0.5 rounded-md font-bold">
                                  {p.item_number}
                                </span>
                              ) : (
                                <span className="text-[10px] text-slate-500 italic">
                                  Sin código principal
                                </span>
                              )}

                              {/* Badges de códigos adicionales */}
                              {p.additional_numbers &&
                                p.additional_numbers.length > 0 && (
                                  <div className="flex flex-wrap gap-1 mt-0.5">
                                    {p.additional_numbers.map((addCode, idx) => (
                                      <span
                                        key={idx}
                                        className="font-mono text-[10px] text-purple-300 bg-purple-950/40 border border-purple-500/30 px-1.5 py-0.2 rounded"
                                        title="Código adicional"
                                      >
                                        + {addCode}
                                      </span>
                                    ))}
                                  </div>
                                )}
                            </div>
                          </td>

                          {/* Categoría */}
                          <td className="py-3 px-4">
                            <span className="bg-slate-800 px-2 py-0.5 rounded-full text-[11px] text-slate-300 border border-slate-700">
                              {p.category}
                            </span>
                          </td>

                          {/* Unidad */}
                          <td className="py-3 px-4 text-slate-400">
                            <span className="font-semibold text-slate-200">
                              {p.unit_code}
                            </span>
                          </td>

                          {/* Costo */}
                          <td className="py-3 px-4 text-right font-mono text-slate-400">
                            ${p.cost_price?.toLocaleString("es-CO")}
                          </td>

                          {/* Precio Venta */}
                          <td className="py-3 px-4 text-right font-mono font-bold text-emerald-400 text-sm">
                            {p.formatted_sale_price ||
                              `$${p.unit_price?.toLocaleString("es-CO")}`}
                          </td>

                          {/* Stock */}
                          <td className="py-3 px-4 text-right font-mono font-bold text-slate-200">
                            {p.stock_quantity ?? 0}
                          </td>

                          {/* Acciones */}
                          <td className="py-3 px-4 text-center">
                            <button
                              onClick={() => handleOpenEditLocal(p)}
                              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition inline-flex items-center gap-1 border border-slate-700 text-xs font-semibold"
                              title="Editar artículo registrado"
                            >
                              <Edit className="w-3.5 h-3.5 text-emerald-400" />
                              <span>Editar</span>
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* 2. VISTA DE TARJETAS FLUIDAS PARA MÓVILES */}
                <div className="block lg:hidden divide-y divide-slate-800">
                  {products.map((p) => (
                    <div
                      key={p.id}
                      className="p-4 space-y-3 hover:bg-slate-800/20 transition"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="bg-slate-800 px-2.5 py-0.5 rounded-full text-[10px] font-semibold text-slate-300 border border-slate-700">
                            {p.category}
                          </span>
                          <span className="bg-slate-950 px-2 py-0.5 rounded-md text-[10px] font-bold text-slate-400 border border-slate-800 font-mono">
                            {p.unit_code}
                          </span>
                        </div>

                        <button
                          onClick={() => handleOpenEditLocal(p)}
                          className="px-3 py-1.5 rounded-xl bg-emerald-600/20 hover:bg-emerald-600 text-emerald-300 hover:text-white border border-emerald-500/30 transition inline-flex items-center gap-1.5 text-xs font-bold shadow-sm active:scale-95"
                        >
                          <Edit className="w-3.5 h-3.5" />
                          <span>Editar</span>
                        </button>
                      </div>

                      <div>
                        <h4 className="font-bold text-white text-base leading-snug">
                          {p.name}
                        </h4>
                        {p.description && (
                          <p className="text-xs text-slate-400 mt-0.5 line-clamp-2">
                            {p.description}
                          </p>
                        )}
                        {p.pos_item_id && (
                          <span className="text-[10px] text-emerald-400/80 font-mono">
                            CSOPOS ID: #{p.pos_item_id}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center flex-wrap gap-1.5 pt-0.5">
                        {p.item_number ? (
                          <div className="inline-flex items-center gap-1.5 font-mono text-xs text-emerald-300 bg-emerald-950/60 border border-emerald-500/30 px-2.5 py-1 rounded-lg font-bold">
                            <Barcode className="w-3.5 h-3.5 text-emerald-400" />
                            <span>{p.item_number}</span>
                          </div>
                        ) : (
                          <span className="text-[11px] text-slate-500 italic">
                            Sin código principal
                          </span>
                        )}

                        {p.additional_numbers &&
                          p.additional_numbers.length > 0 &&
                          p.additional_numbers.map((addCode, idx) => (
                            <span
                              key={idx}
                              className="font-mono text-[10px] text-purple-300 bg-purple-950/40 border border-purple-500/30 px-2 py-0.5 rounded-md"
                              title="Código adicional"
                            >
                              + {addCode}
                            </span>
                          ))}
                      </div>

                      <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 sm:gap-4">
                          <div className="flex flex-col">
                            <span className="text-[9px] uppercase font-semibold text-slate-400">
                              Costo Base
                            </span>
                            <span className="text-xs font-mono font-medium text-slate-300">
                              $
                              {p.cost_price
                                ? p.cost_price.toLocaleString("es-CO")
                                : "0"}
                            </span>
                          </div>
                          <div className="h-6 w-[1px] bg-slate-800" />
                          <div className="flex flex-col">
                            <span className="text-[9px] uppercase font-semibold text-slate-400">
                              Stock
                            </span>
                            <span className="text-xs font-mono font-bold text-slate-200">
                              {p.stock_quantity ?? 0}
                            </span>
                          </div>
                        </div>

                        <div className="flex flex-col text-right">
                          <span className="text-[9px] uppercase font-semibold text-emerald-400/90">
                            Precio Venta POS
                          </span>
                          <span className="text-base sm:text-lg font-black font-mono text-emerald-400">
                            {p.formatted_sale_price ||
                              `$${p.unit_price?.toLocaleString("es-CO")}`}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Escáner de Código de Barras con Cámara para CSOPOS */}
      <BarcodeScannerModal
        isOpen={isCsoposScannerOpen}
        onClose={() => setIsCsoposScannerOpen(false)}
        onScan={handleCsoposBarcodeScanned}
        title="Escanear Código de Barras para CSOPOS"
        subtitle="Apunta la cámara al código para buscar el producto en el POS"
      />

      {/* Modal de Creación / Edición */}
      <ProductFormModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSaved={handleSaved}
        editingProduct={editingProduct}
      />
    </div>
  );
}
