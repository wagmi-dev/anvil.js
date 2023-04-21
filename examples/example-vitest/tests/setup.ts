import { getAnvilProxyLogs } from "@fubhy/anvil";
import { afterAll, afterEach } from "vitest";
import { pool, testClient } from "./utils.js";
import { FORK_BLOCK_NUMBER, FORK_URL } from "./constants.js";

afterAll(async () => {
  // If you are using a fork, you can reset your anvil instance to the initial fork block.
  await testClient.reset({
    jsonRpcUrl: FORK_URL,
    blockNumber: FORK_BLOCK_NUMBER,
  });
});

afterEach((context) => {
  context.onTestFailed(async () => {
    // If a test fails, you can fetch and print the logs of your anvil instance.
    const logs = await getAnvilProxyLogs("http://localhost:8545", pool);
    // Only print the 20 most recent log messages.
    console.log(logs.slice(-20));
  });
});
