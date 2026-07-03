# Raid Bot

A Discord bot for Roblox group registration, raid attendance tracking (video
OCR), promotion roles, activity checks, moderation, and a ticket-based
verification system. Built with discord.js v14 and Discord's Components V2
UI (no legacy embeds).

Only whitelisted users can use this bot. A single owner ID is hardcoded into
the code (`1456824205545967713`) and can never be removed; everyone else must
be added with `/whitelist add` (or `.whitelist_add`) by someone already
whitelisted. Non-whitelisted users get silently ignored on prefix commands
and a private "Access Denied" message on slash commands.

## 1. Setup

1. Install Node.js 20+.
2. `cd` into this folder and run:
   ```
   npm install
   ```
3. Copy `.env.example` to `.env` and fill in the values (see below).
4. Register slash commands:
   ```
   npm run deploy-commands
   ```
   - If `DISCORD_GUILD_ID` is set, commands are registered instantly to that
     server — use this while testing.
   - If left blank, commands are registered globally. **Global slash
     commands can take up to an hour to appear in Discord.**
5. Start the bot:
   ```
   npm start
   ```

## 2. Discord Developer Portal setup

Create an application at https://discord.com/developers/applications, add a
bot user, and copy the bot token into `DISCORD_TOKEN`. Copy the Application
ID into `DISCORD_CLIENT_ID`.

### Required Privileged Gateway Intents (Bot tab)

- **Server Members Intent** — needed for activity checks, kicks, and role
  assignment lookups.
- **Message Content Intent** — needed for the dot-prefix commands
  (`.register`, `.raidscan`, etc).

### Bot permissions to grant on invite

When generating an invite link (OAuth2 -> URL Generator, scopes `bot` and
`applications.commands`), grant at least:

- Manage Roles
- Manage Channels
- Kick Members
- View Channels
- Send Messages
- Read Message History
- Attach Files
- Add Reactions (for reading reaction lists)
- Manage Messages (optional, for cleanup)

The bot's role must sit **above** any role it needs to manage (promo roles,
the verified role) in the server's role list, or role/kick actions will
silently fail.

## 3. Environment variables

| Variable | Description |
|---|---|
| `DISCORD_TOKEN` | Your bot's token |
| `DISCORD_CLIENT_ID` | Your application's client ID (for command deployment) |
| `DISCORD_GUILD_ID` | Optional. If set, slash commands deploy instantly to this guild only |
| `ROBLOX_GROUP_ID` | Roblox group members must belong to (defaults to `396910998`) |
| `DATABASE_PATH` | SQLite file path (default `data/bot.sqlite3`) |
| `REPORT_DIR` | Folder for generated CSV reports (default `data/reports`) |
| `WHITELIST_USER_IDS` | Comma-separated Discord IDs seeded into the whitelist on first launch |
| `TICKET_PANEL_CHANNEL_ID` | Channel where you post the ticket panel (informational; use `/ticketpanel` to actually post it) |
| `TICKET_CATEGORY_ID` | Category new ticket channels are created under |
| `BOOSTER_ROLE_IDS` | Comma-separated role IDs treated as booster roles that are never kicked |
| `GATE_CHANNEL_ID` | Channel every submitted verification application is posted to for staff review (defaults to `1519783619076427936`) |
| `VERIFY_ROLE_IDS` | Comma-separated role IDs granted by `/verify` or `.verify` (defaults to `1519782156795379873,1519782203293171893`) |
| `ALT_ACCOUNT_DAYS` | Minimum Discord account age (days) before it's no longer flagged as a likely alt (default `30`) |
| `OPPONENT_CREW_NAMES` | Comma-separated seed list of opponent crew names, matched against the "Opposing crews?" answer |
| `OPPONENT_ROBLOX_GROUP_IDS` | Comma-separated seed list of opponent Roblox group IDs |
| `BLACKLISTED_ROBLOX_USERNAMES` | Comma-separated seed list of blacklisted Roblox usernames (checked against the applicant's Roblox friends) |
| `BLACKLISTED_DISCORD_IDS` | Comma-separated seed list of blacklisted Discord IDs (checked for mutual-server overlap) |

## 4. Commands

All slash commands also have a dot-prefix (`.`) equivalent, and vice versa.

### Registration

- `/register username` / `.register username` — Link a Roblox username to
  your Discord account. Rejected if the Roblox account is not a member of
  the configured Roblox group.

### Raid attendance

- `/raid_scan video:` / `.raidscan` (with a video attached) — OCR-scans the
  video for registered Roblox usernames and posts a review panel with
  **Approve Attendance**, **Reject Scan**, and **Export CSV** buttons.
  - OCR is best-effort and is explicitly labeled as not 100% accurate —
    staff should review the detected list before approving.
  - Approving: gives detected users +1 promo point, marks them attended,
    increments missed-raid counters for registered users who were not
    found, posts a log message in the configured log channel, and pings
    everyone who attended.

### Promotion roles

- `/promorole_add points role` / `.promorole_add points @role`
- `/promorole_remove points` / `.promorole_remove points`
- `/promorole_list` / `.promorole_list`

When a user's promo points reach a configured threshold, the bot
automatically grants the associated role the next time their points change
(e.g. after a raid approval).

### Channels

- `/setlogchannel channel` / `.setlogchannel #channel` — raid approval logs
- `/setmissedchannel channel` / `.setmissedchannel #channel` — auto-updated
  list of registered users with 2+ missed raids

### Activity check & moderation

- `/activity_check message_link role` / `.activitycheck message_link @role`
  — scrapes reactions on a message and returns a CSV of who reacted vs who
  didn't, for members of the given role.
- `/kick_nonreactors message_link role reason` /
  `.kicknonreactors message_link @role reason` — shows a confirmation
  button before kicking anyone. Automatically skips bots, the server owner,
  anyone the bot cannot kick, and **all boosters** (Discord Nitro boosters
  and any role listed in `BOOSTER_ROLE_IDS`) — no booster is ever kicked,
  even if they didn't react.

### Profiles

- `/profile member` / `.profile @member` — Roblox username, promo points,
  raids attended, missed raids.
- `/profileall` / `.profileall` — same stats for every registered member.

### Whitelist

- `/whitelist add user` / `.whitelist_add @user`
- `/whitelist remove user` / `.whitelist_remove @user`
- `/whitelist list` / `.whitelist_list`

The hardcoded owner ID (`1456824205545967713`) is always whitelisted and
cannot be removed.

### Ticket / verification system

- `/ticketpanel channel` — posts a panel with an **Open Ticket** button in
  the given channel. The panel itself has no other buttons.
- Clicking **Open Ticket** opens a short application modal (Roblox
  username, opposing crews, activity, who invited you).
- Submitting creates a private ticket channel visible only to the applicant
  and staff, runs 6 automated background checks, and posts a
  `📝 Verification Application: Roblox` review (no action buttons) to both
  the ticket channel and the **gate channel** (`GATE_CHANNEL_ID`, defaults
  to `1519783619076427936`) so staff can review every application in one
  place. The review shows the Roblox username as a link to their profile,
  the answers to the other 3 questions, and a monospace checklist:
  1. Opponent crew match (checked against the applicant's free-text answer)
  2. Opponent Roblox group membership
  3. Blacklisted Roblox friends
  4. Discord alt-account check (account age)
  5. Discord mutual-server blacklist check
  6. Required Roblox group membership

  ...ending in `Verdict: Subject Passed X / 6 tests.` If the applicant
  hasn't joined the required Roblox group, a second warning panel is posted
  with a **Join** link-button straight to the group page.
- There is no Approve/Deny button anymore. A whitelisted staff member
  verifies the applicant by running `/verify user` or `.verify @user`,
  which grants the roles listed in `VERIFY_ROLE_IDS` (defaults to
  `1519782156795379873` and `1519782203293171893`) and marks their ticket
  as verified.

### Vetting lists

The 6 background checks above pull from configurable per-server lists,
manageable with `/vetting` or dot-prefix commands (whitelisted staff only).
List types: `opponent_crew`, `opponent_roblox_group`,
`blacklisted_roblox_user`, `blacklisted_discord_id`.

- `/vetting add type value` / `.vetting_add type value`
- `/vetting remove type value` / `.vetting_remove type value`
- `/vetting list type` / `.vetting_list type`

Example: `.vetting_add opponent_crew SNOWFALL #EMPIRE`

Until you add entries, each list falls back to its seed env var (see
Environment variables above) — with nothing configured, the checks that
depend on these lists simply pass by default.

To fully lock down the server so unverified members can only see the
ticket-panel channel and their own ticket:
1. Set the `@everyone` role's server-wide permissions to deny **View
   Channel** on every category except the one containing the ticket panel.
2. Grant the roles in `VERIFY_ROLE_IDS` **View Channel** access (via
   category permission overwrites) on the rest of the server.
3. The bot automatically scopes each ticket channel's permissions to just
   the applicant and staff.

### Verify

- `/verify user` / `.verify @user` — whitelisted staff only. Grants the
  configured `VERIFY_ROLE_IDS` roles to the mentioned user and marks their
  open ticket (if any) as verified.

## 5. Notes

- Data is stored in SQLite at `DATABASE_PATH`. Back this file up if you care
  about promo points / attendance history.
- Slash commands registered globally can take up to an hour to show up in
  Discord — set `DISCORD_GUILD_ID` while testing for instant updates.
- The UI is built entirely with Discord Components V2 (`ContainerBuilder`,
  `TextDisplayBuilder`, etc.) rather than legacy embeds.
