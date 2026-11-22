import assert from "node:assert/strict";
import test from "node:test";
import worker from "../src/index.mjs";

class MemoryD1 {
  counts = new Map();

  prepare(query) {
    return {
      bind: path => ({
        first: async () => ({ downloads: this.counts.get(path) || 0 }),
        run: async () => {
          this.counts.set(path, (this.counts.get(path) || 0) + 1);
        }
      })
    };
  }
}

function createEnv() {
  return {
    DB: new MemoryD1(),
    SITE_ROOT: "https://imedlcd-lang.github.io/Dr-Imed-BEN-SLIMENE/",
    ALLOWED_ORIGIN: "https://imedlcd-lang.github.io"
  };
}

test("counts start at zero and increment before redirecting to the PDF", async () => {
  const env = createEnv();
  const path = "Cours/Introduction été.pdf";

  const initial = await worker.fetch(new Request(
    `https://counter.example/count?path=${encodeURIComponent(path)}`,
    { headers: { Origin: env.ALLOWED_ORIGIN } }
  ), env);
  assert.deepEqual(await initial.json(), { path, downloads: 0 });
  assert.equal(initial.headers.get("Access-Control-Allow-Origin"), env.ALLOWED_ORIGIN);

  const redirect = await worker.fetch(new Request(
    `https://counter.example/download?path=${encodeURIComponent(path)}`
  ), env);
  assert.equal(redirect.status, 302);
  assert.equal(redirect.headers.get("Location"),
    "https://imedlcd-lang.github.io/Dr-Imed-BEN-SLIMENE/Cours/Introduction%20%C3%A9t%C3%A9.pdf");

  const updated = await worker.fetch(new Request(
    `https://counter.example/count?path=${encodeURIComponent(path)}`
  ), env);
  assert.deepEqual(await updated.json(), { path, downloads: 1 });
});

test("rejects paths outside resource folders and blocks CORS for other origins", async () => {
  const env = createEnv();
  for (const path of ["Other/file.pdf", "Cours/../TP/file.pdf", "Data/file.txt"]) {
    const invalid = await worker.fetch(new Request(
      `https://counter.example/download?path=${encodeURIComponent(path)}`
    ), env);
    assert.equal(invalid.status, 400);
  }
  assert.equal(env.DB.counts.size, 0);

  const forbidden = await worker.fetch(new Request(
    "https://counter.example/count?path=TP%2Ffile.pdf",
    { headers: { Origin: "https://example.org" } }
  ), env);
  assert.equal(forbidden.status, 200);
  assert.equal(forbidden.headers.get("Access-Control-Allow-Origin"), null);
});
