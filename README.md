# Medicenter — MVP v0.3

Portal médico para gestión de mamografías. Tres roles: **admin** (gestión de usuarios), **secretaría** (subir archivos), **médico** (preview en tiempo real con visor DICOM y herramientas de medición).

## Stack

- **Next.js 14** App Router
- **Firebase 10**: Auth, Firestore, Storage
- **firebase-admin 12** para gestión server-side de usuarios
- **Cornerstone3D 3.x** + dicom-image-loader + tools para visor DICOM
- **Resend** para emails
- **Tailwind CSS** con tokens "Stark Black & White"
- **TypeScript** estricto

## Setup

### 1. Instalar dependencias
```bash
npm install
cp .env.local.example .env.local
```

### 2-4. Firebase + Resend
Sin cambios desde v0.2 — ver secciones del [README anterior](#) para detalles de service account, Resend, etc.

### 5. **CONFIGURAR CORS EN FIREBASE STORAGE** ⚠️

> Este paso es donde 90% de los desarrolladores se atascan con DICOM. Sin esto, el visor mostrará "No se pudo descargar el archivo" aunque el upload haya funcionado.

El visor cornerstone hace `fetch()` al `.dcm` desde el origen de tu app (`localhost:3000` en dev, `tu-app.com` en prod). Firebase Storage por defecto **no permite cross-origin reads desde JavaScript**.

**Cómo configurarlo:**

Crea `cors.json`:
```json
[
  {
    "origin": ["http://localhost:3000", "https://tu-dominio-de-produccion.com"],
    "method": ["GET"],
    "maxAgeSeconds": 3600,
    "responseHeader": ["Content-Type", "Content-Length", "Content-Range"]
  }
]
```

Aplícalo con `gsutil` (parte del [Google Cloud SDK](https://cloud.google.com/sdk/docs/install)):
```bash
gsutil cors set cors.json gs://TU-BUCKET-NAME.appspot.com
```

Para encontrar el nombre de tu bucket:
```bash
# es el mismo que NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET en .env.local
echo $NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
```

**Verificación:** después del comando, hacer `gsutil cors get gs://TU-BUCKET-NAME.appspot.com` debe retornar tu config.

### 6. Crear primer admin (igual que v0.2)

### 7. Reglas de seguridad
```bash
firebase deploy --only firestore:rules,storage
```

### 8. Run
```bash
npm run dev
```

## Flujo DICOM completo

```
Secretaría sube .dcm
  ↓
UploadForm: detección con magic bytes (preámbulo "DICM" en bytes 128-131)
  ↓
useUpload: forzamos contentType = "application/dicom" aunque el browser haya dado octet-stream
  ↓
Storage: mammograms/{rut}/{ts}_{archivo}.dcm
  ↓
Firestore: doc con fileType: "application/dicom"
  ↓
─────── Médico abre el caso ───────
  ↓
DoctorDashboard detecta logicalType: "dicom" → muestra placeholder + botón "Abrir visor"
  ↓
Click → FilePreview rutea a DicomViewerLazy (dynamic import, ssr: false)
  ↓
DicomViewer:
  1. ensureCornerstoneInit() — singleton (init core + loader + tools)
  2. fetch(fileUrl) → Blob   ← AQUÍ falla si CORS no está configurado
  3. fileManager.add(blob) → "dicomfile:N"
  4. RenderingEngine + StackViewport.setStack([imageId])
  5. ToolGroup con WindowLevel/Pan/Zoom/StackScroll/Length/Angle/ROI/Annotate
```

## Herramientas del visor

- **Window/Level** (default, click izq) — ajustar contraste/brillo
- **Pan** (click der siempre) — mover la imagen
- **Zoom** (click rueda siempre) — acercar
- **StackScroll** (rueda) — frame anterior/siguiente en multi-frame
- **Regla** — medir distancia
- **Ángulo** — medir ángulos
- **ROI Rectangular / Elíptica** — área de interés con estadísticas
- **Anotar** — flecha con texto
- **Invertir** — invertir grayscale (útil para densidades)
- **Reset** — vuelve al view inicial

## Troubleshooting DICOM

**"No se pudo descargar el archivo"**
→ CORS no configurado. Ver paso 5.

**Visor se queda en "Inicializando" para siempre**
→ Probablemente el bundle de cornerstone falló al cargar. Mira la consola — suele ser por `fs` no resuelto. Verifica que `next.config.mjs` tenga el `webpack: { resolve.fallback: { fs: false } }`.

**El archivo se subió pero no se ve / aparece como "unknown"**
→ El MIME no llegó como `application/dicom`. Mira el doc en Firestore: si `fileType` no es `application/dicom`, la detección falló. Probable: archivo subido por consola Firebase o sin pasar por nuestro UploadForm. Solución: re-subir desde la app.

**"Transfer syntax no soportado"**
→ Algunos DICOM usan compresión exotic (JPEG-LS lossless raras, RLE). dicom-image-loader cubre los comunes. Si necesitas todos, hay que cargar codecs WASM adicionales — ver [docs de dicom-image-loader](https://www.cornerstonejs.org/docs/concepts/cornerstone-core/imageloader/).

## Decisiones técnicas DICOM

1. **fetch + Blob, no `wadouri:` directo a Storage URL** — más control de errores, soporta más transfer syntaxes, compatible con URLs firmadas temporales.

2. **Singleton init** — `ensureCornerstoneInit()` corre exactamente una vez por sesión. Múltiples viewers comparten workers/codecs.

3. **IDs únicos por instancia** (`crypto.randomUUID()`) — si abres preview de paciente A, lo cierras, abres paciente B, los IDs no chocan.

4. **`dynamic(import, { ssr: false })`** — Cornerstone usa WebGL/workers/window. SSR explota.

5. **Las anotaciones se borran con el modal** — viven en memoria de Cornerstone. Si querés persistirlas, hay que hookear `ANNOTATION_MODIFIED` y guardar a Firestore como JSON.

6. **Soft cap 100 MB en upload** — mamografías típicas son 25-50 MB. Una mama bilateral con 4 vistas no debería pasar 100. Si pasa, probablemente es un estudio multi-imagen y necesitas subir cada uno por separado.

## Próximos pasos (backlog)

- [ ] Persistir anotaciones del médico en Firestore (modelo: `patients/{id}/annotations/{annId}`)
- [ ] Multi-archivo por paciente (mama izq + mama der + comparativa anterior)
- [ ] Visor side-by-side (comparar mamografía actual vs anterior)
- [ ] Custom Claims (cuando vaya a producción)
- [ ] Tests con Firebase Emulator Suite
- [ ] WASM codecs adicionales para transfer syntaxes raros
