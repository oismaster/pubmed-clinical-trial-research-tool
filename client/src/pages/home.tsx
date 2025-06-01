import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Search, Plus, X, Loader2, FileText, Calendar, Users, Save, Database, Download } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { SearchResult } from "@/lib/types";

const PUBLICATION_TYPES = [
  { value: "all", label: "All Publication Types" },
  { value: "Randomized Controlled Trial", label: "Randomized Controlled Trial" },
  { value: "Systematic Review", label: "Systematic Review" },
  { value: "Review", label: "Review" },
  { value: "Observational Study", label: "Observational Study" },
  { value: "Clinical Trial, Phase I", label: "Clinical Trial, Phase I" },
  { value: "Clinical Trial, Phase II", label: "Clinical Trial, Phase II" },
  { value: "Clinical Trial, Phase III", label: "Clinical Trial, Phase III" },
  { value: "Clinical Trial, Phase IV", label: "Clinical Trial, Phase IV" },
  { value: "Clinical Trial Protocol", label: "Clinical Trial Protocol" },
  { value: "Controlled Clinical Trial", label: "Controlled Clinical Trial" },
  { value: "Equivalence Trial", label: "Equivalence Trial" },
  { value: "Pragmatic Clinical Trial", label: "Pragmatic Clinical Trial" }
];

export default function Home() {
  const [selectedTerms, setSelectedTerms] = useState<string[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [publicationType, setPublicationType] = useState<string>("all");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [extractedData, setExtractedData] = useState<any>(null);
  const [isExtracting, setIsExtracting] = useState<string | null>(null);
  const [abstractData, setAbstractData] = useState<any>(null);
  const [isDisplayingAbstract, setIsDisplayingAbstract] = useState<string | null>(null);
  const { toast } = useToast();

  const handleAddTerm = () => {
    if (inputValue.trim() && !selectedTerms.includes(inputValue.trim())) {
      setSelectedTerms([...selectedTerms, inputValue.trim()]);
      setInputValue("");
    }
  };

  const handleRemoveTerm = (termToRemove: string) => {
    setSelectedTerms(selectedTerms.filter(term => term !== termToRemove));
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleAddTerm();
    }
  };

  const searchMutation = useMutation<SearchResult[], Error>({
    mutationFn: async () => {
      const searchQuery = selectedTerms.join(" AND ");
      const response = await fetch("/api/search", {
        method: "POST",
        body: JSON.stringify({
          query: searchQuery,
          articleType: publicationType === "all" ? "" : publicationType,
          maxResults: 20
        }),
        headers: {
          "Content-Type": "application/json"
        }
      });
      
      if (!response.ok) {
        throw new Error(`Search failed: ${response.statusText}`);
      }
      
      return response.json();
    },
    onSuccess: (data: SearchResult[]) => {
      setSearchResults(data);
      toast({
        title: "Search completed",
        description: `Found ${data.length} articles`
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Search failed",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  const handleSearch = () => {
    if (selectedTerms.length > 0) {
      searchMutation.mutate();
    }
  };

  const handleDisplayAbstract = async (pmcid: string) => {
    setIsDisplayingAbstract(pmcid);
    try {
      const response = await fetch(`/api/abstract/${pmcid}`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch abstract: ${response.statusText}`);
      }
      
      const data = await response.json();
      setAbstractData(data);
      toast({
        title: "Abstract loaded",
        description: "PubMed abstract data retrieved successfully"
      });
    } catch (error) {
      toast({
        title: "Abstract fetch failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive"
      });
    } finally {
      setIsDisplayingAbstract(null);
    }
  };

  const handleExtractData = async () => {
    if (!abstractData) return;
    
    setIsExtracting(abstractData.pmcid);
    try {
      const response = await fetch("/api/extract", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          abstractText: abstractData.fullAbstract,
          pmcid: abstractData.pmcid,
          title: abstractData.title,
          doi: abstractData.doi
        })
      });
      
      if (!response.ok) {
        throw new Error(`Extraction failed: ${response.statusText}`);
      }
      
      const data = await response.json();
      console.log("Extracted data received:", data);
      setExtractedData(data);
      toast({
        title: "Data extraction completed",
        description: "Clinical trial data has been extracted and structured"
      });
    } catch (error) {
      toast({
        title: "Extraction failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive"
      });
    } finally {
      setIsExtracting(null);
    }
  };

  const handleSaveData = () => {
    if (!extractedData) return;
    
    const dataStr = JSON.stringify(extractedData, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    
    // Use DOI for filename if available, otherwise fall back to PMCID
    const filename = extractedData.doi 
      ? `${extractedData.doi.replace(/[^a-zA-Z0-9]/g, '_')}.json`
      : `${extractedData.pmcid || 'extracted'}.json`;
    
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    toast({
      title: "File saved",
      description: `Data saved as ${filename}`
    });
  }

  const handleDownloadReport = () => {
    if (!extractedData) return;

    const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Clinical Trial Data Report - ${extractedData.pmcid}</title>
    <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f9f9f9;
        }
        .container {
            background: white;
            padding: 30px;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        h1 {
            color: #2c5aa0;
            border-bottom: 3px solid #2c5aa0;
            padding-bottom: 10px;
            margin-bottom: 30px;
        }
        .field-group {
            margin-bottom: 20px;
            padding: 15px;
            background-color: #f8f9fa;
            border-left: 4px solid #2c5aa0;
            border-radius: 4px;
        }
        .field-label {
            font-weight: bold;
            color: #2c5aa0;
            margin-bottom: 5px;
            display: block;
        }
        .field-value {
            color: #555;
            white-space: pre-line;
        }
        .header-info {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 20px;
            margin-bottom: 30px;
        }
        .doi {
            font-family: monospace;
            background: #e9ecef;
            padding: 2px 6px;
            border-radius: 3px;
        }
        @media print {
            body { background-color: white; }
            .container { box-shadow: none; }
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>Clinical Trial Data Report</h1>
        
        <div class="header-info">
            <div class="field-group">
                <span class="field-label">PMCID</span>
                <span class="field-value">${extractedData.pmcid}</span>
            </div>
            <div class="field-group">
                <span class="field-label">DOI</span>
                <span class="field-value doi">${extractedData.doi || 'Not specified'}</span>
            </div>
        </div>

        <div class="field-group">
            <span class="field-label">Title</span>
            <span class="field-value">${extractedData.title}</span>
        </div>

        <div class="field-group">
            <span class="field-label">First Author</span>
            <span class="field-value">${extractedData.firstAuthor}</span>
        </div>

        <div class="field-group">
            <span class="field-label">Year</span>
            <span class="field-value">${extractedData.year}</span>
        </div>

        <div class="field-group">
            <span class="field-label">Report Type</span>
            <span class="field-value">${extractedData.reportType}</span>
        </div>

        <div class="field-group">
            <span class="field-label">Disease Site</span>
            <span class="field-value">${extractedData.diseaseSite}</span>
        </div>

        <div class="field-group">
            <span class="field-label">Histopathology</span>
            <span class="field-value">${extractedData.histopathology}</span>
        </div>

        <div class="field-group">
            <span class="field-label">TNM Stage</span>
            <span class="field-value">${extractedData.tnmStage}</span>
        </div>

        <div class="field-group">
            <span class="field-label">Overall Stage</span>
            <span class="field-value">${extractedData.overallStage}</span>
        </div>

        <div class="field-group">
            <span class="field-label">Date Range</span>
            <span class="field-value">${extractedData.dateRange}</span>
        </div>

        <div class="field-group">
            <span class="field-label">Trial Arms</span>
            <span class="field-value">${extractedData.trialArms}</span>
        </div>

        <div class="field-group">
            <span class="field-label">Patient Numbers</span>
            <span class="field-value">${extractedData.patientNumbers}</span>
        </div>

        <div class="field-group">
            <span class="field-label">Median Follow-up Duration</span>
            <span class="field-value">${extractedData.medianFollowUp}</span>
        </div>

        <div class="field-group">
            <span class="field-label">Primary Outcome</span>
            <span class="field-value">${extractedData.primaryOutcome}</span>
        </div>

        <div class="field-group">
            <span class="field-label">Secondary Outcomes</span>
            <span class="field-value">${extractedData.secondaryOutcomes}</span>
        </div>

        <div class="field-group">
            <span class="field-label">Statistics</span>
            <span class="field-value">${extractedData.statistics}</span>
        </div>

        <div class="field-group">
            <span class="field-label">Additional Notes</span>
            <span class="field-value">${extractedData.additionalNotes}</span>
        </div>

        <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #dee2e6; text-align: center; color: #6c757d; font-size: 14px;">
            Generated on ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}
        </div>
    </div>
</body>
</html>`;

    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `clinical-trial-report-${extractedData.pmcid.replace(/[^a-zA-Z0-9]/g, '_')}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast({
      title: "Report downloaded",
      description: "Clinical trial report has been saved as an HTML file"
    });
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          PubMed Research Assistant
        </h1>
        <p className="text-gray-600">
          Search and extract comprehensive clinical trial data from PubMed abstracts
        </p>
      </div>
      
      <div className="flex gap-6 max-w-7xl mx-auto">
        {/* Left Panel - Search and Results */}
        <div className="flex-1 space-y-6">
          {/* Publication Type Filter */}
          <Card className="w-full">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Publication Type
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Select value={publicationType} onValueChange={setPublicationType}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select publication type" />
                </SelectTrigger>
                <SelectContent>
                  {PUBLICATION_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          <Card className="w-full">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Search className="h-5 w-5" />
                Selected Search Terms
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Input area for adding terms */}
              <div className="flex gap-2">
                <Textarea
                  placeholder="Enter search terms (e.g., 'breast cancer', 'immunotherapy', 'clinical trial')..."
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyPress={handleKeyPress}
                  className="flex-1 min-h-[100px] resize-none"
                />
                <Button 
                  onClick={handleAddTerm}
                  disabled={!inputValue.trim()}
                  className="h-fit"
                >
                  <Plus className="h-4 w-4" />
                  Add
                </Button>
              </div>

              {/* Display selected terms */}
              {selectedTerms.length > 0 && (
                <div className="space-y-2">
                  <h3 className="font-medium text-gray-700">Selected Terms:</h3>
                  <div className="flex flex-wrap gap-2">
                    {selectedTerms.map((term, index) => (
                      <div
                        key={index}
                        className="flex items-center gap-1 bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm"
                      >
                        <span>{term}</span>
                        <button
                          onClick={() => handleRemoveTerm(term)}
                          className="hover:bg-blue-200 rounded-full p-1 ml-1"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Search button */}
              {selectedTerms.length > 0 && (
                <div className="pt-4 border-t">
                  <Button 
                    className="w-full" 
                    size="lg"
                    onClick={handleSearch}
                    disabled={searchMutation.isPending}
                  >
                    {searchMutation.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Searching PubMed...
                      </>
                    ) : (
                      <>
                        <Search className="h-4 w-4 mr-2" />
                        Search PubMed with Selected Terms
                      </>
                    )}
                  </Button>
                </div>
              )}

              {/* Empty state */}
              {selectedTerms.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  <Search className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>Add search terms above to begin your PubMed research</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Search Results */}
          {searchResults.length > 0 && (
            <Card className="w-full">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Search Results ({searchResults.length} articles)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {searchResults.map((article, index) => (
                    <div key={article.pmcid} className="border rounded-lg p-4 hover:bg-gray-50 transition-colors">
                      <div className="flex justify-between items-start mb-2">
                        <h3 className="font-semibold text-lg leading-tight">
                          {article.title}
                        </h3>
                        <Badge variant="secondary" className="ml-2 shrink-0">
                          {article.articleType}
                        </Badge>
                      </div>
                      
                      <div className="flex items-center gap-4 text-sm text-gray-600 mb-2">
                        <div className="flex items-center gap-1">
                          <Users className="h-4 w-4" />
                          <span>{article.authors?.slice(0, 3).join(", ")}{article.authors?.length > 3 ? " et al." : ""}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Calendar className="h-4 w-4" />
                          <span>{article.year}</span>
                        </div>
                      </div>
                      
                      {article.journal && (
                        <p className="text-sm text-gray-500 mb-3">
                          <strong>Journal:</strong> {article.journal}
                        </p>
                      )}
                      
                      <div className="flex items-center justify-between">
                        <div className="text-xs text-gray-400">
                          {article.doi ? `DOI: ${article.doi}` : article.pmcid}
                        </div>
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => handleDisplayAbstract(article.pmcid)}
                          disabled={isDisplayingAbstract === article.pmcid}
                        >
                          {isDisplayingAbstract === article.pmcid ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                              Loading...
                            </>
                          ) : (
                            "Display Abstract"
                          )}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right Panel - Abstract and Extracted Data */}
        <div className="w-1/2 space-y-6">
          {/* Abstract Display */}
          {abstractData && (
            <Card className="w-full sticky top-4">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    PubMed Abstract
                  </CardTitle>
                  <Button 
                    onClick={handleExtractData} 
                    disabled={isExtracting !== null}
                    className="flex items-center gap-2"
                  >
                    {isExtracting ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Extracting...
                      </>
                    ) : (
                      "Extract Data"
                    )}
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 max-h-[40vh] overflow-y-auto">
                  <div>
                    <p className="text-sm font-mono bg-gray-50 p-3 rounded border whitespace-pre-wrap">
                      {abstractData.pmid}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm font-mono bg-gray-50 p-3 rounded border whitespace-pre-wrap">
                      {abstractData.dp}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm font-mono bg-gray-50 p-3 rounded border whitespace-pre-wrap">
                      {abstractData.ti}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm font-mono bg-gray-50 p-3 rounded border whitespace-pre-wrap">
                      {abstractData.lid}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm font-mono bg-gray-50 p-3 rounded border whitespace-pre-wrap">
                      {abstractData.ab}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Extracted Data */}
          {extractedData && (
            <Card className="w-full">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <Database className="h-5 w-5" />
                    Extracted Clinical Trial Data
                  </CardTitle>
                  <div className="flex gap-2">
                    <Button onClick={handleSaveData} className="flex items-center gap-2">
                      <Save className="h-4 w-4" />
                      Save
                    </Button>
                    <Button onClick={handleDownloadReport} variant="outline" className="flex items-center gap-2">
                      <Download className="h-4 w-4" />
                      Download Report
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 max-h-[60vh] overflow-y-auto">
                  <div>
                    <label className="text-sm font-medium text-gray-700">Title</label>
                    <p className="text-sm bg-gray-50 p-2 rounded border">{extractedData.title}</p>
                  </div>
                  
                  <div>
                    <label className="text-sm font-medium text-gray-700">First Author</label>
                    <p className="text-sm bg-gray-50 p-2 rounded border">{extractedData.firstAuthor}</p>
                  </div>
                  
                  <div>
                    <label className="text-sm font-medium text-gray-700">Year</label>
                    <p className="text-sm bg-gray-50 p-2 rounded border">{extractedData.year}</p>
                  </div>
                  
                  <div>
                    <label className="text-sm font-medium text-gray-700">Report Type</label>
                    <p className="text-sm bg-gray-50 p-2 rounded border">{extractedData.reportType}</p>
                  </div>
                  
                  <div>
                    <label className="text-sm font-medium text-gray-700">Disease Site</label>
                    <p className="text-sm bg-gray-50 p-2 rounded border">{extractedData.diseaseSite}</p>
                  </div>
                  
                  <div>
                    <label className="text-sm font-medium text-gray-700">Histopathology</label>
                    <p className="text-sm bg-gray-50 p-2 rounded border">{extractedData.histopathology}</p>
                  </div>
                  
                  <div>
                    <label className="text-sm font-medium text-gray-700">TNM Stage</label>
                    <p className="text-sm bg-gray-50 p-2 rounded border">{extractedData.tnmStage}</p>
                  </div>
                  
                  <div>
                    <label className="text-sm font-medium text-gray-700">Overall Stage</label>
                    <p className="text-sm bg-gray-50 p-2 rounded border">{extractedData.overallStage}</p>
                  </div>
                  
                  <div>
                    <label className="text-sm font-medium text-gray-700">Date Range</label>
                    <p className="text-sm bg-gray-50 p-2 rounded border">{extractedData.dateRange}</p>
                  </div>
                  
                  <div>
                    <label className="text-sm font-medium text-gray-700">Trial Arms</label>
                    <p className="text-sm bg-gray-50 p-2 rounded border whitespace-pre-line">{extractedData.trialArms}</p>
                  </div>
                  
                  <div>
                    <label className="text-sm font-medium text-gray-700">Patient Numbers</label>
                    <p className="text-sm bg-gray-50 p-2 rounded border whitespace-pre-line">{extractedData.patientNumbers}</p>
                  </div>
                  
                  <div>
                    <label className="text-sm font-medium text-gray-700">Median Follow-up Duration</label>
                    <p className="text-sm bg-gray-50 p-2 rounded border">{extractedData.medianFollowUp}</p>
                  </div>
                  
                  <div>
                    <label className="text-sm font-medium text-gray-700">Primary Outcome</label>
                    <p className="text-sm bg-gray-50 p-2 rounded border">{extractedData.primaryOutcome}</p>
                  </div>
                  
                  <div>
                    <label className="text-sm font-medium text-gray-700">Secondary Outcomes</label>
                    <p className="text-sm bg-gray-50 p-2 rounded border">{extractedData.secondaryOutcomes}</p>
                  </div>
                  
                  <div>
                    <label className="text-sm font-medium text-gray-700">Statistics</label>
                    <p className="text-sm bg-gray-50 p-2 rounded border whitespace-pre-line">{extractedData.statistics}</p>
                  </div>
                  
                  <div>
                    <label className="text-sm font-medium text-gray-700">Additional Notes</label>
                    <p className="text-sm bg-gray-50 p-2 rounded border">{extractedData.additionalNotes}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Empty state */}
          {!abstractData && !extractedData && (
            <Card className="w-full sticky top-4">
              <CardContent className="pt-6">
                <div className="text-center py-8 text-gray-500">
                  <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>Click "Display Abstract" on any article to view PubMed data here</p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}