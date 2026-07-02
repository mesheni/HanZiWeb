import { FastifyInstance } from 'fastify';
import { RegisterDeviceSchema, UpdateNotificationSettingsSchema } from '@hanzi/shared';
import * as devicesService from './devices.service.js';
import { loadConfig } from '../../config.js';

export async function devicesRoutes(app: FastifyInstance) {
  app.get('/vapid-public-key', async (_request, reply) => {
    const config = loadConfig();
    return reply.send({ success: true, data: { publicKey: config.VAPID_PUBLIC_KEY } });
  });

  app.post('/', { preHandler: [app.authenticate] }, async (request, reply) => {
    const body = RegisterDeviceSchema.parse(request.body);
    const result = await devicesService.registerDevice(request.userId, body);
    return reply.status(201).send({ success: true, data: result });
  });

  app.delete<{ Params: { token: string } }>('/:token', { preHandler: [app.authenticate] }, async (request, reply) => {
    const result = await devicesService.unregisterDevice(request.userId, request.params.token);
    return reply.send({ success: true, data: result });
  });

  app.get('/notification-settings', { preHandler: [app.authenticate] }, async (request, reply) => {
    const settings = await devicesService.getNotificationSettings(request.userId);
    return reply.send({ success: true, data: settings });
  });

  app.put('/notification-settings', { preHandler: [app.authenticate] }, async (request, reply) => {
    const body = UpdateNotificationSettingsSchema.parse(request.body);
    const result = await devicesService.updateNotificationSettings(request.userId, body);
    return reply.send({ success: true, data: result });
  });
}
