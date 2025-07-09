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

// AI-powered query endpoint
app.post('/api/query', async (req, res) => {
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
      sampleData: dataset.data.slice(0, 5),
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
    
    // Create enhanced AI prompt for sophisticated analysis
    const prompt = `
You are a seasoned C-suite business consultant with 15+ years of Fortune 500 experience, specializing in ${industrySpecialization}.

BUSINESS CONTEXT:
Dataset: ${dataContext.datasetInfo.name}
Records: ${dataContext.datasetInfo.rowCount.toLocaleString()}
Dimensions: ${dataContext.datasetInfo.columns.length} columns
Coverage: ${dataContext.datasetInfo.columns.join(', ')}

INDUSTRY-SPECIFIC KPIs TO ANALYZE: ${specificKPIs}

DATA ARCHITECTURE:
${Object.entries(dataContext.datasetInfo.columnTypes).map(([col, type]) => `• ${col}: ${type}`).join('\n')}

SAMPLE TRANSACTIONS:
${JSON.stringify(dataContext.sampleData, null, 2)}

EXECUTIVE SUMMARY METRICS:
${JSON.stringify(dataContext.datasetInfo.summary, null, 2)}

EXECUTIVE INQUIRY: "${userQuery}"

RESPONSE FRAMEWORK:
Provide a comprehensive C-level analysis demonstrating $120k+ strategic consulting expertise:

1. STRATEGIC ANALYSIS: Direct, data-driven answer with quantitative backing
2. BUSINESS INTELLIGENCE: 3-5 key insights showing deep pattern recognition
3. EXECUTIVE RECOMMENDATIONS: Specific, actionable steps with expected ROI/impact
4. OPERATIONAL METRICS: Calculated KPIs with industry benchmarks where relevant
5. PREDICTIVE INSIGHTS: Forward-looking analysis and trend identification
6. RISK ASSESSMENT: Potential challenges and mitigation strategies

JSON Response Structure:
{
  "answer": "Executive-level strategic answer with specific metrics and percentages",
  "insights": [
    "Advanced business insight with quantified impact",
    "Pattern recognition with competitive implications", 
    "Operational efficiency opportunity with cost/benefit analysis",
    "Market positioning insight with strategic recommendations",
    "Risk/opportunity assessment with timeline projections"
  ],
  "recommendations": [
    "Immediate tactical action with 30-90 day ROI projection and implementation steps",
    "Strategic initiative with 6-12 month timeline, resource requirements, and success KPIs", 
    "Operational optimization with cost-benefit analysis and efficiency gains",
    "Investment/technology recommendation with financial justification and competitive advantage"
  ],
  "calculations": {
    "key_metric_1": "Calculated value with business context",
    "growth_rate": "Percentage with period comparison",
    "efficiency_ratio": "Metric with industry benchmark",
    "roi_projection": "Financial impact estimation"
  },
  "risks": [
    "Primary business risk with mitigation strategy",
    "Market/competitive risk with monitoring approach"
  ],
  "opportunities": [
    "High-impact opportunity with implementation priority",
    "Strategic advantage with competitive positioning"
  ],
  "visualizations": [
    "Executive dashboard component (trend analysis)",
    "Performance comparison visualization",
    "Strategic planning chart recommendation"
  ],
  "confidence": "high/medium/low",
  "followUpQuestions": [
    "Strategic follow-up question for deeper analysis",
    "Operational question for implementation planning"
  ],
  "industryBenchmarks": {
    "benchmark_1": "Industry comparison with percentile ranking",
    "benchmark_2": "Competitive positioning insight"
  }
}

ANALYSIS STANDARDS:
- Use sophisticated business terminology appropriate for C-suite presentation
- Calculate and reference industry-specific KPIs: ${specificKPIs}
- Include specific percentages, ratios, and financial metrics with context
- Reference industry best practices and competitive benchmarks
- Provide actionable recommendations with clear ROI projections and timelines
- Show advanced analytical thinking with predictive insights and scenario planning
- Demonstrate strategic business acumen worthy of $120k+ senior-level compensation
- Include risk assessment with mitigation strategies and opportunity identification
- Suggest specific next steps with implementation roadmaps and resource requirements
- Reference industry trends and competitive positioning where relevant

INDUSTRY CONTEXT: Apply your specialized knowledge in ${industrySpecialization} to provide insights that demonstrate deep sector expertise and strategic thinking that would impress Fortune 500 executives.

Analyze the data with the depth and sophistication expected from a top-tier business intelligence platform used by enterprise clients.
`;

    console.log('Calling Gemini AI...');
    
    // Check if model is initialized
    if (!model) {
      console.log('ERROR: Gemini AI model not initialized');
      return res.status(500).json({ error: 'AI model not initialized' });
    }
    
    // Call Gemini AI with timeout and error handling
    let result;
    let responseText;
    
    try {
      result = await model.generateContent(prompt);
      if (!result || !result.response) {
        throw new Error('Invalid response from AI model');
      }
      responseText = result.response.text();
      
      if (!responseText) {
        throw new Error('Empty response from AI model');
      }
    } catch (aiError) {
      console.log('ERROR: AI model failed:', aiError.message);
      return res.status(500).json({ 
        error: 'AI model failed to generate response', 
        details: aiError.message 
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
