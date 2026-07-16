import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { deriveDeviceInfo } from './device';

describe('deriveDeviceInfo', () => {
  it('keeps only coarse browser, OS, device and language fields', () => {
    const request = new NextRequest('https://example.test/api/chat', {
      headers: {
        'user-agent':
          'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
        'accept-language': 'pt-BR,pt;q=0.9,en;q=0.8',
      },
    });
    const info = deriveDeviceInfo(request);
    expect(info).toEqual(
      expect.objectContaining({
        deviceType: 'mobile',
        isBot: false,
        osName: 'Android',
        osMajor: '13',
        browserName: 'Chrome',
        browserMajor: '126',
        preferredLanguage: 'pt-br',
      }),
    );
    expect(info).not.toHaveProperty('model');
    expect(info).not.toHaveProperty('userAgent');
  });

  it('uses unknown for unrecognized values', () => {
    const request = new NextRequest('https://example.test/api/chat', {
      headers: { 'user-agent': '', 'accept-language': 'invalid value!' },
    });
    expect(deriveDeviceInfo(request)).toEqual({
      deviceType: 'unknown',
      isBot: false,
      osName: 'unknown',
      osMajor: 'unknown',
      browserName: 'unknown',
      browserMajor: 'unknown',
      preferredLanguage: 'unknown',
    });
  });
});

