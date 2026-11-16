# DJ Studio by NEBØA — Cambios

## Open-source update · 16 noviembre 2026

- Publicado el código fuente en GitHub, con licencia MIT, avatar visual original NEBØA, documentación de arquitectura, FAQ, guías de contribución y plantilla de pull requests.
- Corregida la comprobación de integridad SHA-256: una pista cuyo contenido haya cambiado se rechaza **antes** de comprobar la disponibilidad opcional de FFmpeg. Esta mejora elimina una falsa dependencia en el job de seguridad CI y asegura un fallo temprano sin generar archivos.
- La regresión de seguridad se ha reproducido además con FFmpeg ausente del `PATH`: 5/5 pruebas correctas. Las otras 77 pruebas siguen pasando localmente.
- La aplicación continúa en beta; sin claims de certificación para XDJ/CDJ ni permisos para modificar bases de datos de otros productos.

## Beta 0.4.1 · Integridad SHA-256 y auditoría de normalización · 16 noviembre 2026

- El motor registra la huella SHA-256 de cada fuente durante la medición. Si cambia antes o durante el renderizado, la copia se rechaza; la copia verificada lleva también su propia huella.
- Nuevo `python3 normalizer.py preflight --output-dir ...`: consulta de disponibilidad FFmpeg, reserva de disco y destino sin crear carpetas ni ficheros.
- El iniciador Mac comprueba el preflight antes de lanzar el servidor/navegador y se detiene con un mensaje si falta espacio.
- Nueva opción **Descargar auditoría CSV** en lotes: LUFS, true peak, LRA, ganancia, valor previsto, valor final, formato, estado y SHA-256. Solo nombres de archivos, sin rutas privadas; campos peligrosos protegidos contra fórmulas de hojas de cálculo.
- El lote vuelve a contrastar la huella de cada pista al empezar a renderizar. Se ha endurecido la tolerancia de duración final a 0,5 segundos.
- Validado posteriormente el 16 de noviembre de 2026: 64 pruebas JavaScript + 13 pruebas Python con FFmpeg y audio sintético (incluidos FLAC/WAV/MP3, sin sobrescritura y HTTP local) + 5 pruebas Python de seguridad = **82 pruebas automatizadas correctas**. No se ha utilizado audio real.
- Sigue pendiente el pen físico y la prueba en hardware CDJ/XDJ.


## Beta 0.4.0 · Normalizador LUFS/true peak · 16 noviembre 2026

- Nueva pestaña **Normalizar**, con objetivos −16/−14/−12/−11/−10/−9 LUFS y límite −1,5 dBTP.
- Companion local Python 3.10+ y FFmpeg (loopback 127.0.0.1, no cloud) para mediciones EBU R128. Motor independiente de Rekordbox y de sus bases de datos.
- Política **gain-only**: no compresión ni limitadores dinámicos ocultos; subida máxima +6 dB, techo true peak y margen preventivo. Puede quedar por debajo de los LUFS solicitados si subir más no es seguro.
- Opciones de copias FLAC 24-bit, WAV 24-bit y MP3 320 kbps. Siempre salida NUEVA, verificada con una segunda medición y sin sobrescribir originales. El resultado no se reexporta automáticamente a OneLibrary.
- Flujo de lote (hasta 20 audios): medición de todos primero, creación posterior solo mediante confirmación explícita, cancelación después de pista actual y parada segura cuando falta espacio.
- Medición y aplicación protegidas por token de sesión y staging_id de la pista; evita normalizar un archivo diferente al de la previsualización. Peticiones a localhost y protección contra solicitudes de otras webs.
- Nuevo iniciador macOS `Iniciar Normalizador.command`. En otras plataformas se utiliza `python3 normalizer.py serve` con FFmpeg disponible.
- 76 pruebas automatizadas al desarrollar la versión: 63 JS + 13 Python/FFmpeg con audio sintético y endpoints locales; sin tocar colecciones reales ni pendrives.
- Pendiente: compatibilidad física de copias con el hardware, QA en navegadores y prueba en unidad USB real.

## Beta 0.3.0 · USB tag inspector + control de calidad · 16 noviembre 2026

- Nuevo lector local de etiquetas MP3 ID3v2.3, ID3v2.4, ID3v1 y FLAC Vorbis (título, artista, álbum, BPM, tonalidad).
- Lectura explícita y limitada a 300 archivos por lote, con posibilidad de cancelar/reanudar. Los originales nunca se modifican.
- Las listas provisionales aprovechan etiquetas presentes; si no hay datos, mantienen BPM, key, energía y cues desconocidos. La app no deduce estructura musical.
- El comparador comprueba también artista, evitando falsos positivos por títulos iguales entre DJs distintos. No confunde Original Mix con Extended Mix ni declara identidad OneLibrary.
- Nuevo diagnóstico del USB: archivos de 0 bytes, demasiado pequeños, posibles duplicados por nombre + tamaño (sin prueba de hash), dominios publicitarios y álbumes con valor.
- Exportación voluntaria del informe CSV (únicamente metadatos, tamaño y rutas relativas de los archivos seleccionados).
- Soporte de archivos no compatibles: se señalan como no analizados; nunca se simulan etiquetas.
- Motor validado con tests sintéticos y flujo de interfaz. No se ha conectado un pendrive físico ni instalado dependencias.
- Versión 0.3.0 sigue siendo BETA; prueba real USB, navegadores adicionales y licencia pública quedan pendientes.

## Beta 0.2.0 · USB / PEN · 16 noviembre 2026

- Nueva pestaña USB / PEN y selector de carpeta completo. El DJ concede permiso local desde el navegador; no existe monitorización automática ni acceso remoto.
- Inventario por nombres y tamaños de MP3, WAV, FLAC, AIFF, M4A y otros formatos, sin leer audio ni bases de datos.
- Detección de OneLibrary mediante presencia de PIONEER/rekordbox/exportLibrary.db y Device Library mediante export.pdb. Nunca abre ni modifica los archivos.
- Comparación de una sesión con archivos del dispositivo: coincidencias aproximadas, faltantes, ambiguas y **posibles versiones** distinguidas de coincidencias por nombre.
- Opciones para cargar un XML de Rekordbox existente en la carpeta USB, crear una lista provisional desde nombres de audio (BPM, key y cues desconocidos), olvidar el dispositivo, y medir voluntariamente un audio que coincida de forma única.
- Límites preventivos de lectura e interfaz para bibliotecas masivas; no se ejecuta ordenamiento armónico de más de 500 pistas desde una misma lista.
- 34 pruebas automatizadas correctas y comprobación visual de la pantalla en Chrome.
- Pendiente: prueba física con pen real, lectura de playlists internas de la base OneLibrary y prueba de equipos CDJ. No se ha alterado ni montado ningún USB real durante la creación de esta versión.

## Beta 0.1.0

- Importación de Rekordbox XML y CSV/TSV.
- Mix Coach, Camelot/BPM, recomendaciones de orden, Hot Cues propuestos.
- Medición indicativa de RMS/pico con Web Audio cuando el usuario elige un archivo.
- Exportación de sesión CSV/JSON sin rutas privadas.
- Interfaz local-first sin dependencias ni cuentas.
