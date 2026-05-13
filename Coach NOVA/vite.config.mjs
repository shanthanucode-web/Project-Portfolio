import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { buildCoachPromptVariables } from './src/coachPromptVariables.js';

const COACH_PROMPT_ID = 'pmpt_69eeba8541c88194b6f50f216d4fe82e05db3bc50f219040';
const COACH_PROMPT_VERSION = '3';

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

function extractResponseText(response) {
  if (response.output_text) return response.output_text;
  const textParts = [];
  for (const item of response.output || []) {
    for (const content of item.content || []) {
      if (content.type === 'output_text' && content.text) {
        textParts.push(content.text);
      }
    }
  }
  return textParts.join('\n').trim();
}

function parseCoachJson(raw) {
  const clean = String(raw || '')
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim();
  try {
    return JSON.parse(clean);
  } catch {
    return {
      acknowledgement: 'Set received.',
      correction: clean || 'No specific correction was returned.',
      nextStep: 'Keep the next set controlled and repeat the strongest cue.',
    };
  }
}

function normalizeCoachResponse(payload, raw) {
  return {
    acknowledgement: String(payload.acknowledgement || payload.positive_acknowledgement || payload.summary || 'Data received.'),
    correction: String(payload.correction || payload.coaching_correction || payload.coach_advice?.[0] || 'No major correction flagged.'),
    nextStep: String(payload.nextStep || payload.next_step_action || payload.next_step || payload.action || 'Repeat the next set with the same setup.'),
    raw: payload,
    openaiResponse: raw,
    source: 'openai',
  };
}

async function createOpenAIClient() {
  const { default: OpenAI } = await import('openai');
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

async function createCoachResponse(body) {
  if (!process.env.OPENAI_API_KEY) {
    return {
      acknowledgement: 'Coach Nova received the training context.',
      correction: 'OpenAI is not configured, so this is a local fallback instead of model feedback.',
      nextStep: 'Add OPENAI_API_KEY to .env and restart Vite to enable AI coaching.',
      raw: null,
      source: 'fallback',
    };
  }

  const client = await createOpenAIClient();
  const promptVariables = buildCoachPromptVariables(body);
  const response = await client.responses.create({
    prompt: {
      id: COACH_PROMPT_ID,
      version: COACH_PROMPT_VERSION,
      variables: promptVariables,
    },
    input: JSON.stringify({
      required_response_format: {
        acknowledgement: 'positive acknowledgement',
        correction: 'specific correction from the supplied data',
        nextStep: 'single next-step action',
      },
      ...body,
    }),
  });
  const rawText = extractResponseText(response);
  return normalizeCoachResponse(parseCoachJson(rawText), {
    id: response.id,
    output_text: rawText,
    prompt: { id: COACH_PROMPT_ID, version: COACH_PROMPT_VERSION, variables: promptVariables },
  });
}

function localOpenAIProxy() {
  return {
    name: 'local-openai-proxy',
    configureServer(server) {
      server.middlewares.use('/api/coach', (req, res) => {
        handleOpenAIRequest(req, res, 'coach');
      });
      server.middlewares.use('/api/openai', (req, res) => {
        handleOpenAIRequest(req, res, 'openai');
      });
    },
  };
}

async function handleOpenAIRequest(req, res, route) {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Only POST allowed' }));
    return;
  }

  try {
    const body = await readJsonBody(req);
    if (route === 'coach') {
      const coachResponse = await createCoachResponse(body);
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(coachResponse));
      return;
    }

    const client = await createOpenAIClient();
    const response = await client.chat.completions.create({
      model: body.model || 'gpt-4o-mini',
      messages: body.messages,
      max_tokens: 700,
      temperature: 0.7,
    });
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ output: response.choices[0].message.content.trim() }));
  } catch (error) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: error?.message || 'Server error' }));
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  if (!process.env.OPENAI_API_KEY && env.OPENAI_API_KEY) {
    process.env.OPENAI_API_KEY = env.OPENAI_API_KEY;
  }

  return {
    plugins: [react(), localOpenAIProxy()],
    server: {
      host: '127.0.0.1',
      port: 3000,
      strictPort: true,
      hmr: false,
      watch: {
        ignored: ['**/node_modules.broken-*/**'],
      },
    },
    test: {
      environment: 'jsdom',
      setupFiles: './src/setupTests.js',
      globals: true,
      include: ['src/**/*.{test,spec}.{js,jsx}'],
      exclude: ['node_modules', 'dist', '.playwright-cli', 'node_modules.broken-*'],
    },
  };
});
