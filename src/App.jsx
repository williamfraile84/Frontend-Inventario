import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Navbar from "./components/Navbar";
import BarcodeScanner from "./components/BarcodeScanner";
import ProductCard from "./components/ProductCard";
import SinglePriceModal from "./components/SinglePriceModal";
import Login from "./components/Auth/Login";
import ServerDownView from "./components/common/ServerDownView";
import ErrorBoundary from "./components/common/ErrorBoundary";

// Code-splitting y Lazy Loading para optimización de bundle inicial y tiempos de carga
const ProductCatalogView = React.lazy(() => import("./components/Catalog/ProductCatalogView"));
const InvoiceProcessor = React.lazy(() => import("./components/Invoices/InvoiceProcessor"));
const BulkPriceEditor = React.lazy(() => import("./components/BulkPriceEditor"));
const AdminPanel = React.lazy(() => import("./components/Admin/AdminPanel"));

function TabLoadingFallback({ label = "Cargando módulo..." }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[40vh] p-8 space-y-4 animate-in fade-in duration-300">
      <div className="relative">
        <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shadow-inner">
          <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        </div>
        <div className="absolute -inset-1 bg-emerald-500/20 rounded-2xl blur-md -z-10 animate-pulse" />
      </div>
      <div className="text-center space-y-1">
        <p className="text-xs font-bold text-slate-300 tracking-wide uppercase">{label}</p>
        <p className="text-[11px] text-slate-500 font-medium">Cargando componentes y datos...</p>
      </div>
    </div>
  );
}
import { LoadingProvider, useLoading } from "./context/LoadingContext";
import { ToastProvider, useToast } from "./context/ToastContext";
import { ThemeProvider } from "./context/ThemeContext";
import { authService, productService } from "./services/api";
import { formatCurrency } from "./utils/currency";

function AppContent() {
  const location = useLocation();
  const navigate = useNavigate();

  const pathToTab = useMemo(
    () => ({
      "/": "single",
      "/precios": "single",
      "/consulta": "single",
      "/catalogo": "catalog",
      "/facturas": "invoices",
      "/masivo": "bulk",
      "/admin": "admin",
    }),
    [],
  );

  const tabToPath = useMemo(
    () => ({
      single: "/",
      catalog: "/catalogo",
      invoices: "/facturas",
      bulk: "/masivo",
      admin: "/admin",
    }),
    [],
  );

  const [isAuthenticated, setIsAuthenticated] = useState(
    authService.isLoggedIn(),
  );
  const [user, setUser] = useState(authService.getUser());

  const checkTabPermission = useCallback((tab, currentUser) => {
    if (!currentUser) return false;
    if (currentUser.role === "admin") return true;
    if (tab === "single" || tab === "catalog") return true;
    if (tab === "bulk") return authService.hasPermission("can_edit_bulk");
    if (tab === "invoices") {
      return (
        authService.hasPermission("can_process_invoices") ||
        currentUser.role === "supervisor"
      );
    }
    if (tab === "admin") {
      return (
        authService.hasPermission("can_manage_users") ||
        authService.hasPermission("can_view_audit")
      );
    }
    return true;
  }, []);

  // Determinar pestaña según la URL actual del navegador y permisos del usuario
  const requestedTab = pathToTab[location.pathname] || "single";
  const isTabAllowed = checkTabPermission(requestedTab, user);
  const activeTab = isTabAllowed ? requestedTab : "single";

  const [posStatus, setPosStatus] = useState(null);
  const [isTvMode, setIsTvMode] = useState(false);
  const [visitedTabs, setVisitedTabs] = useState(() => new Set([activeTab]));
  const [prevActiveTab, setPrevActiveTab] = useState(activeTab);
  const [isServerDown, setIsServerDown] = useState(false);

  if (activeTab !== prevActiveTab) {
    setPrevActiveTab(activeTab);
    if (!visitedTabs.has(activeTab)) {
      const next = new Set(visitedTabs);
      next.add(activeTab);
      setVisitedTabs(next);
    }
  }

  const { showLoader, hideLoader } = useLoading();
  const { addToast } = useToast();

  // Redirigir si la pestaña solicitada no está permitida para el rol actual
  useEffect(() => {
    if (user && !isTabAllowed) {
      addToast({
        type: "warning",
        title: "Acceso Restringido",
        message: "Su rol no tiene permisos para acceder a esta sección.",
      });
      navigate("/", { replace: true });
    }
  }, [user, isTabAllowed, navigate, addToast]);

  // Manejar cambio de pestaña actualizando el historial y URL del navegador
  const handleTabChange = useCallback(
    (newTab) => {
      if (user && !checkTabPermission(newTab, user)) {
        addToast({
          type: "warning",
          title: "Acceso Restringido",
          message: "Su rol no cuenta con permisos para acceder a esta sección.",
        });
        return;
      }
      const targetPath = tabToPath[newTab] || "/";
      if (location.pathname !== targetPath) {
        navigate(targetPath);
      }
    },
    [checkTabPermission, user, tabToPath, location.pathname, navigate, addToast],
  );

  // Single Lookup & Edit State
  const [currentProduct, setCurrentProduct] = useState(null);
  const [isSearchingProduct, setIsSearchingProduct] = useState(false);
  const [isSingleModalOpen, setIsSingleModalOpen] = useState(false);
  const [isUpdatingSinglePrice, setIsUpdatingSinglePrice] = useState(false);

  // Trigger para activar automáticamente la cámara al consultar otro producto
  const [cameraTrigger, setCameraTrigger] = useState(0);

  const handleConsultarOtro = useCallback(() => {
    setCurrentProduct(null);
    setCameraTrigger((prev) => prev + 1);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  // Sequence ref to strictly avoid race conditions and stale response overrides
  const searchSeqRef = useRef(0);

  // Ref para auto-scroll hacia la sección de información del producto encontrado
  const productCardRef = useRef(null);

  // Listen to custom auth and server connectivity events
  useEffect(() => {
    const handleAuthChange = () => {
      const logged = authService.isLoggedIn();
      setIsAuthenticated(logged);
      setUser(authService.getUser());
      if (!logged) {
        setCurrentProduct(null);
      }
    };
    const handleServerDown = () => setIsServerDown(true);
    const handleServerUp = () => setIsServerDown(false);

    window.addEventListener("auth_change", handleAuthChange);
    window.addEventListener("app_server_down", handleServerDown);
    window.addEventListener("app_server_up", handleServerUp);
    return () => {
      window.removeEventListener("auth_change", handleAuthChange);
      window.removeEventListener("app_server_down", handleServerDown);
      window.removeEventListener("app_server_up", handleServerUp);
    };
  }, []);

  // Check POS status periodically when authenticated
  useEffect(() => {
    if (!isAuthenticated) return;

    let isMounted = true;
    let timerId = null;

    const checkStatus = async () => {
      try {
        const data = await productService.getPosStatus();
        if (isMounted) {
          setPosStatus(data);
          const nextDelay = data?.is_ready ? 25000 : 4000;
          timerId = setTimeout(checkStatus, nextDelay);
        }
      } catch (err) {
        if (isMounted) {
          const errMsg =
            err.response?.data?.detail ||
            err.message ||
            "Sin conexión con el backend (servidor apagado o desconectado)";
          setPosStatus({
            is_ready: false,
            is_logged_in: false,
            active_domain: "csopos.co",
            last_error: errMsg,
          });
          timerId = setTimeout(checkStatus, 6000);
        }
      }
    };

    checkStatus();

    return () => {
      isMounted = false;
      if (timerId) clearTimeout(timerId);
    };
  }, [isAuthenticated]);

  // Auto-scroll hacia la tarjeta de información cuando se encuentra un producto
  useEffect(() => {
    if (currentProduct && productCardRef.current) {
      setTimeout(() => {
        productCardRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
          inline: "nearest",
        });
      }, 120);
    }
  }, [currentProduct]);

  // Handle Barcode Scan / Lookup
  const handleProductScan = async (barcode) => {
    if (!barcode || isSearchingProduct || isUpdatingSinglePrice) return;

    // Incrementar secuencia y limpiar INMEDIATAMENTE el producto anterior para evitar datos stale
    const currentSeq = ++searchSeqRef.current;
    setCurrentProduct(null);
    setIsSearchingProduct(true);

    showLoader({
      title: "Consultando Sistema POS",
      message: `Buscando código ${barcode}...`,
      submessage:
        "Extrayendo precio de venta, categoría y existencias en tiempo real...",
      iconType: "search",
    });

    try {
      addToast({
        type: "info",
        title: "Consultando POS...",
        message: `Buscando código ${barcode}...`,
      });

      const res = await productService.lookupProduct(barcode);

      // Validar que la respuesta corresponda a la última petición emitida
      if (currentSeq !== searchSeqRef.current) {
        return;
      }

      if (res.found) {
        setCurrentProduct(res);
        addToast({
          type: "success",
          title: "Producto Encontrado",
          message: `${res.name} - Precio actual: ${res.formatted_price}`,
        });
      } else {
        addToast({
          type: "warning",
          title: "No encontrado",
          message:
            res.message ||
            `No se encontró ningún artículo para el código ${barcode}.`,
        });
        // Si no se encontró el artículo, reactivar la cámara tras la notificación para permitir escanear de inmediato
        setTimeout(() => {
          setCameraTrigger((prev) => prev + 1);
        }, 1200);
      }
    } catch (err) {
      if (currentSeq === searchSeqRef.current) {
        console.error(err);
        addToast({
          type: "error",
          title: "Error de Consulta",
          message:
            err.response?.data?.detail ||
            "Error al conectar con el POS para consultar el producto.",
        });
      }
    } finally {
      if (currentSeq === searchSeqRef.current) {
        setIsSearchingProduct(false);
        hideLoader();
      }
    }
  };

  // Handle Single Price Update Confirmation
  const handleSinglePriceConfirm = async (newPrice) => {
    if (!currentProduct || isUpdatingSinglePrice) return;
    setIsUpdatingSinglePrice(true);

    showLoader({
      title: "Actualizando Precio en POS",
      message: `Guardando ${formatCurrency(newPrice)} para ${currentProduct.name}...`,
      submessage: "Confirmando cambios en el catálogo de csopos.co...",
      iconType: "dollar",
    });

    try {
      const barcodeToUse =
        currentProduct.modal_barcode || currentProduct.barcode;
      const res = await productService.updateSinglePrice({
        barcode: barcodeToUse,
        newPrice,
        itemId: currentProduct.item_id,
        modalBarcode: currentProduct.modal_barcode,
        itemName: currentProduct.name,
        oldPrice: currentProduct.unit_price,
      });

      addToast({
        type: "success",
        title: "¡Precio Actualizado!",
        message: res.message,
      });

      // 1. Limpiar caché en cliente
      productService.clearCache();

      // 2. Actualizar el producto en memoria con el nuevo precio de inmediato
      const formatted = res.formatted_new_price || formatCurrency(res.new_price);
      setCurrentProduct((prev) =>
        prev
          ? {
              ...prev,
              unit_price: res.new_price,
              formatted_price: formatted,
            }
          : null,
      );

      setIsSingleModalOpen(false);

      // 3. Re-consulta silenciosa en segundo plano para sincronizar cualquier campo adicional del POS
      if (barcodeToUse) {
        productService
          .lookupProduct(barcodeToUse)
          .then((fresh) => {
            if (fresh && fresh.found) {
              setCurrentProduct(fresh);
            }
          })
          .catch(() => {});
      }
    } catch (err) {
      console.error(err);
      addToast({
        type: "error",
        title: "Fallo al Actualizar",
        message:
          err.response?.data?.detail ||
          "No se pudo actualizar el precio en el catálogo del POS.",
      });
    } finally {
      setIsUpdatingSinglePrice(false);
      hideLoader();
    }
  };

  const handleLogout = () => {
    authService.logout();
    navigate("/");
    addToast({
      type: "info",
      title: "Sesión Finalizada",
      message: "Has cerrado sesión correctamente.",
    });
  };

  if (isServerDown) {
    return <ServerDownView onReconnected={() => setIsServerDown(false)} />;
  }

  if (!isAuthenticated) {
    return (
      <Login
        onLoginSuccess={(u) => {
          setUser(u);
          setIsAuthenticated(true);
          const matchedTab = pathToTab[location.pathname] || "single";
          handleTabChange(matchedTab);
        }}
      />
    );
  }

  return (
    <div
      className={`min-h-screen min-h-[100dvh] bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col selection:bg-emerald-500 selection:text-white pb-safe transition-colors duration-200 ${
        isTvMode ? "text-base scale-100" : ""
      }`}
    >
      {/* Top Navbar */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={handleTabChange}
        posStatus={posStatus}
        user={user}
        onLogout={handleLogout}
        isTvMode={isTvMode}
        setIsTvMode={setIsTvMode}
      />

      {/* Main Content Body */}
      <main
        className={`flex-1 w-full mx-auto py-4 sm:py-6 pb-24 md:pb-8 ${
          isTvMode
            ? "max-w-[1800px] px-3 sm:px-6 lg:px-8"
            : activeTab === "invoices"
            ? "max-w-[1850px] px-2 sm:px-4 lg:px-6"
            : "max-w-7xl px-3 sm:px-6 lg:px-8"
        }`}
      >
        {/* TAB 1: CONSULTA Y EDICIÓN INDIVIDUAL (KEEP-ALIVE) */}
        <div className={activeTab === "single" ? "block space-y-6" : "hidden"}>
          <BarcodeScanner
            onScan={handleProductScan}
            isSearching={isSearchingProduct}
            isTvMode={isTvMode}
            isPaused={Boolean(currentProduct) || activeTab !== "single"}
            onResumeScan={handleConsultarOtro}
            cameraTrigger={cameraTrigger}
          />

          {/* Product Result Card con auto-scroll suave */}
          {currentProduct && (
            <div ref={productCardRef} className="scroll-mt-20">
              <ProductCard
                product={currentProduct}
                onEditPrice={() => setIsSingleModalOpen(true)}
                onReset={handleConsultarOtro}
                isTvMode={isTvMode}
              />
            </div>
          )}

          <SinglePriceModal
            product={currentProduct}
            isOpen={isSingleModalOpen}
            onClose={() => setIsSingleModalOpen(false)}
            onConfirm={handleSinglePriceConfirm}
            isUpdating={isUpdatingSinglePrice}
          />
        </div>

        {/* TAB 2: CATÁLOGO Y CREACIÓN DE PRODUCTOS (KEEP-ALIVE) */}
        {visitedTabs.has("catalog") && (
          <div className={activeTab === "catalog" ? "block" : "hidden"}>
            <ErrorBoundary title="Problema al visualizar el catálogo">
              <React.Suspense fallback={<TabLoadingFallback label="Cargando catálogo maestro..." />}>
                <ProductCatalogView onShowToast={addToast} isTvMode={isTvMode} />
              </React.Suspense>
            </ErrorBoundary>
          </div>
        )}

        {/* TAB 3: ASISTENTE DE FACTURAS DIAN & GEMINI VISION (KEEP-ALIVE) */}
        {visitedTabs.has("invoices") && (
          <div className={activeTab === "invoices" ? "block" : "hidden"}>
            <ErrorBoundary title="Problema al visualizar la factura">
              <React.Suspense fallback={<TabLoadingFallback label="Iniciando asistente de facturas..." />}>
                <InvoiceProcessor onShowToast={addToast} isTvMode={isTvMode} />
              </React.Suspense>
            </ErrorBoundary>
          </div>
        )}

        {/* TAB 4: EDICIÓN MASIVA (KEEP-ALIVE) */}
        {visitedTabs.has("bulk") && (
          <div className={activeTab === "bulk" ? "block" : "hidden"}>
            <React.Suspense fallback={<TabLoadingFallback label="Cargando editor masivo de precios..." />}>
              <BulkPriceEditor onShowToast={addToast} isTvMode={isTvMode} />
            </React.Suspense>
          </div>
        )}

        {/* TAB 5: PANEL ADMINISTRATIVO (KEEP-ALIVE) */}
        {visitedTabs.has("admin") && (
          <div className={activeTab === "admin" ? "block" : "hidden"}>
            <React.Suspense fallback={<TabLoadingFallback label="Cargando panel de administración..." />}>
              <AdminPanel onShowToast={addToast} />
            </React.Suspense>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-900 dark:border-slate-900 light:border-slate-200 bg-slate-950/60 dark:bg-slate-950/60 light:bg-white/80 py-3 text-center text-xs text-slate-500 dark:text-slate-500 light:text-slate-600 pb-safe transition-colors">
        <p>
          FRUVER POS &bull; Gestor Inteligente de Precios e Inventario &bull;{" "}
          {new Date().getFullYear()}
        </p>
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <LoadingProvider>
          <AppContent />
        </LoadingProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
