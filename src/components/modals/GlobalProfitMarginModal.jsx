import React from "react";
import {
  TrendingUp,
  CheckCircle2,
  Sliders,
  X,
  AlertCircle,
} from "lucide-react";

export default function GlobalProfitMarginModal({
  isOpen,
  targetMargin,
  currentMargin,
  totalProducts,
  manualCount,
  onApplyToAll,
  onApplyToNonManual,
  onCancel,
}) {
  if (!isOpen) return null;

  const standardCount = Math.max(0, totalProducts - manualCount);

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-150">
      <div className="bg-slate-900 w-full max-w-lg rounded-2xl shadow-2xl border border-slate-800 overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="bg-slate-950 border-b border-slate-800 p-4 sm:p-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-500/20 text-emerald-400 rounded-xl border border-emerald-500/30">
              <TrendingUp className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm sm:text-base text-white">
                Actualizar % de Margen Global
              </h3>
              <p className="text-[11px] text-slate-400">
                Cambio de margen:{" "}
                <span className="line-through text-slate-500 font-semibold">
                  {currentMargin}%
                </span>{" "}
                <span className="text-emerald-400 font-black">
                  → {targetMargin}%
                </span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg transition hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 sm:p-6 space-y-4">
          <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3.5 space-y-2">
            <span className="text-xs font-bold text-slate-300 block">
              Distribución de productos en la lista activa:
            </span>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-slate-900 p-2.5 rounded-lg border border-slate-800">
                <span className="text-slate-400 text-[10px] uppercase font-bold block">
                  Con Margen Manual
                </span>
                <strong
                  className={`text-base font-black ${
                    manualCount > 0 ? "text-amber-400" : "text-slate-400"
                  }`}
                >
                  {manualCount} {manualCount === 1 ? "ítem" : "ítems"}
                </strong>
                <p className="text-[10px] text-slate-500 mt-0.5">
                  Precios o % editados a mano
                </p>
              </div>
              <div className="bg-slate-900 p-2.5 rounded-lg border border-slate-800">
                <span className="text-slate-400 text-[10px] uppercase font-bold block">
                  Con Margen Estándar
                </span>
                <strong className="text-base font-black text-emerald-400">
                  {standardCount} {standardCount === 1 ? "ítem" : "ítems"}
                </strong>
                <p className="text-[10px] text-slate-500 mt-0.5">
                  Siguen el margen global
                </p>
              </div>
            </div>
          </div>

          <p className="text-xs text-slate-300 leading-relaxed font-medium">
            ¿Cómo deseas aplicar el nuevo margen del{" "}
            <span className="font-bold text-emerald-400">{targetMargin}%</span> a
            los artículos?
          </p>

          <div className="space-y-2.5">
            {/* Opción 1: Solo a no modificados manualmente */}
            <button
              type="button"
              onClick={onApplyToNonManual}
              className="w-full text-left p-3.5 rounded-xl border border-emerald-500/40 bg-emerald-950/30 hover:bg-emerald-950/50 transition cursor-pointer flex items-start gap-3 group"
            >
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <strong className="text-xs font-black text-emerald-300 block group-hover:text-emerald-200">
                  Solo a los no modificados manualmente (Recomendado)
                </strong>
                <p className="text-[11px] text-emerald-300/70 leading-normal mt-0.5">
                  {manualCount > 0
                    ? `Conserva los ${manualCount} productos personalizados a mano y actualiza los ${standardCount} restantes al ${targetMargin}%.`
                    : `Actualiza todos los productos (${totalProducts}) al ${targetMargin}%.`}
                </p>
              </div>
            </button>

            {/* Opción 2: Aplicar a todos */}
            <button
              type="button"
              onClick={onApplyToAll}
              className="w-full text-left p-3.5 rounded-xl border border-slate-700 bg-slate-950/50 hover:bg-slate-800/60 transition cursor-pointer flex items-start gap-3 group"
            >
              <Sliders className="w-5 h-5 text-slate-400 shrink-0 mt-0.5 group-hover:text-slate-200" />
              <div>
                <strong className="text-xs font-bold text-white block">
                  Aplicar a todos los productos (Sobrescribir todo)
                </strong>
                <p className="text-[11px] text-slate-400 leading-normal mt-0.5">
                  Sobrescribe la totalidad de los productos ({totalProducts})
                  con el nuevo {targetMargin}%, recalculando precios de venta y
                  descartando ajustes manuales previos.
                </p>
              </div>
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-slate-950 p-3.5 sm:p-4 border-t border-slate-800 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-xs font-bold text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition cursor-pointer"
          >
            Cancelar (mantener {currentMargin}%)
          </button>
        </div>
      </div>
    </div>
  );
}
