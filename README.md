<div align="center">
  <img src="assets/neboa-avatar.jpg" alt="NEBØA — circular vinyl-inspired violet emblem" width="154" height="154">

  # DJ Studio by NEBØA

  **YOUR LIBRARY. YOUR SOUND. YOUR RULES.**

  <p>Open-source DJ prep · Harmonic set planning · Read-only USB inspection · Safe LUFS analysis</p>

  [![MIT License](https://img.shields.io/badge/License-MIT-9b6dff)](LICENSE)
  [![CI](https://github.com/Neboamusic/neboa-dj-studio/actions/workflows/ci.yml/badge.svg)](https://github.com/Neboamusic/neboa-dj-studio/actions/workflows/ci.yml)
  ![Version](https://img.shields.io/badge/Release-0.4.1%20beta-282336)
  ![Privacy](https://img.shields.io/badge/Audio-local%20only-262036)

  **[Launch DJ Studio](https://neboamusic.github.io/neboa-dj-studio/) · [Meet NEBØA](https://neboamusic.github.io/neboa-dj-studio/artist.html) · [Download beta release](https://github.com/Neboamusic/neboa-dj-studio/releases/tag/v0.4.1-beta.1) · [Contribute](CONTRIBUTING.md)**
</div>

---

### Not another music-cloud platform.

DJ Studio is a **local-first, open-source toolkit for DJs**. Build playlists from Rekordbox XML and CSV, explore Camelot/BPM transitions, review USB file quality and ID3/FLAC tags, and analyze loudness with an optional Python + FFmpeg engine. It gives you a plan and preserves your choices: **no music is uploaded, no device database is written, and original audio is never overwritten**.

| Library & planning | USB & quality | Loudness & exports |
| --- | --- | --- |
| XML / CSV / JSON import | User-selected folders only | EBU R128 LUFS + true peak |
| Camelot + BPM guidance | ID3 / FLAC tags, without edits | Conservative gain-only normalizing |
| Mix Coach + proposed cues | OneLibrary file presence check | New, verified FLAC / WAV / MP3 copies |
| Portable session CSV / JSON | Metadata quality report | SHA-256 checks and batch audit CSV |

### Quick start — run locally

1. **Try the [live browser demo](https://neboamusic.github.io/neboa-dj-studio/)** for playlists, Mix Coach and read-only USB inspection, or **download the code** with GitHub's *Code → Download ZIP* and extract it. The hosted demo does **not** run the FFmpeg engine or upload music.
2. Open `index.html` in a browser. Try the **fictional sample playlist**; no music files are required.
3. Import an official Rekordbox XML export or your own CSV/TSV/JSON when you're ready. For a no-music trial, download the [fictional 140–145 BPM techno playlist](examples/fictional-hypnotic-techno.tsv) and import it directly. The web UI works without a server.
4. **Optional real loudness normalization:** install Python 3.10+, FFmpeg and FFprobe, then in the project folder run:

   ```bash
   python3 normalizer.py preflight --output-dir ~/DJStudio-Normalized
   python3 normalizer.py serve --output-dir ~/DJStudio-Normalized
   ```

   Open <http://127.0.0.1:18766/>. The companion listens only on localhost, and creating an output copy still requires your explicit confirmation.

> **Beta disclaimer:** Not an official AlphaTheta, Pioneer DJ or Rekordbox product. Finding `exportLibrary.db` does not imply reading or validating OneLibrary internals. Official hardware export and real-device testing are still required.

**About the artist:** DJ Studio is created by **NEBØA (César López Caparrós)**, DJ and electronic music producer, **formerly known as Cesare il Galo**. His creative direction centers on dark, hypnotic, experimental techno, tension and detail. Read the [artist biography (ES/EN)](docs/ARTIST.md) or [visit the artist page](https://neboamusic.github.io/neboa-dj-studio/artist.html). Professional inquiries: [info@csarlopez.com](mailto:info@csarlopez.com).

**Documentation:** [Artist](docs/ARTIST.md) · [Architecture & privacy](docs/ARCHITECTURE.md) · [FAQ](docs/FAQ.md) · [Contributing](CONTRIBUTING.md) · [Security](SECURITY.md) · [Roadmap](ROADMAP-PUBLIC-BETA.md) · [Changelog](CHANGELOG.md) · [MIT License](LICENSE)

---

## Guía en español

**Beta local-first para cualquier DJ, sin cuentas, sin dependencias de frontend y sin acceso automático a bibliotecas personales.**

La biblioteca, USB, Camelot y Mix Coach funcionan abriendo `index.html`, sin cuentas ni instalación. Para **normalizar audio de verdad** hace falta el complemento local `normalizer.py` (Python 3.10+, FFmpeg y FFprobe), sin servidor de Internet.

## Funciones disponibles

- **USB / PEN + Inspector ID3/FLAC**: conecta un pendrive y selecciona su carpeta raíz desde el navegador. Reconoce OneLibrary (`PIONEER/rekordbox/exportLibrary.db`), Device Library clásica (`export.pdb`), cuenta audios, compara tu sesión por nombres y avisa si faltan pistas, hay versiones distintas o archivos ambiguos. No lee ni escribe las bases binarias. Si el USB contiene un XML exportado de Rekordbox, puedes importarlo desde la propia pestaña USB; si no, crear una lista provisional a partir de nombres de audio, con BPM/key/cues desconocidos.
- Importar **Rekordbox XML** oficial, seleccionar playlists anidadas o abrir CSV/TSV (columnas `artist, title, bpm, key, energy`, también nombres en español) y JSON de la app. Incluye una [playlist ficticia de techno hipnótico (140–145 BPM)](examples/fictional-hypnotic-techno.tsv) para probar el flujo sin música real.
- Conservar el orden, mover pistas individualmente, ordenar por tempo o recomendar una secuencia **Camelot + BPM + energía si está disponible**.
- Mix Coach: compatibilidad armónica, saltos de tempo y técnicas propuestas (siempre con necesidad de escucha).
- Cue Lab: leer Hot Cues y Memory Cues desde el XML, más **ideas por compases** cuando existan BPM y duración; no son cues verificados ni se importan a Rekordbox.
- Niveles: RMS/pico de muestra indicativos en navegador. **Normalizar:** medición profesional LUFS integrado EBU R128 y true peak mediante FFmpeg, propuesta de ganancia lineal limitada por pico −1,5 dBTP y salida verificada en FLAC 24-bit, WAV 24-bit o MP3 320 kbps. **Lotes:** medir hasta 20 pistas y crear copias nuevas únicamente después de confirmación explícita.
- Descargar CSV de orden, JSON portable de sesión y CSV de cues/ideas sin rutas del disco ni audio. Neutralización de fórmulas de Excel.

## Normalizar el volumen (beta 0.4.1)

**macOS:** abre `Iniciar Normalizador.command` desde la carpeta de la aplicación. Verifica su procedencia si macOS muestra una alerta de seguridad; no desactives las protecciones del sistema. El iniciador abre la aplicación con motor FFmpeg local y se detiene cuando cierras la terminal o pulsas Ctrl+C. En NEBØA guarda las copias nuevas en `~/NEBOA/exports/normalized`; en otra instalación Mac, en `~/Music/DJStudio-Normalized`.

**Windows / Linux / macOS por terminal:** desde la carpeta de la app, con Python 3.10+, FFmpeg y FFprobe en PATH, ejecuta `python3 normalizer.py serve` (en Windows, `py -3 normalizer.py serve`). Después abre `http://127.0.0.1:18766/`. El motor solo escucha en 127.0.0.1, nunca en la red pública. El navegador estático seguirá funcionando sin ese motor para biblioteca, USB y Mix Coach.

**Pista individual:** selecciona MP3/FLAC/WAV/AIFF/M4A/AAC (hasta 128 MiB en UI), pulsa **Medir LUFS y true peak**, elige objetivo −16, −14, −12, −11 (predeterminado), −10 o −9 LUFS y salida FLAC 24-bit, WAV 24-bit o MP3 320. Solo si pulsas **Crear copia normalizada** se genera el archivo. Se aplica ganancia lineal, **sin compresor/limitador oculto**, máxima subida de +6 dB y techo −1,5 dBTP con margen. Puede no alcanzar el objetivo exacto para evitar clipping. El motor vuelve a medir y verifica duración/picos; ante errores descarta el resultado. No sobrescribe ningún archivo preexistente.

**Lotes:** selecciona hasta **20 archivos por lote**, pulsa **Medir lote completo**, revisa resultados sin tocar originales, y después pulsa **Crear copias normalizadas del lote**. Es necesaria una confirmación. Se procesan secuencialmente; puedes detener el lote después de la pista actual. Si falta espacio se detiene y las copias ya verificadas permanecen disponibles. No se sustituyen pistas en Rekordbox ni se escriben datos OneLibrary.

**Preflight sin escrituras:** ejecuta `python3 normalizer.py preflight --output-dir ~/NEBOA/exports/normalized`. Te indicará si hay FFmpeg y reserva suficiente. El iniciador Mac aplica este diagnóstico antes de abrir el servidor; con poco espacio, no inicia procesamiento. La salida final siempre requiere además espacio para la nueva copia.

**Auditoría de lote CSV:** una vez medidas las pistas se habilita «Descargar auditoría CSV». Incluye LUFS y true peak inicial/final, ganancia, estado, formato, nombre y huellas SHA-256 de origen/copia. No incluye rutas absolutas. Escapa nombres susceptibles de activar fórmulas en Excel.

**Integridad:** el motor mide SHA-256 del audio elegido y lo compara antes y después de renderizar; si cambió, rechaza publicar una copia. La salida verificada recibe otra huella SHA-256. Estas huellas no autorizan escribir sobre OneLibrary ni prueban por sí solas la compatibilidad de un reproductor.

**CLI para un archivo grande:** `python3 normalizer.py analyze /ruta/pista.flac` (solo lectura) y `python3 normalizer.py render /ruta/pista.flac --target -11 --format flac --output-dir ~/NEBOA/exports/normalized` (copia nueva y verificación). La salida se limita al directorio personal; no permite escribir directamente en pendrives.

**Calidad y formatos:** FLAC/WAV no recuperan información perdida de un MP3, pero evitan una segunda compresión con pérdida. Exportar MP3 implica recodificación. La nueva copia omite metadatos y portadas heredadas, sin quitar nada del original. CDJ-3000X admite FLAC, WAV, MP3 y otros códecs según el manual oficial, pero para preparar playlists y cues en el USB debes importar la copia a Rekordbox y exportar OneLibrary por un software compatible.

**Privacidad y espacio:** para normalizar se envía expresamente el archivo seleccionado **solo por HTTP loopback 127.0.0.1 a un proceso local de tu mismo equipo**. Se guarda temporalmente bajo la carpeta privada del usuario, se elimina después de crear la copia o al detener el motor y no se transmite a Internet. Se reservan aproximadamente 1,1 GiB libres antes de iniciar una salida; el espacio real varía según formato. El Mac del proyecto necesita liberar espacio antes de ejecutar lotes grandes. No incluye ninguna canción original en el paquete.

## Cómo usarlo

1. Descomprime el ZIP y abre `index.html`.
2. Prueba «Biblioteca ficticia» o importa un XML oficial exportado por Rekordbox o CSV de otro software DJ.
3. **Para usar el pen:** conéctalo al Mac/PC, pulsa **«Seleccionar carpeta del pen»** (barra izquierda), elige su volumen raíz en la ventana del navegador y entra en **USB / PEN**. Revisa el formato reconocido, las pistas y su coincidencia con tu sesión. Si hay XML en el USB, puedes importarlo; si no, crea una lista provisional de nombres. El navegador necesita que concedas permiso de lectura a esa carpeta; no detecta unidades automáticamente sin un componente de escritorio. En la pestaña USB puedes pulsar **«Leer etiquetas de audios»** para inspeccionar hasta 300 pistas por lote. Extrae ID3v2.3/v2.4, ID3v1 y Vorbis Comments en FLAC (título, artista, álbum, BPM, key), si están disponibles. Puedes cancelar, reanudar y generar un **«Informe de calidad CSV»** con archivos de 0 bytes, posibles duplicados, urls en nombres y etiquetas incompletas. Cuando termine, pulsa otra vez **«Crear lista provisional»** para incorporar los metadatos reales, sin modificar el orden de una playlist que ya estés preparando.
4. Selecciona playlist. Reordena o usa «Proponer orden» y examina «Mix Coach». 
5. Selecciona una pista; en «Niveles» puedes elegir un audio o pulsar «Medir audio del pen seleccionado» cuando exista una coincidencia única por nombre. Si el navegador no puede leerlo o se ha expulsado el USB, la operación fallará sin escribir nada. Para evitar bloqueos, la creación de listas provisionales está limitada a 3.000 audios por carpeta y la propuesta automática armónica a 500 temas por playlist.
6. En «Exportar», descarga CSV, JSON o propuestas de cues.
7. Para pinchar en CDJ-3000X / XDJ-AZ, exporta realmente desde **Rekordbox u otra aplicación con soporte OneLibrary documentado** y expulsa el pen desde el sistema operativo. La webapp no escribe al USB.

Si un navegador restringe `file://`, los desarrolladores pueden iniciar un servidor local desde la carpeta con `python3 -m http.server 8765 --bind 127.0.0.1`. **El DJ final no necesita un servidor en el flujo habitual**.

## Privacidad y seguridad

Salvo el motor opcional de normalización que funciona en el ordenador del DJ, el procesamiento de biblioteca se ejecuta en memoria en el navegador. **El USB no se explora por sí solo**: al elegir una carpeta se enumeran nombres, tamaños y rutas relativas mediante el selector de archivos del navegador. Los MP3 no se abren hasta que tú solicitas una medición. La presencia de `exportLibrary.db` indica que existe un archivo OneLibrary, no que su contenido, listas ni cues sean íntegros. La coincidencia de canciones se basa en nombres de archivo o etiquetas leídas expresamente, nunca en hashes ni identificadores OneLibrary; una versión Extended diferente de Original se señala como posible variante, no como coincidencia confirmada. El tamaño máximo de un archivo de lista es 40 MB; para audio individual el límite conservador es 40 MB porque Web Audio descomprime el archivo en memoria. Sin CDN, analíticas, cuentas, cookies ni almacenamiento de biblioteca en `localStorage`. Únicamente el companion opcional utiliza `fetch` contra el mismo origen `127.0.0.1:18766`, con token de sesión y sin CORS público. Las exportaciones voluntarias generan archivos locales; el JSON omite rutas absolutas. El usuario puede compartir datos musicales de su sesión si así lo decide. Para otras personas, un pen solo se escanea después de seleccionar manualmente su carpeta; ningún proceso permanente monitoriza unidades. En modo estático no se transmiten audios. El companion local recibe temporalmente el audio seleccionado dentro del propio ordenador; se borra la copia temporal tras finalizar o cerrar el servicio. Las copias normalizadas quedan solo en la carpeta de salida local.

La webapp **nunca** escribe `master.db`, bases privadas de otro software DJ, OneLibrary, etiquetas ID3 de originales, Hot Cues, tarjetas ni USB. El companion opcional **sí genera copias nuevas normalizadas**, solo por petición y sin sobrescribir los audios originales. Nunca contiene ni distribuye pistas protegidas o portadas de terceros.

Los valores desconocidos se muestran como desconocidos: no se inventa energía ni tonalidad. Los BPM y la tonalidad de etiquetas ID3/FLAC NO están comprobados por un análisis acústico. Si faltan, seguirán vacíos. El lector de etiquetas de esta beta no soporta aún contenedores M4A, WAV/AIFF y formatos con ID3 extendido, comprimido o desincronizado; esos archivos pueden seguir inventariándose por nombre. Las estimaciones Camelot, fraseo, RMS y Hot Cues necesitan revisión humana y controles de cabina.

## Compatibilidad oficial

AlphaTheta confirma que CDJ-3000X y XDJ-AZ usan OneLibrary, distinto de Device Library clásico. **La app solo prepara propuestas**, no declara un USB compatible hasta la exportación con software soportado y prueba en hardware.

- https://alphatheta.com/es/information/important-notice-for-customers-using-usb-devices-with-our-dj-equipment/
- https://rekordbox.com/es/support/usb-export/
- https://rekordbox.com/es/support/faq/onelibrary-7/

## Test para desarrolladores (Node opcional)

`node --check core.js`, `node --check normalizer-ui.js`, `node --check app.js`, `node --test tests/*.test.js` y `python3 -m unittest discover -s tests -p test_normalizer.py -v` (esta última requiere FFmpeg).

## Archivos

`index.html` interfaz · `styles.css` estilos · `core.js` motor musical · `usb.js` inventario y calidad del USB · `tags.js` lector ID3/FLAC · `app.js` interacción y Web Audio · `tests/*.test.js` regresión · `ROADMAP-PUBLIC-BETA.md` hoja de ruta.

**Estado: beta local distribuible, NO SaaS público ni release comercial.** Falta QA independiente multi-navegador, validación de importaciones con otros DJs, validación física de CDJ/XDJ y revisión del nombre comercial. El código se publica como open source con licencia MIT, pero el software sigue en beta y no está certificado para cabina. Autoría: NEBØA. No añadir música original al ZIP.
