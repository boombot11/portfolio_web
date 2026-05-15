import './globals.css';

export const metadata = {
  title: 'Sahil Jadhav | Portfolio',
  description:
    'Production-grade AI systems, cloud deployments, and full-stack engineering projects by Sahil Jadhav.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
