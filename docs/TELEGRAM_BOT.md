# Telegram Bot

Roomtone includes an optional Telegram bot that issues short-lived invite links.
The bot is allowlist-only and signs JWTs with an RSA private key so the server
can verify them against configured public keys.

## Setup

1. Create a bot with @BotFather and copy the token.
2. Collect Telegram user IDs for the people allowed to create links.
3. Generate an RSA keypair and share only the public key with the Roomtone
   server (see `docs/AUTH.md`).

Example keypair:

```bash
openssl genrsa -out roomtone.key 4096
openssl rsa -in roomtone.key -pubout -out roomtone.pub
```

## Environment Variables

| Variable | Required | Description |
| --- | --- | --- |
| `BOT_ENABLED` | yes | Set to `true` to run the bot |
| `TELEGRAM_BOT_TOKEN` | yes | Bot token from @BotFather |
| `TELEGRAM_ALLOWED_USERS` | yes | Comma or space separated Telegram user IDs |
| `BOT_PUBLIC_BASE_URL` | yes | Base URL for invite links |
| `BOT_JWT_PRIVATE_KEY` or `BOT_JWT_PRIVATE_KEY_FILE` | yes | RSA private key |
| `BOT_JWT_TTL_SECONDS` | no | Token TTL (default 300s) |
| `BOT_COMMAND` | no | Command name (default `/invite`) |
| `TELEGRAM_ALLOWED_CHATS` | no | Restrict links to specific chat IDs |

## Using with Stevedore + Stevedore DynDNS

If you deploy behind Stevedore DynDNS, set a public base URL that matches the
subdomain you registered, for example:

```
BOT_PUBLIC_BASE_URL=https://roomtone.example.com
```

Roomtone also supports deriving the URL when both of these are set:

```
ROOMTONE_SUBDOMAIN=roomtone
DYNDNS_DOMAIN=example.com
```

If Stevedore DynDNS exposes the domain in a shared file, you can point
`DYNDNS_DOMAIN_FILE` to it. See the issue filed in the dyndns repo for details.

## Usage

Send `/invite` in a DM or a group chat where the bot is present. The bot replies
in the same chat with a unique invite link signed for your name.

Tokens include your display name and expire after the configured TTL (default
5 minutes).
