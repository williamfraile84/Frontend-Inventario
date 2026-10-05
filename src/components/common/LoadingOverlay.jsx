import React from "react";
import {
  Loader2,
  Sparkles,
  RefreshCw,
  Layers,
  DollarSign,
  FileSearch,
  CheckCircle2,
} from "lucide-react";

export default function LoadingOverlay({
  isVisible,
  title = "Procesando Solicitud",
  message = "Conectando con el sistema POS...",
  submessage = "Por favor no cierre la ventana mientras se completa la operación.",
  iconType = "loader", // "loader", "search", "dollar", "layers", "sparkles"
}) {
  if (!isVisible) return null;

  const renderIcon = () => {
    switch (iconType) {
      case "search":
        return (
          <FileSearch className="w-7 h-7 sm:w-8 sm:h-8 animate-pulse text-emerald-400" />
        );
      case "dollar":
        return (
          <DollarSign className="w-7 h-7 sm:w-8 sm:h-8 animate-pulse text-emerald-400" />
        );
      case "layers":
        return (
          <Layers className="w-7 h-7 sm:w-8 sm:h-8 animate-pulse text-emerald-400" />
        );
      case "sparkles":
        return (
          <Sparkles className="w-7 h-7 sm:w-8 sm:h-8 animate-pulse text-emerald-400" />
        );
      default:
        return (
          <RefreshCw className="w-7 h-7 sm:w-8 sm:h-8 animate-spin text-emerald-400" />
        );
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4 animate-in fade-in duration-200 select-none">
      <div className="bg-slate-900/95 rounded-3xl p-6 sm:p-8 max-w-sm w-full shadow-2xl border border-slate-700/80 flex flex-col items-center text-center space-y-4 animate-in zoom-in-95 duration-200 text-slate-100">
        {/* Animated Central Icon Ring */}
        <div className="relative">
          <div className="w-16 h-16 sm:w-18 sm:h-18 bg-emerald-500/10 rounded-2xl border border-emerald-500/20 flex items-center justify-center shadow-inner">
            {renderIcon()}
          </div>
          <div className="absolute -top-1.5 -right-1.5">
            <Loader2 className="w-6 h-6 sm:w-7 sm:h-7 text-emerald-400 animate-spin" />
          </div>
        </div>

        {/* Title and Message */}
        <div className="space-y-1.5 w-full">
          <h3 className="font-extrabold text-base sm:text-lg text-white flex items-center justify-center gap-1.5 tracking-tight">
            <span>{title}</span>
            <Sparkles className="w-4 h-4 text-emerald-400 shrink-0 animate-pulse" />
          </h3>
          <p className="text-xs sm:text-sm font-semibold text-slate-300 break-words leading-snug">
            {message}
          </p>
        </div>

        {/* Animated Glowing Progress Bar */}
        <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden shadow-inner">
          <div className="bg-gradient-to-r from-emerald-500 to-teal-400 h-full w-2/3 animate-[pulse_1.2s_infinite] rounded-full shadow-[0_0_12px_rgba(16,185,129,0.6)]"></div>
        </div>

        {/* Submessage footer */}
        {submessage && (
          <p className="text-[11px] text-slate-400 font-medium leading-relaxed">
            {submessage}
          </p>
        )}
      </div>
    </div>
  );
}
