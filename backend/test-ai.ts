import { ExpenseAiService } from './src/modules/expenses/expense.ai.service';
import dotenv from 'dotenv';

dotenv.config();

async function test() {
  try {
    const service = new ExpenseAiService();
    const result = await service.parseText("Zomato 350 UPI", [], true);
    console.log(result);
  } catch (err) {
    console.error("ERROR HAPPENED:", err);
  }
}

test();
