import { extractText as extractPdfText, getDocumentProxy } from 'unpdf';

export function isPdf(filename: string): boolean {
  return filename.toLowerCase().endsWith('.pdf');
}

interface FileLike {
  name: string;
  arrayBuffer(): Promise<ArrayBuffer>;
  text(): Promise<string>;
}

export async function extractText(file: FileLike): Promise<string> {
  if (isPdf(file.name)) {
    const buf = new Uint8Array(await file.arrayBuffer());
    const pdf = await getDocumentProxy(buf);
    const { text } = await extractPdfText(pdf, { mergePages: true });
    return text;
  }
  return file.text();
}
