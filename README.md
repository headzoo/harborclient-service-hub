![HarborClient Server](images/logo.png)

**Full documentation:** [https://headzoo.github.io/harborclient-server/](https://headzoo.github.io/harborclient-server/)

**Linux CLI server for shared HarborClient storage and team workflows.**

`harborclient-server` is the central server companion to [HarborClient](https://github.com/harborclient/harborclient):

- **CLI-first:** Run and manage the server from the `harborclient-server` command.
- **Fastify HTTP API:** HTTP server scaffold ready for HarborClient desktop clients.
- **Configurable storage:** YAML-based server config with MySQL database support.

## Documentation

| Topic           | Link                                                                         |
| --------------- | ---------------------------------------------------------------------------- |
| Getting started | [Introduction](https://headzoo.github.io/harborclient-server/)               |
| Prerequisites   | [Prerequisites](https://headzoo.github.io/harborclient-server/prerequisites) |
| Setup           | [Setup](https://headzoo.github.io/harborclient-server/setup)                 |
| Development     | [Development](https://headzoo.github.io/harborclient-server/development)     |

Canonical docs live in [`docs/`](./docs/). Edit those pages directly, then run `pnpm docs:build:nav` to refresh the VitePress sidebar.

## Development

```bash
pnpm install
pnpm test
pnpm docs:serve    # VitePress dev server with nav watcher
pnpm docs:build    # production docs build
```

## License

MIT
