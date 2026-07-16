import 'server-only';

import { userAgent, type NextRequest } from 'next/server';

function major(version: string | undefined) {
  return version?.match(/^\d+/)?.[0] ?? 'unknown';
}

function clean(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed && trimmed.length <= 80 ? trimmed : 'unknown';
}

function preferredLanguage(value: string | null) {
  const first = value?.split(',')[0]?.split(';')[0]?.trim();
  return first && /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(first)
    ? first.toLowerCase()
    : 'unknown';
}

export function deriveDeviceInfo(request: NextRequest) {
  const rawUserAgent = request.headers.get('user-agent')?.trim();
  if (!rawUserAgent) {
    return {
      deviceType: 'unknown',
      isBot: false,
      osName: 'unknown',
      osMajor: 'unknown',
      browserName: 'unknown',
      browserMajor: 'unknown',
      preferredLanguage: preferredLanguage(request.headers.get('accept-language')),
    };
  }

  const parsed = userAgent(request);
  const deviceType = parsed.isBot
    ? 'bot'
    : parsed.device.type === 'mobile' || parsed.device.type === 'tablet'
      ? parsed.device.type
      : parsed.device.type
        ? 'other'
        : parsed.browser.name
          ? 'desktop'
          : 'unknown';
  return {
    deviceType,
    isBot: parsed.isBot,
    osName: clean(parsed.os.name),
    osMajor: major(parsed.os.version),
    browserName: clean(parsed.browser.name),
    browserMajor: major(parsed.browser.version),
    preferredLanguage: preferredLanguage(request.headers.get('accept-language')),
  };
}

