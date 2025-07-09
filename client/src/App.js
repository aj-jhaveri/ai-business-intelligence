import React, { useState, useEffect, useRef } from 'react';
import './App.css';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:3001';

// Professional sample datasets configuration
const DEMO_DATASETS = [
  {
    id: 'ecommerce-sample',
    name: 'SaaS Sample Dataset',
    icon: '📊',
    description: 'MRR/ARR tracking • 120+ customers • Churn analysis',
    endpoint: '/api/demo/saas',
    downloadEndpoint: '/api/download/saas',
    sampleQuestions: [
      "What's our monthly recurring revenue trend?",
      "Which customer segments have lowest churn?",
      "How does feature usage correlate with retention?",
      "What's our customer acquisition cost by channel?"
    ]
  },
  {
    id: 'saas-sample',
    name: 'E-commerce Sample Dataset',
    icon: '🛒',
    description: '$2M+ annual revenue • 6 months • 150+ transactions',
    endpoint: '/api/demo/ecommerce',
    downloadEndpoint: '/api/download/ecommerce',
    sampleQuestions: [
      "What's driving our revenue growth this quarter?",
      "Which product categories are most profitable?",
      "How do customer segments perform across regions?",
      "What's our return rate by marketing channel?"
    ]
  },
  {
    id: 'restaurant-sample',
    name: 'Restaurant Sample Dataset',
    icon: '🍽️',
    description: 'Daily operations • 213 days • Cost optimization',
    endpoint: '/api/demo/restaurant',
    downloadEndpoint: '/api/download/restaurant',
    sampleQuestions: [
      "What are our most profitable days?",
      "How do food costs impact margins?",
      "Which weather patterns affect sales?",
      "What's our optimal staffing level?"
    ]
  },
  {
    id: 'consulting-sample',
    name: 'Consulting Sample Dataset',
    icon: '💼',
    description: 'Project-based • 125+ projects • Client satisfaction',
    endpoint: '/api/demo/consulting',
    downloadEndpoint: '/api/download/consulting',
    sampleQuestions: [
      "What's our average project profitability?",
      "Which industries provide highest returns?",
      "How does team size affect project success?",
      "What's our client satisfaction correlation?"
    ]
  },
  {
    id: 'retail-sample',
    name: 'Retail Sample Dataset',
    icon: '🏪',
    description: 'Inventory optimization • 1000+ products • Seasonal trends',
    endpoint: '/api/demo/retail',
    downloadEndpoint: '/api/download/retail',
    sampleQuestions: [
      "Which products need reordering?",
      "How do seasonal trends affect demand?",
      "What's our inventory turnover rate?",
      "Which categories have highest margins?"
    ]
  }
];

function App() {
  const [datasets, setDatasets] = useState([]);
  const [currentDataset, setCurrentDataset] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    fetchDatasets();
  }, []);

  const fetchDatasets = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/datasets`);
      const data = await response.json();
      setDatasets(data.datasets);
    } catch (error) {
      console.error('Failed to fetch datasets:', error);
    }
  };

  const loadDemoDataset = async (demoConfig) => {
    setIsLoading(true);
    setUploadProgress(0);

    try {
      // Load the demo dataset using the new API endpoint
      const response = await fetch(`${API_BASE}${demoConfig.endpoint}`);
      
      if (!response.ok) {
        throw new Error(`Failed to load demo dataset: ${response.statusText}`);
      }

      setUploadProgress(50);
      const result = await response.json();
      
      const welcomeMessage = {
        id: Date.now(),
        type: 'system',
        content: `🎯 **${demoConfig.name}** loaded successfully!\n\n📊 **${result.analysis.totalRows} records** with **${result.analysis.columns.length} columns** ready for analysis.\n\n💡 **Try asking:**\n${demoConfig.sampleQuestions.map(q => `• ${q}`).join('\n')}`,
        timestamp: new Date().toISOString()
      };
      
      setMessages(prev => [...prev, welcomeMessage]);
      await fetchDatasets();
      setCurrentDataset(result.datasetId);
      setUploadProgress(100);

    } catch (error) {
      const errorMessage = {
        id: Date.now(),
        type: 'error',
        content: `❌ Failed to load demo dataset: ${error.message}`,
        timestamp: new Date().toISOString()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
      setTimeout(() => setUploadProgress(0), 2000);
    }
  };

  const downloadCSV = async (demoConfig) => {
    try {
      const response = await fetch(`${API_BASE}${demoConfig.downloadEndpoint}`);
      
      if (!response.ok) {
        throw new Error(`Failed to download CSV: ${response.statusText}`);
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${demoConfig.name.toLowerCase().replace(/ /g, '-')}-sample.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      const successMessage = {
        id: Date.now(),
        type: 'system',
        content: `✅ Downloaded ${demoConfig.name} sample CSV. You can now modify it with your own data and re-upload!`,
        timestamp: new Date().toISOString()
      };
      setMessages(prev => [...prev, successMessage]);
    } catch (error) {
      const errorMessage = {
        id: Date.now(),
        type: 'error',
        content: `❌ Failed to download CSV: ${error.message}`,
        timestamp: new Date().toISOString()
      };
      setMessages(prev => [...prev, errorMessage]);
    }
  };

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);
    formData.append('datasetName', file.name);
    formData.append('description', `Uploaded ${new Date().toLocaleDateString()}`);

    setIsLoading(true);
    setUploadProgress(0);

    try {
      const response = await fetch(`${API_BASE}/api/upload`, {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        throw new Error('Upload failed');
      }

      const result = await response.json();
      
      const successMessage = {
        id: Date.now(),
        type: 'system',
        content: `✅ Successfully uploaded "${result.analysis.columns.length} columns, ${result.analysis.totalRows} rows". You can now ask questions about your data!`,
        timestamp: new Date().toISOString()
      };
      
      setMessages(prev => [...prev, successMessage]);
      await fetchDatasets();
      setCurrentDataset(result.datasetId);
      setUploadProgress(100);

    } catch (error) {
      const errorMessage = {
        id: Date.now(),
        type: 'error',
        content: `❌ Upload failed: ${error.message}`,
        timestamp: new Date().toISOString()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
      setTimeout(() => setUploadProgress(0), 2000);
    }
  };

  const sendMessage = async () => {
    if (!inputMessage.trim() || !currentDataset) return;

    const userMessage = {
      id: Date.now(),
      type: 'user',
      content: inputMessage,
      timestamp: new Date().toISOString()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputMessage('');
    setIsLoading(true);

    try {
      const response = await fetch(`${API_BASE}/api/query`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          question: inputMessage,
          datasetId: currentDataset,
          context: messages.slice(-5)
        })
      });

      if (!response.ok) {
        throw new Error('Query failed');
      }

      const result = await response.json();
      
      // Clean up the AI response - remove markdown and parse JSON if needed
      let cleanResponse = result.response;
      if (typeof cleanResponse === 'string' && cleanResponse.includes('```json')) {
        const jsonMatch = cleanResponse.match(/```json\s*([\s\S]*?)\s*```/);
        if (jsonMatch) {
          try {
            cleanResponse = JSON.parse(jsonMatch[1]);
          } catch (e) {
            cleanResponse = result.response;
          }
        }
      }

      const aiMessage = {
        id: Date.now() + 1,
        type: 'ai',
        content: cleanResponse,
        timestamp: new Date().toISOString(),
        confidence: cleanResponse.confidence || 'medium'
      };

      setMessages(prev => [...prev, aiMessage]);

    } catch (error) {
      const errorMessage = {
        id: Date.now() + 1,
        type: 'error',
        content: `❌ Analysis failed: ${error.message}`,
        timestamp: new Date().toISOString()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const renderMessage = (message) => {
    switch (message.type) {
      case 'user':
        return (
          <div key={message.id} className="message user-message">
            <div className="message-content">
              <div className="message-text">{message.content}</div>
              <div className="message-time">
                {new Date(message.timestamp).toLocaleTimeString()}
              </div>
            </div>
          </div>
        );

      case 'ai':
        // Safety check: ensure message.content is an object
        const content = typeof message.content === 'object' && message.content !== null 
          ? message.content 
          : { answer: typeof message.content === 'string' ? message.content : JSON.stringify(message.content) };
        
        return (
          <div key={message.id} className="message ai-message">
            <div className="message-content">
              <div className="ai-avatar">🤖</div>
              <div className="message-body">
                <div className="message-text">
                  <div className="ai-answer">
                    <strong>Executive Analysis:</strong> {
                      typeof content.answer === 'string' 
                        ? content.answer 
                        : typeof content.answer === 'object' 
                          ? JSON.stringify(content.answer) 
                          : content.answer
                    }
                  </div>
                  
                  {content.insights && content.insights.length > 0 && (
                    <div className="ai-insights">
                      <strong>Business Intelligence:</strong>
                      <ul>
                        {content.insights.map((insight, idx) => (
                          <li key={idx}>
                            {typeof insight === 'string' ? insight : (
                              typeof insight === 'object' ? JSON.stringify(insight) : insight
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  
                  {content.recommendations && content.recommendations.length > 0 && (
                    <div className="ai-recommendations">
                      <strong>Strategic Recommendations:</strong>
                      <ul>
                        {content.recommendations.map((rec, idx) => (
                          <li key={idx}>
                            {typeof rec === 'string' ? rec : (
                              <div className="recommendation-item">
                                {rec.action && <div><strong>Action:</strong> {rec.action}</div>}
                                {rec.roi && <div><strong>ROI:</strong> {rec.roi}</div>}
                                {rec.steps && (
                                  <div>
                                    <strong>Steps:</strong>
                                    {Array.isArray(rec.steps) ? (
                                      <ul>
                                        {rec.steps.map((step, stepIdx) => (
                                          <li key={stepIdx}>{step}</li>
                                        ))}
                                      </ul>
                                    ) : (
                                      <span> {rec.steps}</span>
                                    )}
                                  </div>
                                )}
                                {/* Handle any other object properties */}
                                {Object.keys(rec).filter(key => !['action', 'roi', 'steps'].includes(key)).map(key => (
                                  <div key={key}><strong>{key}:</strong> {rec[key]}</div>
                                ))}
                              </div>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  
                  {content.calculations && Object.keys(content.calculations).length > 0 && (
                    <div className="ai-calculations">
                      <strong>Key Performance Metrics:</strong>
                      <div className="metrics-grid">
                        {Object.entries(content.calculations).map(([key, value]) => (
                          <div key={key} className="metric-item">
                            <span className="metric-label">{key.replace(/_/g, ' ').toUpperCase()}:</span>
                            <span className="metric-value">
                              {typeof value === 'number' 
                                ? value.toLocaleString() 
                                : typeof value === 'string' 
                                  ? value 
                                  : typeof value === 'object' 
                                    ? JSON.stringify(value) 
                                    : value
                              }
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {content.risks && content.risks.length > 0 && (
                    <div className="ai-risks">
                      <strong>Risk Assessment:</strong>
                      <ul>
                        {content.risks.map((risk, idx) => (
                          <li key={idx}>
                            {typeof risk === 'string' ? risk : (
                              typeof risk === 'object' ? JSON.stringify(risk) : risk
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {content.opportunities && content.opportunities.length > 0 && (
                    <div className="ai-opportunities">
                      <strong>Strategic Opportunities:</strong>
                      <ul>
                        {content.opportunities.map((opp, idx) => (
                          <li key={idx}>
                            {typeof opp === 'string' ? opp : (
                              typeof opp === 'object' ? JSON.stringify(opp) : opp
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {content.industryBenchmarks && Object.keys(content.industryBenchmarks).length > 0 && (
                    <div className="ai-benchmarks">
                      <strong>Industry Benchmarks:</strong>
                      <div className="benchmarks-grid">
                        {Object.entries(content.industryBenchmarks).map(([key, value]) => (
                          <div key={key} className="benchmark-item">
                            <span className="benchmark-label">{key.replace(/_/g, ' ').toUpperCase()}:</span>
                            <span className="benchmark-value">
                              {typeof value === 'string' 
                                ? value 
                                : typeof value === 'object' 
                                  ? JSON.stringify(value) 
                                  : value
                              }
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {content.followUpQuestions && content.followUpQuestions.length > 0 && (
                    <div className="ai-suggestions">
                      <strong>Strategic Follow-up Questions:</strong>
                      <div className="suggestion-buttons">
                        {content.followUpQuestions.map((question, idx) => (
                          <button 
                            key={idx} 
                            className="suggestion-btn"
                            onClick={() => setInputMessage(
                              typeof question === 'string' 
                                ? question 
                                : typeof question === 'object' 
                                  ? JSON.stringify(question) 
                                  : question
                            )}
                          >
                            {typeof question === 'string' 
                              ? question 
                              : typeof question === 'object' 
                                ? JSON.stringify(question) 
                                : question
                            }
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                <div className="message-meta">
                  <span className={`confidence ${content.confidence || message.confidence || 'medium'}`}>
                    Confidence: {content.confidence || message.confidence || 'medium'}
                  </span>
                  <span className="message-time">
                    {new Date(message.timestamp).toLocaleTimeString()}
                  </span>
                </div>
              </div>
            </div>
          </div>
        );

      case 'system':
        return (
          <div key={message.id} className="message system-message">
            <div className="message-content">
              <div className="message-text">{message.content}</div>
            </div>
          </div>
        );

      case 'error':
        return (
          <div key={message.id} className="message error-message">
            <div className="message-content">
              <div className="message-text">{message.content}</div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };


  return (
    <div className="app">
      <header className="app-header">
        <div className="header-content">
          <h1>AI Business Intelligence Platform</h1>
          <p>Transform raw data into boardroom-ready insights with natural language queries</p>
        </div>
        <div className="header-actions">
          <div className="dataset-selector">
            <select 
              value={currentDataset || ''} 
              onChange={(e) => setCurrentDataset(e.target.value)}
              disabled={datasets.length === 0}
            >
              <option value="">Select Dataset</option>
              {datasets.map(dataset => (
                <option key={dataset.id} value={dataset.id}>
                  {dataset.name} ({dataset.rowCount} rows)
                </option>
              ))}
            </select>
          </div>
        </div>
      </header>

      <div className="app-body">
        <aside className="sidebar">
          <div className="demo-buttons-section">
            <h3>📊 Sample Datasets</h3>
            <div className="demo-buttons-grid">
              {DEMO_DATASETS.map(demo => (
                <div key={demo.id} className="demo-item">
                  <button
                    className="demo-button"
                    onClick={() => loadDemoDataset(demo)}
                    disabled={isLoading}
                  >
                    <div className="demo-button-title">
                      <span>{demo.icon}</span>
                      {demo.name}
                    </div>
                    <div className="demo-button-subtitle">
                      {demo.description}
                    </div>
                  </button>
                  <button
                    className="download-button"
                    onClick={() => downloadCSV(demo)}
                    disabled={isLoading}
                    title="Download Sample CSV"
                  >
                    📥 Download CSV
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="upload-section">
            <h3>📁 Upload Your Data</h3>
            <div className="upload-instructions">
              <p>📝 <strong>CSV Format:</strong> Date, Revenue, Product, Category (see sample files)</p>
              <p>💡 <strong>Tip:</strong> Download sample → Modify with your data → Upload</p>
            </div>
            <div className="upload-area">
              <input
                type="file"
                accept=".csv"
                onChange={handleFileUpload}
                className="file-input"
                id="file-upload"
              />
              <label htmlFor="file-upload" className="upload-label">
                <div className="upload-icon">📤</div>
                <div>Choose CSV File</div>
                <div className="upload-hint">Max 10MB</div>
              </label>
              {uploadProgress > 0 && (
                <div className="progress-bar">
                  <div 
                    className="progress-fill" 
                    style={{ width: `${uploadProgress}%` }}
                  ></div>
                </div>
              )}
            </div>
          </div>

          <div className="datasets-section">
            <h3>📊 Active Datasets</h3>
            <div className="datasets-list">
              {datasets.length === 0 ? (
                <p className="no-data">No datasets loaded yet</p>
              ) : (
                datasets.map(dataset => (
                  <div 
                    key={dataset.id} 
                    className={`dataset-item ${currentDataset === dataset.id ? 'active' : ''}`}
                    onClick={() => setCurrentDataset(dataset.id)}
                  >
                    <div className="dataset-name">{dataset.name}</div>
                    <div className="dataset-info">
                      {dataset.rowCount} rows • {dataset.columnCount} columns
                    </div>
                    <div className="dataset-date">
                      {new Date(dataset.uploadedAt).toLocaleDateString()}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </aside>

        <main className="main-content">
          <div className="chat-container">
            <div className="messages-container">
              {messages.length === 0 ? (
                <div className="welcome-message">
                  <div className="welcome-icon">🧠</div>
                  <h2>AI Business Intelligence Platform</h2>
                  <p>Transform complex business data into actionable insights with natural language queries</p>
                  <div className="sample-questions">
                    <h4>🚀 Quick Start Guide:</h4>
                    <ul>
                      <li><strong>Try with sample data:</strong> Click any sample dataset to instantly explore</li>
                      <li><strong>Download → Customize → Upload:</strong> Download sample CSV → Modify with your data → Upload</li>
                      <li><strong>Ask intelligent questions:</strong> Get executive-level insights and recommendations</li>
                      <li><strong>CSV Format:</strong> Date, Revenue, Product, Category (see sample files)</li>
                    </ul>
                    <div className="workflow-highlight">
                      <strong>💡 Perfect workflow:</strong> Download sample data → Modify with your numbers → Upload → Get AI insights
                    </div>
                  </div>
                </div>
              ) : (
                <div className="messages-list">
                  {messages.map(renderMessage)}
                  {isLoading && (
                    <div className="message ai-message loading">
                      <div className="message-content">
                        <div className="ai-avatar">🤖</div>
                        <div className="loading-indicator">
                          <div className="typing-animation">
                            <span></span>
                            <span></span>
                            <span></span>
                          </div>
                          <span>Analyzing your data...</span>
                        </div>
                      </div>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </div>

            <div className="input-container">
              <div className="input-wrapper">
                <textarea
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder={currentDataset ? "Ask sophisticated questions about your business data..." : "Load a demo dataset or upload your own data to begin"}
                  className="message-input"
                  disabled={!currentDataset || isLoading}
                  rows={1}
                />
                <button 
                  onClick={sendMessage}
                  disabled={!inputMessage.trim() || !currentDataset || isLoading}
                  className="send-button"
                >
                  🚀
                </button>
              </div>
              {currentDataset && (
                <div className="input-hint">
                  Press Enter to send • Shift+Enter for new line
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

export default App;
