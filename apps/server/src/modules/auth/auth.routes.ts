import { FastifyInstance } from 'fastify';
import { LoginSchema, RegisterSchema } from '@hanzi/shared';
import * as authService from './auth.service.js';

export async function authRoutes(app: FastifyInstance) {
  /** POST /auth/register — создание аккаунта */
  app.post('/register', async (request, reply) => {
    const body = RegisterSchema.parse(request.body);
    const result = await authService.registerUser(body);
    return reply.status(201).send({ success: true, data: result });
  });

  /** POST /auth/login — вход */
  app.post('/login', async (request, reply) => {
    const body = LoginSchema.parse(request.body);
    const result = await authService.loginUser(body);
    // Set refresh token as httpOnly cookie
    reply.setCookie('refreshToken', result.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/api/auth',
      maxAge: 30 * 24 * 60 * 60, // 30 days
    });
    return reply.send({
      success: true,
      data: { user: result.user, accessToken: result.accessToken, expiresIn: 900 },
    });
  });

  /** POST /auth/refresh — обновление токенов */
  app.post('/refresh', async (request, reply) => {
    const refreshToken = request.cookies.refreshToken;
    if (!refreshToken) {
      return reply.status(401).send({ success: false, error: { code: 'NO_TOKEN', message: 'Refresh token missing' } });
    }
    const result = await authService.refreshTokens(refreshToken);
    reply.setCookie('refreshToken', result.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/api/auth',
      maxAge: 30 * 24 * 60 * 60,
    });
    return reply.send({
      success: true,
      data: { user: result.user, accessToken: result.accessToken, expiresIn: 900 },
    });
  });

  /** POST /auth/logout — выход */
  app.post('/logout', async (_request, reply) => {
    reply.clearCookie('refreshToken', { path: '/api/auth' });
    return reply.send({ success: true });
  });
}
