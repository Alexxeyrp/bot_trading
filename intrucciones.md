Reutiliza tu bot Telegram o crea uno con @BotFather. Guarda su token en .env.

Envía /start al bot. Antes de registrar el webhook, ejecuta npm run telegram:chat-id y guarda tu ID como TELEGRAM_CHAT_ID.

Crea una base Upstash Redis. Guarda su REST URL y token de escritura en las dos variables correspondientes.

Genera dos secretos distintos, ejecutando dos veces:
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
Guárdalos como CRON_SECRET y TELEGRAM_WEBHOOK_SECRET.

Completa la configuración del mercado. Para BTCUSDT utiliza DATA_PROVIDER=binance y MARKET_DATA_API_URL=https://api.binance.com. Twelve Data sigue disponible para Forex.

Comprueba el entorno: ejecuta npm run config:check.

Crea un repositorio remoto vacío en GitHub, GitLab o Bitbucket.

Inicializa Git y añade el remoto:
git init
git branch -M main
git remote add origin <URL-DE-TU-REPOSITORIO>

Revisa y sube los archivos:
git add .
git diff --cached
git commit -m "Prepare trading pattern bot for Vercel"
git push -u origin main
Comprueba que .env no aparezca entre los archivos preparados.

Importa el repositorio en Vercel. Selecciona Other, Node.js 22.x, build vacío, salida public y Fluid Compute activado.

Configura las variables de Production: las cuatro de Telegram/Cron, las dos de Redis, STORAGE_PREFIX=trading-bot-production, DATA_PROVIDER, SYMBOL, TIMEFRAME y MIN_CONFIDENCE. Para Twelve Data añade su URL y API key; para grupos, TELEGRAM_ADMIN_USER_ID.

Despliega en Vercel. Copia el dominio estable HTTPS a DEPLOYMENT_URL en tu .env local.

Registra el webhook: ejecuta npm run telegram:webhook.

Comprueba el registro: ejecuta npm run telegram:info.

Envía /status desde tu chat autorizado. Revisa activo, temporalidad, confianza y patrones.

Envía /run. Activa los análisis futuros; no ejecuta un scan inmediato.

Abre Cron Jobs en Vercel, comprueba /api/scan y ejecuta una prueba manual con Run.

Revisa los logs y vuelve a enviar /status. Cuando aparezca el análisis realizado, el bot funcionará en la nube y podrás apagar tu ordenador.
