declare module 'word-extractor' {
  export interface ExtractedWordDocument {
    getBody(): string;
    getHeaders(): string;
    getFooters(): string;
  }

  export default class WordExtractor {
    extract(input: string | Buffer): Promise<ExtractedWordDocument>;
  }
}

declare module 'pdf-parse/lib/pdf-parse.js' {
  export interface PdfParseResult {
    numpages: number;
    text: string;
  }
  export default function pdfParse(dataBuffer: Buffer): Promise<PdfParseResult>;
}
