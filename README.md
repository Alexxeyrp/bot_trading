# Trading Pattern Alert Bot

Bot en JavaScript moderno y ES Modules que obtiene velas OHLC, detecta Double Bottom, Double Top y Ascending Triangle, filtra por confianza y envía alertas a Telegram. Su función es exclusivamente análisis y alertas. No compra, vende, abre posiciones ni envía órdenes a brokers.

**Producción funciona en Vercel sin dejar tu ordenador encendido.** Cada Cron ejecuta un análisis y termina. Telegram controla el estado mediante un webhook. El servidor local sirve únicamente para desarrollar.

**Vercel Hobby permite un Cron diario, no cada 1m/5m.** La temporalidad de las velas y la frecuencia del análisis son cosas distintas. Un bot configurado con velas de 5m en Hobby se analizará una vez al día y puede perder señales entre análisis. El proyecto respeta ese límite, sin programadores externos para sortearlo.

## Qué se conservó del proyecto

Se conservaron los tres detectores y su interfaz `detect(candles)`, el algoritmo compartido de dobles patrones, las utilidades de precios, la integración con Twelve Data y Winston. Se corrigieron la confirmación de ruptura, la selección de la confirmación más reciente y el cálculo con tolerancia cero. Se sustituyeron el intervalo permanente, el estado fijo y los logs en archivos por invocaciones finitas, Redis y logs de consola.

El proveedor existente Twelve Data se mantiene para Forex. Binance se añadió para datos públicos de criptomonedas como `BTCUSDT`; no requiere una API key ni permisos de trading.

## Arquitectura

```text
Vercel Cron → GET /api/scan → autenticación CRON_SECRET
                                ↓
                        configuración en Redis
                                ↓
                   datos OHLC → velas cerradas
                                ↓
          detectores habilitados → filtro de confianza
                                ↓
               reserva atómica + cooldown en Redis
                                ↓
                       alerta a Telegram

Telegram → POST /api/telegram → secreto del webhook
                                ↓
                   chat y usuario autorizados
                                ↓
               comando validado → Redis → respuesta
```

- `api/scan.js`: entrada serverless del análisis, solo GET autenticado.
- `api/telegram.js`: entrada serverless del webhook, solo POST autenticado.
- `src/config.js`: defaults, tolerancias y validación.
- `src/marketData/`: Binance, Twelve Data y normalización UTC.
- `src/patterns/`: detectores reutilizados, sin dependencias de Telegram o Redis.
- `src/services/scanner.js`: un único análisis finito.
- `src/services/storage.js`: persistencia desacoplada mediante Redis REST.
- `src/services/commands.js`: autorización y comandos.
- `src/services/telegram.js`: llamadas acotadas a Telegram, sin polling.
- `src/utils/logger.js`: Winston por consola con redacción de secretos.
- `src/index.js`: servidor HTTP local, sin scheduler automático.
- `scripts/`: comprobaciones, scan manual y configuración de Telegram.
- `tests/`: pruebas aisladas, sin credenciales reales ni conexiones externas.
- `public/`: única carpeta publicada como contenido estático; el código y los archivos de configuración no se publican como frontend.

## Almacenamiento: Upstash Redis

Se eligió Upstash Redis porque admite acceso HTTPS desde funciones serverless y comandos atómicos con Lua. No hay servidores que mantener ni migraciones SQL. Se puede contratar desde Vercel Marketplace o directamente desde Upstash. El coste y las cuotas de su plan son independientes de Vercel: comprueba los valores que te muestre el proveedor al crear la base.

Se guardan de forma persistente:

- Estado activo/inactivo, símbolo, timeframe, confianza y cada patrón.
- Versiones de comandos por campo para que reintentos antiguos no sobrescriban cambios nuevos.
- Reservas de updates Telegram y bloqueo compartido del scanner.
- Identidades de señales, cooldown, última confirmación por activo/timeframe/patrón.
- Último análisis, última alerta y contadores de análisis, alertas y errores.

No hay fallback a memoria si Redis falla: se detiene la operación y se devuelve un error seguro. La interfaz del servicio permite cambiar el proveedor posteriormente.

Los defaults del entorno se guardan con `HSETNX` al acceder por primera vez. Después, Telegram es la fuente de los valores editables: cambiar `SYMBOL` o `SCANNER_ACTIVE` en Vercel no sobrescribe lo ya guardado. Usa los comandos para cambiarlo. Un `STORAGE_PREFIX` nuevo crea un estado independiente; no lo cambies para actualizaciones normales.

## Requisitos e instalación local

1. Instala Node.js **22.x** y Git.
2. Abre una terminal dentro de esta carpeta.
3. Instala las dependencias:

```powershell
npm install
```

4. Si todavía no tienes `.env`, créalo:

```powershell
Copy-Item .env.example .env
```

Si ya existe, **consérvalo** y añade las variables nuevas siguiendo `.env.example`. El archivo existente no se ha sobrescrito. Elimina `SCAN_INTERVAL` cuando quieras: ya no se utiliza.

5. Completa las variables de entorno descritas a continuación.
6. Comprueba la configuración:

```powershell
npm run config:check
```

Esta comprobación no imprime secretos ni contacta con servicios. Para practicar, usa otra base o `STORAGE_PREFIX=trading-bot-development`. No registres un webhook de pruebas con el mismo bot de producción: Telegram admite un webhook por bot.

## Variables de entorno

### Necesarias en Vercel (Production)

| Variable | Valor / función |
| --- | --- |
| `TELEGRAM_BOT_TOKEN` | Token privado de BotFather. |
| `TELEGRAM_CHAT_ID` | ID numérico del chat autorizado y destino de las alertas. Para empezar, usa tu chat privado. |
| `TELEGRAM_WEBHOOK_SECRET` | Secreto aleatorio de 16–256 caracteres: letras, números, guion y guion bajo. |
| `CRON_SECRET` | Otro secreto aleatorio de al menos 16 caracteres. |
| `UPSTASH_REDIS_REST_URL` | URL HTTPS del endpoint REST de la base Redis. |
| `UPSTASH_REDIS_REST_TOKEN` | Token REST de escritura, no el token de solo lectura. |
| `STORAGE_PREFIX` | `trading-bot-production`; usa otro para desarrollo/Preview. |
| `DATA_PROVIDER` | `binance` o `twelvedata`. |
| `SYMBOL` | Inicial: `BTCUSDT` para Binance; `EURUSD` para Twelve Data. |
| `TIMEFRAME` | Inicial: `5m`. Para análisis diario suele ser más práctico `1d`. |
| `MIN_CONFIDENCE` | Inicial: `75`, entero de 0 a 100. |

La confianza es una puntuación heurística del detector, no una probabilidad de éxito calibrada.

### Opcionales o específicas del proveedor

| Variable | Default / uso |
| --- | --- |
| `TELEGRAM_ADMIN_USER_ID` | Obligatoria si el chat es un grupo: solo este usuario administra el bot. Los administradores anónimos se rechazan. |
| `MARKET_DATA_API_URL` | Binance: `https://api.binance.com`. Twelve Data: `https://api.twelvedata.com`. |
| `MARKET_DATA_API_KEY` | Obligatoria para Twelve Data. Binance no la utiliza. |
| `SCANNER_ACTIVE` | `false`; activar con `/run`. |
| `ENABLED_PATTERNS` | `doublebottom,doubletop,ascendingtriangle`; vacío deshabilita todos inicialmente. |
| `MIN_CANDLES` / `CANDLE_LIMIT` | `50` / `200`; se descarta la vela abierta, por eso el límite debe superar el mínimo. Máximo 1000. |
| `ALERT_COOLDOWN_SECONDS` | `3600`, por activo/timeframe/patrón. |
| `DOUBLE_BOTTOM_TOLERANCE` / `DOUBLE_TOP_TOLERANCE` / `TRIANGLE_TOLERANCE` | `0.02`. |
| `BREAKOUT_CONFIRMATION_PERCENT` | `0.001`. |
| `MIN_PATTERN_SEPARATION` / `PIVOT_WINDOW` | `5` / `2`. |
| `DEBUG_PATTERNS` / `LOG_LEVEL` | `false` / `info`. |
| `PORT` | `3000`, solo servidor local. |
| `DEPLOYMENT_URL` | Solo registro local del webhook: dominio HTTPS estable de producción. |

No utilices prefijos de variables que las expongan al cliente. `.env`, `.env.*` y `.vercel/` están ignorados por Git. `.env.example` contiene únicamente ejemplos sin credenciales.

Para generar cada secreto, ejecuta esta orden dos veces y guarda los dos resultados distintos:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

## Desarrollo y pruebas

```powershell
npm run dev
```

Abre `http://127.0.0.1:3000`. El servidor arranca sin ejecutar scans ni enviar mensajes. `/api/scan` no puede dispararse sin autorización. Si faltan los secretos correspondientes devuelve 503; con un secreto configurado y una petición sin autorización devuelve 401.

`npm start` inicia el mismo servidor sin reinicio automático. Ambos son para desarrollo local; Vercel utiliza los archivos de `api/`.

Para un único análisis local con el estado guardado en Redis:

```powershell
npm run scan
```

El scan respeta el estado activo/inactivo. Solo envía mensajes si está activo y encuentra una señal válida. Para activarlo usa `/run` desde Telegram tras registrar el webhook; también puedes inicializar una base de desarrollo nueva con `SCANNER_ACTIVE=true`.

```powershell
npm test
npm run check
npm audit
```

Los tests usan Node Test Runner, datos sintéticos, HTTP simulado y los scripts Lua reales ejecutados con Wasmoon, una dependencia solo de desarrollo. Cubren los tres patrones, autorización, configuración, comandos, deduplicación, errores, endpoints y arranque HTTP. No mandan mensajes a tu Telegram ni consultan tu base de datos. El entorno de pruebas sustituye las credenciales de `.env`.

No existía un linter. `npm run check` comprueba sintaxis, resolución de imports de todos los módulos y la configuración básica de Vercel. No sustituye un deployment real.

## Puesta en marcha, paso a paso

### 1. Crear o reutilizar el bot Telegram

1. Habla con **@BotFather** en Telegram.
2. Usa `/newbot`, elige nombre y usuario, y copia el token.
3. Guarda el token en tu `.env` como `TELEGRAM_BOT_TOKEN`.
4. Abre el chat privado con tu bot y envía `/start`.
5. Antes de registrar el webhook ejecuta:

```powershell
npm run telegram:chat-id
```

6. Copia tu `chatId` en `TELEGRAM_CHAT_ID`. El script solo muestra IDs y tipo de chat, no los textos de tus mensajes. Si todavía devuelve una lista vacía, envía otro mensaje y repite.
7. Si el bot ya tiene un webhook, `getUpdates` no está disponible: reutiliza el ID conocido de tu chat. No se elimina automáticamente un webhook existente.

Para un grupo, añade el bot, usa el ID negativo del grupo como `TELEGRAM_CHAT_ID` y tu `userId` como `TELEGRAM_ADMIN_USER_ID`. Los demás miembros no podrán configurar el bot.

### 2. Crear Redis

1. Abre Upstash y crea una base Redis, o añádela desde **Vercel Marketplace → Storage → Upstash Redis**.
2. Copia su **REST URL** y **REST token** de escritura.
3. Guárdalos en `.env` con los nombres de la tabla.
4. Usa el mismo endpoint/token en las variables de Production de Vercel.
5. Conserva el prefijo de producción entre despliegues. Para Preview, usa otra base/prefijo y otro bot, o deja las credenciales sin configurar.

### 3. Completar el entorno local

1. Genera los dos secretos independientes.
2. Elige un proveedor y valores coherentes. Para Binance: `BTCUSDT`, URL de Binance y sin API key. Para Twelve Data: `EURUSD`, URL de Twelve Data y su API key.
3. Completa todas las variables necesarias.
4. Ejecuta `npm run config:check`, `npm test` y `npm run check`.

### 4. Preparar Git y subir el proyecto

Esta carpeta de trabajo no tenía `.git` al realizar la adaptación. Si trabajas sobre esta misma copia, crea primero un repositorio privado vacío en GitHub/GitLab/Bitbucket, sin README inicial, y luego ejecuta:

```powershell
git init
git branch -M main
git remote add origin <URL-DE-TU-REPOSITORIO>
git status --short
git add .
git diff --cached
git commit -m "Prepare trading pattern bot for Vercel"
git push -u origin main
```

Comprueba antes del commit que `.env`, tokens y claves no aparecen entre los archivos preparados. Si ya trabajas desde un clon con remoto, omite `git init`, `git branch` y `git remote add`.

### 5. Importar en Vercel

1. Abre **Vercel → Add New → Project** e importa el repositorio.
2. Elige **Framework Preset: Other**.
3. La raíz debe ser la carpeta que contiene `package.json`, `api/` y `vercel.json`.
4. Selecciona Node.js **22.x**; `package.json` ya fija esa versión.
5. Deja el comando de build vacío, porque no hay frontend que compilar. El Output Directory es `public`, configurado en `vercel.json`. El Install Command puede ser `npm ci`.
6. Mantén **Fluid Compute** activado para los límites de duración configurados: 120 segundos para scan y 60 para webhook. La región de funciones está fijada a París (`cdg1`); elige Redis próximo a esa región. Aun así, verifica acceso al proveedor desde Production.
7. Añade las variables de la tabla en el entorno **Production**. Incluye las específicas de Twelve Data si eliges ese proveedor.
8. Despliega. Cambiar variables después de desplegar requiere un redeploy para que las funciones las reciban.

Vercel detecta automáticamente las funciones Node.js de `api/`. No ejecutes `npm start` como servicio permanente en Vercel.

### 6. Registrar el webhook de producción

1. Copia el dominio estable del proyecto, por ejemplo `https://tu-proyecto.vercel.app`, no la URL efímera de un Preview.
2. Guárdalo en tu `.env` local como `DEPLOYMENT_URL`.
3. Asegúrate de que el token del bot y el secreto local del webhook coincidan con los de Production.
4. Ejecuta:

```powershell
npm run telegram:webhook
npm run telegram:info
```

El registro usa `secret_token`, solo updates `message`, una conexión simultánea y conserva los updates pendientes. No imprime la URL del token ni el secreto. Puede reemplazar el webhook anterior del mismo bot.

`telegram:info` muestra si está configurado, cantidad de updates pendientes y si hubo errores de entrega.

El dominio de producción debe ser accesible para Telegram. Si la protección del deployment exige un inicio de sesión de Vercel, excluye estas rutas de esa protección o permite el acceso al deployment de producción. Las rutas conservan su propia autenticación; no pongas secretos en la URL.

### 7. Comprobar Telegram y activar

Desde tu chat autorizado envía, uno por uno:

```text
/start
/status
/symbol BTCUSDT
/timeframe 1d
/confidence 75
/patterns
/run
/status
```

Para Twelve Data cambia el símbolo a `EURUSD`. `1d` es una elección práctica para el Cron diario; puedes usar `5m` si aceptas el muestreo diario.

`/status` debe mostrar ACTIVO, el activo y timeframe elegidos, confianza, los tres patrones y estadísticas. `/run` activa el scanner: **no ejecuta un análisis inmediato ni cambia la frecuencia del Cron**.

### 8. Comprobar el Cron y la primera ejecución

1. En Vercel abre **Settings → Cron Jobs**.
2. Comprueba que aparece `/api/scan` con `0 8 * * *`.
3. El horario está en **UTC**: una ejecución al día en la franja de las 08:00 UTC, con la precisión por hora de Hobby. Los cambios de horario de verano local no cambian UTC.
4. Usa **Run** en Vercel para una comprobación manual y abre los logs de esa ejecución, o espera al siguiente Cron.
5. Confirma que el resultado es `completed`, `inactive` o `busy` según el estado. Los errores parciales devuelven HTTP 503 y quedan registrados.
6. En Telegram envía `/status` y comprueba que el contador y la fecha del análisis se han actualizado.
7. Las alertas solo aparecen si hay un patrón habilitado con confianza suficiente; no recibir una alerta no significa que el scanner no haya funcionado.
8. Envía `/stop` si deseas pausar. El Cron seguirá invocándose, pero no descargará mercado ni analizará mientras esté inactivo.

**Tras estos pasos puedes apagar tu ordenador.** Redis guarda la configuración y Vercel ejecuta Cron y webhook.

## Comandos disponibles

| Comando | Función |
| --- | --- |
| `/start`, `/help` | Ayuda; no activan automáticamente. |
| `/status` | Estado, configuración y estadísticas básicas. |
| `/run` | Activa el próximo análisis programado. |
| `/stop` | Desactiva análisis posteriores. |
| `/symbol BTCUSDT` | Cambia símbolo; valida formato según proveedor. |
| `/timeframe 5m` | Cambia temporalidad dentro de las admitidas. |
| `/confidence 80` | Confianza mínima entera, 0–100. |
| `/patterns` | Lista patrones y estado. |
| `/enable doublebottom` | Activa un patrón. |
| `/disable doublebottom` | Desactiva un patrón. |

IDs: `doublebottom`, `doubletop`, `ascendingtriangle`.

Temporalidades Binance: 1m, 3m, 5m, 15m, 30m, 1h, 2h, 4h, 6h, 8h, 12h, 1d, 3d, 1w, 1M.

Temporalidades Twelve Data: 1m, 5m, 15m, 30m, 45m, 1h, 2h, 4h, 8h, 1d, 1w, 1M. Esta integración admite únicamente pares Forex de seis letras, con barra opcional, y usa UTC.

Se valida el formato del símbolo antes de guardarlo. La disponibilidad real del mercado y los permisos del plan del proveedor se comprueban al obtener datos. El comando no garantiza que cualquier símbolo con formato válido exista.

## Deduplicación y concurrencia

La señal incluye símbolo, timeframe, nombre del patrón y momento de cierre de la vela de confirmación, no la hora de ejecución del servidor. Las alertas muestran fecha y hora UTC.

La reserva de señal y el cooldown son atómicos en Redis. Una señal se conserva 90 días; además queda una marca permanente de la última confirmación por activo/timeframe/patrón para impedir reenviar señales iguales o anteriores cuando expiren las claves temporales. El cooldown de una hora también bloquea señales diferentes del mismo grupo. Las señales bloqueadas por cooldown podrán enviarse en otro scan si siguen siendo la confirmación seleccionada.

Un bloqueo compartido de 180 segundos evita scans simultáneos. Si la función se interrumpe, el bloqueo caduca. Las reservas de updates pendientes caducan en 120 segundos; los completados se recuerdan siete días. Los cambios administrativos se ordenan por fecha del mensaje e ID por campo, de modo que un reintento anterior no revierta cambios nuevos.

Se vuelve a leer la configuración antes de enviar cada alerta. `/stop` evita nuevos envíos al comprobarlo; un mensaje que ya esté en curso hacia Telegram puede completar su entrega.

## Errores y límites que debes conocer

- Mercado: timeout de 8 segundos, HTTP y payload validados, precios OHLC coherentes y timestamps ordenados. Se excluye la vela abierta y se exige `MIN_CANDLES`.
- Telegram: timeout de 8 segundos. Si Telegram rechaza definitivamente un envío, se libera la reserva para poder intentarlo en otro scan. Si la entrega es incierta por timeout/red/5xx, se conserva la reserva para evitar duplicados: puede perderse esa alerta.
- No se puede garantizar entrega exactamente una vez entre Redis y Telegram, porque no comparten transacción ni Telegram proporciona una clave de idempotencia para `sendMessage`. Un fallo entre reserva y envío también puede suprimir una alerta. Una respuesta administrativa puede repetirse tras una entrega incierta, aunque el cambio de configuración no se reaplica.
- Redis: timeout de 3 segundos por petición. Si falta o falla no se continúa con estado local.
- Si un detector falla, los otros se ejecutan y el resultado se registra como parcial.
- Solo se devuelve la confirmación más reciente de cada tipo en la ventana descargada, no un historial completo de todas las señales. No se recuperan velas fuera de esa ventana.
- En Hobby el scan diario con 200 velas de 5m cubre unas 16 horas y puede omitir señales de las horas restantes. Usa una temporalidad mayor o un plan compatible con una frecuencia mayor.
- Vercel no reintenta automáticamente un Cron fallido y su entrega es best effort. Revisa las fechas de `/status` y los logs.
- Las restricciones geográficas de Binance y las cuotas/licencias de Twelve Data pueden impedir obtener mercado desde la región de Vercel. La conectividad real desde Production debe verificarse tras desplegar.
- Hobby tiene límites de recursos y uso propios; comprueba también que el uso previsto sea compatible con las condiciones del plan.

### Limitaciones actuales de Vercel, verificadas el 7 de octubre de 2026

La documentación oficial indica 100 Cron Jobs por proyecto, intervalo mínimo diario y precisión por hora en Hobby. Pro permite intervalo mínimo de un minuto. Este proyecto configura un solo Cron diario; no altera el límite creando varios Crons.

Si contratas un plan que lo admita, puedes cambiar la expresión a `*/5 * * * *` para análisis cada cinco minutos y desplegar de nuevo. No hagas ese cambio en Hobby.

Fuentes oficiales:

- [Uso y límites de Vercel Cron](https://vercel.com/docs/cron-jobs/usage-and-pricing).
- [Seguridad CRON_SECRET, concurrencia y reintentos](https://vercel.com/docs/cron-jobs/manage-cron-jobs).
- [Funciones Node.js en Vercel](https://vercel.com/docs/functions/runtimes/node-js).
- [Telegram setWebhook y secret_token](https://core.telegram.org/bots/api#setwebhook).
- [Upstash Redis REST](https://upstash.com/docs/redis/features/restapi).

## Cómo revisar problemas

1. **El webhook no responde:** ejecuta `npm run telegram:info`, comprueba Production accesible, `TELEGRAM_WEBHOOK_SECRET` idéntico en registro y Vercel, y redeploy tras cambios de entorno.
2. **No estás autorizado:** verifica chat privado e ID. En grupos revisa también `TELEGRAM_ADMIN_USER_ID`. No se responde a usuarios ajenos ni se modifica estado.
3. **HTTP 401 en scan:** falta la cabecera `Authorization: Bearer <CRON_SECRET>`. Abrirlo en el navegador sin ella no es una prueba de funcionamiento.
4. **HTTP 503:** consulta Vercel Logs de la función y ejecuta `npm run config:check` localmente con la misma configuración.
5. **Error de almacenamiento:** confirma REST URL, token de escritura, base disponible y cuotas.
6. **Error de mercado:** verifica proveedor, URL, API key para Twelve Data, símbolo, plan y restricciones regionales. No copies URLs con API keys a logs públicos.
7. **Scanner ACTIVO sin análisis nuevos:** revisa Cron Jobs habilitado y deployment de Production. La configuración Cron solo opera en Production.
8. **Análisis completado sin alertas:** comprueba mínimos de datos, patrones habilitados, confianza, cooldown y que la señal no sea una ya enviada.

Winston registra ejecución, detecciones, envíos, comandos y cambios mediante consola. Los intentos no autorizados se registran sin IDs ni contenido del usuario. Las comprobaciones iniciales HTTP emiten mensajes genéricos cuando falla el servicio; las respuestas no revelan credenciales. No se depende de archivos locales para estado ni logs críticos.

## Actualizar posteriormente mediante Git

```powershell
npm ci
npm test
npm run check
git diff
git status --short
git add .
git diff --cached
git commit -m "Update trading pattern bot"
git push
```

Con la integración Git, Vercel desplegará la rama de producción. Redis conserva configuración y deduplicación. Si cambia el dominio, token o secreto del webhook, actualiza `.env` local y registra de nuevo el webhook. Si cambias variables de Vercel, redeploy. Un cambio de proveedor exige valores compatibles: ajusta la configuración o inicializa un prefijo nuevo de forma consciente.

## Estado de la preparación

Código y pruebas preparados; deployment, creación de Redis y registro del webhook deben realizarse manualmente. No se han hecho commit, push ni deployment, ni se han utilizado credenciales reales para tests. La instalación, sintaxis, dependencias y arranque local se verifican en el entorno de desarrollo; la primera ejecución real en Vercel verifica conectividad y credenciales de Production.
