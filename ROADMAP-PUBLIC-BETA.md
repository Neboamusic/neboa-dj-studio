# DJ Studio — hoja de ruta para uso por otros DJs

## 1. Beta local-first [DESARROLLADA]

- Motor sin rutas privadas ni colección NEBØA.
- Importadores Rekordbox XML y CSV/TSV, y JSON propio.
- Playlists independientes por importación, cambio de orden, Mix Coach y Cue Lab.
- Modo USB/PEN con selección de carpeta autorizada, detección de OneLibrary y Device Library, inventario de audios, comparación aproximada de listas, XML del USB y lista provisional sin metadatos inventados.
- Inspector read-only de etiquetas MP3 ID3v2.3/v2.4/v1 y FLAC Vorbis, lectura voluntaria por lotes de 300, comparación de artista+título y lista provisional con BPM/key solo desde etiquetas presentes.
- Informe de calidad USB en CSV: 0 bytes, archivos pequeños, posibles duplicados, nombres promocionales y álbumes no vacíos, sin modificar audio ni bases OneLibrary.
- Medidor RMS/pico de muestra en navegador bajo selección del usuario.
- Motor local Python+FFmpeg opcional con medición profesional EBU R128 LUFS/true peak, normalización lineal gain-only, techo de pico, copias verificadas FLAC/WAV/MP3 y lote de hasta 20 pistas con doble confirmación.
- HTTP companion estrictamente loopback, token de sesión por proceso, staging_id de pista, reserva preventiva de disco, sin cambios en OneLibrary ni en originales.
- CSV/JSON descargables, sin rutas ni audio, UI responsive.
- 95 pruebas automatizadas superadas (77 JS + 13 Python/FFmpeg con audio sintético + 5 Python de seguridad), entre motor, importaciones, etiquetas, auditoría, interfaz, normalizador y descubrimiento web. Control de datos privados del paquete. Panel USB v0.3 con estado sin unidad visualmente comprobado en Chrome; su estado con un USB físico queda pendiente.
- Sin cuentas, almacenamiento cloud ni dependencias externas.

## 1.1. Beta 0.4.1 [VALIDACIÓN AUTOMATIZADA COMPLETA]

- Preflight CLI sin escrituras, doble comprobación SHA-256 y reporte CSV por lote sin rutas privadas.
- Superadas 64 pruebas JS, 13 de render Python con audio sintético y 5 de seguridad Python. Sigue pendiente la validación con hardware DJ, sesiones reales y más navegadores. El repositorio público y GitHub Pages ya están publicados en la cuenta personal de NEBØA, con Release beta2 verificado, pero **no existe despliegue del normalizador en el nodo remoto** por falta de autenticación SSH. NO asumir compatibilidad CDJ/XDJ sin prueba física.

## 2. Validación física para uso en cabina [PENDIENTE]

- Release beta pública y demo web ya operativas. **PENDIENTE** probar con USB y hardware DJ reales antes de considerar compatibilidad demostrada.

- Prueba con USB físico (una unidad seleccionada por el DJ), verificación de lectura real y posterior expulsión segura fuera de esta app.
- Pruebas de importación con bibliotecas de tres DJs distintos y playlists anidadas.
- QA visual v0.4 en Chrome y después Firefox, Safari, Edge, móvil y escritorio, incluyendo análisis y creación de copia con el companion en localhost.
- Revisar seguridad XSS/CSV injection, reportes de fallos, hash del ZIP y licencia de software.
- Elegir nombre/dominio que no entre en conflicto con marcas registradas; autorizar publicación desde cuenta personal, nunca compartida con otros proyectos.
- Política de privacidad y derechos de autor: no alojar música de terceros.

## 3. Motor de audio profesional

- Companion local FFmpeg + BS.1770 IMPLEMENTADO y probado en audio sintético; queda pendiente test comparativo de sesiones reales, escucha y QA de UX antes de uso masivo.
- Detección de frases, downbeats y secciones con estimaciones y confianza, prueba auditiva humana.
- Verificación real de decodificación de MP3, espectros y dinámicas, sin tocar originales (las revisiones actuales de tamaño y etiqueta NO sustituyen esa prueba).
- Validación de Hot Cues y loops por software oficialmente compatible.

## 4. Ecosistema y distribución

- Publicar la webapp como archivos estáticos HTTPS. Sin login, el procesamiento sigue ocurriendo en cada navegador.
- Solo si hay demanda: cuentas y backups opt-in cifrados, aislamiento por DJ, portabilidad y eliminación RGPD.
- Companion nativo opcional para detección automática de USB y lectura de playlists OneLibrary en modo estrictamente read-only (evaluar libdjinterop; cues en ANLZ exigen comprobación adicional).
- Adaptadores con formatos documentados para djay Pro, Traktor y Serato; no ingeniería inversa peligrosa de bases de datos.
- OneLibrary siempre por el software DJ oficialmente compatible; probar CDJ-3000X/XDJ-AZ físicamente.
- Modelo posible: base gratuita y módulos avanzados opcionales; nunca cobros por defecto.

## Criterios de cierre público

El paquete no puede incluir nombres privados de USB, archivos/portadas originales, rutas `/Users/` o credenciales. El software debe ser usable con datos **ficticios** sin acceso a NEBØA. No se considera `PUBLIC_RELEASE_VERIFIED` hasta publicación real, pruebas externas y revisión legal/comercial.
