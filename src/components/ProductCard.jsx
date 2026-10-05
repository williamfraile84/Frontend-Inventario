import React from "react";
import {
  Tag,
  Barcode,
  Package,
  Edit3,
  CheckCircle2,
  RotateCcw,
  DollarSign,
  Layers,
} from "lucide-react";
import { authService } from "../services/api";

export default function ProductCard({ product, onEditPrice, onReset, isTvMode = false }) {
  if (!product) return null;

  const canEdit = authService.hasPermission("can_edit_single");

  return (
    <div
      className={`bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl relative overflow-hidden transition-all duration-300 animate-in fade-in slide-in-from-top-4 ${
        isTvMode ? "p-6 sm:p-8 border-emerald-500/40" : "p-4 sm:p-6"
      }`}
    >
      {/* Accent glow corner */}
      <div className="absolute top-0 right-0 w-48 h-48 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none"></div>

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 px-2.5 py-0.5 rounded-full border border-emerald-500/30">
              <CheckCircle2 className="w-3 h-3 text-emerald-400" />
              Producto Activo en POS
            </span>
            {product.category && (
              <span className="text-xs text-slate-300 font-medium bg-slate-800 px-2.5 py-0.5 rounded-full border border-slate-700">
                {product.category}
              </span>
            )}
          </div>
          <h3
            className={`font-black text-white tracking-tight ${
              isTvMode ? "text-2xl sm:text-4xl" : "text-xl sm:text-2xl"
            }`}
          >
            {product.name}
          </h3>
        </div>

        {/* Current Price Display Banner */}
        <div
          className={`bg-emerald-950/50 border border-emerald-500/40 rounded-2xl flex flex-col items-start md:items-end shadow-inner ${
            isTvMode ? "p-5 sm:px-8" : "p-3.5 sm:px-6"
          }`}
        >
          <span className="text-[11px] uppercase tracking-wider font-semibold text-emerald-400">
            Precio de Venta Actual
          </span>
          <span
            className={`font-black text-emerald-300 tracking-tight flex items-baseline gap-1 font-mono ${
              isTvMode ? "text-4xl sm:text-6xl" : "text-2xl sm:text-3xl"
            }`}
          >
            {product.formatted_price}
            <span className="text-xs font-semibold text-emerald-500/80">COP</span>
          </span>
        </div>
      </div>

      {/* Product Details Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 py-4">
        {/* Modal Barcode (True Barcode) */}
        <div className="bg-slate-950/70 p-3.5 rounded-xl border border-slate-800/80 flex items-start gap-3">
          <div className="p-2 rounded-lg bg-slate-800 text-slate-300 mt-0.5">
            <Barcode className="w-4 h-4 text-emerald-400" />
          </div>
          <div>
            <span className="text-[11px] uppercase font-semibold text-slate-400 block">
              Código de Barras / UPC
            </span>
            <span className="text-sm font-mono font-bold text-white tracking-wider">
              {product.modal_barcode || product.barcode}
            </span>
          </div>
        </div>

        {/* Stock */}
        <div className="bg-slate-950/70 p-3.5 rounded-xl border border-slate-800/80 flex items-start gap-3">
          <div className="p-2 rounded-lg bg-slate-800 text-slate-300 mt-0.5">
            <Package className="w-4 h-4 text-blue-400" />
          </div>
          <div>
            <span className="text-[11px] uppercase font-semibold text-slate-400 block">
              Existencias / Stock
            </span>
            <span className="text-sm font-bold text-white">
              {product.stock !== undefined && product.stock !== null ? product.stock : "N/D"}
            </span>
          </div>
        </div>

        {/* Internal ID */}
        <div className="bg-slate-950/70 p-3.5 rounded-xl border border-slate-800/80 flex items-start gap-3">
          <div className="p-2 rounded-lg bg-slate-800 text-slate-300 mt-0.5">
            <Tag className="w-4 h-4 text-purple-400" />
          </div>
          <div>
            <span className="text-[11px] uppercase font-semibold text-slate-400 block">
              ID en Sistema POS
            </span>
            <span className="text-sm font-mono font-bold text-slate-200">
              #{product.item_id || "N/D"}
            </span>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-slate-800">
        <button
          onClick={onReset}
          className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold border border-slate-700 transition"
        >
          <RotateCcw className="w-4 h-4" />
          <span>Consultar Otro Producto</span>
        </button>

        {canEdit && (
          <button
            onClick={onEditPrice}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold shadow-lg shadow-emerald-600/30 ring-1 ring-emerald-400/40 hover:scale-[1.02] active:scale-[0.98] transition-all"
          >
            <Edit3 className="w-4 h-4" />
            <span>Modificar Precio de Venta</span>
          </button>
        )}
      </div>
    </div>
  );
}
