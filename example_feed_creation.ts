/**
 * Creates a new account, inititalizes a Switchboard Resource Account on it
 *
 * Using that it should:
 *
 * DEMO --
 * Creates a new Aggregator
 * Creates a new Job (ftx btc/usd),
 * Adds Job to Aggregator
 * Push Aggregator to Crank
 */
import { Buffer } from "buffer";
import { AptosClient, AptosAccount, FaucetClient, HexString } from "aptos";
import {
  LeaseAccount,
  AptosEvent,
  EventCallback,
  OracleJob,
  createFeed,
  JobAccount,
} from "./src";
import Big from "big.js";

const NODE_URL = "https://fullnode.devnet.aptoslabs.com/v1";
const FAUCET_URL = "https://faucet.devnet.aptoslabs.com";

const SWITCHBOARD_DEVNET_ADDRESS =
  "0xb27f7bbf7caf2368b08032d005e8beab151a885054cdca55c4cc644f0a308d2b";

const SWITCHBOARD_QUEUE_ADDRESS =
  "0xbdb92db64cc9b3072381c5f98c57ef77c9ceb12163187b1e691b8a677a015f61";

const SWITCHBOARD_CRANK_ADDRESS =
  "0xb27f7bbf7caf2368b08032d005e8beab151a885054cdca55c4cc644f0a308d2b";

const onAggregatorUpdate = (
  client: AptosClient,
  cb: EventCallback,
  pollIntervalMs: number = 1000
) => {
  const event = new AptosEvent(
    client,
    HexString.ensure(SWITCHBOARD_DEVNET_ADDRESS),
    `${SWITCHBOARD_DEVNET_ADDRESS}::switchboard::State`,
    "aggregator_update_events",
    pollIntervalMs
  );
  event.onTrigger(cb);
  return event;
};

// run it all at once
(async () => {
  // INFRA ------
  const client = new AptosClient(NODE_URL);
  const faucetClient = new FaucetClient(NODE_URL, FAUCET_URL);

  // create new user
  let user = new AptosAccount();

  await faucetClient.fundAccount(user.address(), 50000);
  console.log(`User account ${user.address().hex()} created + funded.`);

  const aggregator_acct = new AptosAccount();
  await faucetClient.fundAccount(aggregator_acct.address(), 50000);

  // Make Job data for btc price
  const serializedJob = Buffer.from(
    OracleJob.encodeDelimited(
      OracleJob.create({
        tasks: [
          {
            httpTask: {
              url: "https://www.binance.us/api/v3/ticker/price?symbol=BTCUSD",
            },
          },
          {
            jsonParseTask: {
              path: "$.price",
            },
          },
        ],
      })
    ).finish()
  );

  const [aggregator, createFeedTx] = await createFeed(
    client,
    user,
    {
      authority: user.address(),
      queueAddress: SWITCHBOARD_QUEUE_ADDRESS,
      batchSize: 1,
      minJobResults: 1,
      minOracleResults: 1,
      minUpdateDelaySeconds: 5,
      varianceThreshold: new Big(0),
      coinType: "0x1::aptos_coin::AptosCoin",
      crank: SWITCHBOARD_CRANK_ADDRESS,
      initialLoadAmount: 1000,
      jobs: [
        {
          name: "BTC/USD",
          metadata: "binance",
          authority: user.address().hex(),
          data: serializedJob.toString("base64"),
          weight: 1,
        },
      ],
    },
    SWITCHBOARD_DEVNET_ADDRESS
  );

  console.log(
    `Created Aggregator and Lease resources at account address ${aggregator.address}. Tx hash ${createFeedTx}`
  );

  /**
   * Log Data Objects
   */
  console.log("logging all data objects");
  console.log("Aggregator:", await aggregator.loadData());
  console.log(
    "Lease:",
    await new LeaseAccount(
      client,
      aggregator.address,
      SWITCHBOARD_DEVNET_ADDRESS
    ).loadData()
  );
  console.log("Load aggregator jobs data", await aggregator.loadJobs());
})();
