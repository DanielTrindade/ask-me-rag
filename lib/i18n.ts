export type Locale = 'pt' | 'en';

export const dictionaries: Record<Locale, Record<string, string>> = {
  pt: {
    'app.title': 'Pergunte sobre mim',
    'app.subtitle': 'Um chatbot com RAG sobre minha trajetória.',
    'chat.placeholder': 'Pergunte sobre minha experiência…',
    'chat.send': 'Enviar',
    'chat.thinking': 'Pensando…',
    'chat.error': 'Algo deu errado. Tente novamente.',
    'admin.title': 'Upload de documentos',
    'admin.password': 'Senha de admin',
    'admin.upload': 'Enviar arquivo',
    'admin.success': 'Documento indexado com sucesso.',
  },
  en: {
    'app.title': 'Ask me about myself',
    'app.subtitle': 'A RAG chatbot about my background.',
    'chat.placeholder': 'Ask about my experience…',
    'chat.send': 'Send',
    'chat.thinking': 'Thinking…',
    'chat.error': 'Something went wrong. Try again.',
    'admin.title': 'Upload documents',
    'admin.password': 'Admin password',
    'admin.upload': 'Upload file',
    'admin.success': 'Document indexed successfully.',
  },
};

export function t(locale: Locale, key: string): string {
  return dictionaries[locale]?.[key] ?? key;
}
