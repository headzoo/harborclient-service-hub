import { Command } from 'commander';
import type { FastifyInstance } from 'fastify';
import { mergeGlobalOptions } from '#/cli/globalOptions.js';
import type { ServerConfig } from '#/config/serverConfig.js';
import { loadServerConfig } from '#/config/serverConfig.js';
import { createDatabase, type IDatabase } from '#/db/index.js';
import { createServer } from '#/index.js';
import { createThrottleStore } from '#/server/auth/throttle/createThrottleStore.js';
import type { IThrottleStore } from '#/server/auth/throttle/IThrottleStore.js';

export interface StartCommandOptions {
  /**
   * When true, enables verbose server logging.
   */
  verbose?: boolean;

  /**
   * Path to the server YAML config file (from global `-c` / `--config`).
   */
  config: string;
}

export interface RunServerOptions {
  /**
   * When true, logs resolved config and enables Fastify request logging.
   */
  verbose?: boolean;

  /**
   * Database instance to connect before listen and disconnect on shutdown.
   */
  db: IDatabase;

  /**
   * Throttle store to connect before listen and disconnect on shutdown.
   */
  throttleStore: IThrottleStore;
}

/**
 * Formats a listen address for user-facing console output.
 *
 * Wildcard bind addresses (`0.0.0.0`, `::`) are shown as localhost so operators
 * know which URL to open locally.
 *
 * @param address - Address returned by the HTTP server after listen.
 * @param port - TCP port the server is listening on.
 * @returns HTTP URL suitable for display (e.g. `http://127.0.0.1:8787`).
 */
function formatListenAddress(address: string | null, port: number): string {
  if (!address) {
    return `http://127.0.0.1:${port}`;
  }

  if (address === '0.0.0.0' || address === '::') {
    return `http://127.0.0.1:${port}`;
  }

  const host = address.includes(':') && !address.startsWith('[') ? `[${address}]` : address;
  return `http://${host}:${port}`;
}

/**
 * Registers SIGINT and SIGTERM handlers that close the Fastify instance cleanly.
 *
 * @param app - Running Fastify server to shut down on signal.
 * @param db - Database to disconnect during shutdown.
 * @param throttleStore - Throttle store to disconnect during shutdown.
 */
function registerGracefulShutdown(
  app: FastifyInstance,
  db: IDatabase,
  throttleStore: IThrottleStore
): void {
  /**
   * Closes the server and exits the process after a termination signal.
   *
   * @param signal - Signal that triggered shutdown.
   */
  const shutdown = async (signal: NodeJS.Signals) => {
    app.log.info(`Received ${signal}, shutting down.`);
    await app.close();
    await db.disconnect();
    await throttleStore.disconnect();
    process.exit(0);
  };

  /**
   * Forwards SIGINT to the shared shutdown handler.
   */
  process.once('SIGINT', () => {
    void shutdown('SIGINT');
  });

  /**
   * Forwards SIGTERM to the shared shutdown handler.
   */
  process.once('SIGTERM', () => {
    void shutdown('SIGTERM');
  });
}

/**
 * Creates, listens on, and runs the Service Hub HTTP server until shutdown.
 *
 * @param config - Validated host and port from the config file.
 * @param options - Runtime options such as verbose logging and the database instance.
 * @returns The listening Fastify instance (also registered for graceful shutdown).
 */
export async function runServer(
  config: ServerConfig,
  options: RunServerOptions
): Promise<FastifyInstance> {
  const app = await createServer(config, {
    verbose: options.verbose,
    db: options.db,
    throttleStore: options.throttleStore
  });

  await options.db.connect();
  await options.throttleStore.connect();

  await app.listen({
    host: config.host,
    port: config.port
  });

  const address = app.server.address();
  const port = typeof address === 'object' && address ? address.port : config.port;
  const host = typeof address === 'object' && address ? address.address : config.host;

  if (options.verbose) {
    console.log('Starting server with config:', config);
  }

  console.log(`Service Hub listening on ${formatListenAddress(host, port)}`);

  registerGracefulShutdown(app, options.db, options.throttleStore);

  return app;
}

/**
 * CLI handler for the `start` subcommand: loads config and runs the server.
 *
 * @param options - Parsed start command options including config path.
 */
export async function startCommand(options: StartCommandOptions): Promise<void> {
  const config = loadServerConfig(options.config);
  const db = createDatabase(config.db);
  const throttleStore = createThrottleStore(config.redis);
  await runServer(config, { verbose: options.verbose, db, throttleStore });
}

/**
 * Registers the `start` subcommand on a Commander program.
 *
 * @param program - Root or parent Commander instance.
 * @param handler - Action to run when `start` is invoked (defaults to {@link startCommand}).
 */
export function registerStartCommand(
  program: Command,
  handler: (options: StartCommandOptions) => Promise<void> = startCommand
): void {
  program
    .command('start')
    .description('Start the Service Hub server')
    .action(
      /**
       * Runs the start subcommand after merging global CLI options.
       */
      async function startAction(this: Command, options: StartCommandOptions) {
        await handler(mergeGlobalOptions(this, options));
      }
    );
}
