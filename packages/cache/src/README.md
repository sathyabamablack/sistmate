# @usp/cache

A tiny two-tier local cache (in-memory `Map` + JSON files on disk) so the UI
stays fast and the upstream portal isn't hammered. The file tier means cached
data survives dev-server restarts.

## Usage

```ts
import { createCache } from "@usp/cache";

const cache = createCache({ namespace: "students" });

// Primary API: return cached if fresh, otherwise fetch + store.
const profile = await cache.wrap("profile:123", 60_000, () =>
  fetchStudentProfile("123"),
);

// Lower-level API.
await cache.set("ping", "pong", 5_000);
const v = await cache.get<string>("ping"); // "pong" | undefined

await cache.invalidate("profile:123"); // one key
await cache.invalidate(); // whole namespace
```

## Behavior

- Each entry is stored as `{ value, expiresAt }`. `get`/`wrap` return a value
  only when it is present and not expired.
- Keys are hashed (SHA-256, namespaced) into safe filenames, so any string key
  is allowed.
- The cache path never throws: missing files, unreadable files, malformed JSON
  and failed writes (read-only filesystem) are all handled. A failed write is
  logged once and the value stays in memory.
- **Stale-while-error.** If `fn` throws and an expired entry (younger than
  `maxStaleMs`) exists, `wrap` returns it and calls `opts.onStale({ value, storedAt, error })`.
  Pass `serveStaleOn: (err) => boolean` to refuse for some errors (for example an expired session).
- **In-flight de-duplication.** Concurrent `wrap` calls for one key share one `fn` call.
- **Negative cache.** After a failure with nothing to serve, the same error is re-thrown
  for `negativeTtlMs` (30 s) without calling `fn`. `invalidate` and `expire` clear it.
- `expire(key?)` marks entries expired but keeps them as the stale fallback (use it for
  "Refresh"); `invalidate` deletes them (use it for sign-out).
- Expired files are pruned from disk opportunistically (at most every 10 min) and the
  in-memory map is capped.
- Per instance only. On serverless hosts every warm instance has its own memory and temp dir.

## Options

| Option             | Default                       | Description                                    |
| ------------------ | ----------------------------- | ---------------------------------------------- |
| `dir`              | `<cwd>/data/cache` (gitignored) | Directory for persisted JSON files.          |
| `namespace`        | `"default"`                   | Isolates keys on disk and in memory.           |
| `maxStaleMs`       | 12 h                          | How long expired entries stay usable on error. |
| `negativeTtlMs`    | 30 s (`0` disables)           | How long a failure is remembered.              |
| `maxMemoryEntries` | 200                           | In-memory cap (oldest dropped).                |

No runtime dependencies. Node built-ins only (`node:crypto`, `node:fs`, `node:path`).
