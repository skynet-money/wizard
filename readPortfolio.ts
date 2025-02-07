import { time } from 'console';
import fs from 'fs';
import { TokenPriceResponse } from './coingecko';

interface PortfolioItem {
    asset: string;
    address: string;
    value: number;
    amount: number;
    purchased: number;
}

interface PortfolioItemAction {
    name: string;
    address: string;
    value: number;
    isBuy: boolean;
    purchased: number;
}

const filePath = './portfolio.json';

export function readPortfolio(): PortfolioItem[] {
    try {
        const fileContent = fs.readFileSync(filePath, 'utf-8');
        const items: PortfolioItem[] = JSON.parse(fileContent);

        return items;
    } catch (error) {
        console.error("Error parsing portfolio investments: ", error);
        throw error;
    }
}

export function updatePortfolio(messages: string[], dict: Record<string, string>, addressToTokenPrices: Record<string, TokenPriceResponse>) {
    let portfolioItemsBuy: Record<string, PortfolioItemAction> = {}
    let portfolioItemsSell: Record<string, PortfolioItemAction> = {}

    let totalAmountBuy: number = 0
    let totalAmountSell: number = 0

    for (let i = 0; i < messages.length; i++) {
        const messageParts = splitString(messages[i]);
        console.log("message: ", messages[i])
        console.log("message parts: ", messageParts)
        const token = messageParts[0]
        const action = messageParts[1]
        const usdcAmount = messageParts[2]
        const tokenAddress = dict[token]
        const item: PortfolioItemAction = { name: token, address: tokenAddress, value: parseFloat(usdcAmount), isBuy: action == "buy", purchased: Date.now() }

        console.log("item: ", item)
        if (item.isBuy) {
            totalAmountBuy += item.value
            portfolioItemsBuy[token] = item
        } else {
            totalAmountSell += item.value
            portfolioItemsSell[token] = item
        }
    }

    console.log("total buy: ", totalAmountBuy)
    console.log("total sell: ", totalAmountSell)

    const portfolio = readPortfolio();

    for (let i = 0; i < portfolio.length; i++) {
        console.log("updating: ", portfolio[i].asset)

        if (portfolio[i].asset == "USDC") {
            portfolio[i].value += totalAmountSell - totalAmountBuy
            portfolio[i].purchased = Date.now()
            continue
        }

        // calculate how much the amount is in dst token
        if (addressToTokenPrices[portfolio[i].address] == undefined || addressToTokenPrices[portfolio[i].address][portfolio[i].address] == undefined) {
            continue
        }

        const { usd } = addressToTokenPrices[portfolio[i].address][portfolio[i].address];

        if (portfolioItemsBuy[portfolio[i].asset] != undefined && portfolioItemsBuy[portfolio[i].asset].value != 0) {
            const amountToken = portfolioItemsBuy[portfolio[i].asset].value / usd;
            // set usdc value
            portfolio[i].value = usd
            // add to amount
            portfolio[i].amount += amountToken
        }

        if (portfolioItemsSell[portfolio[i].asset] != undefined && portfolioItemsSell[portfolio[i].asset].value != 0) {
            const amountToken = portfolioItemsSell[portfolio[i].asset].value / usd;
            // set usdc value
            portfolio[i].value = usd
            // substract from amount
            portfolio[i].amount -= amountToken
        }
        portfolio[i].purchased = Date.now()
    }

    const jsonString: string = JSON.stringify(portfolio, null, 2);

    try {
        fs.writeFileSync(filePath, jsonString, 'utf-8');
        console.log("portfolio updated")
    } catch (error) {
        console.error("Error updating portfolio: ", error)
    }
}

function splitString(input: string): string[] {
    // Split the string into an array of words
    const words = input.split(' ');

    // Find the index of "buy" or "sell"
    const actionIndex = words.findIndex(word => word === "buy" || word === "sell");

    if (actionIndex === -1) {
        throw new Error("Invalid input: 'buy' or 'sell' not found");
    }

    // Extract the first part (all words before the action)
    const firstPart = words.slice(0, actionIndex).join(' ');

    // Extract the action, amount, and currency
    const action = words[actionIndex];
    const amount = words[actionIndex + 1];
    const currency = words[actionIndex + 2];

    // Return the result as an array
    return [firstPart, action, amount, currency];
}