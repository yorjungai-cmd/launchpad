import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin(
  // Path to the request configuration file (next-intl v4 convention)
  "./src/i18n/request.ts"
);

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Prevent bundling problematic native/binary packages in serverless functions
  serverExternalPackages: ["pdf-parse", "pdfjs-dist", "officeparser", "mammoth"],
};

export default withNextIntl(nextConfig);
