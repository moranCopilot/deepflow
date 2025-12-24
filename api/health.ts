import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getListenHubConfigDiagnostics } from './config-helper.js';

export default function handler(req: VercelRequest, res: VercelResponse) {
  const listenHub = getListenHubConfigDiagnostics();
  res.setHeader('X-Deepflow-Health', 'vercel-v3');
  res.json({
    status: 'ok',
    message: 'DeepFlow Server is running',
    handler: 'vercel-v3',
    vercel: {
      env: process.env.VERCEL_ENV || null,
      gitCommitSha: process.env.VERCEL_GIT_COMMIT_SHA || null,
      gitCommitRef: process.env.VERCEL_GIT_COMMIT_REF || null
    },
    listenHub: {
      configured: listenHub.apiKeyConfigured,
      apiKeySource: listenHub.apiKeySource,
      baseUrl: listenHub.baseUrl
    }
  });
}
