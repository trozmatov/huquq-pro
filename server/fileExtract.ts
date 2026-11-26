import mammoth from 'mammoth';
import WordExtractor from 'word-extractor';
import path from 'node:path';

export interface UploadedFileLike {
  originalname: string;
  mimetype: string;
  buffer: Buffer;
}

/**
 * Extracts readable UTF-8 text from PDF, DOCX, DOC, and TXT files.
 */
export async function extractTextFromFile(file: UploadedFileLike): Promise<string> {
  const ext = path.extname(file.originalname || '').toLowerCase();

  if (ext === '.txt' || file.mimetype === 'text/plain') {
    return file.buffer.toString('utf8').trim();
  }

  if (
    ext === '.docx' ||
    file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    const result = await mammoth.extractRawText({ buffer: file.buffer });
    return (result.value || '').trim();
  }

  if (ext === '.doc' || file.mimetype === 'application/msword') {
    const extractor = new WordExtractor();
    const doc = await extractor.extract(file.buffer);
    return (doc.getBody() || '').trim();
  }

  if (ext === '.pdf' || file.mimetype === 'application/pdf') {
    // pdf-parse/lib/pdf-parse.js avoids pdf-parse's index.js test-file quirk
    const mod = (await import('pdf-parse/lib/pdf-parse.js')) as unknown as {
      default?: (buf: Buffer) => Promise<{ text: string }>;
    };
    const parsePdf =
      typeof mod.default === 'function'
        ? mod.default
        : (mod as unknown as (buf: Buffer) => Promise<{ text: string }>);
    const parsed = await parsePdf(file.buffer);
    return (parsed.text || '').trim();
  }

  throw new Error(
    "Qo'llab-quvvatlanmaydigan fayl formati. Faqat PDF, DOCX, DOC yoki TXT fayllar yuklang."
  );
}
