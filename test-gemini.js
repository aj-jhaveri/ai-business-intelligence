const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

async function testGemini() {
  try {
    console.log('API Key:', process.env.GEMINI_API_KEY ? 'Found' : 'Missing');
    
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    
    const result = await model.generateContent("Hello, can you respond with just 'API Working'?");
    const response = await result.response;
    console.log('Gemini Response:', response.text());
  } catch (error) {
    console.error('Gemini Error:', error.message);
  }
}

testGemini();
