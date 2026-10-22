#!/usr/bin/env node
// Serves ./out locally the way S3 + CloudFront will: every request first goes through the real
// CloudFront Function code in infra/cloudfront-url-rewrite.js, and missing files get 404.html.
//
//   npm run build && npm run serve   ->   http://localhost:4173

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'out');
const PORT = Number(process.env.PORT || 4173);

const ctx = {};
vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'infra/cloudfront-url-rewrite.js'), 'utf8'), ctx);

const TYPES = {
	'.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
	'.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml', '.png': 'image/png', '.jpg': 'image/jpeg',
	'.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
	'.pdf': 'application/pdf', '.woff2': 'font/woff2',
};

http
	.createServer((req, res) => {
		const url = new URL(req.url, `http://${req.headers.host}`);
		const querystring = {};
		for (const [k, v] of url.searchParams) querystring[k] = { value: v };
		const result = ctx.handler({
			request: { uri: decodeURIComponent(url.pathname), querystring, headers: { host: { value: process.env.HOST_HEADER || 'boraytuna.com' } } },
		});
		if (result.statusCode) {
			res.writeHead(result.statusCode, { location: result.headers.location.value });
			return res.end();
		}
		let file = path.join(OUT, result.uri);
		let status = 200;
		if (!file.startsWith(OUT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
			file = path.join(OUT, '404.html');
			status = 404;
		}
		res.writeHead(status, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
		fs.createReadStream(file).pipe(res);
	})
	.listen(PORT, () => console.log(`Serving ./out like CloudFront on http://localhost:${PORT}`));
