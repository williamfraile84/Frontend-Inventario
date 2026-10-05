import React, { useState, useEffect } from "react";
import {
  X,
  DollarSign,
  ArrowRight,
  RefreshCw,
  Check,
  AlertCircle,
  Save,
  Percent,
  Sparkles,
} from "lucide-react";
import { formatCurrency } from "../utils/currency";
import {
  redondearCentenaEstricta,
  calcularAjustePorcentual,
  calcularMargen,
} from "../utils/math";

export default function SinglePriceModal({
  product,
  isOpen,
  onClose,
  onConfirm,
  isUpdating,
}) {
  const [newPrice, setNewPrice] = useState(
    product ? String(product.unit_price || "") : "",
  );
  const [error, setError] = useState("");

  useEffect(() => {
    if (product && isOpen) {
      setNewPrice(product.unit_price ? String(product.unit_price) : "");
      setError("");
    }
  }, [product, isOpen]);

  if (!isOpen || !product) return null;

  const currentPrice = product.unit_price || 0;
  const numericNewPrice = parseFloat(newPrice) || 0;
  const diff = numericNewPrice - currentPrice;
  const pctDiff =
    currentPrice > 0 ? ((diff / currentPrice) * 100).toFixed(1) : 0;

  // Ajuste de suma fija (+100, +500, +1000)
  const handleQuickAdd = (amount) => {
    const nextVal = Math.max(0, numericNewPrice + amount);
    setNewPrice(String(nextVal));
    setError("");
  };

  // Ajuste porcentual (+5%, +10%, +15%, +20%, -5%, -10%) con redondeo a centenas ($100 COP)
  const handleQuickPercent = (pct) => {
    const base = currentPrice > 0 ? currentPrice : numericNewPrice;
    if (base <= 0) return;
    const calculated = calcularAjustePorcentual(base, pct, true, 100);
    setNewPrice(String(calculated));
    setError("");
  };

  // Forzar redondeo a centenas ($100)
  const handleRoundCentenas = () => {
    if (numericNewPrice > 0) {
      setNewPrice(String(redondearCentenaEstricta(numericNewPrice)));
      setError("");
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!numericNewPrice || numericNewPrice <= 0) {
      setError("Por favor ingresa un precio de venta válido mayor a 0.");
      return;
    }
    setError("");
    onConfirm(numericNewPrice);
  };

  const isRoundedToCentena = numericNewPrice % 100 === 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700/90 rounded-2xl sm:rounded-3xl max-w-md w-full p-5 sm:p-6 shadow-2xl relative overflow-hidden animate-in zoom-in-95 duration-200 text-slate-100">
        {/* Full Modal Loading Overlay during price update */}
        {isUpdating && (
          <div className="absolute inset-0 z-50 bg-slate-950/95 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center animate-in fade-in duration-200">
            <div className="relative mb-4">
              <div className="w-16 h-16 rounded-full border-4 border-emerald-500/20 border-t-emerald-500 animate-spin"></div>
              <DollarSign className="w-7 h-7 text-emerald-400 absolute inset-0 m-auto animate-pulse" />
            </div>
            <h4 className="text-lg font-bold text-white mb-1">
              Actualizando Precio en POS
            </h4>
            <div className="flex items-center gap-2 my-2 px-3.5 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 font-mono text-xs font-bold tabular-nums">
              <span>{product.modal_barcode || product.barcode}</span>
              <span>→</span>
              <span className="text-emerald-400 font-extrabold text-sm">
                {formatCurrency(numericNewPrice)} COP
              </span>
            </div>
            <p className="text-xs text-slate-400 max-w-xs mt-1">
              Guardando el nuevo precio en el catálogo del POS. Por favor
              espere...
            </p>
          </div>
        )}

        {/* Header */}
        <div className="flex items-center justify-between pb-3.5 border-b border-slate-800">
          <div>
            <h3 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-emerald-400" />
              <span>Modificar Precio de Venta</span>
            </h3>
            <p className="text-xs text-slate-400">
              Ajuste individual en catálogo POS con reglas comerciales
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={isUpdating}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Product summary */}
        <div className="my-4 p-3.5 bg-slate-950/70 rounded-xl border border-slate-800 flex flex-col gap-1.5 shadow-inner">
          <span className="text-xs sm:text-sm font-bold text-slate-100 line-clamp-1">
            {product.name}
          </span>
          <div className="flex items-center justify-between text-xs text-slate-400 font-mono tabular-nums">
            <span>
              Código:{" "}
              <b className="text-slate-200">
                {product.modal_barcode || product.barcode}
              </b>
            </span>
            <span>
              Actual:{" "}
              <b className="text-emerald-400">{product.formatted_price}</b>
            </span>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-300">
                Nuevo Precio de Venta (COP)
              </label>
              {!isRoundedToCentena && numericNewPrice > 0 && (
                <button
                  type="button"
                  onClick={handleRoundCentenas}
                  className="text-[10px] text-amber-400 hover:text-amber-300 font-bold bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded-md flex items-center gap-1 transition"
                  title="Redondear a centenas ($100 COP)"
                >
                  <Sparkles className="w-2.5 h-2.5" />
                  Redondear Centena
                </button>
              )}
            </div>

            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 font-bold">
                $
              </div>
              <input
                type="number"
                step="50"
                min="50"
                value={newPrice}
                onChange={(e) => {
                  setNewPrice(e.target.value);
                  setError("");
                }}
                disabled={isUpdating}
                placeholder="Ej: 2500"
                className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-slate-950 border border-slate-700 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/30 text-lg sm:text-xl font-bold text-white font-mono tracking-wide tabular-nums"
                autoFocus
              />
            </div>

            {/* Quick Percentage Chips (%) */}
            <div className="mt-2.5 space-y-1.5">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[10px] text-slate-400 uppercase font-bold flex items-center gap-1 mr-1">
                  <Percent className="w-3 h-3 text-emerald-400" />
                  Ajuste %:
                </span>
                {[+5, +10, +15, +20, +30, -5, -10].map((pct) => (
                  <button
                    type="button"
                    key={pct}
                    onClick={() => handleQuickPercent(pct)}
                    disabled={isUpdating}
                    className={`px-2 py-0.5 rounded-lg text-[11px] font-mono font-bold border transition cursor-pointer ${
                      pct > 0
                        ? "bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
                        : "bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border-rose-500/30"
                    }`}
                  >
                    {pct > 0 ? `+${pct}%` : `${pct}%`}
                  </button>
                ))}
              </div>

              {/* Quick monetary addition buttons (+$100, +$500, +$1000) */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[10px] text-slate-500 uppercase font-bold mr-1">
                  Ajuste $:
                </span>
                {[+100, +500, +1000, -100, -500].map((delta) => (
                  <button
                    type="button"
                    key={delta}
                    onClick={() => handleQuickAdd(delta)}
                    disabled={isUpdating}
                    className="px-2 py-0.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-mono font-semibold border border-slate-700 transition cursor-pointer"
                  >
                    {delta > 0 ? `+${delta}` : delta}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Variance & Percentage difference indicator */}
          {numericNewPrice > 0 && numericNewPrice !== currentPrice && (
            <div
              className={`p-3 rounded-xl border text-xs flex items-center justify-between tabular-nums ${
                diff > 0
                  ? "bg-emerald-950/40 border-emerald-800/80 text-emerald-300"
                  : "bg-amber-950/40 border-amber-800/80 text-amber-300"
              }`}
            >
              <div className="flex items-center gap-1.5">
                <span className="font-medium text-slate-400">Variación:</span>
                <span className="font-bold">
                  {diff > 0
                    ? `+${formatCurrency(diff)}`
                    : `-${formatCurrency(Math.abs(diff))}`}
                </span>
              </div>
              <span className="font-bold text-xs px-2 py-0.5 rounded-md bg-black/30 border border-white/10">
                {diff > 0 ? `+${pctDiff}%` : `${pctDiff}%`}
              </span>
            </div>
          )}

          {error && (
            <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-800 text-rose-200 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{error}</span>
            </div>
          )}

          {/* Modal Actions */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              disabled={isUpdating}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition cursor-pointer"
            >
              Cancelar
            </button>

            <button
              type="submit"
              disabled={isUpdating || !numericNewPrice || numericNewPrice <= 0}
              className="flex items-center gap-2 px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-lg shadow-emerald-600/30 transition disabled:opacity-40 cursor-pointer"
            >
              <Save className="w-4 h-4" />
              <span>Guardar en POS</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
