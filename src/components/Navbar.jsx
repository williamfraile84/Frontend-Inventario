import React from "react";
import {
  Apple,
  ScanBarcode,
  Layers,
  Shield,
  LogOut,
  ShieldCheck,
  Tv,
  Package,
  Receipt,
  Server,
  Sun,
  Moon,
} from "lucide-react";
import { authService } from "../services/api";
import { useTheme } from "../context/ThemeContext";
import PwaInstallButton from "./common/PwaInstallButton";

export default function Navbar({
  activeTab,
  setActiveTab,
  posStatus,
  user,
  onLogout,
  isTvMode,
  setIsTvMode,
}) {
  const { isDark, toggleTheme } = useTheme();

  const canBulk = authService.hasPermission("can_edit_bulk") || user?.role === "admin";
  const canAdmin =
    authService.hasPermission("can_manage_users") ||
    authService.hasPermission("can_view_audit") ||
    user?.role === "admin";
  const canInvoices =
    authService.hasPermission("can_process_invoices") ||
    user?.role === "admin" ||
    user?.role === "supervisor";

  const hostname = typeof window !== "undefined" ? window.location.hostname : "";
  const isTunnelEnv = hostname.endsWith(".tunnl.gg") || hostname.includes("tunnl.gg");
  const isLocalHost = hostname === "localhost" || hostname === "127.0.0.1";
  const isLocalNetwork =
    isLocalHost ||
    hostname.startsWith("192.168.") ||
    hostname.startsWith("10.") ||
    hostname.endsWith(".local");

  const envLabel = isTunnelEnv
    ? "LOCAL (TÚNEL)"
    : isLocalNetwork
    ? "LOCAL"
    : "NUBE";

  return (
    <>
      {/* HEADER PRINCIPAL (DESKTOP Y MÓVIL SUPERIOR) */}
      <header className="sticky top-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 shadow-xs dark:shadow-lg transition-colors overflow-x-clip">
        <div className="max-w-7xl mx-auto px-2 sm:px-4 lg:px-8">
          <div className="flex items-center justify-between h-14 sm:h-16 gap-1.5 sm:gap-2">
            {/* Logo & Marca Fruver POS */}
            <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
              <div className="w-8 h-8 sm:w-9 sm:h-9 lg:w-10 lg:h-10 rounded-xl bg-gradient-to-tr from-emerald-600 via-emerald-500 to-lime-400 flex items-center justify-center shadow-md shadow-emerald-500/25 ring-1 ring-emerald-400/40 shrink-0 btn-tactile">
                <Apple className="w-4 h-4 sm:w-5 sm:h-5 lg:w-6 lg:h-6 text-white drop-shadow" />
              </div>
              <div className="min-w-0">
                <span className="text-xs sm:text-base lg:text-lg font-black tracking-tight text-slate-900 dark:text-white flex items-center gap-1">
                  FRUVER{" "}
                  <span className="text-emerald-600 dark:text-emerald-400 font-extrabold">POS</span>
                </span>
                <span className="hidden lg:block text-[9px] uppercase font-bold text-slate-500 dark:text-slate-400 tracking-wider">
                  Gestor de Precios
                </span>
              </div>
            </div>

            {/* Pestañas de Navegación de Escritorio (md+) - Responsive y compactas para evitar scroll horizontal */}
            <nav className="hidden md:flex items-center gap-1 lg:gap-1.5 bg-slate-100 dark:bg-slate-950/80 p-1 lg:p-1.5 rounded-xl border border-slate-200 dark:border-slate-800/80 shadow-inner shrink-0">
              <button
                onClick={() => setActiveTab("single")}
                className={`btn-tactile flex items-center gap-1.5 lg:gap-2 px-2.5 lg:px-3.5 py-1.5 lg:py-2 rounded-lg text-xs lg:text-sm font-bold transition-all duration-150 cursor-pointer shrink-0 ${
                  activeTab === "single"
                    ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/30 ring-1 ring-emerald-400/50"
                    : "text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/70 dark:hover:bg-slate-800/60"
                }`}
              >
                <ScanBarcode className={`w-4 h-4 shrink-0 ${activeTab === "single" ? "text-white" : "text-emerald-600 dark:text-emerald-400"}`} />
                <span>Consulta</span>
                <span className="hidden xl:inline"> y Precio</span>
              </button>

              <button
                onClick={() => setActiveTab("catalog")}
                className={`btn-tactile flex items-center gap-1.5 lg:gap-2 px-2.5 lg:px-3.5 py-1.5 lg:py-2 rounded-lg text-xs lg:text-sm font-bold transition-all duration-150 cursor-pointer shrink-0 ${
                  activeTab === "catalog"
                    ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/30 ring-1 ring-emerald-400/50"
                    : "text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/70 dark:hover:bg-slate-800/60"
                }`}
              >
                <Package className={`w-4 h-4 shrink-0 ${activeTab === "catalog" ? "text-white" : "text-emerald-600 dark:text-emerald-400"}`} />
                <span>Catálogo</span>
                <span className="hidden xl:inline"> / Crear</span>
              </button>

              {canInvoices && (
                <button
                  onClick={() => setActiveTab("invoices")}
                  className={`btn-tactile flex items-center gap-1.5 lg:gap-2 px-2.5 lg:px-3.5 py-1.5 lg:py-2 rounded-lg text-xs lg:text-sm font-bold transition-all duration-150 cursor-pointer shrink-0 ${
                    activeTab === "invoices"
                      ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/30 ring-1 ring-emerald-400/50"
                      : "text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/70 dark:hover:bg-slate-800/60"
                  }`}
                >
                  <Receipt className={`w-4 h-4 shrink-0 ${activeTab === "invoices" ? "text-white" : "text-emerald-600 dark:text-emerald-400"}`} />
                  <span>Facturas</span>
                  <span className="hidden xl:inline"> & DIAN</span>
                </button>
              )}

              {canBulk && (
                <button
                  onClick={() => setActiveTab("bulk")}
                  className={`btn-tactile flex items-center gap-1.5 lg:gap-2 px-2.5 lg:px-3.5 py-1.5 lg:py-2 rounded-lg text-xs lg:text-sm font-bold transition-all duration-150 cursor-pointer shrink-0 ${
                    activeTab === "bulk"
                      ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/30 ring-1 ring-emerald-400/50"
                      : "text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/70 dark:hover:bg-slate-800/60"
                  }`}
                >
                  <Layers className={`w-4 h-4 shrink-0 ${activeTab === "bulk" ? "text-white" : "text-emerald-600 dark:text-emerald-400"}`} />
                  <span>Masiva</span>
                </button>
              )}

              {canAdmin && (
                <button
                  onClick={() => setActiveTab("admin")}
                  className={`btn-tactile flex items-center gap-1.5 lg:gap-2 px-2.5 lg:px-3.5 py-1.5 lg:py-2 rounded-lg text-xs lg:text-sm font-bold transition-all duration-150 cursor-pointer shrink-0 ${
                    activeTab === "admin"
                      ? "bg-violet-600 text-white shadow-md shadow-violet-600/30 ring-1 ring-violet-400/50"
                      : "text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/70 dark:hover:bg-slate-800/60"
                  }`}
                >
                  <Shield className={`w-4 h-4 shrink-0 ${activeTab === "admin" ? "text-white" : "text-violet-600 dark:text-violet-400"}`} />
                  <span>Admin</span>
                  <span className="hidden xl:inline">istración</span>
                </button>
              )}
            </nav>

            {/* Acciones de Cabecera: Modo TV, Estado POS, Usuario y Salir */}
            <div className="flex items-center gap-1 sm:gap-2 shrink-0">
              {/* Badge Entorno Dual (Local vs Nube / Túnel) */}
              <div
                className={`hidden 2xl:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border ${
                  isTunnelEnv
                    ? "bg-sky-50 dark:bg-sky-950/60 text-sky-800 dark:text-sky-300 border-sky-200 dark:border-sky-800"
                    : isLocalNetwork
                    ? "bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800"
                    : "bg-purple-50 dark:bg-purple-950/60 text-purple-800 dark:text-purple-300 border-purple-200 dark:border-purple-800"
                }`}
                title={`Entorno activo: ${envLabel} (${hostname})`}
              >
                <Server className="w-3 h-3 text-current" />
                <span>{envLabel}</span>
              </div>

              {/* Botón de Instalación PWA (Móvil y Escritorio) */}
              <PwaInstallButton />

              {/* Botón Alternar Modo Claro / Oscuro */}
              <button
                onClick={toggleTheme}
                className="btn-tactile p-1.5 sm:p-2 rounded-xl border border-slate-200 dark:border-slate-700/60 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800/70 dark:hover:bg-slate-700/70 text-amber-500 dark:text-amber-400 text-xs font-bold flex items-center gap-1.5 transition-colors shadow-xs cursor-pointer shrink-0"
                title={isDark ? "Cambiar a Modo Claro" : "Cambiar a Modo Oscuro"}
                aria-label="Alternar tema claro y oscuro"
              >
                {isDark ? (
                  <Sun className="w-4 h-4 text-amber-400" />
                ) : (
                  <Moon className="w-4 h-4 text-indigo-600" />
                )}
                <span className="hidden 2xl:inline text-slate-700 dark:text-slate-300">
                  {isDark ? "Claro" : "Oscuro"}
                </span>
              </button>

              {/* Botón Alternar Modo TV / Kiosco (solo en pantallas grandes) */}
              <button
                onClick={() => setIsTvMode(!isTvMode)}
                className={`hidden xl:flex btn-tactile p-2 rounded-xl border text-xs font-bold items-center gap-1.5 cursor-pointer shrink-0 ${
                  isTvMode
                    ? "bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-500/40 shadow-md shadow-amber-500/10"
                    : "bg-slate-100 dark:bg-slate-800/70 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700/60 hover:text-slate-900 dark:hover:text-white"
                }`}
                title={
                  isTvMode
                    ? "Desactivar modo TV"
                    : "Activar modo TV / Pantalla Gigante"
                }
              >
                <Tv className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                <span className="hidden 2xl:inline">
                  {isTvMode ? "TV Activo" : "Modo TV"}
                </span>
              </button>

              {/* Indicador de Estado del Sistema POS */}
              <div
                className={`flex items-center gap-1.5 sm:gap-2 px-2 sm:px-2.5 py-1 sm:py-1.5 rounded-full text-xs font-semibold border shrink-0 ${
                  posStatus?.is_ready
                    ? "bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-700 text-emerald-800 dark:text-emerald-300"
                    : posStatus?.last_error
                      ? "bg-rose-50 dark:bg-rose-950/60 border-rose-200 dark:border-rose-700 text-rose-800 dark:text-rose-300"
                      : "bg-amber-50 dark:bg-amber-950/60 border-amber-200 dark:border-amber-700 text-amber-800 dark:text-amber-300"
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
                <span className="hidden xl:inline text-[11px] sm:text-xs">
                  {posStatus?.is_ready
                    ? "POS Conectado"
                    : posStatus?.last_error
                      ? "Error POS"
                      : "Conectando..."}
                </span>
                <span className="hidden sm:inline xl:hidden text-[11px] font-bold">POS</span>
                <span className="sm:hidden text-[10px] font-bold">POS</span>
              </div>

              {/* Pastilla de Usuario y Logout */}
              <div className="flex items-center gap-1 sm:gap-1.5 pl-0.5 sm:pl-1.5 sm:border-l sm:border-slate-200 dark:sm:border-slate-800 shrink-0">
                <div className="hidden lg:flex items-center gap-1.5 text-xs text-slate-800 dark:text-slate-200 bg-slate-100 dark:bg-slate-800/80 px-2 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700/60 shrink-0">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span className="font-bold truncate max-w-[90px] xl:max-w-[120px]">
                    {user?.full_name || user?.username || "Usuario"}
                  </span>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-mono hidden xl:inline">
                    ({user?.role || "cajero"})
                  </span>
                </div>

                <button
                  onClick={onLogout}
                  className="btn-tactile p-1.5 sm:p-2 rounded-xl bg-slate-100 hover:bg-rose-100 dark:bg-slate-800/80 dark:hover:bg-rose-950/50 text-slate-600 hover:text-rose-700 dark:text-slate-300 dark:hover:text-rose-300 border border-slate-200 dark:border-slate-700/70 hover:border-rose-300 dark:hover:border-rose-700/60 transition-colors cursor-pointer shrink-0"
                  title="Cerrar sesión"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* BARRA DE NAVEGACIÓN MÓVIL INFERIOR ERGONÓMICA (md:hidden) - ALTO CONTRASTE CLARO Y OSCURO */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/98 dark:bg-slate-950/98 backdrop-blur-lg border-t border-slate-200 dark:border-slate-800/90 px-1 pt-1 pb-safe shadow-2xl flex items-center justify-around transition-colors">
        <button
          onClick={() => setActiveTab("single")}
          className={`btn-tactile flex-1 min-h-[50px] flex flex-col items-center justify-center gap-0.5 py-1 px-0.5 rounded-xl text-[10px] font-bold cursor-pointer transition-colors ${
            activeTab === "single"
              ? "bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-600/40 shadow-xs"
              : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
          }`}
        >
          <ScanBarcode className={`w-5 h-5 mb-0.5 shrink-0 ${
            activeTab === "single"
              ? "text-emerald-700 dark:text-emerald-300"
              : "text-slate-500 dark:text-slate-400"
          }`} />
          <span className={activeTab === "single" ? "text-emerald-800 dark:text-emerald-300 font-extrabold" : "text-slate-600 dark:text-slate-400"}>
            Consulta
          </span>
        </button>

        <button
          onClick={() => setActiveTab("catalog")}
          className={`btn-tactile flex-1 min-h-[50px] flex flex-col items-center justify-center gap-0.5 py-1 px-0.5 rounded-xl text-[10px] font-bold cursor-pointer transition-colors ${
            activeTab === "catalog"
              ? "bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-600/40 shadow-xs"
              : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
          }`}
        >
          <Package className={`w-5 h-5 mb-0.5 shrink-0 ${
            activeTab === "catalog"
              ? "text-emerald-700 dark:text-emerald-300"
              : "text-slate-500 dark:text-slate-400"
          }`} />
          <span className={activeTab === "catalog" ? "text-emerald-800 dark:text-emerald-300 font-extrabold" : "text-slate-600 dark:text-slate-400"}>
            Catálogo
          </span>
        </button>

        {canInvoices && (
          <button
            onClick={() => setActiveTab("invoices")}
            className={`btn-tactile flex-1 min-h-[50px] flex flex-col items-center justify-center gap-0.5 py-1 px-0.5 rounded-xl text-[10px] font-bold cursor-pointer transition-colors ${
              activeTab === "invoices"
                ? "bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-600/40 shadow-xs"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
            }`}
          >
            <Receipt className={`w-5 h-5 mb-0.5 shrink-0 ${
              activeTab === "invoices"
                ? "text-emerald-700 dark:text-emerald-300"
                : "text-slate-500 dark:text-slate-400"
            }`} />
            <span className={activeTab === "invoices" ? "text-emerald-800 dark:text-emerald-300 font-extrabold" : "text-slate-600 dark:text-slate-400"}>
              Facturas
            </span>
          </button>
        )}

        {canBulk && (
          <button
            onClick={() => setActiveTab("bulk")}
            className={`btn-tactile flex-1 min-h-[50px] flex flex-col items-center justify-center gap-0.5 py-1 px-0.5 rounded-xl text-[10px] font-bold cursor-pointer transition-colors ${
              activeTab === "bulk"
                ? "bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-600/40 shadow-xs"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
            }`}
          >
            <Layers className={`w-5 h-5 mb-0.5 shrink-0 ${
              activeTab === "bulk"
                ? "text-emerald-700 dark:text-emerald-300"
                : "text-slate-500 dark:text-slate-400"
            }`} />
            <span className={activeTab === "bulk" ? "text-emerald-800 dark:text-emerald-300 font-extrabold" : "text-slate-600 dark:text-slate-400"}>
              Masiva
            </span>
          </button>
        )}

        {canAdmin && (
          <button
            onClick={() => setActiveTab("admin")}
            className={`btn-tactile flex-1 min-h-[50px] flex flex-col items-center justify-center gap-0.5 py-1 px-0.5 rounded-xl text-[10px] font-bold cursor-pointer transition-colors ${
              activeTab === "admin"
                ? "bg-violet-100 dark:bg-violet-950/60 text-violet-800 dark:text-violet-300 border border-violet-300 dark:border-violet-600/40 shadow-xs"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
            }`}
          >
            <Shield className={`w-5 h-5 mb-0.5 shrink-0 ${
              activeTab === "admin"
                ? "text-violet-700 dark:text-violet-300"
                : "text-slate-500 dark:text-slate-400"
            }`} />
            <span className={activeTab === "admin" ? "text-violet-800 dark:text-violet-300 font-extrabold" : "text-slate-600 dark:text-slate-400"}>
              Admin
            </span>
          </button>
        )}
      </nav>
    </>
  );
}
