export interface Coin {
    uuid: string;
    symbol: string;
    name: string;
    color: string;
    iconUrl: string;
    marketCap: string;
    price: string;
    listedAt: number;
    change: string;
    rank: number;
    sparkline: string[];
    lowVolume: boolean;
    coinrankingUrl: string;
    "24hVolume": string;
    btcPrice: string;
    contractAddresses: string[];
}

interface Stats {
    total: number;
    totalCoins: number;
    totalMarkets: number;
    totalExchanges: number;
    totalMarketCap: string;
    total24hVolume: string;
}

interface ApiResponse {
    status: string;
    data: {
        stats: Stats;
        coins: Coin[];
    };
}

interface CoinPriceResponse {
    status: string;
    data: {
        price: string;
        timestamp: number;
    };
}

export async function fetchCoins(apiKey: string): Promise<ApiResponse> {
    const url = new URL('https://api.coinranking.com/v2/coins');
    url.searchParams.append('timePeriod', '1h');
    url.searchParams.append('blockchains[]', 'base');
    url.searchParams.append('tags[]', 'meme');

    const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
            'x-access-token': apiKey,
        },
    });

    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data: ApiResponse = await response.json();
    return data;
}

export async function fetchWETHPrice(apiKey: string): Promise<number> {
    const wethUUID = "Mtfb0obXVh59u"
    const url = `https://api.coinranking.com/v2/coin/${wethUUID}/price`;
  
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'x-access-token': apiKey,
      },
    });
  
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
  
    const data: CoinPriceResponse = await response.json();
    return parseFloat(data.data.price);
  }