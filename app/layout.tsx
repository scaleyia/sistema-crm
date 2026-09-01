import type { Metadata } from 'next';
import { Great_Vibes, Poppins } from 'next/font/google';
import './globals.css';
import { ProvedorSessao } from '@/lib/dados/sessao';
import { ProvedorAviso } from '@/components/painel/base';

const poppins = Poppins({
  variable: '--font-poppins',
  weight: ['300', '400', '500', '600', '700'],
  subsets: ['latin'],
});

const greatVibes = Great_Vibes({
  variable: '--font-script',
  weight: '400',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Impéria Esthétique — Inteligência para sua operação',
  description:
    'Atendimento, agendamentos, CRM e reativação de clientes em um só lugar. Sua essência, nossa excelência.',
  icons: { icon: '/favicon.svg' },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" data-tema="claro">
      <body
        className={`${poppins.variable} ${greatVibes.variable} antialiased`}
      >
        <ProvedorSessao>
          <ProvedorAviso>{children}</ProvedorAviso>
        </ProvedorSessao>
      </body>
    </html>
  );
}
