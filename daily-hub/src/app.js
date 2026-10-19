// Wires every module together. Dependencies that touch the outside world
// (fetch, the model caller, the clock) can be injected, which is how the tests run offline.
import { openDb, createCache } from './db.js';
import { createSettings } from './settings.js';
import { createTaskRepo } from './tasks.js';
import { createCourseRepo } from './courses.js';
import { createImageStore } from './images.js';
import { createAuth } from './auth.js';
import { createRouter } from './router.js';
import { createHandler } from './handler.js';
import { createHostGuard } from './security.js';
import { createStaticSites } from './static.js';
import { createWeather } from './weather.js';
import { createHolidays } from './holidays.js';
import { createCaller, createClientFactory } from './ai/call.js';
import { createExtractor } from './ai/extract.js';
import { authRoutes } from './routes/auth.js';
import { taskRoutes } from './routes/tasks.js';
import { courseRoutes } from './routes/courses.js';
import { imageRoutes } from './routes/images.js';
import { settingsRoutes } from './routes/settings.js';
import { weatherRoutes, icsRoutes } from './routes/weather.js';
import { aiRoutes } from './routes/ai.js';
import { localYmd } from '../shared/dates.js';
import path from 'node:path';

export function createApp({ config, db = openDb(config.dataDir), fetchImpl = fetch, caller, configured, today = () => localYmd(), log = console.error }) {
  const cache = createCache(db);
  const settings = createSettings(db);
  const tasks = createTaskRepo(db);
  const courses = createCourseRepo(db);
  const images = createImageStore(db, config.dataDir);
  const auth = createAuth({ dataDir: config.dataDir, accessCode: config.accessCode });
  const weather = createWeather({ cache, fetchImpl });
  const holidays = createHolidays({ cache, fetchImpl });
  const modelCaller = caller ?? createCaller({ getClient: createClientFactory(), disabled: config.ai.disabled });
  const extractor = createExtractor({ config, db, images, caller: modelCaller, configured });

  const router = createRouter();
  authRoutes({ router, auth });
  taskRoutes({ router, repo: tasks });
  courseRoutes({ router, repo: courses });
  imageRoutes({ router, images, config });
  settingsRoutes({ router, settings, config });
  weatherRoutes({ router, weather, holidays, settings });
  icsRoutes({ router, settings, tasks, courses, today });
  aiRoutes({ router, extractor, today });

  const handler = createHandler({
    router,
    auth,
    hostAllowed: createHostGuard(config.allowedHosts),
    serveStatic: createStaticSites({
      '/shared/': path.join(config.root, 'shared'), // pure modules the browser shares with the server
      '/': path.join(config.root, 'public'),
    }),
    log,
  });
  const prune = () => { try { images.prune(); } catch (err) { log(err); } };
  prune();
  const timer = setInterval(prune, 6 * 3600 * 1000);
  timer.unref();
  return { handler, db, auth, images, extractor, caller: modelCaller, close: () => { clearInterval(timer); db.close(); } };
}
