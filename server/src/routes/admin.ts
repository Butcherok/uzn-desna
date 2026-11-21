/**
 * Отдача интерфейса админки с адреса сервиса (решения 036, 040).
 * Адреса `/admin/…` — маршруты самой админки: файл сборки отдаётся как есть,
 * любой другой путь без расширения — `index.html`, дальше разбирается в браузере.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { AdminAsset, AdminAssets } from '../gateway/admin-assets.js';

export const ADMIN_PREFIX = '/admin';

/**
 * Политика содержимого админки (ТЗ 11.5, п. 5): всё — только со своего адреса,
 * без встроенных скриптов и стилей. У ответов API остаётся `default-src 'none'`.
 */
export const ADMIN_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

const NOT_BUILT =
  '<!doctype html><html lang="uk"><meta charset="utf-8"><title>Адміністрування</title>' +
  '<p>Інтерфейс адміністрування ще не зібрано.</p></html>';

export function isAdminPath(url: string): boolean {
  return url === ADMIN_PREFIX || url.startsWith(`${ADMIN_PREFIX}/`);
}

function send(req: FastifyRequest, reply: FastifyReply, asset: AdminAsset): FastifyReply {
  reply.type(asset.type);
  reply.header(
    'Cache-Control',
    asset.immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
  );
  reply.header('Vary', 'Accept-Encoding');
  const accepts = String(req.headers['accept-encoding'] ?? '');
  if (asset.gzip && /\bgzip\b/u.test(accepts)) {
    reply.header('Content-Encoding', 'gzip');
    return reply.send(asset.gzip);
  }
  return reply.send(asset.body);
}

export function adminRoutes(app: FastifyInstance, assets: AdminAssets | null): void {
  const routeOpts = { logLevel: 'warn' as const, config: { rateLimit: false as const } };

  app.get(ADMIN_PREFIX, routeOpts, async (req, reply) => {
    const query = req.url.slice(ADMIN_PREFIX.length);
    return reply.redirect(`${ADMIN_PREFIX}/${query}`, 301);
  });

  app.get(`${ADMIN_PREFIX}/*`, routeOpts, async (req, reply) => {
    if (!assets) {
      return reply.code(503).type('text/html; charset=utf-8').send(NOT_BUILT);
    }
    const rest = (req.params as { '*': string })['*'];
    const file = assets.get(rest);
    if (file) return send(req, reply, file);
    // Путь с расширением — запрос файла, которого нет: 404, а не страница.
    const last = rest.split('/').pop() ?? '';
    if (last.includes('.')) {
      return reply.code(404).type('text/plain; charset=utf-8').send('Not found');
    }
    const index = assets.get('index.html');
    if (!index) return reply.code(503).type('text/html; charset=utf-8').send(NOT_BUILT);
    return send(req, reply, index);
  });
}
