import React, { createContext, useContext, useState, useCallback } from "react";
import LoadingOverlay from "../components/common/LoadingOverlay";

const LoadingContext = createContext(null);

export function LoadingProvider({ children }) {
  const [loadingState, setLoadingState] = useState({
    isVisible: false,
    title: "Procesando Solicitud",
    message: "Conectando con el sistema...",
    submessage: "Por favor espere un momento...",
    iconType: "loader",
  });

  const showLoader = useCallback(
    ({
      title = "Procesando Solicitud",
      message = "Conectando con el sistema...",
      submessage = "Por favor no cierre la ventana mientras se completa la operación.",
      iconType = "loader",
    } = {}) => {
      setLoadingState({
        isVisible: true,
        title,
        message,
        submessage,
        iconType,
      });
    },
    [],
  );

  const hideLoader = useCallback(() => {
    setLoadingState((prev) => ({ ...prev, isVisible: false }));
  }, []);

  return (
    <LoadingContext.Provider
      value={{
        showLoader,
        hideLoader,
        isLoading: loadingState.isVisible,
      }}
    >
      {children}
      <LoadingOverlay
        isVisible={loadingState.isVisible}
        title={loadingState.title}
        message={loadingState.message}
        submessage={loadingState.submessage}
        iconType={loadingState.iconType}
      />
    </LoadingContext.Provider>
  );
}

export function useLoading() {
  const ctx = useContext(LoadingContext);
  if (!ctx) {
    // Retorno seguro si se usa fuera del Provider
    return {
      showLoader: () => {},
      hideLoader: () => {},
      isLoading: false,
    };
  }
  return ctx;
}
