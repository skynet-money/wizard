import axios from 'axios';

// Define the structure of the response object
export interface TokenPriceResponse {
  [contractAddress: string]: {
    usd: number;
    usd_market_cap: number;
    usd_24h_vol: number;
    usd_24h_change: number;
    last_updated_at: number;
  };
}

// Function to fetch token price data
export async function getTokenPrice(contractAddresses: string): Promise<TokenPriceResponse> {
  const url = 'https://api.coingecko.com/api/v3/simple/token_price/base';
  
  try {
    const response = await axios.get<TokenPriceResponse>(url, {
      params: {
        contract_addresses: contractAddresses,
        vs_currencies: 'usd',
        include_market_cap: 'true',
        include_24hr_vol: 'true',
        include_24hr_change: 'true',
        include_last_updated_at: 'true',
      },
    });

    // Return the parsed response data
    return response.data;
  } catch (error) {
    console.error('Error fetching token price:', error);
    throw error;
  }
}