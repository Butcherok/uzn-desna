/**
 * Загрузка файлов (ТЗ 8.4; решение 042): приём, список с местами
 * использования, просмотр для админки, удаление владельцем (ТЗ 9.1).
 */
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { UPLOAD_PATH_RE } from '@uzn/shared';
import { ApiError } from '../domain/errors.js';
import { acceptUpload, listUploadsWithUses, removeUpload } from '../domain/uploads.js';
import { requireAuth, type AppDeps } from './http.js';

/** Подписи полей формы короткие; больше — не наша форма. */
export const UPLOAD_FIELD_MAX = 400;

function wildcardPath(req: FastifyRequest): string {
  const raw = (req.params as { '*'?: string })['*'] ?? '';
  let path: string;
  try {
    path = decodeURIComponent(raw);
  } catch {
    throw new ApiError('NOT_FOUND', 'Файл не знайдено');
  }
  if (!UPLOAD_PATH_RE.test(path)) throw new ApiError('NOT_FOUND', 'Файл не знайдено');
  return path;
}

export function uploadRoutes(app: FastifyInstance, deps: AppDeps): void {
  app.post('/uploads', { preHandler: requireAuth(deps) }, async (req, reply) => {
    const auth = req.auth;
    if (!auth) throw new ApiError('UNAUTHENTICATED');
    if (!req.isMultipart()) {
      throw new ApiError('VALIDATION_FAILED', 'Не вдалося прочитати файл', { status: 400 });
    }

    const fields: Record<string, string> = {};
    let bytes: Buffer | null = null;
    let truncated = false;
    for await (const part of req.parts()) {
      if (part.type === 'file') {
        if (part.fieldname !== 'file' || bytes !== null) {
          part.file.resume();
          continue;
        }
        const chunks: Buffer[] = [];
        for await (const chunk of part.file) chunks.push(chunk as Buffer);
        truncated = part.file.truncated;
        bytes = Buffer.concat(chunks);
      } else if (typeof part.value === 'string') {
        fields[part.fieldname] = part.value;
      }
    }
    if (bytes === null) {
      throw new ApiError('VALIDATION_FAILED', undefined, { fields: { file: 'Виберіть файл' } });
    }
    const alt = fields['alt']?.trim();
    const view = await acceptUpload(
      deps.store,
      auth.user,
      {
        entity: fields['entity'] ?? '',
        slug: fields['slug'] ?? '',
        alt: alt ? alt : null,
        bytes,
        truncated,
      },
      deps.now(),
    );
    return reply.code(201).send(view);
  });

  app.get('/uploads', { preHandler: requireAuth(deps) }, async () => ({
    items: await listUploadsWithUses(deps.store),
  }));

  // Просмотр в админке: неопубликованный — из БД, опубликованный — из ветки
  // `content-data` публичного репозитория (в БД содержимого уже нет).
  app.get('/uploads/*', { preHandler: requireAuth(deps) }, async (req, reply) => {
    const path = wildcardPath(req);
    const repo = deps.config.publish.repository;
    const meta = await deps.store.findUpload(path);
    if (!meta) {
      // Фото из начальных данных лежат в `main`, а не среди загруженных.
      if (deps.repoMedia?.has(path)) {
        return reply.redirect(`https://raw.githubusercontent.com/${repo}/main/${path}`, 302);
      }
      throw new ApiError('NOT_FOUND', 'Файл не знайдено');
    }
    const data = await deps.store.readUploadData(path);
    if (data) {
      return reply
        .header('Cache-Control', 'private, max-age=300')
        .header('Content-Disposition', 'inline')
        .type(meta.mime)
        .send(data);
    }
    return reply.redirect(`https://raw.githubusercontent.com/${repo}/content-data/${path}`, 302);
  });

  app.delete(
    '/uploads/*',
    { preHandler: requireAuth(deps, { roles: ['owner'] }) },
    async (req, reply) => {
      const auth = req.auth;
      if (!auth) throw new ApiError('UNAUTHENTICATED');
      const outcome = await removeUpload(deps.store, auth.user, wildcardPath(req), deps.now());
      return reply.code(200).send({ outcome });
    },
  );
}
