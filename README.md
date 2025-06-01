# PubMed Clinical Trial Research Tool - Version 1.0

A specialized two-panel web application for searching PubMed abstracts and extracting comprehensive clinical trial data into structured, editable summaries with JSON and HTML report export.

## Features

- **Advanced PubMed Search**: Search with publication type filtering (12 clinical trial categories)
- **AI-Powered Data Extraction**: Uses OpenAI GPT-4o to extract structured clinical trial data
- **Professional Reports**: Export data as JSON or formatted HTML reports
- **Comprehensive Data Fields**: 
  - Trial arms with patient numbers
  - Disease staging (including FIGO staging)
  - Statistical outcomes
  - Follow-up duration
  - Primary and secondary endpoints

## System Requirements

- Node.js 18+ 
- OpenAI API key

## Installation

1. Extract the application files
2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up environment variables:
   Create a `.env` file with:
   ```
   OPENAI_API_KEY=your_openai_api_key_here
   ```

4. Start the application:
   ```bash
   npm run dev
   ```

5. Open http://localhost:5000 in your web browser

## Usage

1. **Search**: Enter search terms and optionally select publication type filter
2. **Display Abstract**: Click "Display Abstract" to view structured PubMed data
3. **Extract Data**: Click "Extract Data" to use AI extraction of clinical trial information
4. **Export**: Save as JSON or download formatted HTML report

## Technical Stack

- Frontend: React + TypeScript + Tailwind CSS
- Backend: Express.js + TypeScript
- AI: OpenAI GPT-4o
- Build: Vite

## API Requirements

This application requires an OpenAI API key to function. The AI extraction feature uses GPT-4o to parse medical literature and extract structured clinical trial data.

## Version 1.0 Features

- Publication type filtering with 12 clinical trial categories
- Comprehensive HTML entity cleaning while preserving medical notation
- Enhanced FIGO staging interpretation for multi-site diseases
- Patient numbers and median follow-up duration extraction
- Professional HTML report generation with medical document styling