'use strict';

const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');
const OpenAI = require('openai');

// Additional file processing libraries (optional)
let mammoth = null; // For DOCX files
let cheerio = null; // For HTML files
let axios = null; // For web scraping

try {
  mammoth = require('mammoth');
} catch (e) {
  console.log('mammoth not installed - DOCX support disabled');
}

try {
  cheerio = require('cheerio');
} catch (e) {
  console.log('cheerio not installed - HTML support disabled');
}

try {
  axios = require('axios');
} catch (e) {
  console.log('axios not installed - web scraping disabled');
}

const kbDir = path.join(__dirname, '..', 'kb');
const indexPath = path.join(__dirname, '..', 'config', 'kb_index.json');

const openaiApiKey = process.env.OPENAI_API_KEY;
const embeddingModel = process.env.OPENAI_EMBEDDINGS_MODEL || 'text-embedding-3-small';
const openai = openaiApiKey ? new OpenAI({ apiKey: openaiApiKey }) : null;

// Enhanced configuration
const KB_CONFIG = {
  chunkSize: 1200,
  overlap: 120,
  maxChunksPerFile: 1000,
  searchTopK: 4,
  minScore: 0.3,
  useFallbackEmbeddings: true, // Enable fallback when OpenAI is unavailable
  disableEmbeddings: process.env.DISABLE_KB_EMBEDDINGS === 'true' // Environment variable to disable embeddings
};

function ensurePaths() {
  if (!fs.existsSync(kbDir)) fs.mkdirSync(kbDir, { recursive: true });
  const idxDir = path.dirname(indexPath);
  if (!fs.existsSync(idxDir)) fs.mkdirSync(idxDir, { recursive: true });
  if (!fs.existsSync(indexPath)) fs.writeFileSync(indexPath, JSON.stringify({ 
    chunks: [], 
    metadata: {},
    lastUpdated: new Date().toISOString()
  }, null, 2));
}

function loadIndex() {
  ensurePaths();
  try {
    const idx = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
    
    // Migration: Add missing fields for old index files
    if (!idx.metadata) {
      idx.metadata = {};
      console.log('KB: Migrating old index format - adding metadata field');
    }
    if (!idx.lastUpdated) {
      idx.lastUpdated = new Date().toISOString();
      console.log('KB: Migrating old index format - adding lastUpdated field');
    }
    if (!idx.chunks) {
      idx.chunks = [];
      console.log('KB: Migrating old index format - adding chunks field');
    }
    
    // Migration: Add sourceId to existing chunks if missing
    let needsSave = false;
    for (const chunk of idx.chunks) {
      if (!chunk.sourceId) {
        chunk.sourceId = generateSourceId(chunk.source || 'unknown');
        needsSave = true;
      }
      if (!chunk.metadata) {
        chunk.metadata = {};
        needsSave = true;
      }
    }
    
    if (needsSave) {
      console.log('KB: Migrating chunks - adding missing sourceId and metadata');
      saveIndex(idx);
    }
    
    return idx;
  } catch (error) {
    console.error('KB: Error loading index, creating new one:', error.message);
    return { chunks: [], metadata: {}, lastUpdated: new Date().toISOString() };
  }
}

function saveIndex(idx) {
  ensurePaths();
  idx.lastUpdated = new Date().toISOString();
  fs.writeFileSync(indexPath, JSON.stringify(idx, null, 2));
}

// Improved chunking with semantic boundaries
function chunkText(text, chunkSize = KB_CONFIG.chunkSize, overlap = KB_CONFIG.overlap) {
  const chunks = [];
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 10);
  
  let currentChunk = '';
  let chunkCount = 0;
  
  for (const sentence of sentences) {
    const trimmedSentence = sentence.trim();
    if (!trimmedSentence) continue;
    
    // Check if adding this sentence would exceed chunk size
    if (currentChunk.length + trimmedSentence.length > chunkSize && currentChunk.length > 0) {
      chunks.push(currentChunk.trim());
      chunkCount++;
      
      // Start new chunk with overlap
      if (overlap > 0 && chunks.length > 0) {
        const lastChunk = chunks[chunks.length - 1];
        const overlapText = lastChunk.slice(-overlap);
        currentChunk = overlapText + ' ' + trimmedSentence;
      } else {
        currentChunk = trimmedSentence;
      }
    } else {
      currentChunk += (currentChunk ? ' ' : '') + trimmedSentence;
    }
    
    // Safety check to prevent infinite loops
    if (chunkCount >= KB_CONFIG.maxChunksPerFile) break;
  }
  
  // Add the last chunk if it has content
  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }
  
  return chunks;
}

async function embed(text) {
  // Check if embeddings are disabled
  if (KB_CONFIG.disableEmbeddings) {
    console.log('Embeddings disabled - using fallback embedding');
    return generateFallbackEmbedding(text);
  }
  
  if (!openai) {
    console.warn('OPENAI_API_KEY missing - using fallback embedding');
    return generateFallbackEmbedding(text);
  }
  
  try {
    const res = await openai.embeddings.create({
      model: embeddingModel,
      input: text,
    });
    return res.data[0].embedding;
  } catch (error) {
    console.error('Embedding error:', error.message);
    if (KB_CONFIG.useFallbackEmbeddings) {
      console.warn('Using fallback embedding due to API error');
      return generateFallbackEmbedding(text);
    } else {
      throw new Error(`Failed to create embedding: ${error.message}`);
    }
  }
}

// Fallback embedding generator for when OpenAI API is unavailable
function generateFallbackEmbedding(text) {
  // Simple hash-based embedding (not as good as OpenAI but functional)
  const hash = simpleHash(text);
  const embedding = new Array(1536).fill(0); // OpenAI embedding size
  
  // Distribute hash values across the embedding vector
  for (let i = 0; i < Math.min(hash.length, embedding.length); i++) {
    embedding[i] = (hash.charCodeAt(i % hash.length) - 128) / 128;
  }
  
  return embedding;
}

// Simple hash function for fallback embeddings
function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(36);
}

function cosineSim(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    const ai = a[i], bi = b[i];
    dot += ai * bi; na += ai * ai; nb += bi * bi;
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-8);
}

// Enhanced PDF processing with metadata
async function addPdf(buffer, originalName) {
  ensurePaths();
  try {
    const pdf = await pdfParse(buffer);
    const text = (pdf.text || '').replace(/\s+$/g, '').trim();
    if (!text) throw new Error('No text extracted from PDF');
    
    const chunks = chunkText(text);
    if (chunks.length === 0) throw new Error('No valid chunks created from PDF');

    const idx = loadIndex();
    const sourceId = generateSourceId(originalName);
    
    // Add metadata
    idx.metadata[sourceId] = {
      name: originalName,
      type: 'pdf',
      pages: pdf.numpages || 0,
      chunks: chunks.length,
      added: new Date().toISOString(),
      size: buffer.length
    };
    
    // Add chunks with enhanced metadata
    for (let i = 0; i < chunks.length; i++) {
      const vector = await embed(chunks[i]);
      idx.chunks.push({ 
        source: originalName,
        sourceId,
        chunk: chunks[i], 
        vector,
        chunkIndex: i,
        metadata: {
          page: Math.floor(i / 3) + 1, // Approximate page number
          chunkNumber: i + 1,
          totalChunks: chunks.length
        }
      });
    }
    
    saveIndex(idx);
    return { 
      chunksAdded: chunks.length, 
      sourceId,
      metadata: idx.metadata[sourceId]
    };
  } catch (error) {
    console.error('PDF processing error:', error);
    throw error;
  }
}

// Enhanced text processing
async function addText(buffer, originalName) {
  ensurePaths();
  try {
    const text = Buffer.isBuffer(buffer) ? buffer.toString('utf8') : String(buffer || '');
    const cleaned = text.replace(/\s+$/g, '').trim();
    if (!cleaned) throw new Error('No text content found');
    
    const chunks = chunkText(cleaned);
    if (chunks.length === 0) throw new Error('No valid chunks created from text');

    const idx = loadIndex();
    const sourceId = generateSourceId(originalName);
    
    // Add metadata
    idx.metadata[sourceId] = {
      name: originalName,
      type: 'text',
      chunks: chunks.length,
      added: new Date().toISOString(),
      size: buffer.length
    };
    
    // Add chunks with enhanced metadata
    for (let i = 0; i < chunks.length; i++) {
      const vector = await embed(chunks[i]);
      idx.chunks.push({ 
        source: originalName,
        sourceId,
        chunk: chunks[i], 
        vector,
        chunkIndex: i,
        metadata: {
          chunkNumber: i + 1,
          totalChunks: chunks.length
        }
      });
    }
    
    saveIndex(idx);
    return { 
      chunksAdded: chunks.length, 
      sourceId,
      metadata: idx.metadata[sourceId]
    };
  } catch (error) {
    console.error('Text processing error:', error);
    throw error;
  }
}

// DOCX file processing
async function addDocx(buffer, originalName) {
  if (!mammoth) {
    throw new Error('DOCX support not available - install mammoth package');
  }
  
  ensurePaths();
  try {
    const result = await mammoth.extractRawText({ buffer });
    const text = result.value.replace(/\s+$/g, '').trim();
    
    if (!text) throw new Error('No text extracted from DOCX');
    
    const chunks = chunkText(text);
    if (chunks.length === 0) throw new Error('No valid chunks created from DOCX');

    const idx = loadIndex();
    const sourceId = generateSourceId(originalName);
    
    // Add metadata
    idx.metadata[sourceId] = {
      name: originalName,
      type: 'docx',
      chunks: chunks.length,
      added: new Date().toISOString(),
      size: buffer.length
    };
    
    // Add chunks with enhanced metadata
    for (let i = 0; i < chunks.length; i++) {
      const vector = await embed(chunks[i]);
      idx.chunks.push({ 
        source: originalName,
        sourceId,
        chunk: chunks[i], 
        vector,
        chunkIndex: i,
        metadata: {
          chunkNumber: i + 1,
          totalChunks: chunks.length
        }
      });
    }
    
    saveIndex(idx);
    return { 
      chunksAdded: chunks.length, 
      sourceId,
      metadata: idx.metadata[sourceId]
    };
  } catch (error) {
    console.error('DOCX processing error:', error);
    throw error;
  }
}

// HTML file processing
async function addHtml(buffer, originalName) {
  if (!cheerio) {
    throw new Error('HTML support not available - install cheerio package');
  }
  
  ensurePaths();
  try {
    const html = buffer.toString('utf8');
    const $ = cheerio.load(html);
    
    // Remove script and style elements
    $('script, style').remove();
    
    // Extract text content
    const text = $('body').text().replace(/\s+/g, ' ').trim();
    
    if (!text) throw new Error('No text extracted from HTML');
    
    const chunks = chunkText(text);
    if (chunks.length === 0) throw new Error('No valid chunks created from HTML');

    const idx = loadIndex();
    const sourceId = generateSourceId(originalName);
    
    // Add metadata
    idx.metadata[sourceId] = {
      name: originalName,
      type: 'html',
      chunks: chunks.length,
      added: new Date().toISOString(),
      size: buffer.length
    };
    
    // Add chunks with enhanced metadata
    for (let i = 0; i < chunks.length; i++) {
      const vector = await embed(chunks[i]);
      idx.chunks.push({ 
        source: originalName,
        sourceId,
        chunk: chunks[i], 
        vector,
        chunkIndex: i,
        metadata: {
          chunkNumber: i + 1,
          totalChunks: chunks.length
        }
      });
    }
    
    saveIndex(idx);
    return { 
      chunksAdded: chunks.length, 
      sourceId,
      metadata: idx.metadata[sourceId]
    };
  } catch (error) {
    console.error('HTML processing error:', error);
    throw error;
  }
}

// Web scraping functionality
async function addWebPage(url, customName = null) {
  if (!axios || !cheerio) {
    throw new Error('Web scraping not available - install axios and cheerio packages');
  }
  
  ensurePaths();
  try {
    const response = await axios.get(url, {
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; KB-Bot/1.0)'
      }
    });
    
    const $ = cheerio.load(response.data);
    
    // Remove script, style, and navigation elements
    $('script, style, nav, header, footer, .nav, .header, .footer').remove();
    
    // Extract text content
    const text = $('body').text().replace(/\s+/g, ' ').trim();
    
    if (!text) throw new Error('No text extracted from webpage');
    
    const chunks = chunkText(text);
    if (chunks.length === 0) throw new Error('No valid chunks created from webpage');

    const idx = loadIndex();
    const sourceName = customName || `Webpage: ${url}`;
    const sourceId = generateSourceId(sourceName);
    
    // Add metadata
    idx.metadata[sourceId] = {
      name: sourceName,
      type: 'webpage',
      url: url,
      chunks: chunks.length,
      added: new Date().toISOString(),
      size: text.length
    };
    
    // Add chunks with enhanced metadata
    for (let i = 0; i < chunks.length; i++) {
      const vector = await embed(chunks[i]);
      idx.chunks.push({ 
        source: sourceName,
        sourceId,
        chunk: chunks[i], 
        vector,
        chunkIndex: i,
        metadata: {
          chunkNumber: i + 1,
          totalChunks: chunks.length,
          url: url
        }
      });
    }
    
    saveIndex(idx);
    return { 
      chunksAdded: chunks.length, 
      sourceId,
      metadata: idx.metadata[sourceId]
    };
  } catch (error) {
    console.error('Web scraping error:', error);
    throw error;
  }
}

// Enhanced search with filtering and scoring
async function search(query, topK = KB_CONFIG.searchTopK, filters = {}) {
  const idx = loadIndex();
  if (!idx.chunks.length) return [];
  
  try {
    const q = await embed(query);
    let scored = idx.chunks.map((c) => ({ ...c, score: cosineSim(q, c.vector) }));
    
    // Apply filters
    if (filters.sourceId) {
      scored = scored.filter(c => c.sourceId === filters.sourceId);
    }
    if (filters.source) {
      scored = scored.filter(c => c.source.toLowerCase().includes(filters.source.toLowerCase()));
    }
    if (filters.minScore) {
      scored = scored.filter(c => c.score >= filters.minScore);
    }
    if (filters.type) {
      scored = scored.filter(c => {
        const metadata = idx.metadata[c.sourceId];
        return metadata && metadata.type === filters.type;
      });
    }
    if (filters.dateRange) {
      scored = scored.filter(c => {
        const metadata = idx.metadata[c.sourceId];
        if (!metadata || !metadata.added) return false;
        const addedDate = new Date(metadata.added);
        return addedDate >= filters.dateRange.start && addedDate <= filters.dateRange.end;
      });
    }
    
    // Sort by score and apply minimum score threshold
    scored.sort((a, b) => b.score - a.score);
    scored = scored.filter(c => c.score >= KB_CONFIG.minScore);
    
    return scored.slice(0, topK);
  } catch (error) {
    console.error('Search error:', error);
    
    // Fallback: simple keyword search when embeddings fail
    console.warn('Using fallback keyword search due to embedding error');
    return fallbackKeywordSearch(query, idx.chunks, topK, filters);
  }
}

// Advanced search with multiple query types
async function advancedSearch(queries, options = {}) {
  const {
    topK = KB_CONFIG.searchTopK,
    filters = {},
    searchType = 'semantic', // 'semantic', 'keyword', 'hybrid'
    boost = {} // Boost certain sources or types
  } = options;
  
  const idx = loadIndex();
  if (!idx.chunks.length) return [];
  
  try {
    let results = [];
    
    if (searchType === 'semantic' || searchType === 'hybrid') {
      // Semantic search
      for (const query of queries) {
        const semanticResults = await search(query, topK, filters);
        results = results.concat(semanticResults);
      }
    }
    
    if (searchType === 'keyword' || searchType === 'hybrid') {
      // Keyword search
      for (const query of queries) {
        const keywordResults = fallbackKeywordSearch(query, idx.chunks, topK, filters);
        results = results.concat(keywordResults);
      }
    }
    
    // Remove duplicates and apply boosting
    const uniqueResults = [];
    const seen = new Set();
    
    for (const result of results) {
      const key = `${result.sourceId}-${result.chunkIndex}`;
      if (!seen.has(key)) {
        seen.add(key);
        
        // Apply boosting
        let boostedScore = result.score;
        if (boost.sources && boost.sources[result.source]) {
          boostedScore *= boost.sources[result.source];
        }
        if (boost.types) {
          const metadata = idx.metadata[result.sourceId];
          if (metadata && boost.types[metadata.type]) {
            boostedScore *= boost.types[metadata.type];
          }
        }
        
        uniqueResults.push({ ...result, score: boostedScore });
      }
    }
    
    // Sort by boosted score
    uniqueResults.sort((a, b) => b.score - a.score);
    
    return uniqueResults.slice(0, topK);
  } catch (error) {
    console.error('Advanced search error:', error);
    return [];
  }
}

// Search suggestions based on existing content
function getSearchSuggestions(partialQuery, maxSuggestions = 5) {
  const idx = loadIndex();
  if (!idx.chunks.length || !partialQuery || partialQuery.length < 2) return [];
  
  const suggestions = new Set();
  const queryLower = partialQuery.toLowerCase();
  
  // Extract words from chunks that contain the partial query
  for (const chunk of idx.chunks) {
    const chunkLower = chunk.chunk.toLowerCase();
    if (chunkLower.includes(queryLower)) {
      // Extract words around the match
      const words = chunk.chunk.split(/\s+/);
      for (let i = 0; i < words.length; i++) {
        if (words[i].toLowerCase().includes(queryLower)) {
          // Create suggestions with surrounding context
          const start = Math.max(0, i - 1);
          const end = Math.min(words.length, i + 2);
          const suggestion = words.slice(start, end).join(' ');
          if (suggestion.length > partialQuery.length) {
            suggestions.add(suggestion);
          }
        }
      }
    }
  }
  
  return Array.from(suggestions).slice(0, maxSuggestions);
}

// Fallback keyword search when embeddings are unavailable
function fallbackKeywordSearch(query, chunks, topK, filters) {
  const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  if (queryWords.length === 0) return chunks.slice(0, topK);
  
  const scored = chunks.map(chunk => {
    const chunkText = chunk.chunk.toLowerCase();
    let score = 0;
    
    // Count word matches
    for (const word of queryWords) {
      if (chunkText.includes(word)) {
        score += 1;
      }
    }
    
    // Normalize score
    score = score / queryWords.length;
    
    return { ...chunk, score };
  });
  
  // Apply filters
  let filtered = scored;
  if (filters.sourceId) {
    filtered = filtered.filter(c => c.sourceId === filters.sourceId);
  }
  if (filters.source) {
    filtered = filtered.filter(c => c.source.toLowerCase().includes(filters.source.toLowerCase()));
  }
  
  // Sort by score and return top results
  filtered.sort((a, b) => b.score - a.score);
  return filtered.slice(0, topK);
}

// Generate unique source ID
function generateSourceId(filename) {
  const timestamp = Date.now();
  const sanitized = filename.replace(/[^a-zA-Z0-9]/g, '_');
  return `${sanitized}_${timestamp}`;
}

// Delete source and its chunks
function deleteSource(sourceId) {
  const idx = loadIndex();
  
  // Ensure chunks and metadata exist
  const chunks = idx.chunks || [];
  const metadata = idx.metadata || {};
  
  const originalLength = chunks.length;
  
  // Remove chunks
  idx.chunks = chunks.filter(c => c.sourceId !== sourceId);
  
  // Remove metadata
  if (metadata[sourceId]) {
    delete idx.metadata[sourceId];
  }
  
  saveIndex(idx);
  return { 
    deleted: originalLength - idx.chunks.length,
    sourceId 
  };
}

// Get source metadata
function getSourceMetadata(sourceId) {
  const idx = loadIndex();
  const metadata = idx.metadata || {};
  return metadata[sourceId] || null;
}

// Enhanced stats with more details
function stats() {
  const idx = loadIndex();
  
  // Ensure metadata exists and is an object
  const metadata = idx.metadata || {};
  const sources = Object.keys(metadata).length;
  const totalSize = Object.values(metadata).reduce((sum, meta) => sum + (meta?.size || 0), 0);
  
  return { 
    chunks: idx.chunks?.length || 0,
    sources,
    totalSize,
    lastUpdated: idx.lastUpdated || new Date().toISOString()
  };
}

// Advanced analytics and insights
function getAnalytics() {
  const idx = loadIndex();
  const metadata = idx.metadata || {};
  const chunks = idx.chunks || [];
  
  // Type distribution
  const typeDistribution = {};
  Object.values(metadata).forEach(meta => {
    const type = meta.type || 'unknown';
    typeDistribution[type] = (typeDistribution[type] || 0) + 1;
  });
  
  // Size distribution
  const sizeRanges = {
    '0-1KB': 0,
    '1-10KB': 0,
    '10-100KB': 0,
    '100KB-1MB': 0,
    '1MB+': 0
  };
  
  Object.values(metadata).forEach(meta => {
    const size = meta.size || 0;
    if (size < 1024) sizeRanges['0-1KB']++;
    else if (size < 10240) sizeRanges['1-10KB']++;
    else if (size < 102400) sizeRanges['10-100KB']++;
    else if (size < 1048576) sizeRanges['100KB-1MB']++;
    else sizeRanges['1MB+']++;
  });
  
  // Chunk size analysis
  const chunkSizes = chunks.map(c => c.chunk.length);
  const avgChunkSize = chunkSizes.length > 0 ? 
    chunkSizes.reduce((sum, size) => sum + size, 0) / chunkSizes.length : 0;
  
  // Source activity (by date)
  const sourceActivity = {};
  Object.values(metadata).forEach(meta => {
    if (meta.added) {
      const date = new Date(meta.added).toDateString();
      sourceActivity[date] = (sourceActivity[date] || 0) + 1;
    }
  });
  
  // Word frequency analysis
  const wordFreq = {};
  chunks.forEach(chunk => {
    const words = chunk.chunk.toLowerCase().match(/\b\w+\b/g) || [];
    words.forEach(word => {
      if (word.length > 2) { // Skip short words
        wordFreq[word] = (wordFreq[word] || 0) + 1;
      }
    });
  });
  
  // Top words
  const topWords = Object.entries(wordFreq)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 20)
    .map(([word, count]) => ({ word, count }));
  
  return {
    typeDistribution,
    sizeRanges,
    avgChunkSize,
    sourceActivity,
    topWords,
    totalChunks: chunks.length,
    totalSources: Object.keys(metadata).length,
    totalSize: Object.values(metadata).reduce((sum, meta) => sum + (meta?.size || 0), 0)
  };
}

// Search performance analytics
function getSearchAnalytics() {
  // This would track search performance over time
  // For now, return basic structure
  return {
    totalSearches: 0,
    avgSearchTime: 0,
    popularQueries: [],
    searchSuccessRate: 1.0
  };
}

function statsBySource() {
  const idx = loadIndex();
  const map = {};
  
  // Ensure chunks and metadata exist
  const chunks = idx.chunks || [];
  const metadata = idx.metadata || {};
  
  for (const c of chunks) {
    const k = c.source || 'unknown';
    if (!map[k]) {
      map[k] = { 
        source: k, 
        count: 0, 
        sourceId: c.sourceId || '',
        metadata: metadata[c.sourceId] || {}
      };
    }
    map[k].count++;
  }
  
  return Object.values(map).sort((a, b) => b.count - a.count);
}

// Test search functionality
async function testSearch(query, topK = 3) {
  const results = await search(query, topK);
  return results.map(r => ({
    source: r.source,
    chunk: r.chunk.slice(0, 200) + (r.chunk.length > 200 ? '...' : ''),
    score: r.score.toFixed(3),
    metadata: r.metadata
  }));
}

// Rebuild metadata for existing chunks (migration helper)
function rebuildMetadata() {
  const idx = loadIndex();
  const sourceMap = {};
  
  // Group chunks by source
  for (const chunk of idx.chunks) {
    const source = chunk.source || 'unknown';
    if (!sourceMap[source]) {
      sourceMap[source] = {
        chunks: [],
        sourceId: chunk.sourceId || generateSourceId(source)
      };
    }
    sourceMap[source].chunks.push(chunk);
  }
  
  // Rebuild metadata
  for (const [source, info] of Object.entries(sourceMap)) {
    const sourceId = info.sourceId;
    const chunks = info.chunks;
    
    // Calculate total size (approximate)
    const totalSize = chunks.reduce((sum, chunk) => sum + (chunk.chunk?.length || 0), 0);
    
    idx.metadata[sourceId] = {
      name: source,
      type: 'unknown', // We can't determine the original type
      chunks: chunks.length,
      added: new Date().toISOString(), // Use current time as we don't have original
      size: totalSize
    };
  }
  
  saveIndex(idx);
  return { sources: Object.keys(sourceMap).length, chunks: idx.chunks.length };
}

module.exports = { 
  addPdf, 
  addText, 
  addDocx,
  addHtml,
  addWebPage,
  search, 
  advancedSearch,
  getSearchSuggestions,
  stats, 
  statsBySource, 
  getAnalytics,
  getSearchAnalytics,
  deleteSource,
  getSourceMetadata,
  testSearch,
  rebuildMetadata,
  kbDir,
  KB_CONFIG
};


