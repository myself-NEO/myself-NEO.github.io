
import { GoogleGenAI } from "@google/genai";

const API_KEY = process.env.API_KEY || "";

export const getGeminiResponse = async (userMessage: string, history: { role: 'user' | 'model', parts: { text: string }[] }[]) => {
  if (!API_KEY) return "The AI assistant is currently sleeping. (API key missing)";

  try {
    const ai = new GoogleGenAI({ apiKey: API_KEY });
    const chat = ai.chats.create({
      model: 'gemini-3-flash-preview',
      config: {
        systemInstruction: `You are Keshav's AI portfolio assistant. Keshav is a software engineer currently at Google, previously at Optum, and an alum of NIT Raipur (2021). 
        His skills include Java, Spring Boot, Python, REST APIs, Angular, and Google Ad Manager. 
        Be professional, concise, and helpful. If asked about contact info, tell them to use the contact form or email him directly.`,
      },
    });

    const result = await chat.sendMessage({ message: userMessage });
    return result.text;
  } catch (error) {
    console.error("Gemini Error:", error);
    return "I'm sorry, I'm having trouble thinking right now. Please try again later!";
  }
};
