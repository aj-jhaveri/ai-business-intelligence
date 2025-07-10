// server.js - AI Business Intelligence Backend
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const csv = require('csv-parser');
const fs = require('fs');
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Serve demo datasets
app.use('/demo-datasets', express.static('demo-datasets'));

// CSV Download endpoints
app.get('/api/download/ecommerce', (req, res) => {
  const filePath = 'demo-datasets/ecommerce-sales.csv';
  res.download(filePath, 'ecommerce-sample.csv', (err) => {
    if (err) {
      console.error('Download error:', err);
      res.status(500).json({ error: 'Failed to download file' });
    }
  });
});

app.get('/api/download/saas', (req, res) => {
  const filePath = 'demo-datasets/saas-metrics.csv';
  res.download(filePath, 'saas-sample.csv', (err) => {
    if (err) {
      console.error('Download error:', err);
      res.status(500).json({ error: 'Failed to download file' });
    }
  });
});

app.get('/api/download/restaurant', (req, res) => {
  const filePath = 'demo-datasets/restaurant-daily-pnl.csv';
  res.download(filePath, 'restaurant-sample.csv', (err) => {
    if (err) {
      console.error('Download error:', err);
      res.status(500).json({ error: 'Failed to download file' });
    }
  });
});

app.get('/api/download/consulting', (req, res) => {
  const filePath = 'demo-datasets/consulting-revenue.csv';
  res.download(filePath, 'consulting-sample.csv', (err) => {
    if (err) {
      console.error('Download error:', err);
      res.status(500).json({ error: 'Failed to download file' });
    }
  });
});

app.get('/api/download/retail', (req, res) => {
  const filePath = 'demo-datasets/retail-inventory.csv';
  res.download(filePath, 'retail-sample.csv', (err) => {
    if (err) {
      console.error('Download error:', err);
      res.status(500).json({ error: 'Failed to download file' });
    }
  });
});

// Configure multer for file uploads
const upload = multer({ 
  dest: 'uploads/',
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// In-memory data store (in production, use Redis or database)
const dataStore = new Map();
const analysisCache = new Map();

// Rate limiting for API requests
const requestTimes = new Map();
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const MAX_REQUESTS_PER_MINUTE = 10;

// Utility function to parse CSV
const parseCSVFile = (filePath) => {
  return new Promise((resolve, reject) => {
    const results = [];
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (data) => results.push(data))
      .on('end', () => {
        fs.unlinkSync(filePath); // Clean up uploaded file
        resolve(results);
      })
      .on('error', reject);
  });
};

// Data analysis utilities
const analyzeDataStructure = (data) => {
  if (!data || data.length === 0) return null;
  
  const sample = data[0];
  const columns = Object.keys(sample);
  const analysis = {
    totalRows: data.length,
    columns: columns,
    columnTypes: {},
    sampleData: data.slice(0, 3),
    summary: {
      dateColumns: [],
      numericColumns: [],
      categoricalColumns: []
    }
  };

  // Analyze column types
  columns.forEach(col => {
    const values = data.slice(0, 100).map(row => row[col]).filter(v => v && v.trim() !== '');
    
    if (values.length === 0) {
      analysis.columnTypes[col] = 'empty';
      return;
    }

    // Check if date
    const isDate = values.some(v => !isNaN(Date.parse(v)));
    if (isDate) {
      analysis.columnTypes[col] = 'date';
      analysis.summary.dateColumns.push(col);
      return;
    }

    // Check if numeric
    const numericValues = values.filter(v => !isNaN(parseFloat(v.toString().replace(/[,$]/g, ''))));
    if (numericValues.length > values.length * 0.7) {
      analysis.columnTypes[col] = 'numeric';
      analysis.summary.numericColumns.push(col);
      return;
    }

    // Default to categorical
    analysis.columnTypes[col] = 'categorical';
    analysis.summary.categoricalColumns.push(col);
  });

  return analysis;
};

const generateDataSummary = (data, analysis) => {
  const summary = {
    overview: `Dataset contains ${analysis.totalRows} records with ${analysis.columns.length} columns`,
    keyMetrics: {},
    trends: {}
  };

  // Calculate key metrics for numeric columns
  analysis.summary.numericColumns.forEach(col => {
    const values = data.map(row => {
      const val = row[col];
      return parseFloat(val.toString().replace(/[,$]/g, ''));
    }).filter(v => !isNaN(v));

    if (values.length > 0) {
      summary.keyMetrics[col] = {
        total: values.reduce((a, b) => a + b, 0),
        average: values.reduce((a, b) => a + b, 0) / values.length,
        min: Math.min(...values),
        max: Math.max(...values),
        count: values.length
      };
    }
  });

  return summary;
};

// Routes

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Upload and process dataset
app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { datasetName, description } = req.body;
    
    // Parse CSV file
    const data = await parseCSVFile(req.file.path);
    
    if (data.length === 0) {
      return res.status(400).json({ error: 'Empty or invalid CSV file' });
    }

    // Analyze data structure
    const analysis = analyzeDataStructure(data);
    const summary = generateDataSummary(data, analysis);

    // Store in memory (use database in production)
    const datasetId = Date.now().toString();
    dataStore.set(datasetId, {
      id: datasetId,
      name: datasetName || req.file.originalname,
      description: description || '',
      data: data,
      analysis: analysis,
      summary: summary,
      uploadedAt: new Date().toISOString()
    });

    res.json({
      success: true,
      datasetId: datasetId,
      analysis: analysis,
      summary: summary,
      message: `Successfully processed ${data.length} records`
    });

  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Failed to process file' });
  }
});

// Get all datasets
app.get('/api/datasets', (req, res) => {
  const datasets = Array.from(dataStore.values()).map(dataset => ({
    id: dataset.id,
    name: dataset.name,
    description: dataset.description,
    rowCount: dataset.data.length,
    columnCount: dataset.analysis.columns.length,
    uploadedAt: dataset.uploadedAt
  }));
  
  res.json({ datasets });
});

// Get specific dataset info
app.get('/api/datasets/:id', (req, res) => {
  const dataset = dataStore.get(req.params.id);
  if (!dataset) {
    return res.status(404).json({ error: 'Dataset not found' });
  }
  
  res.json({
    id: dataset.id,
    name: dataset.name,
    description: dataset.description,
    analysis: dataset.analysis,
    summary: dataset.summary,
    sampleData: dataset.data.slice(0, 10) // Return first 10 rows
  });
});

// Rate limiting middleware
const checkRateLimit = (req, res, next) => {
  const clientIP = req.ip || req.connection.remoteAddress;
  const now = Date.now();
  
  if (!requestTimes.has(clientIP)) {
    requestTimes.set(clientIP, []);
  }
  
  const requests = requestTimes.get(clientIP);
  
  // Remove old requests outside the window
  const recentRequests = requests.filter(time => now - time < RATE_LIMIT_WINDOW);
  
  if (recentRequests.length >= MAX_REQUESTS_PER_MINUTE) {
    console.log(`Rate limit exceeded for IP: ${clientIP}`);
    return res.status(429).json({ 
      error: 'Rate limit exceeded. Please wait before making another request.',
      isRateLimit: true,
      retryAfter: Math.ceil(RATE_LIMIT_WINDOW / 1000)
    });
  }
  
  recentRequests.push(now);
  requestTimes.set(clientIP, recentRequests);
  
  next();
};

// AI-powered query endpoint
app.post('/api/query', checkRateLimit, async (req, res) => {
  try {
    console.log('=== /api/query REQUEST START ===');
    console.log('Request body:', JSON.stringify(req.body, null, 2));
    console.log('Request headers:', req.headers);
    
    const { question, query, datasetId, context } = req.body;
    
    // Handle both 'question' and 'query' parameters for flexibility
    const userQuery = question || query;
    
    console.log('Extracted parameters:');
    console.log('- userQuery:', userQuery);
    console.log('- datasetId:', datasetId);
    console.log('- context:', context);
    
    if (!userQuery || !datasetId) {
      console.log('ERROR: Missing required parameters');
      return res.status(400).json({ error: 'Question/query and datasetId are required' });
    }

    const dataset = dataStore.get(datasetId);
    if (!dataset) {
      console.log('ERROR: Dataset not found for ID:', datasetId);
      console.log('Available datasets:', Array.from(dataStore.keys()));
      return res.status(404).json({ error: 'Dataset not found' });
    }

    console.log('Dataset found:', dataset.name, 'with', dataset.data.length, 'rows');

    // Check cache first
    const cacheKey = `${datasetId}-${userQuery}`;
    if (analysisCache.has(cacheKey)) {
      console.log('Returning cached response for query:', userQuery);
      return res.json(analysisCache.get(cacheKey));
    }

    // Prepare context for AI with safety checks
    console.log('Preparing data context...');
    
    if (!dataset.data || !Array.isArray(dataset.data)) {
      console.log('ERROR: Dataset data is invalid or missing');
      return res.status(500).json({ error: 'Dataset data is invalid or missing' });
    }
    
    if (!dataset.analysis || !dataset.analysis.columns || !dataset.analysis.columnTypes) {
      console.log('ERROR: Dataset analysis is incomplete');
      return res.status(500).json({ error: 'Dataset analysis is incomplete' });
    }
    
    const dataContext = {
      datasetInfo: {
        name: dataset.name || 'Unknown Dataset',
        rowCount: dataset.data.length,
        columns: dataset.analysis.columns || [],
        columnTypes: dataset.analysis.columnTypes || {},
        summary: dataset.summary || {}
      },
      fullDataset: dataset.data, // FULL dataset for real calculations
      sampleData: dataset.data.slice(0, 10), // More sample data for context
      previousContext: context || []
    };
    
    console.log('Data context prepared successfully');

    // Determine business type for specialized analysis
    const businessType = dataContext.datasetInfo.name.toLowerCase();
    let industrySpecialization = '';
    let specificKPIs = '';
    
    if (businessType.includes('ecommerce') || businessType.includes('sales')) {
      industrySpecialization = 'E-commerce/Retail Operations with expertise in conversion optimization, customer lifetime value, and multi-channel strategy';
      specificKPIs = 'AOV (Average Order Value), CAC (Customer Acquisition Cost), LTV (Lifetime Value), Conversion Rate, Return Rate, Profit Margins by Channel';
    } else if (businessType.includes('saas') || businessType.includes('metrics')) {
      industrySpecialization = 'SaaS Growth Strategy with expertise in subscription metrics, churn reduction, and product-led growth';
      specificKPIs = 'MRR (Monthly Recurring Revenue), ARR (Annual Recurring Revenue), Churn Rate, CAC Payback Period, Net Revenue Retention, Feature Adoption';
    } else if (businessType.includes('restaurant') || businessType.includes('pnl')) {
      industrySpecialization = 'Restaurant/Food Service Operations with expertise in cost control, labor optimization, and profitability management';
      specificKPIs = 'Food Cost %, Labor Cost %, Average Order Value, Table Turnover, Gross Margin, Daily Revenue per Seat';
    } else if (businessType.includes('consulting') || businessType.includes('project')) {
      industrySpecialization = 'Professional Services/Consulting with expertise in project profitability, client satisfaction, and resource utilization';
      specificKPIs = 'Project Margin %, Utilization Rate, Client Satisfaction Score, Repeat Business Rate, Average Project Value, Hourly Billing Rate';
    } else if (businessType.includes('retail') || businessType.includes('inventory')) {
      industrySpecialization = 'Retail Inventory Management with expertise in demand forecasting, inventory optimization, and supply chain efficiency';
      specificKPIs = 'Inventory Turnover, Stockout Rate, Carrying Cost %, Gross Margin by Category, Seasonal Demand Variance, Reorder Efficiency';
    } else {
      industrySpecialization = 'Multi-Industry Business Analysis with expertise in operational efficiency and strategic growth';
      specificKPIs = 'Revenue Growth Rate, Profit Margins, Operational Efficiency, Market Share, Customer Satisfaction';
    }

    console.log('Preparing AI context and prompt...');
    
    // Enterprise approach: Send full datasets up to 800k tokens (roughly 4000 rows)
    let datasetSample = dataContext.fullDataset;
    let datasetSampleSize = dataContext.fullDataset.length;
    
    // Only limit if dataset is truly massive (>4000 rows)
    if (dataContext.fullDataset.length > 4000) {
      datasetSample = dataContext.fullDataset.slice(0, 1000);
      datasetSampleSize = 1000;
      console.log('Massive dataset detected (>4000 rows), using first 1000 rows for analysis');
    } else {
      console.log(`Sending full dataset: ${datasetSampleSize} rows (enterprise approach)`);
    }
    
    // Create enhanced AI prompt for sophisticated analysis with REAL CALCULATIONS
    const prompt = `
You are a seasoned C-suite business consultant with 15+ years of Fortune 500 experience, specializing in ${industrySpecialization}.

CRITICAL: You MUST perform REAL mathematical calculations using the ACTUAL data provided. NEVER use placeholder values like "ARR of $XXX" or "Revenue of $YYY". Calculate exact numbers from the dataset.

MANDATORY CALCULATION REQUIREMENT:
- Calculate actual totals from this data
- Do not use placeholders like $XXX
- Use real numbers only
- Show your mathematical work
- Sum, average, and analyze the actual values provided

BUSINESS CONTEXT:
Dataset: ${dataContext.datasetInfo.name}
Records: ${dataContext.datasetInfo.rowCount.toLocaleString()}
Dimensions: ${dataContext.datasetInfo.columns.length} columns
Coverage: ${dataContext.datasetInfo.columns.join(', ')}

INDUSTRY-SPECIFIC KPIs TO ANALYZE: ${specificKPIs}

DATA ARCHITECTURE:
${Object.entries(dataContext.datasetInfo.columnTypes).map(([col, type]) => `• ${col}: ${type}`).join('\n')}

COMPLETE DATASET FOR CALCULATIONS (All ${datasetSampleSize} rows):
${JSON.stringify(datasetSample, null, 2)}
${dataContext.fullDataset.length > datasetSampleSize ? `\n... and ${dataContext.fullDataset.length - datasetSampleSize} more records available for calculations` : ''}

DATASET SUMMARY FOR CALCULATIONS:
- Total Records: ${dataContext.fullDataset.length}
- Sample shown above for pattern recognition
- Full dataset statistics: ${JSON.stringify(dataContext.datasetInfo.summary, null, 2)}

EXECUTIVE SUMMARY METRICS:
${JSON.stringify(dataContext.datasetInfo.summary, null, 2)}

EXECUTIVE INQUIRY: "${userQuery}"

MANDATORY CALCULATION REQUIREMENTS:
- CALCULATE actual totals, averages, percentages from the real data
- PERFORM mathematical operations on the numeric columns
- GENERATE specific dollar amounts, percentages, and metrics
- NEVER use template responses like "$XXX" or "XX%" 
- SHOW your work with actual numbers from the dataset
- EXAMPLE: If revenue column has values [1250.00, 890.50, 2100.75], calculate total as $4,241.25
- EXAMPLE: If 30 out of 100 customers churned, report "30% churn rate" not "XX% churn rate"
- FORBIDDEN: Any response containing $XXX, XX%, or similar placeholders

RESPONSE FRAMEWORK:
Provide a comprehensive C-level analysis demonstrating $120k+ strategic consulting expertise:

1. STRATEGIC ANALYSIS: Direct, data-driven answer with quantitative backing using REAL calculated numbers
2. BUSINESS INTELLIGENCE: 3-5 key insights with ACTUAL percentages and dollar amounts
3. EXECUTIVE RECOMMENDATIONS: Specific, actionable steps with REAL ROI projections based on data
4. OPERATIONAL METRICS: CALCULATED KPIs with exact numbers from the dataset
5. PREDICTIVE INSIGHTS: Forward-looking analysis using real trend calculations
6. RISK ASSESSMENT: Quantified risks with actual impact calculations

JSON Response Structure:
{
  "answer": "Executive-level strategic answer with SPECIFIC calculated metrics (e.g., 'Total revenue is $2,654,892' not '$XXX')",
  "insights": [
    "Advanced business insight with REAL calculated impact (e.g., '23.4% increase in Q3' not 'XX% increase')",
    "Pattern recognition with SPECIFIC competitive implications using actual numbers", 
    "Operational efficiency opportunity with REAL cost/benefit calculations",
    "Market positioning insight with CALCULATED metrics and percentages",
    "Risk/opportunity assessment with ACTUAL timeline projections and dollar amounts"
  ],
  "recommendations": [
    "Immediate tactical action with REAL 30-90 day ROI projection calculated from data",
    "Strategic initiative with SPECIFIC resource requirements based on actual calculations", 
    "Operational optimization with REAL cost-benefit analysis using dataset numbers",
    "Investment/technology recommendation with CALCULATED financial justification"
  ],
  "calculations": {
    "total_revenue": "Actual calculated total (e.g., $2,654,892)",
    "growth_rate": "Real percentage calculated from data (e.g., 23.4%)",
    "average_order_value": "Calculated AOV (e.g., $127.53)",
    "monthly_recurring_revenue": "Actual MRR calculation (e.g., $45,230)",
    "profit_margin": "Real calculated margin (e.g., 34.7%)"
  },
  "risks": [
    "Primary business risk with CALCULATED impact (e.g., 'Could reduce revenue by $125,000')",
    "Market/competitive risk with QUANTIFIED monitoring approach"
  ],
  "opportunities": [
    "High-impact opportunity with REAL implementation priority and calculated value",
    "Strategic advantage with SPECIFIC competitive positioning metrics"
  ],
  "visualizations": [
    "Executive dashboard component (trend analysis with real data points)",
    "Performance comparison visualization with actual calculated metrics",
    "Strategic planning chart recommendation with real projections"
  ],
  "confidence": "high/medium/low",
  "followUpQuestions": [
    "Strategic follow-up question for deeper analysis",
    "Operational question for implementation planning"
  ],
  "industryBenchmarks": {
    "benchmark_1": "Industry comparison with REAL percentile ranking calculated from data",
    "benchmark_2": "Competitive positioning insight with actual calculated metrics"
  }
}

CALCULATION ENFORCEMENT:
- MANDATORY: Calculate exact totals from revenue/sales columns
- MANDATORY: Calculate real percentages from actual data relationships  
- MANDATORY: Generate specific dollar amounts for all financial metrics
- MANDATORY: Show growth rates as real percentages (e.g., 23.4%, not XX%)
- MANDATORY: Calculate actual averages, medians, and statistical measures
- MANDATORY: Sum all numeric values and show exact results
- MANDATORY: Count actual records and show specific numbers
- FORBIDDEN: Using placeholder values like $XXX, XX%, or template responses
- FORBIDDEN: Generic responses without specific calculated numbers
- FORBIDDEN: Responses like "Revenue of $XXX" or "Growth of XX%"

CALCULATION EXAMPLES FROM ACTUAL DATA:
- If you see revenue values like [1250.00, 890.50, 2100.75] in the data, calculate: Total Revenue = $4,241.25
- If you see 30 churned customers out of 100 total, calculate: Churn Rate = 30%
- If you see Q1 revenue $100K and Q2 revenue $123K, calculate: Growth Rate = 23%

ANALYSIS STANDARDS:
- Use sophisticated business terminology appropriate for C-suite presentation
- Calculate and reference industry-specific KPIs: ${specificKPIs} with REAL numbers
- Include SPECIFIC percentages, ratios, and financial metrics calculated from data
- Reference industry best practices with CALCULATED competitive benchmarks
- Provide actionable recommendations with REAL ROI projections based on data analysis
- Show advanced analytical thinking with CALCULATED predictive insights
- Demonstrate strategic business acumen with ACTUAL calculated financial impact
- Include QUANTIFIED risk assessment with calculated mitigation strategies
- Suggest specific next steps with REAL resource requirements based on data
- Reference industry trends with CALCULATED competitive positioning metrics

INDUSTRY CONTEXT: Apply your specialized knowledge in ${industrySpecialization} to provide insights with REAL calculated numbers that demonstrate deep sector expertise and strategic thinking that would impress Fortune 500 executives.

FINAL REQUIREMENT: Every financial figure, percentage, and metric MUST be calculated from the actual dataset. No placeholders allowed.
`;

    console.log('=== GEMINI REQUEST DIAGNOSTICS ===');
    console.log('Prompt length:', prompt.length, 'characters');
    console.log('Prompt preview (first 500 chars):', prompt.substring(0, 500));
    console.log('Dataset size being sent:', dataContext.fullDataset.length, 'rows');
    console.log('Full dataset JSON size:', JSON.stringify(dataContext.fullDataset).length, 'characters');
    console.log('Sample data JSON size:', JSON.stringify(dataContext.sampleData).length, 'characters');
    console.log('Timestamp:', new Date().toISOString());
    
    // Check if prompt is truly massive (800k tokens = ~3.2M characters)
    const MAX_PROMPT_SIZE = 3200000; // 3.2M characters (~800k tokens)
    if (prompt.length > MAX_PROMPT_SIZE) {
      console.log('WARNING: Prompt size', prompt.length, 'exceeds enterprise limit of', MAX_PROMPT_SIZE);
      console.log('This may cause token limit errors');
    } else {
      console.log('Prompt size within enterprise limits:', prompt.length, 'characters');
    }
    console.log('=== END DIAGNOSTICS ===');
    
    console.log('=== WHAT GEMINI IS RECEIVING ===');
    console.log('Prompt preview:', prompt.substring(0, 1000));
    console.log('Contains actual revenue data:', prompt.includes('revenue') || prompt.includes('Revenue') || prompt.includes('REVENUE'));
    console.log('Contains actual dollar amounts:', prompt.includes('$') || prompt.includes('.00') || prompt.includes('.50'));
    console.log('Contains actual numeric data:', /\d+\.\d+/.test(prompt));
    console.log('First data sample from prompt:', JSON.stringify(datasetSample[0]));
    console.log('=== END GEMINI INPUT ===');
    
    console.log('Calling Gemini AI...');
    
    // Check if model is initialized
    if (!model) {
      console.log('ERROR: Gemini AI model not initialized');
      return res.status(500).json({ error: 'AI model not initialized' });
    }
    
    // Enhanced retry logic for Gemini API calls with rate limiting
    async function callGeminiWithRetry(model, prompt, maxRetries = 5) {
      for (let i = 0; i < maxRetries; i++) {
        try {
          console.log(`Attempt ${i + 1} calling Gemini...`);
          const result = await model.generateContent(prompt);
          console.log(`Attempt ${i + 1} succeeded!`);
          return result;
        } catch (error) {
          console.log('=== GEMINI ERROR DETAILS ===');
          console.log('Error message:', error.message);
          console.log('Error status:', error.status || 'No status');
          console.log('Error code:', error.code || 'No code');
          console.log('Full error:', error);
          console.log('=== END ERROR ===');
          
          console.log(`Attempt ${i + 1} failed:`, error.message);
          
          // Handle rate limiting and service overload
          if (error.message.includes('503') || 
              error.message.includes('overloaded') || 
              error.message.includes('unavailable') ||
              error.message.includes('rate limit') ||
              error.message.includes('429')) {
            if (i < maxRetries - 1) {
              // Exponential backoff with jitter for rate limiting
              const baseDelay = 1000 * Math.pow(2, i);
              const jitter = Math.random() * 1000;
              const delay = baseDelay + jitter;
              console.log(`Rate limited or service overloaded, retrying in ${Math.round(delay)}ms...`);
              await new Promise(resolve => setTimeout(resolve, delay));
              continue;
            }
          }
          throw error;
        }
      }
    }
    
    // Call Gemini AI with timeout and error handling
    let result;
    let responseText;
    
    try {
      result = await callGeminiWithRetry(model, prompt);
      if (!result || !result.response) {
        throw new Error('Invalid response from AI model');
      }
      responseText = result.response.text();
      
      if (!responseText) {
        throw new Error('Empty response from AI model');
      }
    } catch (aiError) {
      console.log('ERROR: AI model failed after retries:', aiError.message);
      return res.status(500).json({ 
        error: 'AI model failed to generate response', 
        details: aiError.message,
        isRetryable: aiError.message.includes('503') || aiError.message.includes('overloaded')
      });
    }
    
    console.log('AI Response received, length:', responseText.length);
    console.log('First 200 chars:', responseText.substring(0, 200));
    
	// Clean up the response and parse JSON
	let aiResponse;
	let cleanText = responseText;

	// Remove markdown code blocks if present
	if (cleanText.includes('```json')) {
	  const jsonMatch = cleanText.match(/```json\s*([\s\S]*?)\s*```/);
	  if (jsonMatch) {
		cleanText = jsonMatch[1];
	  }
	}

	console.log('Attempting to parse JSON...');
	try {
	  aiResponse = JSON.parse(cleanText);
	  console.log('JSON parsed successfully');
	} catch (parseError) {
	  console.log('JSON parse error:', parseError.message);
	  console.log('Clean text that failed to parse:', cleanText.substring(0, 500));
	  aiResponse = {
		answer: cleanText,
		insights: [],
		recommendations: [],
		calculations: {},
		visualizations: [],
		confidence: "medium",
		followUpQuestions: []
	  };
	}

    const response = {
      success: true,
      query: userQuery,
      response: aiResponse,
      timestamp: new Date().toISOString(),
      datasetInfo: {
        name: dataset.name,
        rowCount: dataset.data.length
      }
    };
    
    console.log('Response prepared successfully');

    // Cache the response
    analysisCache.set(cacheKey, response);
    
    res.json(response);

  } catch (error) {
    console.error('=== QUERY ERROR ===');
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    console.error('Error details:', error);
    console.error('Request body that caused error:', req.body);
    console.error('=== END ERROR ===');
    
    res.status(500).json({ 
      error: 'Failed to process query',
      details: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Demo dataset endpoints
app.get('/api/demo/ecommerce', async (req, res) => {
  try {
    const data = await parseCSVFromFile('demo-datasets/ecommerce-sales.csv');
    const analysis = analyzeDataStructure(data);
    const summary = generateDataSummary(data, analysis);
    
    const datasetId = 'demo-ecommerce-' + Date.now();
    dataStore.set(datasetId, {
      id: datasetId,
      name: 'E-commerce Sales Analytics Demo',
      description: '$2M+ annual revenue with customer analytics',
      data: data,
      analysis: analysis,
      summary: summary,
      uploadedAt: new Date().toISOString()
    });

    res.json({
      success: true,
      datasetId: datasetId,
      analysis: analysis,
      summary: summary,
      message: `Demo E-commerce dataset loaded: ${data.length} records`
    });
  } catch (error) {
    console.error('E-commerce demo error:', error);
    res.status(500).json({ error: 'Failed to load E-commerce demo dataset' });
  }
});

app.get('/api/demo/saas', async (req, res) => {
  try {
    const data = await parseCSVFromFile('demo-datasets/saas-metrics.csv');
    const analysis = analyzeDataStructure(data);
    const summary = generateDataSummary(data, analysis);
    
    const datasetId = 'demo-saas-' + Date.now();
    dataStore.set(datasetId, {
      id: datasetId,
      name: 'SaaS Growth Metrics Demo',
      description: 'MRR/ARR tracking with customer analytics',
      data: data,
      analysis: analysis,
      summary: summary,
      uploadedAt: new Date().toISOString()
    });

    res.json({
      success: true,
      datasetId: datasetId,
      analysis: analysis,
      summary: summary,
      message: `Demo SaaS dataset loaded: ${data.length} records`
    });
  } catch (error) {
    console.error('SaaS demo error:', error);
    res.status(500).json({ error: 'Failed to load SaaS demo dataset' });
  }
});

app.get('/api/demo/restaurant', async (req, res) => {
  try {
    const data = await parseCSVFromFile('demo-datasets/restaurant-daily-pnl.csv');
    const analysis = analyzeDataStructure(data);
    const summary = generateDataSummary(data, analysis);
    
    const datasetId = 'demo-restaurant-' + Date.now();
    dataStore.set(datasetId, {
      id: datasetId,
      name: 'Restaurant P&L Analysis Demo',
      description: 'Daily profit & loss with operational metrics',
      data: data,
      analysis: analysis,
      summary: summary,
      uploadedAt: new Date().toISOString()
    });

    res.json({
      success: true,
      datasetId: datasetId,
      analysis: analysis,
      summary: summary,
      message: `Demo Restaurant dataset loaded: ${data.length} records`
    });
  } catch (error) {
    console.error('Restaurant demo error:', error);
    res.status(500).json({ error: 'Failed to load Restaurant demo dataset' });
  }
});

app.get('/api/demo/consulting', async (req, res) => {
  try {
    const data = await parseCSVFromFile('demo-datasets/consulting-revenue.csv');
    const analysis = analyzeDataStructure(data);
    const summary = generateDataSummary(data, analysis);
    
    const datasetId = 'demo-consulting-' + Date.now();
    dataStore.set(datasetId, {
      id: datasetId,
      name: 'Consulting Revenue Analysis Demo',
      description: 'Project-based revenue with client satisfaction',
      data: data,
      analysis: analysis,
      summary: summary,
      uploadedAt: new Date().toISOString()
    });

    res.json({
      success: true,
      datasetId: datasetId,
      analysis: analysis,
      summary: summary,
      message: `Demo Consulting dataset loaded: ${data.length} records`
    });
  } catch (error) {
    console.error('Consulting demo error:', error);
    res.status(500).json({ error: 'Failed to load Consulting demo dataset' });
  }
});

app.get('/api/demo/retail', async (req, res) => {
  try {
    const data = await parseCSVFromFile('demo-datasets/retail-inventory.csv');
    const analysis = analyzeDataStructure(data);
    const summary = generateDataSummary(data, analysis);
    
    const datasetId = 'demo-retail-' + Date.now();
    dataStore.set(datasetId, {
      id: datasetId,
      name: 'Retail Inventory Intelligence Demo',
      description: 'Inventory optimization with seasonal analysis',
      data: data,
      analysis: analysis,
      summary: summary,
      uploadedAt: new Date().toISOString()
    });

    res.json({
      success: true,
      datasetId: datasetId,
      analysis: analysis,
      summary: summary,
      message: `Demo Retail dataset loaded: ${data.length} records`
    });
  } catch (error) {
    console.error('Retail demo error:', error);
    res.status(500).json({ error: 'Failed to load Retail demo dataset' });
  }
});

// Utility function to parse CSV from file path
const parseCSVFromFile = (filePath) => {
  return new Promise((resolve, reject) => {
    const results = [];
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (data) => results.push(data))
      .on('end', () => resolve(results))
      .on('error', reject);
  });
};

// Start server
app.listen(PORT, () => {
  console.log(`🚀 AI Business Intelligence Server running on port ${PORT}`);
  console.log(`📊 Ready to analyze business data with AI insights`);
});

module.exports = app;
