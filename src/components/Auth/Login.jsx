import React, { useState, useRef, useEffect } from "react";
import {
  Apple,
  Lock,
  User,
  LogIn,
  AlertCircle,
  ShieldCheck,
  Eye,
  EyeOff,
  CheckSquare,
  Square,
} from "lucide-react";
import { authService } from "../../services/api";

export default function Login({ onLoginSuccess }) {
  // Cargar preferencias de "Recuérdame" guardadas previamente
  const savedRemember = localStorage.getItem("fruver_remember_me") === "true";
  const savedUsername =
    localStorage.getItem("fruver_remembered_username") || "";

  const [username, setUsername] = useState(savedRemember ? savedUsername : "");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(savedRemember);
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({
    username: "",
    password: "",
  });
  const [generalError, setGeneralError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const usernameInputRef = useRef(null);
  const passwordInputRef = useRef(null);

  // Si ya tenemos el usuario recordado, enfocamos el campo de contraseña directamente
  useEffect(() => {
    if (savedRemember && savedUsername && passwordInputRef.current) {
      passwordInputRef.current.focus();
    }
  }, [savedRemember, savedUsername]);

  // Validación de campos individuales
  const validateField = (field, value) => {
    if (field === "username") {
      const clean = value.trim();
      if (!clean) return "El nombre de usuario es obligatorio.";
      if (clean.length < 3)
        return "El usuario debe tener al menos 3 caracteres.";
      return "";
    }
    if (field === "password") {
      if (!value) return "La contraseña es obligatoria.";
      if (value.length < 4)
        return "La contraseña debe tener al menos 4 caracteres.";
      return "";
    }
    return "";
  };

  const handleUsernameChange = (e) => {
    const val = e.target.value;
    setUsername(val);
    setGeneralError("");
    if (fieldErrors.username) {
      setFieldErrors((prev) => ({
        ...prev,
        username: validateField("username", val),
      }));
    }
  };

  const handlePasswordChange = (e) => {
    const val = e.target.value;
    setPassword(val);
    setGeneralError("");
    if (fieldErrors.password) {
      setFieldErrors((prev) => ({
        ...prev,
        password: validateField("password", val),
      }));
    }
  };

  const handleRememberToggle = () => {
    const nextVal = !rememberMe;
    setRememberMe(nextVal);
    if (!nextVal) {
      localStorage.removeItem("fruver_remember_me");
      localStorage.removeItem("fruver_remembered_username");
    }
  };

  const handleBlur = (field) => {
    if (field === "username") {
      setFieldErrors((prev) => ({
        ...prev,
        username: validateField("username", username),
      }));
    } else if (field === "password") {
      setFieldErrors((prev) => ({
        ...prev,
        password: validateField("password", password),
      }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const usernameErr = validateField("username", username);
    const passwordErr = validateField("password", password);

    setFieldErrors({
      username: usernameErr,
      password: passwordErr,
    });

    if (usernameErr || passwordErr) {
      if (usernameErr && usernameInputRef.current) {
        usernameInputRef.current.focus();
      } else if (passwordErr && passwordInputRef.current) {
        passwordInputRef.current.focus();
      }
      return;
    }

    setIsLoading(true);
    setGeneralError("");

    try {
      const cleanUser = username.trim();
      const data = await authService.login(cleanUser, password, rememberMe);

      // Persistencia de "Recuérdame" al ingresar exitosamente
      if (rememberMe) {
        localStorage.setItem("fruver_remember_me", "true");
        localStorage.setItem("fruver_remembered_username", cleanUser);
      } else {
        localStorage.removeItem("fruver_remember_me");
        localStorage.removeItem("fruver_remembered_username");
      }

      onLoginSuccess(data.user || { username: data.username, role: "cajero" });
    } catch (err) {
      console.error("Error al iniciar sesión:", err);
      if (err.response?.status === 401) {
        setGeneralError(
          "Usuario o contraseña incorrectos. Verifica tus credenciales.",
        );
      } else if (err.response?.status === 403) {
        setGeneralError("Esta cuenta se encuentra suspendida o inactiva.");
      } else if (err.code === "ECONNABORTED" || !err.response) {
        setGeneralError(
          "No fue posible conectar con el servidor. Verifica tu conexión o el estado del backend.",
        );
      } else {
        setGeneralError(
          err.response?.data?.detail ||
            "Error al iniciar sesión. Inténtalo nuevamente.",
        );
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-center items-center px-4 relative overflow-hidden">
      {/* Background glow ambient effects */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-emerald-600/10 rounded-full blur-3xl pointer-events-none"></div>
      <div className="absolute bottom-10 right-10 w-72 h-72 bg-lime-500/5 rounded-full blur-2xl pointer-events-none"></div>

      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl relative z-10 backdrop-blur-xl">
        {/* Brand Icon & Heading */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-emerald-600 to-lime-500 flex items-center justify-center mx-auto shadow-xl shadow-emerald-500/25 ring-1 ring-emerald-400/30 mb-4 animate-in zoom-in-75 duration-300">
            <Apple className="w-9 h-9 text-white" />
          </div>
          <h1 className="text-2xl font-black text-white tracking-tight flex items-center justify-center gap-1.5">
            FRUVER <span className="text-emerald-400">POS</span>
          </h1>
          <p className="text-xs text-slate-400 font-medium mt-1">
            Gestión Inteligente de Inventario y Precios
          </p>
          <div className="inline-flex items-center gap-1.5 text-[11px] text-emerald-400 bg-emerald-950/60 border border-emerald-800/40 px-3 py-1 rounded-full mt-3 font-semibold">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Acceso Seguro al Sistema</span>
          </div>
        </div>

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          {/* Campo Usuario */}
          <div>
            <label
              htmlFor="username"
              className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5"
            >
              Usuario
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <User className="w-4 h-4" />
              </div>
              <input
                ref={usernameInputRef}
                id="username"
                type="text"
                value={username}
                onChange={handleUsernameChange}
                onBlur={() => handleBlur("username")}
                placeholder="Ingresa tu usuario"
                autoComplete="username"
                autoFocus={!savedRemember || !savedUsername}
                disabled={isLoading}
                className={`w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-950 text-sm text-white placeholder-slate-500 transition outline-none ${
                  fieldErrors.username
                    ? "border border-rose-500/80 focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20"
                    : "border border-slate-700 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                } disabled:opacity-60 disabled:cursor-not-allowed`}
              />
            </div>
            {fieldErrors.username && (
              <p className="text-[11px] text-rose-400 mt-1.5 flex items-center gap-1 animate-in fade-in duration-150">
                <AlertCircle className="w-3 h-3 flex-shrink-0" />
                <span>{fieldErrors.username}</span>
              </p>
            )}
          </div>

          {/* Campo Contraseña */}
          <div>
            <label
              htmlFor="password"
              className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5"
            >
              Contraseña
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <Lock className="w-4 h-4" />
              </div>
              <input
                ref={passwordInputRef}
                id="password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={handlePasswordChange}
                onBlur={() => handleBlur("password")}
                placeholder="••••••••"
                autoComplete="current-password"
                disabled={isLoading}
                className={`w-full pl-10 pr-10 py-2.5 rounded-xl bg-slate-950 text-sm text-white placeholder-slate-500 transition outline-none ${
                  fieldErrors.password
                    ? "border border-rose-500/80 focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20"
                    : "border border-slate-700 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                } disabled:opacity-60 disabled:cursor-not-allowed`}
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                disabled={isLoading}
                tabIndex={-1}
                aria-label={
                  showPassword ? "Ocultar contraseña" : "Ver contraseña"
                }
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-200 transition focus:outline-none cursor-pointer"
              >
                {showPassword ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
            </div>
            {fieldErrors.password && (
              <p className="text-[11px] text-rose-400 mt-1.5 flex items-center gap-1 animate-in fade-in duration-150">
                <AlertCircle className="w-3 h-3 flex-shrink-0" />
                <span>{fieldErrors.password}</span>
              </p>
            )}
          </div>

          {/* Opción Recuérdame */}
          <div className="flex items-center justify-between pt-1">
            <button
              type="button"
              onClick={handleRememberToggle}
              disabled={isLoading}
              className="flex items-center gap-2 select-none group text-left cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none"
            >
              <div
                className={`w-4 h-4 rounded flex items-center justify-center transition border ${
                  rememberMe
                    ? "bg-emerald-600 border-emerald-500 text-white shadow-sm shadow-emerald-500/30"
                    : "bg-slate-950 border-slate-700 group-hover:border-slate-500 text-transparent"
                }`}
              >
                {rememberMe ? (
                  <CheckSquare className="w-3.5 h-3.5" />
                ) : (
                  <Square className="w-3.5 h-3.5" />
                )}
              </div>
              <span
                className={`text-xs transition font-medium ${
                  rememberMe
                    ? "text-emerald-400"
                    : "text-slate-400 group-hover:text-slate-200"
                }`}
              >
                Recuérdame en este dispositivo
              </span>
            </button>
          </div>

          {/* Mensaje de Error General / Servidor */}
          {generalError && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-950/60 border border-rose-800/70 text-rose-200 text-xs animate-in fade-in duration-200">
              <AlertCircle className="w-4 h-4 flex-shrink-0 text-rose-400" />
              <span>{generalError}</span>
            </div>
          )}

          {/* Botón de Enviar */}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full mt-2 flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-500 text-white font-bold text-sm shadow-xl shadow-emerald-600/30 ring-1 ring-emerald-400/40 transition hover:scale-[1.01] active:scale-[0.99] cursor-pointer disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                <span>Verificando credenciales...</span>
              </>
            ) : (
              <>
                <LogIn className="w-4 h-4" />
                <span>Ingresar al Sistema</span>
              </>
            )}
          </button>
        </form>

        {/* Footer info de seguridad */}
        <div className="mt-6 pt-4 border-t border-slate-800/80 text-center">
          <p className="text-[11px] text-slate-500">
            Ingresa con tus credenciales asignadas de cajero, supervisor o
            administrador.
          </p>
        </div>
      </div>

      <p className="mt-6 text-xs text-slate-600 font-medium">
        Fruver POS Manager &copy; {new Date().getFullYear()} &bull; Todos los
        derechos reservados
      </p>
    </div>
  );
}
