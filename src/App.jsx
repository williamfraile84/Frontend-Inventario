import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Navbar from "./components/Navbar";
import BarcodeScanner from "./components/BarcodeScanner";
import ProductCard from "./components/ProductCard";
import SinglePriceModal from "./components/SinglePriceModal";
import BulkPriceEditor from "./components/BulkPriceEditor";
import ProductCatalogView from "./components/Catalog/ProductCatalogView";
import InvoiceProcessor from "./components/Invoices/InvoiceProcessor";
import AdminPanel from "./components/Admin/AdminPanel";
import Login from "./components/Auth/Login";
import ServerDownView from "./components/common/ServerDownView";
import ErrorBoundary from "./components/common/ErrorBoundary";
import { LoadingProvider, useLoading } from "./context/LoadingContext";
import { ToastProvider, useToast } from "./context/ToastContext";
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

  // Determinar pestaña inicial según la URL actual del navegador
  const initialTab = pathToTab[location.pathname] || "single";
  const [activeTab, setActiveTab] = useState(initialTab);
  const [posStatus, setPosStatus] = useState(null);
  const [isTvMode, setIsTvMode] = useState(false);
  const [visitedTabs, setVisitedTabs] = useState(new Set([initialTab]));
  const [isServerDown, setIsServerDown] = useState(false);

  const { showLoader, hideLoader } = useLoading();

  // Sincronizar activeTab cuando la URL cambia externamente (back/forward o link directo)
  useEffect(() => {
    const matchedTab = pathToTab[location.pathname];
    if (matchedTab && matchedTab !== activeTab) {
      setActiveTab(matchedTab);
    }
  }, [location.pathname, pathToTab, activeTab]);

  useEffect(() => {
    setVisitedTabs((prev) => {
      const next = new Set(prev);
      next.add(activeTab);
      return next;
    });
  }, [activeTab]);

  // Manejar cambio de pestaña actualizando el historial y URL del navegador
  const handleTabChange = useCallback(
    (newTab) => {
      setActiveTab(newTab);
      const targetPath = tabToPath[newTab] || "/";
      if (location.pathname !== targetPath) {
        navigate(targetPath);
      }
    },
    [location.pathname, navigate, tabToPath],
  );

  // Single Lookup & Edit State
  const [currentProduct, setCurrentProduct] = useState(null);
  const [isSearchingProduct, setIsSearchingProduct] = useState(false);
  const [isSingleModalOpen, setIsSingleModalOpen] = useState(false);
  const [isUpdatingSinglePrice, setIsUpdatingSinglePrice] = useState(false);

  // Sequence ref to strictly avoid race conditions and stale response overrides
  const searchSeqRef = useRef(0);

  // Ref para auto-scroll hacia la sección de información del producto encontrado
  const productCardRef = useRef(null);

  // Toast context hook
  const { showToast, addToast } = useToast();

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

      // Actualizar el producto en memoria con el nuevo precio
      setCurrentProduct((prev) =>
        prev
          ? {
              ...prev,
              unit_price: res.new_price,
              formatted_price: res.formatted_new_price,
            }
          : null,
      );

      setIsSingleModalOpen(false);
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
          setActiveTab(matchedTab);
        }}
      />
    );
  }

  return (
    <div
      className={`min-h-screen min-h-[100dvh] bg-slate-950 text-slate-100 flex flex-col selection:bg-emerald-500 selection:text-white pb-safe ${
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
        className={`flex-1 w-full mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6 ${
          isTvMode ? "max-w-[1800px]" : "max-w-7xl"
        }`}
      >
        {/* TAB 1: CONSULTA Y EDICIÓN INDIVIDUAL (KEEP-ALIVE) */}
        <div className={activeTab === "single" ? "block space-y-6" : "hidden"}>
          <BarcodeScanner
            onScan={handleProductScan}
            isSearching={isSearchingProduct}
            isTvMode={isTvMode}
            isPaused={Boolean(currentProduct) || activeTab !== "single"}
            onResumeScan={() => {
              setCurrentProduct(null);
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
          />

          {/* Product Result Card con auto-scroll suave */}
          {currentProduct && (
            <div ref={productCardRef} className="scroll-mt-20">
              <ProductCard
                product={currentProduct}
                onEditPrice={() => setIsSingleModalOpen(true)}
                onReset={() => {
                  setCurrentProduct(null);
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
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
            <ProductCatalogView onShowToast={addToast} isTvMode={isTvMode} />
          </div>
        )}

        {/* TAB 3: LECTOR DE FACTURAS OCR (KEEP-ALIVE) */}
        {visitedTabs.has("invoices") && (
          <div className={activeTab === "invoices" ? "block" : "hidden"}>
            <ErrorBoundary title="Problema al visualizar la factura">
              <InvoiceProcessor onShowToast={addToast} isTvMode={isTvMode} />
            </ErrorBoundary>
          </div>
        )}

        {/* TAB 4: EDICIÓN MASIVA (KEEP-ALIVE) */}
        {visitedTabs.has("bulk") && (
          <div className={activeTab === "bulk" ? "block" : "hidden"}>
            <BulkPriceEditor onShowToast={addToast} isTvMode={isTvMode} />
          </div>
        )}

        {/* TAB 5: PANEL ADMINISTRATIVO (KEEP-ALIVE) */}
        {visitedTabs.has("admin") && (
          <div className={activeTab === "admin" ? "block" : "hidden"}>
            <AdminPanel onShowToast={addToast} />
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-900 bg-slate-950/60 py-3 text-center text-xs text-slate-500 pb-safe">
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
    <ToastProvider>
      <LoadingProvider>
        <AppContent />
      </LoadingProvider>
    </ToastProvider>
  );
}
