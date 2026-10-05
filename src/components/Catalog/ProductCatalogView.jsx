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
} from "lucide-react";
import { catalogService } from "../../services/api";
import ProductFormModal from "./ProductFormModal";
import { useLoading } from "../../context/LoadingContext";
import { useToast } from "../../context/ToastContext";

export default function ProductCatalogView({ onShowToast }) {
  const { showLoader, hideLoader } = useLoading();
  const toast = useToast();
  const notify = onShowToast || toast.showToast;

  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("TODAS");

  // Modal de Crear / Editar
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);

  const fetchCatalog = useCallback(
    async (showOverlay = false) => {
      setLoading(true);
      if (showOverlay) {
        showLoader({
          title: "Cargando Catálogo",
          message: "Sincronizando productos y categorías desde el POS...",
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
        setProducts(prods || []);
        setCategories(cats || []);
      } catch (err) {
        console.error(err);
        notify({
          type: "error",
          title: "Error de Carga",
          message: "No se pudo sincronizar el catálogo de productos.",
        });
      } finally {
        setLoading(false);
        if (showOverlay) {
          hideLoader();
        }
      }
    },
    [searchQuery, selectedCategory, notify, showLoader, hideLoader],
  );

  useEffect(() => {
    fetchCatalog(false);
  }, [fetchCatalog]);

  const handleOpenCreate = () => {
    setEditingProduct(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (product) => {
    setEditingProduct(product);
    setIsModalOpen(true);
  };

  const handleSaved = () => {
    fetchCatalog(true);
    notify({
      type: "success",
      title: "Catálogo Actualizado",
      message: editingProduct
        ? "Producto modificado exitosamente."
        : "Nuevo producto creado e integrado con el POS.",
    });
  };

  return (
    <div className="space-y-5">
      {/* Top Banner & Action Button */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2">
            <Package className="w-6 h-6 text-emerald-400" />
            Catálogo Maestro de Productos (Módulo POS)
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Creación y edición de artículos con números adicionales y
            equivalencias de unidad
          </p>
        </div>

        <button
          onClick={handleOpenCreate}
          className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs sm:text-sm font-bold shadow-lg shadow-emerald-600/30 flex items-center justify-center gap-2 transition hover:scale-[1.02] active:scale-[0.98]"
        >
          <PackagePlus className="w-4 h-4" />
          <span>Nuevo Producto</span>
        </button>
      </div>

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
            onClick={fetchCatalog}
            onClick={() => fetchCatalog(true)}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
            title="Refrescar catálogo"
          >
            <RefreshCw
              className={`w-4 h-4 ${loading ? "animate-spin text-emerald-400" : ""}`}
            />
          </button>
        </div>
      </div>

      {/* Products Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
        {loading && products.length === 0 ? (
          <div className="p-12 text-center text-slate-400 flex flex-col items-center justify-center">
            <RefreshCw className="w-8 h-8 animate-spin text-emerald-400 mb-2" />
            <p className="text-sm">Cargando catálogo maestro...</p>
          </div>
        ) : products.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            <Package className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <h4 className="text-sm font-bold text-slate-300">
              No se encontraron productos
            </h4>
            <p className="text-xs mt-1">
              Prueba con otro término de búsqueda o añade un nuevo producto.
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
                          onClick={() => handleOpenEdit(p)}
                          className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition inline-flex items-center gap-1 border border-slate-700 text-xs font-semibold"
                          title="Editar artículo"
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

            {/* 2. VISTA DE TARJETAS FLUIDAS PARA MÓVILES Y TABLETS */}
            <div className="block lg:hidden divide-y divide-slate-800">
              {products.map((p) => (
                <div
                  key={p.id}
                  className="p-4 space-y-3 hover:bg-slate-800/20 transition"
                >
                  {/* Fila Superior: Badges y Botón Editar */}
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
                      onClick={() => handleOpenEdit(p)}
                      className="px-3 py-1.5 rounded-xl bg-emerald-600/20 hover:bg-emerald-600 text-emerald-300 hover:text-white border border-emerald-500/30 transition inline-flex items-center gap-1.5 text-xs font-bold shadow-sm active:scale-95"
                    >
                      <Edit className="w-3.5 h-3.5" />
                      <span>Editar</span>
                    </button>
                  </div>

                  {/* Nombre y Descripción */}
                  <div>
                    <h4 className="font-bold text-white text-base leading-snug">
                      {p.name}
                    </h4>
                    {p.description && (
                      <p className="text-xs text-slate-400 mt-0.5 line-clamp-2">
                        {p.description}
                      </p>
                    )}
                  </div>

                  {/* Códigos de Barra */}
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

                  {/* Banner Financiero: Costo, Stock y Precio de Venta POS */}
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
