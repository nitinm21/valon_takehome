---
description: List the decks in the Valon Slides library (id, customer, last updated).
---

1. Base URL: `$VALON_SLIDES_URL` if set, else `http://localhost:3000`. If
   `curl -s <base>/api/decks` fails, tell the user to run `npm run dev` in the
   app repo and stop.
2. `GET <base>/api/decks` and print a compact table: title, customer (if any),
   slide count, updated (relative time), and the editor URL
   `<base>/editor/<id>` for each deck, newest first.
