import express from 'express';
import { createApiRouter } from '../server/core/router.ts';

const app = express();
app.set('trust proxy', 1);
app.use('/api', createApiRouter());

export default app;
