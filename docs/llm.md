# LLM Proxy

Team Hub can proxy LLM requests so desktop clients never receive provider API keys. Keys are configured in `server.yaml`; user access and monthly token limits are managed via the CLI.

## Configuration

Add an optional `llm` section to `server.yaml`:

```yaml
llm:
  providers:
    openai:
      apiKey: sk-...
    claude:
      apiKey: sk-ant-...
    gemini:
      apiKey: ...
  models:
    - gpt-4o
    - claude-3-5-sonnet-20241022
    - gemini-1.5-pro
```

When `models` is omitted, every catalog model whose provider has a configured key is offered.

## User access

Grant LLM access when creating or updating a user:

```bash
team-hub user create \
  --name alice \
  --role user \
  --collection-access '*' \
  --environment-access '*' \
  --llm-access \
  --llm-model '*' \
  --llm-monthly-tokens 100000
```

| Flag | Purpose |
| ---- | ------- |
| `--llm-access` | Enable hub-proxied LLM routes |
| `--llm-model <id>` | Allowed model id or `*` (repeatable) |
| `--llm-monthly-tokens <n>` | Monthly token limit (omit for unlimited) |

Use `team-hub user update <id> --no-llm-access` to revoke access.

## Agent loop

HarborClient keeps orchestrating the tool loop locally. Each LLM completion step is sent to `POST /llm/chat/step`; the hub forwards tool definitions and the system prompt to the provider and returns tool calls for the client to execute.

## Monthly limits

Token usage is tracked per UTC calendar month. When a user exceeds their limit, new user messages are rejected with `402`. In-flight tool loops may finish because continuation steps (last message role `tool`) are still accepted.

## Usage logging

Team Hub stores LLM usage in two places:

| Store | Purpose |
| ----- | ------- |
| `llm_usage` | Monthly rollup per user for limits and `team-hub user list` totals |
| `llm_usage_log` | Per-request audit trail for each successful `POST /llm/chat/step` |

Each log row records the user, API token (when present), UTC month, model, provider, token counts, whether the step started a new user turn, whether tool calls were returned, message count, and completion timestamp. Message content is not stored.

Inspect log entries from the CLI:

```bash
team-hub llm list
```

## Endpoints

See [API Endpoints — LLM](./endpoints.md#llm-routes) for request and response shapes.
