# tracemogged bot

Discord bot for Roblox raid tracking, attendance, verification tickets, and promotion roles.

---

## Railway deployment (recommended)

### 1 — Create a Railway project

1. Push this repo to GitHub (or upload as a zip service).
2. In Railway → **New Project** → **Deploy from GitHub repo** (or **Deploy from template**).
3. Railway will detect the `Dockerfile` and use it automatically.

### 2 — Set environment variables

In your Railway service → **Variables**, add at minimum:

| Variable | Description |
|---|---|
| `DISCORD_TOKEN` | Bot token from Discord Developer Portal |
| `DISCORD_CLIENT_ID` | Application/client ID |

See `.env.example` for the full list of optional variables.

### 3 — Add a persistent volume (important!)

The bot stores all data in a SQLite file at `/data/bot.sqlite3`.  
Railway containers are **ephemeral** — without a volume, every redeploy wipes your database.

1. Railway service → **Volumes** → **Add Volume**
2. Mount path: `/data`
3. Save and redeploy.

That's it. Your raids, users, settings, and whitelist will survive restarts and redeploys.

### 4 — Deploy

Click **Deploy** (or push to your connected branch). Railway builds the Docker image and starts the bot.  
Slash commands are registered globally on every startup — they may take up to an hour to appear in Discord the first time.

---

## Local development

```bash
cp .env.example .env
# fill in DISCORD_TOKEN and DISCORD_CLIENT_ID in .env

npm install
npm run dev
```

SQLite database is stored at `data/bot.sqlite3` (relative path) locally.

---

## Commands

### Prefix commands (`.`)

| Command | Description |
|---|---|
| `.register (username)` | Link your Roblox account |
| `.raidscan` + video attachment | Scan a raid video via OCR |
| `.raid_groupscan (group_id)` | Scan a Roblox group's member list |
| `.raid_manual` | Manually enter attendee/absent lists |
| `.raid_start (#channel)` | Start a live raid tracking session |
| `.raidstats` | Show server raid statistics |
| `.raidhistory` | Show last 10 raid scans |
| `.adjustpoints (@user) (amount)` | Add or remove promo points |
| `.setkickthreshold (n)` | Set missed-raid kick threshold |
| `.setpointvalue (n)` | Set promo points awarded per raid |
| `.flagged_player_logs` | Show members at or above kick threshold |
| `.enforcement_logs` | Show recent auto enforcement history |
| `.setflaggedlogschannel (#channel)` | Set enforcement notification channel |
| `.loa (@user) (reason)` | Put a member on LOA |
| `.loa_end (@user)` | End a member's LOA |
| `.check_loa` | List all active LOAs |
| `.promorole_add (points) (@role)` | Add a promotion role threshold |
| `.promorole_remove (points)` | Remove a promotion role threshold |
| `.promorole_list` | List all promotion roles |
| `.setlogchannel (#channel)` | Set raid approval log channel |
| `.setmissedchannel (#channel)` | Set missed-raids display channel |
| `.setgatechannel (#channel)` | Set verification gate channel |
| `.settranscriptchannel (#channel)` | Set ticket transcript channel |
| `.activitycheck (msg_link) (@role)` | Check who reacted to a message |
| `.kicknonreactors (msg_link) (@role) (reason)` | Kick members who didn't react |
| `.verify (@user)` | Verify a member and grant roles |
| `.lookup (username)` | Look up a Roblox user |
| `.whitelist_add (@user)` | Add a staff member to whitelist |
| `.whitelist_remove (@user)` | Remove from whitelist |
| `.whitelist_list` | List all whitelisted users |
| `.vetting_add (type) (value)` | Add a vetting list entry |
| `.vetting_remove (type) (value)` | Remove a vetting list entry |
| `.vetting_list (type)` | List vetting entries by type |
| `.profile [@user]` | Show a member's raid profile |
| `.closeticket` | Close and delete a ticket channel |

All commands above (except `.register` and `.profile`) require whitelist.

### Slash commands

All prefix commands also have slash command equivalents (`/register`, `/raidstats`, etc.) registered globally on startup.

---

## Required bot permissions

- Read Messages / View Channels  
- Send Messages  
- Manage Channels (for ticket creation/deletion)  
- Manage Roles (for promotion roles and verification)  
- Kick Members (for kick-nonreactors)  
- Read Message History  
- Attach Files  
- Use External Emojis  
- Add Reactions  

Enable **Server Members Intent**, **Message Content Intent**, and **Presence Intent** in the Discord Developer Portal under your bot's settings.
