# ACF Krillion: Puffer Party

A turn-based party trivia game for up to 6 teams. A host screen shows the game on a big display, and players join from their phones with a 4-letter room code. Take turns naming answers to a "Name a..." question. If you can't think of one in time, you lose a heart.

No dependencies and nothing to install except Node.js.

## Quick start

1. Install [Node.js](https://nodejs.org) (any recent version).
2. Open a terminal in the project folder (the one containing `server.js`) and run:

   ```
   node server.js
   ```

3. The terminal prints something like:

   ```
   Host screen:  http://localhost/host
   Teams join:   http://192.168.0.101
   ```

4. On the computer connected to the big screen, open the **Host screen** address.
5. Players open the **Teams join** address on their phones, enter the 4-letter room code shown on the host screen, pick a team name, and tap **Dive in**.
6. When everyone has joined, click **Start the party** on the host screen.

The game runs on port 80 so the join link is short. If port 80 is busy or not allowed, it falls back to port 3000 and the addresses will end in `:3000`. You can pick your own port:

```
PORT=8080 node server.js                 # macOS / Linux
$env:PORT=8080; node server.js           # Windows PowerShell
```

Stop the game with `Ctrl+C` in the terminal.

## Who can join

**Everyone on the same wifi or network.** Use the `Teams join` address from the terminal (it starts with `192.168.` or `10.`). It only works for devices on the same network as the computer running the game. Some campus and public wifi networks block devices from talking to each other. If phones can't connect, use a phone hotspot or the tunnel below.

**Players on different networks (or mobile data).** Use a Cloudflare quick tunnel to get a public link, with no router setup:

1. Install cloudflared once. On Windows: `winget install --id Cloudflare.cloudflared`, then reopen the terminal.
2. With the game running, open a second terminal and run (use 3000 if the game started on 3000):

   ```
   cloudflared tunnel --url http://localhost:80
   ```

3. It prints a link like `https://random-words.trycloudflare.com`. This changes every time you start the tunnel.
4. On the host computer, open `https://random-words.trycloudflare.com/host`. The host screen then shows that address as the join link.
5. Players open `https://random-words.trycloudflare.com` (no `/host`) and join as usual.

Keep both terminals open during the game, and close the tunnel with `Ctrl+C` when you're done. There's no login, so anyone with the link can create their own room. Don't post it publicly. Through a tunnel, screens may take a second or two to load at first and then update about every 0.7 seconds.

## How the game works

- Teams take turns in the order they joined. On your turn, type an answer that's on the list and that hasn't been used yet. Small typos are forgiven on longer answers.
- You have 15 seconds per turn. Run out of time and you lose a heart. Everyone starts with 2 hearts. A wrong or already-used answer just lets you try again.
- Each answer is worth points by rarity: Plankton 10, Schooler 25, Rare 50, Deep Cut 75, One in a Krillion 100.
- A question ends when:
  - all the answers have been found (no one loses anything),
  - two hearts have been lost on that question (by anyone), or
  - a heart is lost after more than half of the answers have been used.
- After a question ends, a 10-second countdown runs and the next question starts automatically. The host can click **Skip wait** to go early, or **Skip question** to end a question.
- Players with no hearts left are out but can keep watching.
- On the last question, scores are hidden. The final screen reveals the places one at a time (3rd, then 2nd, then 1st). **Highest score wins.** If only one player has hearts left, the game ends early.

Reconnecting: if a phone locks or the page refreshes, join again with the same team name and you'll slot back into your seat.

## Customizing

**Settings** are at the top of `server.js`:

```js
const MAX_TEAMS = 6, TURN_SECONDS = 15, START_LIVES = 2, BREAK_SECONDS = 10, MAX_STRIKES = 2;
```

| Setting | Meaning |
| --- | --- |
| `MAX_TEAMS` | Seats in the room (the arena is drawn for 6, so keep it at 6 or below) |
| `TURN_SECONDS` | Seconds each player has on their turn |
| `START_LIVES` | Hearts each player starts with |
| `BREAK_SECONDS` | Countdown between questions |
| `MAX_STRIKES` | Hearts lost in one question that end that question |

The pause between final-screen reveals is `FINAL_STEP_MS` in `public/puffer.js` (4000 = 4 seconds).

**Questions** are in `questions.json`. It's re-read each time you open a new host screen, so you can edit it and just reload the host page without restarting the server.

```json
{
  "tiers": {
    "plankton": { "label": "Plankton", "points": 10 },
    "rare": { "label": "Rare", "points": 50 }
  },
  "questions": [
    {
      "prompt": "Name a book of the Bible",
      "answers": [
        { "text": "John", "tier": "plankton" },
        { "text": "Psalms", "aliases": ["Psalm"], "tier": "rare" }
      ]
    }
  ]
}
```

- `tier` must be one of the names in `tiers`. Rarer answers should go in higher tiers.
- `aliases` are other accepted spellings or names.
- Give each question plenty of answers. With 6 players, a list of 5 or 6 runs out quickly.

## Troubleshooting

- **Players can't open the join link:** they're probably on a different network from the host computer, or the wifi blocks device-to-device traffic. Use a phone hotspot or the tunnel above. On Windows, allow Node.js through the firewall for private networks if prompted.
- **"Port 80" errors or the link ends in `:3000`:** that's normal. Another program is using port 80, so the game switched to 3000.
- **Host screen stuck on "Starting…":** check the terminal for errors. A mistake in `questions.json` shows up as "questions.json is invalid".
- **A new player can't join:** a game that has already started only accepts players already in the room (rejoining by the same team name).

## Project layout

```
server.js         game server (rooms, turns, scoring)
questions.json    questions, answers and rarity tiers
public/host.html  big-screen host view
public/play.html  phone view for players
public/puffer.js  shared pufferfish, arena and screens
public/style.css  styling
```
