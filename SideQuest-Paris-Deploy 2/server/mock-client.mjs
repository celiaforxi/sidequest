import { emptyIntent } from '../dist/intent.mjs';
// A deterministic fixture, not language understanding. Never contacts OpenAI.
export async function mockIntent(){return {...emptyIntent(),weatherChange:'rain',energy:2};}
