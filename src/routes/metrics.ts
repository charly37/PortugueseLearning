import { Request, Response } from 'express';
import { Registry, collectDefaultMetrics, Gauge } from 'prom-client';
import User from '../models/User';

const register = new Registry();

collectDefaultMetrics({ register });

const registeredUsersGauge = new Gauge({
  name: 'app_users_registered_total',
  help: 'Total number of registered (non-guest) users in the database',
  registers: [register],
});

const guestUsersGauge = new Gauge({
  name: 'app_users_guest_total',
  help: 'Total number of active guest users in the database',
  registers: [register],
});

export async function metricsHandler(req: Request, res: Response): Promise<void> {
  const [registeredCount, guestCount] = await Promise.all([
    User.countDocuments({ isGuest: false }),
    User.countDocuments({ isGuest: true }),
  ]);

  registeredUsersGauge.set(registeredCount);
  guestUsersGauge.set(guestCount);

  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
}
