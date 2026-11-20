import React, { useState } from "react";
import {
  X,
  CheckSquare,
  Square,
  AlertCircle,
  Save,
  UserCheck,
} from "lucide-react";

const ROLE_PERMISSIONS_MAP = {
  admin: {
    can_lookup: true,
    can_edit_single: true,
    can_edit_bulk: true,
    can_manage_users: true,
    can_view_audit: true,
    can_process_invoices: true,
    can_sync_pos: true,
  },
  supervisor: {
    can_lookup: true,
    can_edit_single: true,
    can_edit_bulk: true,
    can_manage_users: false,
    can_view_audit: true,
    can_process_invoices: true,
    can_sync_pos: true,
  },
  cajero: {
    can_lookup: true,
    can_edit_single: false,
    can_edit_bulk: false,
    can_manage_users: false,
    can_view_audit: false,
    can_process_invoices: false,
    can_sync_pos: false,
  },
};

const sanitizePermissions = (raw, role = "cajero") => {
  const base = ROLE_PERMISSIONS_MAP[role] || ROLE_PERMISSIONS_MAP.cajero;
  if (!raw || typeof raw !== "object") return { ...base };
  return {
    can_lookup: typeof raw.can_lookup === "boolean" ? raw.can_lookup : (base.can_lookup ?? true),
    can_edit_single: typeof raw.can_edit_single === "boolean" ? raw.can_edit_single : (base.can_edit_single ?? false),
    can_edit_bulk: typeof raw.can_edit_bulk === "boolean" ? raw.can_edit_bulk : (base.can_edit_bulk ?? false),
    can_manage_users: typeof raw.can_manage_users === "boolean" ? raw.can_manage_users : (base.can_manage_users ?? false),
    can_view_audit: typeof raw.can_view_audit === "boolean" ? raw.can_view_audit : (base.can_view_audit ?? false),
    can_process_invoices: typeof raw.can_process_invoices === "boolean" ? raw.can_process_invoices : (base.can_process_invoices ?? false),
    can_sync_pos: typeof raw.can_sync_pos === "boolean" ? raw.can_sync_pos : (base.can_sync_pos ?? false),
  };
};

export default function UserModal({
  isOpen,
  onClose,
  onSave,
  userToEdit = null,
  isSaving = false,
}) {
  const isEditing = !!userToEdit;

  const [username, setUsername] = useState(userToEdit?.username || "");
  const [fullName, setFullName] = useState(userToEdit?.full_name || "");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState(userToEdit?.role || "cajero");
  const [isActive, setIsActive] = useState(userToEdit?.is_active !== false);
  const [permissions, setPermissions] = useState(() =>
    sanitizePermissions(userToEdit?.permissions, userToEdit?.role || "cajero")
  );
  const [error, setError] = useState("");
  const [prevUserToEdit, setPrevUserToEdit] = useState(userToEdit);

  if (userToEdit !== prevUserToEdit) {
    setPrevUserToEdit(userToEdit);
    if (userToEdit) {
      setUsername(userToEdit.username || "");
      setFullName(userToEdit.full_name || "");
      setPassword("");
      setRole(userToEdit.role || "cajero");
      setIsActive(userToEdit.is_active !== false);
      setPermissions(sanitizePermissions(userToEdit.permissions, userToEdit.role || "cajero"));
    } else {
      setUsername("");
      setFullName("");
      setPassword("");
      setRole("cajero");
      setIsActive(true);
      setPermissions(ROLE_PERMISSIONS_MAP.cajero);
    }
    setError("");
  }

  const handleRoleChange = (newRole) => {
    setRole(newRole);
    if (ROLE_PERMISSIONS_MAP[newRole]) {
      setPermissions({ ...ROLE_PERMISSIONS_MAP[newRole] });
    }
  };

  const togglePermission = (permKey) => {
    setPermissions((prev) => ({
      ...prev,
      [permKey]: !prev[permKey],
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!username.trim()) {
      setError("El nombre de usuario es obligatorio.");
      return;
    }
    if (!fullName.trim()) {
      setError("El nombre completo es obligatorio.");
      return;
    }
    if (!isEditing && (!password || password.length < 4)) {
      setError("La contraseña inicial debe tener al menos 4 caracteres.");
      return;
    }

    const payload = {
      username: username.trim(),
      full_name: fullName.trim(),
      role,
      permissions: { ...permissions },
      is_active: isActive,
    };

    if (password) {
      payload.password = password;
    }

    onSave(payload);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl max-w-lg w-full p-4 sm:p-6 shadow-2xl relative my-auto max-h-[calc(100dvh-2rem)] overflow-y-auto custom-scrollbar text-slate-900 dark:text-white">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
              <UserCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                {isEditing ? `Editar Usuario: ${userToEdit.username}` : "Crear Nuevo Usuario"}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Configura credenciales, rol del sistema y permisos de acceso
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isSaving}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mt-4 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800/80 text-rose-700 dark:text-rose-200 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
            <span>{error}</span>
          </div>
        )}

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="space-y-4 mt-4 text-left">
          {/* Username & Full Name */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">
                Usuario (Login)
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/\s+/g, ""))}
                disabled={isEditing || isSaving}
                placeholder="ej: supervisor1"
                className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-sm text-slate-900 dark:text-white focus:border-emerald-500 focus:outline-none disabled:opacity-50"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">
                Nombre Completo
              </label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                disabled={isSaving}
                placeholder="ej: Carlos Gómez"
                className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-sm text-slate-900 dark:text-white focus:border-emerald-500 focus:outline-none"
                required
              />
            </div>
          </div>

          {/* Password */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">
              {isEditing ? "Nueva Contraseña (Opcional - dejar vacío para mantener)" : "Contraseña"}
            </label>
            <div className="relative">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isSaving}
                placeholder={isEditing ? "•••••••• (Sin cambios)" : "Mínimo 4 caracteres"}
                className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-sm text-slate-900 dark:text-white focus:border-emerald-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Role & Active Status */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">
                Rol del Sistema
              </label>
              <select
                value={role}
                onChange={(e) => handleRoleChange(e.target.value)}
                disabled={isSaving || (userToEdit && userToEdit.username === "admin")}
                className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-sm text-slate-900 dark:text-white focus:border-emerald-500 focus:outline-none"
              >
                <option value="cajero">Cajero / Consultor</option>
                <option value="supervisor">Supervisor de Tienda</option>
                <option value="admin">Administrador General</option>
              </select>
            </div>

            <div className="flex flex-col justify-end">
              <label className="flex items-center gap-2 p-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl cursor-pointer hover:border-slate-300 dark:hover:border-slate-700 transition">
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  disabled={isSaving || (userToEdit && userToEdit.username === "admin")}
                  className="rounded text-emerald-500 focus:ring-emerald-500 h-4 w-4 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700"
                />
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                  Cuenta Activa y Habilitada
                </span>
              </label>
            </div>
          </div>

          {/* Granular Permissions Section */}
          <div className="bg-slate-50 dark:bg-slate-950/70 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800/80">
            <span className="text-xs font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider block mb-2">
              Permisos y Funcionalidades
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              <label
                onClick={() => togglePermission("can_lookup")}
                className="flex items-center gap-2 p-2 rounded-lg bg-white dark:bg-slate-900/60 hover:bg-slate-100 dark:hover:bg-slate-900 cursor-pointer border border-slate-200 dark:border-slate-800/60 transition"
              >
                {permissions.can_lookup ? (
                  <CheckSquare className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                ) : (
                  <Square className="w-4 h-4 text-slate-400 dark:text-slate-500 shrink-0" />
                )}
                <span className="text-slate-700 dark:text-slate-200">Consulta y Escáner</span>
              </label>

              <label
                onClick={() => togglePermission("can_edit_single")}
                className="flex items-center gap-2 p-2 rounded-lg bg-white dark:bg-slate-900/60 hover:bg-slate-100 dark:hover:bg-slate-900 cursor-pointer border border-slate-200 dark:border-slate-800/60 transition"
              >
                {permissions.can_edit_single ? (
                  <CheckSquare className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                ) : (
                  <Square className="w-4 h-4 text-slate-400 dark:text-slate-500 shrink-0" />
                )}
                <span className="text-slate-700 dark:text-slate-200">Cambiar Precio Individual</span>
              </label>

              <label
                onClick={() => togglePermission("can_edit_bulk")}
                className="flex items-center gap-2 p-2 rounded-lg bg-white dark:bg-slate-900/60 hover:bg-slate-100 dark:hover:bg-slate-900 cursor-pointer border border-slate-200 dark:border-slate-800/60 transition"
              >
                {permissions.can_edit_bulk ? (
                  <CheckSquare className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                ) : (
                  <Square className="w-4 h-4 text-slate-400 dark:text-slate-500 shrink-0" />
                )}
                <span className="text-slate-700 dark:text-slate-200">Edición Masiva Precios</span>
              </label>

              <label
                onClick={() => togglePermission("can_view_audit")}
                className="flex items-center gap-2 p-2 rounded-lg bg-white dark:bg-slate-900/60 hover:bg-slate-100 dark:hover:bg-slate-900 cursor-pointer border border-slate-200 dark:border-slate-800/60 transition"
              >
                {permissions.can_view_audit ? (
                  <CheckSquare className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                ) : (
                  <Square className="w-4 h-4 text-slate-400 dark:text-slate-500 shrink-0" />
                )}
                <span className="text-slate-700 dark:text-slate-200">Ver Historial / Auditoría</span>
              </label>

              <label
                onClick={() => togglePermission("can_process_invoices")}
                className="flex items-center gap-2 p-2 rounded-lg bg-white dark:bg-slate-900/60 hover:bg-slate-100 dark:hover:bg-slate-900 cursor-pointer border border-slate-200 dark:border-slate-800/60 transition"
              >
                {permissions.can_process_invoices ? (
                  <CheckSquare className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                ) : (
                  <Square className="w-4 h-4 text-slate-400 dark:text-slate-500 shrink-0" />
                )}
                <span className="text-slate-700 dark:text-slate-200">Facturas OCR y Costeo</span>
              </label>

              <label
                onClick={() => togglePermission("can_sync_pos")}
                className="flex items-center gap-2 p-2 rounded-lg bg-white dark:bg-slate-900/60 hover:bg-slate-100 dark:hover:bg-slate-900 cursor-pointer border border-slate-200 dark:border-slate-800/60 transition"
              >
                {permissions.can_sync_pos ? (
                  <CheckSquare className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                ) : (
                  <Square className="w-4 h-4 text-slate-400 dark:text-slate-500 shrink-0" />
                )}
                <span className="text-slate-700 dark:text-slate-200">Sincronización POS</span>
              </label>

              <label
                onClick={() => togglePermission("can_manage_users")}
                className="flex items-center gap-2 p-2 rounded-lg bg-white dark:bg-slate-900/60 hover:bg-slate-100 dark:hover:bg-slate-900 cursor-pointer border border-slate-200 dark:border-slate-800/60 transition sm:col-span-2"
              >
                {permissions.can_manage_users ? (
                  <CheckSquare className="w-4 h-4 text-purple-600 dark:text-purple-400 shrink-0" />
                ) : (
                  <Square className="w-4 h-4 text-slate-400 dark:text-slate-500 shrink-0" />
                )}
                <span className="text-slate-800 dark:text-slate-200 font-semibold">
                  Gestión de Usuarios y Permisos (Admin)
                </span>
              </label>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2 sm:gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-300 text-xs font-semibold transition text-center cursor-pointer"
            >
              Cancelar
            </button>

            <button
              type="submit"
              disabled={isSaving}
              className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-lg shadow-emerald-600/30 transition disabled:opacity-50 cursor-pointer"
            >
              <Save className="w-4 h-4" />
              <span>{isSaving ? "Guardando..." : isEditing ? "Actualizar Usuario" : "Crear Usuario"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

