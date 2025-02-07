import fs from 'fs';

// Define the structure of the objects in the JSON file
interface Memecoin {
  name: string;
  symbol: string;
  address: string;
}

const filePath = './base_top_memecoins.json'; // Path to the JSON file

// Function to read and parse the JSON file
export function readMemecoinsFile(): Memecoin[] {
  try {
    // Read the file synchronously
    const fileContent = fs.readFileSync(filePath, 'utf-8');

    // Parse the JSON content into an array of Memecoin objects
    const memecoins: Memecoin[] = JSON.parse(fileContent);

    return memecoins;
  } catch (error) {
    console.error('Error reading or parsing the file:', error);
    throw error;
  }
}