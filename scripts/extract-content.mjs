#!/usr/bin/env node
// Phase 1 content extraction for the boraytuna.com migration.
//
// Two sources:
//   1. The Hostinger Horizons export in ./hostinger-export (read-only, never written to).
//   2. The live site (older Zyro/Astro build). Every live page embeds the builder's own JSON
//      (pages, blocks, elements) in <astro-island props="...">, so we read that structured data
//      instead of scraping rendered HTML. The live site is the source of truth for content.
//
// Outputs:
//   content/blog/*.md, content/pages/*.md   Markdown with frontmatter
//   public/images/*, public/files/*         downloaded images and PDFs
//   migration/manifest.json                 every URL -> local path/status (used by later phases)
//   migration/embeds/*.html                 raw custom-code embeds (not converted)
//   migration/phase1-report.md              the human-readable report
//
// Re-runnable: assets already recorded in the manifest and present on disk are not re-downloaded.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as cheerio from 'cheerio';
import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';
import YAML from 'yaml';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://boraytuna.com';
const SITE_HOSTS = new Set(['boraytuna.com', 'www.boraytuna.com']);
const UA = 'boraytuna-migration/1.0 (site owner content export)';
const CONCURRENCY = 4;

// Builder store/booking placeholders, approved by the site owner for exclusion. Nothing else is auto-excluded.
const HARD_EXCLUDE = new Set([
	'group-fitness-class', 'creative-course-session', 'individual-coaching-session',
	'intro-language-tutoring-session', 'wooden-chair', 'set-of-plates', 'classic-cap',
	'hand-soap', 'face-serum', 'handmade-vase', 'sunglasses', 'wool-sweater',
]);
const CORE_PAGES = {
	'/': 'Home',
	'/my-projects': 'Projects',
	'/blog-list-software-developer': 'Blog',
	'/boray-tuna-goren-about-me': 'About Me',
	'/contact': 'Contact',
};

const OUT = {
	blog: path.join(ROOT, 'content/blog'),
	pages: path.join(ROOT, 'content/pages'),
	images: path.join(ROOT, 'public/images'),
	files: path.join(ROOT, 'public/files'),
	migration: path.join(ROOT, 'migration'),
	embeds: path.join(ROOT, 'migration/embeds'),
};
const MANIFEST_PATH = path.join(OUT.migration, 'manifest.json');
const REPORT_PATH = path.join(OUT.migration, 'phase1-report.md');

const exportRootParent = path.join(ROOT, 'hostinger-export');
const exportDirName = fs.readdirSync(exportRootParent).find((d) => d.startsWith('horizons-export-'));
if (!exportDirName) throw new Error('No horizons-export-* folder found in ./hostinger-export');
const EXPORT_WEB = path.join(exportRootParent, exportDirName, 'apps/web');
const EXPORT_PAGES = path.join(EXPORT_WEB, 'src/pages/builder');

const log = (...a) => console.log('[extract]', ...a);

// ---------- small helpers ----------

const sha1 = (s) => crypto.createHash('sha1').update(s).digest('hex');
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

function normPath(p) {
	let x = p.split('#')[0].split('?')[0];
	if (!x.startsWith('/')) x = '/' + x;
	if (x.length > 1) x = x.replace(/\/+$/, '');
	return x || '/';
}

function slugOf(p) {
	return p === '/' ? 'home' : p.replace(/^\//, '');
}

function isSiteUrl(u) {
	try {
		return SITE_HOSTS.has(new URL(u, SITE).host);
	} catch {
		return false;
	}
}

function htmlDecode(s) {
	return s
		.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
}

function textOf(html) {
	return htmlDecode(String(html).replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/g, ' ').replace(/<[^>]+>/g, ' '))
		.replace(/\s+/g, ' ')
		.trim();
}

function sanitizeName(name) {
	let n = name;
	try {
		n = decodeURIComponent(n);
	} catch {}
	return n.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'file';
}

const EXT_BY_TYPE = {
	'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif',
	'image/svg+xml': '.svg', 'image/avif': '.avif', 'application/pdf': '.pdf',
};

async function pool(items, n, fn) {
	const results = new Array(items.length);
	let i = 0;
	await Promise.all(
		Array.from({ length: Math.min(n, items.length) }, async () => {
			while (i < items.length) {
				const idx = i++;
				results[idx] = await fn(items[idx], idx);
			}
		}),
	);
	return results;
}

async function fetchWithRetry(url, { retries = 2, binary = false } = {}) {
	let lastErr;
	for (let attempt = 0; attempt <= retries; attempt++) {
		try {
			const res = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow', signal: AbortSignal.timeout(30000) });
			const body = binary ? Buffer.from(await res.arrayBuffer()) : await res.text();
			if (res.status >= 500 && attempt < retries) {
				lastErr = new Error(`HTTP ${res.status}`);
				continue;
			}
			return { status: res.status, url: res.url, type: (res.headers.get('content-type') || '').split(';')[0].trim(), body };
		} catch (e) {
			lastErr = e;
			await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
		}
	}
	return { status: 0, error: String(lastErr?.message || lastErr), type: '', body: binary ? Buffer.alloc(0) : '' };
}

// ---------- URL classification ----------

function classifyUrl(u) {
	let url;
	try {
		url = new URL(u);
	} catch {
		return 'invalid';
	}
	const h = url.host;
	const p = url.pathname.toLowerCase();
	if (h === 'www.w3.org' || h === 'schema.org') return 'namespace';
	if (h === 'i.ytimg.com') return 'video-thumbnail';
	if (/(^|\.)youtube\.com$|^youtu\.be$|youtube-nocookie\.com$/.test(h)) return p.startsWith('/embed') ? 'video' : 'external';
	if (h === 'cdn.zyrosite.com' && p.includes('google-fonts')) return 'font';
	if (h.endsWith('commoninja.com')) return 'widget';
	if (p.endsWith('.pdf')) return 'file';
	if (/\.(png|jpe?g|webp|gif|svg|avif)$/.test(p) || h === 'images.unsplash.com' || h === 'horizons-cdn.hostinger.com' || p.includes('/cdn-cgi/image/')) return 'image';
	if (SITE_HOSTS.has(h)) return 'internal';
	return 'external';
}

// ---------- asset registry (images + files) ----------

// key -> { key, kind, stock, foundUrls:Set, candidates:[], pages:Set, sources:Set, alt }
const assets = new Map();

function assetKeyAndCandidates(rawUrl) {
	const u = new URL(rawUrl.replace(/&amp;/g, '&'), SITE);
	const href = u.href;
	if (u.host === 'images.unsplash.com') {
		const id = u.pathname.replace(/^\//, '');
		const base = `https://images.unsplash.com/${id}`;
		return { key: `unsplash:${id}`, stock: true, candidates: [`${base}?auto=format&fit=crop&w=1920&q=80`], nameHint: `unsplash-${id}` };
	}
	if (u.host === 'horizons-cdn.hostinger.com') {
		const original = `${u.origin}${u.pathname}`;
		return { key: original, candidates: [original, href], nameHint: path.basename(u.pathname), cdnId: u.pathname.split('/')[1]?.slice(0, 8) };
	}
	const m = u.pathname.match(/^\/cdn-cgi\/image\/[^/]+\/(.+)$/);
	if (m) {
		const rest = m[1];
		const original = `https://assets.zyrosite.com/${rest}`;
		const sameHost = `${u.origin}/${rest}`;
		const cands = [original];
		if (sameHost !== original) cands.push(sameHost);
		cands.push(href);
		return { key: original, candidates: cands, nameHint: path.basename(rest), cdnId: rest.split('/')[0] };
	}
	if (u.host === 'assets.zyrosite.com') {
		const original = `${u.origin}${u.pathname}`;
		return { key: original, candidates: [original], nameHint: path.basename(u.pathname), cdnId: u.pathname.split('/')[1] };
	}
	const plain = `${u.origin}${u.pathname}`;
	return { key: plain, candidates: u.search ? [href, plain] : [plain], nameHint: path.basename(u.pathname) };
}

function registerAsset(rawUrl, { kind, page, source, alt }) {
	let info;
	try {
		info = assetKeyAndCandidates(rawUrl);
	} catch {
		return null;
	}
	let a = assets.get(info.key);
	if (!a) {
		a = { ...info, kind, stock: !!info.stock, foundUrls: new Set(), pages: new Set(), sources: new Set(), alts: new Set() };
		assets.set(info.key, a);
	}
	a.foundUrls.add(rawUrl);
	if (page) a.pages.add(page);
	if (source) a.sources.add(source);
	if (alt) a.alts.add(alt);
	return a;
}

// Zyro stores images as { path, origin } relative to the site's asset bucket.
let SITE_ID = 'm7VMWeEqB9cq0aoR';
function zyroImageUrl(p, origin) {
	if (!p) return null;
	if (/^https?:\/\//.test(p)) return p;
	if (origin === 'unsplash') return `https://images.unsplash.com/${p}`;
	if (origin === 'assets') return `https://assets.zyrosite.com/${SITE_ID}/${p}`;
	return null;
}

// ---------- links registry ----------

const externalLinks = new Map(); // url -> { pages:Set, sources:Set, kind }
function registerLink(url, page, source, kind = 'external') {
	let e = externalLinks.get(url);
	if (!e) externalLinks.set(url, (e = { pages: new Set(), sources: new Set(), kind }));
	e.pages.add(page);
	e.sources.add(source);
}

const embeds = []; // { page, id, kind, src, file }
const videos = new Map(); // youtube id -> { pages:Set, sources:Set, src }
function registerVideo(src, page, source) {
	const m = src.match(/(?:embed\/|v=|youtu\.be\/)([A-Za-z0-9_-]{6,})/);
	const id = m ? m[1] : src;
	let v = videos.get(id);
	if (!v) videos.set(id, (v = { pages: new Set(), sources: new Set(), src }));
	v.pages.add(page);
	v.sources.add(source);
	return id;
}

// =====================================================================
// 1. EXPORT SCAN
// =====================================================================

function walkFiles(dir, out = []) {
	for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
		if (d.name === 'node_modules' || d.name.startsWith('.')) continue;
		const full = path.join(dir, d.name);
		if (d.isDirectory()) walkFiles(full, out);
		else if (/\.(jsx?|mjs|css|html|json)$/.test(d.name)) out.push(full);
	}
	return out;
}

const URL_RE = /https?:\/\/[^\s"'`<>()\\]+/g;

async function scanExport() {
	log('scanning export:', path.relative(ROOT, EXPORT_WEB));
	const files = [path.join(EXPORT_WEB, 'index.html'), ...walkFiles(path.join(EXPORT_WEB, 'src'))].filter((f) => fs.existsSync(f));
	const urlHits = new Map(); // url -> Set(files)
	for (const f of files) {
		const src = fs.readFileSync(f, 'utf8');
		for (const m of src.matchAll(URL_RE)) {
			const u = m[0].replace(/[.,;]+$/, '');
			if (!urlHits.has(u)) urlHits.set(u, new Set());
			urlHits.get(u).add(path.relative(EXPORT_WEB, f));
		}
	}

	const routes = JSON.parse(fs.readFileSync(path.join(EXPORT_PAGES, 'routes.json'), 'utf8'));
	const blogData = (await import(pathToFileURL(path.join(EXPORT_PAGES, 'shared/blogData.js')).href)).default;
	const postsBySlug = new Map(Object.values(blogData.posts).map((p) => [normPath(p.slug), p]));

	const pages = new Map(); // path -> { path, pageType, dir, texts:[], buttons:[], images:[], videos:[], meta }
	for (const r of routes) {
		const p = normPath(r.path);
		const dir = path.dirname(path.join(EXPORT_WEB, 'src', r.importPath.replace(/^@\//, '')));
		const sectionFiles = fs.existsSync(dir)
			? fs.readdirSync(dir).filter((f) => /^Section\d+\.jsx$/.test(f)).sort((a, b) => parseInt(a.slice(7)) - parseInt(b.slice(7)))
			: [];
		const page = { path: p, pageType: r.pageType, dir: path.relative(EXPORT_WEB, dir), texts: [], buttons: [], images: [], videos: [], links: [] };
		for (const sf of sectionFiles) {
			const src = fs.readFileSync(path.join(dir, sf), 'utf8');
			for (const m of src.matchAll(/content=\{("(?:[^"\\]|\\.)*")\}/g)) {
				const c = JSON.parse(m[1]);
				if (!/<script|<style/i.test(c)) page.texts.push(c);
			}
			for (const m of src.matchAll(/<GridButton[\s\S]*?text=\{("(?:[^"\\]|\\.)*")\}[\s\S]*?href=\{("(?:[^"\\]|\\.)*")\}/g)) {
				page.buttons.push({ text: JSON.parse(m[1]), href: JSON.parse(m[2]) });
			}
			for (const m of src.matchAll(/<GridImage[\s\S]*?src=\{("(?:[^"\\]|\\.)*")\}[\s\S]*?alt=\{("(?:[^"\\]|\\.)*")\}/g)) {
				page.images.push({ src: JSON.parse(m[1]), alt: JSON.parse(m[2]) });
			}
			for (const m of src.matchAll(URL_RE)) {
				const u = m[0];
				const k = classifyUrl(u);
				if (k === 'video') page.videos.push(u);
				else if (k === 'external' || k === 'internal' || k === 'file') page.links.push(u);
			}
		}
		const pageComp = path.join(dir, `${r.exportName}.jsx`);
		if (fs.existsSync(pageComp)) {
			const src = fs.readFileSync(pageComp, 'utf8');
			const desc = src.match(/<meta name="description" content=\{("(?:[^"\\]|\\.)*")\}/);
			const title = src.match(/<title>\{?("(?:[^"\\]|\\.)*")\}?<\/title>/);
			page.meta = { description: desc ? JSON.parse(desc[1]) : undefined, title: title ? JSON.parse(title[1]) : undefined };
		}
		page.post = postsBySlug.get(p);
		pages.set(p, page);
	}

	// Register every export asset/link (source = 'export'). The page is attributed when the URL lives in a page dir.
	const dirToPath = new Map([...pages.values()].map((pg) => [pg.dir, pg.path]));
	for (const [u, filesSet] of urlHits) {
		const kind = classifyUrl(u);
		const pagesForUrl = [...filesSet].map((f) => dirToPath.get(path.dirname(f)) || (f.includes('blogData') ? 'blogData.js' : f));
		for (const pg of pagesForUrl) {
			if (kind === 'image') registerAsset(u, { kind: 'image', page: pg, source: 'export' });
			else if (kind === 'file') registerAsset(u, { kind: 'file', page: pg, source: 'export' });
			else if (kind === 'video') registerVideo(u, pg, 'export');
			else if (kind === 'external') registerLink(u, pg, 'export');
		}
	}
	for (const post of postsBySlug.values()) {
		if (post.coverImageSrc) registerAsset(post.coverImageSrc, { kind: 'image', page: normPath(post.slug), source: 'export', alt: post.coverImageAlt });
	}

	return { routes, pages, postsBySlug, urlHits, blogData, files };
}

// =====================================================================
// 2. LIVE CRAWL
// =====================================================================

function decodeAstro(v) {
	if (!Array.isArray(v)) return v;
	const [t, x] = v;
	if (t === 0) {
		return x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).map(([k, y]) => [k, decodeAstro(y)])) : x;
	}
	if (t === 1) return x.map(decodeAstro);
	if (t === 3) return new Date(x).toISOString();
	return x;
}

function parseIslands(html) {
	const out = {};
	for (const m of html.matchAll(/<astro-island[^>]*component-url="([^"]+)"[^>]*props="([^"]*)"/g)) {
		const name = path.basename(m[1]).split('.')[0];
		try {
			const obj = JSON.parse(htmlDecode(m[2]));
			out[name] = Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, decodeAstro(v)]));
		} catch {}
	}
	return out;
}

const ECOM_RE = /ecommerce|product|booking|appointment|store|cart|checkout/i;

function orderedElementIds(block) {
	return Array.isArray(block?.components) ? block.components : [];
}

function sortByPosition(elements) {
	const pos = (e) => [e.mobile?.top ?? e.desktop?.top ?? 0, e.mobile?.left ?? e.desktop?.left ?? 0];
	return elements.sort((a, b) => {
		const [at, al] = pos(a.el);
		const [bt, bl] = pos(b.el);
		return at - bt || al - bl;
	});
}

// Collect image refs from any { path, origin } or { xxxPath, xxxOrigin } in a data subtree.
function collectZyroImages(node, cb) {
	if (!node || typeof node !== 'object') return;
	if (Array.isArray(node)) return node.forEach((n) => collectZyroImages(n, cb));
	if (typeof node.path === 'string' && typeof node.origin === 'string') cb(zyroImageUrl(node.path, node.origin), node.alt);
	for (const k of Object.keys(node)) {
		const m = k.match(/^(.*)Path$/);
		if (m && typeof node[k] === 'string' && typeof node[`${m[1]}Origin`] === 'string') cb(zyroImageUrl(node[k], node[`${m[1]}Origin`]), node[`${m[1]}Alt`]);
		collectZyroImages(node[k], cb);
	}
}

function collectStrings(node, cb) {
	if (typeof node === 'string') return cb(node);
	if (!node || typeof node !== 'object') return;
	for (const v of Object.values(node)) collectStrings(v, cb);
}

async function crawlLive() {
	log('fetching sitemap');
	const sm = await fetchWithRetry(`${SITE}/sitemap.xml`);
	const sitemapPaths = [...sm.body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => normPath(new URL(m[1]).pathname));
	const sitemapSet = new Set(sitemapPaths);

	const queue = [...new Set(sitemapPaths)];
	const seen = new Set(queue);
	const discoveredFrom = new Map(); // path -> Set(pages linking to it)
	const live = new Map(); // path -> result
	const excluded = [];

	const enqueue = (href, fromPage) => {
		let u;
		try {
			u = new URL(htmlDecode(href), SITE);
		} catch {
			return;
		}
		if (!SITE_HOSTS.has(u.host)) return;
		const p = normPath(u.pathname);
		if (/^\/(_astro|cdn-cgi|api)\b/.test(p) || /\.[a-z0-9]{2,5}$/i.test(p)) return;
		if (p !== fromPage) {
			if (!discoveredFrom.has(p)) discoveredFrom.set(p, new Set());
			discoveredFrom.get(p).add(fromPage);
		}
		if (!seen.has(p)) {
			seen.add(p);
			queue.push(p);
		}
	};

	let siteMeta = null;
	let siteNav = null;
	let headerBlock = null;

	while (queue.length) {
		const batch = queue.splice(0, queue.length);
		await pool(batch, CONCURRENCY, async (p) => {
			const slug = slugOf(p);
			if (HARD_EXCLUDE.has(slug)) {
				excluded.push({ path: p, reason: 'Builder store/booking placeholder (approved hard-exclude list)', inSitemap: sitemapSet.has(p) });
				return;
			}
			const res = await fetchWithRetry(SITE + (p === '/' ? '/' : p));
			const r = { path: p, slug, status: res.status, finalUrl: res.url, inSitemap: sitemapSet.has(p), error: res.error };
			live.set(p, r);
			if (res.status !== 200 || !res.type.includes('html')) return;
			if (res.url && normPath(new URL(res.url).pathname) !== p) r.redirectedTo = normPath(new URL(res.url).pathname);

			const html = res.body;
			const $ = cheerio.load(html);
			const islands = parseIslands(html);
			const pd = islands.Page?.pageData;
			r.head = {
				title: $('title').first().text(),
				description: $('meta[name="description"]').attr('content'),
				canonical: $('link[rel="canonical"]').attr('href'),
				ogTitle: $('meta[property="og:title"]').attr('content'),
				ogImage: $('meta[property="og:image"]').attr('content'),
				ogImageAlt: $('meta[property="og:image:alt"]').attr('content'),
			};
			const htmlNoProps = html.replace(/props="[^"]*"/g, '');
			r.rawHtmlHasCommoninja = /commonninja_component|data-comp-id|comp-type/i.test(htmlNoProps);
			r.commoninjaScriptRendered = /<script[^>]+commonninja\.js/i.test(htmlNoProps);

			// Rendered HTML: links, images, iframes (catches anything outside the page data).
			$('a[href]').each((_, a) => {
				const href = $(a).attr('href');
				if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return;
				const abs = new URL(htmlDecode(href), SITE).href;
				const k = classifyUrl(abs);
				if (k === 'internal') enqueue(abs, p);
				else if (k === 'file') registerAsset(abs, { kind: 'file', page: p, source: 'live' });
				else if (k === 'external' || k === 'widget') registerLink(abs, p, 'live');
			});
			$('img').each((_, img) => {
				const srcs = [$(img).attr('src'), ...(($(img).attr('srcset') || '').split(',').map((s) => s.trim().split(/\s+/)[0]))].filter(Boolean);
				// Only the first candidate per <img>: srcset entries are resized copies of the same image.
				if (srcs[0] && !srcs[0].startsWith('data:') && classifyUrl(new URL(htmlDecode(srcs[0]), SITE).href) === 'image') registerAsset(new URL(htmlDecode(srcs[0]), SITE).href, { kind: 'image', page: p, source: 'live-html', alt: $(img).attr('alt') });
			});
			$('iframe[src]').each((_, f) => {
				const src = new URL(htmlDecode($(f).attr('src')), SITE).href;
				if (classifyUrl(src) === 'video') registerVideo(src, p, 'live');
				else embeds.push({ page: p, id: 'iframe', kind: 'iframe', src });
			});

			if (!pd) {
				r.note = 'No builder page data found in HTML';
				return;
			}
			SITE_ID = pd.siteId || SITE_ID;
			siteMeta ??= pd.meta;
			siteNav ??= pd.nav;
			headerBlock ??= pd.blocks?.header;
			r.siteNavPages = pd.pages;
			const cur = pd.pages?.[pd.currentPageId];
			r.pageId = pd.currentPageId;
			r.page = cur;
			r.blogCategories = pd.blogCategories;

			// Heuristic store/booking detection on page/block/element TYPES only (every page carries cart translations, so text is useless).
			const reasons = [];
			if (cur?.type && ECOM_RE.test(cur.type)) reasons.push(`page type "${cur.type}"`);
			for (const id of cur?.blocks || []) {
				const b = pd.blocks[id];
				if (b?.type && ECOM_RE.test(b.type)) reasons.push(`block type "${b.type}"`);
				for (const eid of orderedElementIds(b)) {
					const e = pd.elements[eid];
					if (e?.type && ECOM_RE.test(e.type)) reasons.push(`element type "${e.type}"`);
				}
			}
			if (cur?.productId) reasons.push(`has productId ${cur.productId}`);
			r.storeHeuristic = [...new Set(reasons)];

			// Ordered content blocks.
			r.blocks = [];
			for (const id of cur?.blocks || []) {
				const b = pd.blocks[id];
				if (!b) continue;
				const els = sortByPosition(orderedElementIds(b).map((eid) => ({ id: eid, el: pd.elements[eid] })).filter((x) => x.el));
				r.blocks.push({ id, type: b.type, htmlId: b.htmlId, background: b.background, block: b, elements: els });
				collectZyroImages(b.background, (u, alt) => u && registerAsset(u, { kind: 'image', page: p, source: 'live', alt }));
				for (const { el } of els) {
					collectZyroImages(el, (u, alt) => u && registerAsset(u, { kind: 'image', page: p, source: 'live', alt }));
					collectStrings(el, (s) => {
						for (const m of s.matchAll(URL_RE)) {
							const u = m[0].replace(/[.,;]+$/, '');
							const k = classifyUrl(u);
							if (k === 'internal') enqueue(u, p);
							else if (k === 'file') registerAsset(u, { kind: 'file', page: p, source: 'live' });
							else if (k === 'video') registerVideo(u, p, 'live');
							else if (k === 'image') registerAsset(u, { kind: 'image', page: p, source: 'live' });
							else if (k === 'external' || k === 'widget') registerLink(u, p, 'live');
						}
					});
				}
			}
			// Page-level images (cover, OG).
			collectZyroImages({ ...cur, blocks: undefined }, (u, alt) => u && registerAsset(u, { kind: 'image', page: p, source: 'live', alt }));
			// Nav (incl. hidden items) and header logo.
			collectStrings(pd.nav, (s) => {
				for (const m of s.matchAll(URL_RE)) {
					const k = classifyUrl(m[0]);
					if (k === 'file') registerAsset(m[0], { kind: 'file', page: '(site navigation)', source: 'live' });
					else if (k === 'internal') enqueue(m[0], '(site navigation)');
				}
			});
		});
	}

	if (headerBlock) collectZyroImages(headerBlock, (u, alt) => u && registerAsset(u, { kind: 'image', page: '(site header logo)', source: 'live', alt }));

	return { live, excluded, sitemapPaths, sitemapSet, discoveredFrom, siteMeta, siteNav, headerBlock };
}

// =====================================================================
// 3. DOWNLOADS
// =====================================================================

function loadManifest() {
	try {
		return JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
	} catch {
		return { assets: {} };
	}
}

async function downloadAssets(prevManifest) {
	const usedNames = new Map(); // filename -> key
	const byHash = new Map(); // sha256 -> local rel path
	const collisions = [];
	// Reserve names from a previous run so re-runs are stable.
	for (const [key, prev] of Object.entries(prevManifest.assets || {})) {
		if (prev.localPath && fs.existsSync(path.join(ROOT, prev.localPath))) {
			usedNames.set(`${prev.kind}:${path.basename(prev.localPath)}`, key);
			if (prev.sha256) byHash.set(prev.sha256, prev.localPath);
		}
	}

	// Live-referenced assets first so they claim the clean filenames.
	const list = [...assets.values()].sort((a, b) => Number(b.sources.has('live') || b.sources.has('live-html')) - Number(a.sources.has('live') || a.sources.has('live-html')));

	const pickName = (a, ext) => {
		let base = sanitizeName(a.nameHint || 'file');
		if (!path.extname(base) && ext) base += ext;
		const kindKey = (n) => `${a.kind}:${n}`;
		if (!usedNames.has(kindKey(base)) || usedNames.get(kindKey(base)) === a.key) {
			usedNames.set(kindKey(base), a.key);
			return base;
		}
		const prefix = a.cdnId ? sanitizeName(a.cdnId).slice(0, 16) : sha1(a.key).slice(0, 8);
		let alt = `${prefix}-${base}`;
		if (usedNames.has(kindKey(alt)) && usedNames.get(kindKey(alt)) !== a.key) alt = `${sha1(a.key).slice(0, 8)}-${base}`;
		usedNames.set(kindKey(alt), a.key);
		collisions.push({ name: base, savedAs: alt, key: a.key });
		return alt;
	};

	// The export's Horizons CDN holds downscaled copies of the live images under the same filename.
	// Treat those as the same image: keep the live original, don't store the copy.
	const isLive = (a) => a.sources.has('live') || a.sources.has('live-html');
	const liveByName = new Map(list.filter(isLive).map((a) => [sanitizeName(a.nameHint || ''), a]));
	for (const a of list) {
		if (isLive(a) || a.stock) continue;
		const twin = liveByName.get(sanitizeName(a.nameHint || ''));
		if (twin) a.aliasOf = twin;
	}

	await pool(list.filter((a) => !a.aliasOf), CONCURRENCY, async (a) => {
		const prev = prevManifest.assets?.[a.key];
		if (prev?.localPath && prev.status !== 'failed' && fs.existsSync(path.join(ROOT, prev.localPath))) {
			Object.assign(a, { status: prev.status, localPath: prev.localPath, fetchedFrom: prev.fetchedFrom, sha256: prev.sha256, contentType: prev.contentType, bytes: prev.bytes, cached: true });
			return;
		}
		a.attempts = [];
		for (const [i, cand] of a.candidates.entries()) {
			const res = await fetchWithRetry(cand, { binary: true });
			const okType = a.kind === 'file' ? /pdf|octet-stream/.test(res.type) : res.type.startsWith('image/');
			a.attempts.push({ url: cand, status: res.status, type: res.type, error: res.error });
			if (res.status === 200 && okType && res.body.length > 0) {
				const hash = sha256(res.body);
				a.sha256 = hash;
				a.contentType = res.type;
				a.bytes = res.body.length;
				a.fetchedFrom = cand;
				a.status = i === 0 ? 'original' : 'fallback';
				if (byHash.has(hash)) {
					a.localPath = byHash.get(hash);
					a.duplicateOf = true;
					return;
				}
				const name = pickName(a, EXT_BY_TYPE[res.type]);
				const dir = a.kind === 'file' ? OUT.files : OUT.images;
				fs.writeFileSync(path.join(dir, name), res.body);
				a.localPath = path.relative(ROOT, path.join(dir, name));
				byHash.set(hash, a.localPath);
				return;
			}
		}
		a.status = 'failed';
	});
	for (const a of list) {
		if (!a.aliasOf) continue;
		a.status = 'same-as-live';
		a.localPath = a.aliasOf.localPath;
		a.aliasKey = a.aliasOf.key;
	}
	return { collisions };
}

function publicUrl(a) {
	return a?.localPath ? '/' + a.localPath.replace(/^public\//, '') : null;
}

function localFor(rawUrl) {
	try {
		const { key } = assetKeyAndCandidates(rawUrl);
		return publicUrl(assets.get(key));
	} catch {
		return null;
	}
}

// =====================================================================
// 4. MARKDOWN
// =====================================================================

const td = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced', bulletListMarker: '-', emDelimiter: '*' });
td.use(gfm);
td.keep(['iframe']);
td.addRule('stripSpans', { filter: ['span', 'font'], replacement: (c) => c });

function rewriteUrl(u) {
	if (!u) return u;
	let abs;
	try {
		abs = new URL(htmlDecode(u), SITE).href;
	} catch {
		return u;
	}
	const k = classifyUrl(abs);
	if (k === 'image' || k === 'file') return localFor(abs) || abs;
	if (k === 'internal') {
		const url = new URL(abs);
		return normPath(url.pathname) + (url.hash || '');
	}
	return abs;
}

function rewriteHtml(html) {
	const $ = cheerio.load(`<div id="__root">${html}</div>`, null, false);
	$('a[href]').each((_, a) => $(a).attr('href', rewriteUrl($(a).attr('href'))));
	$('img[src]').each((_, i) => $(i).attr('src', rewriteUrl($(i).attr('src'))));
	return $('#__root').html();
}

function elementToHtml(el, ctx) {
	switch (el.type) {
		case 'GridTextBox':
			return rewriteHtml(el.content || '');
		case 'GridImage': {
			const url = zyroImageUrl(el.settings?.path, el.settings?.origin);
			if (!url) return '';
			const img = `<img src="${localFor(url) || url}" alt="${(el.settings?.alt || '').replace(/"/g, '&quot;')}">`;
			const href = el.settings?.href || el.href;
			return `<p>${href ? `<a href="${rewriteUrl(href)}">${img}</a>` : img}</p>`;
		}
		case 'GridButton':
			return `<p><a href="${rewriteUrl(el.href || '')}">${el.content || ''}</a></p>`;
		case 'GridVideo': {
			const src = el.settings?.src || '';
			const id = registerVideo(src, ctx.path, 'live');
			return `<iframe src="https://www.youtube-nocookie.com/embed/${id}" title="YouTube video" allowfullscreen></iframe>`;
		}
		case 'GridEmbed': {
			const file = `${ctx.slug}-${ctx.id}.html`;
			fs.writeFileSync(path.join(OUT.embeds, file), el.content || '');
			embeds.push({ page: ctx.path, id: ctx.id, kind: 'custom-code', file: `migration/embeds/${file}`, summary: summarizeEmbed(el.content || '') });
			return `<!-- custom embed ${ctx.id}: see migration/embeds/${file} -->`;
		}
		case 'GridForm': {
			const fields = (el.settings?.schema || []).map((f) => f.inputLabel || f.name).filter(Boolean);
			ctx.forms.push({ formId: el.formId, fields });
			return `<!-- contact form (${el.formId}): fields ${fields.join(', ')} -->`;
		}
		case 'GridSocialIcons': {
			const links = (el.links || []).map((l) => l.link || l.href || l.url).filter(Boolean);
			links.forEach((u) => registerLink(u, ctx.path, 'live'));
			return `<ul>${links.map((u) => `<li><a href="${u}">${new URL(u).host.replace(/^www\./, '')}</a></li>`).join('')}</ul>`;
		}
		default:
			ctx.unknown.push(el.type);
			return `<!-- unhandled element type ${el.type} -->`;
	}
}

function summarizeEmbed(code) {
	if (/projectData\s*=/.test(code)) return 'Project category filter (JS-rendered list of projects by category)';
	if (/back-to-top/.test(code)) return 'Back-to-top button';
	if (/filter-btn/.test(code)) return 'Category filter script (no visible content)';
	return textOf(code).slice(0, 80) || '(script/style only)';
}

function md(html) {
	return td.turndown(html).replace(/\n{3,}/g, '\n\n').trim();
}

function frontmatter(obj) {
	const clean = Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && !v.length)));
	return `---\n${YAML.stringify(clean).trim()}\n---\n`;
}

// =====================================================================
// MAIN
// =====================================================================

async function main() {
	for (const d of Object.values(OUT)) fs.mkdirSync(d, { recursive: true });
	const exportMtimeBefore = Date.now();
	const prevManifest = loadManifest();

	const exp = await scanExport();
	const crawl = await crawlLive();
	log(`live pages fetched: ${crawl.live.size}, excluded: ${crawl.excluded.length}`);

	fs.mkdirSync(OUT.embeds, { recursive: true });
	log(`downloading ${assets.size} assets`);
	const { collisions } = await downloadAssets(prevManifest);

	// Pages linked from My Projects buttons are "project" pages.
	const projectsPage = crawl.live.get('/my-projects');
	const projectPaths = new Set();
	for (const b of projectsPage?.blocks || []) {
		for (const { el } of b.elements) {
			if (el.type === 'GridButton' && el.href && isSiteUrl(el.href)) projectPaths.add(normPath(new URL(el.href, SITE).pathname));
		}
	}
	let projectCategories = null;
	for (const b of projectsPage?.blocks || []) {
		for (const { el } of b.elements) {
			const m = el.type === 'GridEmbed' && el.content?.match(/const projectData = (\{[\s\S]*?\n\s*\});/);
			if (m) projectCategories = vm.runInNewContext(`(${m[1]})`, {}, { timeout: 100 });
		}
	}
	// Map the embed's anchor ids (#typing) to section htmlIds / project pages.
	const projectSections = [];
	for (const b of projectsPage?.blocks || []) {
		const btn = b.elements.find(({ el }) => el.type === 'GridButton' && el.href && isSiteUrl(el.href));
		const heading = b.elements.find(({ el }) => el.type === 'GridTextBox');
		if (btn) projectSections.push({ htmlId: b.htmlId, page: normPath(new URL(btn.el.href, SITE).pathname), heading: heading ? textOf(heading.el.content).slice(0, 80) : '' });
	}

	const written = [];
	const textDiffs = [];
	const orderOnly = [];
	const unknownTypes = new Set();
	const forms = [];

	for (const r of crawl.live.values()) {
		if (r.status !== 200 || !r.page) continue;
		const cur = r.page;
		const isBlog = cur.type === 'blog';
		const ctxBase = { path: r.path, slug: r.slug, forms, unknown: [] };
		const parts = [];
		const liveTexts = [];
		const bgImages = [];
		for (const b of r.blocks) {
			if (b.type === 'BlockBlogHeader' || b.type === 'BlockNavigation') continue;
			if (b.type === 'BlockBlogList') {
				parts.push('<!-- blog post list (generated from content/blog) -->');
				continue;
			}
			if (b.type !== 'BlockLayout') ctxBase.unknown.push(b.type);
			if (b.background?.current === 'image' || b.background?.image || b.background?.path) {
				collectZyroImages(b.background, (u) => u && bgImages.push(localFor(u) || u));
			}
			const sectionMd = b.elements.map(({ id, el }) => {
				if (el.type === 'GridTextBox') liveTexts.push(el.content || '');
				if (el.type === 'GridButton') liveTexts.push(el.content || '');
				const html = elementToHtml(el, { ...ctxBase, id });
				return html.startsWith('<!--') ? html : md(html);
			});
			parts.push([`<!-- section ${b.htmlId || b.id} -->`, ...sectionMd.filter(Boolean)].join('\n\n'));
		}
		ctxBase.unknown.forEach((t) => unknownTypes.add(t));
		const body = parts.join('\n\n');

		const ex = exp.pages.get(r.path);
		const exPost = exp.postsBySlug.get(r.path);
		const cover = zyroImageUrl(cur.coverImagePath, cur.coverImageOrigin);
		const og = zyroImageUrl(cur.meta?.ogImagePath, cur.meta?.ogImageOrigin) || r.head.ogImage;
		const categories = (cur.categories || []).map((id) => r.blogCategories?.[id]?.name || id);
		const kind = isBlog ? 'blog' : CORE_PAGES[r.path] ? 'core' : projectPaths.has(r.path) ? 'project' : 'other';
		const projectCats = projectCategories && kind === 'project' ? catsForProject(r.path, projectCategories, projectSections) : undefined;

		const fm = {
			title: cur.name,
			slug: r.path,
			...(isBlog ? { date: cur.date, minutesToRead: cur.minutesToRead ? Number(cur.minutesToRead) : undefined, categories } : { kind }),
			metaTitle: cur.meta?.title,
			description: cur.meta?.description || r.head.description || exPost?.meta?.description,
			coverImage: cover ? localFor(cover) || cover : undefined,
			coverImageAlt: cur.coverImageAlt,
			ogImage: og ? localFor(og) || og : undefined,
			ogImageAlt: cur.meta?.ogImageAlt || r.head.ogImageAlt,
			projectCategories: projectCats,
			backgroundImages: bgImages,
			liveUrl: SITE + (r.path === '/' ? '/' : r.path),
			source: 'live',
			inExport: !!ex,
			needsReview: r.storeHeuristic?.length ? true : undefined,
		};
		const file = path.join(isBlog ? OUT.blog : OUT.pages, `${r.slug}.md`);
		fs.writeFileSync(file, frontmatter(fm) + '\n' + body + '\n');
		r.savedAs = path.relative(ROOT, file);
		r.kind = kind;
		written.push(r.savedAs);

		if (ex) {
			const liveItems = liveTexts.map(textOf).filter(Boolean);
			const exItems = [...ex.texts, ...ex.buttons.map((x) => x.text)].map(textOf).filter(Boolean);
			const d = diffItems(liveItems, exItems);
			if (d.onlyLive.length || d.onlyExport.length) textDiffs.push({ path: r.path, ...d });
			else if (liveItems.join('|') !== exItems.join('|')) orderOnly.push(r.path);
		}
	}

	// Export-only pages (not reachable on the live site): save from export text.
	const liveOk = new Set([...crawl.live.values()].filter((r) => r.status === 200).map((r) => r.path));
	const exportOnly = [...exp.pages.values()].filter((pg) => !liveOk.has(pg.path));
	for (const pg of exportOnly) {
		const isBlog = pg.pageType === 'blog';
		const html = [...pg.texts.map(rewriteHtml), ...pg.images.map((i) => `<p><img src="${localFor(i.src) || i.src}" alt="${i.alt}"></p>`)].join('\n');
		const fm = { title: pg.post?.name || slugOf(pg.path), slug: pg.path, date: pg.post?.date, description: pg.post?.meta?.description || pg.meta?.description, source: 'export', needsReview: true };
		const file = path.join(isBlog ? OUT.blog : OUT.pages, `${slugOf(pg.path)}.md`);
		fs.writeFileSync(file, frontmatter(fm) + '\n' + md(html) + '\n');
		written.push(path.relative(ROOT, file));
	}

	// Commoninja analysis.
	const commoninja = analyseCommoninja(crawl, exp);

	// Manifest.
	const manifest = {
		generatedAt: new Date().toISOString(),
		siteId: SITE_ID,
		assets: Object.fromEntries([...assets.values()].map((a) => [a.key, {
			kind: a.kind, stock: a.stock || undefined, status: a.status, localPath: a.localPath, fetchedFrom: a.fetchedFrom,
			duplicateOf: a.duplicateOf || undefined, aliasOf: a.aliasKey, sha256: a.sha256, contentType: a.contentType, bytes: a.bytes,
			foundUrls: [...a.foundUrls], pages: [...a.pages], sources: [...a.sources], alts: [...a.alts].filter(Boolean),
			attempts: a.attempts,
		}])),
		pages: Object.fromEntries([...crawl.live.values()].map((r) => [r.path, { status: r.status, kind: r.kind, savedAs: r.savedAs, inSitemap: r.inSitemap, inExport: exp.pages.has(r.path), redirectedTo: r.redirectedTo, title: r.page?.name, metaTitle: r.page?.meta?.title, description: r.page?.meta?.description }])),
		excluded: crawl.excluded,
		videos: Object.fromEntries([...videos].map(([id, v]) => [id, { pages: [...v.pages], sources: [...v.sources] }])),
		externalLinks: Object.fromEntries([...externalLinks].map(([u, e]) => [u, { pages: [...e.pages], sources: [...e.sources] }])),
		embeds,
		projectCategories,
		projectSections,
	};
	fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));

	// Guardrail: nothing inside the export was modified.
	const touched = exp.files.filter((f) => fs.statSync(f).mtimeMs > exportMtimeBefore);

	writeReport({ exp, crawl, written, textDiffs, orderOnly, collisions, unknownTypes, forms, exportOnly, projectPaths, projectCategories, projectSections, commoninja, touched });
	log('done. report:', path.relative(ROOT, REPORT_PATH));
}

function catsForProject(p, data, sections) {
	const sec = sections.find((s) => s.page === p);
	if (!sec) return undefined;
	const labels = { game: 'Game Dev', web: 'Web Apps', ai: 'AI', ux: 'UX Design', utility: 'Utility' };
	const out = [];
	for (const [cat, list] of Object.entries(data)) {
		if (cat === 'all') continue;
		if (list.some((x) => x.id === sec.htmlId)) out.push(labels[cat] || cat);
	}
	return out.length ? out : undefined;
}

// Multiset difference of text elements (order-independent). Near-identical pairs are reduced to the differing sentences.
function diffItems(liveItems, exItems) {
	const rest = [...exItems];
	const onlyLive = [];
	for (const x of liveItems) {
		const i = rest.indexOf(x);
		if (i >= 0) rest.splice(i, 1);
		else onlyLive.push(x);
	}
	const split = (s) => s.split(/(?<=[.!?])\s+/).map((x) => x.trim()).filter(Boolean);
	const L = onlyLive.flatMap(split);
	const E = rest.flatMap(split);
	return { onlyLive: L.filter((x) => !E.includes(x)), onlyExport: E.filter((x) => !L.includes(x)) };
}

function analyseCommoninja(crawl, exp) {
	const pagesWithInstance = [...crawl.live.values()].filter((r) => r.rawHtmlHasCommoninja).map((r) => r.path);
	const inElements = embeds.filter((e) => /commonninja|commoninja/i.test(fs.existsSync(path.join(ROOT, e.file || '')) ? fs.readFileSync(path.join(ROOT, e.file), 'utf8') : e.src || ''));
	const inExport = [...exp.urlHits.keys()].filter((u) => /commoninja/.test(u));
	return {
		scriptRenderedOn: [...crawl.live.values()].filter((r) => r.commoninjaScriptRendered).map((r) => r.path),
		loader: crawl.siteMeta?.customMeta || null,
		pagesWithInstance,
		inElements: inElements.map((e) => e.page),
		inExport,
	};
}

// =====================================================================
// REPORT
// =====================================================================

function writeReport(d) {
	const { exp, crawl } = d;
	const L = [];
	const live = [...crawl.live.values()];
	const ok = live.filter((r) => r.status === 200);
	const all = [...assets.values()];
	const imgs = all.filter((a) => a.kind === 'image');
	const files = all.filter((a) => a.kind === 'file');
	const usedLive = (a) => a.sources.has('live') || a.sources.has('live-html');
	const count = (arr, f) => arr.filter(f).length;

	L.push('# Phase 1 report: content extraction', '', `Generated ${new Date().toISOString()}.`, '');
	L.push('## 1. Summary', '');
	L.push('| | Count |', '|---|---|');
	L.push(`| URLs in live sitemap | ${crawl.sitemapPaths.length} |`);
	L.push(`| Live pages fetched (200) | ${ok.length} |`);
	L.push(`| Live pages found only via links (not in sitemap) | ${count(ok, (r) => !r.inSitemap)} |`);
	L.push(`| Export routes | ${exp.routes.length} |`);
	L.push(`| Excluded (approved list) | ${crawl.excluded.length} |`);
	L.push(`| Blog posts saved | ${count(ok, (r) => r.kind === 'blog')} |`);
	L.push(`| Core / project / other pages saved | ${count(ok, (r) => r.kind === 'core')} / ${count(ok, (r) => r.kind === 'project')} / ${count(ok, (r) => r.kind === 'other')} |`);
	L.push(`| Images: unique / downloaded original / fallback / failed | ${imgs.length} / ${count(imgs, (a) => a.status === 'original')} / ${count(imgs, (a) => a.status === 'fallback')} / ${count(imgs, (a) => a.status === 'failed')} |`);
	L.push(`| Export image copies matched to a live original by filename (not stored twice) | ${count(imgs, (a) => a.aliasOf)} |`);
	L.push(`| Images that are byte-identical duplicates (stored once) | ${count(imgs, (a) => a.duplicateOf)} |`);
	L.push(`| Files (PDF): unique / downloaded / failed | ${files.length} / ${count(files, (a) => a.status && a.status !== 'failed')} / ${count(files, (a) => a.status === 'failed')} |`);
	L.push(`| External links | ${externalLinks.size} |`);
	L.push(`| YouTube videos | ${videos.size} |`);
	L.push(`| Files modified inside hostinger-export/ | ${d.touched.length} |`, '');

	// Pages
	L.push('## 2. Pages', '', 'Type: core = main nav page, project = linked from a Projects card, blog = blog post, other = everything else.', '');
	L.push('| Path | Type | Title | Sitemap | Export | Saved as |', '|---|---|---|---|---|---|');
	const kindOrder = { core: 0, project: 1, other: 2, blog: 3 };
	for (const r of ok.sort((a, b) => (kindOrder[a.kind] ?? 9) - (kindOrder[b.kind] ?? 9) || a.path.localeCompare(b.path))) {
		L.push(`| \`${r.path}\` | ${r.kind} | ${esc(r.page?.name)} | ${r.inSitemap ? 'yes' : '**no**'} | ${exp.pages.has(r.path) ? 'yes' : '**no**'} | ${r.savedAs || '-'} |`);
	}
	const bad = live.filter((r) => r.status !== 200);
	if (bad.length) {
		L.push('', '**Pages that did not return 200:**', '');
		for (const r of bad) L.push(`- \`${r.path}\`: HTTP ${r.status}${r.error ? ` (${r.error})` : ''}. Linked from: ${[...(crawl.discoveredFrom.get(r.path) || [])].join(', ') || 'sitemap'}`);
	}
	const redirects = ok.filter((r) => r.redirectedTo);
	if (redirects.length) {
		L.push('', '**Redirects:**', '');
		for (const r of redirects) L.push(`- \`${r.path}\` → \`${r.redirectedTo}\``);
	}
	L.push('');

	// Images
	L.push('## 3. Images', '', 'Status: **original** = untransformed original fetched. **fallback** = original unavailable, so the resized CDN copy was saved. **failed** = nothing could be fetched. Usage: **live** = used on the live site, **export-only** = referenced only by the Horizons export. Stock = Unsplash photo (free to use under the Unsplash license, but not yours).', '');
	L.push('| Local file | Status | Usage | Stock | Pages | Source URL |', '|---|---|---|---|---|---|');
	for (const a of imgs.filter((a) => !a.aliasOf).sort((x, y) => Number(usedLive(y)) - Number(usedLive(x)) || String(x.localPath).localeCompare(String(y.localPath)))) {
		const pagesList = [...a.pages].slice(0, 4).map((p) => `\`${p}\``).join(', ') + (a.pages.size > 4 ? ` +${a.pages.size - 4}` : '');
		L.push(`| ${a.localPath ? `\`${a.localPath}\`` : '-'}${a.duplicateOf ? ' (dup)' : ''} | ${a.status === 'failed' ? '**failed**' : a.status} | ${usedLive(a) ? 'live' : 'export-only'} | ${a.stock ? 'yes' : ''} | ${pagesList} | ${shortUrl(a.fetchedFrom || a.candidates[0])} |`);
	}
	const aliased = imgs.filter((a) => a.aliasOf);
	if (aliased.length) L.push('', `**Export copies matched to live originals: ${aliased.length}.** The export's Horizons CDN holds lower-resolution copies of the same images under the same filenames (e.g. 1600px wide vs 3024px originals). They were not stored separately. The live originals above are used instead. Full mapping in \`migration/manifest.json\` (\`aliasOf\`).`);
	const failed = imgs.filter((a) => a.status === 'failed');
	if (failed.length) {
		L.push('', '**Failed image downloads (attempts):**', '');
		for (const a of failed) L.push(`- ${a.key}: ${(a.attempts || []).map((t) => `${shortUrl(t.url)} → ${t.status || t.error} ${t.type}`).join('; ')}`);
	}
	if (d.collisions.length) {
		L.push('', '**Filename collisions (renamed, nothing overwritten):**', '');
		for (const c of d.collisions) L.push(`- \`${c.name}\` already taken → saved as \`${c.savedAs}\` (${shortUrl(c.key)})`);
	}
	L.push('');

	// Files
	L.push('## 4. Files (PDFs)', '', 'These are hosted on the builder\'s asset CDN and will stop working when the Hostinger plan is cancelled, so they are copied into `public/files/`.', '');
	L.push('| Local file | Status | Usage | Linked from |', '|---|---|---|---|');
	for (const a of files) L.push(`| ${a.localPath ? `\`${a.localPath}\`` : '-'} | ${a.status} | ${usedLive(a) ? 'live' : 'export-only'} | ${[...a.pages].map((p) => `\`${p}\``).join(', ')} |`);
	L.push('');

	// External links
	L.push('## 5. External links', '');
	const byDomain = new Map();
	for (const [u, e] of externalLinks) {
		let h;
		try {
			h = new URL(u).host.replace(/^www\./, '');
		} catch {
			continue;
		}
		if (!byDomain.has(h)) byDomain.set(h, []);
		byDomain.get(h).push([u, e]);
	}
	for (const [h, list] of [...byDomain].sort((a, b) => a[0].localeCompare(b[0]))) {
		L.push(`**${h}**`, '');
		for (const [u, e] of list) L.push(`- ${u} (${[...e.sources].join('+')}): ${[...e.pages].map((p) => `\`${p}\``).join(', ')}`);
		L.push('');
	}

	// Embeds
	L.push('## 6. Embeds', '', '**YouTube videos** (they will be re-embedded with youtube-nocookie; thumbnails are not downloaded):', '');
	for (const [id, v] of videos) L.push(`- \`${id}\` (${[...v.sources].join('+')}): ${[...v.pages].map((p) => `\`${p}\``).join(', ')}`);
	L.push('', '**Custom code embeds** (saved raw; not converted to Markdown; rebuilt as React in Phase 2 where needed):', '');
	for (const e of embeds) L.push(`- \`${e.page}\` ${e.kind}${e.file ? ` → \`${e.file}\`` : ''}${e.src ? ` ${e.src}` : ''}: ${e.summary || ''}`);
	if (d.projectCategories) {
		L.push('', '**Project categories** (taken from the My Projects filter embed):', '');
		for (const [cat, list] of Object.entries(d.projectCategories)) L.push(`- ${cat}: ${list.map((x) => `${x.name} (#${x.id})`).join(', ')}`);
		const ids = new Set(d.projectSections.map((s) => s.htmlId));
		const dangling = [...new Set(Object.values(d.projectCategories).flat().map((x) => x.id))].filter((id) => !ids.has(id));
		if (dangling.length) L.push('', `Note: these filter ids don't match any project section anchor on the live page, so those filter links go nowhere: ${dangling.map((x) => `\`#${x}\``).join(', ')}.`);
	}
	if (d.forms.length) {
		L.push('', '**Forms:**', '');
		for (const f of d.forms) L.push(`- "${f.formId}": fields ${f.fields.join(', ')} (to be replaced by the hosted form service in Phase 2)`);
	}
	L.push('');

	// Live-only / export-only
	const liveOnly = ok.filter((r) => !exp.pages.has(r.path));
	L.push('## 7. On the live site but missing from the export', '');
	if (!liveOnly.length) L.push('No pages. Every live page (excluding the placeholders) exists in the export.');
	for (const r of liveOnly) L.push(`- \`${r.path}\` "${esc(r.page?.name)}" → saved as ${r.savedAs}`);
	const aliasTargets = new Set(all.filter((a) => a.aliasOf).map((a) => a.aliasOf.key));
	const liveOnlyAssets = all.filter((a) => usedLive(a) && !a.sources.has('export') && !aliasTargets.has(a.key));
	L.push('', `**Live-only images/files** (no copy of any kind in the export): ${liveOnlyAssets.length}.`, '');
	for (const a of liveOnlyAssets) L.push(`- ${a.localPath ? `\`${a.localPath}\`` : a.key} (${a.status})`);
	L.push('');
	L.push('## 8. In the export but not on the live site', '');
	if (!d.exportOnly.length) L.push('No pages.');
	for (const pg of d.exportOnly) L.push(`- \`${pg.path}\` (${pg.pageType}): saved from export text with \`needsReview: true\``);
	L.push('');

	// Diffs
	L.push('## 9. Text differences: live vs export', '', 'The live text is what was saved. Listed here are the sentences that differ, so you can see whether the export holds newer wording you want to keep.', '');
	if (!d.textDiffs.length) L.push('No wording differences. Every text element on every page matches.');
	if (d.orderOnly.length) L.push('', `Same text, different element order only (layout artifact, not a content change): ${d.orderOnly.map((p) => `\`${p}\``).join(', ')}.`, '');
	for (const t of d.textDiffs) {
		if (!t.onlyLive.length && !t.onlyExport.length) {
			L.push(`- \`${t.path}\`: whitespace/formatting only`);
			continue;
		}
		L.push(`### \`${t.path}\``, '');
		for (const s of t.onlyLive.slice(0, 6)) L.push(`- live only: "${trunc(s)}"`);
		if (t.onlyLive.length > 6) L.push(`- …and ${t.onlyLive.length - 6} more live-only sentences`);
		for (const s of t.onlyExport.slice(0, 6)) L.push(`- export only: "${trunc(s)}"`);
		if (t.onlyExport.length > 6) L.push(`- …and ${t.onlyExport.length - 6} more export-only sentences`);
		L.push('');
	}
	L.push('');

	// Excluded
	L.push('## 10. Excluded', '');
	L.push('| Path | In sitemap | Reason |', '|---|---|---|');
	for (const e of crawl.excluded) L.push(`| \`${e.path}\` | ${e.inSitemap ? 'yes' : 'no'} | ${e.reason} |`);
	L.push('');

	// Needs decision
	L.push('## 11. Needs your decision', '');
	const decisions = [];
	for (const r of ok) if (r.storeHeuristic?.length) decisions.push(`\`${r.path}\`: looks like a store/booking page (${r.storeHeuristic.join(', ')}). Saved with \`needsReview: true\`. Keep or exclude?`);
	const linkedFrom = (p) => [...(crawl.discoveredFrom.get(p) || [])].filter((x) => x !== '(site navigation)');
	for (const r of ok) {
		if (r.kind === 'blog' || r.path === '/') continue;
		if (!linkedFrom(r.path).length) {
			const inNav = (crawl.discoveredFrom.get(r.path) || new Set()).has('(site navigation)');
			decisions.push(`\`${r.path}\` "${esc(r.page?.name)}": not linked from any page${inNav ? ' (only a hidden nav entry)' : ''}, reachable only via the sitemap. Keep it as a public page?`);
		}
	}
	for (const pg of d.exportOnly) decisions.push(`\`${pg.path}\`: exists only in the export. Publish it?`);
	for (const r of live.filter((x) => x.status !== 200)) {
		decisions.push(`Broken internal link: \`${r.path}\` returns HTTP ${r.status}. Linked from ${[...(crawl.discoveredFrom.get(r.path) || [])].map((p) => `\`${p}\``).join(', ')}. Saved text is unchanged. In Phase 2, may I point this link at the correct page${ok.some((o) => o.path.replace(/s(?=-)/, '') === r.path) ? ` (likely \`${ok.find((o) => o.path.replace(/s(?=-)/, '') === r.path).path}\`)` : ''}?`);
	}
	const resumes = files.filter((a) => /resume/i.test(a.key));
	if (resumes.length > 1) decisions.push(`${resumes.length} different résumé PDFs are linked: ${resumes.map((a) => `\`${path.basename(a.localPath || a.key)}\` (from ${[...a.pages].join(', ')})`).join('; ')}. Which one should the new site link to? The other is dropped.`);
	const genericBlogSlugs = ok.filter((r) => r.kind === 'blog' && /^\/blog-post\d*$/.test(r.path));
	if (genericBlogSlugs.length) decisions.push(`${genericBlogSlugs.length} blog posts use generic URLs (${genericBlogSlugs.map((r) => `\`${r.path}\``).join(', ')}). Per your instructions they keep these exact URLs. Optional: add nicer slugs later with redirects. No action needed now.`);
	if (!decisions.length) L.push('Nothing.');
	for (const x of decisions) L.push(`- ${x}`);
	L.push('');

	// Phase 2 notes
	L.push('## 12. Notes for Phase 2', '');
	const home = crawl.live.get('/');
	L.push(`- **Home meta description (live):** "${esc(home?.page?.meta?.description || home?.head?.description || '')}"`);
	const exHome = exp.pages.get('/');
	if (exHome?.meta?.description) L.push(`- **Home meta description (export, mentions "forum"):** "${esc(exHome.meta.description)}". A replacement will be proposed in Phase 2.`);
	L.push(`- **Site OG image (live home):** ${home?.head?.ogImage || 'n/a'}. Stock Unsplash photo; replace with your own in Phase 2.`);
	L.push(`- **Site title in builder:** "${esc(crawl.siteMeta?.metaTitle || '')}". Pages use "<Page> | ${esc(crawl.siteMeta?.metaTitle || '')}".`);
	L.push('- **Fonts:** Prompt (headings), Lato / Roboto / Inter (body), via a zyrosite Google Fonts proxy. Load them with `next/font/google` instead.');
	if (d.unknownTypes.size) L.push(`- **Builder block/element types not converted:** ${[...d.unknownTypes].join(', ')}`);
	L.push('- **Builder contact form** uses Hostinger\'s form backend; it will be replaced (Web3Forms/Formspree).', '');

	// Commoninja
	const c = d.commoninja;
	L.push('## 13. Third-party widgets', '', '### Common Ninja (commoninja.com)', '');
	L.push('Common Ninja is a widget platform (reviews, sliders, forms, galleries and more). A page shows a widget by including the SDK script plus a `<div class="commonninja_component" comp-id="…">` placeholder. The SDK then fetches and renders the widget in the visitor\'s browser.', '');
	L.push(`- **Where it is configured:** the builder's site-wide "custom head code" setting holds \`${esc(c.loader || 'n/a')}\`. The snippet is malformed (\`« script … /script>\` instead of \`<script …></script>\`).`);
	L.push(`- **Is the script actually loaded?** ${c.scriptRenderedOn.length ? `Yes, a \`<script>\` tag is rendered on ${c.scriptRenderedOn.length} page(s).` : 'No. No live page renders a commoninja `<script>` tag in its HTML, so the SDK never loads. The snippet only exists as stored settings data.'}`);
	L.push(`- **Widget instances found:** ${c.pagesWithInstance.length || c.inElements.length ? `on ${[...c.pagesWithInstance, ...c.inElements].join(', ')}` : '**none**. No live page contains a `commonninja_component` placeholder or comp-id, and no custom embed references it.'}`);
	L.push(`- **In the export:** ${c.inExport.length ? `the same malformed snippet, in \`src/data/customCode.js\` (${c.inExport.join(', ')})` : 'not referenced'}.`);
	L.push(`- **Captured content:** ${c.pagesWithInstance.length || c.inElements.length ? 'Not captured. The widget renders client-side, so its content is not in the server HTML. It must be checked by hand in a browser.' : 'Nothing to capture. With no widget instance on any page, the script renders nothing.'}`);
	L.push(`- **Recommendation:** ${c.pagesWithInstance.length || c.inElements.length ? 'review the widget pages in a browser before cutover.' : 'drop it; it is a leftover snippet.'}`, '');

	L.push('## Guardrail check', '');
	L.push(`- Files modified inside \`hostinger-export/\` during this run: **${d.touched.length}**${d.touched.length ? `: ${d.touched.join(', ')}` : ''}`);
	L.push('- `duct-divers*.md` were not read by this script.');
	L.push(`- Markdown files written: ${d.written.length} (${count(d.written, (f) => f.startsWith('content/blog'))} blog, ${count(d.written, (f) => f.startsWith('content/pages'))} pages).`);

	fs.writeFileSync(REPORT_PATH, L.join('\n') + '\n');
}

function esc(s) {
	return String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
}
function trunc(s, n = 160) {
	return s.length > n ? s.slice(0, n) + '…' : s;
}
function shortUrl(u) {
	if (!u) return '';
	return u.length > 90 ? u.slice(0, 87) + '…' : u;
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
