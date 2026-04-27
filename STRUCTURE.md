# Medicenter — Estructura de archivos (v0.3)

```
medicenter/
├── .env.local.example
├── cors.json                           # ★ NUEVO — config CORS para Firebase Storage
├── next.config.mjs                     # ★ Actualizado — fallback fs: false
├── tailwind.config.ts
├── tsconfig.json
├── package.json                        # ★ + cornerstone3d, dicom-image-loader, tools, dicom-parser
├── firestore.rules
├── storage.rules                       # ★ Actualizado — 100MB, contentType DICOM
│
├── src/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   ├── globals.css
│   │   ├── login/page.tsx
│   │   ├── secretary/page.tsx
│   │   ├── doctor/page.tsx
│   │   ├── admin/page.tsx
│   │   └── api/admin/                  # 6 endpoints sin cambios
│   │
│   ├── components/
│   │   ├── UploadForm.tsx              # ★ + magic byte detection, contentTypeOverride
│   │   ├── DoctorDashboard.tsx         # ★ thumbnail rutea según logicalType
│   │   ├── AdminPanel.tsx
│   │   ├── FilePreview.tsx             # ★ Reescrito — rutea DICOM/image/PDF/unknown
│   │   ├── Header.tsx
│   │   ├── RoleGuard.tsx
│   │   │
│   │   └── dicom/                      # ★ NUEVO — todo lo relativo a Cornerstone
│   │       ├── DicomViewer.tsx         #   Componente principal del visor
│   │       ├── DicomViewerLazy.tsx     #   Wrapper dynamic(ssr:false)
│   │       ├── DicomToolbar.tsx        #   Toolbar lateral con herramientas
│   │       └── tools.ts                #   Definiciones de tools
│   │
│   ├── lib/
│   │   ├── firebase.ts
│   │   ├── firebase-admin.ts
│   │   ├── api-auth.ts
│   │   ├── email.ts
│   │   ├── rut.ts
│   │   ├── utils.ts
│   │   │
│   │   └── dicom/                      # ★ NUEVO — utilidades DICOM
│   │       ├── detect.ts               #   Magic bytes, logical type detection
│   │       ├── init.ts                 #   ensureCornerstoneInit() singleton
│   │       └── imageId.ts              #   Blob → imageId, fetch helpers
│   │
│   ├── hooks/
│   │   ├── usePatientsQueue.ts
│   │   ├── useUpload.ts                # ★ + contentTypeOverride
│   │   └── useAdminUsers.ts
│   │
│   ├── contexts/
│   │   └── AuthContext.tsx
│   │
│   └── types/
│       └── index.ts
```

## Lo nuevo en v0.3

- **Detección DICOM por magic bytes** (preámbulo "DICM" en bytes 128-131)
- **Visor DICOM completo** con Cornerstone3D + 9 herramientas (incluyendo mediciones)
- **Routing inteligente** en FilePreview según tipo lógico real
- **CORS doc** en README — el gotcha que más atasca
- **Override de contentType** al subir — Storage guarda DICOM correctamente aunque browser no asigne MIME
