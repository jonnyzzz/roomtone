import { loadBotConfig } from "./config";
import { ConnectionManagerBot } from "./service";
import { TelegramApi } from "./telegram";

const config = loadBotConfig(process.env);

if (!config) {
  console.log("Roomtone bot disabled (set BOT_ENABLED=true to run).");
  process.exit(0);
}

const api = new TelegramApi(config.token, config.telegramApiBaseUrl);
const bot = new ConnectionManagerBot(config, api);

void bot.start();

function shutdown() {
  bot.stop();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
