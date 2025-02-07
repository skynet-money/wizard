import * as readline from "readline";
import { HumanMessage } from "@langchain/core/messages";
import * as dotenv from "dotenv";
import { validateEnvironment, initializeAgent } from ".";

dotenv.config();

validateEnvironment();

console.log("wizard is up");

const WALLET_DATA_FILE = "wallet_data.txt";

async function runChatMode(agent: any, config: any) {
    console.log("Starting chat mode... Type 'exit' to end.");

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    const question = (prompt: string): Promise<string> =>
        new Promise(resolve => rl.question(prompt, resolve));

    try {
        // eslint-disable-next-line no-constant-condition
        while (true) {
            const userInput = await question("\nPrompt: ");

            if (userInput.toLowerCase() === "exit") {
                break;
            }

            const stream = await agent.stream({ messages: [new HumanMessage(userInput)] }, config);

            for await (const chunk of stream) {
                if ("agent" in chunk) {
                    console.log(chunk.agent.messages[0].content);
                } else if ("tools" in chunk) {
                    console.log(chunk.tools.messages[0].content);
                }
                console.log("-------------------");
            }
        }
    } catch (error) {
        if (error instanceof Error) {
            console.error("Error:", error.message);
        }
        process.exit(1);
    } finally {
        rl.close();
    }
}

async function start() {
    try {
        const { agent, config } = await initializeAgent();
        await runChatMode(agent,config);
    } catch (error) {
        if (error instanceof Error) {
            console.error("Error:", error.message);
        }
        process.exit(1);
    }
}

console.log("Starting Agent...");
start().catch(error => {
    console.error("Fatal error:", error);
    process.exit(1);
});