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
| `TELEGRAM_ADMIN_USERS` | no | Admin Telegram user IDs |
| `TELEGRAM_ADMIN_USERNAMES` | no | Admin usernames (less stable than IDs) |
| `TELEGRAM_BOT_USERNAME` | no | Bot username (for mention detection) |
| `TELEGRAM_NOTIFY_CHATS` | no | Chat IDs that receive join notifications |
| `PUBLIC_BASE_URL` | yes | Base URL for invite links and polling |
| `BOT_JWT_PRIVATE_KEY` or `BOT_JWT_PRIVATE_KEY_FILE` | yes | RSA private key |
| `BOT_JWT_TTL_SECONDS` | no | Token TTL (default 300s) |
| `BOT_COMMAND` | no | Command name (default `/invite`) |
| `TELEGRAM_ALLOWED_CHATS` | no | Restrict links to specific chat IDs |
| `BOT_STATE_FILE` | no | Allowlist persistence file |
| `BOT_NOTIFY_POLL_SECONDS` | no | Poll interval for join notifications |

## Using with Stevedore + Stevedore DynDNS

If you deploy behind Stevedore DynDNS, set a public base URL that matches the
subdomain you registered. With prefix mode (`SUBDOMAIN_PREFIX=true`) the format
is `https://<subdomain>-<base-domain>`:

```
PUBLIC_BASE_URL=https://<subdomain>-<base-domain>
```

Roomtone can also derive the URL when both of these are set (non-prefix mode):

```
ROOMTONE_SUBDOMAIN=krovatka
DYNDNS_DOMAIN=your-domain.example
```

If Stevedore DynDNS exposes the domain in a shared file, you can point
`DYNDNS_DOMAIN_FILE` to it. See the issue filed in the dyndns repo for details.

## Usage

Send `/invite` in a DM or a group chat where the bot is present. The bot replies
in the same chat with a unique invite link signed for your name.

Tokens include your display name and expire after the configured TTL (default
5 minutes).

If you send an unknown message in a DM, or mention the bot in a group chat, it
responds with a short help message. `/start` also triggers the help response.
Set `TELEGRAM_BOT_USERNAME` so the bot can detect direct mentions in groups.

## Join Notifications

If `TELEGRAM_NOTIFY_CHATS` is set (or `TELEGRAM_ALLOWED_CHATS` is set and
`TELEGRAM_NOTIFY_CHATS` is empty), the bot polls Roomtone for new participants
and posts a short notification with a join link. The link is shown as a compact
anchor (`Join Roomtone`) rather than the full URL.

## Allowlist Persistence

Admin changes are stored in `BOT_STATE_FILE` (default:
`/var/lib/roomtone/bot-access.json`). Mount `/var/lib/roomtone` to keep the
allowlist between restarts.

## Admin Commands

Admins can manage the allowlist at runtime:

- `/whoami` - shows your user ID and the current chat ID.
- `/allow_user <telegram_id>` - allow a user to request invites.
- `/deny_user <telegram_id>` - remove a user from the allowlist.
- `/allow_chat <chat_id>` - allow invites from a group chat.
- `/deny_chat <chat_id>` - remove a group chat from the allowlist.
- `/list_access` - show current allowlist/admins.

Admin commands work in DMs or group chats, but note that responses are sent to
the same chat where the command was issued.
