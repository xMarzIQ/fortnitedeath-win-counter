# Loss streak overlay

A small Fortnite-style overlay for stream:

- **Loss streak** box (skull, label, number) is always on screen.
- **Win box** (gold llama crown and number) stays hidden until your first win.
- A win resets the loss streak to 0 and adds 1 win.

It has two pages:

| Page | What it is |
|------|------------|
| `/overlay` | The overlay. Add this as a Browser source in OBS. |
| `/control` | Your buttons: Loss, Win, plus fixes for accidental presses. Use it on your phone. |

## Using the control page

- **Loss** adds 1 to the streak. **Win** resets the streak to 0 and adds 1 win.
- **Remove a loss** takes 1 off the streak.
- **Remove a win** takes 1 off the win count (it does not touch the streak).
- **Undo last press** puts both numbers back exactly as they were. Use this if you hit Win by mistake, because a win clears the streak and Undo brings it back.
- **Fix the numbers** lets you type the exact streak and win count.
- Keyboard shortcuts (when the control page is focused): `L` loss, `W` win, `U` undo.

## Overlay link options

Build the link on the control page (bottom section) and copy it, or add these to the end of `/overlay` yourself:

| Option | Values | Default |
|--------|--------|---------|
| `pos` | `tl`, `tr`, `bl`, `br` (screen corner) | `tl` |
| `win` | `left` or `right` (win box lines up under the streak box) | `left` |
| `scale` | `0.5` to `4` | `1` |

Example: `https://your-site.onrender.com/overlay?pos=tr&win=right&scale=1.25`

## Put it online with Render

Your OBS has to reach the overlay over the internet, so host it somewhere public. Render works:

1. Put this folder in a GitHub repo.
2. In Render: **New > Web Service**, pick the repo.
3. Runtime: **Node**. Build command: leave blank. Start command: `npm start`.
4. Add an environment variable `CONTROL_KEY` with a password only you know. Without it, anyone with your control link could change the counters.
5. Deploy, then open `https://your-site.onrender.com/control`. The first time you press a button it asks for the key, then remembers it on that device.
6. In OBS, add a **Browser source** with the overlay link. Set width and height to your canvas size (for example 1920 by 1080). The background is transparent already, so leave the custom CSS box alone.

### Keeping your numbers

The numbers are saved to a file. On Render's free plan that file is wiped whenever the service restarts or redeploys, and free services go to sleep when idle, so your counts can reset to 0.

To keep them, add a Render **Disk** (paid), mount it at `/var/data`, and set the environment variable `STATE_FILE` to `/var/data/state.json`. If they do reset, use **Fix the numbers** to type them back in.

Free services also take a while to wake up, so open the control page a minute before you go live.

## Run it on your own computer

```
CONTROL_KEY=yourkey node server.js
```

Then open `http://localhost:3000/control`. Needs Node 18 or newer, and nothing to install.
