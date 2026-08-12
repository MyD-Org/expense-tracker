# 💰 Expense Tracker

Una aplicación moderna de control de gastos construida con Next.js, TypeScript y Tailwind CSS.

## ✨ Características

- 📱 **Diseño responsivo** con tipografía fluida
- 🎨 **Interfaz moderna** con tema oscuro
- 📊 **Dashboard completo** con estadísticas
- 💳 **Gestión de categorías**: Gastos fijos, variables y tarjetas de crédito
- 📅 **Filtros por fecha** (año y mes)
- 🔄 **Propagación automática** para gastos fijos
- 💾 **Códigos de pago** con función de copia
- 🗄️ **Base de datos** con Neon (PostgreSQL)

## 🚀 Tecnologías

- **Frontend**: Next.js 14, React, TypeScript
- **Styling**: Tailwind CSS con tipografía fluida
- **UI Components**: shadcn/ui
- **Base de datos**: Neon (PostgreSQL)
- **Deployment**: Vercel (recomendado)

## 🛠️ Instalación

1. **Clona el repositorio**:
```bash
git clone https://github.com/TU_USUARIO/expense-tracker.git
cd expense-tracker
```

2. **Instala las dependencias**:
```bash
npm install
# o
pnpm install
```

3. **Configura las variables de entorno**:
Crea un archivo `.env.local`:
```env
DATABASE_URL=tu_url_de_neon_aqui
```

4. **Ejecuta la aplicación**:
```bash
npm run dev
# o
pnpm dev
```

5. **Abre tu navegador**:
Visita [http://localhost:3000](http://localhost:3000)

## 📱 Características móviles

- **Tipografía fluida** que se adapta a cualquier pantalla
- **Layout optimizado** para móviles
- **Formularios centrados** perfectamente
- **Navegación por tabs** en una sola fila

## 🎨 Diseño

- **Tema oscuro** elegante y moderno
- **Gradientes** y efectos visuales
- **Iconos** de Lucide React
- **Animaciones** suaves con Tailwind CSS

## 📊 Funcionalidades

### Dashboard
- Resumen de gastos totales
- Gastos pagados vs pendientes
- Próximos vencimientos
- Desglose por categorías

### Gestión de gastos
- Crear, editar y eliminar gastos
- Categorización automática
- Estados (pagado/pendiente)
- Notas y códigos de pago

### Desglose de tarjetas
Un gasto de categoría `tarjeta` es el **resumen** del mes de una tarjeta: su `amount`
es el total a pagar y es lo único que cuenta como egreso. El desglose son
`expense_items` anclados a `(card_id, billing_month)` — ese par, y no una FK al
resumen, es lo que los une, porque las cuotas futuras existen antes que el
resumen del mes en que caen.

- **Sin clasificar** = total del resumen − suma de items. Nunca se calcula lo que
  hay que pagar sumando items: impuestos y sellados nunca se cargan a mano.
- **Cuotas**: una compra en N cuotas genera N items en meses consecutivos, unidos
  por `purchase_group_id`. El dashboard muestra lo comprometido a futuro.
- **Pago parcial**: `paid_amount` sobre el resumen; `saldo = amount - paid_amount`.
  El estado es derivado — "parcial" es `status='pendiente'` con `paid_amount > 0`.

#### Ingreso automático de resúmenes

`POST /api/statements` con `Authorization: Bearer $EXPENSE_INGEST_TOKEN`.
Idempotente por `(card_id, billing_month, external_ref)`: reprocesar el mismo
resumen actualiza las líneas en vez de duplicarlas.

```json
{
  "card": "Visa Galicia",
  "billing_month": "2026-08",
  "total": 482350.55,
  "minimum_due": 96470.11,
  "items": [
    { "description": "Spotify", "amount": 3499, "kind": "suscripcion" },
    { "description": "Coto", "amount": 45200, "purchase_date": "2026-08-03" },
    { "description": "Notebook", "amount": 91000,
      "installment_current": 3, "installment_total": 12, "external_ref": "TXN-88213" }
  ]
}
```

`kind`: `fijo` · `variable` · `suscripcion` · `financiero` (intereses y refinanciación).
Si la tarjeta no existe, se crea por nombre. Si el resumen del mes no existe, se
crea con el vencimiento derivado del día de pago de la tarjeta.

### Filtros
- Por año y mes
- Por categoría
- Por estado
- Búsqueda por descripción

## 🔧 Scripts disponibles

```bash
npm run dev          # Desarrollo
npm run build        # Construcción
npm run start        # Producción
npm run lint         # Linting
```

## 📝 Licencia

MIT License - ver [LICENSE](LICENSE) para más detalles.

## 🤝 Contribuciones

Las contribuciones son bienvenidas. Por favor:

1. Fork el proyecto
2. Crea una rama para tu feature (`git checkout -b feature/AmazingFeature`)
3. Commit tus cambios (`git commit -m 'Add some AmazingFeature'`)
4. Push a la rama (`git push origin feature/AmazingFeature`)
5. Abre un Pull Request

---

Desarrollado con ❤️ usando Next.js y Tailwind CSS

