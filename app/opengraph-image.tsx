import { ImageResponse } from 'next/og';

export const alt = 'Daniel Trindade — portfólio interativo';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '72px',
          background: '#181818',
          color: '#f7f7f5',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <div
            style={{
              display: 'flex',
              width: 54,
              height: 54,
              alignItems: 'center',
              justifyContent: 'center',
              border: '1px solid #626262',
              borderRadius: 14,
              background: '#252525',
              fontSize: 18,
              fontWeight: 700,
            }}
          >
            DT
          </div>
          <div style={{ color: '#b8b8b3', fontSize: 22, letterSpacing: 2 }}>
            PORTFÓLIO INTERATIVO
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div style={{ maxWidth: 930, fontSize: 76, fontWeight: 700, lineHeight: 1.05 }}>
            Pergunte sobre minha trajetória, projetos e decisões técnicas.
          </div>
          <div style={{ color: '#b8b8b3', fontSize: 30 }}>
            Daniel Trindade · Desenvolvimento de software
          </div>
        </div>

        <div style={{ display: 'flex', width: '100%', height: 8, borderRadius: 999 }}>
          <div style={{ width: '72%', background: '#f7f7f5', borderRadius: 999 }} />
          <div style={{ flex: 1, background: '#4a4a4a', borderRadius: 999 }} />
        </div>
      </div>
    ),
    size,
  );
}
