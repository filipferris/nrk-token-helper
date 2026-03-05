# 🔑 NRK Token Helper

Standalone CLI tool to extract NRK authentication tokens and profile data for the [Home Assistant NRK TV integration](https://github.com/filipferris/ha-nrk-tv).

## How It Works

1. Opens a Chromium browser window to [tv.nrk.no](https://tv.nrk.no)
2. You log in with your NRK account as you normally would
3. Once login is detected (via the `nrk-auth-flag` cookie), the tool automatically extracts:
   - Your user ID and session cookie
   - All profiles (identities) on the account, including child profiles
4. Outputs a JSON blob you can paste into your Home Assistant NRK TV integration config

## Requirements

- **Node.js 18+**

## Usage

### Quick start (npx)

```bash
npx nrk-token-helper
```

### Or install locally

```bash
git clone https://github.com/filipferris/nrk-token-helper.git
cd nrk-token-helper
npm install
npm start
```

> **Note:** On first run, Playwright will download a Chromium browser (~150 MB). This only happens once.

## Output

After logging in, you'll see output like:

```
✅ Login detected! Extracting session data...

👤 Logged in as: Parent
📧 Email: user@example.com

📋 Profiles found:
   👤 Parent (Adult) - aaaaaaaa-xxxx-xxxx-xxxx-xxxxxxxxxxxx
   👶 Child 2 (Child) - aaaaaaaa-xxxx-xxxx-xxxx-xxxxxxxxxxxx

============================================================
📋 Copy this JSON into your Home Assistant NRK TV config:

{
  "user_id": "aaaaaaaa-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "session_cookie": "abc123...",
  "profiles": [
    {
      "id": "aaaaaaaa-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
      "name": "Parent",
      "type": "Adult",
      ...
    }
  ]
}
============================================================
```

Copy the JSON output and paste it into your Home Assistant NRK TV integration configuration.

## Related

- [Home Assistant NRK TV Integration](https://github.com/filipferris/ha-nrk-tv) — the integration that uses these tokens

## License

MIT © 2026 Filip Ferris
