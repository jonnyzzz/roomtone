export type TelegramUser = {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
};

export type TelegramChat = {
  id: number;
  type: "private" | "group" | "supergroup" | "channel";
  title?: string;
};

export type TelegramMessage = {
  message_id: number;
  text?: string;
  from?: TelegramUser;
  chat: TelegramChat;
};

export type TelegramUpdate = {
  update_id: number;
  message?: TelegramMessage;
};

type TelegramResponse<T> = {
  ok: boolean;
  result: T;
  description?: string;
};

export class TelegramApi {
  private readonly baseUrl: string;

  constructor(private readonly token: string, baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  async getUpdates(offset: number, timeoutSeconds: number): Promise<TelegramUpdate[]> {
    const payload = {
      offset,
      timeout: timeoutSeconds,
      allowed_updates: ["message"]
    };
    const response = await fetch(this.apiUrl("getUpdates"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = (await response.json()) as TelegramResponse<TelegramUpdate[]>;
    if (!data.ok) {
      throw new Error(data.description || "Telegram getUpdates failed.");
    }
    return data.result ?? [];
  }

  async sendMessage(
    chatId: number,
    text: string,
    options?: { parseMode?: "HTML" | "MarkdownV2"; disablePreview?: boolean }
  ): Promise<void> {
    const payload = {
      chat_id: chatId,
      text,
      disable_web_page_preview: options?.disablePreview ?? true
    };
    if (options?.parseMode) {
      Object.assign(payload, { parse_mode: options.parseMode });
    }
    const response = await fetch(this.apiUrl("sendMessage"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = (await response.json()) as TelegramResponse<unknown>;
    if (!data.ok) {
      throw new Error(data.description || "Telegram sendMessage failed.");
    }
  }

  private apiUrl(method: string): string {
    return `${this.baseUrl}/bot${this.token}/${method}`;
  }
}
