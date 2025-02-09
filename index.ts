import {
    AgentKit,
    CdpWalletProvider,
    wethActionProvider,
    walletActionProvider,
    erc20ActionProvider,
    cdpApiActionProvider,
    cdpWalletActionProvider,
    pythActionProvider,
} from "@coinbase/agentkit";
import { getLangChainTools } from "@coinbase/agentkit-langchain";
import { HumanMessage } from "@langchain/core/messages";
import { MemorySaver } from "@langchain/langgraph";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { ChatOpenAI } from "@langchain/openai";
import * as dotenv from "dotenv";
import * as fs from "fs";
import { readPortfolio, splitString, updatePortfolio } from "./readPortfolio";
import { fetchCoins, Coin, fetchWETHPrice } from "./coinranking";

dotenv.config();

/**
 * Validates that required environment variables are set
 *
 * @throws {Error} - If required environment variables are missing
 * @returns {void}
 */
export function validateEnvironment(): void {
    const missingVars: string[] = [];

    // Check required variables
    const requiredVars = ["OPENAI_API_KEY", "CDP_API_KEY_NAME", "CDP_API_KEY_PRIVATE_KEY"];
    requiredVars.forEach(varName => {
        if (!process.env[varName]) {
            missingVars.push(varName);
        }
    });

    // Exit if any required variables are missing
    if (missingVars.length > 0) {
        console.error("Error: Required environment variables are not set");
        missingVars.forEach(varName => {
            console.error(`${varName}=your_${varName.toLowerCase()}_here`);
        });
        process.exit(1);
    }

    // Warn about optional NETWORK_ID
    if (!process.env.NETWORK_ID) {
        console.warn("Warning: NETWORK_ID not set, defaulting to base-sepolia testnet");
    }
}

validateEnvironment();

console.log("wizard is up");

// Configure a file to persist the agent's CDP MPC Wallet Data
const WALLET_DATA_FILE = "wallet_data.txt";
const TIME_BETWEEN_TRADES = 60000 // 3600000 // 1 hour

/**
 * Initialize the agent with CDP Agentkit
 *
 * @returns Agent executor and config
 */
export async function initializeAgent() {
    try {
        // Initialize LLM
        const llm = new ChatOpenAI({
            model: "gpt-4o-mini",
        });

        let walletDataStr: string | null = null;

        // Read existing wallet data if available
        if (fs.existsSync(WALLET_DATA_FILE)) {
            try {
                walletDataStr = fs.readFileSync(WALLET_DATA_FILE, "utf8");
            } catch (error) {
                console.error("Error reading wallet data:", error);
                // Continue without wallet data
            }
        }

        // Configure CDP Wallet Provider
        const config = {
            apiKeyName: process.env.CDP_API_KEY_NAME,
            apiKeyPrivateKey: process.env.CDP_API_KEY_PRIVATE_KEY?.replace(/\\n/g, "\n"),
            cdpWalletData: walletDataStr!,
            networkId: "base-mainnet",
        };

        const walletProvider = await CdpWalletProvider.configureWithWallet(config);

        // Initialize AgentKit
        const agentkit = await AgentKit.from({
            walletProvider,
            actionProviders: [
                wethActionProvider(),
                pythActionProvider(),
                walletActionProvider(),
                erc20ActionProvider(),
                cdpApiActionProvider({
                    apiKeyName: process.env.CDP_API_KEY_NAME,
                    apiKeyPrivateKey: process.env.CDP_API_KEY_PRIVATE_KEY?.replace(/\\n/g, "\n"),
                }),
                cdpWalletActionProvider({
                    apiKeyName: process.env.CDP_API_KEY_NAME,
                    apiKeyPrivateKey: process.env.CDP_API_KEY_PRIVATE_KEY?.replace(/\\n/g, "\n"),
                }),
            ],
        });

        const tools = await getLangChainTools(agentkit);

        // Store buffered conversation history in memory
        const memory = new MemorySaver();
        const agentConfig = { configurable: { thread_id: "skynet.money Market Wizard Agent" } };

        // Create React Agent using the LLM and CDP AgentKit tools
        const agent = createReactAgent({
            llm,
            tools,
            checkpointSaver: memory,
            messageModifier: `
            You are Market Wizard, an autonomous AI trader specializing in memecoins. 
            You analyze price data, market trends, and your current portfolio to make optimal trading decisions. 
            You can interact onchain using the Coinbase Developer Platform AgentKit and execute trades accordingly.
            Before making any trade, check your wallet details to determine which network you are on.
            If you need funds provide your wallet details and request funds from the user.
            Handle internal HTTP errors (5XX) by asking the user to retry later.
            If you are asked to perform an action beyond your current toolset, inform the user and suggest implementing it using the CDP SDK + AgentKit. 
            Recommend visiting docs.cdp.coinbase.com for more details.
            Be precise, efficient, and solely focused on profitable trading decisions. Refrain from unnecessary explanations unless explicitly requested.
            After receiving price updates and portfolio data, decide whether to execute a trade or hold. 
            Your objective: maximize profit, make the most amount of money.
            `,
        });

        // Save wallet data
        const exportedWallet = await walletProvider.exportWallet();
        fs.writeFileSync(WALLET_DATA_FILE, JSON.stringify(exportedWallet));

        return { agent, config: agentConfig, wallet: walletProvider };
    } catch (error) {
        console.error("Failed to initialize agent:", error);
        throw error; // Re-throw to be handled by caller
    }
}

/**
 * Run the agent autonomously with specified intervals
*
* @param agent - The agent executor
* @param config - Agent configuration
* @param interval - Time interval between actions in seconds
*/
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function runAutonomousMode(agent: any, config: any, wallet: CdpWalletProvider) {
    console.log("Starting autonomous mode...");

    // eslint-disable-next-line no-constant-condition
    while (true) {
        try {
            const response = await fetchCoins(process.env.COINRANKING_API_KEY as string);
            const formattedString = response.data.coins
                .map((coin) => {
                    const baseElement = coin.contractAddresses.find((item) => item.startsWith('base/')) as string;
                    const contractAddress = baseElement.split('base/')[1];
                    return `name: ${coin.name}, contractAddress: ${contractAddress}, price: ${coin.price} USD, 24h volume: ${coin["24hVolume"]}, 1h change: ${coin.change}%, market cap: ${coin.marketCap} USD`
                })
                .join("\n");

            const nameToAddressDictionary = response.data.coins.reduce((dict, coin) => {
                const baseElement = coin.contractAddresses.find((item) => item.startsWith('base/')) as string;
                const contractAddress = baseElement.split('base/')[1];
                dict[coin.name] = contractAddress;
                return dict;
            }, {} as Record<string, string>);

            const addressToPriceDictionary = response.data.coins.reduce((dict, coin) => {
                const baseElement = coin.contractAddresses.find((item) => item.startsWith('base/')) as string;
                const contractAddress = baseElement.split('base/')[1];
                dict[contractAddress] = coin;
                return dict
            }, {} as Record<string, Coin>)

            const portfolio = readPortfolio();

            const formattedPortfolioStrings: string[] = portfolio.map(item => {
                if (item.asset == "WETH") {
                    return `\n ${item.value} WETH. \n`;
                }
                return `${item.amount} of ${item.asset} bought at the price level of ${item.value} USDC. \n`;
            });

            // If you want to combine all the formatted strings into a single string:
            const combinedPortfolioString: string = formattedPortfolioStrings.join('');

            const price = await fetchWETHPrice(process.env.COINRANKING_API_KEY!);
            console.log("WETH price ", price)

            const thought =
                "The current WETH price is " + price + " USDC. \n" +
                "Your portfolio consists of the following elements, please pay extra careful attention to these portfolio elements and stay within their bounds. YOU CANNOT SPEND MORE WETH THAN YOU OWN: " +
                combinedPortfolioString +
                "Here are the latest current price updates for the biggest memecoins on Base: \n" +
                formattedString +
                "\n Please analyze the price updates and your current portfolio composition and decide if any of the tokens are be worth buying or selling. " +
                "Please act as an expert techincal analyist and consider all provided metrics, including the price, the 24h price change, the market cap, and the 24h volume. " +
                "You can either decide to buy any number of the tokens, sell any number of the tokens, or refrain from purchasing or selling. " +
                "Please stay within the limits of your overall capital. " +
                "Never invest all your capital into a single token. Diversify, or if there is only one token worth buying, only invest a portion of the total capital into it. " +
                "Only invest at max 5% of your capital into any single token. " +
                "Please be very precise and thorough in your calculations. When you calculate how much amount to sell of a given currency at the latest current price update, make sure that the portfolio amount never goes below zero. " +
                "Please do not execute any trades yet on-chain." +
                "Please pay careful attention to calculating the buy and sell amount. Never exceed what is specified in your portfolio. You can only sell assets that you own." +
                "Please do not buy or sell 0.0 amounts. If your best decision is to buy or sell 0.0 of something then refrain rather. " +
                "Please provide no analysis, and it is critical that you only reply in the format provided below: \n" +
                "It is of utmost importance that you only answer in the following format for each buy: <token name> buy <amount in WETH> " +
                "It is of utmost importance that you only answer in the following format for each sell: <token name> sell <amount> " + 
                "If you are not trading anything, please only reply with a single word only: 'refraining'."

            console.log(thought);

            const stream = await agent.stream({ messages: [new HumanMessage(thought)] }, config);

            let message: string = "";

            for await (const chunk of stream) {
                if ("agent" in chunk) {
                    console.log(chunk.agent.messages[0].content);
                    message = chunk.agent.messages[0].content as string;
                } else if ("tools" in chunk) {
                    console.log(chunk.tools.messages[0].content);
                    message = chunk.tools.messages[0].content as string;
                }
                console.log("-------------------");
            }

            let messages = message.split("\n")

            console.log("messages length: ", messages.length);

            if (message == "refraining") {
                await sleep(TIME_BETWEEN_TRADES);
                continue
            }
            
            for (let i = 0; i < messages.length; i++) {
                const messageParts = splitString(messages[i]);

                const token = messageParts[0]
                const action = messageParts[1]
                const amount = messageParts[2]
                const tokenAddress = nameToAddressDictionary[token]

                const wethAddress = "0x4200000000000000000000000000000000000006";

                let fromAsset: string;
                let toAsset: string;
                if (action == "buy") {
                    fromAsset = wethAddress;
                    toAsset = tokenAddress;
                } else if (action == "sell") {
                    fromAsset = tokenAddress;
                    toAsset = wethAddress;
                } else {
                    console.log("INVALID ACTION")
                    continue
                }

                if (parseFloat(amount) == 0) {
                    console.log("skipping zero amount")
                    continue
                }

                let trade = await wallet.createTrade({
                    amount: parseFloat(amount),
                    fromAssetId: fromAsset,
                    toAssetId: toAsset
                })

                console.log("trade: ", trade)
                await trade.wait();

                let status = await trade.getStatus();

                console.log("trade status: ", status);
                await sleep(5000);
            }

            console.log("Updating portfolio");

            const wethPriceUsd = await fetchWETHPrice(process.env.COINRANKING_API_KEY!)
            updatePortfolio(messages, nameToAddressDictionary, addressToPriceDictionary, wethPriceUsd);
            await sleep(TIME_BETWEEN_TRADES);
        } catch (error) {
            if (error instanceof Error) {
                console.error("Error:", error.message);
            }
            continue
        }
    }
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
    const { agent, config, wallet } = await initializeAgent();

    try {
        await runAutonomousMode(agent, config, wallet);
    } catch (error) {
        if (error instanceof Error) {
            console.error("Error:", error.message);
        }
        process.exit(1);
    }
}


if (require.main === module) {
    console.log("Starting Agent...");
    main().catch(error => {
        console.error("Fatal error:", error);
        process.exit(1);
    });
}