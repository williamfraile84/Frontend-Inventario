import React from "react";
import {
  Apple,
  ScanBarcode,
  Layers,
  Shield,
  LogOut,
  Activity,
  User,
  ShieldCheck,
  Tv,
  Monitor,
  Package,
  Receipt,
} from "lucide-react";
import { authService } from "../services/api";

export default function Navbar({
  activeTab,
  setActiveTab,
  posStatus,
  user,
  onLogout,
  isTvMode,
  setIsTvMode,
}) {
  const canBulk = authService.hasPermission("can_edit_bulk");
  const canAdmin =
    authService.hasPermission("can_manage_users") || user?.role === "admin";

  return (
    <header className="sticky top-0 z-40 bg-slate-900/90 backdrop-blur-md border-b border-slate-800 shadow-md">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Brand */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-600 to-lime-500 flex items-center justify-center shadow-lg shadow-emerald-500/20 ring-1 ring-emerald-400/30 shrink-0">
              <Apple className="w-6 h-6 text-white" />
            </div>
            <div>
              <span className="text-base sm:text-lg font-black tracking-tight text-white flex items-center gap-1.5">
                FRUVER{" "}
                <span className="text-emerald-400 font-extrabold">POS</span>
              </span>
              <span className="text-[9px] sm:text-[10px] uppercase font-semibold text-slate-400 tracking-wider block">
                Gestor Inteligente de Precios
              </span>
            </div>
          </div>

          {/* Desktop Navigation Tabs */}
          <nav className="hidden md:flex items-center gap-1 bg-slate-950/80 p-1 rounded-xl border border-slate-800/80">
            <button
              onClick={() => setActiveTab("single")}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all duration-200 ${
                activeTab === "single"
                  ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/30 ring-1 ring-emerald-400/40"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
              }`}
            >
              <ScanBarcode className="w-4 h-4" />
              <span>Consulta y Precio</span>
            </button>

            <button
              onClick={() => setActiveTab("catalog")}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all duration-200 ${
                activeTab === "catalog"
                  ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/30 ring-1 ring-emerald-400/40"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
              }`}
            >
              <Package className="w-4 h-4" />
              <span>Catálogo / Crear</span>
            </button>

            <button
              onClick={() => setActiveTab("invoices")}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all duration-200 ${
                activeTab === "invoices"
                  ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/30 ring-1 ring-emerald-400/40"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
              }`}
            >
              <Receipt className="w-4 h-4" />
              <span>Facturas OCR</span>
            </button>

            {canBulk && (
              <button
                onClick={() => setActiveTab("bulk")}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all duration-200 ${
                  activeTab === "bulk"
                    ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/30 ring-1 ring-emerald-400/40"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
                }`}
              >
                <Layers className="w-4 h-4" />
                <span>Edición Masiva</span>
              </button>
            )}

            {canAdmin && (
              <button
                onClick={() => setActiveTab("admin")}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all duration-200 ${
                  activeTab === "admin"
                    ? "bg-purple-600 text-white shadow-md shadow-purple-600/30 ring-1 ring-purple-400/40"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
                }`}
              >
                <Shield className="w-4 h-4" />
                <span>Administración</span>
              </button>
            )}
          </nav>

          {/* POS Status, TV Mode & User Session */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* TV / Kiosk Display Mode Toggle */}
            <button
              onClick={() => setIsTvMode(!isTvMode)}
              className={`p-2 rounded-lg border transition text-xs font-semibold hidden sm:flex items-center gap-1.5 ${
                isTvMode
                  ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                  : "bg-slate-800/60 text-slate-400 border-slate-700/50 hover:text-white"
              }`}
              title={
                isTvMode
                  ? "Desactivar modo TV"
                  : "Activar modo TV / Pantalla Gigante"
              }
            >
              <Tv className="w-4 h-4" />
              <span className="hidden lg:inline">
                {isTvMode ? "Modo TV Activo" : "Modo TV"}
              </span>
            </button>

            {/* POS Status indicator */}
            <div
              className={`hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border ${
                posStatus?.is_ready
                  ? "bg-emerald-950/50 border-emerald-800 text-emerald-300"
                  : posStatus?.last_error
                    ? "bg-rose-950/50 border-rose-800 text-rose-300"
                    : "bg-amber-950/50 border-amber-800 text-amber-300"
              }`}
              title={
                posStatus?.last_error
                  ? `Error POS: ${posStatus.last_error}`
                  : `POS Activo: ${posStatus?.active_domain || "csopos.co"}`
              }
            >
              <span className="relative flex h-2 w-2">
                {posStatus?.is_ready && (
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                )}
                <span
                  className={`relative inline-flex rounded-full h-2 w-2 ${
                    posStatus?.is_ready
                      ? "bg-emerald-500"
                      : posStatus?.last_error
                        ? "bg-rose-500"
                        : "bg-amber-500"
                  }`}
                ></span>
              </span>
              <span>
                {posStatus?.is_ready
                  ? "POS Conectado"
                  : posStatus?.last_error
                    ? "Error POS"
                    : "Conectando..."}
              </span>
            </div>

            {/* User pill */}
            <div className="flex items-center gap-2 pl-1 sm:pl-2 sm:border-l sm:border-slate-800">
              <div className="hidden lg:flex items-center gap-1.5 text-xs text-slate-300 bg-slate-800/60 px-2.5 py-1.5 rounded-lg border border-slate-700/50">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span className="font-semibold">
                  {user?.full_name || user?.username || "Usuario"}
                </span>
                <span className="text-[10px] text-slate-400 uppercase font-mono">
                  ({user?.role || "cajero"})
                </span>
              </div>

              {/* Logout button */}
              <button
                onClick={onLogout}
                className="p-2 rounded-lg bg-slate-800/80 hover:bg-rose-900/30 text-slate-400 hover:text-rose-300 border border-slate-700/60 hover:border-rose-800/50 transition-all duration-200"
                title="Cerrar sesión"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Sub-Navigation Bar */}
        <div className="flex md:hidden items-center justify-around py-2 border-t border-slate-800 gap-1 overflow-x-auto">
          <button
            onClick={() => setActiveTab("single")}
            className={`flex-1 min-w-[65px] flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold ${
              activeTab === "single"
                ? "bg-emerald-600/20 text-emerald-400 border border-emerald-500/30"
                : "text-slate-400"
            }`}
          >
            <ScanBarcode className="w-3.5 h-3.5" />
            <span>Consulta</span>
          </button>

          <button
            onClick={() => setActiveTab("catalog")}
            className={`flex-1 min-w-[65px] flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold ${
              activeTab === "catalog"
                ? "bg-emerald-600/20 text-emerald-400 border border-emerald-500/30"
                : "text-slate-400"
            }`}
          >
            <Package className="w-3.5 h-3.5" />
            <span>Catálogo</span>
          </button>

          <button
            onClick={() => setActiveTab("invoices")}
            className={`flex-1 min-w-[65px] flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold ${
              activeTab === "invoices"
                ? "bg-emerald-600/20 text-emerald-400 border border-emerald-500/30"
                : "text-slate-400"
            }`}
          >
            <Receipt className="w-3.5 h-3.5" />
            <span>Facturas</span>
          </button>

          {canBulk && (
            <button
              onClick={() => setActiveTab("bulk")}
              className={`flex-1 min-w-[65px] flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold ${
                activeTab === "bulk"
                  ? "bg-emerald-600/20 text-emerald-400 border border-emerald-500/30"
                  : "text-slate-400"
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Masiva</span>
            </button>
          )}

          {canAdmin && (
            <button
              onClick={() => setActiveTab("admin")}
              className={`flex-1 min-w-[65px] flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold ${
                activeTab === "admin"
                  ? "bg-purple-600/20 text-purple-400 border border-purple-500/30"
                  : "text-slate-400"
              }`}
            >
              <Shield className="w-3.5 h-3.5" />
              <span>Admin</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
