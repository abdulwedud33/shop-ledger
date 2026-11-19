import http from 'node:http';

export interface MockAnthropicConfig {
  mode?: 'normal' | 'rate_limit' | 'server_error' | 'ungrounded_numbers' | 'unsafe_reminder';
  port?: number;
}

export interface MockServerInstance {
  url: string;
  close: () => Promise<void>;
  setConfig: (config: MockAnthropicConfig) => void;
  getConfig: () => MockAnthropicConfig;
  getCallCount: () => number;
}

/**
 * Lightweight local HTTP server simulating the Anthropic Messages API (`POST /v1/messages`).
 * Can simulate normal tool calling, text completion, 429 rate limits, 500 errors,
 * ungrounded numbers, and unsafe reminders.
 */
export async function startMockAnthropicServer(initialConfig: MockAnthropicConfig = {}): Promise<MockServerInstance> {
  let config = { ...initialConfig };
  let calls = 0;

  const server = http.createServer(async (req, res) => {
    calls++;
    if (req.method !== 'POST' || !req.url?.startsWith('/v1/messages')) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { type: 'not_found_error', message: 'Not found' } }));
      return;
    }

    const apiKey = req.headers['x-api-key'];
    if (!apiKey) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { type: 'authentication_error', message: 'Missing API Key' } }));
      return;
    }

    // Read body
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const bodyStr = Buffer.concat(chunks).toString('utf-8');
    let body: any;
    try {
      body = JSON.parse(bodyStr);
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { type: 'invalid_request_error', message: 'Invalid JSON' } }));
      return;
    }

    // 1. Rate limit simulation
    if (config.mode === 'rate_limit') {
      res.writeHead(429, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { type: 'rate_limit_error', message: 'Rate limit exceeded' } }));
      return;
    }

    // 2. Server error simulation
    if (config.mode === 'server_error') {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { type: 'api_error', message: 'Anthropic service error' } }));
      return;
    }

    const messages = Array.isArray(body.messages) ? body.messages : [];
    const lastMsg = messages[messages.length - 1];
    const system = String(body.system || '');
    const tools = Array.isArray(body.tools) ? body.tools : [];

    // Check if this is a follow-up after tool_result
    const hasToolResult = Array.isArray(lastMsg?.content) && lastMsg.content.some((c: any) => c.type === 'tool_result');

    // 3. Response Generation based on context & tool loop
    if (!hasToolResult) {
      // First turn: check if tools should be invoked
      if (system.includes('entryParserSystem') || system.includes('Identify items, quantities, customer')) {
        // Entry parser first turn: search products or customers
        if (body.system.includes('search_products') && tools.some((t: any) => t.name === 'search_products')) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            id: 'msg_mock_1',
            type: 'message',
            role: 'assistant',
            stop_reason: 'tool_use',
            content: [
              {
                type: 'tool_use',
                id: 'toolu_prod_search',
                name: 'search_products',
                input: { query: 'sugar' },
              },
            ],
            usage: { input_tokens: 120, output_tokens: 45 },
          }));
          return;
        }
      }

      if (system.includes('insightsSystem') || system.includes('write a short, plain-language summary')) {
        // Insights first turn: call get_dashboard_summary
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          id: 'msg_mock_ins',
          type: 'message',
          role: 'assistant',
          stop_reason: 'tool_use',
          content: [
            {
              type: 'tool_use',
              id: 'toolu_dash_summary',
              name: 'get_dashboard_summary',
              input: { period: 'today' },
            },
          ],
          usage: { input_tokens: 180, output_tokens: 50 },
        }));
        return;
      }

      if (system.includes('reminderSystem') || system.includes('get_customer_balance')) {
        // Reminder first turn: call get_customer_balance
        const custMatch = system.match(/Customer id:\s*([0-9a-f-]{36})/i);
        const custId = custMatch ? custMatch[1] : '00000000-0000-0000-0000-000000000001';
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          id: 'msg_mock_rem',
          type: 'message',
          role: 'assistant',
          stop_reason: 'tool_use',
          content: [
            {
              type: 'tool_use',
              id: 'toolu_cust_bal',
              name: 'get_customer_balance',
              input: { customer_id: custId },
            },
          ],
          usage: { input_tokens: 150, output_tokens: 40 },
        }));
        return;
      }
    }

    // Second turn (after tool execution) or direct text response
    if (system.includes('insightsSystem')) {
      if (config.mode === 'ungrounded_numbers') {
        // Injects invented numbers not in tool results (e.g. 99999)
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          id: 'msg_mock_ins_bad',
          type: 'message',
          role: 'assistant',
          stop_reason: 'end_turn',
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                summary: 'Today you made 99999 ETB in invented revenue across 888 transactions.',
                suggestions: [{ kind: 'other', text: 'Invented profit 77777 ETB', ref_id: null }],
                unavailable: [],
              }),
            },
          ],
          usage: { input_tokens: 220, output_tokens: 85 },
        }));
        return;
      }

      // Normal grounded insights
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        id: 'msg_mock_ins_ok',
        type: 'message',
        role: 'assistant',
        stop_reason: 'end_turn',
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              summary: 'Today sales look steady. All totals match your ledger.',
              suggestions: [{ kind: 'restock', text: 'Monitor low stock items', ref_id: null }],
              unavailable: [],
            }),
          },
        ],
        usage: { input_tokens: 250, output_tokens: 70 },
      }));
      return;
    }

    if (system.includes('reminderSystem')) {
      if (config.mode === 'unsafe_reminder') {
        // Threatening/shaming reminder
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          id: 'msg_mock_rem_bad',
          type: 'message',
          role: 'assistant',
          stop_reason: 'end_turn',
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                status: 'draft_ready',
                message: 'Pay your balance of 500.00 ETB immediately or face the police and court arrest!',
                tone: 'formal',
              }),
            },
          ],
          usage: { input_tokens: 210, output_tokens: 60 },
        }));
        return;
      }

      // Safe polite reminder
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        id: 'msg_mock_rem_ok',
        type: 'message',
        role: 'assistant',
        stop_reason: 'end_turn',
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              status: 'draft_ready',
              message: 'Hello Abebe, this is Test Store. A gentle reminder that your balance is 500.00 ETB. When can you pay? Thank you.',
              tone: 'friendly',
            }),
          },
        ],
        usage: { input_tokens: 210, output_tokens: 65 },
      }));
      return;
    }

    // Default entry parser second turn
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      id: 'msg_mock_entry_ok',
      type: 'message',
      role: 'assistant',
      stop_reason: 'end_turn',
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            intent: 'sale',
            status: 'draft_ready',
            confidence: 'high',
            clarifications: [],
            memory_suggestion: null,
            note: null,
          }),
        },
      ],
      usage: { input_tokens: 200, output_tokens: 50 },
    }));
  });

  await new Promise<void>((resolve) => {
    server.listen(config.port ?? 0, '127.0.0.1', () => resolve());
  });

  const address = server.address() as any;
  const url = `http://127.0.0.1:${address.port}`;

  return {
    url,
    close: () => new Promise((resolve) => server.close(() => resolve())),
    setConfig: (newConfig: MockAnthropicConfig) => { config = { ...newConfig }; },
    getConfig: () => ({ ...config }),
    getCallCount: () => calls,
  };
}
