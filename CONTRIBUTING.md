# Guía de Contribución al Frontend de Fruver POS

¡Gracias por contribuir al desarrollo del cliente frontend de **Fruver POS**!

---

## 📋 Directrices Fundamentales

1. **Usabilidad y Rendimiento en POS**:
   - Todo componente debe responder con agilidad en dispositivos con pantallas táctiles, tabletas y computadores de caja.
   - Preservar la regla de redondeo comercial a centenas ($100 COP) en todos los flujos de edición de precios.
2. **Calidad de Código y Estilos**:
   - Respetar la jerarquía visual de **Tailwind CSS v4** y la compatibilidad con el selector de Modo Oscuro / Claro.
   - Ejecutar el linter antes de enviar cambios: `npm run lint`.
   - Verificar que el compilado de producción se genere sin advertencias: `npm run build`.

---

## 🛠️ Flujo de Trabajo

1. Haz un Fork del repositorio.
2. Crea una rama descriptiva:
   ```bash
   git checkout -b feature/nombre-funcionalidad
   # o
   git checkout -b fix/nombre-error
   ```
3. Realiza tus cambios y verifica el linter y compilado:
   ```bash
   npm run lint
   npm run build
   ```
4. Envía tu Pull Request con capturas o descripción de los cambios de interfaz.

---

## 📄 Licencia
Al contribuir, aceptas que tus contribuciones se licencien bajo la [Licencia MIT](LICENSE).
