import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '灭火救援预案智能辅助平台',
  description: '灭火救援预案智能辅助平台',
  icons: [{ rel: 'icon', type: 'image/svg+xml', url: '/logo-flame.svg' }],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    // suppressHydrationWarning:浏览器扩展(如沉浸式翻译)会在 hydration 前给 <html> 注入
    // data-immersive-translate-* 等属性,导致 SSR/客户端 HTML 不匹配报错;官方推荐此属性忽略差异
    <html lang="zh-CN" suppressHydrationWarning>
      <body>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;500;700&family=Rajdhani:wght@500;600;700&family=JetBrains+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
        {children}
      </body>
    </html>
  );
}
