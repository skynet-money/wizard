import fs from 'fs';

interface PortfolioItem {
    name: string;
    address: string;
    value: number;
    purchased: number;
}

const filePath = './portfolio.json';

export function readPortfolio(): PortfolioItem[] {
    try {
        const fileContent = fs.readFileSync(filePath, 'utf-8');
        const items: PortfolioItem[] = JSON.parse(fileContent);

        return items;
    } catch(error) {
        console.error("Error parsing portfolio investments: ", error);
        throw error;
    }
}