import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertArticleSchema, searchRequestSchema, type SearchResult } from "@shared/schema";
import { z } from "zod";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Function to clean HTML entities and control characters while preserving decimal separators
function cleanPubMedText(text: string): string {
  return text
    // Remove HTML tags
    .replace(/<[^>]*>/g, '')
    // Decode common HTML entities
    .replace(/&#x2008;/g, ' ')  // thin space
    .replace(/&#xd7;/g, '×')    // multiplication sign
    .replace(/&#x2009;/g, ' ')  // thin space
    .replace(/&#x200a;/g, ' ')  // hair space
    .replace(/&#x2002;/g, ' ')  // en space
    .replace(/&#x2003;/g, ' ')  // em space
    .replace(/&#x2010;/g, '-')  // hyphen
    .replace(/&#x2013;/g, '–')  // en dash
    .replace(/&#x2014;/g, '—')  // em dash
    .replace(/&#x2019;/g, "'")  // right single quotation mark
    .replace(/&#x201c;/g, '"')  // left double quotation mark
    .replace(/&#x201d;/g, '"')  // right double quotation mark
    .replace(/&#xb7;/g, '·')    // middle dot (decimal separator)
    .replace(/&#183;/g, '·')    // middle dot (decimal separator)
    .replace(/&middot;/g, '·')  // middle dot (decimal separator)
    .replace(/&amp;/g, '&')     // ampersand
    .replace(/&lt;/g, '<')      // less than
    .replace(/&gt;/g, '>')      // greater than
    .replace(/&quot;/g, '"')    // quotation mark
    .replace(/&apos;/g, "'")    // apostrophe
    // Remove any remaining HTML entities except middle dots
    .replace(/&#x(?!b7|B7)[0-9a-fA-F]+;/g, ' ')
    .replace(/&#(?!183)[0-9]+;/g, ' ')
    // Clean up extra whitespace
    .replace(/\s+/g, ' ')
    .trim();
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Search PubMed articles
  app.post("/api/search", async (req, res) => {
    try {
      const searchData = searchRequestSchema.parse(req.body);
      
      // Call PubMed E-utilities API
      const searchResults = await searchPubMed(searchData);
      
      res.json(searchResults);
    } catch (error) {
      console.error("Search error:", error);
      res.status(500).json({ 
        message: "Failed to search PubMed", 
        error: error instanceof Error ? error.message : "Unknown error" 
      });
    }
  });

  // Get article details from PubMed
  app.get("/api/article/:pmcid", async (req, res) => {
    try {
      const { pmcid } = req.params;
      
      // Check if we already have this article processed
      const existingArticle = await storage.getArticleByPmcid(pmcid);
      if (existingArticle) {
        return res.json(existingArticle);
      }

      // Fetch from PubMed API
      const articleData = await fetchArticleFromPubMed(pmcid);
      
      res.json(articleData);
    } catch (error) {
      console.error("Article fetch error:", error);
      res.status(500).json({ 
        message: "Failed to fetch article", 
        error: error instanceof Error ? error.message : "Unknown error" 
      });
    }
  });

  // Save processed article
  app.post("/api/articles", async (req, res) => {
    try {
      const articleData = insertArticleSchema.parse(req.body);
      
      // Check if article already exists
      const existingArticle = await storage.getArticleByPmcid(articleData.pmcid);
      if (existingArticle) {
        const updatedArticle = await storage.updateArticle(existingArticle.id, articleData);
        return res.json(updatedArticle);
      }

      const newArticle = await storage.createArticle(articleData);
      res.json(newArticle);
    } catch (error) {
      console.error("Article save error:", error);
      res.status(400).json({ 
        message: "Failed to save article", 
        error: error instanceof Error ? error.message : "Validation error" 
      });
    }
  });

  // Display PubMed abstract data (PMID, DP, TI, LID, AB)
  app.get("/api/abstract/:pmcid", async (req, res) => {
    try {
      const { pmcid } = req.params;
      console.log(`Fetching abstract for: ${pmcid}`);
      
      // Fetch abstract data from PubMed
      const abstractData = await fetchPubMedAbstract(pmcid);
      
      res.json(abstractData);
    } catch (error) {
      console.error("Abstract fetch error:", error);
      res.status(500).json({ 
        message: "Failed to fetch abstract data", 
        error: error instanceof Error ? error.message : "Unknown error" 
      });
    }
  });

  // Extract clinical trial data using AI
  app.post("/api/extract", async (req, res) => {
    try {
      const { abstractText, pmcid, title, doi } = req.body;
      
      // Use OpenAI to extract structured clinical trial data
      const extractedData = await extractClinicalTrialDataFromText({
        pmcid,
        title,
        abstract: abstractText,
        doi
      });
      
      // Save the extracted data to storage
      const savedArticle = await storage.createArticle(extractedData);
      
      res.json(savedArticle);
    } catch (error) {
      console.error("Data extraction error:", error);
      res.status(500).json({ 
        message: "Failed to extract clinical trial data", 
        error: error instanceof Error ? error.message : "Unknown error" 
      });
    }
  });

  // Export article as JSON
  app.get("/api/export/:pmcid", async (req, res) => {
    try {
      const { pmcid } = req.params;
      
      const article = await storage.getArticleByPmcid(pmcid);
      if (!article) {
        return res.status(404).json({ message: "Article not found" });
      }

      // Create filename from DOI or PMCID
      const filename = article.doi 
        ? `${article.doi.replace(/[^a-zA-Z0-9]/g, '_')}.json`
        : `${article.pmcid.replace(/[^a-zA-Z0-9]/g, '_')}.json`;

      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Type', 'application/json');
      res.json(article);
    } catch (error) {
      console.error("Export error:", error);
      res.status(500).json({ 
        message: "Failed to export article", 
        error: error instanceof Error ? error.message : "Unknown error" 
      });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}

async function searchPubMed(searchData: { query: string; dateFilter?: string; articleType?: string; maxResults: number }): Promise<SearchResult[]> {
  try {
    const baseUrl = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";
    
    // Build search query
    let searchQuery = searchData.query;
    if (searchData.dateFilter) {
      const currentYear = new Date().getFullYear();
      switch (searchData.dateFilter) {
        case "1year":
          searchQuery += ` AND ${currentYear}[pdat]`;
          break;
        case "5years":
          searchQuery += ` AND ${currentYear-5}:${currentYear}[pdat]`;
          break;
        case "10years":
          searchQuery += ` AND ${currentYear-10}:${currentYear}[pdat]`;
          break;
      }
    }

    if (searchData.articleType) {
      searchQuery += ` AND ${searchData.articleType}[pt]`;
    }

    // Search for PMIDs
    const searchUrl = `${baseUrl}/esearch.fcgi?db=pubmed&term=${encodeURIComponent(searchQuery)}&retmax=${searchData.maxResults}&retmode=json`;
    
    const searchResponse = await fetch(searchUrl);
    if (!searchResponse.ok) {
      throw new Error(`PubMed search failed: ${searchResponse.statusText}`);
    }
    
    const searchResult = await searchResponse.json();
    const pmids = searchResult.esearchresult?.idlist || [];

    if (pmids.length === 0) {
      return [];
    }

    // Fetch article details
    const summaryUrl = `${baseUrl}/esummary.fcgi?db=pubmed&id=${pmids.join(',')}&retmode=json`;
    
    const summaryResponse = await fetch(summaryUrl);
    if (!summaryResponse.ok) {
      throw new Error(`PubMed summary fetch failed: ${summaryResponse.statusText}`);
    }
    
    const summaryResult = await summaryResponse.json();
    const articles: SearchResult[] = [];

    for (const pmid of pmids) {
      const articleData = summaryResult.result?.[pmid];
      if (articleData) {
        // Extract PMC ID if available
        const pmcid = articleData.articleids?.find((id: any) => id.idtype === "pmc")?.value || `PMID${pmid}`;
        const doi = articleData.articleids?.find((id: any) => id.idtype === "doi")?.value;
        
        articles.push({
          pmcid,
          doi,
          title: articleData.title || "No title available",
          authors: articleData.authors?.map((author: any) => author.name) || [],
          journal: articleData.fulljournalname,
          year: parseInt(articleData.pubdate?.split(' ')[0]) || new Date().getFullYear(),
          abstract: undefined, // Abstract requires separate fetch
          articleType: articleData.pubtype?.[0] || "Unknown"
        });
      }
    }

    return articles;
  } catch (error) {
    console.error("PubMed API error:", error);
    throw new Error(`Failed to search PubMed: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}

async function fetchArticleFromPubMed(pmcid: string): Promise<any> {
  try {
    const baseUrl = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";
    
    // Extract PMID if PMC format
    let pmid = pmcid;
    if (pmcid.startsWith("PMC")) {
      // Convert PMC to PMID
      const convertUrl = `${baseUrl}/elink.fcgi?dbfrom=pmc&db=pubmed&id=${pmcid.replace("PMC", "")}&retmode=json`;
      const convertResponse = await fetch(convertUrl);
      const convertResult = await convertResponse.json();
      pmid = convertResult.linksets?.[0]?.linksetdbs?.[0]?.links?.[0] || pmcid;
    } else if (pmcid.startsWith("PMID")) {
      pmid = pmcid.replace("PMID", "");
    }

    // Fetch detailed article data
    const fetchUrl = `${baseUrl}/efetch.fcgi?db=pubmed&id=${pmid}&retmode=xml`;
    
    const response = await fetch(fetchUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch article: ${response.statusText}`);
    }
    
    const xmlText = await response.text();
    console.log(`Fetched XML for ${pmcid}, length: ${xmlText.length}`);
    console.log(`XML preview: ${xmlText.substring(0, 500)}`);
    
    // Enhanced XML parsing for better field extraction
    const extractField = (xml: string, field: string): string => {
      const patterns = [
        new RegExp(`<${field}[^>]*>([^<]*)</${field}>`, 'i'),
        new RegExp(`<${field}>([\s\S]*?)</${field}>`, 'i')
      ];
      
      for (const regex of patterns) {
        const match = xml.match(regex);
        if (match && match[1].trim()) {
          return cleanPubMedText(match[1]);
        }
      }
      return "";
    };

    const extractAbstract = (xml: string): string => {
      // Try multiple patterns for abstracts
      const patterns = [
        /<AbstractText[^>]*>([\s\S]*?)<\/AbstractText>/gi,
        /<Abstract[^>]*>([\s\S]*?)<\/Abstract>/gi,
        /<AbstractText>([\s\S]*?)<\/AbstractText>/gi
      ];
      
      let abstract = "";
      for (const pattern of patterns) {
        const matches = xml.match(pattern);
        if (matches) {
          abstract = matches.map(match => 
            cleanPubMedText(match)
          ).join(' ').trim();
          if (abstract.length > 50) break; // Use first substantial abstract found
        }
      }
      
      return abstract || "";
    };

    return {
      pmcid,
      title: extractField(xmlText, "ArticleTitle"),
      abstract: extractAbstract(xmlText),
      year: parseInt(extractField(xmlText, "Year")) || new Date().getFullYear(),
      journal: extractField(xmlText, "Title"),
      authors: [], // Would need more complex parsing for authors
      rawXml: xmlText
    };
  } catch (error) {
    console.error("Article fetch error:", error);
    throw new Error(`Failed to fetch article details: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}

async function fetchPubMedAbstract(pmcid: string): Promise<any> {
  try {
    const baseUrl = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";
    let pmid = pmcid;

    // Convert PMC ID to PMID if needed
    if (pmcid.startsWith("PMC")) {
      const convertUrl = `${baseUrl}/elink.fcgi?dbfrom=pmc&db=pubmed&id=${pmcid.replace("PMC", "")}&retmode=json`;
      const convertResponse = await fetch(convertUrl);
      const convertResult = await convertResponse.json();
      pmid = convertResult.linksets?.[0]?.linksetdbs?.[0]?.links?.[0] || pmcid;
    } else if (pmcid.startsWith("PMID")) {
      pmid = pmcid.replace("PMID", "");
    }

    // Fetch detailed article data with abstract
    const fetchUrl = `${baseUrl}/efetch.fcgi?db=pubmed&id=${pmid}&retmode=xml`;
    
    const response = await fetch(fetchUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch article: ${response.statusText}`);
    }
    
    const xmlText = await response.text();
    
    // Parse XML to extract structured data
    const extractField = (xml: string, field: string): string => {
      const patterns = [
        new RegExp(`<${field}[^>]*>([^<]*)</${field}>`, 'i'),
        new RegExp(`<${field}>([\s\S]*?)</${field}>`, 'i')
      ];
      
      for (const regex of patterns) {
        const match = xml.match(regex);
        if (match && match[1].trim()) {
          return cleanPubMedText(match[1]);
        }
      }
      return "";
    };

    const extractTitle = (xml: string): string => {
      // Multiple patterns for article title extraction
      const patterns = [
        /<ArticleTitle[^>]*>([\s\S]*?)<\/ArticleTitle>/i,
        /<Title[^>]*>([\s\S]*?)<\/Title>/i,
        /<ArticleTitle>([\s\S]*?)<\/ArticleTitle>/i
      ];
      
      for (const pattern of patterns) {
        const match = xml.match(pattern);
        if (match && match[1].trim()) {
          return cleanPubMedText(match[1]);
        }
      }
      return "";
    };

    const extractAbstract = (xml: string): string => {
      const patterns = [
        /<AbstractText[^>]*>([\s\S]*?)<\/AbstractText>/gi,
        /<Abstract[^>]*>([\s\S]*?)<\/Abstract>/gi,
        /<AbstractText>([\s\S]*?)<\/AbstractText>/gi
      ];
      
      let abstract = "";
      for (const pattern of patterns) {
        const matches = xml.match(pattern);
        if (matches) {
          abstract = matches.map(match => 
            cleanPubMedText(match)
          ).join(' ').trim();
          if (abstract.length > 50) break;
        }
      }
      return abstract;
    };

    const extractDOI = (xml: string): string => {
      const doiMatch = xml.match(/<ArticleId IdType="doi">([^<]+)<\/ArticleId>/i);
      return doiMatch ? cleanPubMedText(doiMatch[1]) : "";
    };

    const extractPubDate = (xml: string): string => {
      const yearMatch = xml.match(/<Year>(\d{4})<\/Year>/i);
      const monthMatch = xml.match(/<Month>([^<]+)<\/Month>/i);
      const dayMatch = xml.match(/<Day>([^<]+)<\/Day>/i);
      
      let date = "";
      if (yearMatch) {
        date = yearMatch[1];
        if (monthMatch) {
          date += `/${monthMatch[1]}`;
          if (dayMatch) {
            date += `/${dayMatch[1]}`;
          }
        }
      }
      return date;
    };

    const title = extractTitle(xmlText);
    const abstract = extractAbstract(xmlText);
    const doi = extractDOI(xmlText);
    const pubDate = extractPubDate(xmlText);

    console.log(`Title extracted: "${title}"`);
    console.log(`Abstract length: ${abstract.length}`);
    console.log(`DOI: ${doi}`);
    console.log(`Pub date: ${pubDate}`);

    return {
      pmid: `PMID: ${pmid}`,
      dp: `DP: ${pubDate}`,
      ti: `TI: ${title}`,
      lid: doi ? `LID: ${doi} [doi]` : `LID: ${pmid} [pmid]`,
      ab: `AB: ${abstract}`,
      fullAbstract: abstract,
      title: title,
      doi: doi,
      pmcid: pmcid
    };
  } catch (error) {
    console.error("PubMed abstract fetch error:", error);
    throw new Error(`Failed to fetch PubMed abstract: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}

async function extractClinicalTrialDataFromText(articleData: any): Promise<any> {
  try {
    const { title, abstract, pmcid, doi } = articleData;
    console.log(`Extracting data for ${pmcid}`);
    console.log(`Title: ${title}`);
    console.log(`Abstract: ${abstract ? abstract.substring(0, 200) + '...' : 'No abstract'}`);
    
    // Check if we have enough content to analyze
    if (!title || !abstract || abstract.length < 50) {
      return {
        pmcid: pmcid,
        doi: doi,
        title: title || "Title not available",
        firstAuthor: "Not available - insufficient article content",
        year: new Date().getFullYear(),
        reference: "Not available - insufficient article content",
        reportType: "Cannot determine - no abstract",
        diseaseSite: "Cannot determine - no abstract", 
        histopathology: "Cannot determine - no abstract",
        tnmStage: "Cannot determine - no abstract",
        overallStage: "Cannot determine - no abstract",
        dateRange: "Cannot determine - no abstract",
        trialArms: "Cannot determine - no abstract",
        primaryOutcome: "Cannot determine - no abstract",
        secondaryOutcomes: "Cannot determine - no abstract",
        statistics: "Cannot determine - no abstract",
        additionalNotes: "Article content not available for analysis. This may be due to: 1) Very recent publication, 2) Limited PubMed access, 3) Publication type restrictions. Try a different article or check the original source."
      };
    }

    const extractionPrompt = `
Analyze this medical research article and extract structured clinical trial data in JSON format. Extract the following fields:

{
  "pmcid": "${pmcid}",
  "title": "${title}",
  "firstAuthor": "string",
  "year": number,
  "reference": "string",
  "reportType": "string (e.g., Clinical Trial, Systematic Review, Meta-analysis)",
  "diseaseSite": "string - For multiple cancer sites, list separately (e.g., 'Cervical cancer; Vaginal cancer')",
  "histopathology": "string",
  "tnmStage": "string - Use standard TNM notation (T1-4, N0-3, M0-1) or 'Not specified' if FIGO/other staging systems are used",
  "overallStage": "string - For FIGO staging, specify by cancer type (e.g., 'Cervical: IB2, IIA, IIB, IIIB, IVA; Vaginal: II, III, IV'). Include nodal involvement details.",
  "dateRange": "string",
  "trialArms": "string - Format as 'Arm1 = [description]\nArm2 = [description]' with newlines between arms",
  "patientNumbers": "string - Format as 'Arm1 = [number] patients\nArm2 = [number] patients' or 'Total = [number] patients' if not broken down by arm",
  "medianFollowUp": "string - Duration of follow-up (e.g., '5.2 years', '36 months', 'Not specified')",
  "primaryOutcome": "string",
  "secondaryOutcomes": "string",
  "statistics": "string - For each outcome, format as: 'Outcome: [name]\nArm1 - [result]\nArm2 - [result]\n[statistical comparison with HR, p-value, etc.]'",
  "additionalNotes": "string"
}

Article Title: ${title}
Abstract: ${abstract}

IMPORTANT FORMATTING RULES:
- For Trial Arms: When multiple treatment arms exist, format as "Arm1 = [description]\nArm2 = [description]" with each arm on a new line
- For Statistics: Format as follows:
  * Start with "Primary Outcome: [outcome description]"
  * Then "Arm1 - [result]\nArm2 - [result]\n[statistical comparison]"
  * For secondary outcomes: "Secondary Outcomes:\n[Outcome name]:\nArm1 - [result]\nArm2 - [result]\n[statistical comparison]"
- Use \n for line breaks to separate arms and outcomes clearly
- Include statistical measures like hazard ratios (HR), p-values, confidence intervals where available

Extract only the information that is explicitly mentioned in the text. Use "Not specified" for fields that cannot be determined from the available content. Respond with valid JSON only.
`;

    // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system", 
          content: "You are a medical research data extraction expert. Extract structured clinical trial data from research articles in valid JSON format."
        },
        {
          role: "user",
          content: extractionPrompt
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.1
    });

    const extractedContent = response.choices[0].message.content;
    if (!extractedContent) {
      throw new Error("No content extracted from OpenAI response");
    }

    const parsedData = JSON.parse(extractedContent);
    
    return {
      pmcid: parsedData.pmcid || pmcid,
      doi: doi,
      title: parsedData.title || title,
      firstAuthor: parsedData.firstAuthor || "Not specified",
      year: parsedData.year || new Date().getFullYear(),
      reference: parsedData.reference || "Not specified",
      reportType: parsedData.reportType || "Not specified",
      diseaseSite: parsedData.diseaseSite || "Not specified",
      histopathology: parsedData.histopathology || "Not specified",
      tnmStage: parsedData.tnmStage || "Not specified",
      overallStage: parsedData.overallStage || "Not specified",
      dateRange: parsedData.dateRange || "Not specified",
      trialArms: parsedData.trialArms || "Not specified",
      patientNumbers: parsedData.patientNumbers || "Not specified",
      medianFollowUp: parsedData.medianFollowUp || "Not specified",
      primaryOutcome: parsedData.primaryOutcome || "Not specified",
      secondaryOutcomes: parsedData.secondaryOutcomes || "Not specified",
      statistics: parsedData.statistics || "Not specified",
      additionalNotes: parsedData.additionalNotes || "Not specified"
    };

  } catch (error) {
    console.error("AI extraction error:", error);
    throw new Error(`Failed to extract clinical trial data: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}

async function extractClinicalTrialData(articleData: any): Promise<any> {
  try {
    const { title, abstract, pmcid } = articleData;
    console.log(`Extracting data for ${pmcid}`);
    console.log(`Title: ${title}`);
    console.log(`Abstract: ${abstract ? abstract.substring(0, 200) + '...' : 'No abstract'}`);
    
    // Check if we have enough content to analyze
    if (!title || title === "Not specified" || !abstract || abstract.length < 50) {
      return {
        pmcid: pmcid,
        doi: articleData.doi,
        title: title || "Title not available",
        firstAuthor: "Not available - insufficient article content",
        year: new Date().getFullYear(),
        reference: "Not available - insufficient article content",
        reportType: "Cannot determine - no abstract",
        diseaseSite: "Cannot determine - no abstract", 
        histopathology: "Cannot determine - no abstract",
        tnmStage: "Cannot determine - no abstract",
        overallStage: "Cannot determine - no abstract",
        dateRange: "Cannot determine - no abstract",
        trialArms: "Cannot determine - no abstract",
        primaryOutcome: "Cannot determine - no abstract",
        secondaryOutcomes: "Cannot determine - no abstract",
        statistics: "Cannot determine - no abstract",
        additionalNotes: "Article content not available for analysis. This may be due to: 1) Very recent publication, 2) Limited PubMed access, 3) Publication type restrictions. Try a different article or check the original source."
      };
    }

    const extractionPrompt = `
Analyze this medical research article and extract structured clinical trial data in JSON format. Extract the following fields:

{
  "pmcid": "${pmcid}",
  "title": "${title}",
  "firstAuthor": "string",
  "year": number,
  "reference": "string",
  "reportType": "string (e.g., Clinical Trial, Systematic Review, Meta-analysis)",
  "diseaseSite": "string",
  "histopathology": "string",
  "tnmStage": "string",
  "overallStage": "string", 
  "dateRange": "string",
  "trialArms": "string",
  "primaryOutcome": "string",
  "secondaryOutcomes": "string",
  "statistics": "string",
  "additionalNotes": "string"
}

Article Title: ${title}
Abstract: ${abstract}

Extract only the information that is explicitly mentioned in the text. Use "Not specified" for fields that cannot be determined from the available content. Respond with valid JSON only.
`;

    // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system", 
          content: "You are a medical research data extraction expert. Extract structured clinical trial data from research articles in valid JSON format."
        },
        {
          role: "user",
          content: extractionPrompt
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.1
    });

    const extractedContent = response.choices[0].message.content;
    if (!extractedContent) {
      throw new Error("No content extracted from OpenAI response");
    }

    const parsedData = JSON.parse(extractedContent);
    
    return {
      pmcid: parsedData.pmcid || pmcid,
      doi: articleData.doi,
      title: parsedData.title || title,
      firstAuthor: parsedData.firstAuthor || "Not specified",
      year: parsedData.year || new Date().getFullYear(),
      reference: parsedData.reference || "Not specified",
      reportType: parsedData.reportType || "Not specified",
      diseaseSite: parsedData.diseaseSite || "Not specified",
      histopathology: parsedData.histopathology || "Not specified",
      tnmStage: parsedData.tnmStage || "Not specified",
      overallStage: parsedData.overallStage || "Not specified",
      dateRange: parsedData.dateRange || "Not specified",
      trialArms: parsedData.trialArms || "Not specified",
      primaryOutcome: parsedData.primaryOutcome || "Not specified",
      secondaryOutcomes: parsedData.secondaryOutcomes || "Not specified",
      statistics: parsedData.statistics || "Not specified",
      additionalNotes: parsedData.additionalNotes || "Not specified"
    };

  } catch (error) {
    console.error("AI extraction error:", error);
    throw new Error(`Failed to extract clinical trial data: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}
