import { execa, type ExecaChildProcess } from "execa";
import { Writable } from "node:stream";

export type AnvilOptions = {
  /**
   * Sets the number of assumed available compute units per second for this fork provider.
   *
   * @defaultValue 350
   * @see https://github.com/alchemyplatform/alchemy-docs/blob/master/documentation/compute-units.md#rate-limits-cups
   */
  computeUnitsPerSecond?: number | undefined;
  /**
   * Fetch state over a remote endpoint instead of starting from an empty state.
   *
   * If you want to fetch state from a specific block number, add a block number like `http://localhost:8545@1400000`
   * or use the `forkBlockNumber` option.
   */
  forkUrl?: string | undefined;
  /**
   * Fetch state from a specific block number over a remote endpoint.
   *
   * Requires `forkUrl` to be set.
   */
  forkBlockNumber?: number | bigint | undefined;
  /**
   * Specify chain id to skip fetching it from remote endpoint. This enables offline-start mode.
   *
   * You still must pass both `forkUrl` and `forkBlockNumber`, and already have your required state cached
   * on disk, anything missing locally would be fetched from the remote.
   */
  forkChainId?: number | undefined;
  /**
   * Initial retry backoff on encountering errors.
   */
  forkRetryBackoff?: number | undefined;
  /**
   * Disables rate limiting for this node's provider.
   *
   * @defaultValue false
   * @see https://github.com/alchemyplatform/alchemy-docs/blob/master/documentation/compute-units.md#rate-limits-cups
   */
  noRateLimit?: boolean | undefined;
  /**
   * Explicitly disables the use of RPC caching.
   *
   * All storage slots are read entirely from the endpoint.
   */
  noStorageCaching?: boolean | undefined;
  /**
   * Number of retry requests for spurious networks (timed out requests).
   *
   * @defaultValue 5
   */
  retries?: number | undefined;
  /**
   * Timeout in ms for requests sent to remote JSON-RPC server in forking mode.
   *
   * @defaultValue 45000
   */
  timeout?: number | undefined;
  /**
   * The base fee in a block.
   */
  blockBaseFeePerGas?: number | bigint | undefined;
  /**
   * The chain id.
   */
  chainId?: number | undefined;
  /**
   * EIP-170: Contract code size limit in bytes. Useful to increase this because of tests.
   *
   * @defaultValue 0x6000 (~25kb)
   */
  codeSizeLimit?: number | undefined;
  /**
   * Disable the `call.gas_limit <= block.gas_limit` constraint.
   */
  disableBlockGasLimit?: boolean | undefined;
  /**
   * The block gas limit.
   */
  gasLimit?: number | bigint | undefined;
  /**
   * The gas price.
   */
  gasPrice?: number | bigint | undefined;
  /**
   * Number of dev accounts to generate and configure.
   *
   * @defaultValue 10
   */
  accounts?: number | undefined;
  /**
   * The balance of every dev account in Ether.
   *
   * @defaultValue 10000
   */
  balance?: number | bigint | undefined;
  /**
   * Sets the derivation path of the child key to be derived.
   *
   * @defaultValue m/44'/60'/0'/0/
   */
  derivationPath?: string | undefined;
  /**
   * BIP39 mnemonic phrase used for generating accounts.
   */
  mnemonic?: string | undefined;
  /**
   * Port number to listen on.
   *
   * @defaultValue 8545
   */
  port?: number | undefined;
  /**
   * Enable steps tracing used for debug calls returning geth-style traces.
   */
  stepsTracing?: boolean | undefined;
  /**
   * The timestamp of the genesis block.
   */
  timestamp?: number | bigint | undefined;
  /**
   * Set the Access-Control-Allow-Origin response header (CORS).
   *
   * @defaultValue *
   */
  allowOrigin?: string | undefined;
  /**
   * Block time in seconds for interval mining.
   */
  blockTime?: number | undefined;
  /**
   * Writes output of `anvil` as json to user-specified file.
   */
  configOut?: string | undefined;
  /**
   * Dump the state of chain on exit to the given file. If the value is a directory, the state will be
   * written to `<VALUE>/state.json`.
   */
  dumpState?: string | undefined;
  /**
   * The EVM hardfork to use.
   */
  hardFork?: string | undefined;
  /**
   * The host the server will listen on.
   */
  host?: string | undefined;
  /**
   * Initialize the genesis block with the given `genesis.json` file.
   */
  init?: string | undefined;
  /**
   * Launch an ipc server at the given path or default path = `/tmp/anvil.ipc`.
   */
  ipc?: string | undefined;
  /**
   * Initialize the chain from a previously saved state snapshot.
   */
  loadState?: string | undefined;
  /**
   * Disable CORS.
   */
  noCors?: boolean | undefined;
  /**
   * Disable auto and interval mining, and mine on demand instead.
   */
  noMining?: boolean | undefined;
  /**
   * How transactions are sorted in the mempool.
   *
   * @defaultValue fees
   */
  order?: string | undefined;
  /**
   * Don't keep full chain history. If a number argument is specified, at most this number of states is kept in memory.
   */
  pruneHistory?: number | undefined | boolean;
  /**
   * Interval in seconds at which the status is to be dumped to disk.
   */
  stateInterval?: number | undefined;
  /**
   * Don't print anything on startup and don't print logs.
   */
  silent?: boolean | undefined;
  /**
   * This is an alias for both `loadState` and `dumpState`. It initializes the chain with the state stored at the
   * file, if it exists, and dumps the chain's state on exit
   */
  state?: string | undefined;
  /**
   * Number of blocks with transactions to keep in memory.
   */
  transactionBlockKeeper?: number | undefined;
};

export type StartAnvilOptions = AnvilOptions & {
  /**
   * Allowed time for anvil to start up in milliseconds.
   *
   * @defaultValue 10_000
   */
  startUpTimeout?: number | undefined;
};

export function startAnvil({
  startUpTimeout = 10_000,
  ...opts
}: StartAnvilOptions = {}) {
  let resolve: (value: Anvil) => void = () => {};
  let reject: (reason: Error) => void = () => {};

  const resolvable = new Promise<Anvil>((resolve_, reject_) => {
    resolve = resolve_;
    reject = reject_;

    // If anvil fails to start up in time, we reject the promise.
    setTimeout(() => {
      let message = "Anvil failed to start in time";
      const logs = recorder.flush();

      if (logs.length > 0) {
        message += `:\n\n${logs.join("\n")}}`;
      }

      reject(new Error(message));
    }, startUpTimeout);
  });

  // We know that anvil has started when it prints this message.
  const host = opts.host ?? "127.0.0.1";
  const port = opts.port ?? 8545;
  const message = `Listening on ${host}:${port}`;
  let started = false;

  const controller = new AbortController();
  const recorder = new LogRecorder((value) => {
    if (!started && value.includes(message)) {
      started = true;
      resolve(instance);
    }
  });

  const args = Object.entries({
    ...(opts.port ? { "--port": `${opts.port}` } : {}),
    ...(opts.forkUrl ? { "--fork-url": opts.forkUrl } : {}),
    ...(opts.forkBlockNumber
      ? { "--fork-block-number": `${Number(opts.forkBlockNumber)}` }
      : {}),
    ...(opts.blockTime ? { "--block-time": `${opts.blockTime}` } : {}),
    // TODO: Fill in the other options here and refactor this to make it more readable.
  }).flatMap(([key, value]) => [key, value]);

  const subprocess = execa("anvil", args, {
    signal: controller.signal,
    cleanup: true,
    all: true,
  });

  // Assign the anvil instance that is returned from the promise.
  const instance = new Anvil(subprocess, controller, recorder, opts);

  // rome-ignore lint/style/noNonNullAssertion: this is guaranteed to be set with `all: true`.
  subprocess.pipeAll!(recorder);
  subprocess.catch((error) => reject(error));

  return resolvable;
}

export class Anvil {
  public readonly options: AnvilOptions;
  public readonly process: ExecaChildProcess;
  private readonly controller: AbortController;
  private readonly recorder: LogRecorder;

  constructor(
    subprocess: ExecaChildProcess,
    controller: AbortController,
    recorder: LogRecorder,
    options: AnvilOptions,
  ) {
    this.process = subprocess;
    this.controller = controller;
    this.recorder = recorder;
    this.options = options;
  }

  public async exit(reason?: string) {
    if (!this.controller.signal.aborted) {
      this.controller.abort(reason);
    }

    try {
      await this.process;
    } catch {}
  }

  public get port() {
    return this.options.port ?? 8545;
  }

  public get logs() {
    return this.recorder.flush();
  }
}

class LogRecorder extends Writable {
  private readonly callback: (message: string) => void;
  private readonly messages: string[] = [];

  constructor(callback: (message: string) => void) {
    super();
    this.callback = callback;
  }

  // rome-ignore lint/suspicious/noExplicitAny: that's literally the type here ...
  override _write(chunk: any, _: string, next: (error?: Error) => void) {
    const message = chunk.toString().trim();
    this.messages.push(message);

    // Limit the number of messages we store.
    if (this.messages.length > 100) {
      this.messages.shift();
    }

    this.callback(message);
    next();
  }

  public flush() {
    return this.messages.splice(0, this.messages.length);
  }
}
