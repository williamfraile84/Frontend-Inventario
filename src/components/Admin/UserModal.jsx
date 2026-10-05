import React, { useState, useEffect } from "react";
import {
  X,
  User,
  Lock,
  Shield,
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
  },
  supervisor: {
    can_lookup: true,
    can_edit_single: true,
    can_edit_bulk: true,
    can_manage_users: false,
    can_view_audit: true,
  },
  cajero: {
    can_lookup: true,
    can_edit_single: false,
    can_edit_bulk: false,
    can_manage_users: false,
    can_view_audit: false,
  },
};

export default function UserModal({
  isOpen,
  onClose,
  onSave,
  userToEdit = null,
  isSaving = false,
}) {
  const isEditing = !!userToEdit;

  const [username, setUsername] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("cajero");
  const [isActive, setIsActive] = useState(true);
  const [permissions, setPermissions] = useState(ROLE_PERMISSIONS_MAP.cajero);
  const [error, setError] = useState("");

  useEffect(() => {
    if (userToEdit) {
      setUsername(userToEdit.username || "");
      setFullName(userToEdit.full_name || "");
      setPassword(""); // Blank on edit unless changing
      setRole(userToEdit.role || "cajero");
      setIsActive(userToEdit.is_active !== false);
      setPermissions(userToEdit.permissions || ROLE_PERMISSIONS_MAP[userToEdit.role] || ROLE_PERMISSIONS_MAP.cajero);
    } else {
      setUsername("");
      setFullName("");
      setPassword("");
      setRole("cajero");
      setIsActive(true);
      setPermissions(ROLE_PERMISSIONS_MAP.cajero);
    }
    setError("");
  }, [userToEdit, isOpen]);

  const handleRoleChange = (newRole) => {
    setRole(newRole);
    if (ROLE_PERMISSIONS_MAP[newRole]) {
      setPermissions(ROLE_PERMISSIONS_MAP[newRole]);
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
      permissions,
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
      <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-lg w-full p-5 sm:p-6 shadow-2xl relative my-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              <UserCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">
                {isEditing ? `Editar Usuario: ${userToEdit.username}` : "Crear Nuevo Usuario"}
              </h3>
              <p className="text-xs text-slate-400">
                Configura credenciales, rol del sistema y permisos de acceso
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isSaving}
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mt-4 p-3 rounded-xl bg-rose-950/60 border border-rose-800/80 text-rose-200 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{error}</span>
          </div>
        )}

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="space-y-4 mt-4 text-left">
          {/* Username & Full Name */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1">
                Usuario (Login)
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/\s+/g, ""))}
                disabled={isEditing || isSaving}
                placeholder="ej: supervisor1"
                className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-700 text-sm text-white focus:border-emerald-500 focus:outline-none disabled:opacity-50"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1">
                Nombre Completo
              </label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                disabled={isSaving}
                placeholder="ej: Carlos Gómez"
                className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-700 text-sm text-white focus:border-emerald-500 focus:outline-none"
                required
              />
            </div>
          </div>

          {/* Password */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1">
              {isEditing ? "Nueva Contraseña (Opcional - dejar vacío para mantener)" : "Contraseña"}
            </label>
            <div className="relative">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isSaving}
                placeholder={isEditing ? "•••••••• (Sin cambios)" : "Mínimo 4 caracteres"}
                className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-700 text-sm text-white focus:border-emerald-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Role & Active Status */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1">
                Rol del Sistema
              </label>
              <select
                value={role}
                onChange={(e) => handleRoleChange(e.target.value)}
                disabled={isSaving || (userToEdit && userToEdit.username === "admin")}
                className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-700 text-sm text-white focus:border-emerald-500 focus:outline-none"
              >
                <option value="cajero">Cajero / Consultor</option>
                <option value="supervisor">Supervisor de Tienda</option>
                <option value="admin">Administrador General</option>
              </select>
            </div>

            <div className="flex flex-col justify-end">
              <label className="flex items-center gap-2 p-2 bg-slate-950 border border-slate-800 rounded-xl cursor-pointer hover:border-slate-700 transition">
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  disabled={isSaving || (userToEdit && userToEdit.username === "admin")}
                  className="rounded text-emerald-500 focus:ring-emerald-500 h-4 w-4 bg-slate-900 border-slate-700"
                />
                <span className="text-xs font-semibold text-slate-200">
                  Cuenta Activa y Habilitada
                </span>
              </label>
            </div>
          </div>

          {/* Granular Permissions Section */}
          <div className="bg-slate-950/70 p-3.5 rounded-xl border border-slate-800/80">
            <span className="text-xs font-bold text-slate-300 uppercase tracking-wider block mb-2">
              Permisos y Funcionalidades
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              <label
                onClick={() => togglePermission("can_lookup")}
                className="flex items-center gap-2 p-2 rounded-lg bg-slate-900/60 hover:bg-slate-900 cursor-pointer border border-slate-800/60 transition"
              >
                {permissions.can_lookup ? (
                  <CheckSquare className="w-4 h-4 text-emerald-400 shrink-0" />
                ) : (
                  <Square className="w-4 h-4 text-slate-500 shrink-0" />
                )}
                <span className="text-slate-200">Consulta y Escáner</span>
              </label>

              <label
                onClick={() => togglePermission("can_edit_single")}
                className="flex items-center gap-2 p-2 rounded-lg bg-slate-900/60 hover:bg-slate-900 cursor-pointer border border-slate-800/60 transition"
              >
                {permissions.can_edit_single ? (
                  <CheckSquare className="w-4 h-4 text-emerald-400 shrink-0" />
                ) : (
                  <Square className="w-4 h-4 text-slate-500 shrink-0" />
                )}
                <span className="text-slate-200">Cambiar Precio Individual</span>
              </label>

              <label
                onClick={() => togglePermission("can_edit_bulk")}
                className="flex items-center gap-2 p-2 rounded-lg bg-slate-900/60 hover:bg-slate-900 cursor-pointer border border-slate-800/60 transition"
              >
                {permissions.can_edit_bulk ? (
                  <CheckSquare className="w-4 h-4 text-emerald-400 shrink-0" />
                ) : (
                  <Square className="w-4 h-4 text-slate-500 shrink-0" />
                )}
                <span className="text-slate-200">Edición Masiva Precios</span>
              </label>

              <label
                onClick={() => togglePermission("can_view_audit")}
                className="flex items-center gap-2 p-2 rounded-lg bg-slate-900/60 hover:bg-slate-900 cursor-pointer border border-slate-800/60 transition"
              >
                {permissions.can_view_audit ? (
                  <CheckSquare className="w-4 h-4 text-emerald-400 shrink-0" />
                ) : (
                  <Square className="w-4 h-4 text-slate-500 shrink-0" />
                )}
                <span className="text-slate-200">Ver Historial / Auditoría</span>
              </label>

              <label
                onClick={() => togglePermission("can_manage_users")}
                className="flex items-center gap-2 p-2 rounded-lg bg-slate-900/60 hover:bg-slate-900 cursor-pointer border border-slate-800/60 transition sm:col-span-2"
              >
                {permissions.can_manage_users ? (
                  <CheckSquare className="w-4 h-4 text-purple-400 shrink-0" />
                ) : (
                  <Square className="w-4 h-4 text-slate-500 shrink-0" />
                )}
                <span className="text-slate-200 font-semibold">
                  Gestión de Usuarios y Permisos (Admin)
                </span>
              </label>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition"
            >
              Cancelar
            </button>

            <button
              type="submit"
              disabled={isSaving}
              className="flex items-center gap-2 px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-lg shadow-emerald-600/30 transition disabled:opacity-50"
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

