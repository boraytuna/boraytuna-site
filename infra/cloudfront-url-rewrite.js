// CloudFront Function (runtime: cloudfront-js-2.0), attached to the distribution's
// "Viewer request" event. It runs at the edge before CloudFront looks in the cache or S3.
//
// Why it's needed: S3 is a plain file store. `next build` writes /my-projects as the file
// `my-projects.html`, but visitors (and Google, and old links) request `/my-projects`.
// S3 has no file with that exact name, so without this function those URLs would 404.
//
// What it does:
//   1. www.boraytuna.com/...      -> 301 redirect to https://boraytuna.com/... (one canonical host)
//   2. /my-projects/  (trailing /) -> 301 redirect to /my-projects (URLs as on the old site)
//   3. /                          -> serve /index.html
//   4. /my-projects   (no ".ext") -> serve /my-projects.html (the URL in the browser doesn't change)
//   5. anything with an extension (/images/a.png, /_next/...js, /sitemap.xml) is served as-is.
//
// Keep this file free of `export`/`import`: CloudFront Functions are plain scripts.
// scripts/serve-out.mjs runs this exact code locally to test it.

var CANONICAL_HOST = "boraytuna.com";

function queryString(qs) {
  var parts = [];
  for (var key in qs) {
    var v = qs[key];
    if (v.multiValue) {
      for (var i = 0; i < v.multiValue.length; i++) parts.push(key + "=" + v.multiValue[i].value);
    } else {
      parts.push(v.value === "" ? key : key + "=" + v.value);
    }
  }
  return parts.length ? "?" + parts.join("&") : "";
}

function redirect(location) {
  return {
    statusCode: 301,
    statusDescription: "Moved Permanently",
    headers: { location: { value: location }, "cache-control": { value: "max-age=3600" } },
  };
}

function handler(event) {
  var request = event.request;
  var uri = request.uri;
  var host = request.headers.host ? request.headers.host.value : CANONICAL_HOST;

  if (host === "www." + CANONICAL_HOST) {
    return redirect("https://" + CANONICAL_HOST + uri + queryString(request.querystring));
  }

  if (uri.length > 1 && uri.charAt(uri.length - 1) === "/") {
    return redirect(uri.replace(/\/+$/, "") + queryString(request.querystring));
  }

  if (uri === "/") {
    request.uri = "/index.html";
  } else {
    var lastSegment = uri.substring(uri.lastIndexOf("/") + 1);
    if (lastSegment.indexOf(".") === -1) request.uri = uri + ".html";
  }
  return request;
}
