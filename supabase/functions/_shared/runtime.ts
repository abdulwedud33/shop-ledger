// Shared runtime for the AI Edge Functions (Deno). Secrets come only from function secrets, never from the client.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { LIMITS, isUuid } from './guardrails.ts';

declare const Deno: {
  env: {
    get(key: string): string | undefined;
  };
} | undefined;

export class HttpError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string) { super(code); this.status = status; this.code = code; }
}

export interface Ctx {
  client: SupabaseClient;         // acts as the signed-in user: RLS applies to every tool call
  admin: SupabaseClient;          // service role: ONLY for the rate limiter and usage log
  userId: string; shopId: string; role: 'owner' | 'cashier'; shopName: string; timezone: string;
  seen: Set<string>;              // every id returned by a tool this request (grounding)
  results: unknown[];             // every tool result (number grounding)
  drafts: unknown[];              // drafts created by propose_* tools
  tokensIn: number; tokensOut: number;
}

const env = (k: string) => (typeof Deno !== 'undefined' ? Deno.env.get(k) : process.env[k]) || (k === 'SUPABASE_URL' ? (typeof Deno !== 'undefined' ? Deno.env.get('NEXT_PUBLIC_SUPABASE_URL') : process.env.NEXT_PUBLIC_SUPABASE_URL) : k === 'SUPABASE_ANON_KEY' ? (typeof Deno !== 'undefined' ? Deno.env.get('NEXT_PUBLIC_SUPABASE_ANON_KEY') : process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) : '') || '';
const allowed = () => {
  const raw = env('ALLOWED_ORIGINS');
  if (!raw) return ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://localhost:4173', 'http://127.0.0.1:4173'];
  return raw.split(',').map((s: string) => s.trim()).filter(Boolean);
};

function cors(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') ?? '';
  const allowedList = allowed();
  const ok = allowedList.includes('*') || (origin && allowedList.includes(origin));
  return {
    'Access-Control-Allow-Origin': ok ? (allowedList.includes('*') ? (origin || '*') : origin) : 'null',
    'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
}

const json = (req: Request, status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors(req), 'Content-Type': 'application/json' } });

export type Agent = 'entry_parser' | 'insights' | 'reminder';

export function createHandler(agent: Agent, handler: (ctx: Ctx, body: Record<string, unknown>) => Promise<unknown>) {
  return async (req: Request): Promise<Response> => {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(req) });
    let ctx: Ctx | null = null;
    let ok = false;
    try {
      if (req.method !== 'POST') throw new HttpError(405, 'VALIDATION');
      if (env('AI_ENABLED') === 'false') throw new HttpError(503, 'AI_UNAVAILABLE');             // kill switch
      const raw = await req.text();
      if (raw.length > 4000) throw new HttpError(413, 'VALIDATION');
      let body: Record<string, unknown>;
      try { body = JSON.parse(raw || '{}'); } catch { throw new HttpError(400, 'VALIDATION'); }
      if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'VALIDATION');

      ctx = await authenticate(req);
      await limits(ctx);
      const result = await handler(ctx, body);
      ok = true;
      return json(req, 200, result);
    } catch (e) {
      const err = e instanceof HttpError ? e : new HttpError(500, 'AI_UNAVAILABLE');
      if (!(e instanceof HttpError)) console.error('ai error', agent, (e as Error)?.name); // no prompts, no personal data
      return json(req, err.status, { code: err.code });
    } finally {
      if (ctx) {
        // Usage log (service role). Failures here never affect the response.
        await ctx.admin.from('ai_usage').insert({ shop_id: ctx.shopId, user_id: ctx.userId, agent, input_tokens: ctx.tokensIn, output_tokens: ctx.tokensOut, ok }).then(() => {}, () => {});
      }
    }
  };
}

/** Wraps an agent handler with CORS, size limit, auth, kill switch, rate limits, budget and safe errors. */
export function serve(agent: Agent, handler: (ctx: Ctx, body: Record<string, unknown>) => Promise<unknown>) {
  const reqHandler = createHandler(agent, handler);
  // @ts-ignore Deno global in edge runtime
  if (typeof Deno !== 'undefined' && typeof Deno.serve === 'function') {
    // @ts-ignore
    Deno.serve(reqHandler);
  }
  return reqHandler;
}

async function authenticate(req: Request): Promise<Ctx> {
  const auth = req.headers.get('Authorization') ?? '';
  if (!auth.startsWith('Bearer ')) throw new HttpError(401, 'SESSION_EXPIRED');
  const client = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
  const { data: u, error } = await client.auth.getUser();
  if (error || !u.user) throw new HttpError(401, 'SESSION_EXPIRED');
  const { data: rows } = await client.from('shop_members').select('shop_id, role, shops(name, timezone)').eq('user_id', u.user.id).limit(1);
  const row = rows?.[0] as { shop_id: string; role: 'owner' | 'cashier'; shops: { name: string; timezone: string } | { name: string; timezone: string }[] } | undefined;
  if (!row) throw new HttpError(403, 'FORBIDDEN');
  const shop = Array.isArray(row.shops) ? row.shops[0] : row.shops;
  const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
  return { client, admin, userId: u.user.id, shopId: row.shop_id, role: row.role, shopName: shop?.name ?? '', timezone: shop?.timezone ?? 'UTC', seen: new Set(), results: [], drafts: [], tokensIn: 0, tokensOut: 0 };
}

async function limits(ctx: Ctx): Promise<void> {
  for (const [key, max, win] of [[`ai:${ctx.userId}`, 10, 60], [`ai-day:${ctx.userId}`, 200, 86400]] as const) {
    const { error } = await ctx.admin.rpc('rate_limit_hit', { p_key: key, p_max: max, p_window_seconds: win });
    if (error) throw new HttpError(429, 'RATE_LIMITED');
  }
  const cap = Number(env('AI_DAILY_TOKENS_PER_SHOP') || 200000);
  const since = new Date(); since.setUTCHours(0, 0, 0, 0);
  const { data } = await ctx.admin.from('ai_usage').select('input_tokens, output_tokens').eq('shop_id', ctx.shopId).gte('created_at', since.toISOString()).limit(1000);
  const used = (data ?? []).reduce((s: number, r: { input_tokens: number | null; output_tokens: number | null }) => s + (r.input_tokens ?? 0) + (r.output_tokens ?? 0), 0);
  if (used >= cap) throw new HttpError(429, 'RATE_LIMITED');
}

// ---------- tools + model loop ----------
export interface Tool {
  name: string; description: string; input_schema: Record<string, unknown>;
  run: (args: Record<string, unknown>) => Promise<unknown>;
}

interface Block { type: string; id?: string; name?: string; input?: Record<string, unknown>; text?: string }

/** Calls the Messages API (Anthropic or Gemini) with tools, a hard cap on turns and tool calls, and recorded results for grounding. */
export async function runAgent(ctx: Ctx, opts: { model: 'fast' | 'smart'; system: string; user: string; tools: Tool[]; maxTokens?: number }): Promise<string> {
  const antKey = env('ANTHROPIC_API_KEY') || '';
  const geminiKey = env('GEMINI_API_KEY') || (antKey && !antKey.startsWith('sk-ant-') && !env('ANTHROPIC_BASE_URL') ? antKey : '');
  const isGemini = Boolean(geminiKey && !env('ANTHROPIC_BASE_URL'));

  if (isGemini) {
    return runGeminiAgent(ctx, geminiKey, opts);
  }
  return runAnthropicAgent(ctx, opts);
}

async function runAnthropicAgent(ctx: Ctx, opts: { model: 'fast' | 'smart'; system: string; user: string; tools: Tool[]; maxTokens?: number }): Promise<string> {
  const model = opts.model === 'fast' ? (env('AI_MODEL_FAST') || 'claude-haiku-5-5') : (env('AI_MODEL_SMART') || 'claude-sonnet-5-5');
  const baseUrl = env('ANTHROPIC_BASE_URL') || 'https://api.anthropic.com';
  const endpoint = `${baseUrl.replace(/\/+$/, '')}/v1/messages`;
  const key = env('ANTHROPIC_API_KEY') || (env('ANTHROPIC_BASE_URL') ? 'mock-key' : '');
  if (!key) throw new HttpError(503, 'AI_UNAVAILABLE');
  const messages: { role: string; content: unknown }[] = [{ role: 'user', content: opts.user }];
  let calls = 0;

  for (let turn = 0; turn < LIMITS.maxTurns + 1; turn++) {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model, max_tokens: opts.maxTokens ?? 700, temperature: 0, system: opts.system, messages,
        tools: opts.tools.map(({ name, description, input_schema }) => ({ name, description, input_schema })),
      }),
      signal: AbortSignal.timeout(25_000),
    });
    if (!res.ok) throw new HttpError(502, 'AI_UNAVAILABLE');
    const data = await res.json() as { content: Block[]; stop_reason: string; usage?: { input_tokens?: number; output_tokens?: number } };
    ctx.tokensIn += data.usage?.input_tokens ?? 0;
    ctx.tokensOut += data.usage?.output_tokens ?? 0;

    const uses = data.content.filter((b) => b.type === 'tool_use');
    if (data.stop_reason !== 'tool_use' || uses.length === 0) {
      return data.content.filter((b) => b.type === 'text').map((b) => b.text ?? '').join('\n');
    }
    if (turn >= LIMITS.maxTurns) break;

    const out: unknown[] = [];
    for (const u of uses) {
      calls++;
      let result: unknown;
      const tool = opts.tools.find((t) => t.name === u.name);
      if (calls > LIMITS.maxToolCalls || !tool) result = { error: 'TOOL_LIMIT' };
      else {
        try { result = await tool.run(u.input ?? {}); } catch { result = { error: 'TOOL_FAILED' }; }
      }
      ctx.results.push(result);
      collectIds(result, ctx.seen);
      out.push({ type: 'tool_result', tool_use_id: u.id, content: `<untrusted_data name="tool_result">${JSON.stringify(result)}</untrusted_data>` });
    }
    messages.push({ role: 'assistant', content: data.content });
    messages.push({ role: 'user', content: out });
  }
  throw new HttpError(502, 'AI_UNAVAILABLE');
}

interface GeminiPart {
  text?: string;
  functionCall?: { name: string; args?: Record<string, unknown> };
  functionResponse?: { name: string; response: unknown };
}

interface GeminiContent {
  role: 'user' | 'model';
  parts: GeminiPart[];
}

async function runGeminiAgent(
  ctx: Ctx,
  key: string,
  opts: { model: 'fast' | 'smart'; system: string; user: string; tools: Tool[]; maxTokens?: number }
): Promise<string> {
  const model = opts.model === 'fast'
    ? (env('AI_MODEL_FAST') || 'gemini-3-flash-preview')
    : (env('AI_MODEL_SMART') || 'gemini-3-flash-preview');
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`;

  const contents: GeminiContent[] = [
    { role: 'user', parts: [{ text: opts.user }] },
  ];
  let calls = 0;

  for (let turn = 0; turn < LIMITS.maxTurns + 1; turn++) {
    const body: Record<string, unknown> = {
      systemInstruction: { parts: [{ text: opts.system }] },
      contents,
      generationConfig: {
        temperature: 0,
        maxOutputTokens: opts.maxTokens ?? 700,
      },
    };
    if (opts.tools.length > 0) {
      body.tools = [{
        functionDeclarations: opts.tools.map(({ name, description, input_schema }) => ({
          name,
          description,
          parameters: input_schema,
        })),
      }];
    }

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(25_000),
    });

    if (!res.ok) throw new HttpError(502, 'AI_UNAVAILABLE');

    const data = await res.json() as {
      candidates?: Array<{ content?: { role: 'user' | 'model'; parts: GeminiPart[] } }>;
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
    };

    ctx.tokensIn += data.usageMetadata?.promptTokenCount ?? 0;
    ctx.tokensOut += data.usageMetadata?.candidatesTokenCount ?? 0;

    const candidate = data.candidates?.[0]?.content;
    const parts = candidate?.parts ?? [];
    const functionCalls = parts.filter((p) => p.functionCall);

    if (functionCalls.length === 0) {
      return parts.filter((p) => p.text).map((p) => p.text).join('\n');
    }

    if (turn >= LIMITS.maxTurns) break;

    contents.push(candidate!);

    const responseParts: GeminiPart[] = [];
    for (const p of functionCalls) {
      const fc = p.functionCall!;
      calls++;
      let result: unknown;
      const tool = opts.tools.find((t) => t.name === fc.name);
      if (calls > LIMITS.maxToolCalls || !tool) {
        result = { error: 'TOOL_LIMIT' };
      } else {
        try {
          result = await tool.run(fc.args ?? {});
        } catch {
          result = { error: 'TOOL_FAILED' };
        }
      }
      ctx.results.push(result);
      collectIds(result, ctx.seen);

      responseParts.push({
        functionResponse: {
          name: fc.name,
          response: { result },
        },
      });
    }

    contents.push({ role: 'user', parts: responseParts });
  }

  throw new HttpError(502, 'AI_UNAVAILABLE');
}

function collectIds(v: unknown, into: Set<string>): void {
  if (typeof v === 'string') { if (isUuid(v)) into.add(v.toLowerCase()); }
  else if (Array.isArray(v)) v.forEach((x) => collectIds(x, into));
  else if (v && typeof v === 'object') Object.values(v).forEach((x) => collectIds(x, into));
}
