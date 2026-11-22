const RESOURCE_FOLDERS = new Set([
  "Cours",
  "Data",
  "Matériels pédagogiques",
  "Notions de Base",
  "TD",
  "TP"
]);

function responseHeaders(request, env, extra = {}) {
  const headers = new Headers(extra);
  headers.set("Vary", "Origin");
  if (request.headers.get("Origin") === env.ALLOWED_ORIGIN) {
    headers.set("Access-Control-Allow-Origin", env.ALLOWED_ORIGIN);
  }
  return headers;
}

function jsonResponse(request, env, data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: responseHeaders(request, env, {
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8"
    })
  });
}

function resourcePath(value) {
  if (typeof value !== "string" || value.includes("\\") || /[\u0000-\u001f\u007f]/.test(value)) {
    return null;
  }
  const segments = value.split("/");
  if (segments.length < 2 || !RESOURCE_FOLDERS.has(segments[0])
    || segments.some(segment => !segment || segment === "." || segment === "..")
    || !segments[segments.length - 1].toLowerCase().endsWith(".pdf")) {
    return null;
  }
  return value;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin");

    if (request.method === "OPTIONS") {
      if (origin && origin !== env.ALLOWED_ORIGIN) {
        return new Response(null, { status: 403, headers: responseHeaders(request, env) });
      }
      return new Response(null, {
        status: 204,
        headers: responseHeaders(request, env, {
          "Access-Control-Allow-Methods": "GET, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
          "Access-Control-Max-Age": "86400"
        })
      });
    }
    if (request.method !== "GET") {
      return jsonResponse(request, env, { error: "Method not allowed." }, 405);
    }

    const path = resourcePath(url.searchParams.get("path"));
    if (!path) {
      return jsonResponse(request, env, { error: "A valid PDF path in a teaching-resource folder is required." }, 400);
    }

    if (url.pathname === "/count") {
      const row = await env.DB.prepare(
        "SELECT downloads FROM download_counts WHERE path = ?1"
      ).bind(path).first();
      return jsonResponse(request, env, { path, downloads: row ? row.downloads : 0 });
    }

    if (url.pathname === "/download") {
      const siteRoot = new URL(env.SITE_ROOT);
      if (siteRoot.protocol !== "https:" || !siteRoot.pathname.endsWith("/")
        || siteRoot.search || siteRoot.hash) {
        return jsonResponse(request, env, { error: "The configured PDF site root is invalid." }, 500);
      }

      await env.DB.prepare(
        "INSERT INTO download_counts (path, downloads) VALUES (?1, 1) " +
        "ON CONFLICT(path) DO UPDATE SET downloads = downloads + 1"
      ).bind(path).run();

      const target = new URL(path.split("/").map(encodeURIComponent).join("/"), siteRoot);
      return new Response(null, {
        status: 302,
        headers: responseHeaders(request, env, {
          "Cache-Control": "no-store",
          "Location": target.toString()
        })
      });
    }

    return jsonResponse(request, env, { error: "Not found." }, 404);
  }
};
