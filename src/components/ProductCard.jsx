import React from "react";
import {
  Tag,
  Barcode,
  Package,
  Edit3,
  CheckCircle2,
  RotateCcw,
} from "lucide-react";
import { authService } from "../services/api";

export default function ProductCard({
  product,
  onEditPrice,
  onReset,
  isTvMode = false,
}) {
  if (!product) return null;

  const canEdit = authService.hasPermission("can_edit_single");

  return (
    <div
      className={`card-fruver relative overflow-hidden transition-all duration-300 animate-in fade-in slide-in-from-top-4 ${
        isTvMode
          ? "p-6 sm:p-8 border-emerald-500/50 shadow-emerald-950/30"
          : "p-4 sm:p-6"
      }`}
    >
      {/* Accent glow corner */}
      <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none"></div>

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 sm:gap-4 pb-4 sm:pb-5 border-b border-slate-200 dark:border-slate-800/80">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <span className="badge-organic inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400" />
              Producto Activo en POS
            </span>
            {product.category && (
              <span className="text-xs text-slate-700 dark:text-slate-200 font-semibold bg-slate-100 dark:bg-slate-800/90 px-3 py-1 rounded-full border border-slate-200 dark:border-slate-700/80 shadow-xs truncate max-w-[200px]">
                {product.category}
              </span>
            )}
          </div>
          <h3
            className={`font-black text-slate-900 dark:text-white tracking-tight break-words ${
              isTvMode ? "text-2xl sm:text-4xl" : "text-lg sm:text-2xl"
            }`}
          >
            {product.name}
          </h3>
        </div>

        {/* Current Price Display Banner */}
        <div
          className={`bg-gradient-to-br from-emerald-50 to-slate-100 dark:from-emerald-950/80 dark:to-slate-900/90 border border-emerald-300 dark:border-emerald-500/50 rounded-2xl flex flex-col items-start md:items-end justify-center shadow-md dark:shadow-emerald-950/40 shrink-0 ${
            isTvMode ? "p-5 sm:px-8" : "p-3.5 sm:p-4 sm:px-6"
          }`}
        >
          <span className="text-[11px] uppercase tracking-wider font-bold text-emerald-700 dark:text-emerald-400">
            Precio de Venta Actual
          </span>
          <span
            className={`font-black text-emerald-600 dark:text-emerald-300 tracking-tight flex items-baseline gap-1 font-mono tabular-nums ${
              isTvMode ? "text-4xl sm:text-6xl" : "text-2xl sm:text-3xl"
            }`}
          >
            {product.formatted_price}
            <span className="text-xs font-bold text-emerald-700/80 dark:text-emerald-400/80">COP</span>
          </span>
        </div>
      </div>

      {/* Product Details Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 py-4">
        {/* Modal Barcode (True Barcode) */}
        <div className="bg-slate-50 dark:bg-slate-950/80 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 flex items-start gap-3">
          <div className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 mt-0.5">
            <Barcode className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <span className="text-[11px] uppercase font-bold text-slate-500 dark:text-slate-400 block">
              Código de Barras / UPC
            </span>
            <span className="text-sm font-mono font-bold text-slate-900 dark:text-white tracking-wider tabular-nums">
              {product.modal_barcode || product.barcode}
            </span>
          </div>
        </div>

        {/* Stock */}
        <div className="bg-slate-50 dark:bg-slate-950/80 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 flex items-start gap-3">
          <div className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 mt-0.5">
            <Package className="w-4 h-4 text-blue-500 dark:text-blue-400" />
          </div>
          <div>
            <span className="text-[11px] uppercase font-bold text-slate-500 dark:text-slate-400 block">
              Existencias / Stock
            </span>
            <span className="text-sm font-bold text-slate-900 dark:text-white tabular-nums">
              {product.stock !== undefined && product.stock !== null
                ? product.stock
                : "N/D"}
            </span>
          </div>
        </div>

        {/* Internal ID */}
        <div className="bg-slate-50 dark:bg-slate-950/80 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 flex items-start gap-3">
          <div className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 mt-0.5">
            <Tag className="w-4 h-4 text-purple-500 dark:text-purple-400" />
          </div>
          <div>
            <span className="text-[11px] uppercase font-bold text-slate-500 dark:text-slate-400 block">
              ID en Sistema POS
            </span>
            <span className="text-sm font-mono font-bold text-slate-900 dark:text-white">
              #{product.item_id || "N/D"}
            </span>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-slate-200 dark:border-slate-800/80">
        <button
          onClick={onReset}
          className="btn-tactile w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700/90 text-slate-700 hover:text-slate-900 dark:text-slate-200 dark:hover:text-white text-xs font-bold border border-slate-200 dark:border-slate-700 cursor-pointer"
        >
          <RotateCcw className="w-4 h-4 text-slate-500 dark:text-slate-300" />
          <span>Consultar Otro Producto</span>
        </button>

        {canEdit && (
          <button
            onClick={onEditPrice}
            className="btn-tactile w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold shadow-lg shadow-emerald-600/30 ring-1 ring-emerald-400/50"
          >
            <Edit3 className="w-4 h-4" />
            <span>Modificar Precio de Venta</span>
          </button>
        )}
      </div>
    </div>
  );
}
